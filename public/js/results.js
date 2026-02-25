const submissionId = window.location.pathname.split('/results/')[1];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function loadResults() {
  try {
    const res = await fetch('/api/submissions/' + submissionId);
    if (!res.ok) throw new Error('Results not found');
    const data = await res.json();

    const pct = data.percentage;
    const gradeClass = pct >= 80 ? 'grade-a' : pct >= 60 ? 'grade-b' : pct >= 40 ? 'grade-c' : 'grade-f';

    document.getElementById('scoreSummary').innerHTML = `
      <h2>${escapeHtml(data.assessment_title)}</h2>
      <p class="student-name">Student: ${escapeHtml(data.student_name)}</p>
      <div class="score-circle ${gradeClass}">
        <span class="score-pct">${pct}%</span>
        <span class="score-raw">${data.score} / ${data.total} points</span>
      </div>
      <p class="submitted-at">Submitted: ${new Date(data.submitted_at + 'Z').toLocaleString()}</p>
      <div style="margin-top:1.5rem;">
        <a href="/" class="btn btn-ghost">Back to Home</a>
      </div>
    `;

    const breakdown = document.getElementById('answerBreakdown');
    if (!data.answers || data.answers.length === 0) {
      breakdown.innerHTML = '<p class="empty-state">No answers recorded.</p>';
      return;
    }

    breakdown.innerHTML = data.answers.map((a, i) => {
      const options = a.options ? (typeof a.options === 'string' ? JSON.parse(a.options) : a.options) : null;
      const badgeClass = (window.TYPE_BADGE_CLASSES && window.TYPE_BADGE_CLASSES[a.type]) || (a.type === 'mcq' ? 'badge-blue' : 'badge-green');
      const typeLabel = (window.TYPE_LABELS && window.TYPE_LABELS[a.type]) || a.type;

      let answerDisplay = '';
      switch (a.type) {
        case 'mcq':
          answerDisplay = `
            <p><strong>Your Answer:</strong> ${options
              ? escapeHtml(a.student_answer) + ' - ' + escapeHtml(options[['A','B','C','D','E','F'].indexOf(a.student_answer)] || '')
              : escapeHtml(a.student_answer || '(No answer)')
            }</p>
            ${a.correct_answer && options ? `
              <p><strong>Correct Answer:</strong> ${escapeHtml(a.correct_answer)} - ${escapeHtml(options[['A','B','C','D','E','F'].indexOf(a.correct_answer)] || '')}</p>
            ` : ''}`;
          break;
        case 'tf':
          answerDisplay = `
            <p><strong>Your Answer:</strong> ${a.student_answer === 'true' ? 'True' : a.student_answer === 'false' ? 'False' : escapeHtml(a.student_answer || '(No answer)')}</p>
            <p><strong>Correct Answer:</strong> ${a.correct_answer === 'true' ? 'True' : 'False'}</p>`;
          break;
        case 'code':
          answerDisplay = `
            <p><strong>Your Code:</strong></p>
            <pre class="code-display">${escapeHtml(a.student_answer || '(No code submitted)')}</pre>`;
          break;
        default:
          answerDisplay = `
            <p><strong>Your Answer:</strong> ${escapeHtml(a.student_answer || '(No answer)')}</p>
            ${a.correct_answer ? `<p><strong>Expected:</strong> ${escapeHtml(a.correct_answer)}</p>` : ''}`;
      }

      return `
        <div class="card result-card ${a.is_correct ? 'result-correct' : 'result-incorrect'}">
          <div class="result-header">
            <span class="question-num">Q${i + 1}</span>
            <span class="badge ${badgeClass}">${typeLabel}</span>
            <span class="result-points ${a.is_correct ? 'points-earned' : 'points-lost'}">
              ${a.points_earned} / ${a.points} pts
            </span>
          </div>
          <p class="question-text">${escapeHtml(a.question_text)}</p>
          <div class="answer-section">
            ${answerDisplay}
          </div>
          <div class="feedback-section">
            <p class="feedback-label">Feedback:</p>
            <p class="feedback-text">${escapeHtml(a.ai_feedback)}</p>
          </div>
        </div>
      `;
    }).join('');

    setTimeout(() => {
      if (window.renderMathExpressions) window.renderMathExpressions(breakdown);
    }, 100);

    // Load AI assessment summary (non-blocking)
    loadAIFeedback();

  } catch (err) {
    document.getElementById('resultsContainer').innerHTML = `
      <div class="card error-card">
        <h2>Results Not Found</h2>
        <p>This submission could not be found or may have been deleted.</p>
        <a href="/" class="btn btn-primary">Go Home</a>
      </div>
    `;
  }
}

async function loadAIFeedback() {
  try {
    const res = await fetch('/api/evaluate/batch-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_id: parseInt(submissionId) }),
    });
    if (!res.ok) return;
    const feedback = await res.json();
    if (feedback.error || !feedback.summary) return;

    const section = document.getElementById('aiFeedbackSection');
    document.getElementById('aiFeedbackSummary').textContent = feedback.summary;

    let details = '';
    if (feedback.strengths && feedback.strengths.length > 0) {
      details += `<div class="feedback-list"><h4>Strengths</h4><ul>${feedback.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>`;
    }
    if (feedback.weaknesses && feedback.weaknesses.length > 0) {
      details += `<div class="feedback-list"><h4>Areas for Improvement</h4><ul>${feedback.weaknesses.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`;
    }
    if (feedback.recommendations && feedback.recommendations.length > 0) {
      details += `<div class="feedback-list"><h4>Recommendations</h4><ul>${feedback.recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul></div>`;
    }
    document.getElementById('aiFeedbackDetails').innerHTML = details;
    section.style.display = 'block';
  } catch {
    // AI feedback is optional - fail silently
  }
}

loadResults();
