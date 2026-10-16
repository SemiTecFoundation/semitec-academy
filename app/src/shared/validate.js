/* validate.js — checks course materials before they go into a pack.
   - checkers(report): per-material checks on absolute paths (training folder, lab folder, PDF, video, other file)
   - validatePack(dir): checks an assembled pack SOURCE folder (pack.json + trainings/ labs/ …)
   - collectFiles(dir, pack): the files that go into the .stlp package
   Used by the packer (stlp check / create / validate / build). */
'use strict';
const fs = require('fs');
const path = require('path');
const { CURRENT } = require('./versions');

const ID = /^[a-z0-9][a-z0-9._-]{0,80}$/;
const PACK_ID = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;     // reverse-domain style: org.semitec.fpga-starter
const SEMVER = /^\d+\.\d+\.\d+$/;
const QTYPES = new Set(['single', 'truefalse', 'multiple', 'order', 'match', 'hotspot']);
const BLOCKS = new Set(['text', 'callout', 'image', 'svg', 'compare', 'accordion', 'tabs', 'flipcards', 'reveal', 'scrolly', 'stepper', 'sort', 'categorize', 'code', 'table', 'video']);
const TYPES = ['training', 'lab', 'reading', 'video', 'material', 'project'];
const VIDEO_EXT = /\.(mp4|m4v|webm)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const MD_EXT = /\.(md|markdown)$/i;
const TEXT_EXT = /\.(txt|v|sv|svh|vh|vhd|vhdl|xdc|sdc|tcl|py|c|h|cpp|hpp|json|csv|ya?ml|ini|cfg|log|sh|do|f|s|asm|m)$/i;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/* Package branding deliberately has a small, colour-only surface. Package manifests are data from
   publishers, not stylesheet input: a strict hex-only format keeps it safe to apply in the renderer. */
function colorRgb(value) {
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
}
function luminance(value) {
  return colorRgb(value).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
function checkBranding(branding, rep, where = 'pack.branding') {
  if (branding == null) return false;
  if (!branding || typeof branding !== 'object' || Array.isArray(branding)) {
    rep.error(where, 'must be an object with accent, accentInk and optional accentSoft'); return false;
  }
  const allowed = new Set(['accent', 'accentInk', 'accentSoft']);
  Object.keys(branding).forEach(k => { if (!allowed.has(k)) rep.error(where, `unknown field "${k}" (use only accent, accentInk, accentSoft)`); });
  for (const k of ['accent', 'accentInk']) {
    if (!HEX_COLOR.test(branding[k] || '')) rep.error(`${where}.${k}`, 'must be a six-digit hex colour such as "#007A5E"');
  }
  if (branding.accentSoft != null && !HEX_COLOR.test(branding.accentSoft)) rep.error(`${where}.accentSoft`, 'must be a six-digit hex colour such as "#E0F3ED"');
  if (HEX_COLOR.test(branding.accent || '') && HEX_COLOR.test(branding.accentInk || '') && contrast(branding.accent, branding.accentInk) < 4.5) {
    rep.error(where, 'accent and accentInk need at least 4.5:1 contrast so button and link text stays readable');
  }
  return true;
}

/* kind of an "other material" file, used by the app to pick a viewer */
function materialKind(file) {
  if (/\.pdf$/i.test(file)) return 'pdf';
  if (MD_EXT.test(file)) return 'markdown';
  if (IMAGE_EXT.test(file)) return 'image';
  if (TEXT_EXT.test(file)) return 'text';
  if (VIDEO_EXT.test(file)) return 'video';
  return 'file';
}
const exists = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
function head(p, n) { const b = Buffer.alloc(n); const fd = fs.openSync(p, 'r'); fs.readSync(fd, b, 0, n, 0); fs.closeSync(fd); return b; }
function tail(p, n) { const size = fs.statSync(p).size; const b = Buffer.alloc(Math.min(n, size)); const fd = fs.openSync(p, 'r'); fs.readSync(fd, b, 0, b.length, size - b.length); fs.closeSync(fd); return b; }
const MB = (b) => (b / 1048576).toFixed(1) + ' MB';

/* report = { error(where, msg), warn(where, msg) } — returns check functions on ABSOLUTE paths */
function checkers(report) {
  const E = report.error, W = report.warn;
  const readJSON = (p, w, quiet) => {
    if (!exists(p)) { if (!quiet) E(w, 'file not found: ' + p); return null; }
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (!quiet) E(w, path.basename(p) + ' is not valid JSON — ' + e.message); return null; }
  };
  function quiz(q, refIds, w, refWord) {
    const qs = q.questions || [];
    if (!qs.length) W(w, 'quiz has no questions');
    const qids = new Set();
    if (q.passThreshold != null && !(q.passThreshold > 0 && q.passThreshold <= 1)) E(w, 'passThreshold must be between 0 and 1');
    qs.forEach((x, i) => {
      const qw = `${w} q${i + 1}`, t = x.type || 'single';
      if (x.id) { if (qids.has(x.id)) E(qw, 'duplicate question id ' + x.id); qids.add(x.id); }
      if (!x.text) E(qw, 'missing question text');
      if (!QTYPES.has(t)) return E(qw, 'unknown question type "' + t + '"');
      if (['single', 'truefalse', 'multiple'].includes(t)) {
        const n = (x.options || []).length, c = x.correct || [];
        if (n < 2) E(qw, 'needs 2+ options');
        if (!c.length || c.some(k => !Number.isInteger(k) || k < 0 || k >= n)) E(qw, `"correct" index out of range (0..${n - 1})`);
        if (t !== 'multiple' && c.length !== 1) E(qw, `type ${t} needs exactly one correct answer (use "multiple")`);
      }
      if (t === 'order' && (x.items || []).length < 2) E(qw, 'order needs 2+ items');
      if (t === 'match') { const cats = new Set((x.categories || []).map(c => c.id)); (x.items || []).forEach(it => { if (!cats.has(it.category)) E(qw, 'unknown category ' + it.category); }); }
      if (t === 'hotspot') { const sp = new Set((x.spots || []).map(s => s.id)); if (!(x.correct || []).length) E(qw, 'no correct spot'); (x.correct || []).forEach(c => { if (!sp.has(c)) E(qw, 'correct spot not in spots: ' + c); }); }
      if (!(x.review || []).length) W(qw, `no "review" ${refWord} — a failed student gets no reading hint`);
      for (const r of x.review || []) if (!refIds.has(r)) E(qw, `review "${r}" is not a ${refWord} id`);
    });
  }
  return {
    /* training made with the web training template */
    training(dir, w) {
      if (!isDir(dir)) return E(w, 'training folder not found: ' + dir);
      const tr = readJSON(path.join(dir, 'training.json'), w); if (!tr) return null;
      if (!tr.id) E(w, 'training.json: missing "id"');
      if (!tr.title) E(w, 'training.json: missing "title"');
      if (!(tr.topics || []).length) E(w, 'training.json: no topics');
      const tids = new Set();
      for (const f of tr.topics || []) {
        const tw = `${w} › topics/${f}`;
        const t = readJSON(path.join(dir, 'topics', f), tw); if (!t) continue;
        if (!t.id) E(tw, 'missing topic id'); else if (tids.has(t.id)) E(tw, 'duplicate topic id ' + t.id); tids.add(t.id);
        if (!(t.subsections || []).length) E(tw, 'topic has no subsections');
        const subs = new Set();
        (t.subsections || []).forEach(s => {
          if (!s.id) E(tw, 'subsection without id'); else if (subs.has(s.id)) E(tw, 'duplicate subsection id ' + s.id); subs.add(s.id);
          if (!(s.blocks || []).length) W(tw, `subsection "${s.id}" is empty`);
          const walk = (blocks) => (blocks || []).forEach(b => {
            if (!BLOCKS.has(b.type)) E(tw, `unknown block "${b.type}" in ${s.id}`);
            for (const k of ['src', 'before', 'after']) {
              if (b[k] && !/^(https?:|data:)/.test(b[k])) {
                const p = path.join(dir, b[k]);
                if (!exists(p)) E(tw, `${s.id}: asset not found ${b[k]}`);
                else if ((b.type === 'scrolly' || b.type === 'stepper') && !/data-step/.test(fs.readFileSync(p, 'utf8'))) W(tw, `${s.id}: ${b[k]} has no data-step elements`);
              }
            }
            (b.items || []).forEach(x => walk(x.blocks)); (b.tabs || []).forEach(x => walk(x.blocks));
          });
          walk(s.blocks);
        });
        if (t.quiz) quiz(t.quiz, subs, tw, 'subsection');
        else W(tw, 'no quiz (topic completes with a button)');
      }
      if (tr.certificate && !exists(path.join(dir, tr.certificate))) E(w, 'certificate file not found: ' + tr.certificate);
      /* optional study plan of the training: { "weeks": 3, "topics": [ { "week": 1, "topics": ["topic-id", …] } ] } */
      let schedule = null;
      if (tr.schedule) {
        const sc = tr.schedule, weeks = +sc.weeks || 0;
        if (!(weeks >= 1 && weeks <= 104)) E(w, 'training.json schedule.weeks must be 1–104');
        const titles = {};
        for (const f of tr.topics || []) { const t = readJSON(path.join(dir, 'topics', f), w, true); if (t && t.id) titles[t.id] = t.title || t.id; }
        const plan = (sc.topics || []).map((x, i) => {
          const wk = x.weeks != null ? x.weeks : x.week;
          const span = Array.isArray(wk) ? wk : String(wk).split(/[-–]/).map(Number);
          if (!(span[0] >= 1) || (span[1] || span[0]) > weeks) E(w, `schedule.topics[${i}]: week must be within 1–${weeks}`);
          (x.topics || []).forEach(id => { if (!titles[id]) E(w, `schedule.topics[${i}]: unknown topic id "${id}"`); });
          return { weeks: [span[0], span[1] || span[0]], titles: (x.topics || []).map(id => titles[id] || id) };
        });
        schedule = { weeks, topics: plan };
      }
      return { title: tr.title, topics: (tr.topics || []).length, hours: tr.hours, schedule };
    },
    /* project folder (made with the project-brief template): project.json (+ brief PDF, files) */
    project(dir, w) {
      if (!isDir(dir)) return E(w, 'project folder not found: ' + dir);
      const p = readJSON(path.join(dir, 'project.json'), w); if (!p) return null;
      if (p.format !== 1) E(w, 'project.json: "format" must be 1');
      if (!p.title) E(w, 'project.json: missing "title"');
      if (!p.summary) W(w, 'project.json: no "summary" (shown on the project card)');
      const weeks = p.weeks || [], dur = +p.durationWeeks || Math.max(0, ...weeks.map(x => +x.week || 0));
      if (!weeks.length) E(w, 'project.json: no "weeks" (the weekly plan / tracker)');
      const seen = new Set();
      weeks.forEach((x, i) => {
        if (!(+x.week >= 1)) E(w, `weeks[${i}]: "week" must be a number ≥ 1`);
        else if (seen.has(+x.week)) E(w, `weeks[${i}]: week ${x.week} appears twice`); seen.add(+x.week);
        if (!x.tasks) E(w, `weeks[${i}]: no "tasks" text`);
        if (dur && +x.week > dur) E(w, `weeks[${i}]: week ${x.week} is after durationWeeks ${dur}`);
      });
      (p.milestones || []).forEach((m, i) => {
        const v = m.weeks != null ? m.weeks : m.week; const span = Array.isArray(v) ? v : String(v).split(/[-–]/).map(Number);
        if (!(span[0] >= 1)) E(w, `milestones[${i}]: needs "weeks" like [1, 4]`);
        else if (dur && (span[1] || span[0]) > dur) E(w, `milestones[${i}]: ends after week ${dur}`);
        if (!m.milestone && !m.title) E(w, `milestones[${i}]: needs "milestone" text`);
      });
      (p.deliverables || []).forEach((d, i) => { if (!d.title) E(w, `deliverables[${i}]: needs "title"`); if (d.dueWeek && dur && d.dueWeek > dur) E(w, `deliverables[${i}]: dueWeek after the end`); });
      (p.assessment || []).forEach((c, i) => { if (!c.criterion) E(w, `assessment[${i}]: needs "criterion"`); });
      if (p.category && !PROJECT_CATEGORIES.includes(p.category)) W(w, `project.json: category "${p.category}" is not one of ${PROJECT_CATEGORIES.join(', ')}`);
      if (p.brief) { if (!exists(path.join(dir, p.brief))) E(w, 'brief file not found: ' + p.brief); else if (!/\.pdf$/i.test(p.brief)) W(w, 'brief is not a PDF'); }
      else W(w, 'no "brief" PDF — students only see the plan');
      const files = [];
      const walk = (r) => fs.readdirSync(path.join(dir, r)).forEach(n => { if (n.startsWith('.')) return; const q = r ? r + '/' + n : n; isDir(path.join(dir, q)) ? walk(q) : files.push(q); });
      walk('');
      return { title: p.title, weeks: weeks.length, durationWeeks: dur, milestones: (p.milestones || []).length, summary: p.summary || '', format: 1, category: p.category || '',
        size: files.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0) };
    },
    /* lab folder: lab.json (+ manual PDF) */
    lab(dir, w) {
      if (!isDir(dir)) return E(w, 'lab folder not found: ' + dir);
      const lab = readJSON(path.join(dir, 'lab.json'), w); if (!lab) return null;
      if (!lab.title) E(w, 'lab.json: missing "title"');
      if (lab.manual) this.pdf(path.join(dir, lab.manual), w + ' › manual');
      else W(w, 'no manual PDF ("manual")');
      const steps = lab.steps || [], sids = new Set();
      if (!steps.length) E(w, 'lab.json: no steps');
      steps.forEach((s, i) => {
        if (!ID.test(s.id || '')) E(w, `step ${i + 1}: id must be lowercase letters, digits, - . _`);
        if (sids.has(s.id)) E(w, 'duplicate step id ' + s.id); sids.add(s.id);
        if (!s.title) E(w, `step ${i + 1}: missing title`);
        if (!s.md && !s.code) W(w, `step "${s.id}" has no text`);
        if (s.manualPage && !lab.manual) W(w, `step "${s.id}" links a manual page but the lab has no manual`);
      });
      if (lab.quiz) quiz(lab.quiz, sids, w + ' › quiz', 'step');
      else W(w, 'no check quiz');
      /* source files (lab format 2): "files": "src" (a folder) or ["src/", "docs/notes.md", …] */
      const srcFiles = [];
      if (lab.files != null) {
        const entries = typeof lab.files === 'string' ? [lab.files] : Array.isArray(lab.files) ? lab.files : (E(w, '"files" must be a folder name or a list of paths'), []);
        const walk = (rel) => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).forEach(e => {
          if (e.name.startsWith('.')) return;
          const r = rel.replace(/\/$/, '') + '/' + e.name;
          if (e.isDirectory()) walk(r); else srcFiles.push(r);
        });
        for (const ent of entries) {
          const rel = String(ent).replace(/\/+$/, '');
          if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) { E(w, `files: "${ent}" must be a path inside the lab folder`); continue; }
          if (isDir(path.join(dir, rel))) walk(rel);
          else if (exists(path.join(dir, rel))) srcFiles.push(rel);
          else E(w, 'files: not found ' + ent);
        }
        if (!srcFiles.length) W(w, '"files" lists no files');
        const total = srcFiles.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
        if (total > 50 * 1048576) W(w, `source files are large (${MB(total)}) — consider a material item instead`);
        if (srcFiles.includes('lab.json') || (lab.manual && srcFiles.includes(lab.manual))) W(w, 'files include lab.json / the manual — list only the source files');
      }
      const uniq = [...new Set(srcFiles)].sort();
      steps.forEach(s => (s.files || []).forEach(f => { if (!uniq.includes(f)) E(w, `step "${s.id}" links "${f}" which is not in "files"`); }));
      return { title: lab.title, steps: steps.length, time: lab.estimatedTime, srcFiles: uniq, format: uniq.length ? 2 : 1 };
    },
    pdf(file, w) {
      if (!exists(file)) return E(w, 'PDF not found: ' + file);
      if (head(file, 5).toString() !== '%PDF-') return E(w, path.basename(file) + ' is not a PDF');
      if (!/%%EOF/.test(tail(file, 2048).toString('latin1'))) W(w, path.basename(file) + ' may be truncated (no %%EOF at the end)');
      return { size: fs.statSync(file).size };
    },
    video(file, w) {
      if (!exists(file)) return E(w, 'video not found: ' + file);
      if (!VIDEO_EXT.test(file)) return E(w, 'video must be .mp4 (H.264 + AAC) or .webm (VP9/AV1 + Opus): ' + path.basename(file));
      const h = head(file, 12), size = fs.statSync(file).size;
      const mp4 = h.slice(4, 8).toString() === 'ftyp', webm = h.readUInt32BE(0) === 0x1a45dfa3;
      if (!mp4 && !webm) E(w, path.basename(file) + ' is not a valid MP4/WebM file');
      if (size > 500 * 1048576) W(w, `video is large (${MB(size)}) — consider 720p / lower bitrate`);
      return { size };
    },
    /* Markdown document (reading format 2 / material kind "markdown"): local images and linked files
       must exist and stay inside the document's folder; they are packed together with the document. */
    markdown(file, w) {
      if (!exists(file)) return E(w, 'Markdown file not found: ' + file);
      const size = fs.statSync(file).size;
      if (size > 5 * 1048576) W(w, `Markdown file is large (${MB(size)})`);
      let txt;
      try { txt = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file)); } catch (e) { return E(w, path.basename(file) + ' is not UTF-8 text'); }
      if (!/^\s*#{1,3}\s/m.test(txt)) W(w, path.basename(file) + ' has no headings (# …) — the reader shows no outline');
      const refs = new Set();
      const re = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)|<img[^>]+src=["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(txt))) {
        let u = (m[1] || m[2] || '').split('#')[0].split('?')[0];
        if (!u || /^(https?:|mailto:|data:|tel:)/i.test(u)) continue;
        try { u = decodeURI(u); } catch (e) {}
        refs.add(u);
      }
      const assets = [], base = path.dirname(file);
      for (const r of refs) {
        const norm = path.posix.normalize(r.replace(/\\/g, '/'));
        if (norm.startsWith('../') || norm.startsWith('/')) { E(w, `"${r}" is outside the document's folder — move it next to the .md file`); continue; }
        if (!exists(path.join(base, norm))) { if (!isDir(path.join(base, norm))) E(w, `link / image not found: ${r}`); continue; }
        if (!MD_EXT.test(norm) || norm !== path.basename(file)) assets.push(norm);
      }
      return { size: size + assets.reduce((a, f) => a + fs.statSync(path.join(base, f)).size, 0), assets: [...new Set(assets)].sort(), format: 2 };
    },
    material(file, w) {
      if (!exists(file)) return E(w, 'file not found: ' + file);
      const size = fs.statSync(file).size;
      if (!size) E(w, 'file is empty: ' + path.basename(file));
      if (size > 300 * 1048576) W(w, `file is large (${MB(size)})`);
      const kind = materialKind(file);
      if (kind === 'pdf') this.pdf(file, w);
      if (kind === 'markdown') { const r = this.markdown(file, w); return { size: r ? r.size : size, kind, assets: r ? r.assets : [] }; }
      return { size, kind };
    },
    image(file, w) {
      if (!exists(file)) return E(w, 'image not found: ' + file);
      if (!IMAGE_EXT.test(file)) E(w, 'image must be png, jpg, gif, webp or svg');
      return { size: fs.statSync(file).size };
    },
    url(u, w) { if (!/^https?:\/\/[^\s]+$/.test(u || '')) E(w, 'url must start with http:// or https://'); }
  };
}

/* ---------- assembled pack source folder ---------- */
function validatePack(dir) {
  const errors = [], warnings = [];
  const rep = { error: (w, m) => errors.push(`${w}: ${m}`), warn: (w, m) => warnings.push(`${w}: ${m}`) };
  const C = checkers(rep);
  const formats = { pack: 1 };
  const pj = path.join(dir, 'pack.json');
  if (!exists(pj)) { rep.error('pack.json', 'not found'); return { errors, warnings, formats }; }
  let pack;
  try { pack = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch (e) { rep.error('pack.json', 'invalid JSON — ' + e.message); return { errors, warnings, formats }; }
  if (!PACK_ID.test(pack.id || '')) rep.error('pack.json', 'id must be reverse-domain style, lowercase, e.g. "org.semitec.fpga-starter"');
  if (!SEMVER.test(pack.version || '')) rep.error('pack.json', 'version must be MAJOR.MINOR.PATCH, e.g. "1.0.0"');
  if (!pack.title) rep.error('pack.json', 'missing title');
  if (checkBranding(pack.branding, rep)) formats.pack = CURRENT.pack;
  if (pack.cover) C.image(path.join(dir, pack.cover), 'cover');
  if (pack.publisherLogo) C.image(path.join(dir, pack.publisherLogo), 'publisherLogo');
  if (pack.publisherUrl) C.url(pack.publisherUrl, 'publisherUrl');
  if (pack.contact != null) {
    if (!pack.contact || typeof pack.contact !== 'object' || Array.isArray(pack.contact)) rep.error('contact', 'must be an object with optional name, email, url and instructions');
    else {
      if (pack.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pack.contact.email)) rep.error('contact.email', 'must be an email address');
      if (pack.contact.url) C.url(pack.contact.url, 'contact.url');
      if (!pack.contact.name && !pack.contact.email && !pack.contact.url && !pack.contact.instructions) rep.warn('contact', 'has no contact information');
    }
  }
  if (pack.certificate != null && (typeof pack.certificate !== 'object' || Array.isArray(pack.certificate))) rep.error('certificate', 'must be a certificate configuration object');
  const items = pack.items || [], ids = new Set(), info = {};
  if (!items.length) rep.error('pack.json', 'no items');
  for (const it of items) {
    const w = `${it.type} "${it.id}"`;
    if (!ID.test(it.id || '')) rep.error(w, 'id must be lowercase letters, digits, - . _');
    if (ids.has(it.id)) rep.error(w, 'duplicate id'); ids.add(it.id);
    if (!TYPES.includes(it.type)) { rep.error(w, `unknown type (${TYPES.join(' | ')})`); continue; }
    formats[it.type] = Math.max(formats[it.type] || 0, CURRENT[it.type]);
    if (it.type === 'training') { const r = C.training(path.join(dir, it.path || ''), w); if (r) info[it.id] = r; }
    if (it.type === 'project') { const r = C.project(path.join(dir, it.path || ''), w); if (r) info[it.id] = r; }
    if (it.plannedWeeks != null && !(Number.isInteger(+it.plannedWeeks) && +it.plannedWeeks >= 0 && +it.plannedWeeks <= 104)) rep.error(w, 'plannedWeeks must be a whole number 0–104');
    if (it.type === 'lab') { const r = C.lab(path.join(dir, it.path || ''), w); if (r) { info[it.id] = r; formats.lab = Math.max(formats.lab, r.format); } }
    if (it.type === 'reading') {
      if (MD_EXT.test(it.file || '')) { const r = C.markdown(path.join(dir, it.file), w); if (r) { info[it.id] = r; formats.reading = Math.max(formats.reading, 2); } }
      else C.pdf(path.join(dir, it.file || ''), w);
    }
    if (it.type === 'video') { if (it.file) C.video(path.join(dir, it.file), w); else if (it.url) C.url(it.url, w); else rep.error(w, 'needs "file" or "url"'); if (it.poster) C.image(path.join(dir, it.poster), w + ' poster'); }
    if (it.type === 'material') { if (it.file) C.material(path.join(dir, it.file), w); else if (it.url) C.url(it.url, w); else rep.error(w, 'needs "file" or "url"'); }
  }
  for (const m of pack.modules || []) {
    if (!m.id || !m.title) rep.error('modules', 'every module needs id and title');
    for (const ref of m.items || []) if (!ids.has(ref)) rep.error(`module "${m.id}"`, `unknown item "${ref}"`);
  }
  checkAttachments(items, rep);
  checkPrerequisites(items, pack.schedule, rep);
  checkSchedule(pack.schedule, ids, rep, new Set(items.filter(i => i.type !== 'project' && !i.for && !i.prerequisite).map(i => i.id)));
  return { errors, warnings, formats, pack, info };
}

/* "for": an item (usually a material) that belongs to another item (a lab, training or project) —
   the app shows it under that item instead of as a separate row (app ≥ 1.5.0; older apps list it normally) */
function checkAttachments(items, rep) {
  const byId = {}; items.forEach(i => { byId[i.id] = i; });
  for (const it of items) {
    if (it.for == null) continue;
    const w = `${it.type} "${it.id}"`;
    const p = byId[it.for];
    if (!p) rep.error(w, `"for": unknown item "${it.for}"`);
    else if (p.for) rep.error(w, `"for": "${it.for}" is itself attached to another item`);
    else if (p.id === it.id) rep.error(w, '"for" points to itself');
    else if (!['lab', 'training', 'project', 'reading'].includes(p.type)) rep.warn(w, `"for" points to a ${p.type} — usually materials belong to a lab, training or project`);
  }
}
/* "prerequisite": true — an optional refresher shown before the course (app ≥ 1.6.0). It is not counted in
   progress, "in progress" status or the package certificate, and is not part of the study plan. */
function checkPrerequisites(items, schedule, rep) {
  const pre = new Set();
  for (const it of items) {
    if (it.prerequisite == null) continue;
    const w = `${it.type} "${it.id}"`;
    if (typeof it.prerequisite !== 'boolean') rep.error(w, '"prerequisite" must be true or false');
    if (it.prerequisite && it.for) rep.error(w, 'a prerequisite cannot also be attached to another item ("for")');
    if (it.prerequisite && it.type === 'project') rep.warn(w, 'a project as prerequisite is unusual — prerequisites are short refreshers');
    if (it.prerequisite) pre.add(it.id);
  }
  if (pre.size && items.every(it => pre.has(it.id) || it.for)) rep.error('items', 'every item is a prerequisite — a package needs at least one counted item');
  ((schedule || {}).entries || []).forEach((e, i) => (e.items || []).forEach(id => {
    if (pre.has(id)) rep.warn(`schedule.entries[${i}]`, `"${id}" is a prerequisite — prerequisites are not planned or counted; remove it from the schedule`);
  }));
}
const PROJECT_CATEGORIES = ['research', 'diploma', 'thesis', 'course-project', 'capstone', 'internship', 'other'];

/* Package study plan: { "weeks": 6, "entries": [ { "week": 1 | "weeks": [2, 3], "title", "note", "items": [ids] } ] } */
function checkSchedule(s, ids, rep, planned) {
  if (!s) return;
  const w = 'schedule';
  if (typeof s !== 'object' || !Array.isArray(s.entries)) return rep.error(w, 'must be { "weeks": N, "entries": [ … ] }');
  if (s.weeks != null && !(+s.weeks >= 1 && +s.weeks <= 104)) rep.error(w, 'weeks must be 1–104');
  const used = new Set();
  s.entries.forEach((e, i) => {
    const v = e.weeks != null ? e.weeks : e.week; const span = Array.isArray(v) ? v.map(Number) : String(v).split(/[-–]/).map(Number);
    if (!(span[0] >= 1) || (span[1] != null && span[1] < span[0])) rep.error(`${w}.entries[${i}]`, 'needs "week": N or "weeks": [from, to]');
    if (s.weeks && (span[1] || span[0]) > s.weeks) rep.error(`${w}.entries[${i}]`, `goes beyond week ${s.weeks}`);
    if (!(e.items || []).length && !e.title) rep.warn(`${w}.entries[${i}]`, 'no items and no title');
    (e.items || []).forEach(id => { if (!ids.has(id)) rep.error(`${w}.entries[${i}]`, `unknown item "${id}"`); used.add(id); });
  });
  (planned || ids).forEach(id => { if (!used.has(id)) rep.warn(w, `item "${id}" is not in the schedule (it has no date)`); });
}

/* Files that go into the pack (content only; engine files of trainings are left out). */
function collectFiles(dir, pack) {
  const out = {};
  const add = (rel) => { out['content/' + rel] = fs.readFileSync(path.join(dir, rel)); };
  const addDir = (rel, skip) => {
    const walk = (r) => {
      for (const e of fs.readdirSync(path.join(dir, r), { withFileTypes: true })) {
        const p = r + '/' + e.name;
        if (e.name.startsWith('.') || (skip && skip(p))) continue;
        if (e.isDirectory()) walk(p); else add(p);
      }
    };
    walk(rel);
  };
  if (pack.cover) add(pack.cover);
  if (pack.publisherLogo) add(pack.publisherLogo);
  for (const it of pack.items) {
    if (it.type === 'training') addDir(it.path, (p) => /^(js|tools|examples|dist|reference)(\/|$)|^css\/(app|certificate)\.css$|^(index\.html|README\.md|SKILL\.md|INTEGRATION\.md)$/.test(p.slice(it.path.length + 1)));
    else if (it.type === 'lab' || it.type === 'project') addDir(it.path);
    else {
      if (it.file) add(it.file);
      if (it.poster) add(it.poster);
      for (const a of it.assets || []) add(path.posix.join(path.posix.dirname(it.file), a));
    }
  }
  return out;
}

module.exports = { checkers, validatePack, collectFiles, checkBranding, checkSchedule, checkAttachments, checkPrerequisites, PROJECT_CATEGORIES, materialKind, TYPES, ID, PACK_ID, SEMVER, MD_EXT };
