/* markdown.js — Markdown reader (readings of format 2 and "markdown" materials).
   GitHub-flavoured Markdown (tables, fenced code, task lists) via marked, sanitised with DOMPurify.
   Outline from the headings, text size, copy buttons on code, relative images / links resolved inside the
   pack, links to other .md files of the item open in the same reader, web links in the browser.
   State: { scroll (0..1), maxRead (0..100), completed, size } */
(function () {
  var el = T.el;
  var SIZES = [0.9, 1, 1.1, 1.25, 1.4];
  function slug(s, used) {
    var b = String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section', id = b, n = 2;
    while (used[id]) id = b + '-' + n++;
    used[id] = 1; return id;
  }
  function size(v) { try { if (v === undefined) return +localStorage.getItem('ui:mdSize') || 1; localStorage.setItem('ui:mdSize', v); } catch (e) { return 1; } }

  /* opts: { host, url, title, state, save(state, percent, completed), toast, finishButton (default true) } */
  function open(o) {
    var st = Object.assign({ scroll: 0, maxRead: 0, completed: false }, o.state || {});
    var root = el('div.mdv');
    var outlineBtn = el('button.btn.small', { type: 'button', title: 'Contents of the document', text: '☰' });
    var smaller = el('button.btn.small', { type: 'button', title: 'Smaller text', text: 'A−' });
    var bigger = el('button.btn.small', { type: 'button', title: 'Bigger text', text: 'A+' });
    var info = el('span.zoomv', { style: { minWidth: '90px' } });
    var finish = el('button.btn.small.primary', { type: 'button' });
    var bar = el('div.pdfv-bar', null, [outlineBtn, el('span.sep'), smaller, bigger, el('span.grow'), info, o.finishButton === false ? null : finish]);
    var outline = el('nav.pdfv-outline.mdv-outline');
    var scroll = el('div.mdv-scroll', { tabindex: 0 });
    var doc = el('article.md-doc');
    scroll.appendChild(doc);
    root.append(bar, el('div.pdfv-main', null, [outline, scroll]));
    o.host.appendChild(root);

    var cur = o.url, t = null;
    function pct() { return st.completed ? 100 : Math.round(st.maxRead); }
    function draw() { info.textContent = pct() + '% read'; finish.textContent = st.completed ? '✓ Finished' : 'Mark as finished'; }
    function persist(now) { clearTimeout(t); t = setTimeout(function () { o.save(st, pct(), st.completed); }, now ? 0 : 900); }
    finish.addEventListener('click', function () { st.completed = !st.completed; draw(); persist(true); });
    function applySize() { doc.style.fontSize = (size() * 100) + '%'; }
    smaller.addEventListener('click', function () { var i = Math.max(0, SIZES.indexOf(size()) - 1); size(SIZES[i] || 1); applySize(); });
    bigger.addEventListener('click', function () { var i = Math.min(SIZES.length - 1, SIZES.indexOf(size()) + 1); size(SIZES[i] || 1); applySize(); });
    outlineBtn.addEventListener('click', function () { outline.hidden = !outline.hidden; });
    applySize();

    function track() {
      var max = scroll.scrollHeight - scroll.clientHeight;
      var r = max > 4 ? scroll.scrollTop / max : 1;
      if (cur === o.url) st.scroll = r;
      var seen = Math.round(100 * Math.min(1, (scroll.scrollTop + scroll.clientHeight) / Math.max(1, scroll.scrollHeight)));
      if (cur === o.url && seen > st.maxRead) st.maxRead = seen;
      if (!st.completed && st.maxRead >= 90) { st.completed = true; if (o.toast) o.toast('Reading completed ✓'); }
      draw(); persist();
      /* highlight the current heading in the outline */
      var hs = doc.querySelectorAll('h1[id],h2[id],h3[id]'), top = scroll.getBoundingClientRect().top + 60, act = null;
      hs.forEach(function (h) { if (h.getBoundingClientRect().top < top) act = h.id; });
      outline.querySelectorAll('a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-id') === act); });
    }
    scroll.addEventListener('scroll', track);

    function load(url, resume) {
      cur = url;
      doc.innerHTML = '<p class="muted">Loading…</p>';
      return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (md) {
        var html = window.marked.parse(md, { gfm: true, breaks: false });
        doc.innerHTML = window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
        var base = new URL(url);
        /* resolve images and links */
        doc.querySelectorAll('img[src]').forEach(function (img) {
          img.src = new URL(img.getAttribute('src'), base).href;
          img.loading = 'lazy';
          img.addEventListener('click', function () { T.zoom.open(img.cloneNode(true)); });
        });
        doc.querySelectorAll('a[href]').forEach(function (a) {
          var h = a.getAttribute('href');
          if (/^https?:/i.test(h) || /^mailto:/i.test(h)) { a.target = '_blank'; a.rel = 'noopener'; return; }
          if (h.charAt(0) === '#') return;
          var abs = new URL(h, base);
          a.addEventListener('click', function (e) {
            e.preventDefault();
            if (/\.(md|markdown)$/i.test(abs.pathname)) { load(abs.href.split('#')[0]).then(function () { if (abs.hash) jump(abs.hash.slice(1)); }); }
            else if (o.toast) o.toast('This file is part of the pack — open it from the pack page.');
          });
        });
        /* heading ids + outline */
        var used = {};
        T.clear(outline);
        if (cur !== o.url) outline.appendChild(el('a.l1.back', { href: '#', text: '← ' + (o.title || 'Back'), onclick: function (e) { e.preventDefault(); load(o.url, true); } }));
        doc.querySelectorAll('h1,h2,h3').forEach(function (h) {
          h.id = slug(h.textContent, used);
          var lvl = +h.tagName.charAt(1);
          outline.appendChild(el('a.l' + lvl, { href: '#', 'data-id': h.id, text: h.textContent, onclick: function (e) { e.preventDefault(); jump(h.id); } }));
        });
        doc.querySelectorAll('a[href^="#"]').forEach(function (a) {
          a.addEventListener('click', function (e) { e.preventDefault(); jump(slug(decodeURIComponent(a.getAttribute('href').slice(1)), {})); });
        });
        outline.hidden = outline.children.length < 2 || o.host.clientWidth < 900;
        /* tables scroll sideways; code blocks get a copy button */
        doc.querySelectorAll('table').forEach(function (tb) { var w = el('div.md-table'); tb.parentNode.insertBefore(w, tb); w.appendChild(tb); });
        doc.querySelectorAll('pre').forEach(function (pre) {
          var code = pre.querySelector('code'), m = code && /language-([\w+-]+)/.exec(code.className);
          var btn = el('button.btn.small.copy', { type: 'button', text: 'Copy' });
          btn.addEventListener('click', function () { navigator.clipboard.writeText(pre.innerText.replace(/Copy(ied)?\s*$/, '')).then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1400); }); });
          pre.appendChild(el('div.pre-head', null, [m ? el('span', { text: m[1] }) : null, btn]));
        });
        requestAnimationFrame(function () {
          if (resume && cur === o.url) { var max = scroll.scrollHeight - scroll.clientHeight; scroll.scrollTop = Math.round((st.scroll || 0) * max); }
          else scroll.scrollTop = 0;
          track();
        });
      }).catch(function (e) { doc.innerHTML = ''; doc.appendChild(el('p.ui-error', { text: 'Could not open the document: ' + e.message })); });
    }
    function jump(id) { var n = doc.querySelector('#' + CSS.escape(id)); if (n) scroll.scrollTo({ top: n.offsetTop - 12, behavior: 'smooth' }); }
    draw();
    load(o.url, true);
    return function () { clearTimeout(t); o.save(st, pct(), st.completed); };
  }

  window.MarkdownView = { open: open };
})();
