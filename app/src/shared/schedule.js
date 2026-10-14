/* schedule.js — study plans: map a package's schedule (or a project's weekly plan) onto real dates,
   starting from the day the student enrolls. Used by the app (calendar, "Today" panel, package page)
   and by the packer (checks). Pure functions, no I/O.

   Where a plan comes from (first match wins):
     1. manifest.schedule.entries   — the author's week plan for the whole package (pack spec "schedule")
     2. items with plannedWeeks      — each item gets that many weeks, one after another in course order
                                       (a training's own training.json "schedule.weeks" counts too)
     3. a finish date chosen by the student — remaining items are spread over the weeks by estimatedTime
     4. nothing                      — self-paced, no dates
   Week n of a plan = the 7 days starting at  start + 7·(n−1);  its due date is the last of those days. */
'use strict';

const DAY = 86400000;
function parseDay(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
function fmtDay(t) { return new Date(t).toISOString().slice(0, 10); }
function addDays(day, n) { return fmtDay(parseDay(day) + n * DAY); }
function diffDays(a, b) { return Math.round((parseDay(b) - parseDay(a)) / DAY); }
function today(now) { const d = now ? new Date(now) : new Date(); return fmtDay(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
function weekRange(start, week, toWeek) { return { start: addDays(start, 7 * (week - 1)), end: addDays(start, 7 * (toWeek || week) - 1) }; }

/* "1 h 30 min", "45 min", "2 h", "1.5 h", "3 hours" -> minutes (default 30) */
function minutes(s) {
  const t = String(s || '').toLowerCase(); let m = 0, hit = false;
  t.replace(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hour|hours|ժ)\b/g, (_, n) => { m += parseFloat(n.replace(',', '.')) * 60; hit = true; });
  t.replace(/(\d+)\s*(m|min|mins|minute|minutes|ր)\b/g, (_, n) => { m += +n; hit = true; });
  return hit ? Math.round(m) : 30;
}

/* "3-4", [3,4], 3 -> [from, to] */
function weekSpan(e) {
  const v = e.weeks != null ? e.weeks : e.week;
  if (Array.isArray(v)) return [+v[0], +(v[1] != null ? v[1] : v[0])];
  const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(String(v)); if (m) return [+m[1], +m[2]];
  return [+v, +v];
}

/* Which items count for progress, certificates and study plans (app 1.6.0):
   not a prerequisite ("prerequisite": true — an optional refresher shown before the course) and
   not a material attached to another item ("for"). */
function counts(it, byId) { return !!it && !it.prerequisite && !(it.for && byId[it.for]); }
function countedItems(m) {
  const byId = {}; (m.items || []).forEach(it => { byId[it.id] = it; });
  return (m.items || []).filter(it => counts(it, byId));
}

/* course order: modules first, then the rest */
function ordered(m) {
  const byId = {}; (m.items || []).forEach(it => { byId[it.id] = it; });
  const out = [], seen = {};
  (m.modules || []).forEach(md => (md.items || []).forEach(id => { if (byId[id] && !seen[id]) { out.push(byId[id]); seen[id] = 1; } }));
  (m.items || []).forEach(it => { if (!seen[it.id]) out.push(it); });
  return out.filter(it => counts(it, byId));     // prerequisites and attached materials ("for") are not planned
}

/* Normalised plan template of a package, independent of dates.
   -> { source: 'package'|'items'|'none', weeks, entries: [{ week, toWeek, title, note, items: [ids] }] } */
function template(m) {
  const s = m.schedule;
  if (s && (s.entries || []).length) {
    const entries = s.entries.map(e => { const [a, b] = weekSpan(e); return { week: a, toWeek: b, title: e.title || '', note: e.note || '', items: (e.items || []).slice() }; })
      .sort((x, y) => x.week - y.week);
    return { source: 'package', weeks: Math.max(s.weeks || 0, ...entries.map(e => e.toWeek)), entries };
  }
  const its = ordered(m);
  const pw = (it) => +(it.plannedWeeks || (it.schedule && it.schedule.weeks) || 0);
  if (its.some(it => pw(it) > 0)) {
    const entries = []; let cur = 1, last = null;
    for (const it of its) {
      const w = pw(it);
      if (w > 0) { last = { week: cur, toWeek: cur + w - 1, title: it.title, note: '', items: [it.id] }; entries.push(last); cur += w; }
      else if (last) last.items.push(it.id);                                  // unplanned items join the previous block
      else { last = { week: 1, toWeek: 1, title: it.title, note: '', items: [it.id] }; entries.push(last); cur = 2; }
    }
    return { source: 'items', weeks: cur - 1, entries };
  }
  return { source: 'none', weeks: 0, entries: [] };
}

/* Spread items over the weeks until finishBy (student's own plan for a package without a schedule). */
function spread(m, start, finishBy) {
  const its = ordered(m);
  const weeks = Math.max(1, Math.ceil((diffDays(start, finishBy) + 1) / 7));
  const total = its.reduce((a, it) => a + minutes(it.estimatedTime), 0) || 1;
  const per = total / weeks, entries = [];
  let acc = 0;
  for (const it of its) {
    const w = Math.min(weeks, Math.floor(acc / per) + 1);
    let e = entries[entries.length - 1];
    if (!e || e.week !== w) { e = { week: w, toWeek: w, title: '', note: '', items: [] }; entries.push(e); }
    e.items.push(it.id); acc += minutes(it.estimatedTime);
  }
  entries.forEach(e => { e.title = 'Week ' + e.week; });
  return { source: 'student', weeks, entries };
}

/* The plan of an enrolled package with real dates and status.
   enrollment: { startDate, plan: { mode: 'package'|'finishBy'|'self', finishBy } }, progress: { itemId: { percent, completedAt } } */
function packPlan(m, enrollment, progress, now) {
  const start = enrollment.startDate, mode = (enrollment.plan || {}).mode || 'package';
  let tpl = template(m);
  if ((mode === 'finishBy' || tpl.source === 'none') && (enrollment.plan || {}).finishBy) tpl = spread(m, start, enrollment.plan.finishBy);
  if (mode === 'self') tpl = { source: 'none', weeks: 0, entries: [] };
  const byId = {}; (m.items || []).forEach(it => { byId[it.id] = it; });
  const t = today(now), prog = progress || {};
  const entries = tpl.entries.map((e, i) => {
    const r = weekRange(start, e.week, e.toWeek);
    const items = e.items.filter(id => counts(byId[id], byId)).map(id => ({ id, type: byId[id].type, title: byId[id].title, done: !!(prog[id] || {}).completedAt, percent: (prog[id] || {}).percent || 0 }));
    const done = items.length > 0 && items.every(x => x.done);
    const status = done ? 'done' : r.end < t ? 'overdue' : r.start <= t ? 'current' : 'upcoming';
    /* topic plan of a training inside its block: training.json schedule.topics */
    const topics = [];
    e.items.forEach(id => {
      const it = byId[id]; const ts = it && it.schedule && it.schedule.topics;
      (ts || []).forEach(x => { const [a, b] = weekSpan(x); const wa = Math.min(e.week + a - 1, e.toWeek), wb = Math.min(e.week + b - 1, e.toWeek); const rr = weekRange(start, wa, wb); topics.push({ item: id, itemTitle: it.title, week: wa, start: rr.start, end: rr.end, titles: x.titles || x.topics || [] }); });
    });
    return { key: 'w' + e.week + '-' + i, week: e.week, toWeek: e.toWeek, start: r.start, end: r.end, title: e.title, note: e.note, items, topics, done, status };
  });
  const end = entries.length ? entries[entries.length - 1].end : null;
  const weekNow = Math.floor(diffDays(start, t) / 7) + 1;
  return { source: tpl.source, weeks: tpl.weeks, start, end, weekNow, entries };
}

/* A project's weekly plan (project.json) with dates. state: { weeks: { "1": isoDate }, notes: {…} } */
function projectPlan(p, startDate, state, now) {
  const t = today(now), st = state || {}, ticked = st.weeks || {};
  const weeks = (p.weeks || []).map(w => {
    const r = weekRange(startDate, w.week);
    const done = !!ticked[String(w.week)];
    return Object.assign({}, w, r, { done, status: done ? 'done' : r.end < t ? 'overdue' : r.start <= t ? 'current' : 'upcoming' });
  });
  const milestones = (p.milestones || []).map(ms => {
    const [a, b] = weekSpan(ms); const r = weekRange(startDate, a, b);
    const done = weeks.filter(w => w.week >= a && w.week <= b).every(w => w.done);
    return Object.assign({}, ms, { week: a, toWeek: b, start: r.start, end: r.end, done, status: done ? 'done' : r.end < t ? 'overdue' : r.start <= t ? 'current' : 'upcoming' });
  });
  const deliverables = (p.deliverables || []).map(d => {
    const wk = d.dueWeek || null; const due = wk ? weekRange(startDate, wk).end : null;
    return Object.assign({}, d, { due, status: !due ? 'none' : due < t ? 'past' : 'upcoming' });
  });
  const total = weeks.length, done = weeks.filter(w => w.done).length;
  const dur = p.durationWeeks || Math.max(0, ...weeks.map(w => w.week));
  return { start: startDate, end: dur ? weekRange(startDate, dur).end : null, weekNow: Math.floor(diffDays(startDate, t) / 7) + 1,
    weeks, milestones, deliverables, percent: total ? Math.round(100 * done / total) : 0, done, total };
}

module.exports = { counts, countedItems, template, packPlan, projectPlan, spread, minutes, weekSpan, ordered, today, addDays, diffDays, parseDay, weekRange };
