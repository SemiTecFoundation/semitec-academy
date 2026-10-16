#!/usr/bin/env node
/* stlp — build SemiTec Learning Packages (.stlp) for SemiTec Academy from trainings, labs, readings,
   videos and other materials.
   Shares the container code with the app (../app/src/shared), so a pack built here is exactly
   what the app verifies. Run `npm install` once in ../app first.

   RECOMMENDED — one JSON file lists all materials (docs/PACK-SPEC.md):
   node packer/stlp.js check        <pack-spec.json> [--target-app 1.1.0]
   node packer/stlp.js create       <pack-spec.json> [--key key.pem | --unsigned] [--out dist/] [--keep build/]

   Step by step, in a pack folder:
   node packer/stlp.js init         <packDir> --id org.semitec.my-course --title "My course"
   node packer/stlp.js add-training <packDir> <trainingFolder> [--id x] [--module m] [--title t]
   node packer/stlp.js add-reading  <packDir> <file.pdf>       [--id x] [--module m] [--title t]
   node packer/stlp.js add-lab      <packDir> [--from labFolder] [--id x] [--module m] [--title t]
   node packer/stlp.js validate     <packDir> [--target-app 1.0.0]
   node packer/stlp.js build        <packDir> [--key key.pem] [--out dist/] [--target-app 1.0.0] [--unsigned]
   node packer/stlp.js inspect      <file.stlp> [--trusted <dir with *.pub.pem>]
   node packer/stlp.js catalog      <folder with .stlp> [--name "…"] [--base-url https://…/] [--out catalog.json]
   node packer/stlp.js keygen       <outDir> --name "SemiTec Foundation" [--dev]
   node packer/stlp.js bundle-skill <outDir>      (self-contained copy for the academy-templates:package skill)  */
'use strict';
const fs = require('fs');
const path = require('path');
/* shared code: ./lib (bundled copy, e.g. in the academy-templates:package skill) or ../app/src/shared (repository) */
const shared = fs.existsSync(path.join(__dirname, 'lib', 'packfmt.js')) ? path.join(__dirname, 'lib') : path.join(__dirname, '..', 'app', 'src', 'shared');
const { buildPack, readPack, generateKeyPair, keyId, loadTrustedKeys } = require(path.join(shared, 'packfmt'));
const { validatePack, collectFiles } = require(path.join(shared, 'validate'));
const { checkSpec, assemble } = require(path.join(shared, 'spec'));
const V = require(path.join(shared, 'versions'));

/* ---------------- args ---------------- */
const argv = process.argv.slice(2);
const cmd = argv[0];
const pos = [], opt = {};
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; opt[k] = v; }
  else pos.push(argv[i]);
}
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const ok = (m) => console.log('✓ ' + m);
const slug = (s) => String(s).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
function copyDir(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.') || (skip && skip(e.name, e.isDirectory()))) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
function loadPack(dir) { const p = path.join(dir, 'pack.json'); if (!fs.existsSync(p)) die('no pack.json in ' + dir + ' (run init first)'); return readJSON(p); }
function addItem(dir, pack, item) {
  if (pack.items.some(i => i.id === item.id)) die(`item id "${item.id}" already exists`);
  pack.items.push(item);
  const mid = opt.module || (pack.modules[0] && pack.modules[0].id) || 'module-1';
  let mod = pack.modules.find(m => m.id === mid);
  if (!mod) { mod = { id: mid, title: opt['module-title'] || mid.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), items: [] }; pack.modules.push(mod); }
  mod.items.push(item.id);
  writeJSON(path.join(dir, 'pack.json'), pack);
  ok(`added ${item.type} "${item.id}" to module "${mod.id}"`);
}
function report(r) {
  r.warnings.forEach(w => console.log('  ⚠ ' + w));
  r.errors.forEach(e => console.log('  ✗ ' + e));
}
function checkTarget(formats) {
  const min = V.minAppFor(formats);
  if (!min) die('no app version supports this combination of formats: ' + JSON.stringify(formats));
  const target = opt['target-app'] === true ? V.APP_VERSION : (opt['target-app'] || V.APP_VERSION);
  const caps = V.capabilities(target);
  if (!caps) die('unknown target app version ' + target + ' (known: ' + V.HISTORY.map(h => h.app).join(', ') + ')');
  for (const [k, v] of Object.entries(formats)) if (!(caps[k] || []).includes(v)) die(`target app ${target} cannot open ${k} format ${v}`);
  return { min, target };
}

/* ---------------- commands ---------------- */
const C = {};
C.init = () => {
  const dir = pos[0] || die('usage: init <packDir> --id org.semitec.name --title "Title"');
  if (fs.existsSync(path.join(dir, 'pack.json'))) die('pack.json already exists in ' + dir);
  fs.mkdirSync(dir, { recursive: true });
  ['trainings', 'readings', 'labs'].forEach(d => fs.mkdirSync(path.join(dir, d), { recursive: true }));
  writeJSON(path.join(dir, 'pack.json'), {
    id: opt.id || 'org.semitec.' + slug(path.basename(path.resolve(dir))),
    version: '1.0.0',
    title: opt.title || path.basename(path.resolve(dir)),
    description: 'Describe the course pack in one or two sentences.',
    language: opt.language || 'en',
    publisher: opt.publisher || 'Your organization',
    authors: [],
    cover: null,
    modules: [{ id: 'module-1', title: 'Module 1', description: '', items: [] }],
    items: []
  });
  ok('created ' + path.join(dir, 'pack.json') + ' — now add items with add-training / add-reading / add-lab');
};
C['add-training'] = () => {
  const [dir, src] = pos; if (!dir || !src) die('usage: add-training <packDir> <trainingFolder>');
  const pack = loadPack(dir);
  if (!fs.existsSync(path.join(src, 'training.json'))) die(src + ' is not a training (no training.json)');
  const tr = readJSON(path.join(src, 'training.json'));
  const id = opt.id || slug(tr.id || path.basename(src));
  const rel = 'trainings/' + id;
  /* copy CONTENT only — the app brings its own engine (js/, css/app.css, index.html) */
  copyDir(src, path.join(dir, rel), (name, isDir) => (isDir && ['js', 'tools', 'examples', 'dist', 'reference', 'node_modules'].includes(name)) || ['index.html', 'README.md', 'SKILL.md', 'INTEGRATION.md'].includes(name));
  for (const f of ['css/app.css', 'css/certificate.css']) fs.rmSync(path.join(dir, rel, f), { force: true });
  addItem(dir, pack, { id, type: 'training', title: opt.title || tr.title, description: opt.description || tr.subtitle || '', estimatedTime: opt.time || (tr.hours ? tr.hours + ' h' : ''), path: rel });
};
C['add-reading'] = () => {
  const [dir, src] = pos; if (!dir || !src) die('usage: add-reading <packDir> <file.pdf>');
  if (!/\.pdf$/i.test(src)) die('add-reading takes PDFs; for Markdown readings (with images) use a pack spec: stlp create pack-spec.json');
  const pack = loadPack(dir);
  const id = opt.id || slug(path.basename(src));
  const rel = 'readings/' + id + '.pdf';
  fs.mkdirSync(path.join(dir, 'readings'), { recursive: true });
  fs.copyFileSync(src, path.join(dir, rel));
  addItem(dir, pack, { id, type: 'reading', title: opt.title || path.basename(src, '.pdf').replace(/[-_]/g, ' '), description: opt.description || '', estimatedTime: opt.time || '', file: rel });
};
C['add-lab'] = () => {
  const dir = pos[0] || die('usage: add-lab <packDir> [--from labFolder] [--manual file.pdf]');
  const pack = loadPack(dir);
  let lab;
  const id = opt.id || slug(opt.title || (opt.from ? path.basename(opt.from) : 'lab-' + (pack.items.filter(i => i.type === 'lab').length + 1)));
  const rel = 'labs/' + id;
  if (opt.from) { copyDir(opt.from, path.join(dir, rel)); lab = readJSON(path.join(dir, rel, 'lab.json')); }
  else {
    fs.mkdirSync(path.join(dir, rel), { recursive: true });
    lab = {
      title: opt.title || 'New lab', summary: 'What the student builds in this lab.', difficulty: 'beginner', estimatedTime: '2 h',
      equipment: ['Development board'], objectives: ['First objective'], manual: opt.manual ? 'manual.pdf' : null,
      steps: [{ id: 'setup', title: 'Set up the project', md: 'Explain the step. **Markdown** works.', hint: 'Optional hint.' }],
      quiz: { passThreshold: 0.8, questions: [{ id: 'q1', type: 'single', text: 'Question?', options: ['A', 'B'], correct: [0], review: ['setup'] }] }
    };
    if (opt.manual) fs.copyFileSync(opt.manual, path.join(dir, rel, 'manual.pdf'));
    writeJSON(path.join(dir, rel, 'lab.json'), lab);
    ok('created ' + rel + '/lab.json — edit the steps and quiz');
  }
  addItem(dir, pack, { id, type: 'lab', title: opt.title || lab.title, description: opt.description || '', estimatedTime: lab.estimatedTime || '', path: rel });
};
C.validate = () => {
  const dir = pos[0] || die('usage: validate <packDir>');
  const r = validatePack(dir);
  report(r);
  if (r.errors.length) die(`${r.errors.length} error(s)`);
  const t = checkTarget(r.formats);
  ok(`valid — ${r.pack.items.length} items · formats ${JSON.stringify(r.formats)} · opens in app ≥ ${t.min}`);
};
C.build = () => buildDir(pos[0] || die('usage: build <packDir> [--key key.pem] [--out dist]'));
function buildDir(dir, defaultOut, quiet) {
  const r = validatePack(dir);
  if (quiet) r.errors.forEach(e => console.log('  ✗ ' + e)); else report(r);
  if (r.errors.length) die(`not built: ${r.errors.length} error(s)`);
  const t = checkTarget(r.formats);
  const pack = r.pack;
  const titleOf = (it) => it.title || (it.type === 'training' ? readJSON(path.join(dir, it.path, 'training.json')).title : it.type === 'lab' ? readJSON(path.join(dir, it.path, 'lab.json')).title : it.type === 'project' ? readJSON(path.join(dir, it.path, 'project.json')).title : path.basename(it.file || it.url || it.id));
  const manifest = {
    format: r.formats.pack,
    id: pack.id, version: pack.version, title: pack.title, description: pack.description || '', language: pack.language || 'en',
    publisher: pack.publisher || '', authors: pack.authors || [], cover: pack.cover || null,
    ...(pack.publisherLogo ? { publisherLogo: pack.publisherLogo } : {}), ...(pack.publisherUrl ? { publisherUrl: pack.publisherUrl } : {}),
    ...(pack.contact ? { contact: pack.contact } : {}),
    ...(pack.branding ? { branding: pack.branding } : {}),
    created: new Date().toISOString(),
    minAppVersion: t.min,
    builder: { tool: 'stlp', toolVersion: V.APP_VERSION, targetApp: t.target },
    modules: (pack.modules || []).map(m => ({ id: m.id, title: m.title, description: m.description || '', items: m.items || [] })),
    ...(pack.schedule ? { schedule: pack.schedule } : {}),
    ...(pack.certificate ? { certificate: pack.certificate } : {}),
    items: pack.items.map(it => Object.assign({ id: it.id, type: it.type, format: (r.info[it.id] && r.info[it.id].format) || V.CURRENT[it.type], title: titleOf(it), description: it.description || '', estimatedTime: it.estimatedTime || '' },
      r.info[it.id] && r.info[it.id].srcFiles && r.info[it.id].srcFiles.length ? { srcFiles: r.info[it.id].srcFiles } : {},
      r.info[it.id] && r.info[it.id].schedule ? { schedule: r.info[it.id].schedule } : {},
      it.type === 'project' && r.info[it.id] ? { durationWeeks: r.info[it.id].durationWeeks, summary: r.info[it.id].summary } : {},
      it.type === 'training' && r.info[it.id] && r.info[it.id].entry ? { entry: r.info[it.id].entry } : {},
      it.plannedWeeks != null ? { plannedWeeks: it.plannedWeeks } : {},
      it.for ? { for: it.for } : {},
      it.prerequisite ? { prerequisite: true } : {},
      it.type === 'project' && it.category ? { category: it.category } : {},
      ...['path', 'file', 'url', 'poster', 'kind', 'assets'].filter(k => it[k] && (!Array.isArray(it[k]) || it[k].length)).map(k => ({ [k]: it[k] }))))
  };
  const files = collectFiles(dir, pack);
  let key = null;
  if (!opt.unsigned) {
    const kp = opt.key || process.env.STLP_KEY;
    if (!kp) die('no signing key: pass --key <private.pem> (or set STLP_KEY), or --unsigned for a test pack');
    key = fs.readFileSync(kp, 'utf8');
  }
  const { bytes } = buildPack({ manifest, files, privateKeyPem: key });
  const outDir = opt.out || defaultOut || path.join(dir, '..', '..', 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${pack.id}-${pack.version}.stlp`);
  fs.writeFileSync(out, bytes);
  const raw = Object.values(files).reduce((a, b) => a + b.length, 0);
  ok(`built ${out}\n  ${pack.items.length} items, ${Object.keys(files).length} files, ${(raw / 1048576).toFixed(2)} MB → ${(bytes.length / 1048576).toFixed(2)} MB · ${key ? 'signed (key ' + keyId(require('crypto').createPublicKey(key).export({ type: 'spki', format: 'pem' })) + ')' : 'UNSIGNED'} · app ≥ ${t.min}`);
  return out;
}

C.inspect = () => {
  const f = pos[0] || die('usage: inspect <file.stlp>');
  const trusted = loadTrustedKeys(opt.trusted || defaultTrustedDir());
  const p = readPack(fs.readFileSync(f), trusted);
  const m = p.manifest;
  console.log(`${m.title}  (${m.id} v${m.version})`);
  console.log(`  publisher: ${m.publisher}   created: ${m.created}   needs app ≥ ${m.minAppVersion}   built for ${m.builder && m.builder.targetApp}`);
  console.log(`  signature: ${p.signature.status}${p.signature.keyName ? ' — ' + p.signature.keyName : ''}${p.signature.keyId ? ' [' + p.signature.keyId + ']' : ''}`);
  console.log(`  files: ${Object.keys(m.files).length} (all hashes OK)`);
  for (const mod of m.modules) {
    console.log(`  ▸ ${mod.title}`);
    for (const id of mod.items) { const it = m.items.find(i => i.id === id); console.log(`      ${it.type.padEnd(8)} ${it.id.padEnd(28)} ${it.title}`); }
  }
  const s = V.supports(m);
  console.log(s.ok ? `  ✓ opens in this app version (${V.APP_VERSION})` : '  ✗ not for this app version: ' + s.reasons.join('; '));
};
/* ---------------- pack spec: check + create ---------------- */
function printCheck(r, specPath) {
  const icon = (row) => row.errors.length ? '✗' : row.warnings.length ? '⚠' : '✓';
  const pad = (x, n) => { x = String(x == null ? '' : x); return (x.length > n - 1 ? x.slice(0, n - 2) + '…' : x).padEnd(n); };
  console.log(`\nChecking ${specPath}\n`);
  console.log('    ' + pad('TYPE', 9) + pad('ID', 26) + pad('TITLE', 44) + 'INFO');
  for (const row of r.rows) {
    console.log(`  ${icon(row)} ${pad(row.type, 9)}${pad(row.id, 26)}${pad(row.title, 44)}${row.info || ''}`);
    row.errors.forEach(m => console.log('        ✗ ' + m));
    row.warnings.forEach(m => console.log('        ⚠ ' + m));
  }
  const counts = {}; r.items.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
  console.log(`\n  materials: ${Object.entries(counts).map(([k, v]) => v + ' ' + k + (v > 1 ? 's' : '')).join(', ') || 'none'}` +
    `   size ≈ ${(r.totalSize / 1048576).toFixed(1)} MB   opens in app ≥ ${r.minApp || '?'}`);
  if (r.spec) {
    const S = require(path.join(shared, 'schedule'));
    const tpl = S.template({ schedule: r.spec.schedule, modules: r.spec.modules || [], items: r.items.map(i => ({ id: i.id, title: i.title, plannedWeeks: i.plannedWeeks, prerequisite: i.prerequisite, for: i.for, schedule: i._info && i._info.schedule })) });
    console.log('  study plan: ' + (tpl.source === 'package' ? `${tpl.weeks} week${tpl.weeks === 1 ? '' : 's'} from the pack schedule (${tpl.entries.length} entries)`
      : tpl.source === 'items' ? `${tpl.weeks} week${tpl.weeks === 1 ? '' : 's'} from plannedWeeks of the items` : 'none — self-paced (students may set a finish date)'));
  }
}
C.check = () => {
  const spec = pos[0] || die('usage: check <pack-spec.json>');
  if (!fs.existsSync(spec)) die('spec not found: ' + spec);
  const r = checkSpec(spec);
  printCheck(r, spec);
  if (!r.errors.length && opt['target-app']) checkTarget(r.formats);
  if (r.errors.length) die(`${r.errors.length} error(s), ${r.warnings.length} warning(s) — fix the errors before creating the pack`);
  ok(`ready to create — 0 errors, ${r.warnings.length} warning(s)`);
  return r;
};
C.create = () => {
  const spec = pos[0] || die('usage: create <pack-spec.json> [--key key.pem | --unsigned]');
  const r = C.check();
  const work = opt.keep ? path.resolve(opt.keep === true ? path.join(path.dirname(spec), '.build') : opt.keep) : fs.mkdtempSync(path.join(require('os').tmpdir(), 'stlp-'));
  console.log('\nAssembling pack folder in ' + work);
  assemble(spec, work, r);
  const out = buildDir(work, path.join(path.dirname(path.resolve(spec)), 'dist'), true);
  if (!opt.keep) fs.rmSync(work, { recursive: true, force: true });
  console.log('\nNext: node ' + path.relative(process.cwd(), __filename) + ' inspect ' + path.relative(process.cwd(), out));
};
/* catalog.json for publishing packages on a website (SemiTec Academy → Catalog → add the link).
   stlp catalog <folder with .stlp files> [--name "SemiTec Foundation"] [--base-url https://…/packages/] [--out <folder>/catalog.json]
   URLs are relative to catalog.json unless --base-url is given; covers / logos go to catalog-assets/. */
C.catalog = () => {
  const dir = path.resolve(pos[0] || die('usage: catalog <folder with .stlp files> [--name …] [--base-url …] [--out catalog.json]'));
  const { peekPack } = require(path.join(shared, 'packfmt'));
  const trusted = loadTrustedKeys(opt.trusted || defaultTrustedDir());
  const files = fs.readdirSync(dir).filter(f => /\.stlp$/i.test(f)).sort();
  if (!files.length) die('no .stlp files in ' + dir);
  const assets = path.join(dir, 'catalog-assets'); fs.mkdirSync(assets, { recursive: true });
  const base = opt['base-url'] ? String(opt['base-url']).replace(/\/?$/, '/') : '';
  const best = {};
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f));
    const pk = peekPack(bytes, trusted), m = pk.manifest;
    const e = { id: m.id, version: m.version, title: m.title, description: m.description || '', language: m.language || '', publisher: m.publisher || '',
      authors: m.authors || [], minAppVersion: m.minAppVersion, format: m.format, items: (m.items || []).map(i => ({ type: i.type, format: i.format })),
      counts: (m.items || []).reduce((a, i) => (a[i.type] = (a[i.type] || 0) + 1, a), {}), itemTitles: (m.items || []).map(i => i.title),
      projectCategories: [...new Set((m.items || []).filter(i => i.type === 'project').map(i => i.category || 'other'))],
      hasSchedule: !!(m.schedule && (m.schedule.entries || []).length), created: m.created, signed: pk.signature.status !== 'unsigned', signedBy: pk.signature.keyName || pk.signature.keyId || '',
      url: base + encodeURIComponent(f), size: bytes.length, sha256: require('crypto').createHash('sha256').update(bytes).digest('hex') };
    for (const [k, img] of Object.entries(pk.images)) {
      const name = `${m.id}-${k}${path.extname(img.name)}`; fs.writeFileSync(path.join(assets, name), img.data);
      e[k === 'cover' ? 'cover' : 'publisherLogo'] = base + 'catalog-assets/' + name;
    }
    if (!best[m.id] || V.cmp(m.version, best[m.id].version) > 0) best[m.id] = e;
  }
  const out = opt.out || path.join(dir, 'catalog.json');
  const cat = { format: 1, name: opt.name || 'SemiTec Learning Packages', updated: new Date().toISOString(), packages: Object.values(best) };
  fs.writeFileSync(out, JSON.stringify(cat, null, 2) + '\n');
  ok(`catalog with ${cat.packages.length} package(s) → ${out}\n  publish the folder (catalog.json, the .stlp files and catalog-assets/) on a website;\n  students add the link of catalog.json in SemiTec Academy → Settings → Application → Catalog sources`);
};
/* self-contained copy (packer + shared code + fflate) for the academy-templates:package skill */
C['bundle-skill'] = () => {
  const outDir = path.resolve(pos[0] || die('usage: bundle-skill <outDir>'));
  const lib = path.join(outDir, 'lib');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(lib, { recursive: true });
  fs.copyFileSync(__filename, path.join(outDir, 'stlp.js'));
  for (const f of ['packfmt.js', 'validate.js', 'spec.js', 'versions.js', 'schedule.js']) fs.copyFileSync(path.join(shared, f), path.join(lib, f));
  fs.writeFileSync(path.join(lib, 'app-version.json'), JSON.stringify({ version: V.APP_VERSION }, null, 2));
  const caps = V.capabilities(V.APP_VERSION);
  fs.writeFileSync(path.join(outDir, 'VERSION.json'), JSON.stringify({
    skill: 'academy-templates:package', release: V.APP_VERSION, builtFrom: 'SemiTec Academy ' + V.APP_VERSION, builtAt: new Date().toISOString(),
    extension: '.stlp', writes: V.CURRENT, appCanOpen: Object.fromEntries(Object.entries(caps).filter(([k]) => !['app', 'notes'].includes(k))),
    history: V.HISTORY.map(h => ({ app: h.app, notes: h.notes }))
  }, null, 2) + '\n');
  const ff = path.dirname(require.resolve('fflate/package.json', { paths: [shared] }));
  const ffOut = path.join(outDir, 'node_modules', 'fflate');            // only what Node's require() needs
  fs.mkdirSync(path.join(ffOut, 'lib'), { recursive: true });
  for (const f of ['package.json', 'LICENSE', 'lib/node.cjs', 'lib/node-worker.cjs', 'lib/index.cjs', 'lib/worker.cjs']) if (fs.existsSync(path.join(ff, f))) fs.copyFileSync(path.join(ff, f), path.join(ffOut, f));
  const tkSrc = path.join(__dirname, '..', 'app', 'trusted-keys');   // public halves only
  const tkOut = path.join(outDir, 'trusted-keys');
  fs.mkdirSync(tkOut, { recursive: true });
  for (const f of fs.readdirSync(tkSrc)) if (/\.(pub\.pem|json)$/.test(f)) fs.copyFileSync(path.join(tkSrc, f), path.join(tkOut, f));
  fs.writeFileSync(path.join(outDir, 'README.md'), `# stlp (bundled)\n\nSelf-contained copy of the SemiTec Academy package builder, generated by\n\`node packer/stlp.js bundle-skill\` from SemiTec Academy ${V.APP_VERSION} (see VERSION.json). Needs Node.js 18+, nothing to install.\n\n    node stlp.js check  pack-spec.json\n    node stlp.js create pack-spec.json --key <private.pem>   (or --unsigned)\n\nDo not edit — regenerate from the Academy repository (https://github.com/SemiTecFoundation/semitec-academy) when the app changes.\n`);
  ok('bundled packer for app ' + V.APP_VERSION + ' → ' + outDir);
};
/* trusted keys: the bundled skill copy ships them next to itself; in this repo they live with the app */
function defaultTrustedDir() {
  const here = path.join(__dirname, 'trusted-keys');
  return fs.existsSync(here) ? here : path.join(__dirname, '..', 'app', 'trusted-keys');
}

C.keygen = () => {
  const dir = pos[0] || die('usage: keygen <outDir> --name "SemiTec Foundation" [--dev]');
  const name = opt.name || 'SemiTec Foundation';
  const base = slug(name) + (opt.dev ? '-dev' : '');
  fs.mkdirSync(dir, { recursive: true });
  const kp = generateKeyPair();
  const priv = path.join(dir, base + '.key.pem');
  if (fs.existsSync(priv)) die(priv + ' already exists — not overwriting a key');
  fs.writeFileSync(priv, kp.privateKey, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, base + '.pub.pem'), kp.publicKey);
  writeJSON(path.join(dir, base + '.json'), { name: name + (opt.dev ? ' (development key)' : ''), development: !!opt.dev, keyId: keyId(kp.publicKey), created: new Date().toISOString() });
  ok(`key ${keyId(kp.publicKey)} written to ${dir}\n  PRIVATE: ${priv}  ← keep secret, never commit, never ship\n  public:  ${base}.pub.pem + ${base}.json → copy both to app/trusted-keys/ and release a new app version`);
};

if (!C[cmd]) {
  const src = fs.readFileSync(__filename, 'utf8'); console.log(src.slice(src.indexOf('/*') + 2, src.indexOf('*/')).split('\n').map(l => l.replace(/^   /, '')).join('\n'));
  process.exit(cmd ? 1 : 0);
}
C[cmd]();
