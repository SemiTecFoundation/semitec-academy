/* Package boundary regressions. All archives, keys and database contents are disposable test data. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { unzipSync, zipSync } = require('fflate');
const { buildPack, readPack, peekPack, generateKeyPair, keyId, loadTrustedKeys } = require('../src/shared/packfmt');
const makeLibrary = require('../src/main/library');
const makePlanner = require('../src/main/planner');
const { checkSpec, assemble } = require('../src/shared/spec');
const { DB } = require('../src/main/db');

const keys = generateKeyPair();
const trustedKeys = { [keyId(keys.publicKey)]: { pem: keys.publicKey, name: 'Disposable test key' } };
const manifest = { format: 1, id: 'org.example.test-pack', version: '1.0.0', title: 'Test fixture', items: [] };
const files = { 'content/test.txt': Buffer.from('Test data only') };
const invalidIds = ['../victim', '../../outside', '.', '..', '/absolute', '..\\victim', 'C:\\victim',
  'C:victim', 'org.example/child', 'org.example\\child', 'org.example..test', 'org.example.test\n',
  ' org.example.test', '', '__proto__', null, 123, ['org.example.test'], { id: 'org.example.test' }];

/* Construct hostile input independently of the builder's id validation. Re-sign it when requested
   so a valid signature cannot accidentally be the reason the importer rejects a bad id. */
function hostilePack(id, signed) {
  const entries = unzipSync(buildPack({ manifest, files }).bytes);
  const m = JSON.parse(Buffer.from(entries['manifest.json']).toString());
  m.id = id;
  entries['manifest.json'] = Buffer.from(JSON.stringify(m));
  if (signed) entries['signature.json'] = Buffer.from(JSON.stringify({
    format: 1, alg: 'ed25519', keyId: keyId(keys.publicKey),
    signature: crypto.sign(null, entries['manifest.json'], keys.privateKey).toString('base64')
  }));
  return Buffer.from(zipSync(entries));
}

async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-package-test-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const db = await DB.open(dataDir);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const lib = makeLibrary({ db, dataDir, trustedKeys });
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

test('builder, reader and catalog reject malformed package ids', () => {
  for (const id of invalidIds) {
    const label = JSON.stringify(id);
    assert.throws(() => buildPack({ manifest: { ...manifest, id }, files }), /Invalid package id/, label);
    for (const signed of [false, true]) {
      const bytes = hostilePack(id, signed);
      assert.throws(() => readPack(bytes, trustedKeys), /Invalid package id/, label);
      assert.throws(() => peekPack(bytes, trustedKeys), /Invalid package id/, label);
    }
  }
});

test('unsafe imports preserve unrelated files and the database, even with Developer mode or a trusted signature', async t => {
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

test('signed test packages install, upgrade and remove within the packages folder', async t => {
  const { lib, db, victim, write } = await setup(t);
  const first = write(buildPack({ manifest, files, privateKeyPem: keys.privateKey }));
  assert.equal(lib.importFile(first, { devMode: false }).signature.status, 'trusted');
  const installed = path.join(lib.packsDir, manifest.id);
  assert.equal(lib.packDir(manifest.id), installed);
  assert.equal(fs.readFileSync(path.join(installed, 'test.txt'), 'utf8'), 'Test data only');
  assert.equal(db.get('SELECT version FROM packs WHERE id=?', [manifest.id]).version, '1.0.0');
  const second = write(buildPack({ manifest: { ...manifest, version: '1.0.1' },
    files: { 'content/replacement.txt': Buffer.from('Replacement test data') }, privateKeyPem: keys.privateKey }));
  assert.equal(lib.importFile(second, { devMode: false }).updatedFrom, '1.0.0');
  assert.equal(fs.existsSync(path.join(installed, 'test.txt')), false);
  assert.equal(fs.readFileSync(path.join(installed, 'replacement.txt'), 'utf8'), 'Replacement test data');
  assert.equal(db.get('SELECT version FROM packs WHERE id=?', [manifest.id]).version, '1.0.1');
  lib.remove(manifest.id);
  assert.deepEqual(fs.readdirSync(lib.packsDir), []);
  assert.equal(db.get('SELECT id FROM packs WHERE id=?', [manifest.id]), null);
  assert.equal(fs.readFileSync(path.join(victim, 'keep.txt'), 'utf8'), 'Unrelated data');
});

test('unsigned test packages require Developer mode', async t => {
  const { lib, write } = await setup(t);
  const file = write(buildPack({ manifest, files }));
  assert.throws(() => lib.importFile(file, { devMode: false }), /not signed/);
  assert.deepEqual(fs.readdirSync(lib.packsDir), []);
  assert.equal(lib.importFile(file, { devMode: true }).signature.status, 'unsigned');
});

test('empty test packages install without a content directory', async t => {
  const { lib, write } = await setup(t);
  lib.importFile(write(buildPack({ manifest, files: {} })), { devMode: true });
  assert.deepEqual(fs.readdirSync(lib.packDir(manifest.id)), ['.manifest.json']);
});

test('fixture packages contain every declared file and are trusted only by their temporary key', t => {
  const fixtures = require('./fixtures/build').build();
  t.after(() => fs.rmSync(fixtures.dir, { recursive: true, force: true }));
  const fixtureKeys = loadTrustedKeys(fixtures.trustedDir);
  const productionKeys = loadTrustedKeys(path.join(__dirname, '..', 'trusted-keys'));
  assert.equal(Object.keys(fixtures.packs).length, 2);
  for (const [id, file] of Object.entries(fixtures.packs)) {
    const bytes = fs.readFileSync(file);
    const pack = readPack(bytes, fixtureKeys);
    assert.equal(pack.manifest.id, id);
    assert.equal(pack.signature.status, 'trusted');
    assert.ok(Object.keys(pack.files).length > 0);
    assert.equal(readPack(bytes, productionKeys).signature.status, 'untrusted-key');
  }
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

test('a package spec preserves an optional author feedback contact', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-contact-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'notes.md'), '# Notes\n\nA short reading.\n');
  const contact = { name: 'Course team', email: 'courses@example.org', url: 'https://example.org/courses', instructions: 'Include the package title.' };
  const spec = { pack: { id: 'org.example.contact-test', version: '1.0.0', title: 'Contact test', publisher: 'Example publisher', contact },
    readings: [{ id: 'notes', source: 'notes.md' }] };
  const specPath = path.join(root, 'pack-spec.json'); fs.writeFileSync(specPath, JSON.stringify(spec));
  const checked = checkSpec(specPath);
  assert.deepEqual(checked.errors, []);
  const pack = assemble(specPath, path.join(root, 'assembled'), checked);
  assert.deepEqual(pack.contact, contact);
});
