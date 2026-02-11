-- Assessment Tool - D1 Database Schema

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
  type TEXT NOT NULL CHECK(type IN ('mcq', 'open')),
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

CREATE INDEX IF NOT EXISTS idx_questions_assessment ON questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assessment ON submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_code ON assessments(share_code);
