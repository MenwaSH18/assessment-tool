/**
 * Text chunking utilities for RAG pipeline.
 * Splits documents into overlapping chunks for embedding.
 */

/**
 * Estimate token count (rough: ~4 chars per token for English).
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into overlapping chunks.
 * @param {string} text - The full document text
 * @param {number} chunkSize - Target tokens per chunk (default 500)
 * @param {number} overlap - Overlap tokens between chunks (default 50)
 * @returns {Array<{text: string, index: number, tokenCount: number}>}
 */
export function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!text || text.trim().length === 0) return [];

  const charChunkSize = chunkSize * 4;
  const charOverlap = overlap * 4;
  const chunks = [];

  // First, split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    // If adding this paragraph exceeds chunk size, save current chunk
    if (currentChunk.length + para.length > charChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        tokenCount: estimateTokens(currentChunk),
      });
      chunkIndex++;

      // Start new chunk with overlap from previous
      const overlapText = currentChunk.slice(-charOverlap);
      currentChunk = overlapText + '\n\n' + para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      tokenCount: estimateTokens(currentChunk),
    });
  }

  // If no paragraphs detected (single block), force-split by character count
  if (chunks.length === 0 && text.trim().length > 0) {
    let start = 0;
    let idx = 0;
    while (start < text.length) {
      const end = Math.min(start + charChunkSize, text.length);
      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push({
          text: chunk,
          index: idx,
          tokenCount: estimateTokens(chunk),
        });
        idx++;
      }
      start = end - charOverlap;
      if (start >= text.length) break;
    }
  }

  return chunks;
}
