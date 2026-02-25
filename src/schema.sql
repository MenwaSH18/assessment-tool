-- Assessment Tool - D1 Database Schema
-- Extended with multi-agent educational AI system support

-- =============================================
-- CORE TABLES (existing)
-- =============================================

CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  share_code TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Expanded question types: mcq, open, tf, fill_blank, diagram_label, code, math
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
  is_visible INTEGER DEFAULT 1,
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

-- =============================================
-- QUESTION METADATA (new - per-type data)
-- =============================================

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

-- =============================================
-- STUDENT PERFORMANCE TRACKING (adaptive difficulty)
-- =============================================

CREATE TABLE IF NOT EXISTS student_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name TEXT NOT NULL,
  assessment_id INTEGER NOT NULL,
  topic_tag TEXT NOT NULL,
  questions_attempted INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  current_difficulty TEXT DEFAULT 'medium',
  last_updated TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
);

-- =============================================
-- CONTENT AGENT TABLES
-- =============================================

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('pdf', 'docx', 'url', 'text')),
  r2_key TEXT DEFAULT NULL,
  source_url TEXT DEFAULT NULL,
  raw_text TEXT DEFAULT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS content_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INTEGER DEFAULT 0,
  vectorize_id TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

-- =============================================
-- BACKGROUND JOBS
-- =============================================

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'completed', 'failed')),
  result TEXT DEFAULT NULL,
  error TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT DEFAULT NULL
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_questions_assessment ON questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assessment ON submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_code ON assessments(share_code);
CREATE INDEX IF NOT EXISTS idx_metadata_question ON question_metadata(question_id);
CREATE INDEX IF NOT EXISTS idx_student_perf ON student_performance(student_name, assessment_id);
CREATE INDEX IF NOT EXISTS idx_chunks_resource ON content_chunks(resource_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
