/**
 * Valid question types and their grading strategies.
 */
export const QUESTION_TYPES = ['mcq', 'open', 'tf', 'fill_blank', 'diagram_label', 'code', 'math'];

export const TYPE_LABELS = {
  mcq: 'Multiple Choice',
  open: 'Open-Ended',
  tf: 'True/False',
  fill_blank: 'Fill in the Blank',
  diagram_label: 'Diagram Labeling',
  code: 'Code Exercise',
  math: 'Math Problem',
};

export const TYPE_BADGE_CLASSES = {
  mcq: 'badge-blue',
  open: 'badge-green',
  tf: 'badge-purple',
  fill_blank: 'badge-orange',
  diagram_label: 'badge-teal',
  code: 'badge-dark',
  math: 'badge-red',
};

/**
 * Validate question data based on type.
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateQuestion(data) {
  const { type, question_text, options, correct_answer, metadata } = data;

  if (!type || !QUESTION_TYPES.includes(type)) {
    return { valid: false, error: `type must be one of: ${QUESTION_TYPES.join(', ')}` };
  }
  if (!question_text || !question_text.trim()) {
    return { valid: false, error: 'question_text is required' };
  }

  switch (type) {
    case 'mcq':
      if (!options || !Array.isArray(options) || options.length < 2 || options.length > 6) {
        return { valid: false, error: 'MCQ requires 2-6 options' };
      }
      if (!correct_answer || !['A', 'B', 'C', 'D', 'E', 'F'].slice(0, options.length).includes(correct_answer.toUpperCase())) {
        return { valid: false, error: `MCQ correct_answer must be one of: ${['A','B','C','D','E','F'].slice(0, options.length).join(', ')}` };
      }
      break;

    case 'tf':
      if (!correct_answer || !['true', 'false'].includes(correct_answer.toLowerCase())) {
        return { valid: false, error: 'T/F correct_answer must be "true" or "false"' };
      }
      break;

    case 'fill_blank':
      if (metadata && metadata.fill_blank_answers) {
        if (!Array.isArray(metadata.fill_blank_answers) || metadata.fill_blank_answers.length === 0) {
          return { valid: false, error: 'fill_blank_answers must be a non-empty array of acceptable answers' };
        }
      }
      break;

    case 'code':
      if (metadata && metadata.code_language && typeof metadata.code_language !== 'string') {
        return { valid: false, error: 'code_language must be a string' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Grade a question deterministically if possible.
 * Returns { graded: true, points_earned, is_correct, feedback } or { graded: false } for AI-required types.
 */
export function gradeQuestion(question, studentAnswer, metadata) {
  const maxPoints = question.points || 1;
  const answer = (studentAnswer || '').trim();

  switch (question.type) {
    case 'mcq': {
      const correct = (question.correct_answer || '').toUpperCase().trim();
      const isCorrect = answer.toUpperCase() === correct;
      return {
        graded: true,
        points_earned: isCorrect ? maxPoints : 0,
        is_correct: isCorrect,
        feedback: isCorrect
          ? 'Well done! Correct answer.'
          : `The correct answer is ${correct}. Review this concept and try again.`,
      };
    }

    case 'tf': {
      const correct = (question.correct_answer || '').toLowerCase().trim();
      const isCorrect = answer.toLowerCase() === correct;
      return {
        graded: true,
        points_earned: isCorrect ? maxPoints : 0,
        is_correct: isCorrect,
        feedback: isCorrect
          ? 'Well done! Correct answer.'
          : `The correct answer is ${correct === 'true' ? 'True' : 'False'}. Review this concept and try again.`,
      };
    }

    case 'fill_blank': {
      // Per-blank partial credit grading
      let expectedAnswers = metadata?.fill_blank_answers
        ? (typeof metadata.fill_blank_answers === 'string' ? JSON.parse(metadata.fill_blank_answers) : metadata.fill_blank_answers)
        : null;

      if (!expectedAnswers || expectedAnswers.length === 0) {
        if (question.correct_answer) {
          expectedAnswers = [question.correct_answer];
        } else {
          return { graded: false };
        }
      }

      // Student answers are pipe-separated: "word1 | word2 | word3"
      const studentParts = answer.split('|').map(s => s.trim());
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

      if (correctCount === totalBlanks) {
        return {
          graded: true,
          points_earned: maxPoints,
          is_correct: true,
          feedback: 'Well done! All answers are correct.',
        };
      } else if (correctCount > 0) {
        const wrong = blankResults.filter(b => !b.correct)
          .map(b => `Blank ${b.blank}: the correct answer is "${b.expected}"`).join('; ');
        return {
          graded: true,
          points_earned: Math.round((correctCount / totalBlanks) * maxPoints * 100) / 100,
          is_correct: false,
          feedback: `You got ${correctCount} out of ${totalBlanks} correct. Review the following: ${wrong}.`,
        };
      } else {
        return {
          graded: true,
          points_earned: 0,
          is_correct: false,
          feedback: `Review this topic and try again. The correct answers are: ${expectedAnswers.join(', ')}.`,
        };
      }
    }

    // These types always require AI evaluation
    case 'open':
    case 'code':
    case 'math':
    case 'diagram_label':
      return { graded: false };

    default:
      return { graded: false };
  }
}
