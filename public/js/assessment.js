let assessmentData = null;
const shareCode = window.location.pathname.split('/take/')[1];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function loadAssessment() {
  try {
    const res = await fetch('/api/submissions/take/' + shareCode);
    if (!res.ok) {
      document.getElementById('nameEntry').innerHTML = `
        <div class="error-card">
          <h2>Assessment Not Found</h2>
          <p>This assessment link is invalid or the code does not exist.</p>
          <a href="/" class="btn btn-primary">Go Home</a>
        </div>
      `;
      return;
    }
    assessmentData = await res.json();
    document.getElementById('navTitle').textContent = assessmentData.title;
    document.getElementById('assessmentHeading').textContent = assessmentData.title;

    const totalPoints = assessmentData.questions.reduce((s, q) => s + (q.points || 1), 0);
    const typeCounts = {};
    assessmentData.questions.forEach(q => {
      const label = (window.TYPE_LABELS && window.TYPE_LABELS[q.type]) || q.type;
      typeCounts[label] = (typeCounts[label] || 0) + 1;
    });
    const typeInfo = Object.entries(typeCounts).map(([t, c]) => c + ' ' + t).join(', ');

    document.getElementById('assessmentMeta').textContent =
      assessmentData.questions.length + ' questions | ' + totalPoints + ' total points' +
      (assessmentData.subject ? ' | ' + assessmentData.subject : '') +
      (typeInfo ? ' | ' + typeInfo : '');
  } catch (err) {
    console.error('Failed to load assessment:', err);
    document.getElementById('nameEntry').innerHTML = `
      <div class="error-card">
        <h2>Error</h2>
        <p>Failed to load the assessment. Please try again.</p>
        <a href="/" class="btn btn-primary">Go Home</a>
      </div>
    `;
  }
}

function startAssessment() {
  const name = document.getElementById('studentName').value.trim();
  if (!name) { alert('Please enter your name.'); return; }
  if (!assessmentData || assessmentData.questions.length === 0) {
    alert('This assessment has no questions yet.');
    return;
  }

  document.getElementById('bannerTitle').textContent = assessmentData.title;
  const totalPoints = assessmentData.questions.reduce((s, q) => s + (q.points || 1), 0);
  document.getElementById('bannerMeta').textContent =
    assessmentData.questions.length + ' questions · ' + totalPoints + ' pts' +
    (assessmentData.subject ? ' · ' + assessmentData.subject : '') +
    ' · Student: ' + name;
  const desc = assessmentData.description || '';
  const bannerDesc = document.getElementById('bannerDesc');
  if (desc) {
    bannerDesc.textContent = desc;
    bannerDesc.style.display = 'block';
  } else {
    bannerDesc.style.display = 'none';
  }

  document.getElementById('nameEntry').style.display = 'none';
  document.getElementById('questionsSection').style.display = 'block';
  renderQuestions();
}

function renderQuestions() {
  const container = document.getElementById('questionsContainer');

  if (window.renderStudentQuestion) {
    container.innerHTML = assessmentData.questions.map((q, i) =>
      window.renderStudentQuestion(q, i)
    ).join('');
  } else {
    container.innerHTML = assessmentData.questions.map((q, i) => `
      <div class="card student-question" id="question-${q.id}">
        <div class="question-header">
          <span class="question-num">Q${i + 1}</span>
          <span class="badge badge-blue">${escapeHtml(q.type)}</span>
          <span class="points-badge">${q.points} pt${q.points > 1 ? 's' : ''}</span>
        </div>
        <p class="question-text">${escapeHtml(q.question_text)}</p>
        <textarea class="open-answer" id="answer_${q.id}" rows="5"
          placeholder="Type your answer here..." oninput="updateProgress()"></textarea>
      </div>
    `).join('');
  }

  updateProgress();

  // Render math and diagrams after DOM update
  setTimeout(() => {
    if (window.renderMathExpressions) window.renderMathExpressions(container);
    if (window.renderMermaidDiagrams) window.renderMermaidDiagrams(container);
  }, 100);
}

function updateProgress() {
  const total = assessmentData.questions.length;
  let answered = 0;
  assessmentData.questions.forEach(q => {
    if (window.isQuestionAnswered) {
      if (window.isQuestionAnswered(q)) answered++;
    } else {
      if (q.type === 'mcq' || q.type === 'tf') {
        if (document.querySelector('input[name="q_' + q.id + '"]:checked')) answered++;
      } else {
        const ta = document.getElementById('answer_' + q.id);
        if (ta && ta.value.trim()) answered++;
      }
    }
  });
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressText').textContent = answered + ' of ' + total + ' questions answered';
}

async function submitAssessment() {
  const answers = assessmentData.questions.map(q => {
    let answer = '';
    if (window.getStudentAnswer) {
      answer = window.getStudentAnswer(q);
    } else {
      if (q.type === 'mcq' || q.type === 'tf') {
        const selected = document.querySelector('input[name="q_' + q.id + '"]:checked');
        answer = selected ? selected.value : '';
      } else {
        const ta = document.getElementById('answer_' + q.id);
        answer = ta ? ta.value.trim() : '';
      }
    }
    return { question_id: q.id, answer };
  });

  const unanswered = answers.filter(a => !a.answer).length;
  if (unanswered > 0) {
    if (!confirm('You have ' + unanswered + ' unanswered question(s). Submit anyway?')) return;
  }

  document.getElementById('questionsSection').style.display = 'none';
  document.getElementById('loadingOverlay').style.display = 'flex';
  document.getElementById('submitBtn').disabled = true;

  try {
    const res = await fetch('/api/submissions/' + shareCode + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name: document.getElementById('studentName').value.trim(),
        answers,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Submission failed');
    }

    const result = await res.json();
    window.location.href = '/results/' + result.submission_id;
  } catch (err) {
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('questionsSection').style.display = 'block';
    document.getElementById('submitBtn').disabled = false;
    alert('Submission failed: ' + err.message);
  }
}

loadAssessment();
