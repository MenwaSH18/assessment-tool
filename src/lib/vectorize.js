/**
 * Cloudflare Vectorize helpers for vector storage and similarity search.
 */

/**
 * Upsert vectors into the Vectorize index.
 * @param {object} vectorize - The env.VECTORIZE binding
 * @param {Array<{id: string, values: number[], metadata?: object}>} vectors
 */
export async function upsertVectors(vectorize, vectors) {
  if (!vectors || vectors.length === 0) return;

  // Vectorize accepts batches of up to 1000
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await vectorize.upsert(batch);
  }
}

/**
 * Query the Vectorize index for similar vectors.
 * @param {object} vectorize - The env.VECTORIZE binding
 * @param {number[]} queryVector - The query embedding vector
 * @param {number} topK - Number of results to return (default 5)
 * @param {object} filter - Optional metadata filter
 * @returns {Promise<Array<{id: string, score: number, metadata?: object}>>}
 */
export async function queryVectors(vectorize, queryVector, topK = 5, filter = null) {
  const options = {
    topK,
    returnMetadata: 'all',
  };

  if (filter) {
    options.filter = filter;
  }

  const results = await vectorize.query(queryVector, options);
  return results.matches || [];
}

/**
 * Delete vectors by IDs.
 * @param {object} vectorize - The env.VECTORIZE binding
 * @param {string[]} ids - Vector IDs to delete
 */
export async function deleteVectors(vectorize, ids) {
  if (!ids || ids.length === 0) return;
  await vectorize.deleteByIds(ids);
}
