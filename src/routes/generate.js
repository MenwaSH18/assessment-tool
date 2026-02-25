import { Hono } from 'hono';
import { AssessmentAgent } from '../agents/assessment-agent.js';

const app = new Hono();

// POST /api/generate/questions - Generate questions from a resource
app.post('/questions', async (c) => {
  try {
    const { resource_id, topic, types, count, difficulty, assessment_id } = await c.req.json();

    if (!resource_id) return c.json({ error: 'resource_id is required' }, 400);
    if (!types || !Array.isArray(types) || types.length === 0) {
      return c.json({ error: 'types must be a non-empty array (e.g., ["mcq", "open", "code"])' }, 400);
    }

    const agent = new AssessmentAgent(c.env);
    const questions = await agent.generateQuestions({
      resource_id,
      topic: topic || null,
      types,
      count: count || 5,
      difficulty: difficulty || 'medium',
      assessment_id: assessment_id || null,
    });

    return c.json({
      generated: questions.length,
      questions,
      saved_to_assessment: assessment_id ? true : false,
    }, 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/generate/questions/from-text - Generate questions from pasted text
app.post('/questions/from-text', async (c) => {
  try {
    const { text, topic, types, count, difficulty, assessment_id } = await c.req.json();

    if (!text || text.trim().length === 0) return c.json({ error: 'text is required' }, 400);
    if (!types || !Array.isArray(types) || types.length === 0) {
      return c.json({ error: 'types must be a non-empty array' }, 400);
    }

    const agent = new AssessmentAgent(c.env);
    const questions = await agent.generateQuestions({
      text,
      topic: topic || null,
      types,
      count: count || 5,
      difficulty: difficulty || 'medium',
      assessment_id: assessment_id || null,
    });

    return c.json({
      generated: questions.length,
      questions,
      saved_to_assessment: assessment_id ? true : false,
    }, 201);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/generate/variants/:questionId - Create randomized variants
app.post('/variants/:questionId', async (c) => {
  try {
    const questionId = parseInt(c.req.param('questionId'));
    const { count } = await c.req.json().catch(() => ({ count: 3 }));

    const agent = new AssessmentAgent(c.env);
    const variants = await agent.generateVariants(questionId, count || 3);

    return c.json({ variants });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/generate/worked-example - Generate a worked example for a topic
app.post('/worked-example', async (c) => {
  try {
    const { resource_id, topic } = await c.req.json();

    if (!topic && !resource_id) {
      return c.json({ error: 'At least one of resource_id or topic is required' }, 400);
    }

    const agent = new AssessmentAgent(c.env);
    const example = await agent.generateWorkedExample({
      resource_id: resource_id || null,
      topic: topic || null,
    });

    return c.json({ example });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/generate/practice-problems - Generate practice problem set
app.post('/practice-problems', async (c) => {
  try {
    const { resource_id, topic, count, types } = await c.req.json();

    if (!topic && !resource_id) {
      return c.json({ error: 'At least one of resource_id or topic is required' }, 400);
    }

    const agent = new AssessmentAgent(c.env);
    const problems = await agent.generatePracticeProblems({
      resource_id: resource_id || null,
      topic: topic || null,
      count: count || 5,
      types: types || ['mcq', 'open'],
    });

    return c.json({
      count: problems.length,
      problems,
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/generate/adaptive/:assessmentId/:studentName - Get next adaptive question
app.get('/adaptive/:assessmentId/:studentName', async (c) => {
  try {
    const assessmentId = parseInt(c.req.param('assessmentId'));
    const studentName = decodeURIComponent(c.req.param('studentName'));

    const agent = new AssessmentAgent(c.env);
    const result = await agent.getAdaptiveQuestion(assessmentId, studentName);

    return c.json(result);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/generate/adaptive/update - Update student performance after answering
app.post('/adaptive/update', async (c) => {
  try {
    const { student_name, assessment_id, question_id, is_correct } = await c.req.json();

    if (!student_name || !assessment_id || !question_id) {
      return c.json({ error: 'student_name, assessment_id, and question_id are required' }, 400);
    }

    const agent = new AssessmentAgent(c.env);
    await agent.updateStudentPerformance(
      student_name,
      assessment_id,
      question_id,
      is_correct === true
    );

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
