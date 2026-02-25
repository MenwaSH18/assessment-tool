import { BaseAgent } from './base-agent.js';
import { ContentAgent } from './content-agent.js';
import { getGenerationSystemPrompt, getGenerationUserPrompt } from '../lib/prompts/assessment-prompts.js';

/**
 * Assessment Agent - handles AI question generation, adaptive difficulty,
 * worked examples, and practice problems.
 */
export class AssessmentAgent extends BaseAgent {
  constructor(env) {
    super(env);
    this.contentAgent = new ContentAgent(env);
  }

  /**
   * Generate questions from resource content using RAG + Claude.
   * @param {Object} options
   * @param {number} options.resource_id - Resource to generate from (optional if text provided)
   * @param {string} options.topic - Focus topic (optional)
   * @param {string[]} options.types - Question types to generate
   * @param {number} options.count - Number of questions
   * @param {string} options.difficulty - easy|medium|hard
   * @param {number} options.assessment_id - Assessment to add questions to (optional)
   * @param {string} options.text - Direct text to generate from (optional)
   * @returns {Promise<Object[]>} Generated questions
   */
  async generateQuestions({ resource_id, topic, types, count, difficulty, assessment_id, text }) {
    if (!this.isAIConfigured) {
      throw new Error('AI is not configured. Set ANTHROPIC_API_KEY in environment.');
    }

    // Step 1: Gather source content
    let sourceContent = '';

    if (text) {
      // Direct text provided
      sourceContent = text;
    } else if (resource_id) {
      // Use RAG to get relevant content from the resource
      if (topic) {
        const searchResults = await this.contentAgent.search(topic, 8, [resource_id]);
        if (searchResults.length > 0) {
          sourceContent = searchResults.map(r => r.chunk_text).join('\n\n---\n\n');
        }
      }

      // If no search results or no topic, get all text from resource
      if (!sourceContent) {
        const { results } = await this.db.prepare(
          'SELECT raw_text FROM resources WHERE id = ?'
        ).bind(resource_id).all();

        if (results.length > 0 && results[0].raw_text) {
          // Truncate to ~8000 tokens (~32000 chars) to fit in context
          sourceContent = results[0].raw_text.substring(0, 32000);
        }
      }
    }

    if (!sourceContent || sourceContent.trim().length === 0) {
      throw new Error('No source content available for question generation.');
    }

    // Step 2: Generate questions via Claude
    const systemPrompt = getGenerationSystemPrompt(types, difficulty, count);
    const userPrompt = getGenerationUserPrompt(sourceContent, topic);

    const generated = await this.ask({
      system: systemPrompt,
      userPrompt,
      maxTokens: 4096,
      fallback: [],
    });

    if (!Array.isArray(generated) || generated.length === 0) {
      throw new Error('Failed to generate questions. AI returned invalid response.');
    }

    // Step 3: Validate and normalize generated questions
    const validQuestions = generated.filter(q => this.validateGeneratedQuestion(q)).map(q => this.normalizeQuestion(q, difficulty));

    // Step 4: If assessment_id provided, save questions to database
    if (assessment_id && validQuestions.length > 0) {
      const savedQuestions = await this.saveGeneratedQuestions(assessment_id, validQuestions);
      return savedQuestions;
    }

    return validQuestions;
  }

  /**
   * Validate a generated question has required fields.
   */
  validateGeneratedQuestion(q) {
    if (!q.type || !q.question_text) return false;
    const validTypes = ['mcq', 'open', 'tf', 'fill_blank', 'diagram_label', 'code', 'math'];
    if (!validTypes.includes(q.type)) return false;

    if (q.type === 'mcq' && (!q.options || q.options.length < 2)) return false;
    if (q.type === 'mcq' && !q.correct_answer) return false;
    if (q.type === 'tf' && !['true', 'false'].includes(String(q.correct_answer).toLowerCase())) return false;

    return true;
  }

  /**
   * Normalize a generated question into our storage format.
   */
  normalizeQuestion(q, defaultDifficulty) {
    const normalized = {
      type: q.type,
      question_text: q.question_text,
      correct_answer: q.correct_answer || '',
      points: q.points || (q.type === 'open' || q.type === 'code' ? 5 : q.type === 'math' ? 3 : 1),
      rubric: q.rubric || '',
      options: null,
      metadata: {
        difficulty: q.difficulty || defaultDifficulty,
        topic_tags: q.topic_tags || [],
      },
    };

    // Type-specific normalization
    switch (q.type) {
      case 'mcq':
        normalized.options = q.options;
        // Ensure correct_answer is A/B/C/D
        if (!['A', 'B', 'C', 'D'].includes(normalized.correct_answer)) {
          // Try to find the correct option index
          const idx = q.options.findIndex(o => o === q.correct_answer);
          if (idx >= 0) {
            normalized.correct_answer = ['A', 'B', 'C', 'D'][idx];
          } else {
            normalized.correct_answer = 'A';
          }
        }
        break;
      case 'tf':
        normalized.options = ['True', 'False'];
        normalized.correct_answer = String(q.correct_answer).toLowerCase();
        break;
      case 'fill_blank':
        normalized.metadata.fill_blank_template = q.fill_blank_template || q.question_text;
        normalized.metadata.fill_blank_answers = q.fill_blank_answers || [q.correct_answer];
        break;
      case 'code':
        normalized.metadata.code_language = q.code_language || 'python';
        normalized.metadata.code_template = q.code_template || '';
        normalized.metadata.code_solution = q.code_solution || '';
        normalized.metadata.test_cases = q.test_cases || [];
        break;
      case 'math':
        normalized.metadata.math_latex = q.math_latex || '';
        break;
      case 'diagram_label':
        normalized.metadata.diagram_mermaid = q.diagram_mermaid || '';
        normalized.metadata.label_regions = q.label_regions || [];
        break;
    }

    return normalized;
  }

  /**
   * Save generated questions to the database for a given assessment.
   */
  async saveGeneratedQuestions(assessmentId, questions) {
    const saved = [];

    for (const q of questions) {
      // Determine options string
      let optionsStr = null;
      if (q.options) {
        optionsStr = JSON.stringify(q.options);
      }

      // Insert question
      const result = await this.db.prepare(
        'INSERT INTO questions (assessment_id, type, question_text, options, correct_answer, points, rubric) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        assessmentId,
        q.type,
        q.question_text,
        optionsStr,
        q.correct_answer,
        q.points,
        q.rubric
      ).run();

      const questionId = result.meta.last_row_id;

      // Save metadata
      if (q.metadata) {
        await this.saveQuestionMetadata(questionId, q.metadata);
      }

      saved.push({
        id: questionId,
        ...q,
      });
    }

    return saved;
  }

  /**
   * Generate variants of an existing question for academic integrity.
   */
  async generateVariants(questionId, count = 3) {
    if (!this.isAIConfigured) {
      throw new Error('AI is not configured.');
    }

    // Fetch original question
    const { results: questions } = await this.db.prepare(
      'SELECT * FROM questions WHERE id = ?'
    ).bind(questionId).all();
    if (questions.length === 0) throw new Error('Question not found');

    const original = questions[0];
    const metadata = await this.getQuestionMetadata(questionId);

    const system = `You are an educational content creator. Create ${count} variant(s) of the given question. Each variant should test the same concept but use different values, wording, or examples.

Respond with ONLY a valid JSON array of question objects. Each object must have:
- "question_text": the variant question
- "correct_answer": the correct answer for this variant
${original.type === 'mcq' ? '- "options": ["A option", "B option", "C option", "D option"]' : ''}
${original.type === 'fill_blank' ? '- "fill_blank_template": "template with _____"\n- "fill_blank_answers": ["answer1", "answer2"]' : ''}
${original.type === 'code' ? '- "code_template": "starter code"\n- "test_cases": [{"input": "...", "expected_output": "..."}]' : ''}
${original.type === 'math' ? '- "math_latex": "LaTeX expression"' : ''}`;

    let userPrompt = `Original Question (${original.type}):\n${original.question_text}\n`;
    if (original.correct_answer) userPrompt += `Correct Answer: ${original.correct_answer}\n`;
    if (original.options) userPrompt += `Options: ${original.options}\n`;
    if (metadata?.code_template) userPrompt += `Code Template:\n${metadata.code_template}\n`;
    if (metadata?.math_latex) userPrompt += `LaTeX: ${metadata.math_latex}\n`;
    userPrompt += `\nGenerate ${count} variant(s) of this question.`;

    const variants = await this.ask({
      system,
      userPrompt,
      maxTokens: 4096,
      fallback: [],
    });

    return Array.isArray(variants) ? variants : [];
  }

  /**
   * Generate a worked example for a topic using resource content.
   */
  async generateWorkedExample({ resource_id, topic }) {
    if (!this.isAIConfigured) {
      throw new Error('AI is not configured.');
    }

    // Get relevant content
    let content = '';
    if (resource_id && topic) {
      const searchResults = await this.contentAgent.search(topic, 5, [resource_id]);
      content = searchResults.map(r => r.chunk_text).join('\n\n');
    } else if (resource_id) {
      const { results } = await this.db.prepare(
        'SELECT raw_text FROM resources WHERE id = ?'
      ).bind(resource_id).all();
      if (results.length > 0) content = results[0].raw_text?.substring(0, 16000) || '';
    }

    const system = `You are an expert STEM educator. Create a comprehensive worked example that teaches a concept step by step. The worked example should:
1. State the problem clearly
2. List given information and what needs to be found
3. Show each solution step with explanations
4. Highlight key concepts and common mistakes
5. Provide a final summary

Respond with ONLY a valid JSON object:
{
  "title": "Worked Example: ...",
  "problem": "The problem statement",
  "given": ["Given item 1", "Given item 2"],
  "find": "What we need to find",
  "steps": [
    {"step": 1, "title": "Step title", "explanation": "Detailed explanation", "math": "Optional LaTeX expression"},
    ...
  ],
  "key_concepts": ["Concept 1", "Concept 2"],
  "common_mistakes": ["Mistake 1", "Mistake 2"],
  "summary": "Brief summary of the solution approach"
}`;

    let userPrompt = '';
    if (topic) userPrompt += `Topic: ${topic}\n\n`;
    if (content) userPrompt += `Reference Material:\n${content}\n\n`;
    userPrompt += 'Create a detailed worked example for this topic.';

    return await this.ask({
      system,
      userPrompt,
      maxTokens: 4096,
      fallback: { title: 'Worked Example', problem: 'Generation failed', steps: [] },
    });
  }

  /**
   * Generate practice problems with progressive difficulty.
   */
  async generatePracticeProblems({ resource_id, topic, count = 5, types = ['mcq', 'open'] }) {
    if (!this.isAIConfigured) {
      throw new Error('AI is not configured.');
    }

    // Get relevant content
    let content = '';
    if (resource_id && topic) {
      const searchResults = await this.contentAgent.search(topic, 6, [resource_id]);
      content = searchResults.map(r => r.chunk_text).join('\n\n');
    } else if (resource_id) {
      const { results } = await this.db.prepare(
        'SELECT raw_text FROM resources WHERE id = ?'
      ).bind(resource_id).all();
      if (results.length > 0) content = results[0].raw_text?.substring(0, 16000) || '';
    }

    // Generate with progressive difficulty
    const easyCount = Math.ceil(count * 0.3);
    const mediumCount = Math.ceil(count * 0.4);
    const hardCount = count - easyCount - mediumCount;

    const system = `You are an expert STEM educator creating practice problems with progressive difficulty.

Generate exactly ${count} practice problems:
- ${easyCount} easy (basic recall/understanding)
- ${mediumCount} medium (application/analysis)
- ${hardCount} hard (synthesis/evaluation)

Respond with ONLY a valid JSON array. Each problem must have:
{
  "type": "<one of: ${types.join(', ')}>",
  "difficulty": "easy|medium|hard",
  "question_text": "...",
  "correct_answer": "...",
  "hint": "A helpful hint for students who are stuck",
  "explanation": "Detailed explanation of the solution",
  "points": <1-5>,
  ${types.includes('mcq') ? '"options": ["A", "B", "C", "D"],' : ''}
  "topic_tags": ["tag1", "tag2"]
}`;

    let userPrompt = '';
    if (topic) userPrompt += `Topic: ${topic}\n\n`;
    if (content) userPrompt += `Reference Material:\n${content}\n\n`;
    userPrompt += `Generate ${count} practice problems with progressive difficulty.`;

    const problems = await this.ask({
      system,
      userPrompt,
      maxTokens: 4096,
      fallback: [],
    });

    return Array.isArray(problems) ? problems : [];
  }

  /**
   * Get the next adaptive question for a student based on performance.
   */
  async getAdaptiveQuestion(assessmentId, studentName) {
    // Get student's performance history
    const { results: performance } = await this.db.prepare(
      'SELECT * FROM student_performance WHERE student_name = ? AND assessment_id = ?'
    ).bind(studentName, assessmentId).all();

    // Calculate overall accuracy
    let totalAttempted = 0;
    let totalCorrect = 0;
    const topicAccuracies = {};

    for (const p of performance) {
      totalAttempted += p.questions_attempted;
      totalCorrect += p.questions_correct;
      topicAccuracies[p.topic_tag] = {
        accuracy: p.questions_attempted > 0 ? p.questions_correct / p.questions_attempted : 0,
        difficulty: p.current_difficulty,
      };
    }

    const overallAccuracy = totalAttempted > 0 ? totalCorrect / totalAttempted : 0.5;

    // Determine target difficulty
    let targetDifficulty = 'medium';
    if (overallAccuracy > 0.8) targetDifficulty = 'hard';
    else if (overallAccuracy < 0.5) targetDifficulty = 'easy';

    // Find weak topics (accuracy < 60%)
    const weakTopics = Object.entries(topicAccuracies)
      .filter(([_, data]) => data.accuracy < 0.6)
      .map(([topic]) => topic);

    // Get available questions from this assessment
    const { results: allQuestions } = await this.db.prepare(
      `SELECT q.*, qm.difficulty, qm.topic_tags
       FROM questions q
       LEFT JOIN question_metadata qm ON q.id = qm.question_id
       WHERE q.assessment_id = ?`
    ).bind(assessmentId).all();

    // Get already answered questions
    const { results: submissions } = await this.db.prepare(
      `SELECT a.question_id FROM answers a
       JOIN submissions s ON a.submission_id = s.id
       WHERE s.assessment_id = ? AND s.student_name = ?`
    ).bind(assessmentId, studentName).all();

    const answeredIds = new Set(submissions.map(s => s.question_id));

    // Filter to unanswered questions
    let candidates = allQuestions.filter(q => !answeredIds.has(q.id));

    if (candidates.length === 0) {
      return { done: true, message: 'All questions completed!' };
    }

    // Score candidates based on difficulty match and weak topic targeting
    const scored = candidates.map(q => {
      let score = 0;
      const qDifficulty = q.difficulty || 'medium';
      const qTopics = q.topic_tags ? (typeof q.topic_tags === 'string' ? JSON.parse(q.topic_tags) : q.topic_tags) : [];

      // Difficulty match
      if (qDifficulty === targetDifficulty) score += 3;
      else if (
        (targetDifficulty === 'medium' && (qDifficulty === 'easy' || qDifficulty === 'hard')) ||
        (targetDifficulty === 'easy' && qDifficulty === 'medium') ||
        (targetDifficulty === 'hard' && qDifficulty === 'medium')
      ) score += 1;

      // Weak topic targeting - prioritize questions on weak topics
      for (const tag of qTopics) {
        if (weakTopics.includes(tag)) score += 2;
      }

      // Add some randomness to avoid always picking the same question
      score += Math.random() * 1.5;

      return { question: q, score };
    });

    // Sort by score descending, pick the best
    scored.sort((a, b) => b.score - a.score);
    const selected = scored[0].question;

    // Parse options if needed
    if (selected.options && typeof selected.options === 'string') {
      try { selected.options = JSON.parse(selected.options); } catch { /* keep as string */ }
    }

    // Get full metadata
    const metadata = await this.getQuestionMetadata(selected.id);

    return {
      done: false,
      question: selected,
      metadata: metadata ? {
        fill_blank_template: metadata.fill_blank_template,
        code_language: metadata.code_language,
        code_template: metadata.code_template,
        math_latex: metadata.math_latex,
        diagram_mermaid: metadata.diagram_mermaid,
        label_regions: metadata.label_regions,
      } : null,
      adaptive_info: {
        target_difficulty: targetDifficulty,
        overall_accuracy: Math.round(overallAccuracy * 100),
        weak_topics: weakTopics,
        questions_remaining: candidates.length,
      },
    };
  }

  /**
   * Update student performance after answering a question.
   */
  async updateStudentPerformance(studentName, assessmentId, questionId, isCorrect) {
    // Get question metadata to find topic tags
    const metadata = await this.getQuestionMetadata(questionId);
    const topicTags = metadata?.topic_tags || ['general'];
    const tags = Array.isArray(topicTags) ? topicTags : ['general'];

    for (const tag of tags) {
      // Check if record exists
      const { results } = await this.db.prepare(
        'SELECT * FROM student_performance WHERE student_name = ? AND assessment_id = ? AND topic_tag = ?'
      ).bind(studentName, assessmentId, tag).all();

      if (results.length > 0) {
        const p = results[0];
        const newAttempted = p.questions_attempted + 1;
        const newCorrect = p.questions_correct + (isCorrect ? 1 : 0);
        const newAccuracy = newCorrect / newAttempted;

        // Adjust difficulty based on accuracy
        let newDifficulty = p.current_difficulty;
        if (newAccuracy > 0.8 && newAttempted >= 3) newDifficulty = 'hard';
        else if (newAccuracy < 0.5 && newAttempted >= 3) newDifficulty = 'easy';
        else if (newAttempted >= 3) newDifficulty = 'medium';

        await this.db.prepare(
          `UPDATE student_performance SET questions_attempted = ?, questions_correct = ?,
           current_difficulty = ?, last_updated = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(newAttempted, newCorrect, newDifficulty, p.id).run();
      } else {
        await this.db.prepare(
          `INSERT INTO student_performance (student_name, assessment_id, topic_tag, questions_attempted, questions_correct, current_difficulty)
           VALUES (?, ?, ?, 1, ?, 'medium')`
        ).bind(studentName, assessmentId, tag, isCorrect ? 1 : 0).run();
      }
    }
  }
}
