/* core.js — shared helpers: DOM building, data loading, progress storage, labels. */
(function () {
  var T = window.T = window.T || {};

  /* ---------- DOM helper: el('div.card#id', {attrs}, children...) ---------- */
  T.el = function (spec, attrs, children) {
    var m = spec.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
    var node = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, function (_, t, v) {
      if (t === '.') node.classList.add(v); else node.id = v;
    });
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };
  T.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  T.shuffle = function (a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  T.uid = (function () { var n = 0; return function (p) { return (p || 'u') + (++n); }; })();

  /* ---------- UI strings (override any of them in training.json "labels") ---------- */
  T.labels = {
    contents: 'Contents', progress: 'Progress', view: 'View', layout: 'Layout', theme: 'Theme',
    sidebar: 'Sidebar', topbar: 'Top bar', reset: 'Reset progress',
    resetConfirm: 'Reset all progress of this training?', toggleToc: 'Show / hide contents',
    locked: 'Locked', lockedMsg: 'Pass the quiz of the previous topic to open this one.',
    goTo: 'Go to', quiz: 'Quiz', quizIntro: 'Answer the questions to finish this topic. You need {threshold} to pass.',
    selectOne: 'Select one answer.', selectMany: 'Select all correct answers.',
    orderHint: 'Drag the items (or use the arrows) into the right order.',
    matchHint: 'Drag each item to its group (or tap an item, then tap a group).',
    hotspotHint: 'Click the correct area(s) on the picture.',
    submit: 'Check answers', retry: 'Try again', passed: 'Passed', failed: 'Not passed yet',
    score: 'Your score', review: 'Read these parts again, then retry:', correct: 'Correct', incorrect: 'Incorrect',
    next: 'Next topic', prev: 'Previous', complete: 'Mark topic as complete', completed: 'Completed',
    check: 'Check', tryAgain: 'Not quite — try again.', wellDone: 'Well done!',
    certificate: 'Certificate', certReady: 'You have completed every topic. Get your certificate!',
    certName: 'Your full name', certCreate: 'Create certificate', certPrint: 'Print / save as PDF',
    certLocked: 'Finish all topics and quizzes to get your certificate.',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Reset', close: 'Close', copy: 'Copy', copied: 'Copied',
    play: 'Play', pause: 'Pause', stepPrev: 'Back', stepNext: 'Next', step: 'Step',
    tapToFlip: 'Click to flip', clickSpots: 'Click the marked areas to learn more.',
    unplaced: 'Items to place',
    /* paging, modes, integration */
    prevTopic: 'Previous topic', nextPart: 'Next', toQuiz: 'Go to the quiz', finishTopic: 'Finish the topic',
    passQuizFirst: 'Pass the quiz to continue', allDone: 'All topics done', subtopics: 'Subtopics',
    pageNav: 'Page navigation', topicParts: 'Parts of this topic',
    lastAttempt: 'Last quiz attempt: {score}.', reviewThis: 'This part is on your review list:', reviewThese: 'Re-read these parts, then try the quiz again:',
    backToQuiz: 'Back to the quiz', loadingProgress: 'Loading your progress…',
    saveError: 'Progress could not be saved. Check your connection — it will be retried on the next step.',
    loadError: 'Saved progress could not be loaded — starting fresh.',
    preview: 'Preview', previewNote: 'Preview mode: all topics are open and progress is not saved.',
    sampleName: 'Student Name', certStyleJson: 'Style as JSON (copy into certificate.json)',
    certPreviewTitle: 'Certificate preview',
    certPreviewNote: 'This is how the certificate looks with sample data. Try the controls below — changes are **not saved**. To keep a style, copy the JSON at the bottom into `certificate.json → style`, or ask the AI to change `certificate.json`.',
    cert_design: 'Design', cert_font: 'Font', cert_orientation: 'Orientation', cert_accent: 'Accent', cert_accent2: 'Second accent', cert_paper: 'Paper', cert_ink: 'Text'
  };
  T.L = function (key, vars) {
    var s = T.labels[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  };

  /* ---------- Data loading: bundled (single-file build) or fetched (served folder) ---------- */
  T.loadJSON = function (path) {
    if (window.TRAINING_DATA && window.TRAINING_DATA.files[path] !== undefined) {
      return Promise.resolve(JSON.parse(JSON.stringify(window.TRAINING_DATA.files[path])));
    }
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
      return r.json();
    });
  };
  /* Returns the text of an SVG file (or data: URI) so it can be inlined and animated. */
  T.loadSVG = function (src) {
    if (/^data:image\/svg\+xml;base64,/.test(src)) {
      var b = atob(src.split(',')[1]);
      try { b = decodeURIComponent(escape(b)); } catch (e) {}
      return Promise.resolve(b);
    }
    if (/^data:image\/svg\+xml[,;]/.test(src)) return Promise.resolve(decodeURIComponent(src.split(',')[1]));
    if (/^\s*<svg/.test(src)) return Promise.resolve(src);
    return fetch(src).then(function (r) { if (!r.ok) throw new Error(src); return r.text(); });
  };
  T.inlineSVG = function (host, src, cls) {
    return T.loadSVG(src).then(function (txt) {
      host.innerHTML = txt;
      var svg = host.querySelector('svg');
      if (svg) {
        svg.removeAttribute('width'); svg.removeAttribute('height');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        if (cls) svg.classList.add(cls);
      }
      return svg;
    }).catch(function () {
      host.innerHTML = '<p class="load-error">Could not load ' + MD.esc(src) + '</p>';
    });
  };

  /* ---------- Viewer preferences (layout, theme) — always local to this browser ----------
     Learning progress is handled by js/progress.js (local, REST, postMessage or custom adapter). */
  T.store = {
    key: 'training',
    pref: function (k, v) {
      try {
        if (v === undefined) return localStorage.getItem(this.key + ':pref:' + k);
        localStorage.setItem(this.key + ':pref:' + k, v);
      } catch (e) { return null; }
    }
  };

  /* ---------- Events: DOM CustomEvent "training:<type>" + postMessage to a parent frame ---------- */
  T.emit = function (type, detail) {
    var cfg = T.config || {};
    try { document.dispatchEvent(new CustomEvent('training:' + type, { detail: detail })); } catch (e) {}
    (T._listeners[type] || []).concat(T._listeners['*'] || []).forEach(function (fn) { try { fn(detail, type); } catch (e) { console.error(e); } });
    if (window.parent !== window && cfg.postMessage !== false) {
      try {
        window.parent.postMessage({ source: 'semitec-training', type: type, trainingId: T.app && T.app.training ? T.app.training.id : null, detail: JSON.parse(JSON.stringify(detail || null)) }, cfg.parentOrigin || '*');
      } catch (e) {}
    }
  };
  T._listeners = {};
  T.on = function (type, fn) { (T._listeners[type] = T._listeners[type] || []).push(fn); };
})();
