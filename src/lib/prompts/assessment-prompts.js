/**
 * Prompt templates for evaluating different question types.
 */

export function getEvaluationSystemPrompt(type, maxPoints) {
  const base = `You are an educational assessment evaluator for university-level STEM and Computer Science courses. Be fair, constructive, and educational in your feedback.

You must respond with ONLY a valid JSON object (no markdown, no extra text) in this exact format:
{
  "points_earned": <number between 0 and ${maxPoints}>,
  "is_correct": <true or false>,
  "feedback": "<constructive feedback>"
}`;

  const typeSpecific = {
    open: `\n\nEvaluate the student's open-ended answer based on accuracy, completeness, and demonstrated understanding.`,

    code: `\n\nEvaluate the student's code solution. Consider:
- Correctness: Does the code produce the expected output for the given test cases?
- Logic: Is the algorithm/approach correct?
- Edge cases: Does the code handle edge cases?
- Code quality: Is the code readable and well-structured?
Trace through the code mentally to determine if it would produce correct results.`,

    math: `\n\nEvaluate the student's mathematical solution. Consider:
- Is the final answer correct?
- Is the mathematical reasoning/work shown valid?
- Are the steps logically connected?
- Are there any computational errors?
Give partial credit for correct methodology even if the final answer has minor errors.`,

    diagram_label: `\n\nEvaluate the student's diagram labeling response. Compare their labels against the expected labels and positions. Consider:
- Are the labels correct?
- Are they placed in the right regions/positions?
Give partial credit for partially correct labeling.`,

    fill_blank: `\n\nEvaluate the student's fill-in-the-blank answer. The answer may not exactly match the expected answer but could still be correct. Consider:
- Is the answer semantically equivalent to the expected answer?
- Does it demonstrate understanding of the concept?
Give full credit for correct answers even if phrased differently.`,
  };

  return base + (typeSpecific[type] || typeSpecific.open);
}

export function getEvaluationUserPrompt({ type, question_text, student_answer, correct_answer, rubric, points, metadata }) {
  let prompt = `Question: ${question_text}\n\n`;

  if (correct_answer) {
    prompt += `Expected Answer / Key Points: ${correct_answer}\n\n`;
  }

  if (rubric) {
    prompt += `Grading Rubric: ${rubric}\n\n`;
  }

  // Add type-specific context
  if (type === 'code' && metadata) {
    if (metadata.code_language) prompt += `Programming Language: ${metadata.code_language}\n`;
    if (metadata.code_template) prompt += `Starter Code Template:\n${metadata.code_template}\n\n`;
    if (metadata.code_solution) prompt += `Reference Solution:\n${metadata.code_solution}\n\n`;
    if (metadata.test_cases) {
      const cases = typeof metadata.test_cases === 'string' ? JSON.parse(metadata.test_cases) : metadata.test_cases;
      prompt += `Test Cases:\n${cases.map((tc, i) => `  Case ${i + 1}: Input: ${tc.input} → Expected Output: ${tc.expected_output}`).join('\n')}\n\n`;
    }
  }

  if (type === 'math' && metadata?.math_latex) {
    prompt += `Mathematical Expression (LaTeX): ${metadata.math_latex}\n\n`;
  }

  if (type === 'diagram_label' && metadata?.label_regions) {
    const regions = typeof metadata.label_regions === 'string' ? JSON.parse(metadata.label_regions) : metadata.label_regions;
    prompt += `Expected Labels:\n${regions.map(r => `  Region "${r.label}" at position (${r.x}, ${r.y})`).join('\n')}\n\n`;
  }

  if (type === 'fill_blank' && metadata?.fill_blank_answers) {
    const answers = typeof metadata.fill_blank_answers === 'string' ? JSON.parse(metadata.fill_blank_answers) : metadata.fill_blank_answers;
    prompt += `Accepted Answers: ${answers.join(', ')}\n\n`;
  }

  prompt += `Student's Answer: ${student_answer}\n\n`;
  prompt += `Maximum Points: ${points}\n\n`;
  prompt += `Evaluate this answer and provide your assessment as JSON.`;

  return prompt;
}

/**
 * Prompt templates for generating questions from content.
 */
export function getGenerationSystemPrompt(types, difficulty, count) {
  return `You are an expert educational content creator for university-level STEM and Computer Science courses. Generate high-quality assessment questions based on the provided content.

You must respond with ONLY a valid JSON array (no markdown, no extra text) of question objects. Generate exactly ${count} question(s).

Each question object must follow this schema:
{
  "type": "<one of: ${types.join(', ')}>",
  "question_text": "<the question>",
  "correct_answer": "<the correct answer>",
  "points": <1-5>,
  "rubric": "<grading criteria for open/code/math types>",
  ${types.includes('mcq') ? '"options": ["option A", "option B", "option C", "option D"],' : ''}
  ${types.includes('tf') ? '// For T/F: correct_answer should be "true" or "false"' : ''}
  ${types.includes('fill_blank') ? '"fill_blank_template": "<sentence with _____ for blanks>", "fill_blank_answers": ["accepted answer 1", "accepted answer 2"],' : ''}
  ${types.includes('code') ? '"code_language": "<language>", "code_template": "<starter code>", "code_solution": "<reference solution>", "test_cases": [{"input": "...", "expected_output": "..."}],' : ''}
  ${types.includes('math') ? '"math_latex": "<LaTeX expression>",' : ''}
  "difficulty": "${difficulty}",
  "topic_tags": ["<topic1>", "<topic2>"]
}

Guidelines:
- Difficulty: ${difficulty} level (${difficulty === 'easy' ? 'basic recall and understanding' : difficulty === 'medium' ? 'application and analysis' : 'synthesis, evaluation, and complex problem-solving'})
- Questions should be clear, unambiguous, and test meaningful understanding
- For MCQ: provide plausible distractors, not obviously wrong options
- For code: include 2-3 test cases with clear inputs and expected outputs
- For math: use LaTeX notation for mathematical expressions
- Vary question types if multiple types are requested`;
}

export function getGenerationUserPrompt(content, topic) {
  let prompt = '';
  if (topic) {
    prompt += `Focus Topic: ${topic}\n\n`;
  }
  prompt += `Source Content:\n${content}\n\n`;
  prompt += `Generate questions based on the above content.`;
  return prompt;
}
