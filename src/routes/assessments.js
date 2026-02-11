import { Hono } from 'hono';

const app = new Hono();

// GET /api/assessments
app.get('/', async (c) => {
  try {
    const DB = c.env.DB;
    const { results: assessments } = await DB.prepare(
      'SELECT * FROM assessments ORDER BY created_at DESC'
    ).all();

    const withCounts = await Promise.all(assessments.map(async (a) => {
      const { results: questions } = await DB.prepare(
        'SELECT COUNT(*) as count FROM questions WHERE assessment_id = ?'
      ).bind(a.id).all();
      const { results: submissions } = await DB.prepare(
        'SELECT COUNT(*) as count FROM submissions WHERE assessment_id = ?'
      ).bind(a.id).all();
      return {
        ...a,
        questionCount: questions[0].count,
        submissionCount: submissions[0].count,
      };
    }));

    return c.json(withCounts);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/assessments
app.post('/', async (c) => {
  try {
    const { title, description, subject } = await c.req.json();
    if (!title || !title.trim()) {
      return c.json({ error: 'Title is required' }, 400);
    }
    const shareCode = crypto.randomUUID().substring(0, 8);
    const result = await c.env.DB.prepare(
      'INSERT INTO assessments (title, description, subject, share_code) VALUES (?, ?, ?, ?)'
    ).bind(title.trim(), description || '', subject || '', shareCode).run();

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE id = ?'
    ).bind(result.meta.last_row_id).all();

    return c.json(results[0], 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/assessments/:id
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: assessments } = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE id = ?'
    ).bind(id).all();
    if (assessments.length === 0) return c.json({ error: 'Assessment not found' }, 404);

    const { results: questions } = await c.env.DB.prepare(
      'SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_num ASC'
    ).bind(id).all();

    const parsedQuestions = questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
    }));

    return c.json({ ...assessments[0], questions: parsedQuestions });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/assessments/:id
app.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: existing } = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE id = ?'
    ).bind(id).all();
    if (existing.length === 0) return c.json({ error: 'Assessment not found' }, 404);

    const { title, description, subject } = await c.req.json();
    await c.env.DB.prepare(
      'UPDATE assessments SET title = ?, description = ?, subject = ? WHERE id = ?'
    ).bind(
      title || existing[0].title,
      description !== undefined ? description : existing[0].description,
      subject !== undefined ? subject : existing[0].subject,
      id
    ).run();

    const { results: updated } = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE id = ?'
    ).bind(id).all();
    return c.json(updated[0]);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/assessments/:id
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: existing } = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE id = ?'
    ).bind(id).all();
    if (existing.length === 0) return c.json({ error: 'Assessment not found' }, 404);

    await c.env.DB.prepare('DELETE FROM assessments WHERE id = ?').bind(id).run();
    return c.json({ message: 'Assessment deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
