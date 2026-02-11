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
    }));
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/questions - Create a question
router.post('/', (req, res) => {
  try {
    const { assessment_id, type, question_text, options, correct_answer, rubric, points } = req.body;

    if (!assessment_id) return res.status(400).json({ error: 'assessment_id is required' });
    if (!type || !['mcq', 'open'].includes(type)) {
      return res.status(400).json({ error: 'type must be "mcq" or "open"' });
    }
    if (!question_text || !question_text.trim()) {
      return res.status(400).json({ error: 'question_text is required' });
    }
    if (type === 'mcq') {
      if (!options || !Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({ error: 'MCQ requires exactly 4 options' });
      }
      if (!correct_answer || !['A', 'B', 'C', 'D'].includes(correct_answer.toUpperCase())) {
        return res.status(400).json({ error: 'MCQ correct_answer must be A, B, C, or D' });
      }
    }

    const assessment = db.assessments.getById.get(assessment_id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const maxOrder = db.questions.getMaxOrderNum.get(assessment_id).max_order;
    const orderNum = maxOrder + 1;

    const result = db.questions.insert.run(
      assessment_id,
      type,
      question_text.trim(),
      type === 'mcq' ? JSON.stringify(options) : null,
      type === 'mcq' ? correct_answer.toUpperCase() : (correct_answer || ''),
      rubric || '',
      points || 1,
      orderNum,
      1 // is_visible defaults to true
    );

    const question = db.questions.getById.get(result.lastInsertRowid);
    res.status(201).json({
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
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

    const { type, question_text, options, correct_answer, rubric, points, order_num, is_visible } = req.body;
    const newType = type || existing.type;

    db.questions.update.run(
      newType,
      question_text || existing.question_text,
      newType === 'mcq' ? JSON.stringify(options || JSON.parse(existing.options || '[]')) : null,
      correct_answer !== undefined ? (correct_answer || '') : existing.correct_answer,
      rubric !== undefined ? rubric : existing.rubric,
      points !== undefined ? points : existing.points,
      order_num !== undefined ? order_num : existing.order_num,
      is_visible !== undefined ? is_visible : existing.is_visible,
      req.params.id
    );

    const updated = db.questions.getById.get(req.params.id);
    res.json({ ...updated, options: updated.options ? JSON.parse(updated.options) : null });
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
