/* plan.js — enrollment and study plans: Enroll dialog, the plan box on the package page, the
   "Study plan" view, the "Today" panel of the library and the Calendar page (app 1.4.0).
   Plans are computed in the main process (shared/schedule.js) from the package / project. */
(function () {
  function U() { return window.UI; }
  var DAY = 86400000;
  function parse(d) { var p = String(d).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmt(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(d, n) { return fmt(parse(d) + n * DAY); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }
  function today() { return U().S.today || U().localToday(); }
  var STATUS = { done: ['✓ Done', 'done'], current: ['● This week', 'going'], overdue: ['! Overdue', 'late'], upcoming: ['Upcoming', ''], past: ['Due date passed', 'late'], none: ['—', ''] };
  function chip(st) { var x = STATUS[st] || [st, '']; return U().el('span.status' + (x[1] ? '.' + x[1] : ''), { text: x[0] }); }
  function itemHref(packId, id) { return '#/pack/' + encodeURIComponent(packId) + '/' + encodeURIComponent(id); }

  /* ---------- Course enrollment / project-plan dialog ----------
     o: { packId, itemId?, title, weeks (plan length or 0), source, current enrollment?, onDone } */
  function enrollDialog(o) {
    var el = U().el, en = o.enrollment;
    var start = el('input', { type: 'date', value: en ? en.startDate : today(), 'aria-label': 'Start date' });
    var hasPlan = o.weeks > 0;
    var mode = en ? (en.plan.mode || 'package') : (hasPlan ? 'package' : 'self');
    var finish = el('input', { type: 'date', value: en && en.plan.finishBy ? en.plan.finishBy : addDays(start.value, 7 * 8 - 1), 'aria-label': 'Finish by' });
    var preview = el('p.plan-preview');
    function radio(val, label, extra) {
      var r = el('input', { type: 'radio', name: 'plan-mode', value: val, checked: mode === val });
      r.addEventListener('change', function () { mode = val; upd(); });
      return el('label.plan-opt', null, [r, el('div', null, [el('strong', { text: label }), extra || null])]);
    }
    function upd() {
      var s = start.value;
      if (!s) { preview.textContent = ''; return; }
      if (o.itemId || mode === 'package') preview.textContent = hasPlan ? 'Week 1 starts ' + U().day(s) + ' · the plan ends ' + U().day(addDays(s, 7 * o.weeks - 1)) + ' (' + o.weeks + ' weeks).' : '';
      else if (mode === 'finishBy') preview.textContent = finish.value > s ? 'Items are spread over ' + Math.ceil((diff(s, finish.value) + 1) / 7) + ' weeks by their estimated time.' : 'The finish date must be after the start date.';
      else preview.textContent = 'No dates — learn at your own pace. You can add a plan later.';
    }
    start.addEventListener('input', upd); finish.addEventListener('input', upd);
    var body = [el('p.muted', { text: o.itemId ? 'The project plan (' + o.weeks + ' weeks) is put into your calendar from the start date. Tick each week when its work is done.' : 'Enrolling puts the course in “In progress”, adds its plan to your calendar and shows what is due on the Today panel.' }),
      el('label.field', null, [el('span', { text: 'Start date (week 1 begins on this day)' }), start])];
    if (!o.itemId) {
      body.push(el('div.plan-opts', null, [
        hasPlan ? radio('package', 'Follow the course plan', el('div.muted.small', { text: o.weeks + ' weeks, as planned by the author' + (o.source === 'items' ? ' (from the planned weeks of the items)' : '') })) : null,
        radio('finishBy', 'Finish by a date', el('div.plan-finish', null, [finish])),
        radio('self', 'Self-paced', el('div.muted.small', { text: 'no dates, no reminders' }))]));
    }
    body.push(preview);
    var err = el('div.ui-error'); body.push(err);
    upd();
    var m = U().modal(en ? 'Change plan — ' + o.title : (o.itemId ? 'Start project plan — ' : 'Enroll — ') + o.title, body, [
      el('button.btn', { type: 'button', text: 'Cancel', onclick: function () { m.close(); } }),
      el('button.btn.primary', { type: 'button', text: en ? 'Save plan' : (o.itemId ? '📅 Start plan' : '📅 Enroll'), onclick: function () {
        U().api.enroll.set(o.packId, o.itemId || null, { startDate: start.value, mode: o.itemId ? 'package' : mode, finishBy: finish.value })
          .then(function () { m.close(); U().toast(en ? 'Plan updated' : (o.itemId ? 'Project plan started — it is in your calendar' : 'Enrolled — the plan is in your calendar')); if (o.onDone) o.onDone(); })
          .catch(function (e) { err.textContent = e.message; });
      } })]);
    setTimeout(function () { start.focus(); }, 30);
  }
  function leave(packId, itemId, title, onDone) {
    if (!confirm('Leave "' + title + '"? The plan is removed from your calendar; your progress is kept.')) return;
    U().api.enroll.remove(packId, itemId || null).then(function () { U().toast('Left: ' + title); if (onDone) onDone(); });
  }

  /* ---------- plan box on the package page ---------- */
  function enrollBox(packId, m, PL) {
    var el = U().el, en = PL.enrollment, t = PL.template;
    var again = function () { U().route(); };
    if (!en) {
      return el('div.plan-box', null, [el('div.grow', null, [el('strong', { text: 'Study plan: ' }),
        el('span', { text: t.weeks ? t.weeks + ' weeks' + (t.source === 'package' ? ' planned by the author' : ' (planned weeks of the items)') : 'self-paced — choose your own finish date' })]),
        el('button.btn.primary.small', { type: 'button', text: '📅 Enroll', onclick: function () { enrollDialog({ packId: packId, title: m.title, weeks: t.weeks, source: t.source, onDone: again }); } })]);
    }
    var P = PL.plan, txt;
    if (P && P.entries.length) {
      var wk = P.weekNow < 1 ? 'starts ' + U().day(P.start) : P.weekNow > P.weeks ? 'plan ended ' + U().day(P.end) : 'week ' + P.weekNow + ' of ' + P.weeks + ' · ends ' + U().day(P.end);
      var late = P.entries.filter(function (e) { return e.status === 'overdue'; }).length;
      txt = [el('strong', { text: 'Enrolled ' }), el('span', { text: '· ' + wk }), late ? el('span.status.late', { text: late + ' overdue' }) : null];
    } else txt = [el('strong', { text: 'Enrolled ' }), el('span', { text: '· self-paced since ' + U().day(en.startDate) })];
    return el('div.plan-box.on', null, [el('div.grow', null, txt),
      el('button.btn.small', { type: 'button', text: 'Change plan', onclick: function () { enrollDialog({ packId: packId, title: m.title, weeks: t.weeks, source: t.source, enrollment: en, onDone: again }); } }),
      el('button.btn.small', { type: 'button', text: 'Leave', onclick: function () { leave(packId, null, m.title, again); } })]);
  }

  /* ---------- "Study plan" view of a package ---------- */
  function packPlanView(holder, packId, m, PL, prog) {
    var el = U().el, byId = {}, kids = {};
    (m.items || []).forEach(function (it) { byId[it.id] = it; if (it.for) (kids[it.for] = kids[it.for] || []).push(it); });
    var P = PL.plan, list;
    if (P && P.entries.length) list = P.entries;
    else {
      holder.appendChild(el('div.okbox', null, [PL.enrollment ? 'You are enrolled self-paced. ' : 'Enroll to put this plan into your calendar — week 1 starts on the day you choose. ',
        el('button.btn.small.primary', { type: 'button', text: PL.enrollment ? 'Choose a plan' : '📅 Enroll', onclick: function () { enrollDialog({ packId: packId, title: m.title, weeks: PL.template.weeks, source: PL.template.source, enrollment: PL.enrollment, onDone: function () { U().route(); } }); } })]));
      list = (PL.template.list || []).map(function (e) {
        return { week: e.week, toWeek: e.toWeek, title: e.title, note: e.note, status: null, topics: [],
          items: e.items.filter(function (id) { return byId[id]; }).map(function (id) { var p = prog[id] || {}; return { id: id, type: byId[id].type, title: byId[id].title, done: !!p.completedAt, percent: p.percent || 0 }; }) };
      });
    }
    var box = el('div.plan-list');
    list.forEach(function (e) {
      var wk = e.toWeek > e.week ? 'Weeks ' + e.week + '–' + e.toWeek : 'Week ' + e.week;
      box.appendChild(el('section.plan-entry' + (e.status ? '.s-' + e.status : ''), null, [
        el('div.plan-when', null, [el('div.wk', { text: wk }), e.start ? el('div.dates', { text: U().dayShort(e.start) + ' – ' + U().dayShort(e.end) }) : null]),
        el('div.plan-what', null, [
          el('div.plan-title', null, [el('h3', { text: e.title || wk }), e.status ? chip(e.status) : null]),
          e.note ? el('p.muted', { text: e.note }) : null,
          el('ul.plan-items', null, [].concat.apply([], e.items.filter(function (x) { return !(byId[x.id] && byId[x.id].for && byId[byId[x.id].for]); }).map(function (x) {
            var li = el('li' + (x.done ? '.done' : ''), null, [el('span.ck', { text: x.done ? '✓' : x.percent ? x.percent + '%' : '○' }),
              el('a', { href: itemHref(packId, x.id), text: U().ICON[x.type] + ' ' + x.title })]);
            /* materials attached to this item are listed under it */
            var sub = (kids[x.id] || []).map(function (k) { var p = prog[k.id] || {}; return el('li.sub' + (p.completedAt ? '.done' : ''), null, [el('span.ck', { text: p.completedAt ? '✓' : '·' }),
              el('a', { href: itemHref(packId, k.id), text: U().ICON[k.type] + ' ' + k.title })]); });
            return [li].concat(sub);
          }))),
          (e.topics || []).length ? el('ul.plan-topics', null, e.topics.map(function (t) {
            return el('li', null, [el('span.muted', { text: U().dayShort(t.start) + ' – ' + U().dayShort(t.end) + ' · ' }), t.itemTitle + ': ' + t.titles.join(', ')]);
          })) : null])]));
    });
    holder.appendChild(box);
  }

  /* ---------- Today panel (library) ---------- */
  function todayPanel(host) {
    var el = U().el;
    U().api.plan.today().then(function (t) {
      U().S.today = t.date;
      if (!t.courses.length && !t.projects.length) return;
      var cols = [];
      t.courses.forEach(function (c) {
        var lines = [];
        c.overdue.forEach(function (e) { e.items.forEach(function (x) { lines.push(el('li.late', null, [el('a', { href: itemHref(c.packId, x.id), text: U().ICON[x.type] + ' ' + x.title }), el('span.due', { text: 'was due ' + U().dayShort(e.end) })])); }); });
        c.current.forEach(function (e) { e.items.forEach(function (x) { lines.push(el('li' + (x.done ? '.done' : ''), null, [el('a', { href: itemHref(c.packId, x.id), text: (x.done ? '✓ ' : U().ICON[x.type] + ' ') + x.title }), el('span.due', { text: x.done ? 'done' : 'due ' + U().dayShort(e.end) })])); }); });
        if (!lines.length && c.next) lines.push(el('li.muted', { text: 'Next: ' + c.next.title + ' from ' + U().dayShort(c.next.start) }));
        cols.push(el('div.today-card', null, [el('div.today-head', null, [el('a', { href: '#/pack/' + encodeURIComponent(c.packId), text: c.title }),
          el('span.muted', { text: c.weekNow >= 1 && c.weekNow <= c.weeks ? 'week ' + c.weekNow + ' / ' + c.weeks : c.weekNow < 1 ? 'starts soon' : 'plan ended' })]), el('ul.today-list', null, lines)]));
      });
      t.projects.forEach(function (p) {
        var href = '#/pack/' + encodeURIComponent(p.packId) + '/' + encodeURIComponent(p.itemId);
        var lines = [];
        p.overdue.slice(0, 3).forEach(function (w) { lines.push(el('li.late', null, [el('a', { href: href, text: 'Week ' + w.week + ': ' + w.tasks }), el('span.due', { text: 'not ticked' })])); });
        if (p.overdue.length > 3) lines.push(el('li.late.muted', { text: '+ ' + (p.overdue.length - 3) + ' more weeks behind' }));
        if (p.thisWeek) lines.push(el('li' + (p.thisWeek.done ? '.done' : ''), null, [el('a', { href: href, text: (p.thisWeek.done ? '✓ ' : '🎓 ') + 'Week ' + p.thisWeek.week + ': ' + p.thisWeek.tasks }), el('span.due', { text: p.thisWeek.done ? 'done' : 'by ' + U().dayShort(p.thisWeek.end) })]));
        if (p.milestone) lines.push(el('li', null, [el('span', { text: '◆ ' + p.milestone.title }), el('span.due', { text: U().dayShort(p.milestone.end) })]));
        p.deliverables.forEach(function (d) { lines.push(el('li', null, [el('span', { text: '⇪ ' + d.title }), el('span.due', { text: 'due ' + U().dayShort(d.due) })])); });
        cols.push(el('div.today-card.proj', null, [el('div.today-head', null, [el('a', { href: href, text: p.title }), el('span.muted', { text: 'week ' + p.weekNow + ' / ' + p.weeks + ' · ' + p.percent + '%' })]), el('ul.today-list', null, lines)]));
      });
      host.appendChild(el('section.today', null, [el('div.today-top', null, [el('h2', { text: 'Today' }), el('span.muted', { text: U().day(t.date, { weekday: 'long', day: 'numeric', month: 'long' }) }),
        t.counts.overdue ? el('span.status.late', { text: t.counts.overdue + ' overdue' }) : null, el('span.grow'), el('a.btn.small', { href: '#/calendar', text: '📅 Calendar' })]),
        el('div.today-grid', null, cols)]));
    }).catch(function () {});
  }

  /* ---------- Calendar ---------- */
  var KIND = { block: 'Course plan', topics: 'Training topics', 'project-week': 'Project week', milestone: 'Milestone', deliverable: 'Deliverable', finish: 'Planned finish' };
  function eventHref(e) {
    if (e.itemId) return itemHref(e.packId, e.itemId);
    return '#/pack/' + encodeURIComponent(e.packId);
  }
  function openEvent(e) {
    if (e.kind === 'block' || e.kind === 'finish') { try { localStorage.setItem('ui:packView', 'plan'); } catch (x) {} }
    location.hash = eventHref(e);
  }
  function calendarPage(main, monthParam) {
    var el = U().el;
    var page = el('div.ui-page.wide'); main.appendChild(page);
    var t0 = today();
    var month = /^\d{4}-\d{2}$/.test(monthParam || '') ? monthParam : t0.slice(0, 7);
    var y = +month.slice(0, 4), mo = +month.slice(5, 7);
    var first = month + '-01';
    var dow = (new Date(parse(first)).getUTCDay() + 6) % 7;              // Monday = 0
    var gridStart = addDays(first, -dow);
    var lastDay = fmt(Date.UTC(y, mo, 0));
    var weeks = Math.ceil((diff(gridStart, lastDay) + 1) / 7);
    var gridEnd = addDays(gridStart, weeks * 7 - 1);
    var prev = fmt(Date.UTC(y, mo - 2, 1)).slice(0, 7), next = fmt(Date.UTC(y, mo, 1)).slice(0, 7);
    var title = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    page.appendChild(el('div.ui-head', null, [el('div', null, [el('h1', { text: 'Calendar' }), el('p.sub', { text: 'Your course plans and project weeks, from the day you enrolled.' })]), el('span.grow'),
      el('div.cal-nav', null, [el('a.btn.small', { href: '#/calendar/' + prev, text: '‹', title: 'Previous month' }), el('a.btn.small', { href: '#/calendar/' + t0.slice(0, 7), text: 'Today' }),
        el('a.btn.small', { href: '#/calendar/' + next, text: '›', title: 'Next month' }), el('strong.cal-title', { text: title })])]));
    var cal = el('div.cal'); page.appendChild(cal);
    var agenda = el('div.cal-agenda'); page.appendChild(agenda);
    var names = []; for (var i = 0; i < 7; i++) names.push(new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }));
    cal.appendChild(el('div.cal-names', null, names.map(function (n) { return el('div', { text: n }); })));
    U().api.plan.calendar(gridStart, gridEnd).then(function (evs) {
      for (var w = 0; w < weeks; w++) {
        var ws = addDays(gridStart, 7 * w), we = addDays(ws, 6);
        var row = el('div.cal-week');
        var bg = el('div.cal-bg');
        for (var d = 0; d < 7; d++) {
          var dd = addDays(ws, d);
          bg.appendChild(el('div.cal-day' + (dd.slice(0, 7) !== month ? '.out' : '') + (dd === t0 ? '.is-today' : '') + (d >= 5 ? '.wkend' : '')));
          row.appendChild(el('div.cal-num' + (dd === t0 ? '.is-today' : '') + (dd.slice(0, 7) !== month ? '.out' : ''), { style: { gridColumn: String(d + 1), gridRow: '1' }, text: String(+dd.slice(8)) }));
        }
        row.appendChild(bg);
        var lanes = [];
        evs.filter(function (e) { return !(e.end < ws || e.start > we); }).forEach(function (e) {
          var s = e.start < ws ? ws : e.start, f = e.end > we ? we : e.end;
          var c1 = diff(ws, s) + 1, c2 = diff(ws, f) + 2;
          var lane = 0; while (lanes[lane] && lanes[lane].some(function (r) { return !(c2 <= r[0] || c1 >= r[1]); })) lane++;
          (lanes[lane] = lanes[lane] || []).push([c1, c2]);
          if (lane > 5) return;
          var b = el('button.cal-ev.k-' + e.kind + '.s-' + e.status + (e.start < ws ? '.cont-l' : '') + (e.end > we ? '.cont-r' : ''), {
            type: 'button', style: { gridColumn: c1 + ' / ' + c2, gridRow: String(lane + 2) },
            title: KIND[e.kind] + ' · ' + e.packTitle + '\n' + e.title + (e.sub ? '\n' + e.sub : '') + '\n' + U().day(e.start) + (e.end !== e.start ? ' – ' + U().day(e.end) : '') + (e.status === 'overdue' ? '\nOVERDUE' : e.status === 'done' ? '\n✓ done' : ''),
            onclick: function () { openEvent(e); } }, [e.status === 'done' ? '✓ ' : e.status === 'overdue' ? '! ' : '', e.title]);
          row.appendChild(b);
        });
        cal.appendChild(row);
      }
      /* agenda: everything in this month, by start date */
      var inMonth = evs.filter(function (e) { return !(e.end < first || e.start > lastDay); });
      agenda.appendChild(el('h2', { text: inMonth.length ? 'This month' : 'Nothing planned this month' }));
      if (!inMonth.length) agenda.appendChild(el('p.muted', { text: 'Enroll in a course or a project to see its plan here (Library → open a course → 📅 Enroll).' }));
      inMonth.forEach(function (e) {
        agenda.appendChild(el('div.ag-row.k-' + e.kind + '.s-' + e.status, { role: 'link', tabindex: 0, onclick: function () { openEvent(e); }, onkeydown: function (k) { if (k.key === 'Enter') openEvent(e); } }, [
          el('div.ag-date', { text: U().dayShort(e.start) + (e.end !== e.start ? ' – ' + U().dayShort(e.end) : '') }),
          el('div.ag-dot'),
          el('div.ag-main', null, [el('div.ag-title', { text: e.title }), el('div.muted.small', { text: KIND[e.kind] + ' · ' + e.packTitle + (e.sub ? ' · ' + e.sub : '') })]),
          chip(e.status)]));
      });
    }).catch(function (e) { cal.appendChild(el('p.ui-error', { text: e.message })); });
  }

  window.PlanUI = { enrollDialog: enrollDialog, enrollBox: enrollBox, packPlanView: packPlanView, todayPanel: todayPanel, calendarPage: calendarPage, leave: leave, chip: chip, addDays: addDays };
})();
