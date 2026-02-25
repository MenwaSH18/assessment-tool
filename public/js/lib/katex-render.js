/**
 * KaTeX rendering utility.
 * Scans DOM elements and renders LaTeX expressions.
 */

function renderMathExpressions(container) {
  if (typeof katex === 'undefined') return;

  // Render elements with data-latex attribute
  const mathEls = (container || document).querySelectorAll('[data-latex]');
  mathEls.forEach(el => {
    try {
      katex.render(el.getAttribute('data-latex'), el, {
        throwOnError: false,
        displayMode: true,
      });
    } catch (e) {
      console.warn('KaTeX render error:', e.message);
    }
  });

  // Render inline math: $...$
  const textNodes = [];
  const walker = document.createTreeWalker(
    container || document.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.includes('$')) {
      textNodes.push(node);
    }
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    // Match $...$ but not $$...$$
    const regex = /\$([^$]+)\$/g;
    if (!regex.test(text)) return;

    const span = document.createElement('span');
    let lastIndex = 0;
    regex.lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        span.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      // Render LaTeX
      const mathSpan = document.createElement('span');
      try {
        katex.render(match[1], mathSpan, { throwOnError: false });
      } catch {
        mathSpan.textContent = match[0];
      }
      span.appendChild(mathSpan);
      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      span.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    if (span.childNodes.length > 0) {
      textNode.parentNode.replaceChild(span, textNode);
    }
  });
}

window.renderMathExpressions = renderMathExpressions;
