const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/questions/assessment/:assessmentId
router.get('/assessment/:assessmentId', (req, res) => {
  try {
    const questions = db.questions.getByAssessment.all(req.params.assessmentId);
    const parsed = questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
      metadata: db.metadata.getByQuestion.get(q.id) || null,
    }));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_TYPES = ['mcq', 'open', 'tf', 'fill_blank', 'diagram_label', 'code', 'math'];

// POST /api/questions - Create a question
router.post('/', (req, res) => {
  try {
    const { assessment_id, type, question_text, options, correct_answer, rubric, points, metadata } = req.body;

    if (!assessment_id) return res.status(400).json({ error: 'assessment_id is required' });
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (!question_text || !question_text.trim()) {
      return res.status(400).json({ error: 'question_text is required' });
    }

    // Type-specific validation
    if (type === 'mcq') {
      if (!options || !Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({ error: 'MCQ requires exactly 4 options' });
      }
      if (!correct_answer || !['A', 'B', 'C', 'D'].includes(correct_answer.toUpperCase())) {
        return res.status(400).json({ error: 'MCQ correct_answer must be A, B, C, or D' });
      }
    }
    if (type === 'tf') {
      if (!correct_answer || !['true', 'false'].includes(correct_answer.toLowerCase())) {
        return res.status(400).json({ error: 'True/False correct_answer must be "true" or "false"' });
      }
    }

    const assessment = db.assessments.getById.get(assessment_id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const maxOrder = db.questions.getMaxOrderNum.get(assessment_id).max_order;
    const orderNum = maxOrder + 1;

    // Determine options storage
    let storedOptions = null;
    if (type === 'mcq') {
      storedOptions = JSON.stringify(options);
    } else if (type === 'tf') {
      storedOptions = JSON.stringify(['True', 'False']);
    }

    // Determine correct_answer storage
    let storedAnswer = correct_answer || '';
    if (type === 'mcq') {
      storedAnswer = correct_answer.toUpperCase();
    } else if (type === 'tf') {
      storedAnswer = correct_answer.toLowerCase() === 'true' ? 'True' : 'False';
    }

    const result = db.questions.insert.run(
      assessment_id,
      type,
      question_text.trim(),
      storedOptions,
      storedAnswer,
      rubric || '',
      points || 1,
      orderNum,
      1 // is_visible defaults to true
    );

    const questionId = result.lastInsertRowid;

    // Save metadata if provided
    if (metadata && typeof metadata === 'object') {
      db.metadata.insert.run(
        questionId,
        metadata.diagram_mermaid || null,
        metadata.code_language || null,
        metadata.code_template || null,
        metadata.code_solution || null,
        metadata.test_cases ? JSON.stringify(metadata.test_cases) : null,
        metadata.math_latex || null,
        metadata.fill_blank_template || null,
        metadata.fill_blank_answers ? JSON.stringify(metadata.fill_blank_answers) : null,
        metadata.label_regions ? JSON.stringify(metadata.label_regions) : null,
        metadata.difficulty || 'medium',
        metadata.topic_tags ? JSON.stringify(metadata.topic_tags) : '[]',
        metadata.bloom_level || null
      );
    }

    const question = db.questions.getById.get(questionId);
    const meta = db.metadata.getByQuestion.get(questionId);
    res.status(201).json({
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
      metadata: meta || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/questions/:id - Update a question
router.put('/:id', (req, res) => {
  try {
    const existing = db.questions.getById.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Question not found' });

    const { type, question_text, options, correct_answer, rubric, points, order_num, is_visible, metadata } = req.body;
    const newType = type || existing.type;

    // Determine options storage based on type
    let storedOptions = null;
    if (newType === 'mcq') {
      storedOptions = JSON.stringify(options || JSON.parse(existing.options || '[]'));
    } else if (newType === 'tf') {
      storedOptions = JSON.stringify(['True', 'False']);
    }

    db.questions.update.run(
      newType,
      question_text || existing.question_text,
      storedOptions,
      correct_answer !== undefined ? (correct_answer || '') : existing.correct_answer,
      rubric !== undefined ? rubric : existing.rubric,
      points !== undefined ? points : existing.points,
      order_num !== undefined ? order_num : existing.order_num,
      is_visible !== undefined ? is_visible : existing.is_visible,
      req.params.id
    );

    // Update metadata if provided
    if (metadata && typeof metadata === 'object') {
      const existingMeta = db.metadata.getByQuestion.get(req.params.id);
      if (existingMeta) {
        db.metadata.update.run(
          metadata.diagram_mermaid || null,
          metadata.code_language || null,
          metadata.code_template || null,
          metadata.code_solution || null,
          metadata.test_cases ? JSON.stringify(metadata.test_cases) : null,
          metadata.math_latex || null,
          metadata.fill_blank_template || null,
          metadata.fill_blank_answers ? JSON.stringify(metadata.fill_blank_answers) : null,
          metadata.label_regions ? JSON.stringify(metadata.label_regions) : null,
          metadata.difficulty || 'medium',
          metadata.topic_tags ? JSON.stringify(metadata.topic_tags) : '[]',
          metadata.bloom_level || null,
          req.params.id
        );
      } else {
        db.metadata.insert.run(
          req.params.id,
          metadata.diagram_mermaid || null,
          metadata.code_language || null,
          metadata.code_template || null,
          metadata.code_solution || null,
          metadata.test_cases ? JSON.stringify(metadata.test_cases) : null,
          metadata.math_latex || null,
          metadata.fill_blank_template || null,
          metadata.fill_blank_answers ? JSON.stringify(metadata.fill_blank_answers) : null,
          metadata.label_regions ? JSON.stringify(metadata.label_regions) : null,
          metadata.difficulty || 'medium',
          metadata.topic_tags ? JSON.stringify(metadata.topic_tags) : '[]',
          metadata.bloom_level || null
        );
      }
    }

    const updated = db.questions.getById.get(req.params.id);
    const meta = db.metadata.getByQuestion.get(req.params.id);
    res.json({ ...updated, options: updated.options ? JSON.parse(updated.options) : null, metadata: meta || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/questions/:id/toggle-visibility - Toggle question visibility
router.put('/:id/toggle-visibility', (req, res) => {
  try {
    const existing = db.questions.getById.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Question not found' });

    db.questions.toggleVisibility.run(req.params.id);
    const updated = db.questions.getById.get(req.params.id);
    res.json({ ...updated, options: updated.options ? JSON.parse(updated.options) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/questions/:id/reorder - Move question up or down
router.put('/:id/reorder', (req, res) => {
  try {
    const { direction } = req.body; // "up" or "down"
    if (!direction || !['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be "up" or "down"' });
    }

    const current = db.questions.getById.get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Question not found' });

    // Get all questions in order to find the adjacent one
    const allQuestions = db.questions.getByAssessment.all(current.assessment_id);
    const currentIndex = allQuestions.findIndex(q => q.id === current.id);

    let swapIndex;
    if (direction === 'up') {
      swapIndex = currentIndex - 1;
    } else {
      swapIndex = currentIndex + 1;
    }

    if (swapIndex < 0 || swapIndex >= allQuestions.length) {
      return res.status(400).json({ error: 'Cannot move further in that direction' });
    }

    const swapWith = allQuestions[swapIndex];

    // Swap order_num values
    const tempOrder = current.order_num;
    db.questions.updateOrder.run(swapWith.order_num, current.id);
    db.questions.updateOrder.run(tempOrder, swapWith.id);

    // Return updated list
    const updated = db.questions.getByAssessment.all(current.assessment_id);
    const parsed = updated.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
    }));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/questions/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.questions.getById.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Question not found' });
    db.questions.delete.run(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
