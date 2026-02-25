/**
 * Mermaid.js diagram rendering utility.
 * Renders elements with data-mermaid attribute.
 */

async function renderMermaidDiagrams(container) {
  if (typeof mermaid === 'undefined') return;

  const diagrams = (container || document).querySelectorAll('[data-mermaid]');
  if (diagrams.length === 0) return;

  // Initialize mermaid if not already done
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
  });

  for (const el of diagrams) {
    const code = el.getAttribute('data-mermaid');
    if (!code) continue;

    try {
      const id = 'mermaid-' + Math.random().toString(36).slice(2, 9);
      const { svg } = await mermaid.render(id, code);
      el.innerHTML = svg;
      el.classList.add('mermaid-rendered');
    } catch (e) {
      console.warn('Mermaid render error:', e.message);
      el.innerHTML = `<pre class="mermaid-fallback">${el.textContent}</pre>`;
    }
  }
}

window.renderMermaidDiagrams = renderMermaidDiagrams;
