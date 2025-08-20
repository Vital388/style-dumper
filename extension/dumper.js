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

  // Heuristic specificity weight for a selector. Higher means more specific.
  function computeSpecificityWeight(selector) {
    try {
      const sel = String(selector || '');
      // Remove strings and comments to reduce false positives
      const cleaned = sel
        .replace(/"[^"]*"|'[^']*'/g, '')
        .replace(/\/\*[^*]*\*+/g, '')
        .replace(/:(?:is|where)\(([^)]*)\)/g, '($1)');
      const idCount = (cleaned.match(/#[a-zA-Z0-9_-]+/g) || []).length;
      const classCount = (cleaned.match(/\.[a-zA-Z0-9_-]+/g) || []).length;
      const attrCount = (cleaned.match(/\[[^\]]+\]/g) || []).length;
      // Pseudo-classes (single :) but not pseudo-elements (::)
      const pseudoClassCount = (cleaned.match(/:(?!:)[a-zA-Z0-9_-]+(\([^)]*\))?/g) || []).length;
      const pseudoElementCount = (cleaned.match(/::[a-zA-Z0-9_-]+/g) || []).length;
      // Rough element/tag count: remove ids, classes, attributes, pseudo parts, combinators
      const stripped = cleaned
        .replace(/#[a-zA-Z0-9_-]+/g, ' ')
        .replace(/\.[a-zA-Z0-9_-]+/g, ' ')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/::[a-zA-Z0-9_-]+/g, ' ')
        .replace(/:(?!:)[a-zA-Z0-9_-]+(\([^)]*\))?/g, ' ')
        .replace(/[>+~]/g, ' ');
      const typeCount = (stripped.match(/\b[a-zA-Z][a-zA-Z0-9_-]*\b/g) || []).length;
      // Weight: inline >> id >> class/attr/pseudo-class >> type/pseudo-element
      const weight = idCount * 1_000 + (classCount + attrCount + pseudoClassCount) * 10 + (typeCount + pseudoElementCount);
      return weight;
    } catch {
      return 0;
    }
  }

  

  function collectPropertyCandidates(el) {
    const byProp = new Map();
    const props = new Set();

    function addCandidate(prop, info) {
      props.add(prop);
      if (!byProp.has(prop)) byProp.set(prop, []);
      byProp.get(prop).push(info);
    }

    // Inline style candidates
    try {
      for (let i = 0; i < el.style.length; i++) {
        const p = el.style[i];
        addCandidate(p, {
          src: 'inline',
          imp: el.style.getPropertyPriority(p) === 'important',
          sel: null,
          sp: 1_000_000, // Inline > any selector
          at: [],
          ord: Number.MAX_SAFE_INTEGER
        });
      }
    } catch {}

    // Stylesheet rule candidates
    let ordinal = 0;
    function walkRules(rules, activeAts) {
      for (let rIdx = 0; rIdx < rules.length; rIdx++) {
        const r = rules[rIdx];
        try {
          if (r.type === CSSRule.STYLE_RULE) {
            const list = (r.selectorText || '').split(',');
            for (let i = 0; i < list.length; i++) {
              const sel = list[i].trim();
              if (!sel) continue;
              try {
                if (!el.matches(sel)) continue;
              } catch { continue; }
              const sp = computeSpecificityWeight(sel);
              for (let j = 0; j < r.style.length; j++) {
                const p = r.style[j];
                addCandidate(p, {
                  src: 'rule',
                  imp: r.style.getPropertyPriority(p) === 'important',
                  sel,
                  sp,
                  at: activeAts,
                  ord: ++ordinal
                });
              }
            }
          } else if (r.type === CSSRule.MEDIA_RULE) {
            let ok = false;
            try { ok = matchMedia(r.media.mediaText).matches; } catch {}
            if (ok) walkRules(r.cssRules || [], activeAts.concat(['@media ' + r.media.mediaText]));
          } else if (r.type === CSSRule.SUPPORTS_RULE) {
            let ok = false;
            try { ok = CSS && CSS.supports && CSS.supports(r.conditionText); } catch {}
            if (ok) walkRules(r.cssRules || [], activeAts.concat(['@supports ' + r.conditionText]));
          } else if ('cssRules' in r && r.cssRules) {
            // Other group rules
            walkRules(r.cssRules, activeAts);
          }
        } catch {}
      }
    }

    for (let s = 0; s < document.styleSheets.length; s++) {
      const sheet = document.styleSheets[s];
      try { walkRules(sheet.cssRules || [], []); } catch {}
    }

    return { props, byProp };
  }

  function pickWinner(candidates) {
    if (!candidates || candidates.length === 0) return null;
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      if (best.imp !== c.imp) { best = c.imp ? c : best; continue; }
      if (best.sp !== c.sp) { best = c.sp > best.sp ? c : best; continue; }
      if (best.ord !== c.ord) { best = c.ord > best.ord ? c : best; continue; }
    }
    return best;
  }

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
      const { props, byProp } = collectPropertyCandidates(el);
      styles = computedSubset(el, props);
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
      // Build compact source map for the remaining styles
      const sources = {};
      for (const prop in styles) {
        if (!Object.prototype.hasOwnProperty.call(styles, prop)) continue;
        const winner = pickWinner(byProp.get(prop) || []);
        if (!winner) continue;
        const meta = { source: winner.src, isImportant: !!winner.imp };
        if (winner.src === 'rule') {
          meta.selector = winner.sel;
          meta.specificity = winner.sp;
          // Active media queries context (already filtered by matchMedia)
          if (winner.at && winner.at.length) {
            const medias = [];
            for (let i = 0; i < winner.at.length; i++) {
              const at = winner.at[i];
              if (typeof at === 'string' && at.startsWith('@media ')) {
                medias.push(at.slice(7).trim());
              }
            }
            if (medias.length === 1) meta.media = medias[0];
            else if (medias.length > 1) meta.media = medias;
          }
        }
        // Heuristic: overriding inline or !important generally requires !important
        meta.requiresImportant = (winner.src === 'inline') || !!winner.imp;
        sources[prop] = meta;
      }
      // Attach sources map
      var styleSources = sources;
    }
    else styles = toObj(getComputedStyle(el));

    const res = {
      path: cssPath(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      class: el.className || null,
      text_preview: (el.textContent || '').trim().slice(0, 160),
      styles,
      sources: (typeof styleSources !== 'undefined') ? styleSources : undefined,
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
  const stats = { nodeCount: nodes.length, durationMs: Math.round(performance.now() - t0) };

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
