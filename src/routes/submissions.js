import { Hono } from 'hono';
import { evaluateAnswer } from './evaluate.js';

const app = new Hono();

// GET /api/submissions/take/:code - Get assessment for student (no answers exposed)
app.get('/take/:code', async (c) => {
  try {
    const code = c.req.param('code');
    const { results: assessments } = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE share_code = ?'
    ).bind(code).all();
    if (assessments.length === 0) return c.json({ error: 'Assessment not found' }, 404);
    const assessment = assessments[0];

    const { results: allQuestions } = await c.env.DB.prepare(
      'SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_num ASC'
    ).bind(assessment.id).all();

    // Only show visible questions to students
    const questions = allQuestions.filter(q => q.is_visible !== 0);
    const sanitized = questions.map(q => ({
      id: q.id,
      type: q.type,
      question_text: q.question_text,
      options: q.options ? JSON.parse(q.options) : null,
      points: q.points || 1,
      order_num: q.order_num,
    }));

    return c.json({
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      subject: assessment.subject,
      share_code: assessment.share_code,
      questions: sanitized,
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/submissions/:code/submit
app.post('/:code/submit', async (c) => {
  try {
    const code = c.req.param('code');
    const { student_name, answers } = await c.req.json();

    if (!student_name || !student_name.trim()) return c.json({ error: 'Student name is required' }, 400);
    if (!answers || !Array.isArray(answers) || answers.length === 0) return c.json({ error: 'Answers are required' }, 400);

    const { results: assessments } = await c.env.DB.prepare('SELECT * FROM assessments WHERE share_code = ?').bind(code).all();
    if (assessments.length === 0) return c.json({ error: 'Assessment not found' }, 404);
    const assessment = assessments[0];

    const { results: allQuestions } = await c.env.DB.prepare('SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_num ASC').bind(assessment.id).all();
    const questions = allQuestions.filter(q => q.is_visible !== 0);
    if (questions.length === 0) return c.json({ error: 'Assessment has no visible questions' }, 400);

    const questionMap = {};
    questions.forEach(q => { questionMap[q.id] = q; });

    const totalPossible = questions.reduce((sum, q) => sum + (q.points || 1), 0);

    const subResult = await c.env.DB.prepare(
      'INSERT INTO submissions (assessment_id, student_name, score, total) VALUES (?, ?, ?, ?)'
    ).bind(assessment.id, student_name.trim(), 0, totalPossible).run();
    const submissionId = subResult.meta.last_row_id;

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
        aiFeedback = isCorrect ? 'Correct!' : `Incorrect. The correct answer is ${correctChoice}.`;
      } else {
        // Open-ended: call evaluate function directly
        const evalResult = await evaluateAnswer({
          question_text: question.question_text,
          student_answer: ans.answer || '',
          correct_answer: question.correct_answer || '',
          rubric: question.rubric || '',
          points: question.points || 1,
          apiKey: c.env.ANTHROPIC_API_KEY,
        });
        pointsEarned = evalResult.points_earned || 0;
        isCorrect = evalResult.is_correct ? 1 : 0;
        aiFeedback = evalResult.feedback || '';
      }

      totalScore += pointsEarned;

      await c.env.DB.prepare(
        'INSERT INTO answers (submission_id, question_id, student_answer, is_correct, ai_feedback, points_earned) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(submissionId, question.id, ans.answer || '', isCorrect, aiFeedback, pointsEarned).run();

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

    await c.env.DB.prepare('UPDATE submissions SET score = ?, total = ? WHERE id = ?').bind(totalScore, totalPossible, submissionId).run();

    return c.json({
      submission_id: submissionId,
      student_name: student_name.trim(),
      score: totalScore,
      total: totalPossible,
      percentage: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0,
      answers: processedAnswers,
    });
  } catch (err) {
    console.error('Submission error:', err);
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/submissions/assessment/:id - List submissions (admin)
app.get('/assessment/:id', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM submissions WHERE assessment_id = ? ORDER BY submitted_at DESC'
    ).bind(c.req.param('id')).all();
    return c.json(results);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/submissions/:id - Get single submission with answers
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { results: subs } = await c.env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).all();
    if (subs.length === 0) return c.json({ error: 'Submission not found' }, 404);
    const submission = subs[0];

    const { results: answers } = await c.env.DB.prepare(
      `SELECT a.*, q.question_text, q.type, q.correct_answer, q.options, q.points, q.rubric
       FROM answers a JOIN questions q ON a.question_id = q.id
       WHERE a.submission_id = ? ORDER BY q.order_num ASC`
    ).bind(id).all();

    const parsedAnswers = answers.map(a => ({ ...a, options: a.options ? JSON.parse(a.options) : null }));

    const { results: assessments } = await c.env.DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(submission.assessment_id).all();

    return c.json({
      ...submission,
      assessment_title: assessments.length > 0 ? assessments[0].title : 'Unknown',
      percentage: submission.total > 0 ? Math.round((submission.score / submission.total) * 100) : 0,
      answers: parsedAnswers,
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
