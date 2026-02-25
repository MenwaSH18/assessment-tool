import { BaseAgent } from './base-agent.js';
import { chunkText } from '../lib/chunker.js';
import { generateEmbeddings, generateQueryEmbedding } from '../lib/embeddings.js';
import { upsertVectors, queryVectors, deleteVectors } from '../lib/vectorize.js';
import { parseDocument, parseURL } from '../lib/document-parser.js';

/**
 * Content Agent - handles resource upload, parsing, chunking, embedding, and RAG search.
 */
export class ContentAgent extends BaseAgent {
  constructor(env) {
    super(env);
    this.r2 = env.R2;
    this.vectorize = env.VECTORIZE;
    this.ai = env.AI;
  }

  /**
   * Process a resource: parse → chunk → embed → store.
   */
  async processResource(resourceId) {
    // Update status to processing
    await this.db.prepare(
      'UPDATE resources SET status = ? WHERE id = ?'
    ).bind('processing', resourceId).run();

    try {
      const { results } = await this.db.prepare(
        'SELECT * FROM resources WHERE id = ?'
      ).bind(resourceId).all();
      if (results.length === 0) throw new Error('Resource not found');
      const resource = results[0];

      let rawText = '';

      // Step 1: Parse document to text
      if (resource.type === 'url') {
        rawText = await parseURL(resource.source_url);
      } else if (resource.r2_key && this.r2) {
        const r2Object = await this.r2.get(resource.r2_key);
        if (!r2Object) throw new Error('File not found in storage');
        rawText = await parseDocument(this.ai, r2Object, resource.type);
      } else if (resource.type === 'text') {
        rawText = resource.raw_text || '';
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('No text could be extracted from the resource');
      }

      // Save raw text
      await this.db.prepare(
        'UPDATE resources SET raw_text = ? WHERE id = ?'
      ).bind(rawText, resourceId).run();

      // Step 2: Chunk the text
      const chunks = chunkText(rawText, 500, 50);

      // Step 3: Generate embeddings
      const chunkTexts = chunks.map(c => c.text);
      let embeddings = [];
      if (this.ai && chunkTexts.length > 0) {
        // Process in batches of 20 (Workers AI limit)
        for (let i = 0; i < chunkTexts.length; i += 20) {
          const batch = chunkTexts.slice(i, i + 20);
          const batchEmbeddings = await generateEmbeddings(this.ai, batch);
          embeddings.push(...batchEmbeddings);
        }
      }

      // Step 4: Store chunks in D1 and vectors in Vectorize
      const vectors = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vectorId = `resource_${resourceId}_chunk_${i}`;

        // Store chunk in D1
        await this.db.prepare(
          'INSERT INTO content_chunks (resource_id, chunk_index, chunk_text, token_count, vectorize_id) VALUES (?, ?, ?, ?, ?)'
        ).bind(resourceId, chunk.index, chunk.text, chunk.tokenCount, vectorId).run();

        // Prepare vector for Vectorize
        if (embeddings[i]) {
          vectors.push({
            id: vectorId,
            values: embeddings[i],
            metadata: {
              resource_id: resourceId,
              chunk_index: i,
            },
          });
        }
      }

      // Upsert vectors to Vectorize
      if (this.vectorize && vectors.length > 0) {
        await upsertVectors(this.vectorize, vectors);
      }

      // Mark as ready
      await this.db.prepare(
        'UPDATE resources SET status = ? WHERE id = ?'
      ).bind('ready', resourceId).run();

      return { success: true, chunks: chunks.length };
    } catch (err) {
      console.error('Resource processing error:', err.message);
      await this.db.prepare(
        'UPDATE resources SET status = ?, error_message = ? WHERE id = ?'
      ).bind('error', err.message, resourceId).run();
      return { success: false, error: err.message };
    }
  }

  /**
   * Semantic search across all resources.
   */
  async search(query, topK = 5, resourceIds = null) {
    if (!this.ai || !this.vectorize) {
      // Fallback: simple text search in D1
      return this.textSearch(query, topK, resourceIds);
    }

    // Generate query embedding
    const queryVector = await generateQueryEmbedding(this.ai, query);

    // Query Vectorize
    const filter = resourceIds ? { resource_id: { $in: resourceIds } } : null;
    const matches = await queryVectors(this.vectorize, queryVector, topK, filter);

    // Fetch chunk texts from D1
    const results = [];
    for (const match of matches) {
      const { results: chunks } = await this.db.prepare(
        'SELECT cc.*, r.title as resource_title FROM content_chunks cc JOIN resources r ON cc.resource_id = r.id WHERE cc.vectorize_id = ?'
      ).bind(match.id).all();

      if (chunks.length > 0) {
        results.push({
          ...chunks[0],
          score: match.score,
        });
      }
    }

    return results;
  }

  /**
   * Fallback text search using LIKE queries.
   */
  async textSearch(query, topK = 5, resourceIds = null) {
    const words = query.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];

    const likeClause = words.map(() => 'cc.chunk_text LIKE ?').join(' OR ');
    const params = words.map(w => `%${w}%`);

    let sql = `SELECT cc.*, r.title as resource_title
      FROM content_chunks cc JOIN resources r ON cc.resource_id = r.id
      WHERE (${likeClause})`;

    if (resourceIds && resourceIds.length > 0) {
      sql += ` AND cc.resource_id IN (${resourceIds.map(() => '?').join(',')})`;
      params.push(...resourceIds);
    }

    sql += ` LIMIT ?`;
    params.push(topK);

    const stmt = this.db.prepare(sql);
    const { results } = await stmt.bind(...params).all();
    return results.map(r => ({ ...r, score: 0.5 }));
  }

  /**
   * Delete a resource and all associated data.
   */
  async deleteResource(resourceId) {
    // Get vector IDs to delete from Vectorize
    const { results: chunks } = await this.db.prepare(
      'SELECT vectorize_id FROM content_chunks WHERE resource_id = ? AND vectorize_id IS NOT NULL'
    ).bind(resourceId).all();

    const vectorIds = chunks.map(c => c.vectorize_id).filter(Boolean);
    if (this.vectorize && vectorIds.length > 0) {
      await deleteVectors(this.vectorize, vectorIds);
    }

    // Get R2 key to delete file
    const { results: resources } = await this.db.prepare(
      'SELECT r2_key FROM resources WHERE id = ?'
    ).bind(resourceId).all();

    if (resources.length > 0 && resources[0].r2_key && this.r2) {
      await this.r2.delete(resources[0].r2_key);
    }

    // Delete from D1 (chunks cascade-delete from resources)
    await this.db.prepare('DELETE FROM resources WHERE id = ?').bind(resourceId).run();
  }
}
