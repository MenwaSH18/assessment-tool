const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'assessment_tool.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    share_code TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('mcq', 'open', 'tf', 'fill_blank', 'diagram_label', 'code', 'math')),
    question_text TEXT NOT NULL,
    options TEXT DEFAULT NULL,
    correct_answer TEXT DEFAULT NULL,
    rubric TEXT DEFAULT '',
    points INTEGER DEFAULT 1,
    order_num INTEGER DEFAULT 0,
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL,
    student_name TEXT NOT NULL,
    score REAL DEFAULT 0,
    total REAL DEFAULT 0,
    submitted_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    student_answer TEXT DEFAULT '',
    is_correct INTEGER DEFAULT 0,
    ai_feedback TEXT DEFAULT '',
    points_earned REAL DEFAULT 0,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS question_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL UNIQUE,
    diagram_mermaid TEXT DEFAULT NULL,
    code_language TEXT DEFAULT NULL,
    code_template TEXT DEFAULT NULL,
    code_solution TEXT DEFAULT NULL,
    test_cases TEXT DEFAULT NULL,
    math_latex TEXT DEFAULT NULL,
    fill_blank_template TEXT DEFAULT NULL,
    fill_blank_answers TEXT DEFAULT NULL,
    label_regions TEXT DEFAULT NULL,
    difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
    topic_tags TEXT DEFAULT '[]',
    bloom_level TEXT DEFAULT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_questions_assessment ON questions(assessment_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_assessment ON submissions(assessment_id);
  CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_share_code ON assessments(share_code);
  CREATE INDEX IF NOT EXISTS idx_metadata_question ON question_metadata(question_id);

  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('pdf', 'docx', 'text', 'url')),
    raw_text TEXT DEFAULT NULL,
    source_url TEXT DEFAULT NULL,
    file_path TEXT DEFAULT NULL,
    assessment_id INTEGER DEFAULT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'ready', 'error')),
    error_message TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS content_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    token_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_resource ON content_chunks(resource_id);
`);

// Migration: Add is_visible column if it doesn't exist
try {
  db.exec(`ALTER TABLE questions ADD COLUMN is_visible INTEGER DEFAULT 1`);
} catch (e) {
  // Column already exists, ignore
}

// Prepared Statements

// Assessments
const insertAssessment = db.prepare(
  `INSERT INTO assessments (title, description, subject, share_code) VALUES (?, ?, ?, ?)`
);
const getAllAssessments = db.prepare(
  `SELECT * FROM assessments ORDER BY created_at DESC`
);
const getAssessmentById = db.prepare(
  `SELECT * FROM assessments WHERE id = ?`
);
const getAssessmentByCode = db.prepare(
  `SELECT * FROM assessments WHERE share_code = ?`
);
const updateAssessment = db.prepare(
  `UPDATE assessments SET title = ?, description = ?, subject = ? WHERE id = ?`
);
const deleteAssessment = db.prepare(
  `DELETE FROM assessments WHERE id = ?`
);

// Questions
const insertQuestion = db.prepare(
  `INSERT INTO questions (assessment_id, type, question_text, options, correct_answer, rubric, points, order_num, is_visible)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const getQuestionsByAssessment = db.prepare(
  `SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_num ASC`
);
const getQuestionById = db.prepare(
  `SELECT * FROM questions WHERE id = ?`
);
const updateQuestion = db.prepare(
  `UPDATE questions SET type = ?, question_text = ?, options = ?, correct_answer = ?, rubric = ?, points = ?, order_num = ?, is_visible = ?
   WHERE id = ?`
);
const deleteQuestion = db.prepare(
  `DELETE FROM questions WHERE id = ?`
);
const getMaxOrderNum = db.prepare(
  `SELECT COALESCE(MAX(order_num), 0) as max_order FROM questions WHERE assessment_id = ?`
);
const toggleQuestionVisibility = db.prepare(
  `UPDATE questions SET is_visible = CASE WHEN is_visible = 1 THEN 0 ELSE 1 END WHERE id = ?`
);
const getAdjacentQuestion = db.prepare(
  `SELECT * FROM questions WHERE assessment_id = ? AND order_num = ?`
);
const updateQuestionOrder = db.prepare(
  `UPDATE questions SET order_num = ? WHERE id = ?`
);

// Question Metadata
const insertMetadata = db.prepare(
  `INSERT INTO question_metadata (question_id, diagram_mermaid, code_language, code_template, code_solution, test_cases, math_latex, fill_blank_template, fill_blank_answers, label_regions, difficulty, topic_tags, bloom_level)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const getMetadataByQuestion = db.prepare(
  `SELECT * FROM question_metadata WHERE question_id = ?`
);
const updateMetadata = db.prepare(
  `UPDATE question_metadata SET diagram_mermaid = ?, code_language = ?, code_template = ?, code_solution = ?, test_cases = ?, math_latex = ?, fill_blank_template = ?, fill_blank_answers = ?, label_regions = ?, difficulty = ?, topic_tags = ?, bloom_level = ? WHERE question_id = ?`
);
const deleteMetadata = db.prepare(
  `DELETE FROM question_metadata WHERE question_id = ?`
);

// Submissions
const insertSubmission = db.prepare(
  `INSERT INTO submissions (assessment_id, student_name, score, total) VALUES (?, ?, ?, ?)`
);
const getSubmissionsByAssessment = db.prepare(
  `SELECT * FROM submissions WHERE assessment_id = ? ORDER BY submitted_at DESC`
);
const getSubmissionById = db.prepare(
  `SELECT * FROM submissions WHERE id = ?`
);
const updateSubmissionScore = db.prepare(
  `UPDATE submissions SET score = ?, total = ? WHERE id = ?`
);
const updateSubmissionName = db.prepare(
  `UPDATE submissions SET student_name = ? WHERE id = ?`
);
const deleteSubmission = db.prepare(
  `DELETE FROM submissions WHERE id = ?`
);
const deleteSubmissionsByAssessment = db.prepare(
  `DELETE FROM submissions WHERE assessment_id = ?`
);

// Answers
const insertAnswer = db.prepare(
  `INSERT INTO answers (submission_id, question_id, student_answer, is_correct, ai_feedback, points_earned)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const getAnswersBySubmission = db.prepare(
  `SELECT a.*, q.question_text, q.type, q.correct_answer, q.options, q.points, q.rubric
   FROM answers a JOIN questions q ON a.question_id = q.id
   WHERE a.submission_id = ? ORDER BY q.order_num ASC`
);

// Resources
const insertResource = db.prepare(
  `INSERT INTO resources (title, type, raw_text, source_url, file_path, assessment_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const getAllResources = db.prepare(
  `SELECT r.*, COUNT(cc.id) as chunk_count
   FROM resources r LEFT JOIN content_chunks cc ON r.id = cc.resource_id
   GROUP BY r.id ORDER BY r.created_at DESC`
);
const getResourceById = db.prepare(
  `SELECT * FROM resources WHERE id = ?`
);
const updateResourceStatus = db.prepare(
  `UPDATE resources SET status = ?, error_message = ? WHERE id = ?`
);
const updateResourceText = db.prepare(
  `UPDATE resources SET raw_text = ? WHERE id = ?`
);
const deleteResource = db.prepare(
  `DELETE FROM resources WHERE id = ?`
);

// Content Chunks
const insertChunk = db.prepare(
  `INSERT INTO content_chunks (resource_id, chunk_index, chunk_text, token_count) VALUES (?, ?, ?, ?)`
);
const getChunksByResource = db.prepare(
  `SELECT id, chunk_index, token_count FROM content_chunks WHERE resource_id = ? ORDER BY chunk_index`
);
const deleteChunksByResource = db.prepare(
  `DELETE FROM content_chunks WHERE resource_id = ?`
);

module.exports = {
  db,
  assessments: {
    insert: insertAssessment,
    getAll: getAllAssessments,
    getById: getAssessmentById,
    getByCode: getAssessmentByCode,
    update: updateAssessment,
    delete: deleteAssessment,
  },
  questions: {
    insert: insertQuestion,
    getByAssessment: getQuestionsByAssessment,
    getById: getQuestionById,
    update: updateQuestion,
    delete: deleteQuestion,
    getMaxOrderNum: getMaxOrderNum,
    toggleVisibility: toggleQuestionVisibility,
    getAdjacent: getAdjacentQuestion,
    updateOrder: updateQuestionOrder,
  },
  metadata: {
    insert: insertMetadata,
    getByQuestion: getMetadataByQuestion,
    update: updateMetadata,
    delete: deleteMetadata,
  },
  submissions: {
    insert: insertSubmission,
    getByAssessment: getSubmissionsByAssessment,
    getById: getSubmissionById,
    updateScore: updateSubmissionScore,
    updateName: updateSubmissionName,
    delete: deleteSubmission,
    deleteByAssessment: deleteSubmissionsByAssessment,
  },
  answers: {
    insert: insertAnswer,
    getBySubmission: getAnswersBySubmission,
  },
  resources: {
    insert: insertResource,
    getAll: getAllResources,
    getById: getResourceById,
    updateStatus: updateResourceStatus,
    updateText: updateResourceText,
    delete: deleteResource,
  },
  chunks: {
    insert: insertChunk,
    getByResource: getChunksByResource,
    deleteByResource: deleteChunksByResource,
  },
};
