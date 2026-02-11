import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';

const app = new Hono();

// Shared evaluate function (used by both endpoint and submissions route)
export async function evaluateAnswer({ question_text, student_answer, correct_answer, rubric, points, apiKey }) {
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

    const systemPrompt = `You are an educational assessment evaluator. Your task is to evaluate a student's answer to a question. Be fair, constructive, and educational in your feedback.

You must respond with ONLY a valid JSON object (no markdown, no extra text) in this exact format:
{
  "points_earned": <number between 0 and ${maxPoints}>,
  "is_correct": <true or false>,
  "feedback": "<constructive feedback explaining what was good and what could be improved>"
}`;

    const userPrompt = `Question: ${question_text}

Expected Answer / Key Points: ${correct_answer || 'Not provided'}

Grading Rubric: ${rubric || 'Evaluate based on accuracy, completeness, and understanding.'}

Student's Answer: ${student_answer}

Maximum Points: ${maxPoints}

Evaluate this answer and provide your assessment as JSON.`;

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
    } catch (parseErr) {
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
  const { question_text, student_answer, correct_answer, rubric, points } = await c.req.json();

  if (!question_text || !student_answer) {
    return c.json({ error: 'question_text and student_answer are required' }, 400);
  }

  const apiKey = c.env.ANTHROPIC_API_KEY;
  const result = await evaluateAnswer({ question_text, student_answer, correct_answer, rubric, points, apiKey });
  return c.json(result);
});

export default app;
