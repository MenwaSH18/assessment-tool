/**
 * Workers AI embedding generation helper.
 * Uses @cf/baai/bge-base-en-v1.5 (768 dimensions).
 */

/**
 * Generate embeddings for one or more texts.
 * @param {object} ai - The env.AI binding
 * @param {string|string[]} texts - Text(s) to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
export async function generateEmbeddings(ai, texts) {
  const input = Array.isArray(texts) ? texts : [texts];

  const result = await ai.run('@cf/baai/bge-base-en-v1.5', {
    text: input,
  });

  return result.data;
}

/**
 * Generate a single embedding for a query.
 * @param {object} ai - The env.AI binding
 * @param {string} query - The search query
 * @returns {Promise<number[]>} Single embedding vector
 */
export async function generateQueryEmbedding(ai, query) {
  const embeddings = await generateEmbeddings(ai, [query]);
  return embeddings[0];
}
