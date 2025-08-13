window.__STYLE_DUMPER__ = function(params) {
  const {
    selector = null,
    use$0 = true,
    mode = 'all', // 'all' | 'rules'
    children = true,
    pseudo = true,
    html = false,
    inline = false
  } = params || {};

  // Baseline UA defaults for noise filtering in 'rules' mode
  let __baselineIframe = null;
  const __baselineByTag = new Map(); // tagName -> { prop: value }
  const __baselinePseudoByTag = new Map(); // `${tagName}|${which}` -> { prop: value }

  function ensureBaselineIframe() {
    if (__baselineIframe && __baselineIframe.contentWindow && __baselineIframe.contentDocument) return __baselineIframe;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.src = 'about:blank';
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;';
    (document.documentElement || document.body).appendChild(iframe);
    __baselineIframe = iframe;
    return __baselineIframe;
  }

  function getBaselineForTag(tagName) {
    const key = String(tagName || 'div').toLowerCase();
    if (__baselineByTag.has(key)) return __baselineByTag.get(key);
    const frame = ensureBaselineIframe();
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    const el = doc.createElement(key);
    doc.body.appendChild(el);
    const cs = win.getComputedStyle(el);
    const base = {};
    for (const p of cs) base[p] = cs.getPropertyValue(p);
    doc.body.removeChild(el);
    __baselineByTag.set(key, base);
    return base;
  }

  function getBaselineForTagPseudo(tagName, which /* '::before' | '::after' */) {
    const t = String(tagName || 'div').toLowerCase();
    const key = `${t}|${which}`;
    if (__baselinePseudoByTag.has(key)) return __baselinePseudoByTag.get(key);
    const frame = ensureBaselineIframe();
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    const el = doc.createElement(t);
    doc.body.appendChild(el);
    const cs = win.getComputedStyle(el, which);
    const base = {};
    for (const p of cs) base[p] = cs.getPropertyValue(p);
    doc.body.removeChild(el);
    __baselinePseudoByTag.set(key, base);
    return base;
  }

  function pickRoot() {
    if (selector) return document.querySelector(selector);
    if (use$0 && window.$0 instanceof Element) return $0;
    return document.body;
  }

  function cssPath(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = []; let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList.length) part += '.' + [...cur.classList].map(CSS.escape).join('.');
      const sibs = cur.parentElement ? [...cur.parentElement.children].filter(n => n.tagName === cur.tagName) : [];
      if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      parts.unshift(part); cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function toObj(cs) { const o = {}; for (const p of cs) o[p] = cs.getPropertyValue(p); return o; }

  function rulesProps(el) {
    const set = new Set();
    // Add inline styles (explicit)
    for (let i = 0; i < el.style.length; i++) set.add(el.style[i]);
    // Traverse stylesheets looking only at explicitly declared properties
    function walk(rules) {
      for (const r of rules) {
        if (r.type === CSSRule.STYLE_RULE) {
          try {
            if (el.matches(r.selectorText)) {
              const cssText = r.style && r.style.cssText;
              if (cssText) {
                const declarations = cssText.split(';');
                for (let i = 0; i < declarations.length; i++) {
                  const d = declarations[i];
                  if (!d) continue;
                  const idx = d.indexOf(':');
                  if (idx > 0) {
                    const prop = d.slice(0, idx).trim();
                    if (prop) set.add(prop);
                  }
                }
              } else {
                // Fallback: iterate style declaration names actually present
                for (let i = 0; i < r.style.length; i++) set.add(r.style[i]);
              }
            }
          } catch {}
        } else if (r.type === CSSRule.MEDIA_RULE) {
          try { if (matchMedia(r.media.mediaText).matches) walk(r.cssRules); } catch {}
        } else if (r.type === CSSRule.SUPPORTS_RULE) {
          try { if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports(r.conditionText)) walk(r.cssRules); } catch {}
        } else if ('cssRules' in r && r.cssRules) {
          try { walk(r.cssRules); } catch {}
        }
      }
    }
    for (const sheet of document.styleSheets) { try { if (sheet.cssRules) walk(sheet.cssRules); } catch {} }
    return set;
  }

  function rulesPropsPseudo(el, which /* '::before' | '::after' */) {
    const set = new Set();
    function addFromRuleStyle(styleDecl) {
      if (!styleDecl) return;
      const cssText = styleDecl.cssText || '';
      if (cssText) {
        const parts = cssText.split(';');
        for (let i = 0; i < parts.length; i++) {
          const d = parts[i]; if (!d) continue;
          const idx = d.indexOf(':');
          if (idx > 0) { const prop = d.slice(0, idx).trim(); if (prop) set.add(prop); }
        }
        return;
      }
      for (let i = 0; i < styleDecl.length; i++) set.add(styleDecl[i]);
    }
    function walk(rules) {
      for (const r of rules) {
        if (r.type === CSSRule.STYLE_RULE) {
          try {
            // Check each selector in the list; if it has the pseudo and the base matches el
            const list = (r.selectorText || '').split(',');
            for (let i = 0; i < list.length; i++) {
              const sel = list[i].trim();
              if (!sel) continue;
              // Support both ::before and :before forms
              if (sel.includes(which) || sel.includes(which.replace('::', ':'))) {
                const baseSel = sel.replace(/:(:)?(before|after)/g, '');
                try { if (baseSel && el.matches(baseSel)) { addFromRuleStyle(r.style); break; } } catch {}
              }
            }
          } catch {}
        } else if (r.type === CSSRule.MEDIA_RULE) {
          try { if (matchMedia(r.media.mediaText).matches) walk(r.cssRules); } catch {}
        } else if (r.type === CSSRule.SUPPORTS_RULE) {
          try { if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports(r.conditionText)) walk(r.cssRules); } catch {}
        } else if ('cssRules' in r && r.cssRules) {
          try { walk(r.cssRules); } catch {}
        }
      }
    }
    for (const sheet of document.styleSheets) { try { if (sheet.cssRules) walk(sheet.cssRules); } catch {} }
    return set;
  }

  function computedSubset(el, props) {
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) {
      if (p.startsWith('--')) {
        const vv = cs.getPropertyValue(p);
        if (vv !== '') out[p] = vv;
        continue;
      }
      const v = cs.getPropertyValue(p);
      if (v !== '') out[p] = v;
    }
    return out;
  }

  function computedSubsetPseudo(el, props, which /* '::before' | '::after' */) {
    const cs = getComputedStyle(el, which);
    const out = {};
    for (const p of props) {
      if (p.startsWith('--')) {
        const vv = cs.getPropertyValue(p);
        if (vv !== '') out[p] = vv;
        continue;
      }
      const v = cs.getPropertyValue(p);
      if (v !== '') out[p] = v;
    }
    return out;
  }

  // Keep pseudo output lean by allowing only common visual/layout properties
  const ALLOWED_PSEUDO_PREFIXES = [
    'content', 'display', 'position', 'top', 'right', 'bottom', 'left', 'inset',
    'z-index', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'padding', 'background', 'color', 'opacity', 'box-shadow', 'filter',
    'mix-blend-mode', 'pointer-events', 'transform', 'translate', 'scale', 'rotate',
    'transform-origin', 'transform-style', 'perspective', 'perspective-origin',
    'border', 'outline', 'clip', 'clip-path', 'mask', 'shape-', 'text-shadow',
    'box-sizing'
  ];

  function filterAllowedPropsMap(obj) {
    const out = {};
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      for (let i = 0; i < ALLOWED_PSEUDO_PREFIXES.length; i++) {
        const prefix = ALLOWED_PSEUDO_PREFIXES[i];
        if (k === prefix || k.startsWith(prefix + '-') ) { out[k] = obj[k]; break; }
      }
    }
    return out;
  }

  function collect(el) {
    let styles;
    if (mode === 'rules') {
      styles = computedSubset(el, rulesProps(el));
      // Filter out values equal to UA baseline to reduce noise
      try {
        const base = getBaselineForTag(el.tagName.toLowerCase());
        const filtered = {};
        for (const k in styles) {
          if (!Object.prototype.hasOwnProperty.call(styles, k)) continue;
          const v = styles[k];
          if (base[k] !== v) filtered[k] = v;
        }
        styles = filtered;
      } catch {}
    }
    else styles = toObj(getComputedStyle(el));

    const res = {
      path: cssPath(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      class: el.className || null,
      text_preview: (el.textContent || '').trim().slice(0, 160),
      styles,
      pseudo: {}
    };
    if (pseudo) {
      if (mode === 'rules') {
        try {
          const beforeProps = rulesPropsPseudo(el, '::before');
          const afterProps = rulesPropsPseudo(el, '::after');
          let before = computedSubsetPseudo(el, beforeProps, '::before');
          let after = computedSubsetPseudo(el, afterProps, '::after');
          // Filter by pseudo baselines
          try {
            const baseBefore = getBaselineForTagPseudo(el.tagName.toLowerCase(), '::before');
            const filteredBefore = {};
            for (const k in before) { if (baseBefore[k] !== before[k]) filteredBefore[k] = before[k]; }
            before = filteredBefore;
          } catch {}
          try {
            const baseAfter = getBaselineForTagPseudo(el.tagName.toLowerCase(), '::after');
            const filteredAfter = {};
            for (const k in after) { if (baseAfter[k] !== after[k]) filteredAfter[k] = after[k]; }
            after = filteredAfter;
          } catch {}
          // Keep only allowed pseudo-relevant properties
          before = filterAllowedPropsMap(before);
          after = filterAllowedPropsMap(after);
          res.pseudo['::before'] = before;
          res.pseudo['::after'] = after;
        } catch {
          res.pseudo['::before'] = {};
          res.pseudo['::after'] = {};
        }
      } else {
        res.pseudo['::before'] = toObj(getComputedStyle(el, '::before'));
        res.pseudo['::after']  = toObj(getComputedStyle(el, '::after'));
      }
    }
    return res;
  }

  const root = pickRoot();
  if (!root) return { error: 'No root element found' };
  const nodes = children ? [root, ...root.querySelectorAll('*')] : [root];
  const t0 = performance.now();
  const result = nodes.map(collect);
  const stats = { nodeCount: nodes.length, durationMs: Math.round(performance.now()-t0) };

  if (!html) {
    if (__baselineIframe && __baselineIframe.parentNode) { try { __baselineIframe.parentNode.removeChild(__baselineIframe); } catch {} }
    return { target: { source: selector ? 'selector' : (use$0 ? '$0' : 'body'), selector }, mode, includeChildren: children, nodes: result, stats };
  }

  // HTML export (optional): clone + inline styles
  const clone = root.cloneNode(true);
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  let i = 0;
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const original = result[i++];
    if (!original) break;
    const styleStr = Object.entries(original.styles).map(([k,v]) => `${k}: ${v};`).join(' ');
    el.setAttribute('style', (el.getAttribute('style') || '') + (styleStr ? (' ' + styleStr) : ''));
  }
  if (__baselineIframe && __baselineIframe.parentNode) { try { __baselineIframe.parentNode.removeChild(__baselineIframe); } catch {} }
  return { target: { source: selector ? 'selector' : (use$0 ? '$0' : 'body'), selector }, mode, includeChildren: children, nodes: result, stats, html: clone.outerHTML };
}
