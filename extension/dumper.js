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
    for (let i = 0; i < el.style.length; i++) set.add(el.style[i]);
    function addDecl(d){ for (let i=0;i<d.length;i++) set.add(d[i]); }
    function walk(rules){
      for (const r of rules) {
        if (r.type === CSSRule.STYLE_RULE) {
          try { if (el.matches(r.selectorText)) addDecl(r.style); } catch {}
        } else if (r.type === CSSRule.MEDIA_RULE) {
          try { if (matchMedia(r.media.mediaText).matches) walk(r.cssRules); } catch {}
        } else if (r.type === CSSRule.SUPPORTS_RULE || r.type === 15 /*layer*/) {
          if (r.cssRules) walk(r.cssRules);
        }
      }
    }
    for (const sheet of document.styleSheets) { try { if (sheet.cssRules) walk(sheet.cssRules); } catch {} }
    return set;
  }

  function computedSubset(el, props) {
    const cs = getComputedStyle(el); const out = {}; const all = Array.from(cs);
    for (const p of props) {
      const v = cs.getPropertyValue(p);
      if (v) out[p] = v; else {
        // expand common shorthands
        for (const k of all) if (k.startsWith(p + '-')) { const vv = cs.getPropertyValue(k); if (vv) out[k] = vv; }
      }
      if (p.startsWith('--')) out[p] = cs.getPropertyValue(p);
    }
    return out;
  }

  function collect(el) {
    let styles;
    if (mode === 'rules') styles = computedSubset(el, rulesProps(el));
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
      res.pseudo['::before'] = toObj(getComputedStyle(el, '::before'));
      res.pseudo['::after']  = toObj(getComputedStyle(el, '::after'));
    }
    return res;
  }

  const root = pickRoot();
  if (!root) return { error: 'No root element found' };
  const nodes = children ? [root, ...root.querySelectorAll('*')] : [root];
  const t0 = performance.now();
  const result = nodes.map(collect);
  const stats = { nodeCount: nodes.length, durationMs: Math.round(performance.now()-t0) };

  if (!html) return { target: { source: selector ? 'selector' : (use$0 ? '$0' : 'body'), selector }, mode, includeChildren: children, nodes: result, stats };

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
  return { target: { source: selector ? 'selector' : (use$0 ? '$0' : 'body'), selector }, mode, includeChildren: children, nodes: result, stats, html: clone.outerHTML };
}