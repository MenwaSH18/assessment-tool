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
  container.innerHTML = questions.map((q, i) => `
    <div class="card question-card ${q.is_visible === 0 ? 'question-hidden' : ''}">
      <div class="question-header">
        <span class="question-num">Q${i + 1}</span>
        <span class="badge ${q.type === 'mcq' ? 'badge-blue' : 'badge-green'}">
          ${q.type === 'mcq' ? 'Multiple Choice' : 'Open-Ended'}
        </span>
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
      ${q.type === 'mcq' && q.options ? `
        <ul class="options-list">
          ${q.options.map((opt, idx) => `
            <li class="${['A','B','C','D'][idx] === q.correct_answer ? 'correct-option' : ''}">
              <strong>${['A','B','C','D'][idx]}.</strong> ${escapeHtml(opt)}
              ${['A','B','C','D'][idx] === q.correct_answer ? ' &#10003;' : ''}
            </li>
          `).join('')}
        </ul>
      ` : `
        ${q.correct_answer ? `<p style="font-size:0.88rem;color:var(--text-muted);"><strong>Expected:</strong> ${escapeHtml(q.correct_answer)}</p>` : ''}
        ${q.rubric ? `<p style="font-size:0.88rem;color:var(--text-muted);"><strong>Rubric:</strong> ${escapeHtml(q.rubric)}</p>` : ''}
      `}
      <div class="card-actions">
        <button class="btn btn-sm btn-ghost" onclick="editQuestion(${q.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${q.id})">Delete</button>
      </div>
    </div>
  `).join('');
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

function showQuestionForm() {
  document.getElementById('qEditId').value = '';
  document.getElementById('qType').value = 'mcq';
  document.getElementById('qText').value = '';
  document.getElementById('qPoints').value = '1';
  document.getElementById('optA').value = '';
  document.getElementById('optB').value = '';
  document.getElementById('optC').value = '';
  document.getElementById('optD').value = '';
  document.getElementById('qCorrect').value = 'A';
  document.getElementById('qExpected').value = '';
  document.getElementById('qRubric').value = '';
  document.getElementById('qFormTitle').textContent = 'Add Question';
  toggleQuestionType();
  document.getElementById('questionForm').style.display = 'block';
  document.getElementById('qText').focus();
}

function hideQuestionForm() {
  document.getElementById('questionForm').style.display = 'none';
}

function toggleQuestionType() {
  const type = document.getElementById('qType').value;
  document.getElementById('mcqFields').style.display = type === 'mcq' ? 'block' : 'none';
  document.getElementById('openFields').style.display = type === 'open' ? 'block' : 'none';
}

async function editQuestion(id) {
  try {
    const res = await fetch(API + '/assessments/' + currentAssessmentId);
    const data = await res.json();
    const q = data.questions.find(q => q.id === id);
    if (!q) return;

    document.getElementById('qEditId').value = q.id;
    document.getElementById('qType').value = q.type;
    document.getElementById('qText').value = q.question_text;
    document.getElementById('qPoints').value = q.points || 1;

    if (q.type === 'mcq' && q.options) {
      document.getElementById('optA').value = q.options[0] || '';
      document.getElementById('optB').value = q.options[1] || '';
      document.getElementById('optC').value = q.options[2] || '';
      document.getElementById('optD').value = q.options[3] || '';
      document.getElementById('qCorrect').value = q.correct_answer || 'A';
    } else {
      document.getElementById('qExpected').value = q.correct_answer || '';
      document.getElementById('qRubric').value = q.rubric || '';
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
  };

  if (type === 'mcq') {
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
  } else {
    body.correct_answer = document.getElementById('qExpected').value.trim();
    body.rubric = document.getElementById('qRubric').value.trim();
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${subs.map(s => {
            const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
            return `
              <tr>
                <td>${escapeHtml(s.student_name)}</td>
                <td>${s.score} / ${s.total}</td>
                <td>${pct}%</td>
                <td>${new Date(s.submitted_at + 'Z').toLocaleString()}</td>
                <td><a href="/results/${s.id}" target="_blank" class="btn btn-sm btn-ghost">View</a></td>
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

// ---- Init ----
loadAssessments();
