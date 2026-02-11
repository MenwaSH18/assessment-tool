const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

let client;
try {
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch (err) {
  console.warn('Anthropic SDK init warning:', err.message);
}

// POST /api/evaluate - Evaluate a single open-ended answer using Claude
router.post('/', async (req, res) => {
  try {
    const { question_text, student_answer, correct_answer, rubric, points } = req.body;

    if (!question_text || !student_answer) {
      return res.status(400).json({ error: 'question_text and student_answer are required' });
    }

    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_api_key_here') {
      return res.json({
        points_earned: 0,
        is_correct: false,
        feedback: 'AI evaluation is not configured. Please set ANTHROPIC_API_KEY in the .env file.',
      });
    }

    const maxPoints = points || 1;

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

    res.json(evaluation);
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({
      error: 'AI evaluation failed',
      fallback: {
        points_earned: 0,
        is_correct: false,
        feedback: 'AI evaluation is temporarily unavailable. Your answer has been recorded for manual review.',
      },
    });
  }
});

module.exports = router;
