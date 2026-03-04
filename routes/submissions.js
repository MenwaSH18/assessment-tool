const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/submissions/take/:code - Get assessment for student to take (no answers exposed)
router.get('/take/:code', (req, res) => {
  try {
    const assessment = db.assessments.getByCode.get(req.params.code);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const allQuestions = db.questions.getByAssessment.all(assessment.id);
    // Only show visible questions to students
    const questions = allQuestions.filter(q => q.is_visible !== 0);
    const sanitized = questions.map(q => {
      const base = {
        id: q.id,
        type: q.type,
        question_text: q.question_text,
        options: q.options ? JSON.parse(q.options) : null,
        points: q.points || 1,
        order_num: q.order_num,
      };
      // Include student-facing metadata (no solutions/answers)
      const meta = db.metadata.getByQuestion.get(q.id);
      if (meta) {
        if (q.type === 'code') {
          base.code_language = meta.code_language;
          base.code_template = meta.code_template;
        }
        if (q.type === 'fill_blank') {
          base.fill_blank_template = meta.fill_blank_template;
        }
        if (q.type === 'diagram_label') {
          base.diagram_mermaid = meta.diagram_mermaid;
          base.label_regions = meta.label_regions ? JSON.parse(meta.label_regions) : null;
        }
        if (q.type === 'math') {
          base.math_latex = meta.math_latex;
        }
      }
      return base;
    });

    res.json({
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      subject: assessment.subject,
      share_code: assessment.share_code,
      questions: sanitized,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions/:code/submit - Submit answers for an assessment
router.post('/:code/submit', async (req, res) => {
  try {
    const { student_name, answers } = req.body;

    if (!student_name || !student_name.trim()) {
      return res.status(400).json({ error: 'Student name is required' });
    }
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Answers are required' });
    }

    const assessment = db.assessments.getByCode.get(req.params.code);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const allQuestions = db.questions.getByAssessment.all(assessment.id);
    // Only grade visible questions
    const questions = allQuestions.filter(q => q.is_visible !== 0);
    if (questions.length === 0) {
      return res.status(400).json({ error: 'Assessment has no visible questions' });
    }

    const questionMap = {};
    questions.forEach(q => { questionMap[q.id] = q; });

    const totalPossible = questions.reduce((sum, q) => sum + (q.points || 1), 0);
    const submissionResult = db.submissions.insert.run(
      assessment.id, student_name.trim(), 0, totalPossible
    );
    const submissionId = submissionResult.lastInsertRowid;

    let totalScore = 0;
    const processedAnswers = [];

    for (const ans of answers) {
      const question = questionMap[ans.question_id];
      if (!question) continue;

      let isCorrect = 0;
      let aiFeedback = '';
      let pointsEarned = 0;

      if (question.type === 'mcq') {
        const studentChoice = (ans.answer || '').toUpperCase().trim();
        const correctChoice = (question.correct_answer || '').toUpperCase().trim();
        isCorrect = studentChoice === correctChoice ? 1 : 0;
        pointsEarned = isCorrect ? (question.points || 1) : 0;
        aiFeedback = isCorrect
          ? 'Well done! Correct answer.'
          : `The correct answer is ${correctChoice}. Review this concept and try again.`;
      } else if (question.type === 'tf') {
        const studentChoice = (ans.answer || '').toLowerCase().trim();
        const correctChoice = (question.correct_answer || '').toLowerCase().trim();
        isCorrect = studentChoice === correctChoice ? 1 : 0;
        pointsEarned = isCorrect ? (question.points || 1) : 0;
        aiFeedback = isCorrect
          ? 'Well done! Correct answer.'
          : `The correct answer is ${question.correct_answer}. Review this concept and try again.`;
      } else if (question.type === 'fill_blank') {
        // Compare each blank individually for partial credit
        const meta = db.metadata.getByQuestion.get(question.id);
        let expectedAnswers = [];
        if (meta && meta.fill_blank_answers) {
          try { expectedAnswers = JSON.parse(meta.fill_blank_answers); } catch (e) { /* ignore */ }
        }
        if (expectedAnswers.length === 0 && question.correct_answer) {
          expectedAnswers = [question.correct_answer];
        }

        // Student answers are pipe-separated: "word1 | word2 | word3"
        const studentParts = (ans.answer || '').split('|').map(s => s.trim());
        const totalBlanks = expectedAnswers.length;
        let correctCount = 0;
        const blankResults = [];

        for (let i = 0; i < totalBlanks; i++) {
          const expected = (expectedAnswers[i] || '').trim().toLowerCase();
          const student = (studentParts[i] || '').trim().toLowerCase();
          const match = student === expected;
          if (match) correctCount++;
          blankResults.push({ blank: i + 1, correct: match, expected: expectedAnswers[i] || '' });
        }

        const maxPts = question.points || 1;
        if (correctCount === totalBlanks) {
          isCorrect = 1;
          pointsEarned = maxPts;
          aiFeedback = 'Well done! All answers are correct.';
        } else if (correctCount > 0) {
          isCorrect = 0;
          pointsEarned = Math.round((correctCount / totalBlanks) * maxPts * 100) / 100;
          const wrong = blankResults.filter(b => !b.correct)
            .map(b => `Blank ${b.blank}: the correct answer is "${b.expected}"`).join('; ');
          aiFeedback = `You got ${correctCount} out of ${totalBlanks} correct. Review the following: ${wrong}.`;
        } else {
          isCorrect = 0;
          pointsEarned = 0;
          aiFeedback = `Review this topic and try again. The correct answers are: ${expectedAnswers.join(', ')}.`;
        }
      } else {
        // open, code, math, diagram_label: call AI evaluation
        try {
          const evalResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_text: question.question_text,
              student_answer: ans.answer || '',
              correct_answer: question.correct_answer || '',
              rubric: question.rubric || '',
              points: question.points || 1,
            }),
          });
          const evalResult = await evalResponse.json();
          if (evalResult.error && evalResult.fallback) {
            pointsEarned = evalResult.fallback.points_earned;
            isCorrect = evalResult.fallback.is_correct ? 1 : 0;
            aiFeedback = evalResult.fallback.feedback;
          } else {
            pointsEarned = evalResult.points_earned || 0;
            isCorrect = evalResult.is_correct ? 1 : 0;
            aiFeedback = evalResult.feedback || '';
          }
        } catch (evalErr) {
          console.error('Evaluation error for question', question.id, evalErr.message);
          aiFeedback = 'AI evaluation unavailable. Answer recorded for manual review.';
          pointsEarned = 0;
          isCorrect = 0;
        }
      }

      totalScore += pointsEarned;

      db.answers.insert.run(
        submissionId, question.id, ans.answer || '', isCorrect, aiFeedback, pointsEarned
      );

      processedAnswers.push({
        question_id: question.id,
        question_text: question.question_text,
        type: question.type,
        student_answer: ans.answer,
        is_correct: isCorrect,
        ai_feedback: aiFeedback,
        points_earned: pointsEarned,
        max_points: question.points || 1,
      });
    }

    db.submissions.updateScore.run(totalScore, totalPossible, submissionId);

    res.json({
      submission_id: submissionId,
      student_name: student_name.trim(),
      score: totalScore,
      total: totalPossible,
      percentage: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0,
      answers: processedAnswers,
    });
  } catch (err) {
    console.error('Submission error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/assessment/:id - Get all submissions for an assessment (admin)
router.get('/assessment/:id', (req, res) => {
  try {
    const submissions = db.submissions.getByAssessment.all(req.params.id);
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/:id - Get a single submission with answers
router.get('/:id', (req, res) => {
  try {
    const submission = db.submissions.getById.get(req.params.id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const answers = db.answers.getBySubmission.all(submission.id);
    const parsedAnswers = answers.map(a => ({
      ...a,
      options: a.options ? JSON.parse(a.options) : null,
    }));

    const assessment = db.assessments.getById.get(submission.assessment_id);

    res.json({
      ...submission,
      assessment_title: assessment ? assessment.title : 'Unknown',
      percentage: submission.total > 0 ? Math.round((submission.score / submission.total) * 100) : 0,
      answers: parsedAnswers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
