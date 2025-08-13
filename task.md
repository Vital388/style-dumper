# Project: Style Dumper — Chrome DevTools Extension

A Chrome DevTools extension that lets you quickly extract **computed styles** (two modes: *All Computed* vs *Rules‑Only Computed*) for a selected element **and optionally its subtree**, with an option to also export the **HTML structure with inlined styles**. Results are copyable, downloadable, and viewable directly in a DevTools panel. Also exposes a small Console API for power users.

---

## 1) Goals & Non‑Goals

**Goals**

* One‑click dump of:

  * **Computed styles (All)**: every computed property for the element (and pseudo‑elements), optionally for all descendants.
  * **Computed styles (Rules‑Only)**: only properties **touched by matched CSS rules or inline styles**, resolved to their computed values.
  * **HTML + inline styles**: export the element’s HTML (and subtree) with **computed values inlined** (optionally) or **applied declarations only**.
* Results displayed in a **DevTools panel** with JSON and Tree views, plus **Copy** / **Download** actions.
* Works from **\$0** (currently selected node), **CSS selector**, or **element picker**.
* Simple, fast, and safe to run repeatedly during dev.

**Non‑Goals**

* Not a full CSS specificity/debugger tool.
* No cross‑page scraping; it only inspects the **active inspected page**.

---

## 2) UX / User Flows

### 2.1 DevTools Panel

* DevTools → Panel name: **“Style Dumper”**.
* Controls:

  * Target: \[Use \$0] \[Pick Element] \[Selector input]
  * Mode (radio):

    * **Computed (All)**
    * **Computed (Rules‑Only)**
  * Include: \[x] **Children** (subtree)  \[x] **::before/::after**  \[x] **Include HTML**  \[x] **Inline computed values into HTML** (when Include HTML on)
  * Output format: **JSON** | **Pretty JSON** | **HTML (download)**
  * Buttons: **Dump** | **Copy** | **Download**
* Views:

  * **JSON View** (pretty-printed)
  * **Tree View** (collapsible: node → styles → pseudo)
  * Status area for node count, timing, skipped CORS stylesheets, etc.

### 2.2 Console Helpers

* Global helper exposed as `window.SD` in the inspected page:

  * `SD.dump({ selector?: string, element?: Element, mode?: 'all'|'rules', children?: boolean, pseudo?: boolean, html?: boolean, inlineComputed?: boolean })`
  * Returns a JSON result; also logs a summary and copies to clipboard.
* Shorthands:

  * `SD.dump()` uses `$0` if present.
  * `SD.dump({ selector: '.card', mode: 'rules', children: true })`

### 2.3 Element Picker

* Button toggles `inspect` mode: user clicks any element in the page, panel receives the node and runs dump.

---

## 3) Output Schemas

### 3.1 Styles JSON (per node)

```json
{
  "path": "div.container > ul:nth-of-type(1) > li.item",
  "tag": "li",
  "id": "item-3",
  "class": "item selected",
  "text_preview": "First 160 chars of text…",
  "styles": { "display": "block", "margin-top": "8px", "--brand-color": "#09f", "color": "rgb(0, 0, 0)" },
  "pseudo": {
    "::before": { "content": '""', "display": "inline" },
    "::after": { }
  }
}
```

### 3.2 Document JSON (panel result)

```json
{
  "target": { "source": "$0|selector|picker", "selector": ".card" },
  "mode": "all|rules",
  "includeChildren": true,
  "nodes": [ /* array of Styles JSON */ ],
  "stats": { "nodeCount": 42, "durationMs": 75, "skippedSheets": 2 }
}
```

### 3.3 HTML Export

* When **Include HTML** is checked, also produce:

  * **Raw subtree HTML** (verbatim) and/or
  * **HTML with styles inlined**:

    * If **Inline computed values**: write `style="..."` with computed values.
    * Else: write only declarations that were matched by rules/inline.
* Download as `style-dump.html` or `style-dump.json`.

---

## 4) Technical Design

### 4.1 Architecture (MV3)

* `manifest.json` (MV3) with `devtools_page`.
* `devtools.html` → loads `devtools.js` to create panel.
* `panel.html` + `panel.js` UI.
* No background service worker needed.
* Use `chrome.devtools.inspectedWindow.eval` to run the dumper **in the page context**.
* Optionally inject a small content script to expose `window.SD` helpers (via `eval` on panel load).

**Permissions**

* `"devtools_page"` (required)
* `"storage"` (remember UI prefs)
* `"downloads"` (for exporting files)

### 4.2 Core Dump Algorithm (Page Context)

#### A) Helper funcs

* `getCssPath(el)`: builds stable CSS path (id → classes → nth-of-type).
* `toObj(computedStyle)`: iterate enumerable properties in `CSSStyleDeclaration`.
* `collectPseudo(el)`: `getComputedStyle(el, '::before'|'::after')` if enabled.
* `textPreview(el)`: first 160 chars of text.

#### B) Modes

* **Computed (All)**: `getComputedStyle(el)`; enumerate properties → object.
* **Computed (Rules‑Only)**:

  1. Build a **Set of candidate property names** touched by either:

     * Inline styles (`el.style`).
     * Matched CSS rules: iterate `document.styleSheets` → `sheet.cssRules` → nested rules (`STYLE_RULE`, `MEDIA_RULE`, `SUPPORTS_RULE`, layers). For each `STYLE_RULE` where `el.matches(rule.selectorText)`, add each property in `rule.style` to the set. Skip CORS‑blocked sheets.
  2. From `getComputedStyle(el)`, read **only** those properties. For shorthands that resolve into longhands, include discovered longhands that start with the shorthand prefix (heuristic for `margin`, `padding`, `border`, etc.). Always include `--*` custom properties if present in the candidate set.

#### C) Subtree

* If **Children** enabled, the traversal array is `[root, ...root.querySelectorAll('*')]` and we map the collection over it.
* Guardrails: soft cap at, say, **5,000 nodes**; warn and allow the user to continue if larger.

#### D) Pseudo‑elements

* If enabled, collect `::before` and `::after` blocks exactly like base element.

#### E) HTML Export

* Get `root.cloneNode(true)`. For each element in the clone, write a `style` attribute from the chosen `styles` map (computed or rules‑only). Preserve existing inline styles by merging.

#### F) CORS Handling

* Accessing `sheet.cssRules` may throw for cross‑origin stylesheets. Catch and increment `skippedSheets` count; continue.

#### G) Performance

* Batch work in 50–100ms slices using `requestIdleCallback` or `setTimeout` loop for very large subtrees.
* Reuse arrays and avoid repeated `querySelectorAll`.

---

## 5) File Layout

```
/extension
  ├─ manifest.json
  ├─ devtools.html
  ├─ devtools.js
  ├─ panel.html
  ├─ panel.css
  ├─ panel.js
  └─ dumper.js           (stringified into eval; also used for unit tests)
```

### 5.1 manifest.json (MV3)

```json
{
  "name": "Style Dumper",
  "version": "0.1.0",
  "manifest_version": 3,
  "devtools_page": "devtools.html",
  "permissions": ["storage", "downloads"],
  "icons": {"128": "icon128.png"}
}
```

### 5.2 devtools.html

```html
<!doctype html>
<html><head><meta charset="utf-8"></head>
<body><script src="devtools.js"></script></body></html>
```

### 5.3 devtools.js

```js
chrome.devtools.panels.create(
  'Style Dumper',
  '',
  'panel.html',
  function(panel) { /* no-op */ }
);
```

### 5.4 panel.html (minimal skeleton)

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="panel.css" />
</head>
<body>
  <header>
    <button id="use$0">Use $0</button>
    <button id="picker">Pick Element</button>
    <input id="selector" placeholder="CSS selector (optional)" />
    <div>
      <label><input type="radio" name="mode" value="all" checked> Computed (All)</label>
      <label><input type="radio" name="mode" value="rules"> Computed (Rules‑Only)</label>
    </div>
    <div>
      <label><input type="checkbox" id="children" checked> Children</label>
      <label><input type="checkbox" id="pseudo" checked> ::before/::after</label>
      <label><input type="checkbox" id="html"> Include HTML</label>
      <label><input type="checkbox" id="inline"> Inline computed values</label>
    </div>
    <button id="dump">Dump</button>
    <button id="copy">Copy</button>
    <button id="download">Download</button>
  </header>
  <pre id="output"></pre>
  <script src="panel.js"></script>
</body>
</html>
```

### 5.5 panel.js (key ideas)

```js
const $ = sel => document.querySelector(sel);

function pageEval(fn, arg) {
  return new Promise((resolve) => {
    const expr = `(${fn.toString()})(${JSON.stringify(arg)})`;
    chrome.devtools.inspectedWindow.eval(expr, { useContentScriptContext: true }, (res, err) => {
      if (err && err.isException) console.warn(err.value);
      resolve(res);
    });
  });
}

// Inject SD helper once
pageEval(function(){
  if (!window.SD) {
    window.SD = {};
  }
});

async function runDump(params) {
  return pageEval(window.__STYLE_DUMPER__, params);
}

$('#dump').addEventListener('click', async () => {
  const params = {
    selector: $('#selector').value || null,
    use$0: $('#selector').value ? false : true,
    mode: document.querySelector('input[name="mode"]:checked').value,
    children: $('#children').checked,
    pseudo: $('#pseudo').checked,
    html: $('#html').checked,
    inline: $('#inline').checked
  };
  const result = await runDump(params);
  $('#output').textContent = JSON.stringify(result, null, 2);
});

$('#copy').addEventListener('click', () => {
  const text = $('#output').textContent;
  navigator.clipboard.writeText(text);
});

$('#download').addEventListener('click', () => {
  const blob = new Blob([$('#output').textContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'style-dump.json'; a.click();
  URL.revokeObjectURL(url);
});
```

### 5.6 dumper.js (page context function signature)

* Expose a single function assigned to `window.__STYLE_DUMPER__` which the panel stringifies and `eval`s.

```js
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
```

---

## 6) Edge Cases & Notes

* **CORS stylesheets**: reading `cssRules` may fail → count and report as `skippedSheets`.
* **Huge subtrees**: if `nodeCount > 5000`, show a confirm to proceed; throttle traversal.
* **Closed Shadow DOM**: not supported; open ShadowRoots can be optionally traversed later.
* **Pseudo‑elements** without content: may still have styles; include empty objects when requested.

---

## 7) Performance Targets

* < 100ms for 500 nodes (rules‑only mode may be slower depending on sheet count).
* Avoid blocking the UI thread in panel; consider chunking for >2k nodes.

---

## 8) QA Checklist

* Dump from `$0` works.
* Dump via selector works; invalid selectors show a friendly error.
* Element picker returns the clicked node.
* Modes switch correctly (All vs Rules‑Only).
* Children toggle changes nodeCount.
* Pseudo toggle includes `::before/::after`.
* HTML export creates valid markup; existing inline style is preserved and merged.
* Copy/Download buttons work; filenames are correct.
* Stats show realistic numbers and timing.

---

## 9) Acceptance Criteria (Definition of Done)

* A zipped MV3 extension that:

  * Adds a **Style Dumper** panel in DevTools.
  * Allows choosing target via `$0`, selector, or picker.
  * Produces **JSON** per schemas above in both modes; supports pseudo and children.
  * Can **copy** and **download** results; optional **HTML inline export**.
  * Exposes Console helper `SD.dump()` with same options.
  * Handles CORS blocks gracefully; reports `skippedSheets`.
  * Persists last used settings in `chrome.storage`.

---

## 10) Nice‑to‑Haves (Future)

* Export to **.har-like** bundle with HTML + JSON.
* Tailwind/React converters for exported HTML.
* Include a **diff** mode (compare two nodes’ computed styles).
* Shadow DOM traversal toggle.
* Profiles cache: reuse parsed stylesheets across runs.

---

## 11) Handoff Notes

* Target Chrome >= 110, Manifest V3.
* Use vanilla JS; keep dependencies near‑zero.
* Provide a minimal unit test for `dumper.js` (node props set + computed mapping) using `jsdom` where feasible.
* Deliverables: source repo + build instructions + a packaged `.zip` ready to load via **chrome://extensions → Load unpacked**.
