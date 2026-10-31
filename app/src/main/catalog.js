/* catalog.js — packages that can be installed: from catalog SOURCES set in Application settings (app 1.5.0)
     folder  — a folder on this computer / a shared drive / OneDrive / USB; every .stlp in it (2 levels deep)
     url     — a catalog.json published on a website (made with `stlp catalog`); packages are downloaded on demand
   Nothing is installed here; installing goes through the normal verify + install flow (library.importFile). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { peekPack } = require('../shared/packfmt');
const { supports, cmp } = require('../shared/versions');

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const dataUrl = (name, buf) => buf && MIME[path.extname(name).toLowerCase()] ? 'data:' + MIME[path.extname(name).toLowerCase()] + ';base64,' + buf.toString('base64') : null;
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

module.exports = function catalog({ db, lib }) {
  const peekCache = {};       // file path -> { mtime, size, entry }
  const urlCache = {};        // url -> { at, data }
  let last = {};              // id -> entry of the last list() (install uses this, never data from the UI)

  function sources() {
    const saved = db.setting('catalogSources');
    if (saved != null) return saved;
    return save([{ id: 'semitec-foundation', type: 'url', name: 'SemiTec Foundation', url: 'https://semitecfoundation.github.io/semitec-academy-materials/catalog/catalog.json' }]);
  }
  function save(list) { db.setting('catalogSources', list); return list; }
  function installedMap() {
    const m = {}; db.all('SELECT id, version FROM packs').forEach(r => { m[r.id] = r.version; }); return m;
  }
  function status(entry, installed) {
    const iv = installed[entry.id];
    const comp = entry.minAppVersion ? supports({ format: entry.format || 1, minAppVersion: entry.minAppVersion, items: entry.itemsFormats || [] }) : { ok: true, reasons: [] };
    if (!comp.ok) return { status: 'needs-app', reasons: comp.reasons, installedVersion: iv || null };
    if (!iv) return { status: 'available', installedVersion: null };
    const c = cmp(entry.version, iv);
    return { status: c > 0 ? 'update' : c === 0 ? 'installed' : 'older', installedVersion: iv };
  }
  function fromManifest(m, imgs) {
    const counts = {}; (m.items || []).forEach(it => { counts[it.type] = (counts[it.type] || 0) + 1; });
    const cats = [...new Set((m.items || []).filter(i => i.type === 'project' && i.category).map(i => i.category))];
    return { id: m.id, version: m.version, title: m.title, description: m.description || '', language: m.language || '', publisher: m.publisher || '',
      publisherId: slug(m.publisher), authors: m.authors || [], minAppVersion: m.minAppVersion, format: m.format,
      itemsFormats: (m.items || []).map(i => ({ id: i.id, type: i.type, format: i.format })), counts, projectCategories: cats,
      hasSchedule: !!(m.schedule && (m.schedule.entries || []).length), created: m.created || null,
      text: [m.title, m.description, m.publisher].concat((m.items || []).map(i => i.title)).join(' \n '),
      cover: imgs && imgs.cover ? dataUrl(imgs.cover.name, imgs.cover.data) : null, publisherLogo: imgs && imgs.logo ? dataUrl(imgs.logo.name, imgs.logo.data) : null };
  }
  function scanFolder(dir) {
    const out = [], errors = [];
    const walk = (d, depth) => {
      let names; try { names = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { errors.push('cannot read ' + d); return; }
      for (const n of names) {
        if (n.name.startsWith('.')) continue;
        const p = path.join(d, n.name);
        if (n.isDirectory() && depth < 2) walk(p, depth + 1);
        else if (n.isFile() && /\.(stlp|zip)$/i.test(n.name)) {   // a package renamed to .zip (e-mail, LMS) counts too
          try {
            const st = fs.statSync(p);
            const c = peekCache[p];
            if (c && c.mtime === st.mtimeMs && c.size === st.size) { out.push(c.entry); continue; }
            const pk = peekPack(fs.readFileSync(p));
            const entry = Object.assign(fromManifest(pk.manifest, pk.images), { file: p, size: st.size });
            peekCache[p] = { mtime: st.mtimeMs, size: st.size, entry }; out.push(entry);
          } catch (e) { if (!/\.zip$/i.test(n.name)) errors.push(n.name + ': ' + e.message); }   // other ZIP archives in the folder are simply not packages
        }
      }
    };
    if (!fs.existsSync(dir)) errors.push('folder not found: ' + dir); else walk(dir, 0);
    return { entries: out, errors };
  }
  async function fetchJson(url) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  async function fetchImage(url) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 600000) return null;
      const type = (r.headers.get('content-type') || '').split(';')[0];
      return /^image\//.test(type) ? 'data:' + type + ';base64,' + buf.toString('base64') : dataUrl(new URL(url).pathname, buf);
    } catch (e) { return null; }
  }
  async function scanUrl(url, force) {
    const c = urlCache[url];
    if (c && !force && Date.now() - c.at < 10 * 60000) return c.data;
    const data = { entries: [], errors: [], name: '' };
    try {
      const j = await fetchJson(url);
      data.name = j.name || '';
      for (const p of j.packages || []) {
        if (!p.id || !p.version || !p.url) { data.errors.push('entry without id / version / url'); continue; }
        const abs = (u) => u ? new URL(u, url).href : null;
        const e = { id: p.id, version: p.version, title: p.title || p.id, description: p.description || '', language: p.language || '', publisher: p.publisher || j.publisher || '',
          publisherId: slug(p.publisher || j.publisher), authors: p.authors || [], minAppVersion: p.minAppVersion || '1.0.0', format: p.format || 1, itemsFormats: p.items || [],
          counts: p.counts || {}, projectCategories: p.projectCategories || [], hasSchedule: !!p.hasSchedule, created: p.created || null,
          text: [p.title, p.description, p.publisher].concat(p.itemTitles || []).join(' \n '),
          download: abs(p.url), sha256: p.sha256 || null, size: p.size || 0 };
        [e.cover, e.publisherLogo] = await Promise.all([p.cover ? fetchImage(abs(p.cover)) : null, (p.publisherLogo || j.publisherLogo) ? fetchImage(abs(p.publisherLogo || j.publisherLogo)) : null]);
        data.entries.push(e);
      }
    } catch (e) { data.errors.push(e.name === 'AbortError' ? 'no answer (offline?)' : e.message); }
    urlCache[url] = { at: Date.now(), data };
    return data;
  }

  return {
    sources,
    addFolder(dir) {
      dir = path.resolve(dir);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Not a folder: ' + dir);
      const list = sources(); if (list.some(s => s.type === 'folder' && s.path === dir)) return list;
      list.push({ id: crypto.randomUUID(), type: 'folder', path: dir, name: path.basename(dir), addedAt: new Date().toISOString() });
      return save(list);
    },
    addUrl(url, name) {
      if (!/^https?:\/\/\S+$/.test(url || '')) throw new Error('A catalog link starts with http:// or https://');
      const list = sources(); if (list.some(s => s.type === 'url' && s.url === url)) return list;
      list.push({ id: crypto.randomUUID(), type: 'url', url, name: name || new URL(url).host, addedAt: new Date().toISOString() });
      return save(list);
    },
    remove(id) { return save(sources().filter(s => s.id !== id)); },
    /* all entries of all sources, newest version per package id + status against what is installed */
    async list(force) {
      const installed = installedMap(), all = [], problems = [];
      for (const s of sources()) {
        const r = s.type === 'folder' ? scanFolder(s.path) : await scanUrl(s.url, force);
        r.errors.forEach(e => problems.push({ source: s.name || s.path || s.url, message: e }));
        r.entries.forEach(e => all.push(Object.assign({}, e, { sourceId: s.id, sourceName: s.name || r.name || s.url || s.path, sourceType: s.type })));
      }
      const best = {};
      for (const e of all) if (!best[e.id] || cmp(e.version, best[e.id].version) > 0) best[e.id] = e;
      const entries = Object.values(best).map(e => Object.assign(e, status(e, installed))).sort((a, b) => a.title.localeCompare(b.title));
      last = {}; entries.forEach(e => { last[e.id] = e; });
      return { entries, problems, sources: sources().length };
    },
    /* a local file to install: folder entries are used in place; url entries are downloaded (sha256 checked) */
    async fetchFile(id) {
      const entry = last[id]; if (!entry) throw new Error('Not in the catalog: ' + id);
      if (entry.file) { if (!fs.existsSync(entry.file)) throw new Error('The file is no longer there: ' + entry.file); return entry.file; }
      if (!entry.download) throw new Error('No download link');
      const r = await fetch(entry.download); if (!r.ok) throw new Error('Download failed: HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (entry.sha256 && crypto.createHash('sha256').update(buf).digest('hex') !== entry.sha256) throw new Error('The downloaded file does not match the catalog (sha256)');
      const manifest = peekPack(buf).manifest;
      if (manifest.id !== entry.id || manifest.version !== entry.version) throw new Error('The downloaded package identity or version does not match the catalog');
      const dir = path.join(os.tmpdir(), 'semitec-academy-downloads'); fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, `${crypto.randomUUID()}.stlp`); fs.writeFileSync(out, buf);
      return out;
    }
  };
};
