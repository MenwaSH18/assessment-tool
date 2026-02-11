import { Hono } from 'hono';

const app = new Hono();

// GET /api/questions/assessment/:assessmentId
app.get('/assessment/:assessmentId', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_num ASC'
    ).bind(c.req.param('assessmentId')).all();
    const parsed = results.map(q => ({ ...q, options: q.options ? JSON.parse(q.options) : null }));
    return c.json(parsed);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/questions
app.post('/', async (c) => {
  try {
    const { assessment_id, type, question_text, options, correct_answer, rubric, points } = await c.req.json();

    if (!assessment_id) return c.json({ error: 'assessment_id is required' }, 400);
    if (!type || !['mcq', 'open'].includes(type)) return c.json({ error: 'type must be "mcq" or "open"' }, 400);
    if (!question_text || !question_text.trim()) return c.json({ error: 'question_text is required' }, 400);

    if (type === 'mcq') {
      if (!options || !Array.isArray(options) || options.length !== 4) return c.json({ error: 'MCQ requires exactly 4 options' }, 400);
      if (!correct_answer || !['A', 'B', 'C', 'D'].includes(correct_answer.toUpperCase())) return c.json({ error: 'MCQ correct_answer must be A, B, C, or D' }, 400);
    }

    const { results: assessment } = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(assessment_id).all();
    if (assessment.length === 0) return c.json({ error: 'Assessment not found' }, 404);

    const { results: maxRows } = await c.env.DB.prepare('SELECT COALESCE(MAX(order_num), 0) as max_order FROM questions WHERE assessment_id = ?').bind(assessment_id).all();
    const orderNum = maxRows[0].max_order + 1;

    const result = await c.env.DB.prepare(
      'INSERT INTO questions (assessment_id, type, question_text, options, correct_answer, rubric, points, order_num, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      assessment_id, type, question_text.trim(),
      type === 'mcq' ? JSON.stringify(options) : null,
      type === 'mcq' ? correct_answer.toUpperCase() : (correct_answer || ''),
      rubric || '', points || 1, orderNum, 1
    ).run();

    const { results: created } = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(result.meta.last_row_id).all();
    return c.json({ ...created[0], options: created[0].options ? JSON.parse(created[0].options) : null }, 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/questions/:id
app.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: existing } = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(id).all();
    if (existing.length === 0) return c.json({ error: 'Question not found' }, 404);
    const ex = existing[0];

    const { type, question_text, options, correct_answer, rubric, points, order_num, is_visible } = await c.req.json();
    const newType = type || ex.type;

    await c.env.DB.prepare(
      'UPDATE questions SET type = ?, question_text = ?, options = ?, correct_answer = ?, rubric = ?, points = ?, order_num = ?, is_visible = ? WHERE id = ?'
    ).bind(
      newType,
      question_text || ex.question_text,
      newType === 'mcq' ? JSON.stringify(options || JSON.parse(ex.options || '[]')) : null,
      correct_answer !== undefined ? (correct_answer || '') : ex.correct_answer,
      rubric !== undefined ? rubric : ex.rubric,
      points !== undefined ? points : ex.points,
      order_num !== undefined ? order_num : ex.order_num,
      is_visible !== undefined ? is_visible : ex.is_visible,
      id
    ).run();

    const { results: updated } = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(id).all();
    return c.json({ ...updated[0], options: updated[0].options ? JSON.parse(updated[0].options) : null });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/questions/:id/toggle-visibility
app.put('/:id/toggle-visibility', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: existing } = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(id).all();
    if (existing.length === 0) return c.json({ error: 'Question not found' }, 404);

    await c.env.DB.prepare('UPDATE questions SET is_visible = CASE WHEN is_visible = 1 THEN 0 ELSE 1 END WHERE id = ?').bind(id).run();

    const { results: updated } = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(id).all();
    return c.json({ ...updated[0], options: updated[0].options ? JSON.parse(updated[0].options) : null });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /api/questions/:id/reorder
app.put('/:id/reorder', async (c) => {
  try {
    const id = c.req.param('id');
    const { direction } = await c.req.json();
    if (!direction || !['up', 'down'].includes(direction)) return c.json({ error: 'direction must be "up" or "down"' }, 400);

    const { results: currentArr } = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(id).all();
    if (currentArr.length === 0) return c.json({ error: 'Question not found' }, 404);
    const current = currentArr[0];

    const { results: allQuestions } = await c.env.DB.prepare('SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_num ASC').bind(current.assessment_id).all();
    const currentIndex = allQuestions.findIndex(q => q.id === current.id);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (swapIndex < 0 || swapIndex >= allQuestions.length) return c.json({ error: 'Cannot move further in that direction' }, 400);

    const swapWith = allQuestions[swapIndex];
    await c.env.DB.prepare('UPDATE questions SET order_num = ? WHERE id = ?').bind(swapWith.order_num, current.id).run();
    await c.env.DB.prepare('UPDATE questions SET order_num = ? WHERE id = ?').bind(current.order_num, swapWith.id).run();

    const { results: updated } = await c.env.DB.prepare('SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_num ASC').bind(current.assessment_id).all();
    return c.json(updated.map(q => ({ ...q, options: q.options ? JSON.parse(q.options) : null })));
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/questions/:id
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: existing } = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(id).all();
    if (existing.length === 0) return c.json({ error: 'Question not found' }, 404);
    await c.env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(id).run();
    return c.json({ message: 'Question deleted' });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
