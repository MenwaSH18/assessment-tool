import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import { getEvaluationSystemPrompt, getEvaluationUserPrompt } from '../lib/prompts/assessment-prompts.js';

const app = new Hono();

/**
 * Evaluate a student's answer using Claude AI.
 * Supports all question types: open, code, math, diagram_label, fill_blank.
 */
export async function evaluateAnswer({ question_text, student_answer, correct_answer, rubric, points, apiKey, type = 'open', metadata = null }) {
  if (!apiKey || apiKey === 'your_api_key_here') {
    return {
      points_earned: 0,
      is_correct: false,
      feedback: 'AI evaluation is not configured. Please set ANTHROPIC_API_KEY.',
    };
  }

  if (!question_text || !student_answer) {
    return {
      points_earned: 0,
      is_correct: false,
      feedback: 'Missing question or answer for evaluation.',
    };
  }

  const maxPoints = points || 1;

  try {
    const client = new Anthropic({ apiKey });

    const systemPrompt = getEvaluationSystemPrompt(type, maxPoints);
    const userPrompt = getEvaluationUserPrompt({
      type,
      question_text,
      student_answer,
      correct_answer,
      rubric,
      points: maxPoints,
      metadata,
    });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const responseText = message.content[0].text.trim();

    let evaluation;
    try {
      evaluation = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        evaluation = {
          points_earned: 0,
          is_correct: false,
          feedback: 'Unable to evaluate automatically. Please review manually.',
        };
      }
    }

    evaluation.points_earned = Math.max(0, Math.min(maxPoints, evaluation.points_earned));
    return evaluation;
  } catch (err) {
    console.error('Claude API error:', err.message);
    return {
      points_earned: 0,
      is_correct: false,
      feedback: 'AI evaluation is temporarily unavailable. Your answer has been recorded for manual review.',
    };
  }
}

// POST /api/evaluate
app.post('/', async (c) => {
  const { question_text, student_answer, correct_answer, rubric, points, type, metadata } = await c.req.json();

  if (!question_text || !student_answer) {
    return c.json({ error: 'question_text and student_answer are required' }, 400);
  }

  const apiKey = c.env.ANTHROPIC_API_KEY;
  const result = await evaluateAnswer({
    question_text, student_answer, correct_answer, rubric, points,
    apiKey, type: type || 'open', metadata: metadata || null,
  });
  return c.json(result);
});

// POST /api/evaluate/batch-feedback - Full assessment feedback summary
app.post('/batch-feedback', async (c) => {
  try {
    const { submission_id } = await c.req.json();
    if (!submission_id) return c.json({ error: 'submission_id is required' }, 400);

    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return c.json({ summary: 'AI feedback not configured.', strengths: [], weaknesses: [], recommendations: [] });
    }

    const { results: subs } = await c.env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(submission_id).all();
    if (subs.length === 0) return c.json({ error: 'Submission not found' }, 404);
    const submission = subs[0];

    const { results: answers } = await c.env.DB.prepare(
      `SELECT a.*, q.question_text, q.type, q.correct_answer, q.points
       FROM answers a JOIN questions q ON a.question_id = q.id
       WHERE a.submission_id = ? ORDER BY q.order_num ASC`
    ).bind(submission_id).all();

    const client = new Anthropic({ apiKey });
    const pct = submission.total > 0 ? Math.round((submission.score / submission.total) * 100) : 0;

    const answerSummary = answers.map((a, i) =>
      `Q${i + 1} (${a.type}): ${a.points_earned}/${a.points} pts - ${a.is_correct ? 'Correct' : 'Incorrect'}`
    ).join('\n');

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are an educational advisor. Analyze a student's assessment performance and provide actionable feedback. Respond with ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Student scored ${submission.score}/${submission.total} (${pct}%).

Results breakdown:
${answerSummary}

Provide a JSON response:
{
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<area for improvement 1>", "<area for improvement 2>"],
  "recommendations": ["<specific study recommendation 1>", "<recommendation 2>"]
}`,
      }],
    });

    const text = message.content[0].text.trim();
    try {
      return c.json(JSON.parse(text));
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      return c.json(match ? JSON.parse(match[0]) : { summary: text, strengths: [], weaknesses: [], recommendations: [] });
    }
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
