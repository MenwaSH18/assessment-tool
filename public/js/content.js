// ============================================================
// Content Management & AI Generation Page
// ============================================================

let selectedFile = null;
let generatedQuestions = [];
let assessmentsList = [];

// ─── Initialization ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadResources();
  loadAssessments();

  // Click to browse files
  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    dropzone.addEventListener('click', () => document.getElementById('fileInput').click());
  }
});

// ─── Upload Tab Switching ────────────────────────────────────

function switchUploadTab(tab) {
  document.querySelectorAll('.upload-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.upload-panel').forEach(p => p.style.display = 'none');

  document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
  document.getElementById(
    tab === 'file' ? 'uploadFilePanel' :
    tab === 'url' ? 'uploadURLPanel' :
    'uploadTextPanel'
  ).style.display = 'block';
}

// Correct tab IDs for switching
function switchUploadTab(tab) {
  document.querySelectorAll('.upload-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.upload-panel').forEach(p => p.style.display = 'none');

  const tabIds = { file: 'tabFile', url: 'tabURL', text: 'tabText' };
  const panelIds = { file: 'uploadFilePanel', url: 'uploadURLPanel', text: 'uploadTextPanel' };

  document.getElementById(tabIds[tab]).classList.add('active');
  document.getElementById(panelIds[tab]).style.display = 'block';
}

// ─── File Handling ───────────────────────────────────────────

function handleDrop(event) {
  event.preventDefault();
  event.target.closest('.upload-dropzone').classList.remove('dragover');
  const files = event.dataTransfer.files;
  if (files.length > 0) setSelectedFile(files[0]);
}

function handleFileSelect(event) {
  if (event.target.files.length > 0) setSelectedFile(event.target.files[0]);
}

function setSelectedFile(file) {
  const validExtensions = ['.pdf', '.docx', '.doc', '.txt'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExtensions.includes(ext)) {
    alert('Unsupported file type. Please upload PDF, DOCX, or TXT files.');
    return;
  }
  selectedFile = file;
  document.getElementById('selectedFileName').textContent = `${file.name} (${formatFileSize(file.size)})`;
  document.getElementById('selectedFile').style.display = 'flex';
  document.getElementById('dropzone').style.display = 'none';
}

function clearSelectedFile() {
  selectedFile = null;
  document.getElementById('selectedFile').style.display = 'none';
  document.getElementById('dropzone').style.display = 'block';
  document.getElementById('fileInput').value = '';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── Upload Actions ──────────────────────────────────────────

async function uploadFile() {
  if (!selectedFile) {
    alert('Please select a file first.');
    return;
  }

  showLoading('Uploading and processing file...');
  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', document.getElementById('fileTitle').value || selectedFile.name);
    const assessmentId = document.getElementById('fileAssessment').value;
    if (assessmentId) formData.append('assessment_id', assessmentId);

    const res = await fetch('/api/content/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    clearSelectedFile();
    document.getElementById('fileTitle').value = '';
    loadResources();
    alert('File uploaded successfully! Processing in background...');
  } catch (err) {
    alert('Upload error: ' + err.message);
  } finally {
    hideLoading();
  }
}

async function submitURL() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) { alert('Please enter a URL.'); return; }

  showLoading('Fetching and processing URL...');
  try {
    const res = await fetch('/api/content/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        title: document.getElementById('urlTitle').value || url,
        assessment_id: document.getElementById('urlAssessment').value || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'URL submission failed');

    document.getElementById('urlInput').value = '';
    document.getElementById('urlTitle').value = '';
    loadResources();
    alert('URL submitted successfully! Processing in background...');
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    hideLoading();
  }
}

async function submitText() {
  const text = document.getElementById('textInput').value.trim();
  if (!text) { alert('Please paste some text.'); return; }

  showLoading('Processing text content...');
  try {
    const res = await fetch('/api/content/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        title: document.getElementById('textTitle').value || 'Text Content',
        assessment_id: document.getElementById('textAssessment').value || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Text submission failed');

    document.getElementById('textInput').value = '';
    document.getElementById('textTitle').value = '';
    loadResources();
    alert('Text submitted successfully! Processing in background...');
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    hideLoading();
  }
}

// ─── Resources List ──────────────────────────────────────────

async function loadResources() {
  try {
    const res = await fetch('/api/content/resources');
    const resources = await res.json();

    const container = document.getElementById('resourceList');
    if (!resources || resources.length === 0) {
      container.innerHTML = '<p class="empty-state">No resources uploaded yet. Upload a file, URL, or paste text above.</p>';
      return;
    }

    container.innerHTML = resources.map(r => `
      <div class="resource-item">
        <div class="resource-header">
          <div class="resource-info">
            <span class="resource-type-icon">${getTypeIcon(r.type)}</span>
            <div>
              <h4 class="resource-title">${escapeHtml(r.title)}</h4>
              <span class="resource-meta">${r.type.toUpperCase()} · ${r.chunk_count || 0} chunks · ${formatDate(r.created_at)}</span>
            </div>
          </div>
          <div class="resource-status">
            <span class="status-badge status-${r.status}">${r.status}</span>
          </div>
        </div>
        ${r.error_message ? `<p class="resource-error">Error: ${escapeHtml(r.error_message)}</p>` : ''}
        <div class="resource-actions">
          <button class="btn btn-ghost btn-sm" onclick="viewResource(${r.id})">View Details</button>
          ${r.status === 'error' ? `<button class="btn btn-ghost btn-sm" onclick="reprocessResource(${r.id})">↻ Reprocess</button>` : ''}
          <button class="btn btn-ghost btn-sm btn-danger" onclick="deleteResource(${r.id})">Delete</button>
        </div>
      </div>
    `).join('');

    // Update resource dropdowns for generation
    updateResourceDropdowns(resources.filter(r => r.status === 'ready'));
  } catch (err) {
    document.getElementById('resourceList').innerHTML =
      `<p class="empty-state error">Failed to load resources: ${err.message}</p>`;
  }
}

function getTypeIcon(type) {
  const icons = { pdf: '📕', docx: '📘', url: '🌐', text: '📝' };
  return icons[type] || '📄';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

async function viewResource(id) {
  try {
    const res = await fetch(`/api/content/resources/${id}`);
    const resource = await res.json();

    const detail = `
      <div class="card" style="margin-top: 1rem;">
        <h3>${escapeHtml(resource.title)}</h3>
        <p><strong>Type:</strong> ${resource.type} · <strong>Status:</strong> ${resource.status} · <strong>Chunks:</strong> ${resource.chunks?.length || 0}</p>
        ${resource.source_url ? `<p><strong>Source URL:</strong> <a href="${resource.source_url}" target="_blank">${resource.source_url}</a></p>` : ''}
        ${resource.raw_text ? `<details><summary>Raw Text Preview (first 500 chars)</summary><pre class="text-preview">${escapeHtml(resource.raw_text.substring(0, 500))}...</pre></details>` : ''}
        ${resource.chunks && resource.chunks.length > 0 ? `
          <details><summary>Chunks (${resource.chunks.length})</summary>
            <div class="chunk-list">
              ${resource.chunks.map(ch => `
                <div class="chunk-item">
                  <span class="chunk-index">#${ch.chunk_index}</span>
                  <span class="chunk-tokens">${ch.token_count} tokens</span>
                </div>
              `).join('')}
            </div>
          </details>
        ` : ''}
        <button class="btn btn-ghost btn-sm" onclick="this.closest('.card').remove()">Close</button>
      </div>
    `;

    // Insert detail card after resource list
    const container = document.getElementById('resourceList');
    const existing = container.querySelector('.resource-detail-card');
    if (existing) existing.remove();
    container.insertAdjacentHTML('afterend', detail);
  } catch (err) {
    alert('Error loading resource: ' + err.message);
  }
}

async function reprocessResource(id) {
  if (!confirm('Reprocess this resource? This will re-parse and re-embed all content.')) return;

  showLoading('Reprocessing resource...');
  try {
    const res = await fetch(`/api/content/resources/${id}/reprocess`, { method: 'POST' });
    if (!res.ok) throw new Error('Reprocessing failed');
    loadResources();
    alert('Reprocessing started!');
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    hideLoading();
  }
}

async function deleteResource(id) {
  if (!confirm('Delete this resource and all its chunks? This cannot be undone.')) return;

  try {
    const res = await fetch(`/api/content/resources/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Deletion failed');
    loadResources();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ─── Assessments Loading ─────────────────────────────────────

async function loadAssessments() {
  try {
    const res = await fetch('/api/assessments');
    assessmentsList = await res.json();

    // Populate all assessment dropdowns
    const selectors = ['fileAssessment', 'urlAssessment', 'textAssessment', 'genAssessment'];
    selectors.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const firstOption = sel.options[0];
      sel.innerHTML = '';
      sel.appendChild(firstOption);
      assessmentsList.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.title;
        sel.appendChild(opt);
      });
    });
  } catch (err) {
    console.error('Failed to load assessments:', err);
  }
}

function updateResourceDropdowns(readyResources) {
  const selectors = ['genResource', 'exResource'];
  selectors.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const firstOption = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(firstOption);
    readyResources.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.title} (${r.type})`;
      sel.appendChild(opt);
    });
  });
}

// ─── Semantic Search ─────────────────────────────────────────

async function performSearch() {
  const query = document.getElementById('searchQuery').value.trim();
  if (!query) { alert('Please enter a search query.'); return; }

  const topK = parseInt(document.getElementById('searchTopK').value) || 5;

  showLoading('Searching...');
  try {
    const res = await fetch('/api/content/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: topK }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');

    const results = data.results || [];
    const container = document.getElementById('searchResultsList');
    const section = document.getElementById('searchResults');

    if (results.length === 0) {
      container.innerHTML = '<p class="empty-state">No matching content found.</p>';
    } else {
      container.innerHTML = results.map((r, i) => `
        <div class="search-result">
          <div class="search-result-header">
            <span class="search-rank">#${i + 1}</span>
            <span class="search-resource">${escapeHtml(r.resource_title || 'Unknown')}</span>
            ${r.score ? `<span class="search-score">Score: ${(r.score * 100).toFixed(1)}%</span>` : ''}
          </div>
          <p class="search-text">${escapeHtml(r.chunk_text?.substring(0, 300))}...</p>
        </div>
      `).join('');
    }

    section.style.display = 'block';
  } catch (err) {
    alert('Search error: ' + err.message);
  } finally {
    hideLoading();
  }
}

// ─── AI Question Generation ──────────────────────────────────

async function generateQuestions() {
  const resourceId = document.getElementById('genResource').value;
  if (!resourceId) { alert('Please select a source resource.'); return; }

  const types = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(cb => cb.value);
  if (types.length === 0) { alert('Please select at least one question type.'); return; }

  const count = parseInt(document.getElementById('genCount').value) || 5;
  const difficulty = document.getElementById('genDifficulty').value;
  const assessmentId = document.getElementById('genAssessment').value;
  const topic = document.getElementById('genTopic').value.trim();

  showLoading('AI is generating questions... This may take a moment.');
  try {
    const body = {
      resource_id: parseInt(resourceId),
      types,
      count,
      difficulty,
      topic: topic || undefined,
    };

    // If assessment selected, save directly
    if (assessmentId) {
      body.assessment_id = parseInt(assessmentId);
    }

    const res = await fetch('/api/generate/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');

    generatedQuestions = data.questions || [];

    if (data.saved_to_assessment) {
      alert(`Successfully generated and saved ${data.generated} questions to the assessment!`);
      document.getElementById('generatedPreview').style.display = 'none';
    } else {
      renderGeneratedPreview(generatedQuestions);
    }
  } catch (err) {
    alert('Generation error: ' + err.message);
  } finally {
    hideLoading();
  }
}

function renderGeneratedPreview(questions) {
  const container = document.getElementById('generatedList');
  const preview = document.getElementById('generatedPreview');
  const actions = document.getElementById('generatedActions');

  if (!questions || questions.length === 0) {
    container.innerHTML = '<p class="empty-state">No questions were generated. Try different parameters.</p>';
    preview.style.display = 'block';
    actions.style.display = 'none';
    return;
  }

  const typeLabels = {
    mcq: 'Multiple Choice', open: 'Open-Ended', tf: 'True/False',
    fill_blank: 'Fill in Blank', code: 'Code Exercise', math: 'Math Problem',
    diagram_label: 'Diagram Labeling'
  };

  container.innerHTML = questions.map((q, i) => `
    <div class="card generated-question" style="margin-bottom: 1rem;">
      <div class="generated-header">
        <span class="badge badge-blue">${typeLabels[q.type] || q.type}</span>
        <span class="badge ${q.metadata?.difficulty === 'easy' ? 'badge-green' : q.metadata?.difficulty === 'hard' ? 'badge-red' : 'badge-orange'}">${q.metadata?.difficulty || 'medium'}</span>
        <span>${q.points || 1} pts</span>
      </div>
      <p class="generated-text"><strong>Q${i + 1}:</strong> ${escapeHtml(q.question_text)}</p>
      ${q.type === 'mcq' && q.options ? `<ul class="generated-options">${q.options.map((o, j) => `<li class="${['A','B','C','D'][j] === q.correct_answer ? 'correct' : ''}">${['A','B','C','D'][j]}. ${escapeHtml(o)}</li>`).join('')}</ul>` : ''}
      ${q.correct_answer ? `<p class="generated-answer"><strong>Answer:</strong> ${escapeHtml(String(q.correct_answer))}</p>` : ''}
      ${q.metadata?.topic_tags?.length > 0 ? `<p class="generated-tags">Tags: ${q.metadata.topic_tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</p>` : ''}
    </div>
  `).join('');

  preview.style.display = 'block';
  actions.style.display = 'flex';
}

async function saveGeneratedToAssessment() {
  const assessmentId = prompt('Enter assessment ID to save questions to:');
  if (!assessmentId) return;

  showLoading('Saving questions to assessment...');
  try {
    // Re-generate with assessment_id to save
    const resourceId = document.getElementById('genResource').value;
    const types = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(cb => cb.value);
    const topic = document.getElementById('genTopic').value.trim();

    // Save each question individually via the questions API
    for (const q of generatedQuestions) {
      const body = {
        assessment_id: parseInt(assessmentId),
        type: q.type,
        question_text: q.question_text,
        correct_answer: q.correct_answer || '',
        points: q.points || 1,
        rubric: q.rubric || '',
        options: q.options || undefined,
        metadata: q.metadata || {},
      };

      await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    alert(`Saved ${generatedQuestions.length} questions to assessment #${assessmentId}!`);
    clearGenerated();
  } catch (err) {
    alert('Save error: ' + err.message);
  } finally {
    hideLoading();
  }
}

function clearGenerated() {
  generatedQuestions = [];
  document.getElementById('generatedPreview').style.display = 'none';
  document.getElementById('generatedList').innerHTML = '';
}

// ─── Worked Examples ─────────────────────────────────────────

async function generateWorkedExample() {
  const topic = document.getElementById('exTopic').value.trim();
  if (!topic) { alert('Please enter a topic.'); return; }

  const resourceId = document.getElementById('exResource').value;

  showLoading('Generating worked example...');
  try {
    const res = await fetch('/api/generate/worked-example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource_id: resourceId ? parseInt(resourceId) : undefined,
        topic,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');

    const ex = data.example;
    const container = document.getElementById('workedExampleResult');

    container.innerHTML = `
      <div class="card worked-example">
        <h3>${escapeHtml(ex.title || 'Worked Example')}</h3>
        <div class="example-section">
          <h4>Problem</h4>
          <p>${escapeHtml(ex.problem || '')}</p>
        </div>
        ${ex.given ? `
          <div class="example-section">
            <h4>Given</h4>
            <ul>${ex.given.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ul>
          </div>
        ` : ''}
        ${ex.find ? `
          <div class="example-section">
            <h4>Find</h4>
            <p>${escapeHtml(ex.find)}</p>
          </div>
        ` : ''}
        ${ex.steps ? `
          <div class="example-section">
            <h4>Solution Steps</h4>
            <div class="example-steps">
              ${ex.steps.map(s => `
                <div class="example-step">
                  <span class="step-number">Step ${s.step}</span>
                  <strong>${escapeHtml(s.title || '')}</strong>
                  <p>${escapeHtml(s.explanation || '')}</p>
                  ${s.math ? `<div class="math-block">${escapeHtml(s.math)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${ex.key_concepts ? `
          <div class="example-section">
            <h4>Key Concepts</h4>
            <ul>${ex.key_concepts.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
          </div>
        ` : ''}
        ${ex.common_mistakes ? `
          <div class="example-section">
            <h4>Common Mistakes to Avoid</h4>
            <ul>${ex.common_mistakes.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
          </div>
        ` : ''}
        ${ex.summary ? `
          <div class="example-section">
            <h4>Summary</h4>
            <p>${escapeHtml(ex.summary)}</p>
          </div>
        ` : ''}
      </div>
    `;

    container.style.display = 'block';
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    hideLoading();
  }
}

// ─── Practice Problems ───────────────────────────────────────

async function generatePracticeProblems() {
  const topic = document.getElementById('exTopic').value.trim();
  if (!topic) { alert('Please enter a topic.'); return; }

  const resourceId = document.getElementById('exResource').value;

  showLoading('Generating practice problems...');
  try {
    const res = await fetch('/api/generate/practice-problems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource_id: resourceId ? parseInt(resourceId) : undefined,
        topic,
        count: 5,
        types: ['mcq', 'open'],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');

    const problems = data.problems || [];
    const container = document.getElementById('practiceProblemsResult');

    if (problems.length === 0) {
      container.innerHTML = '<p class="empty-state">No practice problems generated.</p>';
    } else {
      container.innerHTML = `
        <h3>Practice Problems (${problems.length})</h3>
        ${problems.map((p, i) => `
          <div class="card practice-problem" style="margin-bottom: 1rem;">
            <div class="generated-header">
              <span class="badge ${p.difficulty === 'easy' ? 'badge-green' : p.difficulty === 'hard' ? 'badge-red' : 'badge-orange'}">${p.difficulty}</span>
              <span>${p.points || 1} pts</span>
            </div>
            <p><strong>Q${i + 1}:</strong> ${escapeHtml(p.question_text)}</p>
            ${p.options ? `<ul>${p.options.map((o, j) => `<li>${['A','B','C','D'][j]}. ${escapeHtml(o)}</li>`).join('')}</ul>` : ''}
            <details>
              <summary>Show Hint</summary>
              <p class="hint">${escapeHtml(p.hint || 'No hint available.')}</p>
            </details>
            <details>
              <summary>Show Answer & Explanation</summary>
              <p class="answer"><strong>Answer:</strong> ${escapeHtml(String(p.correct_answer || ''))}</p>
              <p class="explanation">${escapeHtml(p.explanation || '')}</p>
            </details>
          </div>
        `).join('')}
      `;
    }

    container.style.display = 'block';
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    hideLoading();
  }
}

// ─── Loading Overlay ─────────────────────────────────────────

function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'Processing...';
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}
