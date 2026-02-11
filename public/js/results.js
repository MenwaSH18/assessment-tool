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

    // Score Summary
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

    // Answer Breakdown
    const breakdown = document.getElementById('answerBreakdown');
    if (!data.answers || data.answers.length === 0) {
      breakdown.innerHTML = '<p class="empty-state">No answers recorded.</p>';
      return;
    }

    breakdown.innerHTML = data.answers.map((a, i) => {
      const options = a.options ? (typeof a.options === 'string' ? JSON.parse(a.options) : a.options) : null;
      return `
        <div class="card result-card ${a.is_correct ? 'result-correct' : 'result-incorrect'}">
          <div class="result-header">
            <span class="question-num">Q${i + 1}</span>
            <span class="badge ${a.type === 'mcq' ? 'badge-blue' : 'badge-green'}">
              ${a.type === 'mcq' ? 'Multiple Choice' : 'Open-Ended'}
            </span>
            <span class="result-points ${a.is_correct ? 'points-earned' : 'points-lost'}">
              ${a.points_earned} / ${a.points} pts
            </span>
          </div>
          <p class="question-text">${escapeHtml(a.question_text)}</p>
          <div class="answer-section">
            <p><strong>Your Answer:</strong> ${a.type === 'mcq' && options
              ? escapeHtml(a.student_answer) + ' - ' + escapeHtml(options[['A','B','C','D'].indexOf(a.student_answer)] || '')
              : escapeHtml(a.student_answer || '(No answer)')
            }</p>
            ${a.type === 'mcq' && a.correct_answer && options ? `
              <p><strong>Correct Answer:</strong> ${escapeHtml(a.correct_answer)} - ${escapeHtml(options[['A','B','C','D'].indexOf(a.correct_answer)] || '')}</p>
            ` : ''}
          </div>
          <div class="feedback-section">
            <p class="feedback-label">Feedback:</p>
            <p class="feedback-text">${escapeHtml(a.ai_feedback)}</p>
          </div>
        </div>
      `;
    }).join('');

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

loadResults();
