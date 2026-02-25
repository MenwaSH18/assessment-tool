/**
 * Question type renderers for both student assessment and admin preview.
 * Each renderer returns HTML string for the given question.
 */

const TYPE_LABELS = {
  mcq: 'Multiple Choice',
  open: 'Open-Ended',
  tf: 'True/False',
  fill_blank: 'Fill in the Blank',
  diagram_label: 'Diagram Labeling',
  code: 'Code Exercise',
  math: 'Math Problem',
};

const TYPE_BADGE_CLASSES = {
  mcq: 'badge-blue',
  open: 'badge-green',
  tf: 'badge-purple',
  fill_blank: 'badge-orange',
  diagram_label: 'badge-teal',
  code: 'badge-dark',
  math: 'badge-red',
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/**
 * Render a question for the student assessment view.
 */
function renderStudentQuestion(q, index) {
  const badge = `<span class="badge ${TYPE_BADGE_CLASSES[q.type] || 'badge-blue'}">${TYPE_LABELS[q.type] || q.type}</span>`;
  const header = `
    <div class="question-header">
      <span class="question-num">Q${index + 1}</span>
      ${badge}
      <span class="points-badge">${q.points} pt${q.points > 1 ? 's' : ''}</span>
    </div>`;

  let body = '';

  switch (q.type) {
    case 'mcq':
      body = renderMCQStudent(q);
      break;
    case 'tf':
      body = renderTFStudent(q);
      break;
    case 'open':
      body = renderOpenStudent(q);
      break;
    case 'fill_blank':
      body = renderFillBlankStudent(q);
      break;
    case 'code':
      body = renderCodeStudent(q);
      break;
    case 'math':
      body = renderMathStudent(q);
      break;
    case 'diagram_label':
      body = renderDiagramLabelStudent(q);
      break;
    default:
      body = renderOpenStudent(q);
  }

  return `
    <div class="card student-question" id="question-${q.id}">
      ${header}
      <p class="question-text">${escapeHtml(q.question_text)}</p>
      ${body}
    </div>`;
}

function renderMCQStudent(q) {
  if (!q.options) return '';
  return `
    <div class="mcq-options">
      ${q.options.map((opt, idx) => `
        <label class="mcq-option" onclick="this.querySelector('input').checked=true; updateProgress();">
          <input type="radio" name="q_${q.id}" value="${['A','B','C','D','E','F'][idx]}">
          <span class="option-letter">${['A','B','C','D','E','F'][idx]}</span>
          <span class="option-text">${escapeHtml(opt)}</span>
        </label>
      `).join('')}
    </div>`;
}

function renderTFStudent(q) {
  return `
    <div class="tf-options">
      <label class="mcq-option" onclick="this.querySelector('input').checked=true; updateProgress();">
        <input type="radio" name="q_${q.id}" value="true">
        <span class="option-letter tf-true">T</span>
        <span class="option-text">True</span>
      </label>
      <label class="mcq-option" onclick="this.querySelector('input').checked=true; updateProgress();">
        <input type="radio" name="q_${q.id}" value="false">
        <span class="option-letter tf-false">F</span>
        <span class="option-text">False</span>
      </label>
    </div>`;
}

function renderOpenStudent(q) {
  return `
    <textarea class="open-answer" id="answer_${q.id}" rows="5"
      placeholder="Type your answer here..." oninput="updateProgress()"></textarea>`;
}

function renderFillBlankStudent(q) {
  const template = q.metadata?.fill_blank_template || q.question_text;
  // Replace _____ with input fields
  const parts = template.split(/_{3,}/);
  if (parts.length <= 1) {
    // No blanks found, just show a text input
    return `
      <div class="fill-blank-container">
        <input type="text" class="fill-blank-input" id="answer_${q.id}"
          placeholder="Type your answer..." oninput="updateProgress()">
      </div>`;
  }

  return `
    <div class="fill-blank-container">
      <p class="fill-blank-template">
        ${parts.map((part, i) => {
          const escaped = escapeHtml(part);
          if (i < parts.length - 1) {
            return `${escaped}<input type="text" class="fill-blank-inline" id="blank_${q.id}_${i}"
              placeholder="..." oninput="updateFillBlankAnswer(${q.id}); updateProgress()">`;
          }
          return escaped;
        }).join('')}
      </p>
      <input type="hidden" id="answer_${q.id}">
    </div>`;
}

function renderCodeStudent(q) {
  const lang = q.metadata?.code_language || 'python';
  const template = q.metadata?.code_template || '';
  return `
    <div class="code-exercise">
      <div class="code-header">
        <span class="code-lang-badge">${escapeHtml(lang)}</span>
      </div>
      <textarea class="code-editor" id="answer_${q.id}" rows="12"
        placeholder="Write your code here..." oninput="updateProgress()"
        spellcheck="false">${escapeHtml(template)}</textarea>
    </div>`;
}

function renderMathStudent(q) {
  const latex = q.metadata?.math_latex || '';
  return `
    <div class="math-question">
      ${latex ? `<div class="math-expression" data-latex="${escapeHtml(latex)}">${escapeHtml(latex)}</div>` : ''}
      <textarea class="open-answer math-answer" id="answer_${q.id}" rows="6"
        placeholder="Show your work and provide your answer..." oninput="updateProgress()"></textarea>
    </div>`;
}

function renderDiagramLabelStudent(q) {
  const mermaid = q.metadata?.diagram_mermaid || '';
  const regions = q.metadata?.label_regions || [];

  return `
    <div class="diagram-label-exercise">
      ${mermaid ? `<div class="mermaid-diagram" data-mermaid="${escapeHtml(mermaid)}">${escapeHtml(mermaid)}</div>` : ''}
      <div class="label-inputs">
        ${regions.length > 0 ? regions.map((r, i) => `
          <div class="label-input-row">
            <span class="label-number">${i + 1}.</span>
            <span class="label-hint">${escapeHtml(r.hint || 'Label ' + (i + 1))}</span>
            <input type="text" class="label-input" id="label_${q.id}_${i}"
              placeholder="Enter label..." oninput="updateDiagramAnswer(${q.id}); updateProgress()">
          </div>
        `).join('') : `
          <textarea class="open-answer" id="answer_${q.id}" rows="5"
            placeholder="Describe the labels for each part of the diagram..." oninput="updateProgress()"></textarea>
        `}
      </div>
      <input type="hidden" id="answer_${q.id}" ${regions.length > 0 ? '' : 'style="display:none"'}>
    </div>`;
}

/**
 * Collect the student's answer for a question.
 */
function getStudentAnswer(q) {
  switch (q.type) {
    case 'mcq': {
      const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
      return selected ? selected.value : '';
    }
    case 'tf': {
      const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
      return selected ? selected.value : '';
    }
    case 'fill_blank': {
      const hidden = document.getElementById('answer_' + q.id);
      return hidden ? hidden.value : '';
    }
    case 'diagram_label': {
      const hidden = document.getElementById('answer_' + q.id);
      if (hidden && hidden.type === 'hidden') return hidden.value;
      const ta = document.getElementById('answer_' + q.id);
      return ta ? ta.value.trim() : '';
    }
    default: {
      const el = document.getElementById('answer_' + q.id);
      return el ? el.value.trim() : '';
    }
  }
}

/**
 * Check if a question has been answered.
 */
function isQuestionAnswered(q) {
  return !!getStudentAnswer(q);
}

/**
 * Combine fill-blank inline inputs into hidden answer field.
 */
function updateFillBlankAnswer(qId) {
  const inputs = document.querySelectorAll(`[id^="blank_${qId}_"]`);
  const values = Array.from(inputs).map(inp => inp.value.trim());
  const hidden = document.getElementById('answer_' + qId);
  if (hidden) hidden.value = values.join(' | ');
}

/**
 * Combine diagram label inputs into hidden answer field.
 */
function updateDiagramAnswer(qId) {
  const inputs = document.querySelectorAll(`[id^="label_${qId}_"]`);
  const values = Array.from(inputs).map((inp, i) => `${i + 1}: ${inp.value.trim()}`);
  const hidden = document.getElementById('answer_' + qId);
  if (hidden) hidden.value = values.join(' | ');
}

/**
 * Get badge HTML for a question type.
 */
function getTypeBadge(type) {
  return `<span class="badge ${TYPE_BADGE_CLASSES[type] || 'badge-blue'}">${TYPE_LABELS[type] || type}</span>`;
}

// Make functions globally available
window.renderStudentQuestion = renderStudentQuestion;
window.getStudentAnswer = getStudentAnswer;
window.isQuestionAnswered = isQuestionAnswered;
window.updateFillBlankAnswer = updateFillBlankAnswer;
window.updateDiagramAnswer = updateDiagramAnswer;
window.getTypeBadge = getTypeBadge;
window.TYPE_LABELS = TYPE_LABELS;
window.TYPE_BADGE_CLASSES = TYPE_BADGE_CLASSES;
