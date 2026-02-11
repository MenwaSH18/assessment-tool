const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

// GET /api/assessments - List all assessments
router.get('/', (req, res) => {
  try {
    const assessments = db.assessments.getAll.all();
    const withCounts = assessments.map(a => {
      const questions = db.questions.getByAssessment.all(a.id);
      const submissions = db.submissions.getByAssessment.all(a.id);
      return { ...a, questionCount: questions.length, submissionCount: submissions.length };
    });
    res.json(withCounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assessments - Create a new assessment
router.post('/', (req, res) => {
  try {
    const { title, description, subject } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const shareCode = uuidv4().substring(0, 8);
    const result = db.assessments.insert.run(title.trim(), description || '', subject || '', shareCode);
    const assessment = db.assessments.getById.get(result.lastInsertRowid);
    res.status(201).json(assessment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assessments/:id - Get assessment by ID with questions
router.get('/:id', (req, res) => {
  try {
    const assessment = db.assessments.getById.get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const questions = db.questions.getByAssessment.all(assessment.id);
    const parsedQuestions = questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
    }));
    res.json({ ...assessment, questions: parsedQuestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/assessments/:id - Update assessment
router.put('/:id', (req, res) => {
  try {
    const existing = db.assessments.getById.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assessment not found' });
    const { title, description, subject } = req.body;
    db.assessments.update.run(
      title || existing.title,
      description !== undefined ? description : existing.description,
      subject !== undefined ? subject : existing.subject,
      req.params.id
    );
    const updated = db.assessments.getById.get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/assessments/:id - Delete assessment (cascades)
router.delete('/:id', (req, res) => {
  try {
    const existing = db.assessments.getById.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assessment not found' });
    db.assessments.delete.run(req.params.id);
    res.json({ message: 'Assessment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
