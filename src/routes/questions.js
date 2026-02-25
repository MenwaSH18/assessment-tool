import { Hono } from 'hono';
import { QUESTION_TYPES, validateQuestion } from '../lib/question-types.js';

const app = new Hono();

// GET /api/questions/assessment/:assessmentId
app.get('/assessment/:assessmentId', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_num ASC'
    ).bind(c.req.param('assessmentId')).all();

    // Fetch metadata for each question
    const parsed = await Promise.all(results.map(async (q) => {
      const question = { ...q, options: q.options ? JSON.parse(q.options) : null };
      const { results: metaRows } = await c.env.DB.prepare(
        'SELECT * FROM question_metadata WHERE question_id = ?'
      ).bind(q.id).all();
      if (metaRows.length > 0) {
        const meta = metaRows[0];
        question.metadata = {
          ...meta,
          test_cases: meta.test_cases ? JSON.parse(meta.test_cases) : null,
          fill_blank_answers: meta.fill_blank_answers ? JSON.parse(meta.fill_blank_answers) : null,
          label_regions: meta.label_regions ? JSON.parse(meta.label_regions) : null,
          topic_tags: meta.topic_tags ? JSON.parse(meta.topic_tags) : [],
        };
      }
      return question;
    }));

    return c.json(parsed);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/questions
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { assessment_id, type, question_text, options, correct_answer, rubric, points, metadata } = body;

    if (!assessment_id) return c.json({ error: 'assessment_id is required' }, 400);

    const validation = validateQuestion(body);
    if (!validation.valid) return c.json({ error: validation.error }, 400);

    const { results: assessment } = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(assessment_id).all();
    if (assessment.length === 0) return c.json({ error: 'Assessment not found' }, 404);

    const { results: maxRows } = await c.env.DB.prepare('SELECT COALESCE(MAX(order_num), 0) as max_order FROM questions WHERE assessment_id = ?').bind(assessment_id).all();
    const orderNum = maxRows[0].max_order + 1;

    // Determine options storage
    let storedOptions = null;
    if (type === 'mcq' && options) {
      storedOptions = JSON.stringify(options);
    } else if (type === 'tf') {
      storedOptions = JSON.stringify(['True', 'False']);
    }

    // Determine correct_answer storage
    let storedAnswer = correct_answer || '';
    if (type === 'mcq' && correct_answer) storedAnswer = correct_answer.toUpperCase();
    if (type === 'tf' && correct_answer) storedAnswer = correct_answer.toLowerCase();

    const result = await c.env.DB.prepare(
      'INSERT INTO questions (assessment_id, type, question_text, options, correct_answer, rubric, points, order_num, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      assessment_id, type, question_text.trim(),
      storedOptions, storedAnswer,
      rubric || '', points || 1, orderNum, 1
    ).run();

    const questionId = result.meta.last_row_id;

    // Save metadata if provided (for specialized question types)
    if (metadata) {
      const metaFields = {
        diagram_mermaid: metadata.diagram_mermaid || null,
        code_language: metadata.code_language || null,
        code_template: metadata.code_template || null,
        code_solution: metadata.code_solution || null,
        test_cases: metadata.test_cases ? JSON.stringify(metadata.test_cases) : null,
        math_latex: metadata.math_latex || null,
        fill_blank_template: metadata.fill_blank_template || null,
        fill_blank_answers: metadata.fill_blank_answers ? JSON.stringify(metadata.fill_blank_answers) : null,
        label_regions: metadata.label_regions ? JSON.stringify(metadata.label_regions) : null,
        difficulty: metadata.difficulty || 'medium',
        topic_tags: metadata.topic_tags ? JSON.stringify(metadata.topic_tags) : '[]',
        bloom_level: metadata.bloom_level || null,
      };

      await c.env.DB.prepare(
        `INSERT INTO question_metadata (question_id, diagram_mermaid, code_language, code_template, code_solution,
          test_cases, math_latex, fill_blank_template, fill_blank_answers, label_regions, difficulty, topic_tags, bloom_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        questionId,
        metaFields.diagram_mermaid, metaFields.code_language, metaFields.code_template, metaFields.code_solution,
        metaFields.test_cases, metaFields.math_latex, metaFields.fill_blank_template, metaFields.fill_blank_answers,
        metaFields.label_regions, metaFields.difficulty, metaFields.topic_tags, metaFields.bloom_level
      ).run();
    }

    const { results: created } = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(questionId).all();
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

    const body = await c.req.json();
    const { type, question_text, options, correct_answer, rubric, points, order_num, is_visible, metadata } = body;
    const newType = type || ex.type;

    // Determine options storage
    let storedOptions = null;
    if (newType === 'mcq') {
      storedOptions = JSON.stringify(options || (ex.options ? JSON.parse(ex.options) : []));
    } else if (newType === 'tf') {
      storedOptions = JSON.stringify(['True', 'False']);
    }

    // Determine correct_answer storage
    let storedAnswer;
    if (correct_answer !== undefined) {
      storedAnswer = correct_answer || '';
      if (newType === 'mcq') storedAnswer = storedAnswer.toUpperCase();
      if (newType === 'tf') storedAnswer = storedAnswer.toLowerCase();
    } else {
      storedAnswer = ex.correct_answer;
    }

    await c.env.DB.prepare(
      'UPDATE questions SET type = ?, question_text = ?, options = ?, correct_answer = ?, rubric = ?, points = ?, order_num = ?, is_visible = ? WHERE id = ?'
    ).bind(
      newType,
      question_text || ex.question_text,
      storedOptions,
      storedAnswer,
      rubric !== undefined ? rubric : ex.rubric,
      points !== undefined ? points : ex.points,
      order_num !== undefined ? order_num : ex.order_num,
      is_visible !== undefined ? is_visible : ex.is_visible,
      id
    ).run();

    // Update metadata if provided
    if (metadata) {
      const metaFields = {
        diagram_mermaid: metadata.diagram_mermaid || null,
        code_language: metadata.code_language || null,
        code_template: metadata.code_template || null,
        code_solution: metadata.code_solution || null,
        test_cases: metadata.test_cases ? JSON.stringify(metadata.test_cases) : null,
        math_latex: metadata.math_latex || null,
        fill_blank_template: metadata.fill_blank_template || null,
        fill_blank_answers: metadata.fill_blank_answers ? JSON.stringify(metadata.fill_blank_answers) : null,
        label_regions: metadata.label_regions ? JSON.stringify(metadata.label_regions) : null,
        difficulty: metadata.difficulty || 'medium',
        topic_tags: metadata.topic_tags ? JSON.stringify(metadata.topic_tags) : '[]',
        bloom_level: metadata.bloom_level || null,
      };

      const { results: existingMeta } = await c.env.DB.prepare(
        'SELECT id FROM question_metadata WHERE question_id = ?'
      ).bind(id).all();

      if (existingMeta.length > 0) {
        await c.env.DB.prepare(
          `UPDATE question_metadata SET
            diagram_mermaid = ?, code_language = ?, code_template = ?, code_solution = ?,
            test_cases = ?, math_latex = ?, fill_blank_template = ?, fill_blank_answers = ?,
            label_regions = ?, difficulty = ?, topic_tags = ?, bloom_level = ?
          WHERE question_id = ?`
        ).bind(
          metaFields.diagram_mermaid, metaFields.code_language, metaFields.code_template, metaFields.code_solution,
          metaFields.test_cases, metaFields.math_latex, metaFields.fill_blank_template, metaFields.fill_blank_answers,
          metaFields.label_regions, metaFields.difficulty, metaFields.topic_tags, metaFields.bloom_level,
          id
        ).run();
      } else {
        await c.env.DB.prepare(
          `INSERT INTO question_metadata (question_id, diagram_mermaid, code_language, code_template, code_solution,
            test_cases, math_latex, fill_blank_template, fill_blank_answers, label_regions, difficulty, topic_tags, bloom_level)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          metaFields.diagram_mermaid, metaFields.code_language, metaFields.code_template, metaFields.code_solution,
          metaFields.test_cases, metaFields.math_latex, metaFields.fill_blank_template, metaFields.fill_blank_answers,
          metaFields.label_regions, metaFields.difficulty, metaFields.topic_tags, metaFields.bloom_level
        ).run();
      }
    }

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
