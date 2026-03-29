const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { resources, chunks } = require('../database/db');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx', '.doc', '.txt'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Supported: PDF, DOCX, TXT'));
    }
  },
});

// Helper: split text into chunks
function chunkText(text, maxTokens = 500) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const result = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).split(/\s+/).length > maxTokens && current) {
      result.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

// Helper: extract text from file
function extractText(filePath, type) {
  if (type === 'text' || type === 'txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }
  // For PDF and DOCX, return a message that processing is limited
  // Full parsing would require additional libraries (pdf-parse, mammoth)
  try {
    if (type === 'pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        // pdf-parse returns a promise
        return pdfParse(buffer).then(data => data.text);
      } catch {
        return Promise.resolve('[PDF parsing requires pdf-parse package. Install with: npm install pdf-parse]');
      }
    }
    if (type === 'docx') {
      try {
        const mammoth = require('mammoth');
        return mammoth.extractRawText({ path: filePath }).then(result => result.value);
      } catch {
        return Promise.resolve('[DOCX parsing requires mammoth package. Install with: npm install mammoth]');
      }
    }
  } catch {
    return Promise.resolve('');
  }
  return Promise.resolve('');
}

// Helper: process resource (extract text, chunk, update status)
async function processResource(resourceId) {
  try {
    resources.updateStatus.run('processing', null, resourceId);
    const resource = resources.getById.get(resourceId);
    if (!resource) return;

    let text = resource.raw_text || '';

    // Extract text from file if needed
    if (!text && resource.file_path) {
      text = await extractText(resource.file_path, resource.type);
      resources.updateText.run(text, resourceId);
    }

    if (!text) {
      resources.updateStatus.run('error', 'No text content could be extracted', resourceId);
      return;
    }

    // Chunk the text
    const textChunks = chunkText(text);
    for (let i = 0; i < textChunks.length; i++) {
      const tokenCount = textChunks[i].split(/\s+/).length;
      chunks.insert.run(resourceId, i, textChunks[i], tokenCount);
    }

    resources.updateStatus.run('ready', null, resourceId);
  } catch (err) {
    resources.updateStatus.run('error', err.message, resourceId);
  }
}

// POST /api/content/upload - Upload a file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const title = req.body.title || req.file.originalname;
    const assessmentId = req.body.assessment_id || null;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const typeMap = { '.pdf': 'pdf', '.docx': 'docx', '.doc': 'docx', '.txt': 'text' };
    const type = typeMap[ext] || 'text';

    const result = resources.insert.run(title, type, null, null, req.file.path, assessmentId, 'pending');
    const resourceId = result.lastInsertRowid;

    // Process asynchronously
    processResource(Number(resourceId));

    const resource = resources.getById.get(Number(resourceId));
    res.status(201).json(resource);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/content/text - Submit raw text
router.post('/text', async (req, res) => {
  try {
    const { text, title, assessment_id } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const result = resources.insert.run(title || 'Text Content', 'text', text, null, null, assessment_id || null, 'pending');
    const resourceId = result.lastInsertRowid;

    processResource(Number(resourceId));

    const resource = resources.getById.get(Number(resourceId));
    res.status(201).json(resource);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/content/url - Submit a URL
router.post('/url', async (req, res) => {
  try {
    const { url, title, assessment_id } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const result = resources.insert.run(title || url, 'url', null, url, null, assessment_id || null, 'pending');
    const resourceId = result.lastInsertRowid;

    // For URL type, we'd need to fetch and parse the page
    // Mark as error with helpful message for now
    resources.updateStatus.run('error', 'URL fetching not yet implemented. Use file upload or paste text instead.', Number(resourceId));

    const resource = resources.getById.get(Number(resourceId));
    res.status(201).json(resource);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/content/resources - List all resources
router.get('/resources', (req, res) => {
  try {
    const all = resources.getAll.all();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/content/resources/:id - Get resource detail with chunks
router.get('/resources/:id', (req, res) => {
  try {
    const resource = resources.getById.get(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    const resourceChunks = chunks.getByResource.all(req.params.id);
    res.json({ ...resource, chunks: resourceChunks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/content/resources/:id - Delete resource
router.delete('/resources/:id', (req, res) => {
  try {
    const resource = resources.getById.get(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    // Delete file if it exists
    if (resource.file_path && fs.existsSync(resource.file_path)) {
      fs.unlinkSync(resource.file_path);
    }

    chunks.deleteByResource.run(req.params.id);
    resources.delete.run(req.params.id);
    res.json({ message: 'Resource deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/content/resources/:id/reprocess - Reprocess a resource
router.post('/resources/:id/reprocess', async (req, res) => {
  try {
    const resource = resources.getById.get(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    chunks.deleteByResource.run(req.params.id);
    processResource(Number(req.params.id));

    res.json({ message: 'Reprocessing started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/content/search - Basic text search (no embeddings)
router.post('/search', (req, res) => {
  try {
    const { query, top_k } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const limit = top_k || 5;
    const { db } = require('../database/db');
    const results = db.prepare(
      `SELECT cc.chunk_text, cc.chunk_index, r.title as resource_title, r.id as resource_id
       FROM content_chunks cc
       JOIN resources r ON cc.resource_id = r.id
       WHERE cc.chunk_text LIKE ?
       LIMIT ?`
    ).all(`%${query}%`, limit);

    res.json({ results: results.map(r => ({ ...r, score: 1.0 })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
