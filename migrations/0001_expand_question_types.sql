-- Migration: Expand questions.type CHECK constraint to support all 7 question types
-- Old constraint: CHECK(type IN ('mcq', 'open'))
-- New constraint: CHECK(type IN ('mcq', 'open', 'tf', 'fill_blank', 'diagram_label', 'code', 'math'))

-- Step 1: Create new table with expanded CHECK constraint
CREATE TABLE questions_new (
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

-- Step 2: Copy existing data
INSERT INTO questions_new SELECT * FROM questions;

-- Step 3: Drop old table
DROP TABLE questions;

-- Step 4: Rename new table
ALTER TABLE questions_new RENAME TO questions;

-- Step 5: Recreate index
CREATE INDEX IF NOT EXISTS idx_questions_assessment ON questions(assessment_id);

-- Step 6: Create question_metadata table if it doesn't exist
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

CREATE INDEX IF NOT EXISTS idx_metadata_question ON question_metadata(question_id);
