const API = '/api';
let currentAssessmentId = null;

// ---- Utility ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---- Assessment CRUD ----

async function loadAssessments() {
  try {
    const res = await fetch(API + '/assessments');
    const data = await res.json();
    const list = document.getElementById('assessmentList');
    if (data.length === 0) {
      list.innerHTML = '<p class="empty-state">No assessments yet. Create your first one!</p>';
      return;
    }
    list.innerHTML = data.map(a => `
      <div class="card assessment-card" onclick="viewAssessment(${a.id})">
        <div class="card-header">
          <h3>${escapeHtml(a.title)}</h3>
          <span class="badge">${escapeHtml(a.subject || 'General')}</span>
        </div>
        <p style="color:var(--text-muted);font-size:0.9rem;">${escapeHtml(a.description || 'No description')}</p>
        <div class="card-meta">
          <span>${a.questionCount} question${a.questionCount !== 1 ? 's' : ''}</span>
          <span>${a.submissionCount} submission${a.submissionCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="card-actions" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-ghost" onclick="editAssessment(${a.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAssessment(${a.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load assessments:', err);
  }
}

function showCreateForm() {
  document.getElementById('editId').value = '';
  document.getElementById('aTitle').value = '';
  document.getElementById('aSubject').value = '';
  document.getElementById('aDescription').value = '';
  document.getElementById('formTitle').textContent = 'Create New Assessment';
  document.getElementById('assessmentForm').style.display = 'block';
  document.getElementById('aTitle').focus();
}

function hideCreateForm() {
  document.getElementById('assessmentForm').style.display = 'none';
}

async function editAssessment(id) {
  try {
    const res = await fetch(API + '/assessments/' + id);
    const data = await res.json();
    document.getElementById('editId').value = data.id;
    document.getElementById('aTitle').value = data.title;
    document.getElementById('aSubject').value = data.subject || '';
    document.getElementById('aDescription').value = data.description || '';
    document.getElementById('formTitle').textContent = 'Edit Assessment';
    document.getElementById('assessmentForm').style.display = 'block';
    document.getElementById('aTitle').focus();
  } catch (err) {
    console.error('Failed to load assessment:', err);
  }
}

async function saveAssessment() {
  const id = document.getElementById('editId').value;
  const title = document.getElementById('aTitle').value.trim();
  if (!title) { alert('Title is required'); return; }

  const body = {
    title,
    description: document.getElementById('aDescription').value.trim(),
    subject: document.getElementById('aSubject').value.trim(),
  };

  try {
    const url = id ? API + '/assessments/' + id : API + '/assessments';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      hideCreateForm();
      loadAssessments();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to save');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function deleteAssessment(id) {
  if (!confirm('Delete this assessment and all its questions, submissions, and results?')) return;
  try {
    await fetch(API + '/assessments/' + id, { method: 'DELETE' });
    loadAssessments();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

// ---- Assessment Detail View ----

async function viewAssessment(id) {
  currentAssessmentId = id;
  try {
    const res = await fetch(API + '/assessments/' + id);
    const data = await res.json();

    document.getElementById('assessmentListView').style.display = 'none';
    document.getElementById('assessmentDetailView').style.display = 'block';

    const shareUrl = window.location.origin + '/take/' + data.share_code;
    document.getElementById('assessmentInfo').innerHTML = `
      <h2>${escapeHtml(data.title)}</h2>
      <p style="color:var(--text-muted);margin-bottom:0.5rem;">${escapeHtml(data.subject || '')}</p>
      <p>${escapeHtml(data.description || '')}</p>
      <div class="share-section">
        <label>Share with Students:</label>
        <div class="share-link-row">
          <input type="text" value="${shareUrl}" readonly id="shareLink">
          <button class="btn btn-sm btn-secondary" onclick="copyShareLink()">Copy Link</button>
        </div>
        <p class="share-code">Assessment Code: <strong>${data.share_code}</strong></p>
      </div>
    `;

    renderQuestions(data.questions || []);
    loadSubmissions(id);
  } catch (err) {
    console.error('Failed to load assessment:', err);
  }
}

function showListView() {
  document.getElementById('assessmentDetailView').style.display = 'none';
  document.getElementById('assessmentListView').style.display = 'block';
  currentAssessmentId = null;
  hideQuestionForm();
  loadAssessments();
}

function copyShareLink() {
  const input = document.getElementById('shareLink');
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = input.nextElementSibling;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
  });
}

// ---- Question Management ----

function renderQuestions(questions) {
  const container = document.getElementById('questionList');
  if (questions.length === 0) {
    container.innerHTML = '<p class="empty-state">No questions yet. Add your first question!</p>';
    return;
  }
  const total = questions.length;
  container.innerHTML = questions.map((q, i) => {
    const badgeClass = (window.TYPE_BADGE_CLASSES && window.TYPE_BADGE_CLASSES[q.type]) || (q.type === 'mcq' ? 'badge-blue' : 'badge-green');
    const typeLabel = (window.TYPE_LABELS && window.TYPE_LABELS[q.type]) || q.type;

    let details = '';
    if (q.type === 'mcq' && q.options) {
      details = `
        <ul class="options-list">
          ${q.options.map((opt, idx) => `
            <li class="${['A','B','C','D'][idx] === q.correct_answer ? 'correct-option' : ''}">
              <strong>${['A','B','C','D'][idx]}.</strong> ${escapeHtml(opt)}
              ${['A','B','C','D'][idx] === q.correct_answer ? ' &#10003;' : ''}
            </li>
          `).join('')}
        </ul>`;
    } else if (q.type === 'tf') {
      details = `<p style="font-size:0.88rem;color:var(--text-muted);"><strong>Correct Answer:</strong> ${q.correct_answer === 'true' ? 'True' : 'False'}</p>`;
    } else {
      details = '';
      if (q.correct_answer) details += `<p style="font-size:0.88rem;color:var(--text-muted);"><strong>Expected:</strong> ${escapeHtml(q.correct_answer)}</p>`;
      if (q.rubric) details += `<p style="font-size:0.88rem;color:var(--text-muted);"><strong>Rubric:</strong> ${escapeHtml(q.rubric)}</p>`;
    }

    return `
      <div class="card question-card ${q.is_visible === 0 ? 'question-hidden' : ''}">
        <div class="question-header">
          <span class="question-num">Q${i + 1}</span>
          <span class="badge ${badgeClass}">${typeLabel}</span>
          <span class="points-badge">${q.points} pt${q.points > 1 ? 's' : ''}</span>
          ${q.is_visible === 0 ? '<span class="badge badge-hidden">Hidden</span>' : ''}
          <div class="question-controls">
            <button class="btn btn-sm reorder-btn" onclick="moveQuestion(${q.id}, 'up')" title="Move up" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
            <button class="btn btn-sm reorder-btn" onclick="moveQuestion(${q.id}, 'down')" title="Move down" ${i === total - 1 ? 'disabled' : ''}>&#9660;</button>
            <button class="btn btn-sm btn-visibility" onclick="toggleVisibility(${q.id})" title="${q.is_visible === 0 ? 'Show question' : 'Hide question'}">
              ${q.is_visible === 0 ? '&#128065;&#8288;&#8212;' : '&#128065;'}
            </button>
          </div>
        </div>
        <p class="question-text">${escapeHtml(q.question_text)}</p>
        ${details}
        <div class="card-actions">
          <button class="btn btn-sm btn-ghost" onclick="editQuestion(${q.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${q.id})">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

// ---- Visibility Toggle ----
async function toggleVisibility(id) {
  try {
    await fetch(API + '/questions/' + id + '/toggle-visibility', { method: 'PUT' });
    viewAssessment(currentAssessmentId);
  } catch (err) {
    alert('Failed to toggle visibility: ' + err.message);
  }
}

// ---- Reorder Questions ----
async function moveQuestion(id, direction) {
  try {
    const res = await fetch(API + '/questions/' + id + '/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) {
      viewAssessment(currentAssessmentId);
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to reorder');
    }
  } catch (err) {
    alert('Failed to reorder: ' + err.message);
  }
}

// ---- Question Type Toggle ----
const TYPE_FIELD_MAP = {
  mcq: 'mcqFields',
  tf: 'tfFields',
  open: 'openFields',
  fill_blank: 'fillBlankFields',
  code: 'codeFields',
  math: 'mathFields',
  diagram_label: 'diagramFields',
};

function toggleQuestionType() {
  const type = document.getElementById('qType').value;
  // Hide all type-specific fields
  Object.values(TYPE_FIELD_MAP).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Show the relevant fields
  const fieldId = TYPE_FIELD_MAP[type];
  if (fieldId) {
    const el = document.getElementById(fieldId);
    if (el) el.style.display = 'block';
  }
}

function showQuestionForm() {
  document.getElementById('qEditId').value = '';
  document.getElementById('qType').value = 'mcq';
  document.getElementById('qText').value = '';
  document.getElementById('qPoints').value = '1';
  document.getElementById('qDifficulty').value = 'medium';
  document.getElementById('qTopicTags').value = '';

  // MCQ
  document.getElementById('optA').value = '';
  document.getElementById('optB').value = '';
  document.getElementById('optC').value = '';
  document.getElementById('optD').value = '';
  document.getElementById('qCorrect').value = 'A';
  // TF
  document.getElementById('qTFAnswer').value = 'true';
  // Open
  document.getElementById('qExpected').value = '';
  document.getElementById('qRubric').value = '';
  // Fill blank
  document.getElementById('qFillTemplate').value = '';
  document.getElementById('qFillAnswers').value = '';
  // Code
  document.getElementById('qCodeLang').value = 'python';
  document.getElementById('qCodeTemplate').value = '';
  document.getElementById('qCodeSolution').value = '';
  document.getElementById('qTestCases').value = '';
  document.getElementById('qCodeExpected').value = '';
  document.getElementById('qCodeRubric').value = '';
  // Math
  document.getElementById('qMathLatex').value = '';
  document.getElementById('qMathExpected').value = '';
  document.getElementById('qMathRubric').value = '';
  // Diagram
  document.getElementById('qDiagramMermaid').value = '';
  document.getElementById('qLabelRegions').value = '';
  document.getElementById('qDiagramExpected').value = '';
  document.getElementById('qDiagramRubric').value = '';

  document.getElementById('qFormTitle').textContent = 'Add Question';
  toggleQuestionType();
  document.getElementById('questionForm').style.display = 'block';
  document.getElementById('qText').focus();
}

function hideQuestionForm() {
  document.getElementById('questionForm').style.display = 'none';
}

async function editQuestion(id) {
  try {
    const res = await fetch(API + '/assessments/' + currentAssessmentId);
    const data = await res.json();
    const q = data.questions.find(q => q.id === id);
    if (!q) return;

    // Also fetch metadata
    let metadata = null;
    try {
      const metaRes = await fetch(API + '/questions/assessment/' + currentAssessmentId);
      const allQuestions = await metaRes.json();
      const fullQ = allQuestions.find(fq => fq.id === id);
      if (fullQ && fullQ.metadata) metadata = fullQ.metadata;
    } catch { /* ignore */ }

    document.getElementById('qEditId').value = q.id;
    document.getElementById('qType').value = q.type;
    document.getElementById('qText').value = q.question_text;
    document.getElementById('qPoints').value = q.points || 1;
    document.getElementById('qDifficulty').value = (metadata && metadata.difficulty) || 'medium';
    document.getElementById('qTopicTags').value = (metadata && metadata.topic_tags) ? metadata.topic_tags.join(', ') : '';

    // Populate type-specific fields
    switch (q.type) {
      case 'mcq':
        if (q.options) {
          document.getElementById('optA').value = q.options[0] || '';
          document.getElementById('optB').value = q.options[1] || '';
          document.getElementById('optC').value = q.options[2] || '';
          document.getElementById('optD').value = q.options[3] || '';
        }
        document.getElementById('qCorrect').value = q.correct_answer || 'A';
        break;
      case 'tf':
        document.getElementById('qTFAnswer').value = q.correct_answer || 'true';
        break;
      case 'open':
        document.getElementById('qExpected').value = q.correct_answer || '';
        document.getElementById('qRubric').value = q.rubric || '';
        break;
      case 'fill_blank':
        document.getElementById('qFillTemplate').value = (metadata && metadata.fill_blank_template) || '';
        document.getElementById('qFillAnswers').value = (metadata && metadata.fill_blank_answers) ? metadata.fill_blank_answers.join(', ') : (q.correct_answer || '');
        break;
      case 'code':
        document.getElementById('qCodeLang').value = (metadata && metadata.code_language) || 'python';
        document.getElementById('qCodeTemplate').value = (metadata && metadata.code_template) || '';
        document.getElementById('qCodeSolution').value = (metadata && metadata.code_solution) || '';
        document.getElementById('qTestCases').value = (metadata && metadata.test_cases) ? JSON.stringify(metadata.test_cases, null, 2) : '';
        document.getElementById('qCodeExpected').value = q.correct_answer || '';
        document.getElementById('qCodeRubric').value = q.rubric || '';
        break;
      case 'math':
        document.getElementById('qMathLatex').value = (metadata && metadata.math_latex) || '';
        document.getElementById('qMathExpected').value = q.correct_answer || '';
        document.getElementById('qMathRubric').value = q.rubric || '';
        break;
      case 'diagram_label':
        document.getElementById('qDiagramMermaid').value = (metadata && metadata.diagram_mermaid) || '';
        document.getElementById('qLabelRegions').value = (metadata && metadata.label_regions) ? JSON.stringify(metadata.label_regions, null, 2) : '';
        document.getElementById('qDiagramExpected').value = q.correct_answer || '';
        document.getElementById('qDiagramRubric').value = q.rubric || '';
        break;
    }

    document.getElementById('qFormTitle').textContent = 'Edit Question';
    toggleQuestionType();
    document.getElementById('questionForm').style.display = 'block';
    document.getElementById('qText').focus();
  } catch (err) {
    console.error('Failed to load question:', err);
  }
}

async function saveQuestion() {
  const qEditId = document.getElementById('qEditId').value;
  const type = document.getElementById('qType').value;
  const questionText = document.getElementById('qText').value.trim();

  if (!questionText) { alert('Question text is required'); return; }

  const body = {
    assessment_id: currentAssessmentId,
    type,
    question_text: questionText,
    points: parseInt(document.getElementById('qPoints').value) || 1,
    metadata: {
      difficulty: document.getElementById('qDifficulty').value,
      topic_tags: document.getElementById('qTopicTags').value.split(',').map(t => t.trim()).filter(Boolean),
    },
  };

  switch (type) {
    case 'mcq': {
      const optA = document.getElementById('optA').value.trim();
      const optB = document.getElementById('optB').value.trim();
      const optC = document.getElementById('optC').value.trim();
      const optD = document.getElementById('optD').value.trim();
      if (!optA || !optB || !optC || !optD) {
        alert('All 4 MCQ options are required');
        return;
      }
      body.options = [optA, optB, optC, optD];
      body.correct_answer = document.getElementById('qCorrect').value;
      break;
    }
    case 'tf':
      body.correct_answer = document.getElementById('qTFAnswer').value;
      break;
    case 'open':
      body.correct_answer = document.getElementById('qExpected').value.trim();
      body.rubric = document.getElementById('qRubric').value.trim();
      break;
    case 'fill_blank': {
      const fillAnswersStr = document.getElementById('qFillAnswers').value.trim();
      const fillAnswers = fillAnswersStr.split(',').map(a => a.trim()).filter(Boolean);
      body.correct_answer = fillAnswers[0] || '';
      body.metadata.fill_blank_template = document.getElementById('qFillTemplate').value.trim();
      body.metadata.fill_blank_answers = fillAnswers;
      break;
    }
    case 'code':
      body.correct_answer = document.getElementById('qCodeExpected').value.trim();
      body.rubric = document.getElementById('qCodeRubric').value.trim();
      body.metadata.code_language = document.getElementById('qCodeLang').value;
      body.metadata.code_template = document.getElementById('qCodeTemplate').value;
      body.metadata.code_solution = document.getElementById('qCodeSolution').value;
      try {
        const tc = document.getElementById('qTestCases').value.trim();
        body.metadata.test_cases = tc ? JSON.parse(tc) : [];
      } catch {
        alert('Test cases must be valid JSON');
        return;
      }
      break;
    case 'math':
      body.correct_answer = document.getElementById('qMathExpected').value.trim();
      body.rubric = document.getElementById('qMathRubric').value.trim();
      body.metadata.math_latex = document.getElementById('qMathLatex').value.trim();
      break;
    case 'diagram_label':
      body.correct_answer = document.getElementById('qDiagramExpected').value.trim();
      body.rubric = document.getElementById('qDiagramRubric').value.trim();
      body.metadata.diagram_mermaid = document.getElementById('qDiagramMermaid').value;
      try {
        const lr = document.getElementById('qLabelRegions').value.trim();
        body.metadata.label_regions = lr ? JSON.parse(lr) : [];
      } catch {
        alert('Label regions must be valid JSON');
        return;
      }
      break;
  }

  try {
    const url = qEditId ? API + '/questions/' + qEditId : API + '/questions';
    const method = qEditId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      hideQuestionForm();
      viewAssessment(currentAssessmentId);
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to save question');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function deleteQuestion(id) {
  if (!confirm('Delete this question?')) return;
  try {
    await fetch(API + '/questions/' + id, { method: 'DELETE' });
    viewAssessment(currentAssessmentId);
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

// ---- Submissions ----

async function loadSubmissions(assessmentId) {
  try {
    const res = await fetch(API + '/submissions/assessment/' + assessmentId);
    const subs = await res.json();
    const container = document.getElementById('submissionsList');
    if (subs.length === 0) {
      container.innerHTML = '<p class="empty-state">No submissions yet.</p>';
      return;
    }
    container.innerHTML = `
      <table class="submissions-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Score</th>
            <th>Percentage</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${subs.map(s => {
            const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
            const safeName = escapeHtml(s.student_name).replace(/'/g, "\\'");
            return `
              <tr>
                <td>${escapeHtml(s.student_name)}</td>
                <td>${s.score} / ${s.total}</td>
                <td>${pct}%</td>
                <td>${new Date(s.submitted_at + 'Z').toLocaleString()}</td>
                <td>
                  <a href="/results/${s.id}" target="_blank" class="btn btn-sm btn-ghost">View</a>
                  <button class="btn btn-sm btn-ghost" onclick="editStudentName(${s.id}, '${safeName}')">Edit</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteSubmission(${s.id})">Delete</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Failed to load submissions:', err);
  }
}

async function editStudentName(submissionId, currentName) {
  const newName = prompt('Edit student name:', currentName);
  if (newName === null) return;
  if (!newName.trim()) {
    alert('Student name cannot be empty');
    return;
  }
  try {
    const res = await fetch(API + '/submissions/' + submissionId + '/name', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_name: newName.trim() }),
    });
    if (res.ok) {
      loadSubmissions(currentAssessmentId);
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to update name');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function deleteSubmission(submissionId) {
  if (!confirm('Delete this submission? This cannot be undone.')) return;
  try {
    await fetch(API + '/submissions/' + submissionId, { method: 'DELETE' });
    loadSubmissions(currentAssessmentId);
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

async function clearAllSubmissions() {
  if (!confirm('Clear ALL submissions for this assessment? This cannot be undone.')) return;
  try {
    await fetch(API + '/submissions/assessment/' + currentAssessmentId + '/all', { method: 'DELETE' });
    loadSubmissions(currentAssessmentId);
  } catch (err) {
    alert('Failed to clear submissions: ' + err.message);
  }
}

// ---- Init ----
loadAssessments();
