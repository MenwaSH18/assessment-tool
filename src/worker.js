import { Hono } from 'hono';
import { cors } from 'hono/cors';
import assessmentRoutes from './routes/assessments.js';
import questionRoutes from './routes/questions.js';
import submissionRoutes from './routes/submissions.js';
import evaluateRoutes from './routes/evaluate.js';
import contentRoutes from './routes/content.js';
import generateRoutes from './routes/generate.js';
import { handleQueueBatch } from './queue-handlers/resource-processor.js';

const app = new Hono();

// Middleware
app.use('*', cors());

// API Routes - Existing
app.route('/api/assessments', assessmentRoutes);
app.route('/api/questions', questionRoutes);
app.route('/api/submissions', submissionRoutes);
app.route('/api/evaluate', evaluateRoutes);

// API Routes - New (Phase 2 & 3)
app.route('/api/content', contentRoutes);
app.route('/api/generate', generateRoutes);

// Page routes - serve HTML files from assets
app.get('/admin', async (c) => {
  const url = new URL('/admin', c.req.url);
  return c.env.ASSETS.fetch(new Request(url, c.req.raw));
});

app.get('/take/:code', async (c) => {
  const url = new URL('/assessment', c.req.url);
  return c.env.ASSETS.fetch(new Request(url, c.req.raw));
});

app.get('/results/:submissionId', async (c) => {
  const url = new URL('/results', c.req.url);
  return c.env.ASSETS.fetch(new Request(url, c.req.raw));
});

app.get('/content', async (c) => {
  const url = new URL('/content', c.req.url);
  return c.env.ASSETS.fetch(new Request(url, c.req.raw));
});

export default {
  // Hono fetch handler - use arrow function to preserve proper binding
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // Queue consumer handler for async document processing
  async queue(batch, env) {
    await handleQueueBatch(batch, env);
  },
};
