# CLAUDE.md - Assessment Tool

## Project Overview

Interactive assessment platform with AI-powered grading. Teachers create assessments, students take them via share codes, and grading is handled automatically (MCQ, T/F, fill-in-the-blank) or via Claude API (open-ended, code, math, diagrams).

## Quick Start

```bash
npm install
cp .env.example .env   # Set ANTHROPIC_API_KEY
npm run dev             # http://localhost:3000
```

- Admin panel: `http://localhost:3000/admin`
- Student access: `http://localhost:3000/take/:shareCode`

## Tech Stack

- **Runtime:** Node.js (CommonJS modules)
- **Framework:** Express 5.x
- **Database:** SQLite via `better-sqlite3` (WAL mode, foreign keys ON)
- **AI:** `@anthropic-ai/sdk` — Claude Sonnet for evaluation
- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **Math rendering:** KaTeX (CDN)
- **Diagram rendering:** Mermaid (CDN)
- **Deployment (alt):** Cloudflare Workers + Hono + D1 (in `src/`)

## Architecture

```
server.js                 → Express entry point (port 3000)
database/db.js            → Schema, prepared statements, exports db module
routes/
  assessments.js          → CRUD for assessments
  questions.js            → CRUD for questions + metadata
  submissions.js          → Student submission, grading logic, admin endpoints
  evaluate.js             → Claude API integration for AI grading
public/                   → Static frontend (served by Express)
  js/admin.js             → Admin panel logic
  js/assessment.js        → Student test-taking
  js/content.js           → AI content generation
  js/results.js           → Results display
  js/components/          → Question renderers
  js/lib/                 → KaTeX and Mermaid helpers
src/                      → Cloudflare Workers version (Hono)
  worker.js               → Hono entry point
  agents/                 → Multi-agent AI system (base, assessment, content)
  lib/                    → Claude client, embeddings, document parser, prompts
  routes/                 → Hono API routes
  queue-handlers/         → Async document processing
```

## Database

**File:** `assessment_tool.db` (SQLite, project root)

**Tables:**
- `assessments` — id, title, description, subject, share_code (UNIQUE), created_at
- `questions` — id, assessment_id (FK), type, question_text, options (JSON), correct_answer, rubric, points, order_num, is_visible
- `question_metadata` — question_id (UNIQUE FK), diagram_mermaid, code_language, code_template, code_solution, test_cases, math_latex, fill_blank_template, fill_blank_answers (JSON array), label_regions, difficulty, topic_tags, bloom_level
- `submissions` — id, assessment_id (FK), student_name, score, total, submitted_at
- `answers` — id, submission_id (FK), question_id (FK), student_answer, is_correct, ai_feedback, points_earned

**Access pattern:** All queries use prepared statements exposed via `db.assessments.*`, `db.questions.*`, `db.metadata.*`, `db.submissions.*`, `db.answers.*`.

**Migrations:** `migrations/0001_expand_question_types.sql` (already applied). The `is_visible` column is added inline via `ALTER TABLE` with try/catch.

## Question Types

| Type | Key | Grading | Notes |
|------|-----|---------|-------|
| Multiple Choice | `mcq` | Auto — exact match (A/B/C/D) | Options stored as JSON |
| True/False | `tf` | Auto — case-insensitive | |
| Fill in the Blank | `fill_blank` | Auto — per-blank partial credit | Template uses `___`, answers are JSON array, student submits pipe-separated |
| Open-Ended | `open` | AI (Claude) | Uses rubric |
| Code Exercise | `code` | AI (Claude) | Has template, solution, test_cases in metadata |
| Math Problem | `math` | AI (Claude) | LaTeX in metadata |
| Diagram Labeling | `diagram_label` | AI (Claude) | Mermaid + label_regions in metadata |

Type validation CHECK constraint in schema: `('mcq', 'open', 'tf', 'fill_blank', 'diagram_label', 'code', 'math')`

## Grading Logic (`routes/submissions.js`)

- **MCQ/TF:** Direct string comparison (case-insensitive)
- **Fill-in-the-blank:** Split student answer by `|`, compare each blank case-insensitively, partial credit = (correct blanks / total blanks) * max points
- **AI-graded types:** POST to `/api/evaluate` which calls Claude API, expects JSON response with `{points_earned, is_correct, feedback}`
- **Fallback:** If API key missing or call fails, records answer for manual review with 0 points

## API Routes

All routes prefixed with `/api/`:
- `/api/assessments` — Standard CRUD
- `/api/questions` — CRUD + `toggle-visibility`, `reorder`, includes metadata upsert
- `/api/submissions` — `take/:code` (student load), `:code/submit` (grade), admin CRUD
- `/api/evaluate` — Single question AI evaluation

Page routes: `/admin`, `/take/:code`, `/results/:submissionId` — serve HTML files.

## Key Conventions

- **No authentication** — Share codes grant access, no user accounts
- **CommonJS** (`require`/`module.exports`) — Not ESM
- **JSON payloads** — 1MB limit via `express.json({ limit: '1mb' })`
- **Error handling** — Try/catch in each route, global error handler in server.js
- **Prepared statements** — All DB access through pre-compiled statements (SQL injection safe)
- **Student-facing data** — `take/:code` endpoint strips correct_answer, rubric, solutions from response
- **Feedback style** — Content-focused, no formatting mentions, encouraging tone

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | No | — | Enables AI grading and content generation |
| `PORT` | No | `3000` | Server port |

## Cloudflare Workers Deployment (`src/`)

Alternative deployment using Hono framework + D1 (SQLite). Configured in `wrangler.toml`:
- **D1** — database binding
- **R2** — file storage (Phase 2)
- **Vectorize** — embeddings for RAG (Phase 2)
- **Workers AI** — document parsing (Phase 2)
- **Queue** — async document processing (Phase 2)

## Common Tasks

**Add a new question type:**
1. Add type string to CHECK constraint in `database/db.js`
2. Add grading logic in `routes/submissions.js` (auto or AI)
3. Add renderer in `public/js/components/question-renderers.js`
4. Add metadata fields if needed to `question_metadata` table
5. Update admin form in `public/js/admin.js`
6. Update `src/lib/question-types.js` for Workers version

**Modify grading behavior:**
- Auto-grading: `routes/submissions.js` lines 99-155
- AI evaluation prompt: `routes/evaluate.js` lines 31-50

**Change AI model:**
- Update model string in `routes/evaluate.js` line 53 (currently `claude-sonnet-4-20250514`)

## Important Notes

- Project path has a space: `Assessment _Tool` — always quote in shell commands
- SQLite DB file is `assessment_tool.db` in project root — not in version control
- No test suite currently exists
- Express 5.x (not 4.x) — some API differences (e.g., `req.params` behavior)
- CORS is enabled globally
