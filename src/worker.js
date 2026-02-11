import { Hono } from 'hono';
import { cors } from 'hono/cors';
import assessmentRoutes from './routes/assessments.js';
import questionRoutes from './routes/questions.js';
import submissionRoutes from './routes/submissions.js';
import evaluateRoutes from './routes/evaluate.js';

const app = new Hono();

// Middleware
app.use('*', cors());

// API Routes
app.route('/api/assessments', assessmentRoutes);
app.route('/api/questions', questionRoutes);
app.route('/api/submissions', submissionRoutes);
app.route('/api/evaluate', evaluateRoutes);

// Page routes - serve HTML files from assets
app.get('/admin', async (c) => {
  const url = new URL('/admin.html', c.req.url);
  return c.env.ASSETS.fetch(new Request(url));
});

app.get('/take/:code', async (c) => {
  const url = new URL('/assessment.html', c.req.url);
  return c.env.ASSETS.fetch(new Request(url));
});

app.get('/results/:submissionId', async (c) => {
  const url = new URL('/results.html', c.req.url);
  return c.env.ASSETS.fetch(new Request(url));
});

export default app;
