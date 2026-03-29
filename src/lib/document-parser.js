/**
 * Document parsing utilities using Workers AI.
 * Supports PDF, DOCX, and URL extraction.
 */

/**
 * Parse a document from R2 storage to markdown text.
 * Uses Workers AI toMarkdown() for PDF/DOCX.
 * @param {object} ai - The env.AI binding
 * @param {object} r2Object - The R2 object (from R2 bucket get)
 * @param {string} type - File type: 'pdf', 'docx'
 * @returns {Promise<string>} Extracted text
 */
export async function parseDocument(ai, r2Object, type) {
  if (!r2Object) throw new Error('R2 object not found');
  if (!ai || typeof ai.toMarkdown !== 'function') {
    throw new Error('Workers AI binding is required for parsing PDF/DOCX files');
  }

  const arrayBuffer = await r2Object.arrayBuffer();
  const mimeTypes = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
  };
  const mimeType = mimeTypes[type] || 'application/octet-stream';
  const blob = new Blob([arrayBuffer], { type: mimeType });

  try {
    const result = await ai.toMarkdown([blob]);
    if (result && result.length > 0) {
      return result[0].data || '';
    }
    return '';
  } catch (err) {
    console.error('Document parsing error:', err.message);
    throw new Error('Failed to parse document: ' + err.message);
  }
}

/**
 * Fetch and extract text from a URL.
 * @param {string} url - The URL to fetch
 * @returns {Promise<string>} Extracted text content
 */
export async function parseURL(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AssessmentTool/1.0 Educational Content Parser',
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const html = await response.text();
      return extractTextFromHTML(html);
    } else if (contentType.includes('text/plain')) {
      return await response.text();
    } else {
      return await response.text();
    }
  } catch (err) {
    throw new Error('Failed to fetch URL: ' + err.message);
  }
}

/**
 * Basic HTML text extraction (strips tags, scripts, styles).
 */
function extractTextFromHTML(html) {
  // Remove script and style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}
