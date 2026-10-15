/* library.js — installed packs: import (verify + extract), list, remove, progress. */
'use strict';
const fs = require('fs');
const path = require('path');
const { readPack, extractTo, assertPackId } = require('../shared/packfmt');
const { supports, cmp } = require('../shared/versions');
const S = require('../shared/schedule');

module.exports = function library({ db, dataDir, trustedKeys }) {
  const packsDir = path.resolve(dataDir, 'packs');
  fs.mkdirSync(packsDir, { recursive: true });
  const cache = {};

  function manifestOf(id) {
    if (cache[id]) return cache[id];
    const r = db.get('SELECT manifest FROM packs WHERE id=?', [id]);
    return r ? (cache[id] = JSON.parse(r.manifest)) : null;
  }
  function packDir(id) {
    assertPackId(id);
    const dir = path.resolve(packsDir, id);
    if (path.dirname(dir) !== packsDir) throw new Error('Package directory must be inside the packages folder');
    return dir;
  }

  /* Inspect without installing: used for the confirmation dialog. */
  function inspect(filePath) {
    const bytes = fs.readFileSync(filePath);
    const p = readPack(bytes, trustedKeys);
    const comp = supports(p.manifest);
    const inst = db.get('SELECT version FROM packs WHERE id=?', [p.manifest.id]);
    return { bytes, pack: p, compat: comp, installedVersion: inst ? inst.version : null };
  }

  function importFile(filePath, { userId, devMode }) {
    const { pack, compat, installedVersion } = inspect(filePath);
    const m = pack.manifest, sig = pack.signature;
    if (!compat.ok) throw new Error('This pack cannot be opened by this version of the app:\n• ' + compat.reasons.join('\n• '));
    if (sig.status !== 'trusted' && !devMode) {
      throw new Error(sig.status === 'unsigned'
        ? 'This pack is not signed. Only packs signed by the SemiTec Foundation can be installed (enable Developer mode in Settings to test unsigned packs).'
        : 'This pack is signed with an unknown key (' + sig.keyId + '). Install a newer app version or enable Developer mode.');
    }
    if (installedVersion && cmp(m.version, installedVersion) < 0 && !devMode) {
      throw new Error(`A newer version (${installedVersion}) of this pack is already installed.`);
    }
    const dir = packDir(m.id);
    /* Validate the destination before writing; each import gets its own staging directory. */
    const tmp = fs.mkdtempSync(path.join(packsDir, '.tmp-'));
    try {
      extractTo(tmp, pack.files);
      fs.writeFileSync(path.join(tmp, '.manifest.json'), pack.manifestBytes);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(tmp, dir);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    db.run(`INSERT INTO packs(id,version,title,publisher,signature,signed_by,signed_dev,manifest,installed_at,installed_by) VALUES(?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET version=excluded.version,title=excluded.title,publisher=excluded.publisher,signature=excluded.signature,
            signed_by=excluded.signed_by,signed_dev=excluded.signed_dev,manifest=excluded.manifest,installed_at=excluded.installed_at,installed_by=excluded.installed_by`,
      [m.id, m.version, m.title, m.publisher || '', sig.status, sig.keyName || sig.keyId || null, sig.development ? 1 : 0, pack.manifestBytes.toString('utf8'), new Date().toISOString(), userId || null]);
    delete cache[m.id];
    return { id: m.id, version: m.version, title: m.title, updatedFrom: installedVersion, signature: sig };
  }

  function progressRows(userId, packId) {
    const rows = db.all('SELECT item_id, item_type, percent, completed_at, updated_at FROM progress WHERE user_id=? AND pack_id=?', [userId, packId]);
    const map = {}; rows.forEach(r => { map[r.item_id] = { percent: r.percent, completedAt: r.completed_at, updatedAt: r.updated_at }; });
    return map;
  }
  /* progress of a package: only counted items (not prerequisites, not materials attached to another item) */
  function summary(m, prog) {
    const items = S.countedItems(m);
    const counted = {}; items.forEach(it => { counted[it.id] = 1; });
    const cp = {}; Object.keys(prog).forEach(k => { if (counted[k]) cp[k] = prog[k]; });
    const pct = items.length ? Math.round(items.reduce((a, it) => a + ((cp[it.id] || {}).percent || 0), 0) / items.length) : 0;
    const done = items.filter(it => (cp[it.id] || {}).completedAt).length;
    const last = Object.values(cp).map(p => p.updatedAt).sort().pop() || null;
    const lastId = Object.keys(cp).sort((x, y) => String(cp[y].updatedAt).localeCompare(String(cp[x].updatedAt)))[0];
    const lastIt = lastId && items.find(i => i.id === lastId);
    const finishedAt = items.length && done === items.length ? Object.values(cp).map(p => p.completedAt).filter(Boolean).sort().pop() : null;
    const prerequisites = (m.items || []).filter(it => it.prerequisite).length;
    return { percent: pct, done, total: items.length, prerequisites, saved: Object.keys(prog).length, lastActivity: last, finishedAt, lastItem: lastIt ? { id: lastIt.id, title: lastIt.title, type: lastIt.type, percent: cp[lastId].percent, done: !!cp[lastId].completedAt } : null };
  }

  return {
    packsDir, packDir, manifestOf, inspect, importFile,
    list(userId) {
      return db.all('SELECT id, version, title, publisher, signature, signed_by, signed_dev, installed_at FROM packs ORDER BY title').map(r => {
        const m = manifestOf(r.id);
        return { id: r.id, version: r.version, title: r.title, publisher: r.publisher, signature: r.signature, signedBy: r.signed_by, signedDev: !!r.signed_dev,
          installedAt: r.installed_at, description: m.description || '', cover: m.cover || null, language: m.language || '',
          counts: (m.items || []).reduce((a, it) => (a[it.type] = (a[it.type] || 0) + 1, a), {}),
          authors: m.authors || [], hasSchedule: !!(m.schedule && (m.schedule.entries || []).length),
          publisherId: String(m.publisher || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          publisherLogo: m.publisherLogo ? 'stl://pack/' + encodeURIComponent(r.id) + '/' + m.publisherLogo : null, publisherUrl: m.publisherUrl || '',
          projectCategories: [...new Set((m.items || []).filter(i => i.type === 'project').map(i => i.category || 'other'))],
          text: [m.title, m.description, m.publisher, (m.authors || []).join(' ')].concat((m.items || []).map(it => it.title + ' ' + (it.description || ''))).join(' \n '),
          progress: summary(m, progressRows(userId, r.id)) };
      });
    },
    get(id, userId) {
      const m = manifestOf(id); if (!m) throw new Error('Pack not installed: ' + id);
      const r = db.get('SELECT signature, signed_by, signed_dev, installed_at FROM packs WHERE id=?', [id]);
      const prog = progressRows(userId, id);
      const size = (rel) => (m.files['content/' + rel] || {}).size || 0;
      const items = (m.items || []).map(it => {
        const o = Object.assign({}, it);
        if (it.file) o.size = size(it.file);
        if (it.srcFiles) o.srcFiles = it.srcFiles.map(f => ({ path: f, size: size(it.path + '/' + f) }));
        return o;
      });
      return { manifest: Object.assign({}, m, { files: undefined, items }), signature: r.signature, signedBy: r.signed_by, signedDev: !!r.signed_dev, installedAt: r.installed_at, progress: prog, summary: summary(m, prog) };
    },
    remove(id) {
      const dir = packDir(id); // reject unsafe ids before changing the database or filesystem
      db.run('DELETE FROM packs WHERE id=?', [id]);
      fs.rmSync(dir, { recursive: true, force: true });
      delete cache[id];
    },
    /* start a package from 0: delete this user's progress of every item (training states, quizzes, notes,
       certificates that come from them) and the study-plan enrollments of the package and its projects */
    resetProgress(userId, packId) {
      const items = db.get('SELECT COUNT(*) AS n FROM progress WHERE user_id=? AND pack_id=?', [userId, packId]).n;
      const plans = db.get('SELECT COUNT(*) AS n FROM enrollments WHERE user_id=? AND pack_id=?', [userId, packId]).n;
      db.run('DELETE FROM progress WHERE user_id=? AND pack_id=?', [userId, packId]);
      db.run('DELETE FROM enrollments WHERE user_id=? AND pack_id=?', [userId, packId]);
      return { items, plans };
    },
    getProgress(userId, packId, itemId) {
      const r = db.get('SELECT state, percent, completed_at FROM progress WHERE user_id=? AND pack_id=? AND item_id=?', [userId, packId, itemId]);
      return r ? { state: JSON.parse(r.state), percent: r.percent, completedAt: r.completed_at } : null;
    },
    setProgress(userId, packId, itemId, itemType, state, percent, completed) {
      if (!manifestOf(packId)) throw new Error('unknown pack');
      const json = JSON.stringify(state);
      if (json.length > 2_000_000) throw new Error('progress too large');
      const prev = db.get('SELECT completed_at FROM progress WHERE user_id=? AND pack_id=? AND item_id=?', [userId, packId, itemId]);
      const completedAt = (prev && prev.completed_at) || (completed ? new Date().toISOString() : null);
      db.run(`INSERT INTO progress(user_id,pack_id,item_id,item_type,state,percent,completed_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
              ON CONFLICT(user_id,pack_id,item_id) DO UPDATE SET state=excluded.state, percent=excluded.percent,
              completed_at=excluded.completed_at, updated_at=excluded.updated_at`,
        [userId, packId, itemId, itemType, json, Math.max(0, Math.min(100, Math.round(percent || 0))), completedAt, new Date().toISOString()]);
      return { completedAt };
    },
    exportUser(userId) {
      return db.all('SELECT pack_id, item_id, item_type, state, percent, completed_at, updated_at FROM progress WHERE user_id=?', [userId])
        .map(r => Object.assign(r, { state: JSON.parse(r.state) }));
    }
  };
};
