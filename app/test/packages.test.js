/* Package boundary regressions. All archives, keys and database contents are disposable test data. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { unzipSync, zipSync } = require('fflate');
const { buildPack, readPack, peekPack, passwordAccess } = require('../src/shared/packfmt');
const { standaloneTraining, copyItemFolder, copyItem, copyPack } = require('../src/main/export');
const makeLibrary = require('../src/main/library');
const makeCatalog = require('../src/main/catalog');
const makeMine = require('../src/main/mine');
const makePlanner = require('../src/main/planner');
const { checkSpec, assemble } = require('../src/shared/spec');
const { validatePack, collectFiles } = require('../src/shared/validate');
const { supports } = require('../src/shared/versions');
const { DB } = require('../src/main/db');

const manifest = { format: 1, id: 'org.example.test-pack', version: '1.0.0', title: 'Test fixture', items: [{ id: 'notes', type: 'material', format: 1, title: 'Notes', file: 'test.txt' }], modules: [{ id: 'start', title: 'Start', items: ['notes'] }], schedule: { weeks: 1, entries: [{ week: 1, items: ['notes'] }] } };
const files = { 'content/test.txt': Buffer.from('Test data only') };
const invalidIds = ['../victim', '../../outside', '.', '..', '/absolute', '..\\victim', 'C:\\victim',
  'C:victim', 'org.example/child', 'org.example\\child', 'org.example..test', 'org.example.test\n',
  ' org.example.test', '', '__proto__', null, 123, ['org.example.test'], { id: 'org.example.test' }];

/* Construct hostile input independently of the builder's ID validation. */
function hostilePack(id, signed) {
  const entries = unzipSync(buildPack({ manifest, files }).bytes);
  const m = JSON.parse(Buffer.from(entries['manifest.json']).toString());
  m.id = id;
  entries['manifest.json'] = Buffer.from(JSON.stringify(m));
  if (signed) entries['signature.json'] = Buffer.from('{}');
  return Buffer.from(zipSync(entries));
}

async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-package-test-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const db = await DB.open(dataDir);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const lib = makeLibrary({ db, dataDir });
  const victim = path.join(dataDir, 'victim');
  fs.mkdirSync(victim);
  fs.writeFileSync(path.join(victim, 'keep.txt'), 'Unrelated data');
  function write(pack, name = 'test.stlp') {
    const file = path.join(root, name);
    fs.writeFileSync(file, pack.bytes || pack);
    return file;
  }
  return { root, dataDir, db, lib, victim, write };
}

function addTestPlan(file) {
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = ['trainings','labs','projects','readings','videos','materials'].flatMap(k => (spec[k] || []).filter(i => !i.for && !i.prerequisite).map(i => i.id));
  spec.modules = [{ id: 'start', title: 'Start', items: ids }];
  spec.schedule = { weeks: 1, entries: [{ week: 1, items: ids }] };
  fs.writeFileSync(file, JSON.stringify(spec));
}

test('builder, reader and catalog reject malformed package ids', () => {
  for (const id of invalidIds) {
    const label = JSON.stringify(id);
    assert.throws(() => buildPack({ manifest: { ...manifest, id }, files }), /Invalid package id/, label);
    for (const signed of [false, true]) {
      const bytes = hostilePack(id, signed);
      assert.throws(() => readPack(bytes), /Invalid package id/, label);
      assert.throws(() => peekPack(bytes), /Invalid package id/, label);
    }
  }
});

test('unsafe imports preserve unrelated files and the database, including legacy archives', async t => {
  const { lib, db, victim, write } = await setup(t);
  const before = Buffer.from(db.sql.export());
  for (const id of [...invalidIds, victim]) {
    for (const signed of [false, true]) {
      const file = write(hostilePack(id, signed));
      for (const devMode of [false, true]) {
        assert.throws(() => lib.importFile(file, { devMode }), /Invalid package id/, JSON.stringify({ id, signed, devMode }));
        assert.equal(fs.readFileSync(path.join(victim, 'keep.txt'), 'utf8'), 'Unrelated data');
        assert.deepEqual(fs.readdirSync(lib.packsDir), [], 'no extraction or staging directory left behind');
        assert.deepEqual(Buffer.from(db.sql.export()), before, 'no database writes');
      }
    }
  }
});

test('unsafe lookup and removal ids cannot delete folders or database records', async t => {
  const { lib, db, victim } = await setup(t);
  db.run('INSERT INTO packs(id, version, title, signature, manifest, installed_at) VALUES(?,?,?,?,?,?)',
    ['../victim', '1.0.0', 'Legacy malformed row', 'unsigned', '{}', new Date().toISOString()]);
  const before = Buffer.from(db.sql.export());
  for (const id of [...invalidIds, victim]) {
    assert.throws(() => lib.packDir(id), /Invalid package id/);
    assert.throws(() => lib.remove(id), /Invalid package id/);
    assert.equal(fs.readFileSync(path.join(victim, 'keep.txt'), 'utf8'), 'Unrelated data');
    assert.deepEqual(Buffer.from(db.sql.export()), before);
  }
});

test('test packages install, upgrade and remove within the packages folder', async t => {
  const { lib, db, victim, write } = await setup(t);
  const first = write(buildPack({ manifest, files }));
  assert.equal(lib.importFile(first, {}).id, manifest.id);
  const installed = path.join(lib.packsDir, manifest.id);
  assert.equal(lib.packDir(manifest.id), installed);
  assert.equal(fs.readFileSync(path.join(installed, 'test.txt'), 'utf8'), 'Test data only');
  assert.equal(db.get('SELECT version FROM packs WHERE id=?', [manifest.id]).version, '1.0.0');
  const second = write(buildPack({ manifest: { ...manifest, version: '1.0.1', items: [{ ...manifest.items[0], file: 'replacement.txt' }] },
    files: { 'content/replacement.txt': Buffer.from('Replacement test data') } }));
  assert.equal(lib.importFile(second, { devMode: false }).updatedFrom, '1.0.0');
  assert.equal(fs.existsSync(path.join(installed, 'test.txt')), false);
  assert.equal(fs.readFileSync(path.join(installed, 'replacement.txt'), 'utf8'), 'Replacement test data');
  assert.equal(db.get('SELECT version FROM packs WHERE id=?', [manifest.id]).version, '1.0.1');
  lib.remove(manifest.id);
  assert.deepEqual(fs.readdirSync(lib.packsDir), []);
  assert.equal(db.get('SELECT id FROM packs WHERE id=?', [manifest.id]), null);
  assert.equal(fs.readFileSync(path.join(victim, 'keep.txt'), 'utf8'), 'Unrelated data');
});

test('removing from My packages requires active project plans to be stopped first', async t => {
  const { lib, db, write } = await setup(t);
  const projectPack = { ...manifest, id: 'org.example.project-removal', items: [{ id: 'capstone', type: 'project', path: 'projects/capstone', format: 1, title: 'Memory BIST capstone' }], modules: [{ id: 'project', title: 'Project', items: ['capstone'] }], schedule: { weeks: 1, entries: [{ week: 1, items: ['capstone'] }] } };
  lib.importFile(write(buildPack({ manifest: projectPack, files: { 'content/projects/capstone/project.json': Buffer.from(JSON.stringify({ format: 1, title: 'Test project', weeks: [{ week: 1, tasks: 'Test' }] })) } })), {});
  const mine = makeMine({ db, lib });
  mine.add(7, projectPack.id);
  db.run('INSERT INTO enrollments(user_id,pack_id,item_id,start_date,plan,enrolled_at) VALUES(?,?,?,?,?,?)', [7, projectPack.id, '', '2026-10-16', '{}', '2026-10-16T09:00:00.000Z']);
  db.run('INSERT INTO enrollments(user_id,pack_id,item_id,start_date,plan,enrolled_at) VALUES(?,?,?,?,?,?)', [7, projectPack.id, 'capstone', '2026-10-16', '{}', '2026-10-16T09:00:00.000Z']);
  db.run('INSERT INTO progress(user_id,pack_id,item_id,item_type,state,percent,completed_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', [7, projectPack.id, 'capstone', 'project', '{"weeks":{"1":"2026-10-16"}}', 10, null, '2026-10-16T09:00:00.000Z']);

  assert.deepEqual(mine.removalInfo(7, projectPack.id), { coursePlan: true, projects: [{ id: 'capstone', title: 'Memory BIST capstone', startDate: '2026-10-16' }] });
  assert.throws(() => mine.remove(7, projectPack.id), /Stop the active course or project plan/);
  mine.remove(7, projectPack.id, { stopPlans: true });
  assert.equal(db.get('SELECT * FROM user_packs WHERE user_id=? AND pack_id=?', [7, projectPack.id]), null);
  assert.equal(db.get('SELECT * FROM enrollments WHERE user_id=? AND pack_id=?', [7, projectPack.id]), null);
  assert.equal(db.get('SELECT * FROM progress WHERE user_id=? AND pack_id=?', [7, projectPack.id]).percent, 10, 'progress is retained unless the user explicitly resets it');
});

test('sign-in cleanup removes only orphaned package selections and plans', async t => {
  const { lib, db } = await setup(t);
  const mine = makeMine({ db, lib });
  const orphan = 'org.example.removed-package';
  db.run('INSERT INTO user_packs(user_id,pack_id,added_at) VALUES(?,?,?)', [5, orphan, '2026-10-16T09:00:00.000Z']);
  db.run('INSERT INTO enrollments(user_id,pack_id,item_id,start_date,plan,enrolled_at) VALUES(?,?,?,?,?,?)', [5, orphan, 'project', '2026-10-16', '{}', '2026-10-16T09:00:00.000Z']);
  db.run('INSERT INTO progress(user_id,pack_id,item_id,item_type,state,percent,completed_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', [5, orphan, 'project', 'project', '{}', 15, null, '2026-10-16T09:00:00.000Z']);
  const cleaned = mine.cleanupOrphans(5);
  assert.deepEqual(cleaned, { userPacks: 1, plans: 1, groups: 0 });
  assert.equal(db.get('SELECT * FROM user_packs WHERE user_id=? AND pack_id=?', [5, orphan]), null);
  assert.equal(db.get('SELECT * FROM enrollments WHERE user_id=? AND pack_id=?', [5, orphan]), null);
  assert.equal(db.get('SELECT * FROM progress WHERE user_id=? AND pack_id=?', [5, orphan]).percent, 15, 'learning record remains available if the package is re-added');
});

test('new and legacy packages install without keys and still reject changed content', async t => {
  const { lib, write } = await setup(t);
  const file = write(buildPack({ manifest, files }));
  assert.equal(lib.importFile(file, {}).id, manifest.id);
  const entries = unzipSync(fs.readFileSync(file));
  assert.equal(entries['signature.json'], undefined);
  entries['signature.json'] = Buffer.from('legacy metadata');
  assert.equal(lib.importFile(write(zipSync(entries)), {}).id, manifest.id);
  entries['content/test.txt'] = Buffer.from('tampered');
  assert.throws(() => lib.importFile(write(zipSync(entries)), {}), /hash mismatch/);
});

test('empty test packages are rejected before installation', async t => {
  const { lib, write } = await setup(t);
  assert.throws(() => lib.importFile(write(buildPack({ manifest: { ...manifest, items: [] }, files: {} })), { devMode: true }), /no items/);
  assert.equal(fs.existsSync(lib.packDir(manifest.id)), false);
});

test('fixture packages contain every declared file', t => {
  const fixtures = require('./fixtures/build').build();
  t.after(() => fs.rmSync(fixtures.dir, { recursive: true, force: true }));
  assert.equal(Object.keys(fixtures.packs).length, 2);
  for (const [id, file] of Object.entries(fixtures.packs)) {
    const bytes = fs.readFileSync(file);
    const pack = readPack(bytes);
    assert.equal(pack.manifest.id, id);
    assert.ok(Object.keys(pack.files).length > 0);
  }
});

test('Foundation catalog is an initial source without overriding existing choices', async t => {
  const { db, lib } = await setup(t);
  const catalog = makeCatalog({ db, lib });
  const initial = catalog.sources();
  assert.equal(initial.length, 1);
  assert.equal(initial[0].url, 'https://semitecfoundation.github.io/semitec-academy-materials/catalog/catalog.json');
  catalog.remove(initial[0].id);
  assert.deepEqual(catalog.sources(), [], 'removing the default stays removed');
  catalog.addUrl('https://example.org/catalog.json', 'Example');
  assert.equal(catalog.sources()[0].name, 'Example');
  assert.equal(makeCatalog({ db, lib }).sources().length, 1, 'existing settings survive restart');
});

test('catalog rejects a download whose identity differs from its listing', async t => {
  const { db, lib } = await setup(t);
  const catalog = makeCatalog({ db, lib });
  const originalFetch = global.fetch;
  const bytes = buildPack({ manifest, files }).bytes;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async url => String(url).endsWith('catalog.json')
    ? { ok: true, json: async () => ({ packages: [{ id: 'org.example.different', version: '1.0.0', url: 'package.stlp' }] }) }
    : { ok: true, arrayBuffer: async () => bytes };
  db.setting('catalogSources', [{ id: 'test', type: 'url', name: 'Test', url: 'https://example.org/catalog.json' }]);
  await catalog.list();
  await assert.rejects(catalog.fetchFile('org.example.different'), /identity or version does not match/);
});

test('a completed package receives a course certificate only when its publisher defines one', () => {
  const base = { format: 1, id: 'org.example.completed', version: '1.0.0', title: 'Completed course', publisher: 'Example publisher', items: [{ id: 'lab', type: 'lab', estimatedTime: '2 h' }] };
  const manifests = { 'org.example.no-certificate': { ...base, id: 'org.example.no-certificate' },
    'org.example.with-certificate': { ...base, id: 'org.example.with-certificate', certificate: { title: 'Publisher course certificate', issuer: 'Example publisher' } } };
  const db = { all(sql, args) {
    if (sql.startsWith('SELECT id FROM packs')) return Object.keys(manifests).map(id => ({ id }));
    if (sql.startsWith('SELECT item_id')) return [{ item_id: 'lab', percent: 100, completed_at: '2026-10-16T10:00:00.000Z', updated_at: '2026-10-16T10:00:00.000Z', item_type: 'lab', state: '{}' }];
    throw new Error('Unexpected query: ' + sql + ' ' + args);
  } };
  const planner = makePlanner({ db, lib: { manifestOf: id => manifests[id] } });
  const certs = planner.certificates(1, 'Student Name').filter(c => c.kind === 'package');
  assert.equal(certs.length, 1);
  assert.equal(certs[0].packId, 'org.example.with-certificate');
  assert.equal(certs[0].config.issuer, 'Example publisher');
});

test('a completed custom web training counts for its package certificate but not a template training certificate', () => {
  const manifest = {
    format: 1, id: 'org.example.web-course', version: '1.0.0', title: 'Web course',
    certificate: { title: 'Web course certificate' },
    items: [{ id: 'logic-playground', type: 'training', format: 2, title: 'Logic playground', estimatedTime: '30 min' }]
  };
  const db = { all(sql) {
    if (sql.startsWith('SELECT id FROM packs')) return [{ id: manifest.id }];
    if (sql.startsWith('SELECT item_id')) return [{ item_id: 'logic-playground', percent: 100, completed_at: '2026-10-16T10:00:00.000Z', updated_at: '2026-10-16T10:00:00.000Z', item_type: 'training', state: JSON.stringify({ certificate: { id: 'must-not-be-listed' } }) }];
    throw new Error('Unexpected query: ' + sql);
  } };
  const planner = makePlanner({ db, lib: { manifestOf: () => manifest } });
  const certs = planner.certificates(1, 'Student Name');
  assert.deepEqual(certs.map(c => c.kind), ['package']);
  assert.equal(certs[0].items, 1);
});

test('a package spec preserves an optional author feedback contact', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-contact-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'notes.md'), '# Notes\n\nA short reading.\n');
  const contact = { name: 'Course team', email: 'courses@example.org', url: 'https://example.org/courses', instructions: 'Include the package title.' };
  const spec = { pack: { id: 'org.example.contact-test', version: '1.0.0', title: 'Contact test', publisher: 'Example publisher', contact },
    readings: [{ id: 'notes', source: 'notes.md' }] };
  const specPath = path.join(root, 'pack-spec.json'); fs.writeFileSync(specPath, JSON.stringify(spec));
  addTestPlan(specPath);
  const checked = checkSpec(specPath);
  assert.deepEqual(checked.errors, []);
  const pack = assemble(specPath, path.join(root, 'assembled'), checked);
  assert.deepEqual(pack.contact, contact);
});

test('package branding is validated, assembled and requires the package-style capable app', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-branding-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'notes.md'), '# Notes\n\nA short reading.\n');
  const branding = { accent: '#006B54', accentInk: '#FFFFFF', accentSoft: '#E2F4EE' };
  const spec = { pack: { id: 'org.example.branding-test', version: '1.0.0', title: 'Branding test', publisher: 'Example publisher', branding },
    readings: [{ id: 'notes', source: 'notes.md' }] };
  const specPath = path.join(root, 'pack-spec.json'); fs.writeFileSync(specPath, JSON.stringify(spec));
  addTestPlan(specPath);
  const checked = checkSpec(specPath);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.formats.pack, 2);
  assert.equal(checked.minApp, '2.2.0');
  const pack = assemble(specPath, path.join(root, 'assembled'), checked);
  assert.deepEqual(pack.branding, branding);
  assert.equal(validatePack(path.join(root, 'assembled')).formats.pack, 2);
  assert.equal(supports({ format: 2, minAppVersion: '1.8.0', items: [] }).ok, true);
});

test('package branding refuses unsafe colours and unsupported fields', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-invalid-branding-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'notes.md'), '# Notes\n\nA short reading.\n');
  const spec = { pack: { id: 'org.example.invalid-branding', version: '1.0.0', title: 'Invalid branding', branding: { accent: 'red', accentInk: '#FFFFFF', css: 'body { display: none }' } },
    readings: [{ id: 'notes', source: 'notes.md' }] };
  const specPath = path.join(root, 'pack-spec.json'); fs.writeFileSync(specPath, JSON.stringify(spec));
  addTestPlan(specPath);
  const checked = checkSpec(specPath);
  assert.ok(checked.errors.some(e => e.includes('accent') && e.includes('six-digit hex colour')));
  assert.ok(checked.errors.some(e => e.includes('unknown field "css"')));
});

test('custom web training packages preserve local JavaScript and require the web-training capable app', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-custom-web-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const training = path.join(root, 'training');
  fs.mkdirSync(path.join(training, 'js'), { recursive: true });
  fs.writeFileSync(path.join(training, 'training.json'), JSON.stringify({
    format: 2, id: 'logic-playground', title: 'Logic playground', hours: '30 min',
    progress: { mode: 'bridge' }, runtime: { kind: 'web', entry: 'index.html' }
  }));
  fs.writeFileSync(path.join(training, 'index_preview.html'), '<!doctype html><p>Author test preview</p>');
  fs.writeFileSync(path.join(training, 'index.html'), '<!doctype html><title>Logic playground</title><script src="js/logic.js"></script>');
  fs.writeFileSync(path.join(training, 'js', 'logic.js'), 'window.logicPlayground = true;');
  const specPath = path.join(root, 'pack-spec.json');
  fs.writeFileSync(specPath, JSON.stringify({
    pack: { id: 'org.example.logic-playground', version: '1.0.0', title: 'Logic playground' },
    trainings: [{ id: 'logic-playground', source: 'training' }]
  }));
  addTestPlan(specPath);
  const checked = checkSpec(specPath);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.formats.training, 2);
  assert.equal(checked.minApp, '2.2.0');
  const assembled = path.join(root, 'assembled');
  const pack = assemble(specPath, assembled, checked);
  assert.equal(pack.items[0].entry, 'index.html');
  assert.deepEqual(validatePack(assembled).errors, []);
  const packed = collectFiles(assembled, pack);
  assert.ok(packed['content/trainings/logic-playground/index.html']);
  assert.ok(packed['content/trainings/logic-playground/js/logic.js']);
  assert.equal(supports({ format: 1, minAppVersion: '1.9.0', items: [{ id: 'logic-playground', type: 'training', format: 2 }] }).ok, true);
  assert.equal(supports({ format: 1, minAppVersion: '1.9.0', items: [{ id: 'logic-playground', type: 'training', format: 2 }] }, '1.8.0').ok, false);
});

test('custom web format 2 keeps its certificate and requires Academy 2.1', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-custom-web-certificate-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const training = path.join(root, 'training');
  fs.mkdirSync(path.join(training, 'js'), { recursive: true });
  fs.writeFileSync(path.join(training, 'training.json'), JSON.stringify({
    format: 2, id: 'certificate-playground', title: 'Certificate playground', hours: '30 min',
    certificate: 'certificate.json', progress: { mode: 'bridge' }, runtime: { kind: 'web', entry: 'index.html' }
  }));
  fs.writeFileSync(path.join(training, 'certificate.json'), JSON.stringify({ title: 'Completion certificate', issuer: 'Example publisher' }));
  fs.writeFileSync(path.join(training, 'index_preview.html'), '<!doctype html><p>Author test preview</p>');
  fs.writeFileSync(path.join(training, 'index.html'), '<!doctype html><title>Certificate playground</title><script src="js/lesson.js"></script>');
  fs.writeFileSync(path.join(training, 'js', 'lesson.js'), 'window.lesson = true;');
  const specPath = path.join(root, 'pack-spec.json');
  fs.writeFileSync(specPath, JSON.stringify({
    pack: { id: 'org.example.certificate-playground', version: '1.0.0', title: 'Certificate playground' },
    trainings: [{ id: 'certificate-playground', source: 'training' }]
  }));
  addTestPlan(specPath);
  const checked = checkSpec(specPath);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.formats.training, 2);
  assert.equal(checked.minApp, '2.2.0');
  const assembled = path.join(root, 'assembled');
  const pack = assemble(specPath, assembled, checked);
  assert.equal(pack.items[0].entry, 'index.html');
  assert.equal(pack.items[0].certificate, 'certificate.json');
  assert.deepEqual(validatePack(assembled).errors, []);
  const packed = collectFiles(assembled, pack);
  assert.ok(packed['content/trainings/certificate-playground/certificate.json']);
  assert.ok(packed['content/trainings/certificate-playground/index.html']);
  assert.ok(packed['content/trainings/certificate-playground/js/lesson.js']);
  assert.equal(supports({ format: 1, minAppVersion: '2.1.0', items: [{ id: 'certificate-playground', type: 'training', format: 2 }] }, '2.0.0').ok, false);
  assert.equal(supports({ format: 1, minAppVersion: '2.1.0', items: [{ id: 'certificate-playground', type: 'training', format: 2 }] }).ok, true);
});

test('format-1 packages retain the complete runnable training source for export', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-template-source-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const training = path.join(root, 'training');
  fs.mkdirSync(path.join(training, 'topics'), { recursive: true });
  fs.mkdirSync(path.join(training, 'js'), { recursive: true });
  fs.mkdirSync(path.join(training, 'css'), { recursive: true });
  fs.writeFileSync(path.join(training, 'training.json'), JSON.stringify({ id: 'feature-tour', title: 'Feature tour', topics: ['01-intro.json'], certificate: 'certificate.json' }));
  fs.writeFileSync(path.join(training, 'topics', '01-intro.json'), JSON.stringify({ id: 'intro', title: 'Intro', subsections: [{ id: 'start', title: 'Start', blocks: [{ type: 'text', md: 'Hello' }] }] }));
  fs.writeFileSync(path.join(training, 'certificate.json'), '{}');
  fs.writeFileSync(path.join(training, 'index_preview.html'), '<!doctype html><p>Author test preview</p>');
  fs.writeFileSync(path.join(training, 'index.html'), '<!doctype html><title>Feature tour</title>');
  fs.writeFileSync(path.join(training, 'js', 'core.js'), 'window.trainingCore = true;');
  fs.writeFileSync(path.join(training, 'css', 'app.css'), ':root {}');
  const specPath = path.join(root, 'pack-spec.json');
  fs.writeFileSync(specPath, JSON.stringify({
    pack: { id: 'org.example.template-source', version: '1.0.0', title: 'Template source' },
    trainings: [{ id: 'feature-tour', source: 'training' }]
  }));
  addTestPlan(specPath);
  const checked = checkSpec(specPath);
  assert.deepEqual(checked.errors, []);
  const assembled = path.join(root, 'assembled');
  const pack = assemble(specPath, assembled, checked);
  const packed = collectFiles(assembled, pack);
  assert.ok(packed['content/trainings/feature-tour/index.html']);
  assert.ok(packed['content/trainings/feature-tour/js/core.js']);
  assert.ok(packed['content/trainings/feature-tour/css/app.css']);
  assert.ok(packed['content/trainings/feature-tour/certificate.json']);
});

test('a completed format-2 custom web training receives an Academy certificate', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-cert-planner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'training.json'), JSON.stringify({ certificate: 'certificate.json' }));
  fs.writeFileSync(path.join(root, 'certificate.json'), '{}');
  const manifest = {
    format: 1, id: 'org.example.web-certificate', version: '1.0.0', title: 'Web certificate',
    items: [{ id: 'logic-playground', path: '.', type: 'training', format: 2, certificate: 'certificate.json', title: 'Logic playground', estimatedTime: '30 min' }]
  };
  const db = { all(sql) {
    if (sql.startsWith('SELECT id FROM packs')) return [{ id: manifest.id }];
    if (sql.startsWith('SELECT item_id')) return [{ item_id: 'logic-playground', percent: 100, completed_at: '2026-10-16T10:00:00.000Z', updated_at: '2026-10-16T10:00:00.000Z', item_type: 'training', state: JSON.stringify({}) }];
    throw new Error('Unexpected query: ' + sql);
  } };
  const planner = makePlanner({ db, lib: { manifestOf: () => manifest, packDir: () => root } });
  const certs = planner.certificates(1, 'Student Name');
  assert.equal(certs.length, 1);
  assert.equal(certs[0].kind, 'training');
  assert.equal(certs[0].format, 2);
  assert.equal(certs[0].name, 'Student Name');
});

test('custom web training refuses unsafe entry pages and missing author previews', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-custom-web-invalid-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'training'));
  fs.writeFileSync(path.join(root, 'training', 'certificate.json'), '{}');
  fs.writeFileSync(path.join(root, 'training', 'training.json'), JSON.stringify({
    format: 2, id: 'bad-web', title: 'Bad web', certificate: 'certificate.json', progress: { mode: 'bridge' }, runtime: { kind: 'web', entry: '../outside.html' }
  }));
  const specPath = path.join(root, 'pack-spec.json');
  fs.writeFileSync(specPath, JSON.stringify({ pack: { id: 'org.example.bad-web', version: '1.0.0', title: 'Bad web' }, trainings: [{ id: 'bad-web', source: 'training' }] }));
  addTestPlan(specPath);
  const checked = checkSpec(specPath);
  assert.ok(checked.errors.some(e => /runtime.entry must be a local/.test(e)));
  assert.ok(checked.errors.some(e => /index_preview.html/.test(e)));
});

test('a password-gated package hides its verifier, refuses content until unlocked, and requires Academy 2.0', async t => {
  const { lib, write } = await setup(t);
  const password = passwordAccess('correct horse battery staple');
  const source = { ...manifest, id: 'org.example.gated', version: '1.0.0', title: 'Gated package', publisher: 'Example publisher', access: { password: { ...password, hint: 'Four words' } } };
  const pack = buildPack({ manifest: { ...source, format: 3, minAppVersion: '2.0.0' }, files });
  lib.importFile(write(pack), { userId: 5, devMode: false });
  const before = lib.get(source.id, 5);
  assert.equal(before.access.required, true);
  assert.equal(before.access.unlocked, false);
  assert.equal(before.manifest.access, undefined);
  assert.throws(() => lib.getProgress(5, source.id, 'anything'), /locked/);
  assert.throws(() => lib.unlock(5, source.id, 'not it'), /Incorrect/);
  assert.equal(lib.unlock(5, source.id, 'correct horse battery staple').unlocked, true);
  assert.equal(lib.get(source.id, 5).access.unlocked, true);
  assert.equal(supports({ format: 3, minAppVersion: '2.0.0', items: [] }, '1.9.0').ok, false);
  assert.equal(supports({ format: 3, minAppVersion: '2.0.0', items: [] }).ok, true);
});

test('full lab download preserves the manual, assets and source tree', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-full-lab-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lab = path.join(root, 'lab');
  fs.mkdirSync(path.join(lab, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(lab, 'src', 'rtl'), { recursive: true });
  fs.writeFileSync(path.join(lab, 'lab.json'), '{"title":"Full lab"}');
  fs.writeFileSync(path.join(lab, 'manual.pdf'), '%PDF-1.4');
  fs.writeFileSync(path.join(lab, 'assets', 'diagram.svg'), '<svg/>');
  fs.writeFileSync(path.join(lab, 'src', 'rtl', 'adder.sv'), 'module adder; endmodule');
  const destination = copyItemFolder({ itemDir: lab, item: { id: 'lab', title: 'Full lab' }, targetDir: root });
  assert.ok(fs.existsSync(path.join(destination, 'lab.json')));
  assert.ok(fs.existsSync(path.join(destination, 'manual.pdf')));
  assert.ok(fs.existsSync(path.join(destination, 'assets', 'diagram.svg')));
  assert.ok(fs.existsSync(path.join(destination, 'src', 'rtl', 'adder.sv')));
});

test('standard Academy trainings export as self-contained HTML', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-training-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'topics'), { recursive: true });
  fs.writeFileSync(path.join(root, 'training.json'), JSON.stringify({ id: 'export-test', title: 'Export test', topics: ['01.json'] }));
  fs.writeFileSync(path.join(root, 'topics', '01.json'), JSON.stringify({ id: 'one', title: 'One', subsections: [{ id: 'start', title: 'Start', blocks: [{ type: 'text', text: 'Hello' }] }] }));
  const html = standaloneTraining({ trainingDir: root, engineDir: path.join(__dirname, '..', 'src', 'engine', 'training') });
  assert.match(html, /window\.TRAINING_DATA=/);
  assert.match(html, /Export test/);
  assert.doesNotMatch(html, /src="js\/app\.js"/);
});

test('mandatory course order and study plan report missing coverage and protect an installed version', async t => {
  const { lib, db, write } = await setup(t);
  const valid = write(buildPack({ manifest, files }), 'valid.stlp'); lib.importFile(valid, { devMode: true });
  const invalid = { ...manifest, version: '1.0.1', modules: [], schedule: null };
  assert.throws(() => lib.importFile(write(buildPack({ manifest: invalid, files })), { devMode: true }), /modules: missing mandatory course order[\s\S]*schedule: missing mandatory study plan/);
  assert.equal(db.get('SELECT version FROM packs WHERE id=?',[manifest.id]).version,'1.0.0');
  assert.equal(fs.readFileSync(path.join(lib.packDir(manifest.id),'test.txt'),'utf8'),'Test data only');
  const root = path.join(path.dirname(valid),'spec'); fs.mkdirSync(root); fs.writeFileSync(path.join(root,'notes.txt'),'notes');
  const spec = { pack:{id:'org.example.plan',version:'1.0.0',title:'Plan'}, materials:[{id:'notes',source:'notes.txt'}],modules:[{id:'m',title:'M',items:['wrong']}],schedule:{weeks:1,entries:[{week:1,items:['wrong']}]}};
  fs.writeFileSync(path.join(root,'pack-spec.json'),JSON.stringify(spec));
  const errors = checkSpec(path.join(root,'pack-spec.json')).errors.join('\n');
  assert.match(errors,/unknown item "wrong"/); assert.match(errors,/notes.*missing from course order/); assert.match(errors,/notes.*missing from schedule.entries/);
});

test('full folder exports preserve projects, sources and attachments and exclude password-protected previews', async t => {
  const { lib, write } = await setup(t); const fixture = require('./fixtures/contract').build();
  t.after(()=>fs.rmSync(fixture.root,{recursive:true,force:true}));
  lib.importFile(fixture.file,{userId:1,devMode:true}); const m=lib.manifestOf(fixture.spec.pack.id), packDir=lib.packDir(m.id);
  assert.equal(lib.accessState(1,m.id,m).unlocked,false); assert.doesNotThrow(()=>lib.requireUnlocked(1,m.id));
  const targetDir=path.join(fixture.root,'exports');fs.mkdirSync(targetDir);
  const project=copyItem({packDir,manifest:m,item:m.items.find(i=>i.id==='project'),targetDir,engineDir:fixture.engineDir});
  for(const rel of ['project.json','brief.pdf','src/main.js','requirements/srs.md','materials/notes.txt','academy-attachments/data/data.csv']) assert.ok(fs.existsSync(path.join(project,rel)),rel);
  const training=copyItem({packDir,manifest:m,item:m.items.find(i=>i.id==='web'),targetDir,engineDir:fixture.engineDir});
  assert.ok(fs.existsSync(path.join(training,'training.json'))); assert.ok(fs.existsSync(path.join(training,'certificate/index.html')));
  assert.equal(fs.existsSync(path.join(training,'index_preview.html')),false); assert.equal(fs.existsSync(path.join(training,'certificate/index_preview.html')),false);
  assert.throws(()=>copyItem({packDir,manifest:m,item:m.items.find(i=>i.id==='web'),targetDir,engineDir:fixture.engineDir}),/already exists/);
  const all=copyPack({packDir,manifest:m,engineDir:fixture.engineDir,targetDir,allowPreview:false});
  assert.ok(fs.existsSync(path.join(all,'trainings/json/index.html'))); assert.equal(fs.existsSync(path.join(all,'trainings/json/index_preview.html')),false); assert.equal(fs.existsSync(path.join(all,'certificate/index_preview.html')),false);
  assert.match(fs.readFileSync(path.join(all,'trainings/json/index.html'),'utf8'),/TRAINING_DATA=/);
  lib.unlock(1,m.id,'test-preview-password'); const unlocked=path.join(fixture.root,'unlocked');fs.mkdirSync(unlocked);
  const copy=copyPack({packDir,manifest:m,engineDir:fixture.engineDir,targetDir:unlocked,allowPreview:lib.canPreview(1,m.id)});
  assert.ok(fs.existsSync(path.join(copy,'trainings/json/index_preview.html'))); assert.ok(fs.existsSync(path.join(copy,'trainings/web/certificate/index_preview.html')));
});

test('manual web steps determine package progress and optional certificates independently of page claims', async t => {
  const {lib,db}=await setup(t), fixture=require('./fixtures/contract').build(); t.after(()=>fs.rmSync(fixture.root,{recursive:true,force:true}));
  lib.importFile(fixture.file,{userId:1,devMode:true}); const id=fixture.spec.pack.id;
  lib.setProgress(1,id,'web','training',{checkedSteps:['review','invented']},100,true);
  assert.equal(lib.getProgress(1,id,'web').percent,50); assert.equal(lib.getProgress(1,id,'web').completedAt,null);
  assert.equal(lib.get(id,1).summary.percent,7);
  const planner=makePlanner({db,lib}); assert.equal(planner.certificates(1,'Learner').length,0);
  lib.setProgress(1,id,'web','training',{checkedSteps:['review','exercise']},0,false);
  assert.equal(lib.getProgress(1,id,'web').percent,100); assert.equal(planner.certificates(1,'Learner')[0].kind,'training');
  lib.setProgress(1,id,'json','training',{},100,true);
  assert.equal(planner.certificates(1,'Learner').filter(c=>c.kind==='training').length,1,'JSON training omitted certificate');
  lib.setProgress(1,id,'web','training',{checkedSteps:[]},100,true);
  assert.equal(planner.certificates(1,'Learner').length,0,'unmarking a step removes completion');
});

test('training format 3 is rejected and custom format 2 requires explicit progress and preview', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'stl-format-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const {checkers}=require('../src/shared/validate');const errors=[];const C=checkers({error:(w,m)=>errors.push(w+': '+m),warn:()=>{}});
  fs.writeFileSync(path.join(root,'training.json'),JSON.stringify({id:'web',title:'Web',format:3}));C.training(root,'training');assert.match(errors.join('\n'),/must be 1.*or 2/);
  errors.length=0;fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><h1>Web</h1>');fs.writeFileSync(path.join(root,'training.json'),JSON.stringify({id:'web',title:'Web',format:2,runtime:{kind:'web',entry:'index.html'}}));C.training(root,'training');
  assert.match(errors.join('\n'),/index_preview.html/);assert.match(errors.join('\n'),/progress.mode/);
});

test('assembly refuses overlapping sources and unrelated output folders without deleting files', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'stl-build-boundary-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const specPath=path.join(root,'pack-spec.json');fs.writeFileSync(path.join(root,'notes.txt'),'Keep my source');
  fs.writeFileSync(specPath,JSON.stringify({pack:{id:'org.example.build',version:'1.0.0',title:'Build'},materials:[{id:'notes',source:'notes.txt'}]}));addTestPlan(specPath);
  const checked=checkSpec(specPath);assert.deepEqual(checked.errors,[]);
  assert.throws(()=>assemble(specPath,root,checked),/overlaps/);
  const destination=path.join(root,'unrelated');fs.mkdirSync(destination);fs.writeFileSync(path.join(destination,'keep.txt'),'Keep unrelated data');
  assert.throws(()=>assemble(specPath,destination,checked),/refusing to replace/);
  assert.equal(fs.readFileSync(path.join(root,'notes.txt'),'utf8'),'Keep my source');assert.equal(fs.readFileSync(path.join(destination,'keep.txt'),'utf8'),'Keep unrelated data');
});

test('account password changes reject wrong/short passwords, rotate the hash, and preserve learning data', async t => {
  const { db, lib, write } = await setup(t);
  const auth = require('../src/main/auth')(db);
  const user = auth.register({ username: 'learner', displayName: 'Learner', password: 'old-password' });
  lib.importFile(write(buildPack({ manifest, files })), { userId: user.id, devMode: true });
  lib.setProgress(user.id, manifest.id, 'notes', 'material', { note: 'Keep this' }, 50, false);
  const before = db.get('SELECT * FROM users WHERE id=?', [user.id]);
  assert.throws(() => auth.changePassword(user.id, { oldPassword: 'wrong', newPassword: 'new-password' }), /Current password is wrong/);
  assert.throws(() => auth.changePassword(user.id, { oldPassword: 'old-password', newPassword: 'short' }), /at least 6/);
  assert.equal(auth.login({ username: 'learner', password: 'old-password' }).id, user.id);
  auth.changePassword(user.id, { oldPassword: 'old-password', newPassword: 'new-password' });
  assert.throws(() => auth.login({ username: 'learner', password: 'old-password' }), /Wrong username or password/);
  assert.equal(auth.login({ username: 'learner', password: 'new-password' }).id, user.id);
  const after = db.get('SELECT * FROM users WHERE id=?', [user.id]);
  assert.notEqual(after.pass_salt, before.pass_salt); assert.notEqual(after.pass_hash, before.pass_hash);
  assert.notEqual(after.pass_hash, 'new-password'); assert.equal(lib.getProgress(user.id, manifest.id, 'notes').percent, 50);
});

test('every package import relocks previews per learner without losing progress, including the same version', async t => {
  const { lib, write } = await setup(t);
  const first = { ...manifest, format: 3, access: { scope: 'preview', password: passwordAccess('first-password') } };
  lib.importFile(write(buildPack({ manifest: first, files })), { userId: 1, devMode: true });
  assert.throws(() => lib.unlock(1, first.id, 'wrong-password'), /Incorrect package password/);
  assert.equal(lib.isUnlocked(1, first.id), false);
  lib.unlock(1, first.id, 'first-password'); assert.equal(lib.isUnlocked(1, first.id), true);
  assert.equal(lib.isUnlocked(2, first.id), false);
  lib.setProgress(1, first.id, 'notes', 'material', {}, 50, false);
  /* A publisher can re-deliver changed contents without changing semver. */
  lib.importFile(write(buildPack({ manifest: first, files }), 'same-version-reinstall.stlp'), { userId: 2, devMode: true });
  assert.equal(lib.isUnlocked(1, first.id), false);
  assert.equal(lib.getProgress(1, first.id, 'notes').percent, 50);
  lib.unlock(1, first.id, 'first-password'); assert.equal(lib.isUnlocked(1, first.id), true);
  const next = { ...first, version: '1.0.1', access: { scope: 'preview', password: passwordAccess('second-password') } };
  lib.importFile(write(buildPack({ manifest: next, files })), { userId: 1, devMode: true });
  assert.equal(lib.isUnlocked(1, first.id), false); assert.equal(lib.getProgress(1, first.id, 'notes').percent, 50);
  assert.throws(() => lib.unlock(1, first.id, 'first-password'), /Incorrect package password/);
  lib.unlock(1, first.id, 'second-password'); assert.equal(lib.isUnlocked(1, first.id), true);
});

test('invalid metadata is rejected with a field-specific error before replacing installed content', async t => {
  const { lib, db, write, dataDir } = await setup(t);
  lib.importFile(write(buildPack({ manifest, files })), { userId: 1, devMode: true });
  lib.setProgress(1, manifest.id, 'notes', 'material', {}, 50, false);
  const cases = [
    ['invalid package title', m => m.title = {}, /pack.title.*text title/],
    ['invalid publisher', m => m.publisher = {}, /pack.publisher.*text/],
    ['invalid authors', m => m.authors = 'An Author', /pack.authors.*array/],
    ['invalid version type', m => m.version = ['1.0.1'], /pack.version.*text/],
    ['missing type', m => delete m.items[0].type, /item "notes".*undefined/],
    ['unknown type', m => m.items[0].type = 'unknown', /item "notes".*unknown/],
    ['missing title', m => delete m.items[0].title, /material "notes".title: missing title/],
    ['invalid items', m => m.items = {}, /manifest.items must be an array/],
    ['null item', m => m.items = [null], /manifest.items\[0\]/],
    ['missing content', m => m.items[0].file = 'missing.txt', /missing.txt/],
    ['unsafe content', m => m.items[0].file = '../outside.txt', /notes.*file.*local path/],
    ['invalid assets', m => m.items[0].assets = {}, /notes.*assets.*array/],
    ['duplicate ids', m => m.items.push({ ...m.items[0] }), /duplicate id/],
    ['missing order', m => delete m.modules, /modules: missing mandatory/],
    ['null module', m => m.modules = [null], /modules\[0\].*object/],
    ['unplanned item', m => m.modules[0].items = ['missing'], /unknown item "missing"[\s\S]*notes.*missing from course order/],
    ['missing plan', m => delete m.schedule, /schedule: missing mandatory/],
    ['invalid entries', m => m.schedule.entries = {}, /schedule: must be/],
    ['null planned week', m => m.schedule.entries = [null], /schedule.entries\[0\].*object/],
    ['invalid planned items', m => m.schedule.entries[0].items = 'notes', /schedule.entries\[0\].items.*array/],
    ['fractional week', m => m.schedule.entries[0].week = 0.5, /schedule.entries\[0\].*whole-number/],
    ['week out of range', m => m.schedule.entries[0].week = 2, /goes beyond week 1/],
    ['missing coverage', m => m.schedule.entries[0].items = [], /notes.*missing from schedule/],
    ['missing certificate', m => m.certificate = { kind: 'web', entry: 'certificate/missing.html' }, /certificate.*missing/]
  ];
  for (const [name, mutate, error] of cases) {
    await t.test(name, () => {
      const m = structuredClone(manifest); m.version = '1.0.1'; mutate(m);
      {
        const pack = buildPack({ manifest: m, files });
        assert.throws(() => lib.importFile(write(pack), { userId: 1 }), error);
        assert.equal(db.get('SELECT version FROM packs WHERE id=?', [manifest.id]).version, '1.0.0');
        assert.equal(lib.getProgress(1, manifest.id, 'notes').percent, 50);
        assert.equal(fs.readFileSync(path.join(lib.packDir(manifest.id), 'test.txt'), 'utf8'), 'Test data only');
        assert.equal(fs.readdirSync(path.join(dataDir, 'packs')).some(x => x.startsWith('.tmp-')), false);
      }
    });
  }
});

test('imports reject broken web-training declarations, missing previews and missing project briefs', async t => {
  const { lib, write } = await setup(t), fixture = require('./fixtures/contract').build();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  lib.importFile(fixture.file, { userId: 1, devMode: true });
  const source = readPack(fs.readFileSync(fixture.file));
  const cases = [
    ['missing training preview', (m,f) => delete f['content/trainings/web/index_preview.html'], /index_preview.html.*missing/],
    ['missing certificate preview', (m,f) => delete f['content/trainings/web/certificate/index_preview.html'], /certificate.*preview/],
    ['missing brief', (m,f) => delete f['content/projects/project/brief.pdf'], /brief.pdf/],
    ['manifest progress mismatch', m => m.items.find(i=>i.id==='web').progress={mode:'bridge'}, /manifest.items.web.progress/],
    ['manifest certificate mismatch', m => delete m.items.find(i=>i.id==='web').certificate, /manifest.items.web.certificate/],
    ['missing progress declaration', (m,f) => { const p='content/trainings/web/training.json', j=JSON.parse(Buffer.from(f[p]));delete j.progress;f[p]=Buffer.from(JSON.stringify(j)); }, /training.json.progress.mode/],
    ['obsolete training format', (m,f) => { const p='content/trainings/web/training.json', j=JSON.parse(Buffer.from(f[p]));j.format=3;f[p]=Buffer.from(JSON.stringify(j)); }, /must be 1.*or 2/]
  ];
  for (const [label, mutate, error] of cases) await t.test(label, () => {
    const m=structuredClone(source.manifest), f={...source.files};m.version='1.2.0';mutate(m,f);
    assert.throws(()=>lib.importFile(write(buildPack({manifest:m,files:f})),{userId:1,devMode:true}),error);
    assert.equal(lib.manifestOf(m.id).version,source.manifest.version);
    assert.ok(fs.existsSync(path.join(lib.packDir(m.id),'projects/project/brief.pdf')));
  });
});

test('open packages omit author previews by default while retaining source previews and normal downloads', async t => {
  const { lib, write } = await setup(t), fixture = require('./fixtures/contract').build();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const source = readPack(fs.readFileSync(fixture.file));
  delete source.manifest.access; source.manifest.format = 1;
  lib.importFile(write(buildPack({manifest:source.manifest,files:source.files})),{userId:1,devMode:true});
  const m=lib.manifestOf(source.manifest.id),packDir=lib.packDir(m.id);
  assert.equal(lib.isUnlocked(1,m.id),true,'normal learning is open');
  assert.equal(lib.canPreview(1,m.id),false,'open learning is not preview authorization');
  lib.unlock(1,m.id,'arbitrary-password');assert.equal(lib.canPreview(1,m.id),false);
  const targetDir=path.join(fixture.root,'no-password');fs.mkdirSync(targetDir);
  for (const item of m.items.filter(i=>i.type==='training')) {
    assert.ok(fs.existsSync(path.join(packDir,item.path,'index_preview.html')),'author preview retained in installed package');
    const dst=copyItem({packDir,manifest:m,item,targetDir,engineDir:fixture.engineDir,allowPreview:lib.canPreview(1,m.id)});
    assert.ok(fs.existsSync(path.join(dst,'index.html')));
    assert.equal(fs.existsSync(path.join(dst,'index_preview.html')),false,item.id);
    assert.equal(fs.existsSync(path.join(dst,'certificate/index_preview.html')),false,item.id);
  }
  const whole=copyPack({packDir,manifest:m,targetDir,engineDir:fixture.engineDir,allowPreview:lib.canPreview(1,m.id)});
  assert.equal(fs.readdirSync(whole,{recursive:true}).some(f=>/(?:index_preview|training-preview|certificate-preview)\.html?$/i.test(f)),false);
});
