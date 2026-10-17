/* lab.js — lab view: manual (PDF), steps checklist, source files, check quiz (training-engine quiz).
   Header: full (title, meta, progress) or compact (one line); compact automatically when the student
   scrolls down, or always (pin button). Preference: localStorage "ui:labHeader" = auto | compact.
   Lab state (stored per user): { steps: {stepId: isoDate}, quiz: {passed, bestScore, attempts[]}, manualPage, tab, file } */
(function () {
  var el = T.el, api = window.api;
  var TEXT = /\.(txt|md|v|sv|svh|vh|vhd|vhdl|xdc|sdc|tcl|py|c|h|cpp|hpp|json|csv|ya?ml|ini|cfg|log|sh|do|f|s|asm|m|mk|makefile|gitignore)$|(^|\/)(Makefile|README)$/i;

  function labPercent(lab, st) {
    var steps = lab.steps || [], done = steps.filter(function (s) { return st.steps[s.id]; }).length;
    var hasQuiz = !!(lab.quiz && (lab.quiz.questions || []).length);
    var sp = steps.length ? done / steps.length : 1;
    var pct = hasQuiz ? sp * 0.7 + (st.quiz.passed ? 0.3 : 0) : sp;
    return { percent: Math.round(pct * 100), done: done, total: steps.length, completed: done === steps.length && (!hasQuiz || st.quiz.passed) };
  }
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B'; }
  function pref(v) { try { if (v === undefined) return localStorage.getItem('ui:labHeader') || 'auto'; localStorage.setItem('ui:labHeader', v); } catch (e) { return 'auto'; } }

  /* opts: { host, lab, item (with srcFiles [{path,size}]), base (url of lab folder), packId, state, save(state, percent, completed), toast } */
  function open(o) {
    var lab = o.lab, host = T.clear(o.host);
    var st = Object.assign({ steps: {}, quiz: { passed: false, bestScore: null, attempts: [] }, manualPage: 1, tab: null, file: null }, o.state || {});
    var hasQuiz = !!(lab.quiz && (lab.quiz.questions || []).length);
    var files = o.item.srcFiles || [];
    var pdfCtl = null;

    /* ---------- header (full) ---------- */
    var bar = el('div.bar', null, [el('i')]);
    var pctLbl = el('span');
    var head = el('div.lab-head', null, [
      el('h1', { text: lab.title }),
      el('div.meta', null, [lab.difficulty ? el('span', { text: '◆ ' + lab.difficulty }) : null, lab.estimatedTime ? el('span', { text: '⏱ ' + lab.estimatedTime }) : null,
        lab.equipment ? el('span', { text: '🔧 ' + lab.equipment.join(', ') }) : null, pctLbl]),
      bar]);
    /* ---------- tabs row (always visible) with a mini progress for compact mode ---------- */
    var tabs = el('div.lab-tabs-in', { role: 'tablist' });
    var miniBar = el('div.bar.mini', null, [el('i')]);
    var miniLbl = el('span.mini-lbl');
    var pin = el('button.icon-btn.lab-pin', { type: 'button' });
    var tabsRow = el('div.lab-tabs', null, [el('strong.mini-title', { text: lab.title }), tabs, el('span.grow'), el('div.lab-mini', null, [miniLbl, miniBar]), pin]);
    var pane = el('div.lab-pane');
    var wrap = el('div.lab-wrap', null, [head, tabsRow, pane]);
    host.appendChild(wrap);

    function setCompact(on) { wrap.classList.toggle('compact', on); }
    function drawPin() {
      var p = pref();
      pin.textContent = p === 'compact' ? '⤢' : '⤡';
      pin.title = p === 'compact' ? 'Show the full header (title and progress)' : 'Keep the header compact';
      pin.setAttribute('aria-pressed', p === 'compact');
    }
    pin.addEventListener('click', function () {
      var p = pref() === 'compact' ? 'auto' : 'compact';
      pref(p); drawPin(); setCompact(p === 'compact');
    });
    /* auto mode: compact while scrolled down in any scrolling area of the pane (steps, quiz, PDF, code) */
    var quietUntil = 0;   // ignore scrolls caused by opening a tab (PDF jumps to the saved page etc.)
    pane.addEventListener('scroll', function (e) {
      if (pref() === 'compact' || Date.now() < quietUntil) return;
      var y = e.target.scrollTop || 0;
      if (y > 24 && !wrap.classList.contains('compact')) setCompact(true);
      else if (y < 4 && wrap.classList.contains('compact')) setCompact(false);
    }, true);
    drawPin(); setCompact(pref() === 'compact');

    var defs = [];
    if (lab.manual) defs.push({ id: 'manual', label: 'Manual' });
    defs.push({ id: 'steps', label: 'Steps' });
    if (files.length) defs.push({ id: 'files', label: 'Files (' + files.length + ')' });
    var mats = o.item.attached || [];
    if (mats.length) defs.push({ id: 'materials', label: 'Materials (' + mats.length + ')' });
    if (hasQuiz) defs.push({ id: 'quiz', label: 'Check quiz' });
    var btns = {};
    defs.forEach(function (d) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': 'false', text: d.label, onclick: function () { show(d.id); } });
      btns[d.id] = b; tabs.appendChild(b);
    });

    function update(save) {
      var p = labPercent(lab, st);
      bar.firstChild.style.width = p.percent + '%'; miniBar.firstChild.style.width = p.percent + '%';
      pctLbl.textContent = '✓ ' + p.done + ' / ' + p.total + ' steps' + (hasQuiz ? (st.quiz.passed ? ' · quiz passed' : ' · quiz open') : '') + ' · ' + p.percent + '%';
      miniLbl.textContent = p.done + '/' + p.total + ' · ' + p.percent + '%';
      btns.steps.textContent = 'Steps (' + p.done + '/' + p.total + ')';
      if (hasQuiz) btns.quiz.textContent = 'Check quiz' + (st.quiz.passed ? ' ✓' : '');
      if (save) o.save(st, p.percent, p.completed);
      return p;
    }

    function show(id, focusStep) {
      Object.keys(btns).forEach(function (k) { btns[k].setAttribute('aria-selected', k === id ? 'true' : 'false'); });
      if (pdfCtl) { st.manualPage = pdfCtl.page; pdfCtl.destroy(); pdfCtl = null; }
      T.clear(pane); pane.className = 'lab-pane' + (id === 'manual' || id === 'files' ? ' fixed' : '');
      if (pref() !== 'compact') setCompact(false);
      quietUntil = Date.now() + 1200;
      st.tab = id;
      if (id === 'manual') {
        window.PDFView.open(pane, o.base + '/' + lab.manual, {
          startPage: st.manualPage || 1, showOutline: true,
          onPage: function (n) { st.manualPage = n; }
        }).then(function (c) { pdfCtl = c; });
      } else if (id === 'steps') renderSteps(focusStep);
      else if (id === 'files') renderFiles();
      else if (id === 'materials') renderMaterials();
      else renderQuiz();
      var p = labPercent(lab, st); o.save(st, p.percent, p.completed);
    }

    /* materials the package attaches to this lab ("for": lab id): starter files, constraints, templates */
    function renderMaterials() {
      var ICON = { material: '📎', reading: '📄', video: '🎬', training: '▶' };
      var inner = el('div.lab-inner');
      inner.appendChild(el('p.muted', { text: 'Files and documents for this lab. They open in the app; you can save a copy from there.' }));
      inner.appendChild(el('div.lab-mats', null, mats.map(function (m) {
        var href = '#/pack/' + encodeURIComponent(o.packId) + '/' + encodeURIComponent(m.id);
        var done = m.progress && m.progress.completedAt;
        return el('a.lab-mat', { href: href }, [el('span.lm-ico', { text: ICON[m.type] || '📎' }), el('div.grow', null, [el('div.lm-title', { text: m.title }),
          el('div.muted.small', { text: [m.description, m.kind, m.size ? fmtSize(m.size) : ''].filter(Boolean).join(' · ') })]), el('span.status' + (done ? '.done' : ''), { text: done ? '✓ Opened' : 'Open' })]);
      })));
      pane.appendChild(inner);
    }

    function renderSteps(focusStep) {
      var inner = el('div.lab-inner');
      if (lab.summary) inner.appendChild(el('div.md', { html: MD.render(lab.summary) }));
      if (lab.objectives && lab.objectives.length) inner.appendChild(el('div.objectives-box', null, [el('h3', { text: 'Objectives' }),
        el('ul', null, lab.objectives.map(function (x) { return el('li', { html: MD.inline(x) }); }))]));
      (lab.steps || []).forEach(function (s, i) {
        var box = el('div.step' + (st.steps[s.id] ? '.done' : ''), { id: 'step-' + s.id });
        var chk = el('button.check', { type: 'button', 'aria-pressed': st.steps[s.id] ? 'true' : 'false', title: 'Mark this step as done', text: st.steps[s.id] ? '✓' : '' });
        chk.addEventListener('click', function () {
          if (st.steps[s.id]) delete st.steps[s.id]; else st.steps[s.id] = new Date().toISOString();
          var on = !!st.steps[s.id];
          box.classList.toggle('done', on); chk.textContent = on ? '✓' : ''; chk.setAttribute('aria-pressed', on);
          doneNote(inner, update(true));
        });
        var links = [];
        if (s.manualPage && lab.manual) links.push(el('button.linkbtn', { type: 'button', text: '→ Manual, page ' + s.manualPage, onclick: function () { st.manualPage = s.manualPage; show('manual'); } }));
        (s.files || []).forEach(function (f) { links.push(el('button.linkbtn', { type: 'button', text: '→ ' + f, onclick: function () { st.file = f; show('files'); } })); });
        box.appendChild(chk);
        box.appendChild(el('div', null, [
          el('h3', null, [el('span.snum', { text: (i + 1) + '.' }), s.title]),
          s.md ? el('div.md', { html: MD.render(s.md) }) : null,
          s.code ? el('pre', null, [el('code', { text: s.code })]) : null,
          s.hint ? el('details', null, [el('summary', { text: 'Hint' }), el('div.md', { html: MD.render(s.hint) })]) : null,
          links.length ? el('div.step-links', null, links) : null
        ]));
        inner.appendChild(box);
      });
      doneNote(inner, labPercent(lab, st));
      var next = files.length ? el('button.btn', { type: 'button', text: '📁 Source files', onclick: function () { show('files'); } }) : null;
      if (hasQuiz || next) inner.appendChild(el('div.ui-actions', null, [el('span.grow'), next, hasQuiz ? el('button.btn.primary', { type: 'button', text: 'Go to the check quiz →', onclick: function () { show('quiz'); } }) : null]));
      pane.appendChild(inner);
      if (focusStep) setTimeout(function () {
        var n = document.getElementById('step-' + focusStep);
        if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('flash'); setTimeout(function () { n.classList.remove('flash'); }, 1600); }
      }, 30);
    }
    function doneNote(inner, p) {
      var old = inner.querySelector('.lab-done'); if (old) old.remove();
      if (p.completed) inner.insertBefore(el('div.lab-done', { text: '🎉 Lab completed — well done!' }), inner.firstChild);
    }

    /* ---------- source files: list + text viewer + zip download ---------- */
    function renderFiles() {
      var list = el('nav.files-list', { 'aria-label': 'Files' });
      var view = el('div.files-view');
      list.appendChild(el('div.files-actions', null, [
        el('button.btn.primary.small', { type: 'button', text: '⇩ Download full lab folder', onclick: function () {
          api.packs.exportItem(o.packId, o.item.id).then(function (f) { if (f) o.toast('Saved ' + f); }).catch(function (e) { o.toast(e.message, true); });
        } })]));
      var lastDir = null, links = {};
      files.forEach(function (f) {
        var dir = f.path.indexOf('/') >= 0 ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
        if (dir !== lastDir) { list.appendChild(el('div.files-dir', { text: dir ? '📂 ' + dir + '/' : '📂 ./' })); lastDir = dir; }
        var a = el('a.files-item', { href: '#', title: f.path }, [el('span', { text: (TEXT.test(f.path) ? '📄 ' : '📦 ') + f.path.split('/').pop() }), el('small', { text: fmtSize(f.size || 0) })]);
        a.addEventListener('click', function (e) { e.preventDefault(); openFile(f); });
        links[f.path] = a; list.appendChild(a);
      });
      pane.appendChild(el('div.files-layout', null, [list, view]));
      function openFile(f) {
        st.file = f.path;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle('active', k === f.path); });
        T.clear(view);
        var save = el('button.btn.small', { type: 'button', text: '⇩ Download full lab folder', onclick: function () {
          api.packs.exportItem(o.packId, o.item.id).then(function (p) { if (p) o.toast('Saved ' + p); }).catch(function (e) { o.toast(e.message, true); });
        } });
        var headRow = el('div.code-head', null, [el('span.lang', { text: f.path }), el('span.grow'), save]);
        if (!TEXT.test(f.path)) {
          view.appendChild(el('div.text-box', null, [headRow, el('div.file-card.inline', null, [el('div.big', { text: '📦' }), el('p', { text: 'This file cannot be shown here. Download the full lab folder to open it locally.' })])]));
          return;
        }
        var pre = el('pre.text-view');
        var copy = el('button.btn.small.copy', { type: 'button', text: 'Copy', onclick: function () { navigator.clipboard.writeText(pre.textContent).then(function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy'; }, 1500); }); } });
        headRow.insertBefore(copy, save);
        view.appendChild(el('div.text-box', null, [headRow, pre]));
        fetch(o.base + '/' + f.path).then(function (r) { return r.text(); }).then(function (txt) {
          if (txt.length > 1048576) txt = txt.slice(0, 1048576) + '\n… (truncated — save the file to see everything)';
          txt.replace(/\n$/, '').split('\n').forEach(function (line, i) { pre.appendChild(el('span.ln', { 'data-n': i + 1, text: line + '\n' })); });
        });
        var p = labPercent(lab, st); o.save(st, p.percent, p.completed);
      }
      var start = files.filter(function (f) { return f.path === st.file; })[0] || files.filter(function (f) { return TEXT.test(f.path); })[0] || files[0];
      if (start) openFile(start);
    }

    function renderQuiz() {
      var inner = el('div.lab-inner');
      var titles = {}; (lab.steps || []).forEach(function (s, i) { titles[s.id] = 'Step ' + (i + 1) + ': ' + s.title; });
      inner.appendChild(T.renderQuiz(lab.quiz, {
        topic: { id: o.item.id, title: lab.quiz.title || 'Check quiz — ' + lab.title },
        threshold: lab.quiz.passThreshold != null ? lab.quiz.passThreshold : 0.8,
        showCorrect: 'afterPass',
        passedBefore: st.quiz.passed ? { score: st.quiz.bestScore || 1 } : null,
        subTitle: function (id) { return titles[id] || id; },
        onReview: function (id) { show('steps', id); },
        onResult: function (r) {
          st.quiz.attempts.push({ date: new Date().toISOString(), score: r.score, passed: r.passed, wrong: r.wrong });
          if (st.quiz.attempts.length > 20) st.quiz.attempts.shift();
          st.quiz.bestScore = Math.max(st.quiz.bestScore || 0, r.score);
          if (r.passed) st.quiz.passed = true;
          update(true);
        },
        onPass: function () {}
      }));
      pane.appendChild(inner);
    }

    update(false);
    show(st.tab && btns[st.tab] ? st.tab : (lab.manual ? 'manual' : 'steps'));
    return { destroy: function () { if (pdfCtl) { pdfCtl.destroy(); pdfCtl = null; } } };
  }

  window.LabView = { open: open, percent: labPercent };
})();
