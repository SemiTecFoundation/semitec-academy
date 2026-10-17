/* app.js — loads training.json + topics, resolves the delivery mode, builds the layout
   (sidebar or top bar) and shows ONE page at a time:
     #<topic>/<subsection>   a subsection page (scroll inside it, "Next" at the end)
     #<topic>/quiz           the topic quiz (pass it to unlock the next topic)
     #certificate            the certificate
   Modes (see INTEGRATION.md): standalone · preview (everything open, nothing saved) · platform. */
(function () {
  var T = window.T, el = T.el, P = null;
  var A = T.app = { training: null, topics: [], cert: null, expanded: {} };

  /* ---------------- configuration ---------------- */
  function resolveConfig(tr) {
    var c = Object.assign({
      mode: 'standalone', progress: null, user: null, progressUrl: '', token: '', headers: null,
      parentOrigin: '*', initTimeout: 4000, lockName: false, urlParams: true, resume: true,
      postMessage: true, allowReset: null
    }, tr.delivery || {}, window.TRAINING_CONFIG || {});
    if (c.urlParams) {
      var q = new URLSearchParams(location.search);
      ['mode', 'progress', 'progressUrl', 'token', 'parentOrigin'].forEach(function (k) { if (q.has(k)) c[k] = q.get(k); });
      if (q.has('userId') || q.has('userName')) {
        c.user = Object.assign({}, c.user || {});
        if (q.has('userId')) c.user.id = q.get('userId');
        if (q.has('userName')) c.user.name = q.get('userName');
      }
    }
    if (['standalone', 'preview', 'platform'].indexOf(c.mode) < 0) c.mode = 'standalone';
    if (!c.progress) {
      c.progress = c.mode === 'preview' ? 'none'
        : c.mode === 'platform' ? (c.adapter ? 'custom' : c.progressUrl ? 'rest' : window.parent !== window ? 'postMessage' : 'local')
        : 'local';
    }
    if (c.allowReset == null) c.allowReset = c.mode !== 'platform';
    c.user = c.user ? Object.assign({}, c.user) : null;
    return c;
  }

  /* ---------------- boot ---------------- */
  function boot() {
    T.loadJSON('training.json').then(function (tr) {
      A.training = tr;
      if (tr.labels) Object.assign(T.labels, tr.labels);
      document.title = tr.title;
      document.documentElement.lang = tr.language || 'en';
      T.store.key = 'training:' + (tr.id || 'training');
      T.config = A.cfg = resolveConfig(tr);
      var jobs = (tr.topics || []).map(function (f) { return T.loadJSON('topics/' + f); });
      jobs.push(typeof tr.certificate === 'string' && /\.html?$/i.test(tr.certificate) ? Promise.resolve({ kind: 'web', entry: tr.certificate }) : tr.certificate ? T.loadJSON(tr.certificate).catch(function () { return null; }) : Promise.resolve(null));
      return Promise.all(jobs);
    }).then(function (res) {
      A.cert = res.pop();
      A.topics = res;
      A.training.topicTitles = A.topics.map(function (t) { return t.title; });
      P = T.progress;
      document.body.classList.add('mode-' + A.cfg.mode);
      applyView(T.store.pref('layout') || A.training.layout || 'sidebar', T.store.pref('theme') || A.training.theme || 'foundation');
      T.clear(document.getElementById('app')).appendChild(el('div.boot', { text: T.L('loadingProgress') }));
      return P.init(A.training, A.cfg);
    }).then(function () {
      P.onSaveError = function () { toast(T.L('saveError'), 'bad'); };
      buildShell();
      listenToParent();
      exposeAPI();
      window.addEventListener('hashchange', route);
      route();
      T.emit('ready', { mode: A.cfg.mode, progress: A.cfg.progress, percent: P.percent(), state: P.state });
      if (P.loadFailed) toast(T.L('loadError'), 'bad');
    }).catch(function (e) {
      console.error(e);
      document.getElementById('app').innerHTML =
        '<div class="boot error"><h2>Could not load the training</h2><p>' + MD.esc(e.message) +
        '</p><p>Open it through a web server (e.g. <code>python3 -m http.server</code> in this folder, then <code>http://localhost:8000</code>), ' +
        'or open the single-file build <code>dist/training.html</code>.</p></div>';
    });
  }

  /* ---------------- view: layout + theme ---------------- */
  function applyView(layout, theme) {
    A.layout = layout; A.theme = theme;
    document.body.classList.remove('layout-sidebar', 'layout-topbar');
    document.body.classList.add('layout-' + layout);
    if (window.TRAINING_DATA && window.TRAINING_DATA.themes) { /* single-file build: inlined <style data-theme> */
      document.querySelectorAll('style[data-theme]').forEach(function (s) { s.disabled = s.getAttribute('data-theme') !== theme; });
    } else document.getElementById('theme-css').setAttribute('href', 'css/themes/' + theme + '.css');
  }

  /* ---------------- progress helpers ---------------- */
  var preview = function () { return A.cfg.mode === 'preview'; };
  function passed(t) { return P.isPassed(t.id); }
  function unlocked(i) {
    if (preview() || A.training.requireSequential === false) return true;
    for (var k = 0; k < i; k++) if (!passed(A.topics[k])) return false;
    return true;
  }
  function allPassed() { return A.topics.every(passed); }
  function hasQuiz(t) { return !!(t.quiz && (t.quiz.questions || []).length); }
  function pagesOf(t) { return (t.subsections || []).map(function (s) { return s.id; }).concat(hasQuiz(t) ? ['quiz'] : []); }
  function subOf(t, id) { return (t.subsections || []).filter(function (x) { return x.id === id; })[0]; }
  function subTitle(t, id) { var s = subOf(t, id); return s ? s.title : id; }
  function href(t, page) { return '#' + t.id + (page ? '/' + page : ''); }
  function reviewSubs(t) { /* subsections linked to the questions answered wrong in the last failed attempt */
    var last = P.lastAttempt(t.id); if (!last || last.passed || passed(t)) return null;
    var out = [];
    (t.quiz.questions || []).forEach(function (q, k) {
      if ((last.wrong || []).indexOf(q.id || 'q' + (k + 1)) >= 0) (q.review || []).forEach(function (r) { if (out.indexOf(r) < 0) out.push(r); });
    });
    return { attempt: last, subs: out };
  }

  /* ---------------- shell ---------------- */
  function buildShell() {
    var app = T.clear(document.getElementById('app'));
    var tr = A.training;
    var tocBtn = el('button.icon-btn.toc-toggle', { type: 'button', title: T.L('toggleToc'), 'aria-label': T.L('toggleToc'), html: '<span class="burger"></span>' });
    tocBtn.addEventListener('click', function () {
      var hidden = !document.body.classList.contains('toc-hidden');
      document.body.classList.toggle('toc-hidden', hidden);
      document.body.classList.toggle('toc-open', !hidden);
    });
    A.progressBar = el('div.progress-fill');
    A.progressText = el('span.progress-text');
    var header = el('header.topbar-head', null, [
      tocBtn,
      el('div.brand', null, [el('div.brand-title', null, [tr.title, preview() ? el('span.mode-badge', { text: T.L('preview'), title: T.L('previewNote') }) : null]),
        tr.subtitle ? el('div.brand-sub', { text: tr.subtitle }) : null]),
      el('div.progress', { title: T.L('progress') }, [el('div.progress-track', null, [A.progressBar]), A.progressText]),
      viewMenu()
    ]);
    A.toc = el('nav.toc', { 'aria-label': T.L('contents') });
    A.main = el('main.main', { tabindex: '-1' });
    var scrim = el('div.scrim', { onclick: function () { document.body.classList.remove('toc-open'); } });
    app.appendChild(header);
    app.appendChild(el('div.body', null, [A.toc, scrim, A.main]));
    if (window.matchMedia('(max-width: 860px)').matches) document.body.classList.add('toc-hidden');
    document.addEventListener('click', function (e) {
      if (A.layout === 'topbar' && !A.toc.contains(e.target)) A.toc.querySelectorAll('.toc-item.expanded').forEach(function (x) { x.classList.remove('expanded'); });
    });
    renderToc();
  }

  function viewMenu() {
    var tr = A.training;
    var wrap = el('div.view-menu');
    var btn = el('button.btn.small', { type: 'button', 'aria-haspopup': 'true', text: T.L('view') + ' ▾' });
    var pop = el('div.view-pop', { hidden: true });
    if (tr.allowViewSwitch !== false) {
      var lay = el('select', null, ['sidebar', 'topbar'].map(function (l) { return el('option', { value: l, selected: l === A.layout, text: T.L(l) }); }));
      var themes = tr.themes || ['foundation', 'midnight', 'paper'];
      var th = el('select', null, themes.map(function (t) { return el('option', { value: t, selected: t === A.theme, text: t.charAt(0).toUpperCase() + t.slice(1) }); }));
      lay.addEventListener('change', function () { T.store.pref('layout', lay.value); applyView(lay.value, A.theme); renderToc(); });
      th.addEventListener('change', function () { T.store.pref('theme', th.value); applyView(A.layout, th.value); });
      pop.appendChild(el('label', null, [el('span', { text: T.L('layout') }), lay]));
      pop.appendChild(el('label', null, [el('span', { text: T.L('theme') }), th]));
    }
    if (A.cfg.allowReset) pop.appendChild(el('button.btn.small.danger', { type: 'button', text: T.L('reset'), onclick: function () {
      if (confirm(T.L('resetConfirm'))) { P.reset(); renderToc(); location.hash = href(A.topics[0], pagesOf(A.topics[0])[0]); route(); }
    } }));
    if (preview()) pop.appendChild(el('p.view-note', { text: T.L('previewNote') }));
    if (!pop.firstChild) return el('span');
    btn.addEventListener('click', function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) pop.hidden = true; });
    wrap.appendChild(btn); wrap.appendChild(pop);
    return wrap;
  }

  /* ---------------- table of contents (same markup for both layouts) ---------------- */
  function renderToc() {
    var toc = T.clear(A.toc);
    toc.appendChild(el('div.toc-title', { text: T.L('contents') }));
    var list = el('ol.toc-list');
    A.topics.forEach(function (t, i) {
      var open = unlocked(i), done = passed(t), st = P.state.topics[t.id] || { visited: [] };
      var status = done ? '✓' : (open ? String(i + 1) : '🔒');
      var link = el('a.toc-topic', { href: href(t), 'aria-disabled': open ? null : 'true' }, [
        el('span.toc-status' + (done ? '.done' : open ? '' : '.locked'), { text: status }), el('span.toc-label', { text: t.title })]);
      var exp = el('button.toc-exp', { type: 'button', 'aria-label': T.L('subtopics'), 'aria-expanded': 'false', html: '<span class="chev"></span>' });
      var subs = el('ol.toc-subs', null, (t.subsections || []).map(function (s) {
        var seen = st.visited.indexOf(s.id) >= 0;
        return el('li', null, [el('a.toc-sub' + (seen ? '.visited' : ''), { href: href(t, s.id), 'data-page': t.id + '/' + s.id, text: s.title })]);
      }).concat(hasQuiz(t) ? [el('li', null, [el('a.toc-sub.toc-quiz' + (done ? '.visited' : ''), { href: href(t, 'quiz'), 'data-page': t.id + '/quiz', text: '✎ ' + T.L('quiz') })])] : []));
      var item = el('li.toc-item' + (open ? '' : '.is-locked') + (done ? '.is-done' : ''), { 'data-topic': t.id }, [el('div.toc-row', null, [link, exp]), subs]);
      if (A.layout === 'sidebar' && A.expanded[t.id]) { item.classList.add('expanded'); exp.setAttribute('aria-expanded', 'true'); }
      exp.addEventListener('click', function (e) {
        e.stopPropagation();
        var o = !item.classList.contains('expanded');
        if (A.layout === 'topbar') list.querySelectorAll('.toc-item.expanded').forEach(function (x) { if (x !== item) { x.classList.remove('expanded'); x.querySelector('.toc-exp').setAttribute('aria-expanded', 'false'); } });
        item.classList.toggle('expanded', o); exp.setAttribute('aria-expanded', o);
        A.expanded[t.id] = o;
      });
      subs.addEventListener('click', function () { if (A.layout === 'topbar') item.classList.remove('expanded'); });
      list.appendChild(item);
    });
    if (A.cert && A.cert.enabled !== false) {
      var ok = allPassed() || preview();
      list.appendChild(el('li.toc-item.toc-cert' + (ok ? '' : '.is-locked'), { 'data-topic': '#certificate' }, [el('div.toc-row', null, [
        el('a.toc-topic', { href: '#certificate' }, [el('span.toc-status' + (ok ? '.done' : '.locked'), { text: ok ? '★' : '🔒' }), el('span.toc-label', { text: T.L('certificate') })])])]));
    }
    toc.appendChild(list);
    var p = P.percent();
    A.progressBar.style.width = p + '%';
    A.progressText.textContent = p + '%';
    markCurrent();
  }
  function markCurrent() {
    A.toc.querySelectorAll('.toc-item').forEach(function (x) { x.classList.toggle('current', x.getAttribute('data-topic') === A.current); });
    A.toc.querySelectorAll('.toc-sub').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-page') === A.current + '/' + A.page); });
    if (A.layout === 'sidebar' && A.current) {
      var cur = A.toc.querySelector('.toc-item.current');
      var exp = cur && cur.querySelector('.toc-exp');
      if (exp && !cur.classList.contains('expanded')) { cur.classList.add('expanded'); exp.setAttribute('aria-expanded', 'true'); A.expanded[A.current] = true; }
    }
  }

  /* ---------------- routing ---------------- */
  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (h === 'certificate') return showCertificate();
    if (!h) { /* resume where the student stopped, or start at the beginning */
      h = (A.cfg.resume && P.state.last) ? P.state.last : '';
      var known = h && A.topics.some(function (t) { return t.id === h.split('/')[0]; });
      if (!known) h = A.topics[0].id;
      history.replaceState(null, '', '#' + h);
    }
    var parts = h.split('/'), idx = 0;
    A.topics.forEach(function (t, i) { if (t.id === parts[0]) idx = i; });
    var t = A.topics[idx], pages = pagesOf(t);
    var page = pages.indexOf(parts[1]) >= 0 ? parts[1] : pages[0];
    if (!unlocked(idx)) showLocked(idx);
    else showPage(idx, page);
    if (window.matchMedia('(max-width: 860px)').matches) document.body.classList.remove('toc-open');
  }

  /* ---------------- one page: a subsection or the quiz ---------------- */
  function showPage(i, page) {
    var t = A.topics[i], tr = A.training, pages = pagesOf(t), k = pages.indexOf(page);
    var main = T.clear(A.main);
    A.current = t.id; A.page = page;

    main.appendChild(el('header.topic-head' + (k > 0 ? '.compact' : ''), null, [
      el('div.topic-kicker', { text: (tr.topicWord || 'Topic') + ' ' + (i + 1) + ' / ' + A.topics.length + (t.duration ? '  ·  ' + t.duration : '') }),
      el(k > 0 ? 'div.topic-title' : 'h1', { text: t.title }),
      k <= 0 && t.summary ? el('p.topic-summary', { html: MD.inline(t.summary) }) : null,
      k <= 0 && t.objectives ? el('ul.objectives', null, t.objectives.map(function (o) { return el('li', { html: MD.inline(o) }); })) : null
    ]));
    if (pages.length > 1) main.appendChild(pageSteps(t, pages, page));

    var rv = hasQuiz(t) ? reviewSubs(t) : null;
    if (rv && rv.subs.length) main.appendChild(reviewNote(t, rv, page));

    if (page === 'quiz') {
      main.appendChild(T.renderQuiz(t.quiz, {
        topic: t, threshold: tr.passThreshold != null ? tr.passThreshold : 0.8,
        showCorrect: tr.showCorrectAnswers || 'afterPass',
        passedBefore: passed(t) ? { score: P.topic(t.id).bestScore || 1 } : null,
        subTitle: function (id) { return subTitle(t, id); },
        onReview: function (id) { location.hash = href(t, id); },
        onResult: function (r) { onQuizResult(t, r); },
        onPass: function (score, bar) { bar.appendChild(nextTopicButton(i)); }
      }));
    } else if (page) {
      var s = subOf(t, page), n = (t.subsections || []).indexOf(s);
      var sec = el('section.subsection', { id: 'sub-' + t.id + '-' + s.id }, [el('h2', null, [el('span.sub-num', { text: (i + 1) + '.' + (n + 1) }), ' ' + s.title])]);
      (s.blocks || []).forEach(function (b) { sec.appendChild(T.renderBlock(b, { topic: t, subsection: s })); });
      main.appendChild(sec);
    }
    A.pager = el('nav.pager', { 'aria-label': T.L('pageNav') });
    main.appendChild(A.pager);
    updatePager(i, page);

    if (page) P.visit(t.id, page);
    T.emit('pageView', { topicId: t.id, page: page || null, index: k, pages: pages.length });
    renderToc();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    try { A.main.focus({ preventScroll: true }); } catch (e) {}
  }

  function pageSteps(t, pages, page) {
    var st = P.state.topics[t.id] || { visited: [] };
    return el('nav.page-steps', { 'aria-label': T.L('topicParts') }, pages.map(function (p, n) {
      var isQ = p === 'quiz', seen = isQ ? passed(t) : st.visited.indexOf(p) >= 0;
      return el('a.page-step' + (p === page ? '.current' : '') + (seen ? '.visited' : '') + (isQ ? '.is-quiz' : ''), {
        href: href(t, p), title: isQ ? T.L('quiz') : subTitle(t, p), 'aria-current': p === page ? 'page' : null
      }, [el('span.dot', { text: isQ ? '✎' : String(n + 1) }), el('span.step-label', { text: isQ ? T.L('quiz') : subTitle(t, p) })]);
    }));
  }

  function reviewNote(t, rv, page) {
    var onList = rv.subs.indexOf(page) >= 0;
    return el('div.review-note' + (onList ? '.on-list' : ''), null, [
      el('div', null, [el('strong', { text: T.L('lastAttempt', { score: Math.round(rv.attempt.score * 100) + '%' }) }), ' ',
        el('span', { text: onList ? T.L('reviewThis') : T.L('reviewThese') })]),
      el('ul.review-list', null, rv.subs.map(function (r) {
        return el('li', null, [r === page ? el('strong', { text: '▸ ' + subTitle(t, r) }) : el('a', { href: href(t, r), text: subTitle(t, r) })]);
      })),
      page !== 'quiz' ? el('a.btn.small.primary', { href: href(t, 'quiz'), text: '↩ ' + T.L('backToQuiz') }) : null
    ]);
  }

  function updatePager(i, page) {
    var t = A.topics[i], pages = pagesOf(t), k = pages.indexOf(page), pager = T.clear(A.pager);
    /* left: previous part, or previous topic */
    if (k > 0) pager.appendChild(el('a.btn.pager-prev', { href: href(t, pages[k - 1]) }, [el('small', { text: T.L('prev') }), el('span', { text: '← ' + (pages[k - 1] === 'quiz' ? T.L('quiz') : subTitle(t, pages[k - 1])) })]));
    else if (i > 0) { var pt = A.topics[i - 1], pp = pagesOf(pt); pager.appendChild(el('a.btn.pager-prev', { href: href(pt, pp[pp.length - 1]) }, [el('small', { text: T.L('prevTopic') }), el('span', { text: '← ' + pt.title })])); }
    else pager.appendChild(el('span'));
    /* right: next part / quiz / complete / next topic */
    if (page === 'quiz') {
      pager.appendChild(passed(t) || preview() ? nextTopicButton(i) : el('span.btn.disabled.pager-next', { title: T.L('passQuizFirst') }, [el('small', { text: T.L('passQuizFirst') }), el('span', { text: '🔒 ' + T.L('next') })]));
    } else if (k >= 0 && k < pages.length - 1) {
      var nx = pages[k + 1];
      pager.appendChild(el('a.btn.primary.pager-next', { href: href(t, nx) }, [el('small', { text: nx === 'quiz' ? T.L('finishTopic') : T.L('nextPart') }), el('span', { text: (nx === 'quiz' ? '✎ ' + T.L('toQuiz') : subTitle(t, nx)) + ' →' })]));
    } else { /* last part of a topic without quiz */
      if (passed(t)) pager.appendChild(nextTopicButton(i));
      else pager.appendChild(el('button.btn.primary.pager-next', { type: 'button', onclick: function () { P.complete(t.id); afterPass(t); renderToc(); updatePager(i, page); } },
        [el('small', { text: T.L('finishTopic') }), el('span', { text: '✓ ' + T.L('complete') })]));
    }
  }
  function nextTopicButton(i) {
    if (i + 1 < A.topics.length) return el('a.btn.primary.pager-next', { href: href(A.topics[i + 1]) }, [el('small', { text: T.L('next') }), el('span', { text: A.topics[i + 1].title + ' →' })]);
    if (A.cert && A.cert.enabled !== false) return el('a.btn.primary.pager-next', { href: '#certificate' }, [el('small', { text: T.L('allDone') }), el('span', { text: '★ ' + T.L('certificate') })]);
    return el('span.btn.disabled', { text: '✓ ' + T.L('allDone') });
  }

  function onQuizResult(t, r) {
    var was = passed(t);
    P.attempt(t.id, r);
    T.emit('quizAttempt', { topicId: t.id, score: r.score, passed: r.passed, correct: r.correct, total: r.total, wrong: r.wrong, threshold: r.threshold });
    if (r.passed && !was) afterPass(t);
    renderToc();
    updatePager(A.topics.indexOf(t), 'quiz');
    var old = A.main.querySelector('.review-note'); if (old) old.remove(); /* it described the previous attempt */
  }
  function afterPass(t) {
    T.emit('topicPassed', { topicId: t.id, score: P.topic(t.id).bestScore });
    if (allPassed() && !P.state.completedAt) {
      P.state.completedAt = new Date().toISOString();
      P.commit('completed');
      T.emit('completed', { completedAt: P.state.completedAt, averageScore: avgScore(), state: P.state });
    }
  }
  function avgScore() {
    var sc = A.topics.map(function (t) { var x = P.state.topics[t.id]; return x && x.bestScore != null ? x.bestScore : (preview() ? 1 : 0); });
    return sc.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, sc.length);
  }

  function showLocked(i) {
    var main = T.clear(A.main);
    A.current = A.topics[i].id; A.page = null; renderToc();
    var firstOpen = 0; for (var k = 0; k < A.topics.length; k++) if (!passed(A.topics[k])) { firstOpen = k; break; }
    var ft = A.topics[firstOpen], q = hasQuiz(ft) ? 'quiz' : pagesOf(ft)[0];
    main.appendChild(el('div.locked-card', null, [
      el('div.lock-icon', { text: '🔒' }), el('h1', { text: A.topics[i].title }), el('p', { text: T.L('lockedMsg') }),
      el('a.btn.primary', { href: href(ft, q), text: T.L('goTo') + ': ' + ft.title })]));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  /* ---------------- certificate page ---------------- */
  function showCertificate() {
    var main = T.clear(A.main); A.current = '#certificate'; A.page = null; renderToc();
    if (!A.cert || A.cert.enabled === false) { main.appendChild(el('p', { text: 'The author does not offer a certificate for this training.' })); return; }
    var cfg = A.cert;
    main.appendChild(el('header.topic-head', null, [el('h1', { text: T.L('certificate') })]));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (preview()) return certificatePreview(main, cfg);
    if (!allPassed()) {
      main.appendChild(el('div.locked-card', null, [el('div.lock-icon', { text: '🔒' }), el('p', { text: T.L('certLocked') }),
        el('ul.remaining', null, A.topics.filter(function (t) { return !passed(t); }).map(function (t) { return el('li', null, [el('a', { href: href(t), text: t.title })]); }))]));
      return;
    }
    var user = A.cfg.user || {};
    var given = (P.state.certificate && P.state.certificate.name) || user.name || '';
    var locked = !!(A.cfg.lockName && user.name);
    var date = P.state.completedAt || A.topics.map(function (t) { return P.topic(t.id).passedAt || ''; }).sort().pop() || new Date().toISOString();
    var input = el('input.name-input', { type: 'text', value: locked ? user.name : given, placeholder: T.L('certName'), 'aria-label': T.L('certName'), readonly: locked });
    var out = el('div.cert-out');
    var printBtn = el('button.btn', { type: 'button', text: '⎙ ' + T.L('certPrint'), hidden: true, onclick: function () { window.print(); } });
    function make(silent) {
      var name = input.value.trim(); if (!name) { input.focus(); return; }
      var cert = T.renderCertificate(cfg, A.training, { name: name, score: avgScore(), date: date });
      T.clear(out).appendChild(cert);
      printBtn.hidden = false;
      var prev = P.state.certificate || {};
      if (prev.name !== name || prev.id !== cert.getAttribute('data-cert-id')) {
        P.state.certificate = { name: name, id: cert.getAttribute('data-cert-id'), issuedAt: prev.issuedAt && prev.name === name ? prev.issuedAt : new Date().toISOString(), score: avgScore() };
        P.commit('certificate');
        if (!silent) T.emit('certificate', P.state.certificate);
      }
    }
    main.appendChild(el('div.cert-form', null, [el('p', { text: T.L('certReady') }),
      el('div.cert-row', null, [input, el('button.btn.primary', { type: 'button', text: T.L('certCreate'), onclick: function () { make(false); } }), printBtn])]));
    main.appendChild(out);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') make(false); });
    if (given || locked) make(true);
  }

  /* Preview: sample certificate + live style controls (not saved — copy the JSON into certificate.json). */
  function certificatePreview(main, cfg) {
    if (cfg.kind === 'web') { main.appendChild(T.renderCertificate(cfg, A.training, { name: 'Sample Learner', date: new Date().toISOString(), score: 1 })); return; }
    var style = Object.assign({ design: 'classic', font: 'serif', orientation: 'landscape', accent: '#1f4e79', accent2: '#c9a227', paper: '#fffdf7', ink: '#1d2433' }, cfg.style || {});
    var name = el('input.name-input', { type: 'text', value: (A.cfg.user && A.cfg.user.name) || T.L('sampleName'), 'aria-label': T.L('certName') });
    function sel(key, values) {
      var s = el('select', null, values.map(function (v) { return el('option', { value: v, selected: style[key] === v, text: v }); }));
      s.addEventListener('change', function () { style[key] = s.value; draw(); });
      return el('label', null, [el('span', { text: T.L('cert_' + key) }), s]);
    }
    function color(key) {
      var c = el('input', { type: 'color', value: style[key] });
      c.addEventListener('input', function () { style[key] = c.value; draw(); });
      return el('label', null, [el('span', { text: T.L('cert_' + key) }), c]);
    }
    var json = el('pre.cert-json');
    var out = el('div.cert-out');
    function draw() {
      var c = Object.assign({}, cfg, { style: style });
      T.clear(out).appendChild(T.renderCertificate(c, A.training, { name: name.value.trim() || T.L('sampleName'), score: 0.95, date: new Date().toISOString() }));
      json.textContent = '"style": ' + JSON.stringify(style, null, 2);
    }
    name.addEventListener('input', draw);
    main.appendChild(el('div.callout.info.cert-preview-note', null, [el('div.callout-title', { text: T.L('certPreviewTitle') }), el('div.md', { html: MD.render(T.L('certPreviewNote')) })]));
    main.appendChild(el('div.cert-panel', null, [
      el('label.wide', null, [el('span', { text: T.L('certName') }), name]),
      sel('design', ['classic', 'modern', 'minimal']), sel('font', ['serif', 'sans']), sel('orientation', ['landscape', 'portrait']),
      color('accent'), color('accent2'), color('paper'), color('ink'),
      el('button.btn.small', { type: 'button', text: '⎙ ' + T.L('certPrint'), onclick: function () { window.print(); } })
    ]));
    main.appendChild(out);
    main.appendChild(el('details.cert-json-box', null, [el('summary', { text: T.L('certStyleJson') }), json]));
    draw();
  }

  /* ---------------- small UI helpers ---------------- */
  function toast(msg, kind) {
    var t = el('div.toast' + (kind ? '.' + kind : ''), { role: 'status', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 4000);
  }

  /* ---------------- integration: messages from a parent page + JS API ---------------- */
  function listenToParent() {
    if (window.parent === window) return;
    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.target !== 'semitec-training') return;
      if (A.cfg.parentOrigin && A.cfg.parentOrigin !== '*' && e.origin !== A.cfg.parentOrigin) return;
      if (d.type === 'navigate' && d.hash) location.hash = d.hash;
      else if (d.type === 'getState') T.emit('state', { state: P.state });
      else if (d.type === 'reset') { P.reset(); renderToc(); location.hash = href(A.topics[0]); }
    });
  }
  function exposeAPI() {
    window.TrainingAPI = {
      getState: function () { return JSON.parse(JSON.stringify(P.state)); },
      getConfig: function () { return Object.assign({}, A.cfg, { adapter: undefined, token: A.cfg.token ? '***' : '' }); },
      navigate: function (hash) { location.hash = hash; },
      reset: function () { P.reset(); renderToc(); location.hash = href(A.topics[0]); },
      flush: function () { return P.flush(); },
      on: T.on
    };
  }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  document.addEventListener('DOMContentLoaded', boot);
})();
