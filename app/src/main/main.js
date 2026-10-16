/* main.js — Electron main process: window, stl:// protocol, local data, IPC API.
   stl://app/...                    the app UI (src/renderer), training engine (/engine), pdf.js (/vendor/pdfjs)
   stl://pack/<packId>/<path>       files of an installed SemiTec Learning Package (.stlp); trainings get the engine + an injected config */
'use strict';
const { app, BrowserWindow, protocol, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DB } = require('./db');
const makeAuth = require('./auth');
const makeLibrary = require('./library');
const makePlanner = require('./planner');
const makeCatalog = require('./catalog');
const makeMine = require('./mine');
const { loadTrustedKeys, keyId } = require('../shared/packfmt');
const versions = require('../shared/versions');

const ROOT = path.join(__dirname, '..');                       // src/
const RENDERER = path.join(ROOT, 'renderer');
const ENGINE = path.join(ROOT, 'engine', 'training');
const PDFJS = path.dirname(require.resolve('pdfjs-dist/package.json'));
/* SEMITEC_TRUSTED_KEYS lets the end-to-end suite point the app at a throwaway key, so the
   repository never has to carry a package signed with the production key. Not used in a release. */
const TRUSTED_KEYS = process.env.SEMITEC_TRUSTED_KEYS || path.join(ROOT, '..', 'trusted-keys');

const argData = (process.argv.find(a => a.startsWith('--data-dir=')) || '').slice(11);
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json');
const S = { db: null, auth: null, lib: null, dataDir: null, user: null, pendingPack: null, win: null };

protocol.registerSchemesAsPrivileged([{ scheme: 'stl', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

/* ---------------- data folder ---------------- */
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')); } catch (e) { return null; } }
function defaultDataDir() { return path.join(app.getPath('documents'), 'SemiTec Academy'); }
function localKeysDir(dir = S.dataDir) { return path.join(dir, 'trusted-publishers'); }
/* A computer owner chooses which publisher keys to trust. Importing a public key never asks for or
   stores a publisher private key, and does not imply SemiTec Foundation approval. */
function trustedKeys() {
  const builtIn = loadTrustedKeys(TRUSTED_KEYS);
  Object.values(builtIn).forEach(k => { k.origin = 'built-in'; });
  const local = loadTrustedKeys(localKeysDir());
  for (const [id, key] of Object.entries(local)) if (!builtIn[id]) { key.origin = 'local'; builtIn[id] = key; }
  return builtIn;
}
function refreshServices() {
  const keys = trustedKeys();
  S.lib = makeLibrary({ db: S.db, dataDir: S.dataDir, trustedKeys: keys });
  S.plan = makePlanner({ db: S.db, lib: S.lib });
  S.catalog = makeCatalog({ db: S.db, lib: S.lib, trustedKeys: keys });
  S.mine = makeMine({ db: S.db, lib: S.lib });
}
function publicKeyInfo(file) {
  const pem = fs.readFileSync(path.resolve(file), 'utf8');
  if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(pem)) throw new Error('Choose a public key file, never a private key');
  const key = crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Publisher keys must be Ed25519 public keys (.pub.pem)');
  return { file: path.resolve(file), pem, keyId: keyId(pem), suggestedName: path.basename(file).replace(/\.pub\.pem$/i, '').replace(/[-_]+/g, ' ') };
}
function publisherKeys() {
  return Object.entries(loadTrustedKeys(localKeysDir())).map(([keyId, key]) => ({ keyId, name: key.name })).sort((a, b) => a.name.localeCompare(b.name));
}
async function openData(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (S.db) S.db.close();
  S.dataDir = dir;
  S.db = await DB.open(dir);
  S.auth = makeAuth(S.db);
  refreshServices();
}
const NOW = () => process.env.SEMITEC_NOW || undefined;   // tests may fix "today" (YYYY-MM-DD)
const devMode = () => process.env.SEMITEC_DEV === '1' || !!(S.db && S.db.setting('devMode'));

/* ---------------- stl:// protocol ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm', '.woff2': 'font/woff2',
  '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream', '.icc': 'application/octet-stream', '.ttf': 'font/ttf',
  '.m4v': 'video/mp4', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8' };
const TEXTY = /\.(v|sv|svh|vh|vhd|vhdl|xdc|sdc|tcl|py|c|h|cpp|hpp|ya?ml|ini|cfg|log|sh|do|f|s|asm|m)$/i;
function within(root, rel) {
  const p = path.resolve(root, ...rel.split('/').filter(Boolean));
  return (p === path.resolve(root) || p.startsWith(path.resolve(root) + path.sep)) ? p : null;
}
/* serves a file; supports HTTP Range requests (needed to seek in videos) */
function fileResponse(p, extraHeaders = {}, req = null) {
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return new Response('Not found', { status: 404 });
  const size = fs.statSync(p).size;
  const type = MIME[path.extname(p).toLowerCase()] || (TEXTY.test(p) ? 'text/plain; charset=utf-8' : 'application/octet-stream');
  const headers = Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' }, extraHeaders);
  const range = req && req.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && size > 0) {
    let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : Math.min(size - 1, start + 4 * 1048576 - 1);   // open ranges: 4 MB chunks
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const buf = Buffer.alloc(end - start + 1), fd = fs.openSync(p, 'r');
    fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd);
    return new Response(buf, { status: 206, headers: Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(buf.length) }) });
  }
  return new Response(fs.readFileSync(p), { headers });
}
const TRAINING_CONFIG = `<script>window.TRAINING_CONFIG = { mode: 'platform', progress: 'postMessage', urlParams: false, parentOrigin: 'stl://app', initTimeout: 8000, resume: true, allowReset: false };</script>\n  `;
/* A custom training is publisher content, not part of Academy's renderer. It has no preload bridge,
   runs in an iframe sandbox, cannot connect to the network and may only load local package files.
   Inline handlers are allowed because authored interactive lessons commonly create SVG/HTML controls
   from strings; Electron's renderer sandbox and the strict origin bridge still isolate it from Academy. */
const CUSTOM_TRAINING_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
function customTrainingResponse(file, headers, entry) {
  let html = fs.readFileSync(file, 'utf8');
  /* Keep the bridge at the training root even when an author chooses web/index.html. */
  const bridgePath = path.posix.relative(path.posix.dirname(entry), 'academy-bridge.js') || 'academy-bridge.js';
  const bridge = '<script src="' + bridgePath + '"></script>';
  html = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, bridge + '</head>') : bridge + html;
  return new Response(html, { headers: Object.assign({ 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'Content-Security-Policy': CUSTOM_TRAINING_CSP }, headers) });
}

function handle(req) {
  const u = new URL(req.url);
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (u.host === 'app') {
    if (rel.startsWith('engine/')) return fileResponse(within(ENGINE, rel.slice(7)));
    if (rel.startsWith('vendor/marked/')) return fileResponse(within(path.join(path.dirname(require.resolve('marked/package.json')), 'lib'), rel.slice(14)));
    if (rel.startsWith('vendor/dompurify/')) return fileResponse(within(path.dirname(require.resolve('dompurify')), rel.slice(17)));
    if (rel.startsWith('vendor/pdfjs/')) {
      const sub = rel.slice(13);
      if (!/^(build|standard_fonts|cmaps|wasm|iccs)\//.test(sub)) return new Response('Not found', { status: 404 });
      return fileResponse(within(PDFJS, sub));
    }
    return fileResponse(within(RENDERER, rel || 'index.html'));
  }
  if (u.host === 'pack') {
    const [packId, ...restParts] = rel.split('/');
    const m = S.lib && S.lib.manifestOf(packId);
    if (!m) return new Response('Pack not installed', { status: 404 });
    const rest = restParts.join('/');
    const cors = { 'Access-Control-Allow-Origin': 'stl://app' };
    const tr = (m.items || []).find(it => it.type === 'training' && (rest === it.path || rest.startsWith(it.path + '/')));
    if (tr) {
      const sub = rest.slice(tr.path.length + 1);
      if (tr.format === 2) {
        const entry = typeof tr.entry === 'string' ? tr.entry : 'index.html';
        const customHeaders = Object.assign({}, cors, { 'Content-Security-Policy': CUSTOM_TRAINING_CSP });
        if (sub === 'academy-bridge.js') return fileResponse(path.join(ENGINE, 'js', 'academy-bridge.js'), customHeaders, req);
        const inPack = within(S.lib.packDir(packId), rest);
        if (!inPack || !fs.existsSync(inPack)) return new Response('Not found', { status: 404 });
        if (sub === entry) return customTrainingResponse(inPack, cors, entry);
        return fileResponse(inPack, customHeaders, req);
      }
      if (sub === '' || sub === 'index.html') {
        const html = fs.readFileSync(path.join(ENGINE, 'index.html'), 'utf8').replace('<script src="js/md.js"></script>', TRAINING_CONFIG + '<script src="js/md.js"></script>');
        return new Response(html, { headers: { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' } });
      }
      const inPack = within(S.lib.packDir(packId), rest);
      if (inPack && fs.existsSync(inPack)) return fileResponse(inPack, cors, req);
      if (/^(css|js)\//.test(sub)) return fileResponse(within(ENGINE, sub), cors);
      return new Response('Not found', { status: 404 });
    }
    return fileResponse(within(S.lib.packDir(packId), rest), cors, req);
  }
  return new Response('Not found', { status: 404 });
}

/* ---------------- IPC (all calls return {ok, data} | {ok:false, error}) ---------------- */
function api(name, fn, { needsUser = false, needsData = true } = {}) {
  ipcMain.handle(name, async (e, ...args) => {
    try {
      if (e.senderFrame && !e.senderFrame.url.startsWith('stl://app/')) throw new Error('not allowed');
      if (needsData && !S.db) throw new Error('Choose a data folder first');
      if (needsUser && !S.user) throw new Error('Please log in');
      return { ok: true, data: await fn(...args) };
    } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
}
function registerIpc() {
  api('app:info', () => ({
    version: versions.APP_VERSION, capabilities: versions.capabilities(), history: versions.HISTORY,
    engine: JSON.parse(fs.readFileSync(path.join(ENGINE, 'ENGINE.json'), 'utf8')),
    dataDir: S.dataDir, defaultDataDir: defaultDataDir(), needsSetup: !S.db, devMode: devMode(),
    platform: process.platform, electron: process.versions.electron, user: S.user
  }), { needsData: false });
  api('app:chooseFolder', async () => {
    const r = await dialog.showOpenDialog(S.win, { properties: ['openDirectory', 'createDirectory'], title: 'Choose a folder for your SemiTec Academy data' });
    return r.canceled ? null : r.filePaths[0];
  }, { needsData: false });
  api('app:setup', async (dir) => {
    dir = path.resolve(dir || defaultDataDir());
    await openData(dir);
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify({ dataDir: dir }, null, 2));
    return { dataDir: dir };
  }, { needsData: false });
  api('app:moveData', async (dir) => {
    dir = path.resolve(dir);
    if (dir === S.dataDir) return { dataDir: dir };
    if (fs.existsSync(path.join(dir, 'learning.db'))) throw new Error('That folder already contains SemiTec Academy data');
    S.db.flush();
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(S.dataDir, 'learning.db'), path.join(dir, 'learning.db'));
    if (fs.existsSync(S.lib.packsDir)) fs.cpSync(S.lib.packsDir, path.join(dir, 'packs'), { recursive: true });
    if (fs.existsSync(localKeysDir())) fs.cpSync(localKeysDir(), path.join(dir, 'trusted-publishers'), { recursive: true });
    const old = S.dataDir;
    await openData(dir);
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify({ dataDir: dir }, null, 2));
    return { dataDir: dir, oldDataDir: old };
  }, { needsUser: true });
  api('app:openDataFolder', () => shell.openPath(S.dataDir));
  api('app:setDevMode', (on) => { S.db.setting('devMode', !!on); return devMode(); }, { needsUser: true });
  api('app:publisherKeys', () => publisherKeys(), { needsUser: true });
  api('app:choosePublisherKey', async () => {
    const r = await dialog.showOpenDialog(S.win, { title: 'Choose a publisher public key', filters: [{ name: 'Ed25519 public key', extensions: ['pem'] }], properties: ['openFile'] });
    return r.canceled ? null : publicKeyInfo(r.filePaths[0]);
  }, { needsUser: true });
  api('app:addPublisherKey', (file, name) => {
    const info = publicKeyInfo(file), label = String(name || '').trim();
    if (!label || label.length > 100) throw new Error('Enter a publisher name (1–100 characters)');
    if (loadTrustedKeys(TRUSTED_KEYS)[info.keyId]) throw new Error('This Foundation key is already included with the app');
    const dir = localKeysDir(); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, info.keyId + '.pub.pem'), info.pem);
    fs.writeFileSync(path.join(dir, info.keyId + '.json'), JSON.stringify({ name: label }, null, 2) + '\n');
    refreshServices();
    return publisherKeys();
  }, { needsUser: true });
  api('app:removePublisherKey', (id) => {
    if (!/^[a-f0-9]{16}$/.test(String(id || ''))) throw new Error('Invalid publisher key id');
    fs.rmSync(path.join(localKeysDir(), id + '.pub.pem'), { force: true });
    fs.rmSync(path.join(localKeysDir(), id + '.json'), { force: true });
    refreshServices();
    return publisherKeys();
  }, { needsUser: true });

  api('auth:exists', (username) => S.auth.exists(username));
  api('auth:register', (data) => { S.user = S.auth.register(data); S.db.setting('lastUser', S.user.username); return S.user; });
  api('auth:login', (data) => { S.user = S.auth.login(data); S.mine.cleanupOrphans(S.user.id); S.db.setting('lastUser', S.user.username); return S.user; });
  api('auth:logout', () => { S.user = null; return true; });
  api('auth:lastUser', () => S.db.setting('lastUser'));
  api('auth:changePassword', (data) => S.auth.changePassword(S.user.id, data), { needsUser: true });
  api('auth:updateName', (name) => (S.user = S.auth.updateName(S.user.id, name)), { needsUser: true });

  api('packs:list', () => {
    const mine = S.mine.ids(S.user.id), groups = S.mine.groups(S.user.id);
    return S.lib.list(S.user.id).map(p => Object.assign(p, { plan: S.plan.summaryFor(S.user.id, p.id, NOW()), mine: !!mine[p.id], addedAt: mine[p.id] || null,
      groups: groups.filter(g => g.packs.includes(p.id)).map(g => g.id) }));
  }, { needsUser: true });
  /* My packages and groups (1.5.0) */
  api('mine:add', (packId) => S.mine.add(S.user.id, packId), { needsUser: true });
  api('mine:removalInfo', (packId) => S.mine.removalInfo(S.user.id, packId), { needsUser: true });
  api('mine:remove', (packId, options) => S.mine.remove(S.user.id, packId, options), { needsUser: true });
  api('groups:list', () => S.mine.groups(S.user.id), { needsUser: true });
  api('groups:save', (o) => S.mine.saveGroup(S.user.id, o), { needsUser: true });
  api('groups:delete', (id) => S.mine.deleteGroup(S.user.id, id), { needsUser: true });
  api('groups:setForPack', (packId, ids) => S.mine.setPackGroups(S.user.id, packId, ids), { needsUser: true });
  /* catalog (1.5.0): sources are application settings, shared by all users of this computer */
  api('catalog:sources', () => S.catalog.sources(), { needsUser: true });
  api('catalog:addFolder', async () => {
    const r = await dialog.showOpenDialog(S.win, { properties: ['openDirectory'], title: 'Choose a folder with SemiTec Learning Packages (.stlp)' });
    return r.canceled ? null : S.catalog.addFolder(r.filePaths[0]);
  }, { needsUser: true });
  api('catalog:addFolderPath', (dir) => S.catalog.addFolder(dir), { needsUser: true });
  api('catalog:addUrl', (url, name) => S.catalog.addUrl(url, name), { needsUser: true });
  api('catalog:remove', (id) => S.catalog.remove(id), { needsUser: true });
  api('catalog:list', (force) => S.catalog.list(force), { needsUser: true });
  api('catalog:fetch', (id) => S.catalog.fetchFile(id), { needsUser: true });
  /* enrollment and study plans (1.4.0) */
  api('enroll:set', (packId, itemId, o) => { const r = S.plan.enroll(S.user.id, packId, itemId, o); S.mine.add(S.user.id, packId); return r; }, { needsUser: true });
  api('enroll:remove', (packId, itemId) => S.plan.unenroll(S.user.id, packId, itemId), { needsUser: true });
  api('plan:pack', (packId) => S.plan.packPlan(S.user.id, packId, NOW()), { needsUser: true });
  api('plan:project', (packId, itemId) => S.plan.projectPlan(S.user.id, packId, itemId, NOW()), { needsUser: true });
  api('plan:calendar', (from, to) => S.plan.calendar(S.user.id, from, to, NOW()), { needsUser: true });
  api('plan:today', () => S.plan.today(S.user.id, NOW()), { needsUser: true });
  api('projects:list', () => S.plan.projects(S.user.id, NOW()), { needsUser: true });
  api('certs:list', () => S.plan.certificates(S.user.id, S.user.displayName), { needsUser: true });
  api('app:savePdf', async (name) => {     /* the window, printed as PDF (used for certificates: the page shows only the certificate while printing) */
    const r = await dialog.showSaveDialog(S.win, { title: 'Save as PDF', defaultPath: path.join(app.getPath('documents'), String(name || 'certificate').replace(/[\\/:*?"<>|]+/g, '-') + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled) return null;
    const pdf = await S.win.webContents.printToPDF({ landscape: true, printBackground: true, pageSize: 'A4', margins: { marginType: 'none' } });
    fs.writeFileSync(r.filePath, pdf); return r.filePath;
  }, { needsUser: true });
  api('packs:get', (id) => S.lib.get(id, S.user.id), { needsUser: true });
  api('packs:choose', async () => {
    const r = await dialog.showOpenDialog(S.win, { title: 'Add a course pack', filters: [{ name: 'SemiTec Learning Package', extensions: ['stlp'] }], properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  }, { needsUser: true });
  api('packs:inspect', (file) => {
    const { pack, compat, installedVersion } = S.lib.inspect(file);
    const m = pack.manifest;
    return { file, id: m.id, version: m.version, title: m.title, description: m.description, publisher: m.publisher, minAppVersion: m.minAppVersion,
      items: (m.items || []).map(it => ({ id: it.id, type: it.type, title: it.title })), signature: pack.signature, compat, installedVersion, devMode: devMode(),
      size: fs.statSync(file).size };
  }, { needsUser: true });
  api('packs:install', (file) => { const r = S.lib.importFile(file, { userId: S.user.id, devMode: devMode() }); S.mine.add(S.user.id, r.id); return r; }, { needsUser: true });
  api('packs:remove', (id) => S.lib.remove(id), { needsUser: true });
  /* files of "material" items: save a copy / open with the system app (a temp copy, the pack stays untouched) */
  /* item file (material) or one of a lab's source files (rel = path inside the lab, listed in srcFiles) */
  const itemFile = (packId, itemId, rel) => {
    const m = S.lib.manifestOf(packId); const it = m && (m.items || []).find(i => i.id === itemId);
    if (!it) throw new Error('Unknown item');
    let file = it.file;
    if (rel) { if (!(it.srcFiles || []).includes(rel)) throw new Error('Not a file of this lab'); file = it.path + '/' + rel; }
    if (!file) throw new Error('No file for this item');
    const p = within(S.lib.packDir(packId), file); if (!p || !fs.existsSync(p)) throw new Error('File missing in the installed pack');
    return p;
  };
  api('packs:saveFile', async (packId, itemId, rel) => {
    const src = itemFile(packId, itemId, rel);
    const r = await dialog.showSaveDialog(S.win, { title: 'Save a copy', defaultPath: path.join(app.getPath('downloads'), path.basename(src)) });
    if (r.canceled) return null;
    fs.copyFileSync(src, r.filePath); return r.filePath;
  }, { needsUser: true });
  api('packs:saveZip', async (packId, itemId) => {    /* all source files of a lab as one zip */
    const m = S.lib.manifestOf(packId); const it = m && (m.items || []).find(i => i.id === itemId);
    if (!it || !(it.srcFiles || []).length) throw new Error('This lab has no files');
    const r = await dialog.showSaveDialog(S.win, { title: 'Save lab files', defaultPath: path.join(app.getPath('downloads'), it.id + '-files.zip'), filters: [{ name: 'Zip', extensions: ['zip'] }] });
    if (r.canceled) return null;
    const { zipSync } = require('fflate');
    const entries = {};
    for (const rel of it.srcFiles) entries[it.id + '/' + rel] = new Uint8Array(fs.readFileSync(itemFile(packId, itemId, rel)));
    fs.writeFileSync(r.filePath, zipSync(entries)); return r.filePath;
  }, { needsUser: true });
  api('packs:openFile', async (packId, itemId) => {
    const src = itemFile(packId, itemId);
    const dir = path.join(os.tmpdir(), 'semitec-academy', packId); fs.mkdirSync(dir, { recursive: true });
    const dst = path.join(dir, path.basename(src)); fs.copyFileSync(src, dst);
    const err = await shell.openPath(dst); if (err) throw new Error(err); return dst;
  }, { needsUser: true });
  api('app:openExternal', (url) => { if (!/^(https?:\/\/|mailto:)/.test(url)) throw new Error('Only web and email links can be opened'); return shell.openExternal(url); }, { needsUser: true });
  api('packs:pending', () => { const p = S.pendingPack; S.pendingPack = null; return p; }, { needsUser: true });

  api('progress:get', (packId, itemId) => S.lib.getProgress(S.user.id, packId, itemId), { needsUser: true });
  api('progress:set', (packId, itemId, type, state, percent, completed) => { const r = S.lib.setProgress(S.user.id, packId, itemId, type, state, percent, completed); S.mine.add(S.user.id, packId); return r; }, { needsUser: true });
  api('progress:reset', (packId) => S.lib.resetProgress(S.user.id, packId), { needsUser: true });
  api('progress:export', async () => {
    const r = await dialog.showSaveDialog(S.win, { title: 'Export my progress', defaultPath: `semitec-progress-${S.user.username}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return null;
    fs.writeFileSync(r.filePath, JSON.stringify({ app: versions.APP_VERSION, exportedAt: new Date().toISOString(), user: S.user, progress: S.lib.exportUser(S.user.id) }, null, 2));
    return r.filePath;
  }, { needsUser: true });
}

/* ---------------- window ---------------- */
const PACK_EXT = /\.stlp$/i;   // SemiTec Learning Package
function packFromArgs(argv) { return argv.find(a => PACK_EXT.test(a) && fs.existsSync(a)) || null; }
function offerPack(file) {
  if (!file) return;
  S.pendingPack = path.resolve(file);
  if (S.win) { S.win.webContents.send('open-pack', S.pendingPack); if (S.win.isMinimized()) S.win.restore(); S.win.focus(); }
}
function createWindow() {
  S.win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 900, minHeight: 600, title: 'SemiTec Academy', backgroundColor: '#f4f6fa', show: false,
    webPreferences: { preload: path.join(ROOT, 'preload', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  S.win.removeMenu();
  S.win.once('ready-to-show', () => S.win.show());
  S.win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  S.win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('stl://app/')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  S.win.webContents.on('will-frame-navigate', (e) => { if (!e.isMainFrame && !/^stl:\/\/(pack|app)\//.test(e.url)) e.preventDefault(); });
  S.win.loadURL('stl://app/index.html');
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv) => offerPack(packFromArgs(argv)));
  app.on('open-file', (e, file) => { e.preventDefault(); offerPack(file); });   // macOS
  app.whenReady().then(async () => {
    protocol.handle('stl', handle);
    registerIpc();
    const cfg = readConfig();
    const dir = argData || (cfg && cfg.dataDir);
    if (dir) await openData(dir);
    S.pendingPack = packFromArgs(process.argv) || S.pendingPack;
    createWindow();
  });
  app.on('window-all-closed', () => { if (S.db) S.db.flush(); app.quit(); });
  app.on('before-quit', () => { if (S.db) S.db.flush(); });
}
