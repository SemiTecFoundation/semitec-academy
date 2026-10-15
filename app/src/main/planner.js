/* planner.js — enrollment, study plans, calendar, "Today", projects and certificates (app 1.4.0).
   Plans are computed from the package (manifest.schedule / plannedWeeks / training schedules) or a
   project's project.json, mapped onto dates from the student's enrollment day (shared/schedule.js). */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../shared/schedule');

module.exports = function planner({ db, lib }) {
  const projCache = {};

  function projectJson(packId, it) {
    const key = packId + '/' + it.id;
    const m = lib.manifestOf(packId);
    if (projCache[key] && projCache[key].v === m.version) return projCache[key].p;
    const p = JSON.parse(fs.readFileSync(path.join(lib.packDir(packId), it.path, 'project.json'), 'utf8'));
    projCache[key] = { v: m.version, p };
    return p;
  }
  function enrollment(userId, packId, itemId) {
    const r = db.get('SELECT start_date, plan, enrolled_at FROM enrollments WHERE user_id=? AND pack_id=? AND item_id=?', [userId, packId, itemId || '']);
    return r ? { startDate: r.start_date, plan: JSON.parse(r.plan || '{}'), enrolledAt: r.enrolled_at } : null;
  }
  function progressMap(userId, packId) {
    const map = {};
    db.all('SELECT item_id, percent, completed_at, updated_at, item_type, state FROM progress WHERE user_id=? AND pack_id=?', [userId, packId])
      .forEach(r => { map[r.item_id] = { percent: r.percent, completedAt: r.completed_at, updatedAt: r.updated_at, type: r.item_type, state: r.state }; });
    return map;
  }
  function itemOf(packId, itemId) {
    const m = lib.manifestOf(packId); const it = m && (m.items || []).find(i => i.id === itemId);
    if (!it) throw new Error('Unknown item ' + itemId);
    return it;
  }
  function packPlan(userId, packId, now) {
    const m = lib.manifestOf(packId); if (!m) throw new Error('Package not installed: ' + packId);
    const en = enrollment(userId, packId, '');
    const tpl = S.template(m);
    const t = { source: tpl.source, weeks: tpl.weeks, entries: tpl.entries.length, list: tpl.entries };
    if (!en) return { enrollment: null, template: t, today: S.today(now) };
    return { enrollment: en, template: t, today: S.today(now), plan: S.packPlan(m, en, progressMap(userId, packId), now) };
  }
  function projectState(userId, packId, itemId) {
    const r = db.get('SELECT state FROM progress WHERE user_id=? AND pack_id=? AND item_id=?', [userId, packId, itemId]);
    return r ? JSON.parse(r.state) : {};
  }
  function projectPlan(userId, packId, itemId, now) {
    const it = itemOf(packId, itemId); const p = projectJson(packId, it);
    const en = enrollment(userId, packId, itemId);
    return { project: p, enrollment: en, today: S.today(now), plan: en ? S.projectPlan(p, en.startDate, projectState(userId, packId, itemId), now) : null };
  }
  function enrolledPacks(userId) {
    /* Ignore stale rows from a package another user has uninstalled. The join also keeps calendar
       and dashboard loading proportional to packages that still exist. */
    return db.all('SELECT e.pack_id, e.item_id FROM enrollments e JOIN packs p ON p.id=e.pack_id WHERE e.user_id=?', [userId]);
  }

  /* calendar events between from and to (YYYY-MM-DD, inclusive) */
  function calendar(userId, from, to, now) {
    const ev = [];
    const inRange = (a, b) => !(b < from || a > to);
    for (const r of enrolledPacks(userId)) {
      const m = lib.manifestOf(r.pack_id);
      if (!r.item_id) {
        const P = packPlan(userId, r.pack_id, now).plan; if (!P) continue;
        P.entries.forEach(e => {
          if (inRange(e.start, e.end)) ev.push({ kind: 'block', start: e.start, end: e.end, title: e.title || ('Week ' + e.week), packId: r.pack_id, packTitle: m.title, week: e.week, toWeek: e.toWeek, status: e.status, items: e.items, note: e.note });
          e.topics.forEach(t => { if (inRange(t.start, t.end)) ev.push({ kind: 'topics', start: t.start, end: t.end, title: t.itemTitle + ': ' + t.titles.join(', '), packId: r.pack_id, packTitle: m.title, itemId: t.item, status: e.status === 'done' ? 'done' : e.status }); });
        });
        if (P.end && P.end >= from && P.end <= to) ev.push({ kind: 'finish', start: P.end, end: P.end, title: 'Planned finish: ' + m.title, packId: r.pack_id, packTitle: m.title, status: P.entries.every(e => e.done) ? 'done' : 'upcoming' });
      } else {
        let PP; try { PP = projectPlan(userId, r.pack_id, r.item_id, now); } catch (e) { continue; }
        const P = PP.plan; if (!P) continue;
        P.weeks.forEach(w => { if (inRange(w.start, w.end)) ev.push({ kind: 'project-week', start: w.start, end: w.end, title: 'Week ' + w.week + ': ' + w.tasks, sub: w.doneWhen, packId: r.pack_id, itemId: r.item_id, packTitle: PP.project.title, week: w.week, status: w.status }); });
        P.milestones.forEach(ms => { if (ms.end >= from && ms.end <= to) ev.push({ kind: 'milestone', start: ms.end, end: ms.end, title: '◆ ' + ms.milestone, sub: ms.work, packId: r.pack_id, itemId: r.item_id, packTitle: PP.project.title, status: ms.status }); });
        P.deliverables.forEach(d => { if (d.due && d.due >= from && d.due <= to) ev.push({ kind: 'deliverable', start: d.due, end: d.due, title: '⇪ ' + d.title, sub: d.form, packId: r.pack_id, itemId: r.item_id, packTitle: PP.project.title, status: d.status }); });
      }
    }
    return ev.sort((a, b) => a.start.localeCompare(b.start) || a.kind.localeCompare(b.kind));
  }

  /* what needs attention now: overdue and current blocks, this week of each project, milestones and deliverables soon */
  function todayInfo(userId, now) {
    const t = S.today(now), soon = S.addDays(t, 14), out = { date: t, courses: [], projects: [], counts: { overdue: 0, current: 0, soon: 0 } };
    for (const r of enrolledPacks(userId)) {
      const m = lib.manifestOf(r.pack_id);
      if (!r.item_id) {
        const P = packPlan(userId, r.pack_id, now).plan; if (!P) continue;
        const overdue = P.entries.filter(e => e.status === 'overdue'), current = P.entries.filter(e => e.status === 'current');
        const next = P.entries.find(e => e.status === 'upcoming');
        if (!overdue.length && !current.length && !next) continue;
        out.courses.push({ packId: r.pack_id, title: m.title, weekNow: P.weekNow, weeks: P.weeks, end: P.end, source: P.source,
          overdue: overdue.map(e => ({ title: e.title, end: e.end, items: e.items.filter(x => !x.done) })),
          current: current.map(e => ({ title: e.title, end: e.end, items: e.items })), next: next ? { title: next.title, start: next.start } : null });
        out.counts.overdue += overdue.length; out.counts.current += current.length;
      } else {
        let PP; try { PP = projectPlan(userId, r.pack_id, r.item_id, now); } catch (e) { continue; }
        const P = PP.plan; if (!P) continue;
        const thisWeek = P.weeks.find(w => w.status === 'current' || (w.start <= t && t <= w.end));
        const overdue = P.weeks.filter(w => w.status === 'overdue');
        const ms = P.milestones.find(x => !x.done && x.end >= t);
        const dels = P.deliverables.filter(d => d.due && d.due >= t && d.due <= soon);
        out.projects.push({ packId: r.pack_id, itemId: r.item_id, title: PP.project.title, weekNow: P.weekNow, weeks: P.total, percent: P.percent,
          thisWeek: thisWeek ? { week: thisWeek.week, tasks: thisWeek.tasks, doneWhen: thisWeek.doneWhen, done: thisWeek.done, end: thisWeek.end } : null,
          overdue: overdue.map(w => ({ week: w.week, tasks: w.tasks })), milestone: ms ? { title: ms.milestone, end: ms.end } : null,
          deliverables: dels.map(d => ({ title: d.title, due: d.due })) });
        out.counts.overdue += overdue.length; if (thisWeek && !thisWeek.done) out.counts.current++; out.counts.soon += dels.length;
      }
    }
    return out;
  }

  /* Projects belong to this user's My packages. Installed packages are shared by every account on
     the computer, so showing all of them here made projects survive a user's package removal. */
  function projects(userId, now) {
    const out = [];
    for (const r of db.all('SELECT p.id FROM packs p JOIN user_packs u ON u.pack_id=p.id WHERE u.user_id=? ORDER BY p.title', [userId])) {
      const m = lib.manifestOf(r.id);
      for (const it of (m.items || []).filter(i => i.type === 'project')) {
        let p = null; try { p = projectJson(r.id, it); } catch (e) { continue; }
        const en = enrollment(userId, r.id, it.id);
        const plan = en ? S.projectPlan(p, en.startDate, projectState(userId, r.id, it.id), now) : null;
        out.push({ packId: r.id, packTitle: m.title, itemId: it.id, title: p.title, category: it.category || p.category || 'other',
          publisher: m.publisher || '', publisherLogo: m.publisherLogo ? 'stl://pack/' + encodeURIComponent(r.id) + '/' + m.publisherLogo : null, summary: p.summary || it.summary || '', workType: p.workType || '', level: p.level || '',
          durationWeeks: p.durationWeeks || (p.weeks || []).length, supervisors: p.supervisors || [], areas: p.areas || [], slots: p.slots || 1,
          enrollment: en, percent: plan ? plan.percent : 0, weekNow: plan ? plan.weekNow : null, end: plan ? plan.end : null,
          finished: plan ? plan.done === plan.total && plan.total > 0 : false });
      }
    }
    return out;
  }

  /* certificates earned: training certificates (from the training state) and package certificates (everything completed) */
  function certificates(userId, displayName) {
    const out = [];
    for (const r of db.all('SELECT id FROM packs ORDER BY title')) {
      const m = lib.manifestOf(r.id), prog = progressMap(userId, r.id);
      for (const it of (m.items || []).filter(i => i.type === 'training')) {
        const p = prog[it.id]; if (!p || !p.completedAt) continue;
        let st = {}; try { st = JSON.parse(p.state); } catch (e) {}
        const c = st.certificate || {};
        const tops = Object.values(st.topics || {}).filter(x => x && x.bestScore != null);
        const avg = tops.length ? tops.reduce((a, x) => a + x.bestScore, 0) / tops.length : null;
        out.push({ kind: 'training', packId: r.id, packTitle: m.title, itemId: it.id, path: it.path, title: it.title, name: c.name || displayName,
          date: st.completedAt || p.completedAt, issuedAt: c.issuedAt || null, score: c.score != null ? c.score : avg, certId: c.id || null, created: !!c.id });
      }
      const items = S.countedItems(m);      // prerequisites and attached materials are not required for the certificate
      /* Course certificates are an author/publisher choice. A completed package without a certificate
         definition is still complete; it simply has no course credential to issue. */
      if (m.certificate && items.length && items.every(it => (prog[it.id] || {}).completedAt)) {
        const date = items.map(it => prog[it.id].completedAt).sort().pop();
        out.push({ kind: 'package', packId: r.id, packTitle: m.title, title: m.title, name: displayName, date, issuedAt: date, score: null, items: items.length,
          hours: Math.round(items.reduce((a, it) => a + S.minutes(it.estimatedTime), 0) / 6) / 10, publisher: m.publisher || '', language: m.language || 'en', config: m.certificate || null, created: true });
      }
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  return {
    enrollment, packPlan, projectPlan, calendar, today: todayInfo, projects, certificates, projectJson,
    enroll(userId, packId, itemId, o) {
      if (!lib.manifestOf(packId)) throw new Error('Package not installed');
      if (itemId) { if (itemOf(packId, itemId).type !== 'project') throw new Error('Only projects can be enrolled separately'); }
      const start = o && o.startDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) throw new Error('Choose a start date');
      const plan = { mode: (o.mode === 'finishBy' || o.mode === 'self') ? o.mode : 'package' };
      if (plan.mode === 'finishBy') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(o.finishBy || '')) throw new Error('Choose a finish date');
        if (o.finishBy <= start) throw new Error('The finish date must be after the start date');
        plan.finishBy = o.finishBy;
      }
      db.run(`INSERT INTO enrollments(user_id,pack_id,item_id,start_date,plan,enrolled_at) VALUES(?,?,?,?,?,?)
              ON CONFLICT(user_id,pack_id,item_id) DO UPDATE SET start_date=excluded.start_date, plan=excluded.plan`,
        [userId, packId, itemId || '', start, JSON.stringify(plan), new Date().toISOString()]);
      return enrollment(userId, packId, itemId);
    },
    unenroll(userId, packId, itemId) {
      db.run('DELETE FROM enrollments WHERE user_id=? AND pack_id=? AND item_id=?', [userId, packId, itemId || '']);
      return true;
    },
    /* per package for the library: enrollment + plan position */
    summaryFor(userId, packId, now) {
      const en = enrollment(userId, packId, '');
      if (!en) return { enrolled: false };
      const P = packPlan(userId, packId, now).plan;
      return { enrolled: true, startDate: en.startDate, mode: en.plan.mode || 'package', weekNow: P.weekNow, weeks: P.weeks, end: P.end,
        overdue: P.entries.filter(e => e.status === 'overdue').length, hasPlan: P.entries.length > 0 };
    }
  };
};
