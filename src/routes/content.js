import { Hono } from 'hono';
import { ContentAgent } from '../agents/content-agent.js';

const app = new Hono();

// POST /api/content/upload - Upload a file (PDF/DOCX)
app.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const title = formData.get('title') || file?.name || 'Untitled';
    const assessmentId = formData.get('assessment_id') || null;

    if (!file) return c.json({ error: 'No file provided' }, 400);

    // Determine file type
    const fileName = file.name.toLowerCase();
    let type = 'text';
    if (fileName.endsWith('.pdf')) type = 'pdf';
    else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) type = 'docx';
    else if (fileName.endsWith('.txt')) type = 'text';
    else return c.json({ error: 'Unsupported file type. Supported: PDF, DOCX, TXT' }, 400);

    // Upload to R2
    const r2Key = `resources/${Date.now()}_${file.name}`;
    if (c.env.R2) {
      await c.env.R2.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
    }

    // Create resource record
    const result = await c.env.DB.prepare(
      'INSERT INTO resources (title, type, r2_key, assessment_id, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(title, type, r2Key, assessmentId, 'pending').run();
    const resourceId = result.meta.last_row_id;

    // Process asynchronously if Queue is available, otherwise process inline
    if (c.env.QUEUE) {
      await c.env.QUEUE.send({
        type: 'parse_resource',
        resourceId,
      });
    } else {
      // Process inline (may be slow for large files)
      const agent = new ContentAgent(c.env);
      // Don't await - let it process in the background context
      c.executionCtx.waitUntil(agent.processResource(resourceId));
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM resources WHERE id = ?'
    ).bind(resourceId).all();

    return c.json(results[0], 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/content/url - Submit a URL for processing
app.post('/url', async (c) => {
  try {
    const { url, title, assessment_id } = await c.req.json();
    if (!url) return c.json({ error: 'URL is required' }, 400);

    const result = await c.env.DB.prepare(
      'INSERT INTO resources (title, type, source_url, assessment_id, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(title || url, 'url', url, assessment_id || null, 'pending').run();
    const resourceId = result.meta.last_row_id;

    if (c.env.QUEUE) {
      await c.env.QUEUE.send({ type: 'parse_resource', resourceId });
    } else {
      const agent = new ContentAgent(c.env);
      c.executionCtx.waitUntil(agent.processResource(resourceId));
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM resources WHERE id = ?'
    ).bind(resourceId).all();

    return c.json(results[0], 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/content/text - Submit raw text
app.post('/text', async (c) => {
  try {
    const { text, title, assessment_id } = await c.req.json();
    if (!text) return c.json({ error: 'Text is required' }, 400);

    const result = await c.env.DB.prepare(
      'INSERT INTO resources (title, type, raw_text, assessment_id, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(title || 'Text Content', 'text', text, assessment_id || null, 'pending').run();
    const resourceId = result.meta.last_row_id;

    const agent = new ContentAgent(c.env);
    c.executionCtx.waitUntil(agent.processResource(resourceId));

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM resources WHERE id = ?'
    ).bind(resourceId).all();

    return c.json(results[0], 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/content/resources - List all resources
app.get('/resources', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT r.*, COUNT(cc.id) as chunk_count
       FROM resources r LEFT JOIN content_chunks cc ON r.id = cc.resource_id
       GROUP BY r.id ORDER BY r.created_at DESC`
    ).all();
    return c.json(results);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/content/resources/:id - Get resource detail with chunks
app.get('/resources/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: resources } = await c.env.DB.prepare(
      'SELECT * FROM resources WHERE id = ?'
    ).bind(id).all();
    if (resources.length === 0) return c.json({ error: 'Resource not found' }, 404);

    const { results: chunks } = await c.env.DB.prepare(
      'SELECT id, chunk_index, token_count, vectorize_id FROM content_chunks WHERE resource_id = ? ORDER BY chunk_index'
    ).bind(id).all();

    return c.json({ ...resources[0], chunks });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/content/resources/:id - Delete resource
app.delete('/resources/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const agent = new ContentAgent(c.env);
    await agent.deleteResource(parseInt(id));
    return c.json({ message: 'Resource deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/content/resources/:id/reprocess - Reprocess a resource
app.post('/resources/:id/reprocess', async (c) => {
  try {
    const id = c.req.param('id');

    // Delete existing chunks
    await c.env.DB.prepare('DELETE FROM content_chunks WHERE resource_id = ?').bind(id).run();

    // Reprocess
    const agent = new ContentAgent(c.env);
    c.executionCtx.waitUntil(agent.processResource(parseInt(id)));

    return c.json({ message: 'Reprocessing started' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/content/search - RAG semantic search
app.post('/search', async (c) => {
  try {
    const { query, top_k, resource_ids } = await c.req.json();
    if (!query) return c.json({ error: 'Query is required' }, 400);

    const agent = new ContentAgent(c.env);
    const results = await agent.search(query, top_k || 5, resource_ids || null);

    return c.json({ results });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
