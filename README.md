# Assessment Tool

An interactive assessment platform with AI-powered grading, built with Node.js, Express, and SQLite. Supports 7 question types including auto-graded and AI-evaluated formats, with features like partial credit, math equations (KaTeX), and diagram rendering (Mermaid).

## Features

- **7 Question Types** — Multiple choice, true/false, fill-in-the-blank (with partial credit), open-ended, code exercises, math problems, and diagram labeling
- **AI-Powered Grading** — Claude API evaluates open-ended, code, math, and diagram questions with detailed feedback
- **Auto-Grading** — Instant grading for MCQ, true/false, and fill-in-the-blank with case-insensitive matching
- **Share Code System** — Students access assessments via unique share codes (no authentication required)
- **Rich Content** — LaTeX math rendering (KaTeX), diagram support (Mermaid), code templates with syntax highlighting
- **Admin Panel** — Create, edit, and manage assessments, questions, and submissions
- **AI Content Generation** — Generate assessments and questions using AI assistance
- **Responsive Design** — Mobile-friendly student interface

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express 5.x |
| Database | SQLite (better-sqlite3) |
| AI | Claude API (@anthropic-ai/sdk) |
| Frontend | Vanilla HTML/CSS/JS |
| Math | KaTeX |
| Diagrams | Mermaid |

## Project Structure

```
├── server.js                  # Express entry point
├── database/
│   └── db.js                  # SQLite schema & prepared statements
├── routes/
│   ├── assessments.js         # Assessment CRUD
│   ├── questions.js           # Question & metadata management
│   ├── submissions.js         # Student submissions & grading
│   └── evaluate.js            # Claude AI evaluation
├── public/
│   ├── index.html             # Homepage — lists assessments
│   ├── admin.html             # Admin panel
│   ├── assessment.html        # Student test-taking interface
│   ├── results.html           # Results display
│   ├── content.html           # AI content generation
│   ├── css/style.css          # Main stylesheet
│   └── js/
│       ├── admin.js           # Admin panel logic
│       ├── assessment.js      # Test-taking logic
│       ├── content.js         # AI generation UI
│       ├── results.js         # Results display
│       ├── components/
│       │   └── question-renderers.js
│       └── lib/
│           ├── katex-render.js
│           └── mermaid-render.js
├── src/                       # Cloudflare Workers deployment
│   ├── worker.js              # Hono.js entry point
│   ├── agents/                # Multi-agent AI system
│   ├── lib/                   # Shared utilities
│   └── routes/                # Hono API routes
├── migrations/
│   └── 0001_expand_question_types.sql
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone <repo-url>
cd "Assessment _Tool"
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

> The app works without an API key, but AI-powered grading and content generation will be unavailable.

### Running

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The app runs at `http://localhost:3000`.

## Usage

### Admin Panel (`/admin`)

1. Create an assessment with a title, description, and subject
2. Add questions of any supported type
3. Configure metadata (rubrics, code templates, math expressions, etc.)
4. Share the generated code with students

### Student Interface (`/take/:code`)

1. Enter the share code or follow the direct link
2. Fill in your name
3. Answer questions — the interface adapts to each question type
4. Submit to receive instant grades and AI feedback

### Results (`/results/:submissionId`)

Displays score breakdown, per-question feedback, and AI evaluations.

## Question Types

| Type | Key | Grading | Details |
|------|-----|---------|---------|
| Multiple Choice | `mcq` | Auto | Exact match (A/B/C/D) |
| True/False | `tf` | Auto | Case-insensitive match |
| Fill in the Blank | `fill_blank` | Auto | Per-blank partial credit, case-insensitive |
| Open-Ended | `open` | AI | Claude evaluates against rubric |
| Code Exercise | `code` | AI | Supports templates, solutions, test cases |
| Math Problem | `math` | AI | LaTeX rendering, step-by-step evaluation |
| Diagram Labeling | `diagram_label` | AI | Mermaid diagram support |

## API Reference

### Assessments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assessments` | List all assessments |
| POST | `/api/assessments` | Create assessment |
| GET | `/api/assessments/:id` | Get assessment with questions |
| PUT | `/api/assessments/:id` | Update assessment |
| DELETE | `/api/assessments/:id` | Delete assessment (cascades) |

### Questions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/questions/assessment/:id` | Get questions by assessment |
| POST | `/api/questions` | Create question with metadata |
| PUT | `/api/questions/:id` | Update question |
| PUT | `/api/questions/:id/toggle-visibility` | Show/hide question |
| PUT | `/api/questions/:id/reorder` | Reorder question |
| DELETE | `/api/questions/:id` | Delete question |

### Submissions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/submissions/take/:code` | Load assessment for student |
| POST | `/api/submissions/:code/submit` | Submit answers |
| GET | `/api/submissions/assessment/:id` | Get all submissions |
| GET | `/api/submissions/:id` | Get single submission |
| DELETE | `/api/submissions/:id` | Delete submission |

### Evaluate

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/evaluate` | AI evaluation for open-ended answers |

## Database Schema

```sql
assessments    (id, title, description, subject, share_code, created_at)
questions      (id, assessment_id, type, question_text, options, correct_answer, rubric, points, order_num, is_visible)
question_metadata (id, question_id, diagram_mermaid, code_language, code_template, code_solution, test_cases, math_latex, fill_blank_template, fill_blank_answers, label_regions, difficulty, topic_tags, bloom_level)
submissions    (id, assessment_id, student_name, score, total, submitted_at)
answers        (id, submission_id, question_id, student_answer, is_correct, ai_feedback, points_earned)
```

## License

ISC
