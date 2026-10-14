/* projects.js — projects (diploma / research) from packages: the Projects page and the project view
   (Plan with weekly check-off and notes, Overview, Learning path, Assessment, Brief PDF). App 1.4.0.
   A project item is a folder with project.json made by the project-brief template (tools/brief2project.py).
   Progress state: { weeks: { "<n>": doneAt }, notes: { "<n>": text } } — percent = weeks ticked. */
(function () {
  function U() { return window.UI; }
  var TABS = [['plan', '📅 Plan'], ['overview', 'ⓘ Overview'], ['learning', '📚 Learning path'], ['assessment', '✔ Assessment'], ['brief', '📄 Brief']];
  var LEVEL = { apply: 'Apply', understand: 'Understand', aware: 'Be aware' };
  function md(s) { return window.MD ? MD.inline(String(s || '')) : String(s || ''); }

  /* ---------- Projects page ---------- */
  var CATS = { research: 'Research', diploma: 'Diploma', thesis: 'Thesis', 'course-project': 'Course project', capstone: 'Capstone', internship: 'Internship', other: 'Other' };
  function catName(c) { return CATS[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other'); }
  function listPage(main, which) {
    var el = U().el;
    var page = el('div.ui-page'); main.appendChild(page);
    page.appendChild(el('div.ui-head', null, [el('div', null, [el('h1', { text: 'Projects' }), el('p.sub', { text: 'Diploma, thesis, research and course projects from your packages. Enroll to get the weekly plan in your calendar.' })])]));
    U().api.projects.list().then(function (list) {
      if (!list.length) {
        page.appendChild(el('div.empty', null, [el('div', { style: { fontSize: '3rem' }, text: '🎓' }), el('h2', { text: 'No projects yet' }),
          el('p', { text: 'Projects come in course packages. Add a package with projects from the Catalog or the Library.' }), el('a.btn', { href: '#/catalog', text: 'Open the catalog' })]));
        return;
      }
      var mine = list.filter(function (p) { return p.enrollment; });
      /* the tab is page state: switching never depends on the URL (fixes "My projects" when it is empty) */
      var F = { tab: which === 'mine' || which === 'all' ? which : (mine.length ? 'mine' : 'all'), cat: 'any', pub: 'any', q: '' };
      var q = el('input.lib-search', { type: 'search', placeholder: 'Search projects by title, area, supervisor…', 'aria-label': 'Search projects' });
      var seg = el('div.seg', { role: 'tablist' });
      [['mine', 'My projects', mine.length], ['all', 'All projects', list.length]].forEach(function (o) {
        seg.appendChild(el('button', { type: 'button', role: 'tab', 'data-k': o[0], 'aria-selected': String(F.tab === o[0]), onclick: function () {
          F.tab = o[0]; history.replaceState(null, '', '#/projects/' + o[0]); syncTabs(); draw();
        } }, [o[1], el('span.cnt', { text: String(o[2]) })]));
      });
      function syncTabs() { seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-k') === F.tab)); }); }
      var pubs = {}; list.forEach(function (p) { pubs[p.publisher || 'Unknown publisher'] = 1; });
      var pubSel = el('select', { 'aria-label': 'Publisher' }, [el('option', { value: 'any', text: 'All publishers' })].concat(Object.keys(pubs).sort().map(function (n) { return el('option', { value: n, text: n }); })));
      pubSel.addEventListener('change', function () { F.pub = pubSel.value; draw(); });
      var cats = {}; list.forEach(function (p) { cats[p.category] = (cats[p.category] || 0) + 1; });
      var chips = el('div.cat-chips', { role: 'group', 'aria-label': 'Category' });
      function chip(k, label, n) {
        return el('button.cat-chip', { type: 'button', 'data-k': k, 'aria-pressed': String(F.cat === k), onclick: function () {
          F.cat = k; chips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === F.cat)); }); draw();
        } }, [label, el('span.cnt', { text: String(n) })]);
      }
      chips.appendChild(chip('any', 'All categories', list.length));
      Object.keys(CATS).concat(Object.keys(cats).filter(function (c) { return !CATS[c]; })).forEach(function (c) { if (cats[c]) chips.appendChild(chip(c, catName(c), cats[c])); });
      page.appendChild(el('div.lib-tools', null, [q, seg, pubSel]));
      page.appendChild(chips);
      var grid = el('div.grid.proj-grid'); page.appendChild(grid);
      function draw() {
        var words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
        T.clear(grid);
        (F.tab === 'mine' ? mine : list).filter(function (p) {
          if (F.cat !== 'any' && p.category !== F.cat) return false;
          if (F.pub !== 'any' && (p.publisher || 'Unknown publisher') !== F.pub) return false;
          var t = [p.title, p.summary, p.workType, p.level, p.packTitle, p.publisher, catName(p.category), p.supervisors.join(' '), p.areas.join(' ')].join(' ').toLowerCase();
          return words.every(function (w) { return t.indexOf(w) >= 0; });
        }).forEach(function (p) {
          var href = '#/pack/' + encodeURIComponent(p.packId) + '/' + encodeURIComponent(p.itemId);
          grid.appendChild(el('a.proj-card', { href: href }, [
            el('div.proj-top', null, [el('span.proj-ico', { text: '🎓' }), el('div', null, [el('div.proj-kind', null, [el('span.cat-badge.c-' + p.category, { text: catName(p.category) }), [p.durationWeeks ? p.durationWeeks + ' weeks' : '', p.slots > 1 ? p.slots + ' students' : ''].filter(Boolean).join(' · ')]), el('h3', { text: p.title })])]),
            el('p.desc', { html: md(p.summary) }),
            el('div.counts', null, p.areas.slice(0, 4).map(function (a) { return el('span.chip-s', { text: a }); })),
            U().publisherLine(p.publisher, p.publisherLogo, p.supervisors.length ? 'supervisor ' + p.supervisors.join(', ') : ''),
            p.enrollment ? el('div', null, [el('div.progress-line', null, [U().bar(p.percent), el('span', { text: p.percent + '%' })]),
              el('div.meta', { text: p.finished ? '✓ All weeks done' : 'Week ' + Math.max(1, p.weekNow) + ' of ' + p.durationWeeks + ' · ends ' + U().day(p.end) })])
              : el('span.status', { text: 'Not enrolled' })]));
        });
        if (!grid.children.length) grid.appendChild(el('div.empty.span-all', null, [
          el('h2', { text: F.tab === 'mine' && !mine.length ? 'You are not enrolled in a project yet' : 'Nothing found' }),
          F.tab === 'mine' && !mine.length ? el('p', { text: 'Open a project from “All projects” and press “Enroll in this project”.' }) : el('p', { text: 'No project matches the search and filters.' }),
          F.tab === 'mine' && !mine.length ? el('button.btn', { type: 'button', text: 'See all projects', onclick: function () { F.tab = 'all'; history.replaceState(null, '', '#/projects/all'); syncTabs(); draw(); } }) : null]));
      }
      q.addEventListener('input', draw);
      draw();
    }).catch(function (e) { page.appendChild(el('p.ui-error', { text: e.message })); });
  }

  /* ---------- project view (item page) ---------- */
  function open(o) {
    var el = U().el;
    var root = el('div.proj-view'); o.host.appendChild(root);
    var st = Object.assign({ weeks: {}, notes: {} }, o.state || {});
    var pdf = null, saveT = null, dirty = false;
    function persist(now) {
      dirty = true;
      clearTimeout(saveT);
      saveT = setTimeout(function () {
        var total = (P.project.weeks || []).length, done = (P.project.weeks || []).filter(function (w) { return st.weeks[String(w.week)]; }).length;
        dirty = false;
        o.save(st, total ? Math.round(100 * done / total) : 0, total > 0 && done === total);
      }, now ? 0 : 700);
    }
    /* compact header: shrinks while scrolling down, comes back only at the top of the scrolled area */
    var compact = false, lastY = {}, quiet = 0;
    function setCompact(on) { if (on === compact) return; compact = on; root.classList.toggle('compact', on); quiet = Date.now() + 250; }
    root.addEventListener('scroll', function (e) {
      var t = e.target, y = t.scrollTop || 0, key = t === root ? 'root' : (t.className || 'x');
      var prev = lastY[key] == null ? y : lastY[key]; lastY[key] = y;
      if (Date.now() < quiet) return;
      /* expand only when the scrolled area is back at its very top (nothing left to scroll up) */
      if (y <= 0) setCompact(false);
      else if (y > 40 && y > prev + 2) setCompact(true);
    }, true);
    var P = null, tab = o.tab && TABS.some(function (t) { return t[0] === o.tab; }) ? o.tab : null;
    if (!tab) { try { tab = localStorage.getItem('ui:projTab') || 'plan'; } catch (e) { tab = 'plan'; } }
    function load() {
      return U().api.plan.project(o.packId, o.item.id).then(function (r) { P = r; render(); }).catch(function (e) { root.appendChild(el('p.ui-error', { text: e.message })); });
    }
    function render() {
      if (pdf) { pdf.destroy(); pdf = null; }
      T.clear(root);
      var p = P.project, en = P.enrollment, plan = P.plan;
      var total = (p.weeks || []).length, done = (p.weeks || []).filter(function (w) { return st.weeks[String(w.week)]; }).length;
      var pct = total ? Math.round(100 * done / total) : 0;
      var again = function () { load(); };
      var head = el('div.proj-head', null, [
        el('div.grow.proj-title', null, [el('div.proj-kind', { text: [catName(o.item.category || p.category || 'other'), p.workType, p.level && p.level !== p.workType ? p.level : '', p.durationWeeks ? p.durationWeeks + ' weeks' : '', p.slots > 1 ? p.slots + ' students' : '1 student'].filter(Boolean).join(' · ') }),
          el('h1', { text: p.title }), p.subtitle ? el('div.muted', { text: p.subtitle }) : null,
          el('div.progress-line', null, [U().bar(pct), el('span', { text: done + ' / ' + total + ' weeks done' })])]),
        en ? el('div.plan-box.on', null, [el('div.grow', null, [el('strong', { text: 'Enrolled' }), el('div.muted.small.pb-sub', { text: plan.weekNow < 1 ? 'starts ' + U().day(en.startDate) : plan.weekNow > total ? 'plan ended ' + U().day(plan.end) : 'week ' + plan.weekNow + ' of ' + p.durationWeeks + ' · ends ' + U().day(plan.end) })]),
          el('button.btn.small', { type: 'button', text: 'Change start', onclick: function () { window.PlanUI.enrollDialog({ packId: o.packId, itemId: o.item.id, title: p.title, weeks: p.durationWeeks || total, enrollment: en, onDone: again }); } }),
          el('button.btn.small', { type: 'button', text: 'Leave', onclick: function () { window.PlanUI.leave(o.packId, o.item.id, p.title, again); } })])
          : el('button.btn.primary', { type: 'button', text: '📅 Enroll in this project', onclick: function () { window.PlanUI.enrollDialog({ packId: o.packId, itemId: o.item.id, title: p.title, weeks: p.durationWeeks || total, onDone: again }); } })]);
      var tabs = el('div.proj-tabs', { role: 'tablist' }, TABS.filter(function (t) {
        return t[0] !== 'learning' || (p.learning || []).length; }).filter(function (t) { return t[0] !== 'assessment' || (p.assessment || []).length; }).filter(function (t) { return t[0] !== 'brief' || p.brief; }).map(function (t) {
        return el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === t[0]), text: t[1], onclick: function () { tab = t[0]; try { localStorage.setItem('ui:projTab', tab); } catch (e) {} render(); } });
      }));
      var body = el('div.proj-body' + (tab === 'brief' ? '.pdf' : ''));
      root.append(el('div.proj-top-wrap', null, [head, tabs]), body);
      if (tab === 'plan') planTab(body, p, en, plan);
      else if (tab === 'overview') overviewTab(body, p, plan);
      else if (tab === 'learning') learningTab(body, p);
      else if (tab === 'assessment') assessmentTab(body, p);
      else if (tab === 'brief') window.PDFView.open(body, o.base + p.brief, {}).then(function (c) { pdf = c; });
    }
    function planTab(body, p, en, plan) {
      var wrap = el('div.proj-inner');
      if (!en) wrap.appendChild(el('div.okbox', { text: 'Enroll to map these ' + (p.durationWeeks || p.weeks.length) + ' weeks onto your calendar from the day you start. You can tick weeks and keep notes either way.' }));
      var t0 = P.today;
      var byWeek = {}; (plan ? plan.weeks : []).forEach(function (w) { byWeek[w.week] = w; });
      var msAt = {}; (p.milestones || []).forEach(function (m) { var to = Array.isArray(m.weeks) ? m.weeks[1] : m.weeks || m.week; (msAt[to] = msAt[to] || []).push(m); });
      var phase = null, list = el('div.week-list');
      (p.weeks || []).forEach(function (w) {
        if (w.phase && w.phase !== phase) { phase = w.phase; list.appendChild(el('div.week-phase', { text: phase })); }
        var key = String(w.week), d = byWeek[w.week];
        var doneAt = st.weeks[key];
        var status = doneAt ? 'done' : d ? (d.end < t0 ? 'overdue' : d.start <= t0 ? 'current' : 'upcoming') : null;
        var cb = el('input', { type: 'checkbox', checked: !!doneAt, 'aria-label': 'Week ' + w.week + ' done' });
        var note = el('textarea.week-note', { rows: 2, placeholder: 'Notes for the weekly meeting: what was done, what is blocked, next steps…', value: st.notes[key] || '' });
        note.value = st.notes[key] || '';
        note.addEventListener('input', function () { if (note.value.trim()) st.notes[key] = note.value; else delete st.notes[key]; persist(); });
        var row = el('div.week-row' + (status ? '.s-' + status : ''), null, [
          el('label.week-ck', null, [cb]),
          el('div.week-when', null, [el('div.wk', { text: 'Week ' + w.week }), d ? el('div.dates', { text: U().dayShort(d.start) + ' – ' + U().dayShort(d.end) }) : null]),
          el('div.week-main', null, [el('div.week-tasks', { html: md(w.tasks) }), w.doneWhen ? el('div.week-done.muted.small', { html: '✔ Done when: ' + md(w.doneWhen) }) : null,
            el('details.week-notes', null, [el('summary', { text: st.notes[key] ? '📝 Notes' : '📝 Add notes' }), note])]),
          status ? window.PlanUI.chip(status) : el('span')]);
        if (st.notes[key]) row.querySelector('details').open = true;
        cb.addEventListener('change', function () {
          if (cb.checked) st.weeks[key] = new Date().toISOString(); else delete st.weeks[key];
          persist(true); setTimeout(render, 30);
        });
        list.appendChild(row);
        (msAt[w.week] || []).forEach(function (m) {
          var a = Array.isArray(m.weeks) ? m.weeks : [m.weeks, m.weeks];
          var ok = true; for (var k = a[0]; k <= a[1]; k++) if (!st.weeks[String(k)]) ok = false;
          list.appendChild(el('div.week-ms' + (ok ? '.ok' : ''), null, [el('span.ms-ico', { text: ok ? '✓' : '◆' }), el('div', null, [el('strong', { text: 'Milestone (weeks ' + a[0] + '–' + a[1] + '): ' }), el('span', { html: md(m.milestone) }), el('div.muted.small', { html: md(m.work) })])]));
        });
      });
      wrap.appendChild(list);
      body.appendChild(wrap);
    }
    function overviewTab(body, p, plan) {
      var w = el('div.proj-inner.overview');
      if (p.summary) w.appendChild(el('section', null, [el('h2', { text: 'Summary' }), el('p', { html: md(p.summary) })]));
      var kv = [['Work type', p.workType], ['Level', p.level], ['Students', p.slots], ['Duration', p.duration || (p.durationWeeks ? p.durationWeeks + ' weeks' : '')],
        ['Supervisors', (p.supervisors || []).join(', ')], ['Industry mentor', p.mentor], ['Partner', p.partner], ['Tools', p.tools], ['Prerequisites', p.prerequisites],
        ['Areas', (p.areas || []).join(', ')], ['Keywords', (p.keywords || []).join(', ')]].filter(function (x) { return x[1]; });
      w.appendChild(el('dl.kv', null, [].concat.apply([], kv.map(function (x) { return [el('dt', { text: x[0] }), el('dd', { html: md(String(x[1])) })]; }))));
      if ((p.goals || []).length) w.appendChild(el('section', null, [el('h2', { text: 'Goals' }), el('ol', null, p.goals.map(function (g) { return el('li', { html: md(g) }); }))]));
      if ((p.outcomes || []).length) w.appendChild(el('section', null, [el('h2', { text: 'What you will be able to do' }), el('ul', null, p.outcomes.map(function (g) { return el('li', { html: md(g) }); }))]));
      if ((p.deliverables || []).length) {
        var due = {}; (plan ? plan.deliverables : []).forEach(function (d) { due[d.title] = d.due; });
        w.appendChild(el('section', null, [el('h2', { text: 'Deliverables' }), el('table.ptable', null, [el('thead', null, [el('tr', null, ['Deliverable', 'Form', 'When', 'Due'].map(function (h) { return el('th', { text: h }); }))]),
          el('tbody', null, p.deliverables.map(function (d) { return el('tr', null, [el('td', { html: md(d.title) }), el('td', { html: md(d.form) }), el('td', { text: d.when || (d.dueWeek ? 'week ' + d.dueWeek : '') }), el('td', { text: due[d.title] ? U().day(due[d.title]) : '—' })]); }))])]));
      }
      body.appendChild(w);
    }
    function learningTab(body, p) {
      var w = el('div.proj-inner'), group = null, tb = el('tbody');
      p.learning.forEach(function (l) {
        if (l.group !== group) { group = l.group; tb.appendChild(el('tr.grp', null, [el('td', { colspan: 4, text: group })])); }
        tb.appendChild(el('tr', null, [el('td', { html: md(l.topic) }), el('td', null, [el('span.lvl.l-' + l.level, { text: LEVEL[l.level] || l.level })]), el('td', { html: md(l.usedFor) }), el('td.muted', { html: md(l.sources) })]));
      });
      w.append(el('p.muted', { text: 'What to learn for this project and how deep: Apply = use it in the project, Understand = explain it, Be aware = know it exists.' }),
        el('table.ptable', null, [el('thead', null, [el('tr', null, ['Topic', 'Level', 'Used for', 'Sources'].map(function (h) { return el('th', { text: h }); }))]), tb]));
      body.appendChild(w);
    }
    function assessmentTab(body, p) {
      var w = el('div.proj-inner');
      w.append(el('p.muted', { text: 'How the project is assessed. Aim for the right-hand columns.' }),
        el('table.ptable.rubric', null, [el('thead', null, [el('tr', null, ['Criterion', 'Weight', 'Pass', 'Good', 'Excellent'].map(function (h) { return el('th', { text: h }); }))]),
          el('tbody', null, p.assessment.map(function (c) { return el('tr', null, [el('td', null, [el('strong', { html: md(c.criterion) })]), el('td', { text: c.weight }), el('td', { html: md(c.pass) }), el('td', { html: md(c.good) }), el('td', { html: md(c.excellent) })]); }))]));
      body.appendChild(w);
    }
    load();
    return function () { if (dirty && P) { clearTimeout(saveT); persist(true); } if (pdf) pdf.destroy(); };
  }

  window.ProjectsUI = { listPage: listPage, open: open };
})();
