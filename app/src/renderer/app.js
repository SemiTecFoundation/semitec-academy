/* app.js — SemiTec Academy UI: first-run setup, login / account creation, library of packs,
   pack overview, and the three item players (training, reading, lab). Talks to the main process
   only through window.api (see src/preload/preload.js). Routes: #/home #/library #/catalog #/projects #/calendar #/certificates #/pack/<id>[/<item>] #/settings[/<tab>] */
(function () {
  var el = T.el, api = window.api;
  var S = { info: null, user: null, cleanup: null, pendingPack: null };
  var ICON = { training: '▶', reading: '📄', lab: '🔬', video: '🎬', material: '📎', project: '🎓' };
  var TYPE = { training: 'Training', reading: 'Reading', lab: 'Lab', video: 'Video', material: 'Material', project: 'Project' };
  /* sections of the pack page, in this order; a section is shown only if the pack has such items */
  var SECTIONS = [
    { type: 'training', title: 'Trainings', sub: 'Interactive lessons with quizzes' },
    { type: 'lab', title: 'Labs', sub: 'Hands-on work: manual, steps and a check quiz' },
    { type: 'reading', title: 'Readings', sub: 'Documents to read' },
    { type: 'video', title: 'Videos', sub: 'Watch and learn' },
    { type: 'material', title: 'Other materials', sub: 'Starter files, constraints, datasheets, links' },
    { type: 'project', title: 'Projects', sub: 'Diploma and research projects with a weekly plan — enroll to put them in your calendar' }];
  var root = document.getElementById('root');

  /* ---------------- helpers ---------------- */
  function initials(n) { return String(n || '?').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); }
  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; }
  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }
  function toast(msg, bad) {
    var box = document.getElementById('toasts') || document.body.appendChild(el('div#toasts.ui-toasts'));
    var t = el('div.ui-toast' + (bad ? '.bad' : ''), { role: 'status', text: msg });
    box.appendChild(t); setTimeout(function () { t.remove(); }, bad ? 6000 : 3500);
  }
  function modal(title, body, actions) {
    var mr = document.getElementById('modal-root');
    var back = el('div.modal-back');
    var box = el('div.modal', { role: 'dialog', 'aria-modal': 'true' }, [el('h2', { text: title })].concat(body).concat([el('div.ui-actions', null, [el('span.grow')].concat(actions || []))]));
    back.appendChild(box); mr.appendChild(back);
    function close() { back.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', esc);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    return { close: close, box: box };
  }
  function statusChip(p) {
    if (p && p.completedAt) return el('span.status.done', { text: '✓ Done' });
    if (p && p.percent > 0) return el('span.status.going', { text: p.percent + '%' });
    return el('span.status', { text: 'Not started' });
  }
  /* dev: the signing key declares itself a development key, from the database, not guessed
     from its name — a production or partner key may legitimately contain "dev" */
  function sigBadge(sig, by, dev) {
    if (sig === 'trusted' && !dev) return el('span.badge.trusted', { text: '✔ Verified', title: 'Signed by ' + by });
    if (sig === 'trusted') return el('span.badge.dev', { text: '⚑ Dev-signed', title: 'Signed with a development key: ' + by });
    return el('span.badge.unsigned', { text: '⚠ Unsigned', title: 'Not signed by a trusted key (developer mode)' });
  }
  /* publisher name with its logo (or initials) — packages from different companies */
  function publisherLine(name, logo, extra) {
    var mark = logo ? el('img.pub-logo', { src: logo, alt: '' }) : el('span.pub-logo.txt', { text: initials(name || '?') });
    return el('div.pub-line', null, [mark, el('span.pub-name', { text: name || 'Unknown publisher' }), extra ? el('span.muted', { text: '· ' + extra }) : null]);
  }
  function bar(pct) { return el('div.bar', null, [el('i', { style: { width: (pct || 0) + '%' } })]); }
  function currentTheme() { var th = 'foundation'; try { th = localStorage.getItem('ui:theme:' + (S.user ? S.user.username : '')) || localStorage.getItem('ui:theme') || th; } catch (e) {} return th; }
  function applyTheme() {
    var th = currentTheme();
    document.getElementById('theme-css').setAttribute('href', '/engine/css/themes/' + th + '.css');
  }
  function coverUrl(p) { return p.cover ? 'stl://pack/' + encodeURIComponent(p.id) + '/' + p.cover : null; }
  function cover(p) {
    var c = el('div.pack-cover'); var u = coverUrl(p);
    if (u) c.appendChild(el('img', { src: u, alt: '' }));
    return c;
  }

  /* dates of plans are plain days 'YYYY-MM-DD' */
  function day(d, opt) { if (!d) return '—'; var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, opt || { day: 'numeric', month: 'short', year: 'numeric' }); }
  function dayShort(d) { return day(d, { day: 'numeric', month: 'short' }); }
  function localToday() { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
  /* shared with plan.js, projects.js, certs.js */
  window.UI = { el: el, api: api, S: S, modal: modal, toast: toast, fmtDate: fmtDate, fmtSize: fmtSize, bar: bar, statusChip: statusChip, ICON: ICON, TYPE: TYPE,
    cover: cover, publisherLine: function (a, b, c) { return publisherLine(a, b, c); }, importFlow: function (f) { importFlow(f); }, sigBadge: function (a, b, c) { return sigBadge(a, b, c); }, day: day, dayShort: dayShort, localToday: localToday, initials: initials,
    shell: function (a) { return shell(a); }, route: function () { route(); }, orderedItems: function (m) { return orderedItems(m); } };

  /* ---------------- boot ---------------- */
  function boot() {
    applyTheme();
    api.app.info().then(function (info) {
      S.info = info; S.user = info.user;
      if (info.needsSetup) return setupScreen();
      if (!S.user) return authScreen();
      route();
    }).catch(function (e) { root.textContent = 'Error: ' + e.message; });
    api.onOpenPack(function (file) { if (S.user) importFlow(file); else S.pendingPack = file; });
    window.addEventListener('hashchange', route);
    /* drag a .stlp anywhere onto the window */
    var overlay = el('div.dropzone-overlay', { text: 'Drop the SemiTec Learning Package (.stlp) to add it to your library' });
    document.body.appendChild(overlay);
    var depth = 0;
    document.addEventListener('dragenter', function (e) { if (S.user && hasFiles(e)) { depth++; document.body.classList.add('dragging'); } });
    document.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
    document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
      if (!S.user) return;
      var f = e.dataTransfer.files[0]; if (!f) return;
      if (!/\.stlp$/i.test(f.name)) return toast('Only SemiTec Learning Packages (.stlp files) can be added', true);
      importFlow(api.pathForFile(f));
    });
  }
  function hasFiles(e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }

  /* ---------------- first run: data folder ---------------- */
  function setupScreen() {
    var chosen = S.info.defaultDataDir;
    var pathBox = el('div.path', { text: chosen });
    var err = el('div.ui-error');
    T.clear(root).appendChild(el('div.ui-center', null, [el('div.ui-card.wide', null, [
      logo(),
      el('h1', { text: 'Welcome to SemiTec Academy' }),
      el('p.lead', { text: 'Choose where the app keeps your data on this computer: accounts, progress and installed course packs. You can move it later in Settings.' }),
      el('div.field', null, [el('span', { text: 'Data folder' }), pathBox]),
      el('div.ui-actions', null, [
        el('button.btn', { type: 'button', text: 'Choose another folder…', onclick: function () {
          api.app.chooseFolder().then(function (d) { if (d) { chosen = d; pathBox.textContent = d; } });
        } }),
        el('span.grow'),
        el('button.btn.primary', { type: 'button', text: 'Continue →', onclick: function () {
          api.app.setup(chosen).then(function () { return api.app.info(); }).then(function (i) { S.info = i; authScreen(); }).catch(function (e) { err.textContent = e.message; });
        } })]),
      err])]));
  }
  function logo() { return el('div.ui-logo', null, [el('div.mark', { text: 'SA' }), el('div.name', null, ['SemiTec Academy', el('small', { text: 'SemiTec Foundation · v' + (S.info ? S.info.version : '') })])]); }

  /* ---------------- login / create account (one flow) ---------------- */
  function authScreen() {
    var err = el('div.ui-error');
    var card = el('div.ui-card');
    T.clear(root).appendChild(el('div.ui-center', null, [card]));
    function step1(prefill) {
      T.clear(card); err.textContent = '';
      var u = el('input', { type: 'text', autocomplete: 'username', value: prefill || '', 'aria-label': 'Username', id: 'f-username' });
      var go = el('button.btn.primary.block', { type: 'submit', text: 'Continue' });
      var form = el('form', null, [el('div.field', null, [el('span', { text: 'Username' }), u]), go, err]);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = u.value.trim(); if (!name) return u.focus();
        api.auth.exists(name).then(function (ex) { ex ? loginStep(name) : registerStep(name); }).catch(function (x) { err.textContent = x.message; });
      });
      card.append(logo(), el('h1', { text: 'Sign in' }), el('p.lead', { text: 'Enter your username. New here? Type the username you want — we will create your account.' }), form);
      setTimeout(function () { if (!card.contains(document.activeElement)) u.focus(); }, 30);
    }
    function who(name) { return el('div.ui-who', null, [el('span.avatar', { text: initials(name) }), el('strong', { text: name }), el('button.linkbtn', { type: 'button', text: 'change', onclick: function () { step1(name); } })]); }
    function loginStep(name) {
      T.clear(card); err.textContent = '';
      var p = el('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Password', id: 'f-password' });
      var form = el('form', null, [who(name), el('div.field', null, [el('span', { text: 'Password' }), p]), el('button.btn.primary.block', { type: 'submit', text: 'Log in' }), err]);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        api.auth.login({ username: name, password: p.value }).then(loggedIn).catch(function (x) { err.textContent = x.message; p.select(); });
      });
      card.append(logo(), el('h1', { text: 'Welcome back' }), form);
      setTimeout(function () { if (!card.contains(document.activeElement)) p.focus(); }, 30);
    }
    function registerStep(name) {
      T.clear(card); err.textContent = '';
      var full = el('input', { type: 'text', autocomplete: 'name', 'aria-label': 'Full name', id: 'f-fullname' });
      var p1 = el('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Password', id: 'f-password' });
      var p2 = el('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Repeat password', id: 'f-password2' });
      var form = el('form', null, [who(name),
        el('div.field', null, [el('span', { text: 'Full name (shown on certificates)' }), full]),
        el('div.field', null, [el('span', { text: 'Password (6+ characters)' }), p1]),
        el('div.field', null, [el('span', { text: 'Repeat password' }), p2]),
        el('button.btn.primary.block', { type: 'submit', text: 'Create account' }), err]);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (p1.value !== p2.value) { err.textContent = 'The passwords do not match'; return p2.select(); }
        api.auth.register({ username: name, displayName: full.value, password: p1.value }).then(function (u) { toast('Account created — welcome, ' + u.displayName + '!'); loggedIn(u); })
          .catch(function (x) { err.textContent = x.message; });
      });
      card.append(logo(), el('h1', { text: 'Create your account' }), el('p.lead', { text: 'This account lives only on this computer. Your progress is saved in it.' }), form);
      setTimeout(function () { if (!card.contains(document.activeElement)) full.focus(); }, 30);
    }
    api.auth.lastUser().then(function (n) { n ? loginStepIfExists(n) : step1(''); }).catch(function () { step1(''); });
    function loginStepIfExists(n) { api.auth.exists(n).then(function (ex) { ex ? loginStep(n) : step1(''); }); }
  }
  function loggedIn(u) {
    S.user = u; applyTheme();
    if (!location.hash || location.hash === '#/') history.replaceState(null, '', '#/home');
    route();
    var pend = S.pendingPack; S.pendingPack = null;
    api.packs.pending().then(function (p) { var f = pend || p; if (f) importFlow(f); });
    api.plan.today().then(function (t) {        /* reminder when the app opens */
      var c = t.counts, parts = [];
      if (c.overdue) parts.push(c.overdue + ' overdue');
      if (c.current) parts.push(c.current + ' planned this week');
      if (c.soon) parts.push(c.soon + ' deliverable' + (c.soon > 1 ? 's' : '') + ' due soon');
      if (parts.length) toast('📅 ' + parts.join(' · ') + ' — see Today in your library', c.overdue > 0);
    }).catch(function () {});
  }

  /* ---------------- shell + routing ---------------- */
  function shell(active) {
    T.clear(root);
    var menu = null;
    var userBtn = el('button', { type: 'button', 'aria-haspopup': 'true' }, [el('span.avatar', { text: initials(S.user.displayName) }), el('span', { text: S.user.displayName })]);
    var userBox = el('div.ui-user', null, [userBtn]);
    userBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu) { menu.remove(); menu = null; return; }
      menu = el('div.ui-menu', null, [el('div.who', { text: '@' + S.user.username }),
        el('a', { href: '#/settings', text: '⚙ Settings & account' }),
        el('button', { type: 'button', text: '⇩ Export my progress', onclick: exportProgress }),
        el('div.sep'),
        el('button', { type: 'button', text: '⎋ Log out', onclick: logout })]);
      userBox.appendChild(menu);
    });
    document.addEventListener('click', function () { if (menu) { menu.remove(); menu = null; } });
    var head = el('header.ui-bar', null, [
      el('div.ui-logo', { onclick: function () { location.hash = '#/home'; } }, [el('div.mark', { text: 'SA' }), el('div.name', null, ['SemiTec Academy'])]),
      el('nav.ui-nav', null, [['home', 'Dashboard'], ['library', 'Library'], ['catalog', 'Catalog'], ['projects', 'Projects'], ['calendar', 'Calendar'], ['certificates', 'Certificates'], ['settings', 'Settings']].map(function (n) {
        return el('a' + (active === n[0] ? '.active' : ''), { href: '#/' + n[0], id: 'nav-' + n[0] }, [n[1]]);
      })),
      userBox]);
    var main = el('main');
    root.append(head, main);
    api.plan.today().then(function (t) {      /* badge: what needs attention this week */
      S.today = t.date;
      var n = t.counts.overdue + t.counts.current;
      var a = document.getElementById('nav-calendar');
      if (a && n) a.appendChild(el('span.nav-badge' + (t.counts.overdue ? '.alert' : ''), { text: String(n), title: (t.counts.overdue ? t.counts.overdue + ' overdue · ' : '') + t.counts.current + ' this week' }));
    }).catch(function () {});
    return main;
  }
  function logout() { leave(); api.auth.logout().then(function () { S.user = null; history.replaceState(null, '', '#/'); authScreen(); }); }
  function exportProgress() { api.progress.export().then(function (f) { if (f) toast('Saved to ' + f); }).catch(function (e) { toast(e.message, true); }); }
  function leave() { if (S.cleanup) { try { S.cleanup(); } catch (e) {} S.cleanup = null; } }

  function route() {
    if (!S.user) return;
    leave();
    var h = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    if (h[0] === 'pack' && h[1] && h[2]) return itemPage(h[1], h[2], h[3]);
    if (h[0] === 'calendar') return window.PlanUI.calendarPage(shell('calendar'), h[1]);
    if (h[0] === 'projects') return window.ProjectsUI.listPage(shell('projects'), h[1]);
    if (h[0] === 'certificates') return window.CertsUI.page(shell('certificates'));
    if (h[0] === 'pack' && h[1]) return packPage(h[1]);
    if (h[0] === 'settings') return settingsPage(h[1]);
    if (h[0] === 'library') return libraryPage(h[1]);
    if (h[0] === 'catalog') return window.CatalogUI.page(shell('catalog'));
    return window.DashboardUI.page(shell('home'));
  }

  /* ---------------- library ---------------- */
  /* status of a package for the filters: finished > in progress (enrolled or started) > not started */
  function packStatus(p) {
    if (p.progress.finishedAt) return 'finished';
    if ((p.plan && p.plan.enrolled) || p.progress.percent > 0 || p.progress.lastActivity) return 'progress';
    return 'new';
  }
  /* Library: "My packages" (the user's own list, with groups) and "Explore" (everything installed on this computer) */
  function libraryPage(sub) {
    var main = shell('library');
    var page = el('div.ui-page');
    main.appendChild(page);
    var addBtn = el('button.btn.primary', { type: 'button', text: '＋ Add a .stlp file', onclick: chooseAndImport });
    page.appendChild(el('div.ui-head', null, [el('div', null, [el('h1', { text: 'Library' }), el('p.sub', { text: 'Your packages and groups — and every package installed on this computer to explore.' })]), el('span.grow'),
      el('a.btn', { href: '#/catalog', text: '🛍 Catalog' }), addBtn]));
    Promise.all([api.packs.list(), api.groups.list()]).then(function (res) {
      var packs = res[0], groups = res[1];
      if (!packs.length) {
        page.appendChild(el('div.empty', null, [el('div', { style: { fontSize: '3rem' }, text: '📦' }), el('h2', { text: 'No course packs yet' }),
          el('p', { text: 'Course packages are SemiTec Learning Packages (.stlp files). Get one from the Catalog, add a file with the button, or drag the file onto this window.' }),
          el('div.ui-actions.center', null, [el('a.btn', { href: '#/catalog', text: '🛍 Open the catalog' }), el('button.btn.primary', { type: 'button', text: '＋ Add a .stlp file', onclick: chooseAndImport })])]));
        return;
      }
      var byId = {}; packs.forEach(function (p) { byId[p.id] = p; p._status = packStatus(p); });
      var mineList = function () { return packs.filter(function (p) { return p.mine; }); };
      var F = { tab: sub === 'explore' || sub === 'mine' ? sub : (mineList().length ? 'mine' : 'explore'), q: '', status: 'all', type: 'any', sort: 'activity', pub: 'any', group: 'all' };
      try { var sv = JSON.parse(localStorage.getItem('ui:libFilter:' + S.user.username) || '{}'); ['status', 'type', 'sort', 'pub', 'group'].forEach(function (k) { if (sv[k]) F[k] = sv[k]; }); } catch (e) {}
      function keep() { try { localStorage.setItem('ui:libFilter:' + S.user.username, JSON.stringify({ status: F.status, type: F.type, sort: F.sort, pub: F.pub, group: F.group })); } catch (e) {} }
      if (F.group !== 'all' && F.group !== 'none' && !groups.some(function (g) { return String(g.id) === String(F.group); })) F.group = 'all';

      /* sub tabs */
      var tabs = el('div.lib-tabs', { role: 'tablist' });
      function tabBtn(k, label) { return el('button', { type: 'button', role: 'tab', 'data-k': k, 'aria-selected': String(F.tab === k), onclick: function () { F.tab = k; history.replaceState(null, '', '#/library/' + k); drawAll(); } }, [label, el('span.cnt')]); }
      tabs.append(tabBtn('mine', '⭐ My packages'), tabBtn('explore', '🔭 Explore'));
      page.appendChild(tabs);

      /* toolbar (same for both tabs) */
      var search = el('input.lib-search', { type: 'search', placeholder: 'Search packages, items, publishers, groups…', 'aria-label': 'Search the library' });
      search.addEventListener('input', function () { F.q = search.value; drawGroups(); draw(); });
      var seg = el('div.seg', { role: 'tablist', 'aria-label': 'Show' });
      [['all', 'All'], ['progress', 'In progress'], ['new', 'Not started'], ['finished', 'Finished']].forEach(function (o) {
        seg.appendChild(el('button', { type: 'button', role: 'tab', 'data-k': o[0], 'aria-selected': String(F.status === o[0]), onclick: function () {
          F.status = o[0]; keep(); seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-k') === F.status)); }); draw();
        } }, [o[1], el('span.cnt')]));
      });
      var pubs = {}; packs.forEach(function (p) { var k = p.publisherId || 'unknown'; (pubs[k] = pubs[k] || { name: p.publisher || 'Unknown publisher', n: 0 }).n++; });
      if (F.pub !== 'any' && !pubs[F.pub]) F.pub = 'any';
      var pubSel = el('select', { 'aria-label': 'Publisher' }, [el('option', { value: 'any', text: 'All publishers' })].concat(Object.keys(pubs).sort(function (a, b) { return pubs[a].name.localeCompare(pubs[b].name); }).map(function (k) {
        return el('option', { value: k, text: pubs[k].name + ' (' + pubs[k].n + ')', selected: F.pub === k }); })));
      pubSel.addEventListener('change', function () { F.pub = pubSel.value; keep(); draw(); });
      var typeSel = el('select', { 'aria-label': 'Contains' }, [['any', 'Any content'], ['training', 'With trainings'], ['lab', 'With labs'], ['project', 'With projects'], ['video', 'With videos'], ['reading', 'With readings'], ['schedule', 'With a study plan']].map(function (o) { return el('option', { value: o[0], text: o[1], selected: F.type === o[0] }); }));
      var sortSel = el('select', { 'aria-label': 'Sort' }, [['activity', 'Recent activity'], ['title', 'Title A–Z'], ['progress', 'Progress'], ['added', 'Recently added']].map(function (o) { return el('option', { value: o[0], text: 'Sort: ' + o[1], selected: F.sort === o[0] }); }));
      typeSel.addEventListener('change', function () { F.type = typeSel.value; keep(); draw(); });
      sortSel.addEventListener('change', function () { F.sort = sortSel.value; keep(); draw(); });
      page.appendChild(el('div.lib-tools', null, [search, seg, pubSel, typeSel, sortSel]));
      var groupBar = el('div.group-bar'); page.appendChild(groupBar);
      var groupHead = el('div'); page.appendChild(groupHead);
      var info = el('div.lib-info'); page.appendChild(info);
      var grid = el('div.grid'); page.appendChild(grid);

      function reload(msg) { if (msg) toast(msg); Promise.all([api.packs.list(), api.groups.list()]).then(function (r) { packs = r[0]; groups = r[1]; byId = {}; packs.forEach(function (p) { byId[p.id] = p; p._status = packStatus(p); }); drawAll(); }); }
      function groupsOf(p) { return groups.filter(function (g) { return g.packs.indexOf(p.id) >= 0; }); }
      function card(p) {
        var cv = cover(p); cv.appendChild(sigBadge(p.signature, p.signedBy, p.signedDev));
        var st = p._status, pl = p.plan || {};
        var chip = st === 'finished' ? el('span.status.done', { text: '✓ Finished ' + fmtDate(p.progress.finishedAt) })
          : pl.enrolled ? el('span.status.going', { text: pl.hasPlan ? 'Enrolled · week ' + Math.max(1, Math.min(pl.weekNow, pl.weeks)) + ' of ' + pl.weeks : 'Enrolled · self-paced' })
          : st === 'progress' ? el('span.status.going', { text: 'In progress' }) : el('span.status', { text: 'Not started' });
        var gs = groupsOf(p);
        var actions = el('div.card-actions', { onclick: function (e) { e.stopPropagation(); } }, p.mine ? [
          el('button.btn.small', { type: 'button', text: '🗂 Groups' + (gs.length ? ' (' + gs.length + ')' : ''), onclick: function () { packGroupsDialog(p); } }),
          el('button.btn.small.ghost', { type: 'button', text: 'Remove from mine', title: 'Removes it from My packages; it stays installed — you choose whether your progress is kept', onclick: function () {
            var has = p.progress.saved || (p.plan && p.plan.enrolled);
            if (!has) return api.mine.remove(p.id).then(function () { reload('Removed from My packages: ' + p.title); });
            resetProgressDialog(p, { remove: true, done: function (r, reset) { reload('Removed from My packages: ' + p.title + (reset ? ' — progress reset' : ' — progress kept')); } }); } })]
          : [el('button.btn.small.primary', { type: 'button', text: '＋ Add to My packages', onclick: function () { api.mine.add(p.id).then(function () { reload('Added to My packages: ' + p.title); }); } })]);
        return el('div.pack-card', { role: 'link', tabindex: 0, onclick: function () { location.hash = '#/pack/' + encodeURIComponent(p.id); }, onkeydown: function (e) { if (e.key === 'Enter' && e.target === e.currentTarget) location.hash = '#/pack/' + encodeURIComponent(p.id); } }, [cv,
          el('div.pack-body', null, [
            el('h3', { text: p.title }),
            publisherLine(p.publisher, p.publisherLogo, 'v' + p.version),
            p.description ? el('div.desc', { text: p.description }) : null,
            el('div.counts', null, Object.keys(p.counts).map(function (k) { return el('span.chip-s', { text: ICON[k] + ' ' + p.counts[k] + ' ' + TYPE[k].toLowerCase() + (p.counts[k] > 1 ? 's' : '') }); })),
            el('div.card-status', null, [chip, p.mine && F.tab === 'explore' ? el('span.status.mine', { text: '⭐ In My packages' }) : null, pl.overdue ? el('span.status.late', { text: pl.overdue + ' overdue' }) : null, pl.enrolled && pl.end && st !== 'finished' ? el('span.muted.small', { text: 'plan ends ' + dayShort(pl.end) }) : null]),
            gs.length ? el('div.card-groups', null, gs.map(function (g) { return el('span.group-tag', { text: '🗂 ' + g.name }); })) : null,
            el('div.progress-line', null, [bar(p.progress.percent), el('span', { text: p.progress.percent + '%' })]),
            el('div.meta', { text: p.progress.done + ' of ' + p.progress.total + ' completed' + (p.progress.lastActivity ? ' · last activity ' + fmtDate(p.progress.lastActivity) : '') }),
            actions])]);
      }
      function matches(p, words) {
        var t = (p.text || p.title).toLowerCase() + ' ' + groupsOf(p).map(function (g) { return g.name + ' ' + g.description; }).join(' ').toLowerCase();
        return words.every(function (w) { return t.indexOf(w) >= 0; });
      }
      function baseList() {
        var list = F.tab === 'mine' ? mineList() : packs.slice();
        if (F.tab === 'mine' && F.group !== 'all') {
          if (F.group === 'none') list = list.filter(function (p) { return !groupsOf(p).length; });
          else { var g = groups.filter(function (x) { return String(x.id) === String(F.group); })[0]; list = g ? g.packs.map(function (id) { return byId[id]; }).filter(Boolean) : []; }
        }
        return list;
      }
      function drawGroups() {
        T.clear(groupBar); T.clear(groupHead);
        if (F.tab !== 'mine') return;
        var words = F.q.toLowerCase().split(/\s+/).filter(Boolean);
        function gchip(k, label, n, title) {
          return el('button.group-chip', { type: 'button', 'data-k': String(k), 'aria-pressed': String(String(F.group) === String(k)), title: title || '', onclick: function () { F.group = k; keep(); drawGroups(); draw(); } }, [label, el('span.cnt', { text: String(n) })]);
        }
        groupBar.appendChild(gchip('all', 'All my packages', mineList().length));
        groups.filter(function (g) { return !words.length || String(F.group) === String(g.id) || words.every(function (w) { return (g.name + ' ' + g.description).toLowerCase().indexOf(w) >= 0; }) || g.packs.some(function (id) { var t = byId[id] ? (byId[id].text || byId[id].title).toLowerCase() : ''; return t && words.every(function (w) { return t.indexOf(w) >= 0; }); }); })
          .forEach(function (g) { groupBar.appendChild(gchip(g.id, '🗂 ' + g.name, g.packs.length, g.description)); });
        var loose = mineList().filter(function (p) { return !groupsOf(p).length; }).length;
        if (groups.length && loose) groupBar.appendChild(gchip('none', 'Not in a group', loose));
        groupBar.appendChild(el('button.group-chip.new', { type: 'button', text: '＋ New group', onclick: function () { groupDialog(null); } }));
        var g = groups.filter(function (x) { return String(x.id) === String(F.group); })[0];
        if (g) groupHead.appendChild(el('div.group-head', null, [el('div.grow', null, [el('h2', { text: '🗂 ' + g.name }), g.description ? el('p.muted', { text: g.description }) : null,
          el('div.muted.small', { text: g.packs.length + ' package' + (g.packs.length === 1 ? '' : 's') + ' · updated ' + fmtDate(g.updatedAt) })]),
          el('button.btn.small', { type: 'button', text: '✎ Edit group', onclick: function () { groupDialog(g); } }),
          el('button.btn.small.danger', { type: 'button', text: 'Delete group', onclick: function () {
            if (!confirm('Delete the group "' + g.name + '"? The packages stay in My packages.')) return;
            api.groups.remove(g.id).then(function () { F.group = 'all'; keep(); reload('Group deleted'); }); } })]));
      }
      function draw() {
        var words = F.q.toLowerCase().split(/\s+/).filter(Boolean);
        var base = baseList();
        var counts = { all: base.length, progress: 0, new: 0, finished: 0 };
        base.forEach(function (p) { counts[p._status]++; });
        seg.querySelectorAll('button').forEach(function (b) { b.lastChild.textContent = String(counts[b.getAttribute('data-k')]); });
        var list = base.filter(function (p) {
          if (F.status !== 'all' && p._status !== F.status) return false;
          if (F.pub !== 'any' && (p.publisherId || 'unknown') !== F.pub) return false;
          if (F.type === 'schedule' && !p.hasSchedule) return false;
          if (F.type !== 'any' && F.type !== 'schedule' && !p.counts[F.type]) return false;
          return matches(p, words);
        });
        var by = { title: function (a, b) { return a.title.localeCompare(b.title); },
          progress: function (a, b) { return b.progress.percent - a.progress.percent; },
          added: function (a, b) { return String(b.addedAt || b.installedAt).localeCompare(String(a.addedAt || a.installedAt)); },
          activity: function (a, b) { return String(b.progress.lastActivity || b.addedAt || b.installedAt).localeCompare(String(a.progress.lastActivity || a.addedAt || a.installedAt)); } };
        if (!(F.tab === 'mine' && F.group !== 'all' && F.group !== 'none' && F.sort === 'activity')) list.sort(by[F.sort] || by.activity);
        T.clear(grid);
        info.textContent = list.length === base.length ? '' : list.length + ' of ' + base.length + ' packages';
        list.forEach(function (p) { grid.appendChild(card(p)); });
        if (!list.length) {
          if (F.tab === 'mine' && !mineList().length) grid.appendChild(el('div.empty.span-all', null, [el('h2', { text: 'My packages is empty' }),
            el('p', { text: 'Open “Explore” and press “＋ Add to My packages” on the packages you want — or just enroll in one or start learning, it is added automatically.' }),
            el('button.btn.primary', { type: 'button', text: '🔭 Explore packages', onclick: function () { F.tab = 'explore'; history.replaceState(null, '', '#/library/explore'); drawAll(); } })]));
          else if (F.tab === 'mine' && F.group !== 'all' && !base.length) grid.appendChild(el('div.empty.span-all', null, [el('h2', { text: 'This group is empty' }), el('p', { text: 'Use ✎ Edit group to choose its packages, or the 🗂 Groups button on a package.' })]));
          else grid.appendChild(el('div.empty.span-all', null, [el('h2', { text: 'Nothing found' }), el('p', { text: 'No package matches the search and filters.' }),
            el('button.btn', { type: 'button', text: 'Show all', onclick: function () { search.value = ''; F.q = ''; F.status = 'all'; F.type = 'any'; F.pub = 'any'; typeSel.value = 'any'; pubSel.value = 'any'; seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-k') === 'all')); }); keep(); drawGroups(); draw(); } })]));
        }
      }
      function drawAll() {
        tabs.querySelectorAll('button').forEach(function (b) { var k = b.getAttribute('data-k'); b.setAttribute('aria-selected', String(k === F.tab)); b.lastChild.textContent = String(k === 'mine' ? mineList().length : packs.length); });
        drawGroups(); draw();
      }
      /* create / edit a group: name, description and its packages (any installed package; it is added to My packages) */
      function groupDialog(g) {
        var name = el('input', { type: 'text', value: g ? g.name : '', 'aria-label': 'Group name', maxlength: 80 });
        var desc = el('textarea', { rows: 2, 'aria-label': 'Description', placeholder: 'What is this group for? e.g. "Semester 1 — digital design"' }); desc.value = g ? g.description : '';
        var chosen = {}; (g ? g.packs : []).forEach(function (id) { chosen[id] = 1; });
        var listBox = el('div.pick-list', null, packs.slice().sort(function (a, b) { return (b.mine - a.mine) || a.title.localeCompare(b.title); }).map(function (p) {
          var cb = el('input', { type: 'checkbox', checked: !!chosen[p.id] });
          cb.addEventListener('change', function () { if (cb.checked) chosen[p.id] = 1; else delete chosen[p.id]; });
          return el('label.pick-row', null, [cb, el('div.grow', null, [el('strong', { text: p.title }), el('div.muted.small', { text: (p.publisher || '') + (p.mine ? ' · in My packages' : ' · from Explore — will be added to My packages') })])]);
        }));
        var err = el('div.ui-error');
        var m = modal(g ? 'Edit group' : 'New group', [el('label.field', null, [el('span', { text: 'Name' }), name]), el('label.field', null, [el('span', { text: 'Description (optional)' }), desc]),
          el('div.field', null, [el('span', { text: 'Packages in this group' }), listBox]), err], [
          el('button.btn', { type: 'button', text: 'Cancel', onclick: function () { m.close(); } }),
          el('button.btn.primary', { type: 'button', text: g ? 'Save group' : 'Create group', onclick: function () {
            var ids = packs.filter(function (p) { return chosen[p.id]; }).map(function (p) { return p.id; });
            if (g) ids = g.packs.filter(function (id) { return chosen[id]; }).concat(ids.filter(function (id) { return g.packs.indexOf(id) < 0; }));
            api.groups.save({ id: g ? g.id : null, name: name.value, description: desc.value, packs: ids }).then(function (id) { m.close(); F.group = id; keep(); reload(g ? 'Group saved' : 'Group created'); })
              .catch(function (e) { err.textContent = e.message; });
          } })]);
        setTimeout(function () { name.focus(); }, 30);
      }
      /* the groups of one package */
      function packGroupsDialog(p) {
        var chosen = {}; groupsOf(p).forEach(function (g) { chosen[g.id] = 1; });
        var body = groups.length ? el('div.pick-list', null, groups.map(function (g) {
          var cb = el('input', { type: 'checkbox', checked: !!chosen[g.id] });
          cb.addEventListener('change', function () { if (cb.checked) chosen[g.id] = 1; else delete chosen[g.id]; });
          return el('label.pick-row', null, [cb, el('div.grow', null, [el('strong', { text: g.name }), g.description ? el('div.muted.small', { text: g.description }) : null])]);
        })) : el('p.muted', { text: 'You have no groups yet.' });
        var m = modal('Groups — ' + p.title, [body], [
          el('button.btn', { type: 'button', text: '＋ New group…', onclick: function () { m.close(); groupDialog(null); } }), el('span.grow'),
          el('button.btn', { type: 'button', text: 'Cancel', onclick: function () { m.close(); } }),
          el('button.btn.primary', { type: 'button', text: 'Save', onclick: function () {
            api.groups.setForPack(p.id, Object.keys(chosen).map(Number)).then(function () { m.close(); reload('Groups saved'); });
          } })]);
      }
      drawAll();
    }).catch(function (e) { page.appendChild(el('p.ui-error', { text: e.message })); });
  }
  function chooseAndImport() { api.packs.choose().then(function (f) { if (f) importFlow(f); }); }

  /* inspect → confirm → install */
  function importFlow(file) {
    api.packs.inspect(file).then(function (info) {
      var body = [];
      body.push(el('p', null, [el('strong', { text: info.title }), ' · v' + info.version + (info.publisher ? ' · ' + info.publisher : '')]));
      if (info.description) body.push(el('p.muted', { text: info.description }));
      var counts = {}; info.items.forEach(function (i) { counts[i.type] = (counts[i.type] || 0) + 1; });
      body.push(el('div.counts', null, Object.keys(counts).map(function (k) { return el('span.chip-s', { text: ICON[k] + ' ' + counts[k] + ' ' + TYPE[k].toLowerCase() + (counts[k] > 1 ? 's' : '') }); })));
      body.push(el('dl.kv', { style: { marginTop: '12px' } }, [el('dt', { text: 'File' }), el('dd', { text: info.file.split(/[\\/]/).pop() + ' (' + fmtSize(info.size) + ')' }),
        el('dt', { text: 'Needs app version' }), el('dd', { text: info.minAppVersion + ' or newer (you have ' + S.info.version + ')' }),
        el('dt', { text: 'Signature' }), el('dd', { text: info.signature.status === 'trusted' ? '✔ ' + info.signature.keyName : info.signature.status === 'unsigned' ? 'not signed' : 'unknown key ' + info.signature.keyId })]));
      var canInstall = info.compat.ok && (info.signature.status === 'trusted' || info.devMode);
      if (!info.compat.ok) body.push(el('div.errbox', { text: 'This app version cannot open this pack:\n• ' + info.compat.reasons.join('\n• ') + '\n\nInstall a newer version of SemiTec Academy.' }));
      else if (info.signature.status !== 'trusted') body.push(el(info.devMode ? 'div.warnbox' : 'div.errbox', { text: info.devMode ? 'Not signed by a trusted key. Installing because developer mode is on.' : 'This pack is not signed by the SemiTec Foundation, so it cannot be installed. (Teachers testing their own packs can enable developer mode in Settings.)' }));
      if (info.installedVersion) body.push(el('div.okbox', { text: 'Version ' + info.installedVersion + ' is installed. Installing ' + info.version + ' replaces the content; your progress is kept.' }));
      var err = el('div.ui-error'); body.push(err);
      var m = modal('Add course pack', body, [
        el('button.btn', { type: 'button', text: 'Cancel', onclick: function () { m.close(); } }),
        canInstall ? el('button.btn.primary', { type: 'button', text: info.installedVersion ? 'Update' : 'Install', onclick: function (e) {
          e.target.disabled = true; e.target.textContent = 'Installing…';
          api.packs.install(file).then(function (r) {
            m.close(); toast((r.updatedFrom ? 'Updated: ' : 'Installed: ') + r.title);
            location.hash = '#/pack/' + encodeURIComponent(r.id); route();
          }).catch(function (x) { err.textContent = x.message; e.target.disabled = false; e.target.textContent = 'Install'; });
        } }) : null]);
    }).catch(function (e) {
      modal('This file cannot be added', [el('div.errbox', { text: e.message })], [el('button.btn.primary', { type: 'button', text: 'OK', onclick: function () { document.querySelector('.modal-back').remove(); } })]);
    });
  }

  /* reset dialog: start a package from 0 (progress, quiz results, notes, study plan, certificates of this package) */
  function resetProgressDialog(p, opts) {
    opts = opts || {};
    var pr = p.progress || p.summary || {};
    var chk = el('input', { type: 'checkbox', id: 'rp-chk' });
    var body = [
      el('p', { text: opts.remove ? 'Remove “' + p.title + '” from My packages? It stays installed and you can add it again from Explore.'
        : 'Start “' + p.title + '” again from 0?' }),
      (pr.saved || pr.percent || (p.plan && p.plan.enrolled)) ? el('div.reset-box', null, [
        el('div', { text: 'Your progress: ' + (pr.percent || 0) + '% · ' + (pr.done || 0) + ' of ' + (pr.total || 0) + ' completed' + ((p.plan && p.plan.enrolled) ? ' · enrolled' : '') }),
        opts.remove ? el('label.check', null, [chk, el('span', { text: ' Also reset my progress — start from 0 when I add it again' })]) : null,
        el('div.muted.small', { text: 'Resetting deletes your progress of every item, quiz results and notes, your study plan (enrollment) and the certificates earned in this package. This cannot be undone.' })]) : null];
    var mo = modal(opts.remove ? 'Remove from My packages' : 'Reset progress', body, [
      el('button.btn', { type: 'button', text: 'Cancel', onclick: function () { mo.close(); } }),
      el('button.btn.primary' + (opts.remove ? '' : '.danger'), { type: 'button', text: opts.remove ? 'Remove' : '↺ Reset to 0', onclick: function () {
        var reset = opts.remove ? chk.checked : true;
        var steps = (reset ? api.progress.reset(p.id) : Promise.resolve(null)).then(function (r) { return opts.remove ? api.mine.remove(p.id).then(function () { return r; }) : r; });
        steps.then(function (r) { mo.close(); if (opts.done) opts.done(r, reset); }).catch(function (e) { toast('⚠ ' + e.message); });
      } })]);
  }

  /* ---------------- pack overview ---------------- */
  /* course order: modules first, then the rest; items attached to another item ("for") follow their parent */
  function attached(m) { var k = {}; (m.items || []).forEach(function (it) { if (it.for) (k[it.for] = k[it.for] || []).push(it); }); return k; }
  /* counted for progress: not a prerequisite and not a material attached to another item (app 1.6.0) */
  function counts(it, byId) { return !!it && !it.prerequisite && !(it.for && byId[it.for]); }
  function orderedItems(m) {
    var byId = {}; (m.items || []).forEach(function (it) { byId[it.id] = it; });
    var kids = attached(m), out = [], seen = {};
    function add(it) { if (!it || seen[it.id]) return; if (it.for && byId[it.for] && !seen[it.for]) return; out.push(it); seen[it.id] = 1; (kids[it.id] || []).forEach(function (k) { out.push(k); seen[k.id] = 1; }); }
    (m.items || []).forEach(function (it) { if (it.prerequisite) add(it); });     /* prerequisites come first */
    (m.modules || []).forEach(function (mod) { (mod.items || []).forEach(function (id) { add(byId[id]); }); });
    (m.items || []).forEach(function (it) { add(it); });
    (m.items || []).forEach(function (it) { if (!seen[it.id]) { out.push(it); seen[it.id] = 1; } });
    return out;
  }
  function packPage(id) {
    var main = shell('library');
    var page = el('div.ui-page'); main.appendChild(page);
    Promise.all([api.packs.get(id), api.plan.pack(id)]).then(function (res) {
      var P = res[0], PL = res[1];
      var m = P.manifest, prog = P.progress;
      var items = orderedItems(m);
      var byId0 = {}; (m.items || []).forEach(function (it) { byId0[it.id] = it; });
      var countedIts = items.filter(function (it) { return counts(it, byId0); });
      var next = countedIts.filter(function (it) { return !(prog[it.id] || {}).completedAt; })[0];
      var started = countedIts.some(function (it) { return prog[it.id]; });
      page.appendChild(el('div.hero', null, [cover(Object.assign({ id: m.id }, m)), el('div', null, [
        el('h1', { text: m.title }),
        el('div.meta', null, [publisherLine(m.publisher, m.publisherLogo ? 'stl://pack/' + encodeURIComponent(m.id) + '/' + m.publisherLogo : null, 'v' + m.version), sigBadge(P.signature, P.signedBy, P.signedDev), m.language ? el('span', { text: m.language.toUpperCase() }) : null]),
        m.description ? el('div.desc.md', { html: MD.render(m.description) }) : null,
        el('div.progress-line', null, [bar(P.summary.percent), el('span', { text: P.summary.percent + '% · ' + P.summary.done + ' / ' + P.summary.total + ' completed' + (P.summary.prerequisites ? ' · prerequisites not counted' : '') })]),
        window.PlanUI.enrollBox(id, m, PL),
        el('div.ui-actions', null, [
          next ? el('a.btn.primary', { href: '#/pack/' + encodeURIComponent(id) + '/' + encodeURIComponent(next.id), text: (started ? 'Continue: ' : 'Start: ') + next.title + ' →' }) : el('span.status.done', { text: '🎉 Everything completed' }),
          el('span.grow'),
          (Object.keys(prog).length || (PL && PL.enrollment)) ? el('button.btn.small.ghost', { type: 'button', text: '↺ Reset progress', title: 'Start this package again from 0', onclick: function () {
            resetProgressDialog({ id: id, title: m.title, summary: P.summary, plan: { enrolled: !!(PL && PL.enrollment) } }, { done: function () { toast('Progress reset — ' + m.title + ' starts from 0'); route(); } });
          } }) : null,
          el('button.btn.small', { type: 'button', text: 'ⓘ Details', onclick: function () { packDetails(P); } })])])]));
      var byId = {}; (m.items || []).forEach(function (it) { byId[it.id] = it; });
      var kids = attached(m);
      var hasModules = (m.modules || []).length > 0;
      var hasPlan = PL.template.entries > 0 || !!(PL.plan && PL.plan.entries.length);
      var modes = [['sections', '▦ By type']].concat(hasModules ? [['modules', '☰ Course order']] : []).concat(hasPlan ? [['plan', '📅 Study plan']] : []);
      var mode = 'sections'; try { mode = localStorage.getItem('ui:packView') || mode; } catch (e) {}
      if (!modes.some(function (o) { return o[0] === mode; })) mode = 'sections';
      var holder = el('div');
      if (modes.length > 1) {
        var seg = el('div.seg', { role: 'tablist' }, modes.map(function (o) {
          return el('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === o[0]), text: o[1], onclick: function () {
            mode = o[0]; try { localStorage.setItem('ui:packView', mode); } catch (e) {}
            seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b.textContent === o[1])); });
            draw();
          } });
        }));
        page.appendChild(el('div.view-switch', null, [el('span.muted', { text: 'View:' }), seg]));
      }
      page.appendChild(holder);
      function row(it, nested) {
        var p = prog[it.id];
        var href = '#/pack/' + encodeURIComponent(id) + '/' + encodeURIComponent(it.id);
        var parent = it.for && byId[it.for];
        var sub = (mode === 'modules' || nested ? TYPE[it.type] + ' · ' : '') + [it.estimatedTime, it.description, it.size && it.type === 'material' ? fmtSize(it.size) : ''].filter(Boolean).join(' · ');
        return el('div.item-row.t-' + it.type + (nested ? '.sub' : ''), { role: 'link', tabindex: 0, onclick: function () { location.hash = href; }, onkeydown: function (e) { if (e.key === 'Enter') location.hash = href; } }, [
          el('div.item-ico', { text: ICON[it.type] }),
          el('div', null, [el('div.item-title', null, [it.title, parent && !nested ? el('span.for-tag', { text: '↳ ' + parent.title }) : null,
            it.prerequisite ? el('span.nc-tag', { text: 'prerequisite · not counted', title: 'Optional refresher — not counted in your progress or certificate' })
              : parent ? el('span.nc-tag', { text: 'not counted', title: 'Material of “' + parent.title + '” — not counted in your progress' }) : null]), el('div.item-sub', { text: sub })]),
          statusChip(p),
          el('a.btn.small', { href: href, text: p && p.completedAt ? 'Review' : p ? 'Continue' : 'Open', onclick: function (e) { e.stopPropagation(); } })]);
      }
      var nestKids = false;
      function group(cls, num, title, sub, its, noCount) {
        var cits = noCount ? its : its.filter(function (it) { return counts(it, byId); });
        var done = cits.filter(function (it) { return (prog[it.id] || {}).completedAt; }).length;
        var box = el('section.module' + cls, null, [el('div.module-head', null, [el('span.num', { text: num }), el('div.grow', null, [el('h2', { text: title }), sub ? el('div.mdesc', { text: sub }) : null]), el('span.mprog', { text: cits.length ? done + ' / ' + cits.length : '' })])]);
        its.forEach(function (it) {
          box.appendChild(row(it));
          if (nestKids) (kids[it.id] || []).forEach(function (k) { box.appendChild(row(k, true)); });
        });
        holder.appendChild(box);
      }
      function draw() {
        T.clear(holder);
        if (mode === 'plan') return window.PlanUI.packPlanView(holder, id, m, PL, prog);
        nestKids = mode !== 'sections';
        /* prerequisites: optional refreshers before the course, never counted */
        var pre = items.filter(function (it) { return it.prerequisite; });
        if (pre.length) group('.prereq', '0', 'Before you start — prerequisites', 'Optional refreshers for what this course assumes you know. They are not counted in your progress or certificate.', pre, true);
        if (mode === 'sections') {
          SECTIONS.forEach(function (sec) {
            var its = items.filter(function (it) { return it.type === sec.type && !it.prerequisite; });
            if (its.length) group('.sec.t-' + sec.type, ICON[sec.type], sec.title + ' (' + its.length + ')', sec.sub, its);
          });
        } else {
          /* attached items appear under their parent, not as rows of their own */
          var isKid = function (x) { return byId[x] && ((byId[x].for && byId[byId[x].for]) || byId[x].prerequisite); };
          var mods = (m.modules || []).map(function (md) { return Object.assign({}, md, { items: (md.items || []).filter(function (x) { return !isKid(x); }) }); });
          var placed = {}; mods.forEach(function (md) { (md.items || []).forEach(function (x) { placed[x] = 1; }); });
          var rest = (m.items || []).filter(function (it) { return !placed[it.id] && !isKid(it.id); });
          if (rest.length) mods.push({ id: '_other', title: 'Other', items: rest.map(function (x) { return x.id; }) });
          mods.forEach(function (md, k) { group('', String(k + 1), md.title, md.description, (md.items || []).map(function (x) { return byId[x]; }).filter(Boolean)); });
        }
      }
      draw();
    }).catch(function (e) { page.appendChild(el('div.empty', null, [el('h2', { text: 'Pack not available' }), el('p', { text: e.message }), el('a.btn', { href: '#/library', text: '← Library' })])); });
  }
  function packDetails(P) {
    var m = P.manifest;
    var dl = el('dl.kv', null, [
      el('dt', { text: 'Pack id' }), el('dd', { text: m.id }),
      el('dt', { text: 'Version' }), el('dd', { text: m.version }),
      el('dt', { text: 'Publisher' }), el('dd', { text: m.publisher || '—' }),
      el('dt', { text: 'Authors' }), el('dd', { text: (m.authors || []).join(', ') || '—' }),
      el('dt', { text: 'Built' }), el('dd', { text: fmtDate(m.created) }),
      el('dt', { text: 'Installed' }), el('dd', { text: fmtDate(P.installedAt) }),
      el('dt', { text: 'Signature' }), el('dd', { text: P.signature + (P.signedBy ? ' (' + P.signedBy + ')' : '') }),
      el('dt', { text: 'Formats' }), el('dd', { text: 'pack ' + m.format + ', needs app ≥ ' + m.minAppVersion }),
      el('dt', { text: 'Built for app' }), el('dd', { text: (m.builder && m.builder.targetApp) || '—' })]);
    var c = m.contact || {}, contact = null;
    if (c.name || c.email || c.url || c.instructions) {
      var actions = [];
      if (c.email) actions.push(el('button.btn.small', { type: 'button', text: 'Email author', onclick: function () { api.app.openExternal('mailto:' + encodeURIComponent(c.email)); } }));
      if (c.url) actions.push(el('button.btn.small', { type: 'button', text: 'Open publisher site', onclick: function () { api.app.openExternal(c.url); } }));
      contact = el('section.panel', null, [el('h3', { text: 'Feedback contact' }),
        c.name ? el('p', { text: c.name }) : null,
        c.instructions ? el('p.muted', { text: c.instructions }) : null,
        c.email ? el('p.muted', { text: c.email }) : null,
        actions.length ? el('div.ui-actions', null, actions) : null]);
    }
    var mo = modal('Pack details', [dl, contact], [
      el('button.btn.danger', { type: 'button', text: 'Remove from library', onclick: function () {
        if (!confirm('Remove "' + m.title + '" from this computer? Progress of all users is kept and comes back if you add the pack again.')) return;
        api.packs.remove(m.id).then(function () { mo.close(); toast('Removed: ' + m.title); location.hash = '#/library'; });
      } }),
      el('button.btn.primary', { type: 'button', text: 'Close', onclick: function () { mo.close(); } })]);
  }

  /* ---------------- item players ---------------- */
  function itemPage(packId, itemId, sub) {
    var main = shell('library');
    api.packs.get(packId).then(function (P) {
      var m = P.manifest, items = orderedItems(m);
      var idx = items.findIndex(function (it) { return it.id === itemId; });
      if (idx < 0) { location.hash = '#/pack/' + encodeURIComponent(packId); return; }
      var it = items[idx];
      var saved = el('span.saved-dot');
      var link = function (x) { return '#/pack/' + encodeURIComponent(packId) + '/' + encodeURIComponent(x.id); };
      var view = el('div.item-view', null, [
        el('div.item-bar', null, [
          el('div.crumb', null, [el('a', { href: '#/pack/' + encodeURIComponent(packId), text: '← ' + m.title }), el('span', { text: '/' }), el('span.type-tag', { text: TYPE[it.type] }), el('strong', { text: it.title }),
            it.prerequisite ? el('span.nc-tag', { text: 'prerequisite · not counted' }) : (it.for && m.items.some(function (x) { return x.id === it.for; })) ? el('span.nc-tag', { text: 'not counted' }) : null]),
          saved,
          idx > 0 ? el('a.btn.small', { href: link(items[idx - 1]), title: items[idx - 1].title, text: '‹ Previous' }) : null,
          idx < items.length - 1 ? el('a.btn.small', { href: link(items[idx + 1]), title: items[idx + 1].title, text: 'Next ›' }) : null]),
        el('div.item-body')]);
      main.appendChild(view);
      var body = view.lastChild;
      function save(state, percent, completed) {
        return api.progress.set(packId, it.id, it.type, state, percent, !!completed).then(function () {
          saved.textContent = '✓ Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }).catch(function (e) { saved.textContent = '⚠ ' + e.message; });
      }
      api.progress.get(packId, it.id).then(function (prev) {
        var base = 'stl://pack/' + encodeURIComponent(packId) + '/';
        if (it.type === 'training') openTraining(body, base + it.path + '/index.html' + (sub === 'certificate' ? '#certificate' : ''), prev, save);
        else if (it.type === 'project') S.cleanup = window.ProjectsUI.open({ host: body, packId: packId, item: it, base: base + it.path + '/', state: prev ? prev.state : null, save: save, tab: sub });
        else if (it.type === 'reading' && /\.(md|markdown)$/i.test(it.file)) S.cleanup = window.MarkdownView.open({ host: body, url: base + it.file, title: it.title, state: prev ? prev.state : null, save: save, toast: toast });
        else if (it.type === 'reading') openReading(body, base + it.file, prev, save);
        else if (it.type === 'lab') openLab(body, base + it.path, Object.assign({}, it, { attached: (attached(m)[it.id] || []).map(function (k) { return Object.assign({}, k, { progress: P.progress[k.id] || null }); }) }), prev, save, packId);
        else if (it.type === 'video') S.cleanup = window.MediaView.video({ host: body, item: it, url: it.file ? base + it.file : null, poster: it.poster ? base + it.poster : null, state: prev ? prev.state : null, save: save });
        else if (it.type === 'material') S.cleanup = window.MediaView.material({ host: body, item: it, url: it.file ? base + it.file : null, packId: packId, state: prev ? prev.state : null, save: save, toast: toast });
      });
    });
  }

  /* training: the training engine runs in an iframe (stl://pack origin) and talks to us with postMessage */
  function openTraining(body, url, prev, save) {
    var frame = el('iframe', { src: url, title: 'Training' });
    function onMsg(e) {
      if (e.source !== frame.contentWindow) return;
      var d = e.data || {}; if (d.source !== 'semitec-training') return;
      if (d.type === 'requestState') {
        frame.contentWindow.postMessage({ target: 'semitec-training', type: 'init', state: prev ? prev.state : null,
          user: { id: String(S.user.id), name: S.user.displayName }, lockName: true }, 'stl://pack');
      } else if ((d.type === 'progress' || d.type === 'state') && d.detail && d.detail.state) {
        var st = d.detail.state; prev = { state: st };
        save(st, st.percent || 0, !!st.completedAt);
      }
    }
    window.addEventListener('message', onMsg);
    S.cleanup = function () { window.removeEventListener('message', onMsg); };
    body.appendChild(frame);
  }

  /* reading: PDF with page tracking. Completed when 90 % of the pages were seen (or marked). */
  function openReading(body, url, prev, save) {
    var st = Object.assign({ pages: 0, seen: [], last: 1, completed: false }, prev ? prev.state : {});
    var ctl = null, t = null;
    function pct() { return st.completed ? 100 : st.pages ? Math.round(100 * st.seen.length / st.pages) : 0; }
    function persist(now) {
      clearTimeout(t);
      t = setTimeout(function () { save(st, pct(), st.completed); }, now ? 0 : 800);
    }
    var markBtn = el('button.btn.small.primary', { type: 'button', text: st.completed ? '✓ Finished' : 'Mark as finished', onclick: function () {
      st.completed = !st.completed; markBtn.textContent = st.completed ? '✓ Finished' : 'Mark as finished'; persist(true);
    } });
    var info = el('span.zoomv', { style: { minWidth: '90px' } });
    function updInfo() { info.textContent = pct() + '% read'; }
    window.PDFView.open(body, url, {
      startPage: st.last || 1, extraButtons: [info, markBtn],
      onReady: function (total) { st.pages = total; updInfo(); },
      onPage: function (n) { st.last = n; persist(); },
      onSeen: function (n, total) {
        if (st.seen.indexOf(n) < 0) st.seen.push(n);
        if (!st.completed && st.seen.length >= Math.ceil(total * 0.9)) { st.completed = true; markBtn.textContent = '✓ Finished'; toast('Reading completed ✓'); }
        updInfo(); persist();
      }
    }).then(function (c) { ctl = c; });
    S.cleanup = function () { clearTimeout(t); save(st, pct(), st.completed); if (ctl) ctl.destroy(); };
  }

  function openLab(body, base, it, prev, save, packId) {
    fetch(base + '/lab.json').then(function (r) { if (!r.ok) throw new Error('lab.json missing'); return r.json(); }).then(function (lab) {
      var v = window.LabView.open({ host: body, lab: lab, item: it, base: base, packId: packId, state: prev ? prev.state : null, save: save, toast: toast });
      S.cleanup = function () { v.destroy(); };
    }).catch(function (e) { body.appendChild(el('p.ui-error', { text: e.message })); });
  }

  /* ---------------- settings: My account · Application · About ---------------- */
  function themeKey() { return 'ui:theme:' + (S.user ? S.user.username : ''); }
  function settingsPage(tab) {
    var main = shell('settings');
    var page = el('div.ui-page'); main.appendChild(page);
    tab = ['account', 'application', 'about'].indexOf(tab) >= 0 ? tab : 'account';
    page.appendChild(el('div.ui-head', null, [el('h1', { text: 'Settings' })]));
    page.appendChild(el('div.set-tabs', { role: 'tablist' }, [['account', '👤 My account', 'Only for you'], ['application', '🖥 Application', 'For everyone on this computer'], ['about', 'ⓘ About', '']].map(function (t) {
      return el('a', { href: '#/settings/' + t[0], role: 'tab', 'aria-selected': String(tab === t[0]) }, [el('strong', { text: t[1] }), t[2] ? el('small', { text: t[2] }) : null]);
    })));
    var wrap = el('div.settings'); page.appendChild(wrap);
    api.app.info().then(function (info) {
      S.info = info;
      if (tab === 'account') accountTab(wrap);
      else if (tab === 'application') applicationTab(wrap, info);
      else aboutTab(wrap, info);
    });
  }
  function accountTab(wrap) {
    var nameIn = el('input', { type: 'text', value: S.user.displayName });
    var e1 = el('div.ui-error');
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Profile' }),
      el('p.muted', { text: 'Username: @' + S.user.username + ' · account created ' + fmtDate(S.user.createdAt) }),
      el('div.row', null, [el('label.field', null, [el('span', { text: 'Full name (used on certificates)' }), nameIn]),
        el('button.btn', { type: 'button', text: 'Save name', onclick: function () { api.auth.updateName(nameIn.value).then(function (u) { S.user = u; toast('Name saved'); settingsPage('account'); }).catch(function (x) { e1.textContent = x.message; }); } })]), e1]));
    var o = el('input', { type: 'password', autocomplete: 'current-password' }), n1 = el('input', { type: 'password', autocomplete: 'new-password' }), n2 = el('input', { type: 'password', autocomplete: 'new-password' });
    var e2 = el('div.ui-error');
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Password' }),
      el('div.row', null, [el('label.field', null, [el('span', { text: 'Current password' }), o]), el('label.field', null, [el('span', { text: 'New password' }), n1]), el('label.field', null, [el('span', { text: 'Repeat new password' }), n2]),
        el('button.btn', { type: 'button', text: 'Change password', onclick: function () {
          if (n1.value !== n2.value) { e2.textContent = 'The new passwords do not match'; return; }
          api.auth.changePassword({ oldPassword: o.value, newPassword: n1.value }).then(function () { toast('Password changed'); o.value = n1.value = n2.value = ''; e2.textContent = ''; }).catch(function (x) { e2.textContent = x.message; });
        } })]), e2]));
    var cur = currentTheme();
    var sel = el('select', null, ['foundation', 'midnight', 'paper'].map(function (t) { return el('option', { value: t, selected: t === cur, text: t.charAt(0).toUpperCase() + t.slice(1) }); }));
    sel.addEventListener('change', function () { try { localStorage.setItem(themeKey(), sel.value); } catch (e) {} applyTheme(); });
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Appearance' }), el('div.row', null, [el('label.field', null, [el('span', { text: 'My app theme (trainings have their own View menu)' }), sel])])]));
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'My data' }),
      el('p.muted', { text: 'Your progress, plans and notes as one JSON file (a backup, or to move to another computer later).' }),
      el('div.ui-actions', null, [el('button.btn.small', { type: 'button', text: '⇩ Export my progress', onclick: exportProgress })])]));
  }
  function applicationTab(wrap, info) {
    /* catalog sources */
    var srcBox = el('div.src-list');
    function drawSources() {
      api.catalog.sources().then(function (list) {
        T.clear(srcBox);
        if (!list.length) srcBox.appendChild(el('p.muted', { text: 'No sources yet.' }));
        list.forEach(function (s) {
          srcBox.appendChild(el('div.src-row', null, [el('span.src-ico', { text: s.type === 'url' ? '🔗' : '📁' }), el('div.grow', null, [el('strong', { text: s.name || '' }), el('div.muted.small.mono', { text: s.url || s.path })]),
            el('button.btn.small', { type: 'button', text: 'Remove', onclick: function () { api.catalog.remove(s.id).then(drawSources); } })]));
        });
      });
    }
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Catalog sources' }),
      el('p.muted', { text: 'Where the Catalog looks for packages: folders with .stlp files (shared drive, OneDrive, USB) and catalog links published by the SemiTec Foundation, partner companies or universities. Shared by all users of this computer.' }),
      srcBox, el('div.ui-actions', null, window.CatalogUI.sourceButtons(drawSources))]));
    drawSources();
    var keyBox = el('div.src-list'), keyError = el('div.ui-error');
    function drawPublisherKeys() {
      api.app.publisherKeys().then(function (keys) {
        T.clear(keyBox);
        if (!keys.length) keyBox.appendChild(el('p.muted', { text: 'No partner publisher keys have been added.' }));
        keys.forEach(function (k) {
          keyBox.appendChild(el('div.src-row', null, [el('span.src-ico', { text: '🔑' }), el('div.grow', null, [el('strong', { text: k.name }), el('div.muted.small.mono', { text: k.keyId })]),
            el('button.btn.small', { type: 'button', text: 'Remove', onclick: function () {
              if (!confirm('Stop trusting packages signed by ' + k.name + '? Installed packages are not removed.')) return;
              api.app.removePublisherKey(k.keyId).then(drawPublisherKeys).catch(function (e) { keyError.textContent = e.message; });
            } })]));
        });
      }).catch(function (e) { keyError.textContent = e.message; });
    }
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Trusted publishers' }),
      el('p.muted', { text: 'Add a publisher’s Ed25519 public key to install packages they sign. This is your decision for this computer; it is not a SemiTec Foundation approval. Confirm the key fingerprint with the publisher through a trusted channel.' }),
      keyBox, el('div.ui-actions', null, [el('button.btn.small', { type: 'button', text: 'Add publisher key…', onclick: function () {
        keyError.textContent = '';
        api.app.choosePublisherKey().then(function (k) {
          if (!k) return;
          var name = prompt('Publisher name for packages signed by this key:', k.suggestedName);
          if (name == null) return;
          if (!confirm('Trust packages signed by “' + name + '”?\n\nKey fingerprint: ' + k.keyId)) return;
          api.app.addPublisherKey(k.file, name).then(function () { toast('Publisher key added'); drawPublisherKeys(); }).catch(function (e) { keyError.textContent = e.message; });
        }).catch(function (e) { keyError.textContent = e.message; });
      } })]), keyError]));
    drawPublisherKeys();
    var e3 = el('div.ui-error');
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Data on this computer' }),
      el('p.muted', { text: 'Accounts, progress and installed packages of all users are stored in this folder. Back it up to keep everything.' }),
      el('div.path', { text: info.dataDir }),
      el('div.ui-actions', null, [el('button.btn.small', { type: 'button', text: 'Open folder', onclick: function () { api.app.openDataFolder(); } }),
        el('button.btn.small', { type: 'button', text: 'Move data to another folder…', onclick: function () {
          api.app.chooseFolder().then(function (d) { if (!d) return; return api.app.moveData(d).then(function (r) { toast('Data moved to ' + r.dataDir + '. The old folder can be deleted.'); settingsPage('application'); }); }).catch(function (x) { e3.textContent = x.message; });
        } })]), e3]));
    var dev = el('input', { type: 'checkbox', checked: info.devMode });
    dev.addEventListener('change', function () { api.app.setDevMode(dev.checked).then(function (v) { toast(v ? 'Developer mode on' : 'Developer mode off'); }); });
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Developer mode' }),
      el('label.switch', null, [dev, el('span', { text: 'Allow installing packages that are unsigned or signed with an unknown key. Use this only for local drafts and testing; add a publisher key for normal partner packages.' })])]));
  }
  function aboutTab(wrap, info) {
    var caps = info.capabilities;
    function open(url) { return function () { api.app.openExternal(url).catch(function (e) { toast(e.message); }); }; }
    wrap.appendChild(el('section.panel.foundation-about', null, [el('h2', { text: 'About SemiTec Foundation' }),
      el('p', { text: 'SemiTec Foundation develops learning tools and resources for semiconductor and electronics education. Visit the Foundation website to follow its goals, aims and projects as the site develops.' }),
      el('div.ui-actions', null, [
        el('button.btn.small', { type: 'button', text: 'Foundation website', onclick: open('https://semitec.org') }),
        el('button.btn.small', { type: 'button', text: 'Academy on GitHub', onclick: open('https://github.com/SemiTecFoundation/semitec-academy') }),
        el('button.btn.small', { type: 'button', text: 'Academy Templates on GitHub', onclick: open('https://github.com/SemiTecFoundation/semitec-academy-skills') })
      ])]));
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Create and deliver learning materials' }),
      el('p.muted', { text: 'Academy Templates contains the skills for making labs, trainings and project briefs. Those materials can remain standalone, or selected materials can be packaged for Academy.' }),
      el('img.about-diagram', { src: 'assets/authoring-flow.png', alt: 'Academy Templates authoring and packaging flow: standalone materials can be used independently or packaged as a learning package for Academy.' })]));
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'SemiTec Academy' }),
      el('dl.kv', null, [el('dt', { text: 'App version' }), el('dd', { text: info.version }),
        el('dt', { text: 'Opens formats' }), el('dd', { text: Object.keys(caps).filter(function (k) { return Array.isArray(caps[k]); }).map(function (k) { return k + ' ' + caps[k].join(','); }).join(' · ') }),
        el('dt', { text: 'Training engine' }), el('dd', { text: info.engine.engine + ' (format ' + info.engine.trainingFormat + ', ' + info.engine.sha256 + ')' }),
        el('dt', { text: 'Runtime' }), el('dd', { text: 'Electron ' + info.electron + ' · ' + info.platform })])]));
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'Rights and names' }),
      el('p', { text: '© 2026 SemiTec Foundation. All rights not expressly granted are reserved. The application source is licensed under Apache-2.0. SemiTec Foundation and SemiTec Academy names, marks and logos are reserved; learning packages and certificates remain subject to the responsible publisher’s stated rights.' })]));
    wrap.appendChild(el('section.panel', null, [el('h2', { text: 'What’s new' }), el('div.news', null, (info.history || []).slice().reverse().map(function (h) { return el('p', null, [el('strong', { text: h.app + ' — ' }), h.notes]); }))]));
  }

  if (window.PDFView) boot(); else window.addEventListener('pdfview-ready', boot, { once: true });
})();
