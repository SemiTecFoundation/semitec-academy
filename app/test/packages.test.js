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
