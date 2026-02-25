import { callClaude } from '../lib/claude.js';

/**
 * Base class for all specialized agents.
 * Provides shared utilities for Claude API interaction and structured output.
 */
export class BaseAgent {
  constructor(env) {
    this.env = env;
    this.apiKey = env.ANTHROPIC_API_KEY;
    this.db = env.DB;
  }

  /**
   * Call Claude with a system prompt and user prompt, expecting JSON output.
   */
  async ask({ system, userPrompt, maxTokens = 2048, fallback = null }) {
    return callClaude({
      apiKey: this.apiKey,
      system,
      userPrompt,
      maxTokens,
      fallback,
    });
  }

  /**
   * Check if AI is configured.
   */
  get isAIConfigured() {
    return this.apiKey && this.apiKey !== 'your_api_key_here';
  }

  /**
   * Get question metadata from DB.
   */
  async getQuestionMetadata(questionId) {
    const { results } = await this.db.prepare(
      'SELECT * FROM question_metadata WHERE question_id = ?'
    ).bind(questionId).all();
    if (results.length === 0) return null;
    const meta = results[0];
    // Parse JSON fields
    for (const field of ['test_cases', 'fill_blank_answers', 'label_regions', 'topic_tags']) {
      if (meta[field] && typeof meta[field] === 'string') {
        try { meta[field] = JSON.parse(meta[field]); } catch { /* keep as string */ }
      }
    }
    return meta;
  }

  /**
   * Save or update question metadata.
   */
  async saveQuestionMetadata(questionId, metadata) {
    const fields = {
      diagram_mermaid: metadata.diagram_mermaid || null,
      code_language: metadata.code_language || null,
      code_template: metadata.code_template || null,
      code_solution: metadata.code_solution || null,
      test_cases: metadata.test_cases ? JSON.stringify(metadata.test_cases) : null,
      math_latex: metadata.math_latex || null,
      fill_blank_template: metadata.fill_blank_template || null,
      fill_blank_answers: metadata.fill_blank_answers ? JSON.stringify(metadata.fill_blank_answers) : null,
      label_regions: metadata.label_regions ? JSON.stringify(metadata.label_regions) : null,
      difficulty: metadata.difficulty || 'medium',
      topic_tags: metadata.topic_tags ? JSON.stringify(metadata.topic_tags) : '[]',
      bloom_level: metadata.bloom_level || null,
    };

    // Check if metadata exists
    const { results } = await this.db.prepare(
      'SELECT id FROM question_metadata WHERE question_id = ?'
    ).bind(questionId).all();

    if (results.length > 0) {
      await this.db.prepare(
        `UPDATE question_metadata SET
          diagram_mermaid = ?, code_language = ?, code_template = ?, code_solution = ?,
          test_cases = ?, math_latex = ?, fill_blank_template = ?, fill_blank_answers = ?,
          label_regions = ?, difficulty = ?, topic_tags = ?, bloom_level = ?
        WHERE question_id = ?`
      ).bind(
        fields.diagram_mermaid, fields.code_language, fields.code_template, fields.code_solution,
        fields.test_cases, fields.math_latex, fields.fill_blank_template, fields.fill_blank_answers,
        fields.label_regions, fields.difficulty, fields.topic_tags, fields.bloom_level,
        questionId
      ).run();
    } else {
      await this.db.prepare(
        `INSERT INTO question_metadata (question_id, diagram_mermaid, code_language, code_template, code_solution,
          test_cases, math_latex, fill_blank_template, fill_blank_answers, label_regions, difficulty, topic_tags, bloom_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        questionId,
        fields.diagram_mermaid, fields.code_language, fields.code_template, fields.code_solution,
        fields.test_cases, fields.math_latex, fields.fill_blank_template, fields.fill_blank_answers,
        fields.label_regions, fields.difficulty, fields.topic_tags, fields.bloom_level
      ).run();
    }
  }
}
