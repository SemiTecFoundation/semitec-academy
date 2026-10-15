/* spec.js — a pack described in ONE JSON file ("pack spec") that points to the materials wherever
   they are. `stlp check` validates it, `stlp create` checks, assembles and builds the pack.
   Format: docs/PACK-SPEC.md. Paths are relative to the spec file. */
'use strict';
const fs = require('fs');
const path = require('path');
const { checkers, checkSchedule, checkAttachments, checkPrerequisites, PROJECT_CATEGORIES, PACK_ID, SEMVER, ID, materialKind, MD_EXT } = require('./validate');
const { CURRENT, minAppFor } = require('./versions');

const GROUPS = { trainings: 'training', labs: 'lab', readings: 'reading', videos: 'video', materials: 'material', projects: 'project' };
const slug = (s) => String(s || '').toLowerCase().replace(/\.[a-z0-9]{1,5}$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function loadSpec(specPath) {
  const raw = fs.readFileSync(specPath, 'utf8');
  try { return JSON.parse(raw); } catch (e) { throw new Error(path.basename(specPath) + ' is not valid JSON — ' + e.message); }
}

/* -> { errors[], warnings[], rows[], items[], formats, minApp, totalSize, spec } */
function checkSpec(specPath) {
  const base = path.dirname(path.resolve(specPath));
  const errors = [], warnings = [], rows = [];
  let cur = null;   // current row, to count problems per material
  const rep = {
    error: (w, m) => { errors.push(`${w}: ${m}`); if (cur) cur.errors.push(/^(pack|modules|spec)/.test(w) ? `${w}: ${m}` : m); },
    warn: (w, m) => { warnings.push(`${w}: ${m}`); if (cur) cur.warnings.push(/^(pack|modules|spec)/.test(w) ? `${w}: ${m}` : m); }
  };
  const C = checkers(rep);
  let spec;
  try { spec = loadSpec(specPath); } catch (e) { errors.push(e.message); return { errors, warnings, rows, items: [] }; }
  const abs = (p) => path.resolve(base, p);
  const p = spec.pack || {};
  cur = { type: 'pack', id: p.id || '?', title: p.title || '', source: path.basename(specPath), errors: [], warnings: [] }; rows.push(cur);
  if (!spec.pack) rep.error('spec', 'missing "pack" section');
  if (!PACK_ID.test(p.id || '')) rep.error('pack.id', 'must be reverse-domain style, lowercase, e.g. "org.semitec.fpga-starter"');
  if (!SEMVER.test(p.version || '')) rep.error('pack.version', 'must be MAJOR.MINOR.PATCH, e.g. "1.0.0"');
  if (!p.title) rep.error('pack.title', 'missing');
  if (!p.description) rep.warn('pack.description', 'missing (shown in the library)');
  if (p.cover) C.image(abs(p.cover), 'pack.cover'); else rep.warn('pack.cover', 'no cover image (a default is used)');
  if (p.publisherLogo) C.image(abs(p.publisherLogo), 'pack.publisherLogo');
  else rep.warn('pack.publisherLogo', 'no publisher logo (students filter and recognise packages by publisher)');
  if (p.publisherUrl && !/^https?:\/\//.test(p.publisherUrl)) rep.error('pack.publisherUrl', 'must start with http:// or https://');
  if (p.contact != null) {
    if (!p.contact || typeof p.contact !== 'object' || Array.isArray(p.contact)) rep.error('pack.contact', 'must be an object with optional name, email, url and instructions');
    else {
      if (p.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contact.email)) rep.error('pack.contact.email', 'must be an email address');
      if (p.contact.url && !/^https?:\/\//.test(p.contact.url)) rep.error('pack.contact.url', 'must start with http:// or https://');
      if (!p.contact.name && !p.contact.email && !p.contact.url && !p.contact.instructions) rep.warn('pack.contact', 'has no contact information');
    }
  }
  if (p.certificate) { try { JSON.parse(fs.readFileSync(abs(p.certificate), 'utf8')); } catch (e) { rep.error('pack.certificate', 'not a readable JSON file: ' + p.certificate); } }

  const items = [], ids = new Set(), formats = { pack: CURRENT.pack };
  let totalSize = 0;
  const known = new Set(Object.keys(GROUPS).concat(['pack', 'modules', 'schedule', 'specVersion', '$schema', 'notes']));
  Object.keys(spec).forEach(k => { if (!known.has(k)) rep.warn('spec', `unknown section "${k}" (ignored)`); });
  for (const [group, type] of Object.entries(GROUPS)) {
    (spec[group] || []).forEach((e, i) => {
      const src = e.source ? abs(e.source) : null;
      const id = e.id || slug(e.title || (e.source ? path.basename(e.source) : '')) || `${type}-${i + 1}`;
      const w = `${group}[${i}] "${id}"`;
      cur = { type, id, title: e.title || '', source: e.source || e.url || '', errors: [], warnings: [] }; rows.push(cur);
      if (!ID.test(id)) rep.error(w, 'id must be lowercase letters, digits, - . _');
      if (ids.has(id)) rep.error(w, 'duplicate id (ids must be unique in the whole pack)'); ids.add(id);
      formats[type] = Math.max(formats[type] || 0, CURRENT[type]);
      let info = null;
      if (type === 'training') info = e.source ? C.training(src, w) : rep.error(w, 'missing "source" (training folder)');
      if (type === 'lab') info = e.source ? C.lab(src, w) : rep.error(w, 'missing "source" (lab folder with lab.json)');
      if (type === 'project') info = e.source ? C.project(src, w) : rep.error(w, 'missing "source" (project folder with project.json)');
      if (type === 'project' && e.category && !PROJECT_CATEGORIES.includes(e.category)) rep.warn(w, `category "${e.category}" is not one of ${PROJECT_CATEGORIES.join(', ')}`);
      if (e.plannedWeeks != null && !(Number.isInteger(+e.plannedWeeks) && +e.plannedWeeks >= 0 && +e.plannedWeeks <= 104)) rep.error(w, 'plannedWeeks must be a whole number 0–104');
      if (type === 'reading') info = !e.source ? rep.error(w, 'missing "source" (PDF or Markdown file)')
        : MD_EXT.test(e.source) ? C.markdown(src, w) : /\.pdf$/i.test(e.source) ? C.pdf(src, w) : rep.error(w, 'a reading must be a .pdf or a .md file');
      if (type === 'video') {
        if (e.source) info = C.video(src, w); else if (e.url) C.url(e.url, w); else rep.error(w, 'needs "source" (mp4/webm file) or "url"');
        if (e.poster) C.image(abs(e.poster), w + ' poster');
      }
      if (type === 'material') { if (e.source) info = C.material(src, w); else if (e.url) C.url(e.url, w); else rep.error(w, 'needs "source" (file) or "url"'); }
      if (info && info.size) totalSize += info.size;
      if (info && info.format) formats[type] = Math.max(formats[type], info.format);
      const title = e.title || (info && info.title) || (e.source ? path.basename(e.source).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') : id);
      if (!e.title && !(info && info.title)) rep.warn(w, `no "title" — using "${title}"`);
      cur.title = title;
      cur.info = info ? (type === 'project' ? info.weeks + ' weeks, ' + info.milestones + ' milestones' : (info.schedule ? info.schedule.weeks + '-week plan, ' : '') + (info.format === 2 && type === 'reading' ? 'Markdown' + (info.assets.length ? ', ' + info.assets.length + ' images/files' : '') : info.topics ? info.topics + ' topics' : info.steps ? info.steps + ' steps' + (info.srcFiles && info.srcFiles.length ? ', ' + info.srcFiles.length + ' files' : '') : info.size ? (info.size >= 1048576 ? (info.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(info.size / 1024)) + ' KB') + (info.kind ? ' ' + info.kind : '') : '')) : (e.url ? 'link' : '');
      if (e.plannedWeeks) cur.info = (cur.info ? cur.info + ', ' : '') + 'planned ' + e.plannedWeeks + ' wk';
      if (e.prerequisite === true) cur.info = (cur.info ? cur.info + ', ' : '') + 'prerequisite (not counted)';
      items.push(Object.assign({}, e, { id, type, title, _src: src, _info: info }));
    });
  }
  cur = { type: 'modules', id: '', title: '', source: '', errors: [], warnings: [] };
  if (!items.length) rep.error('spec', 'no materials — add trainings, labs, readings, videos, materials or projects');
  (spec.modules || []).forEach((m, i) => {
    if (!m.id || !m.title) rep.error(`modules[${i}]`, 'needs id and title');
    (m.items || []).forEach(r => { if (!ids.has(r)) rep.error(`modules[${i}] "${m.id}"`, `unknown item "${r}"`); });
  });
  if (cur.errors.length || cur.warnings.length) rows.push(cur);
  cur = { type: 'links', id: '', title: '', source: '', errors: [], warnings: [] };
  checkAttachments(items, rep);
  checkPrerequisites(items, spec.schedule, rep);
  if (cur.errors.length || cur.warnings.length) rows.push(cur);
  cur = { type: 'schedule', id: '', title: '', source: '', errors: [], warnings: [] };
  checkSchedule(spec.schedule, ids, rep, new Set(items.filter(i => i.type !== 'project' && !i.for && !i.prerequisite).map(i => i.id)));
  if (cur.errors.length || cur.warnings.length) rows.push(cur);
  const minApp = minAppFor(formats);
  if (!minApp) errors.push('no app version supports this combination of formats ' + JSON.stringify(formats));
  return { errors, warnings, rows, items, formats, minApp, totalSize, spec };
}

/* Copy everything into a pack source folder (pack.json + trainings/ labs/ readings/ videos/ materials/). */
function assemble(specPath, outDir, result) {
  const r = result || checkSpec(specPath);
  if (r.errors.length) throw new Error('the spec has errors — run check first');
  const base = path.dirname(path.resolve(specPath));
  const spec = r.spec, P = spec.pack;
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const copyDir = (src, dst, skip) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (e.name.startsWith('.') || (skip && skip(e.name, e.isDirectory()))) continue;
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
    }
  };
  const copy = (src, rel) => { const d = path.join(outDir, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(src, d); return rel; };
  const ext = (f) => path.extname(f).toLowerCase();
  const pack = {
    id: P.id, version: P.version, title: P.title, description: P.description || '', language: P.language || 'en',
    publisher: P.publisher || '', authors: P.authors || [], cover: P.cover ? copy(path.resolve(base, P.cover), 'cover' + ext(P.cover)) : null,
    publisherLogo: P.publisherLogo ? copy(path.resolve(base, P.publisherLogo), 'publisher-logo' + ext(P.publisherLogo)) : null, publisherUrl: P.publisherUrl || '',
    modules: spec.modules || [], items: []
  };
  if (P.contact) pack.contact = P.contact;
  if (spec.schedule) pack.schedule = spec.schedule;
  if (P.certificate) pack.certificate = JSON.parse(fs.readFileSync(path.resolve(base, P.certificate), 'utf8'));   // package certificate design (certificate.json of the training template)
  for (const it of r.items) {
    const o = { id: it.id, type: it.type, title: it.title, description: it.description || '', estimatedTime: it.estimatedTime || it.duration || '' };
    if (it.plannedWeeks != null) o.plannedWeeks = +it.plannedWeeks;
    if (it.for) o.for = it.for;
    if (it.prerequisite) o.prerequisite = true;
    if (it.type === 'project' && (it.category || (it._info && it._info.category))) o.category = it.category || it._info.category;
    if (it.type === 'training') {
      o.path = 'trainings/' + it.id;
      copyDir(it._src, path.join(outDir, o.path), (n, d) => (d && ['js', 'tools', 'examples', 'dist', 'reference', 'node_modules'].includes(n)) || ['index.html', 'README.md', 'SKILL.md', 'INTEGRATION.md'].includes(n));
      for (const f of ['css/app.css', 'css/certificate.css']) fs.rmSync(path.join(outDir, o.path, f), { force: true });
    } else if (it.type === 'lab') {
      o.path = 'labs/' + it.id; copyDir(it._src, path.join(outDir, o.path));
    } else if (it.type === 'project') {
      o.path = 'projects/' + it.id; copyDir(it._src, path.join(outDir, o.path));
    } else if (it.type === 'reading' && MD_EXT.test(it._src)) {          // Markdown + its images, in their own folder
      o.file = copy(it._src, 'readings/' + it.id + '/' + path.basename(it._src));
      o.assets = (it._info && it._info.assets) || [];
      o.assets.forEach(a => copy(path.join(path.dirname(it._src), a), 'readings/' + it.id + '/' + a));
    } else if (it.type === 'reading') {
      o.file = copy(it._src, 'readings/' + it.id + '.pdf');
    } else if (it.type === 'video') {
      if (it._src) o.file = copy(it._src, 'videos/' + it.id + ext(it._src)); else o.url = it.url;
      if (it.poster) o.poster = copy(path.resolve(base, it.poster), 'videos/' + it.id + '-poster' + ext(it.poster));
    } else if (it.type === 'material') {
      if (it._src) {
        o.file = copy(it._src, 'materials/' + it.id + '/' + path.basename(it._src)); o.kind = materialKind(it._src);
        if (o.kind === 'markdown') { o.assets = (it._info && it._info.assets) || []; o.assets.forEach(a => copy(path.join(path.dirname(it._src), a), 'materials/' + it.id + '/' + a)); }
      } else { o.url = it.url; o.kind = 'link'; }
    }
    pack.items.push(o);
  }
  fs.writeFileSync(path.join(outDir, 'pack.json'), JSON.stringify(pack, null, 2) + '\n');
  return pack;
}

module.exports = { checkSpec, assemble, loadSpec, GROUPS };
