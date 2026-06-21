/* Shared behaviour for every page of the worked example.

   Loaded as a CLASSIC external script (`<script src="agentd.js"></script>`) placed
   at the end of <body>, so the DOM is already parsed when it runs. It must be a
   classic script, not a module: ES modules are fetched in CORS mode, and a page
   opened from file:// has a null origin, so an external `type="module"` would be
   blocked. A classic script loads fine from file://, and dynamic import() (used
   below for mermaid) still works inside it — the imported CDN module sends its own
   CORS headers, so that cross-origin import is allowed even from file://.

   highlight.js is loaded from its own CDN <script> tag *before* this one, exposing
   window.hljs. */
(function () {
  'use strict';

  // --- Syntax highlight (graceful if the CDN is unavailable: code stays readable mono) ---
  try { if (window.hljs) window.hljs.highlightAll(); }
  catch (e) { console.warn('[hljs] highlight skipped; code stays readable monospace', e); }

  // --- Mermaid, themed identically to the reference document ---
  // Dynamic import() returns a promise; no top-level await, so this stays a classic script.
  import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs')
    .then(function (mod) {
      var mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          background: 'transparent',
          primaryColor: '#14161d',
          primaryTextColor: '#e7e8ec',
          primaryBorderColor: '#3a3f4a',
          lineColor: '#7c8aa0',
          textColor: '#cdd5e0',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: '13px',
          actorBkg: '#13161d',
          actorBorder: '#f23a48',
          actorTextColor: '#e7e8ec',
          signalColor: '#a2a8b4',
          signalTextColor: '#cdd5e0',
          noteBkgColor: '#1a1012',
          noteTextColor: '#ffd7da',
          noteBorderColor: '#f23a48',
          labelBoxBkgColor: '#13161d',
          sequenceNumberColor: '#0a0b0e'
        }
      });
      // suppressErrors: a single malformed diagram renders an inline glyph instead of
      // aborting the whole run and silently killing every diagram after it in DOM order.
      return mermaid.run({ querySelector: 'pre.mermaid', suppressErrors: true });
    })
    .catch(function (e) {
      console.error('[mermaid] diagram render failed — showing source fallback', e);
      document.querySelectorAll('pre.mermaid').forEach(function (el) { el.classList.add('mermaid-unrendered'); });
    });

  // --- Scrollspy (in-page sections) + section reveal. Reduced-motion safe. ---
  var links = Array.prototype.slice.call(document.querySelectorAll('#nav a'));
  var byId = {};
  links.forEach(function (a) {
    var href = a.getAttribute('href') || '';
    // Only same-page anchors (href starting with '#') participate in scrollspy.
    if (href.indexOf('#') === 0) byId[href.slice(1)] = a;
  });

  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        Object.keys(byId).forEach(function (k) { byId[k].classList.remove('active'); });
        var a = byId[en.target.id];
        if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-12% 0px -72% 0px', threshold: 0 });
  document.querySelectorAll('section[id]').forEach(function (s) { spy.observe(s); });

  var allowMotion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (allowMotion) {
    var rev = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); rev.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
    document.querySelectorAll('.rv').forEach(function (el) { rev.observe(el); });
  } else {
    document.querySelectorAll('.rv').forEach(function (el) { el.classList.add('in'); });
  }
})();
