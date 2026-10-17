/* packfmt.js — the .stlp container: build, read, verify.  (Node only; used by app main process and packer.)
   Layout inside the zip:
     manifest.json     metadata, items, module structure, sha256 of every content file
     signature.json    Ed25519 signature of the exact bytes of manifest.json
     content/...       the files (trainings, PDFs, labs, cover image)
   See docs/PACKAGE-FORMAT.md. */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { unzipSync, zipSync, strToU8, strFromU8 } = require('fflate');
const { PACK_ID } = require('./validate');

const MAX_FILES = 5000, MAX_TOTAL = 2 * 1024 * 1024 * 1024; // 2 GB uncompressed
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* Package ids become directory names. Enforce the authoring rule at every container boundary,
   including signed packages and Developer mode; neither is permission to use a filesystem path. */
function assertPackId(id) {
  if (typeof id !== 'string' || id !== id.trim() || !PACK_ID.test(id)) {
    throw new Error('Invalid package id: expected lowercase reverse-domain form, e.g. org.example.test-pack');
  }
}

function safeRel(p) {
  if (typeof p !== 'string' || !p || p.length > 400) return false;
  if (p.includes('\\') || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return false;
  return p.split('/').every(s => s && s !== '.' && s !== '..');
}

/* ---------- keys ---------- */
function keyId(publicKeyPem) {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return sha256(der).slice(0, 16);
}
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
}
/* A package access gate deliberately stores only a slow password verifier. It is an Academy
   access control, not file encryption: a recipient who has the .stlp can still inspect it. */
function passwordAccess(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('access password must be at least 8 characters');
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(Buffer.from(password, 'utf8'), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url');
  return { algorithm: 'scrypt-v1', salt, hash };
}
function verifyPasswordAccess(access, password) {
  if (!access || access.algorithm !== 'scrypt-v1' || typeof access.salt !== 'string' || typeof access.hash !== 'string' || typeof password !== 'string') return false;
  try {
    const got = crypto.scryptSync(Buffer.from(password, 'utf8'), access.salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const expected = Buffer.from(access.hash, 'base64url');
    return expected.length === got.length && crypto.timingSafeEqual(expected, got);
  } catch (e) { return false; }
}
/* trusted keys directory: <name>.pub.pem files (+ optional <name>.json {name, development}) */
function loadTrustedKeys(dir) {
  const keys = {};
  if (!dir || !fs.existsSync(dir)) return keys;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.pub.pem')) continue;
    const pem = fs.readFileSync(path.join(dir, f), 'utf8');
    const base = f.slice(0, -8), metaFile = path.join(dir, base + '.json');
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
    keys[keyId(pem)] = { pem, name: meta.name || base, development: !!meta.development };
  }
  return keys;
}

/* ---------- build ---------- */
/* files: { 'content/...': Buffer }, manifest: object (files section is filled here) */
function buildPack({ manifest, files, privateKeyPem }) {
  assertPackId(manifest && manifest.id);
  const m = JSON.parse(JSON.stringify(manifest));
  m.files = {};
  for (const [p, buf] of Object.entries(files).sort()) {
    if (!p.startsWith('content/') || !safeRel(p)) throw new Error('bad path in pack: ' + p);
    m.files[p] = { sha256: sha256(buf), size: buf.length };
  }
  const manifestBytes = Buffer.from(JSON.stringify(m, null, 2), 'utf8');
  const entries = { 'manifest.json': [new Uint8Array(manifestBytes), { level: 0 }] };
  if (privateKeyPem) {
    const pub = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' });
    const sig = crypto.sign(null, manifestBytes, crypto.createPrivateKey(privateKeyPem));
    entries['signature.json'] = [strToU8(JSON.stringify({ format: 1, alg: 'ed25519', keyId: keyId(pub), signedAt: new Date().toISOString(), signature: sig.toString('base64') }, null, 2)), { level: 0 }];
  }
  for (const [p, buf] of Object.entries(files)) {
    const stored = /\.(png|jpe?g|gif|webp|mp4|webm|zip|woff2?)$/i.test(p); // already compressed
    entries[p] = [new Uint8Array(buf), { level: stored ? 0 : 9 }];
  }
  return { bytes: Buffer.from(zipSync(entries, { mtime: new Date('2020-01-01') })), manifest: m };
}

/* ---------- read + verify ---------- */
/* Returns { manifest, manifestBytes, files: {path: Uint8Array}, signature: {status, keyId, keyName, development} }
   Throws on a broken / tampered container. status: trusted | untrusted-key | unsigned */
function readPack(bytes, trustedKeys = {}) {
  let entries;
  try { entries = unzipSync(new Uint8Array(bytes)); } catch (e) { throw new Error('not a valid .stlp file (zip could not be read)'); }
  const names = Object.keys(entries).filter(n => !n.endsWith('/'));
  if (names.length > MAX_FILES) throw new Error('too many files in pack');
  if (!entries['manifest.json']) throw new Error('manifest.json missing — not a SemiTec pack');
  const manifestBytes = Buffer.from(entries['manifest.json']);
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch (e) { throw new Error('manifest.json is not valid JSON'); }
  assertPackId(manifest && manifest.id);
  if (!manifest.version || !manifest.files) throw new Error('manifest.json is incomplete');
  /* every content file must be listed with the right hash, and nothing extra may be present */
  let total = 0;
  const files = {};
  for (const n of names) {
    if (n === 'manifest.json' || n === 'signature.json') continue;
    if (!safeRel(n) || !n.startsWith('content/')) throw new Error('unsafe path in pack: ' + n);
    const info = manifest.files[n];
    if (!info) throw new Error('file not listed in manifest: ' + n);
    if (sha256(entries[n]) !== info.sha256) throw new Error('file was modified (hash mismatch): ' + n);
    total += entries[n].length; if (total > MAX_TOTAL) throw new Error('pack too large');
    files[n] = entries[n];
  }
  for (const n of Object.keys(manifest.files)) if (!files[n]) throw new Error('file missing from pack: ' + n);
  /* signature */
  let signature = { status: 'unsigned' };
  if (entries['signature.json']) {
    let s;
    try { s = JSON.parse(strFromU8(entries['signature.json'])); } catch (e) { throw new Error('signature.json is not valid JSON'); }
    const key = trustedKeys[s.keyId];
    if (!key) signature = { status: 'untrusted-key', keyId: s.keyId };
    else {
      const ok = crypto.verify(null, manifestBytes, crypto.createPublicKey(key.pem), Buffer.from(s.signature || '', 'base64'));
      if (!ok) throw new Error('signature is invalid — the pack was modified after signing');
      signature = { status: 'trusted', keyId: s.keyId, keyName: key.name, development: key.development, signedAt: s.signedAt };
    }
  }
  return { manifest, manifestBytes, files, signature };
}

/* Quick look without unpacking everything (catalog): manifest, signature check of the manifest, cover and
   publisher logo. File hashes are NOT verified here — readPack does that when the package is installed. */
function peekPack(bytes, trustedKeys = {}) {
  const u8 = new Uint8Array(bytes);
  let e;
  try { e = unzipSync(u8, { filter: (f) => f.name === 'manifest.json' || f.name === 'signature.json' }); } catch (x) { throw new Error('not a valid .stlp file'); }
  if (!e['manifest.json']) throw new Error('manifest.json missing — not a SemiTec package');
  const manifestBytes = Buffer.from(e['manifest.json']);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assertPackId(manifest && manifest.id);
  let signature = { status: 'unsigned' };
  if (e['signature.json']) {
    const s = JSON.parse(strFromU8(e['signature.json'])); const key = trustedKeys[s.keyId];
    if (!key) signature = { status: 'untrusted-key', keyId: s.keyId };
    else signature = crypto.verify(null, manifestBytes, crypto.createPublicKey(key.pem), Buffer.from(s.signature || '', 'base64'))
      ? { status: 'trusted', keyId: s.keyId, keyName: key.name, development: key.development } : { status: 'invalid', keyId: s.keyId };
  }
  const want = {}; if (manifest.cover) want['content/' + manifest.cover] = 'cover'; if (manifest.publisherLogo) want['content/' + manifest.publisherLogo] = 'logo';
  const imgs = {};
  if (Object.keys(want).length) {
    const x = unzipSync(u8, { filter: (f) => !!want[f.name] && f.originalSize < 600000 });
    for (const [n, d] of Object.entries(x)) imgs[want[n]] = { name: n, data: Buffer.from(d) };
  }
  return { manifest, signature, images: imgs };
}

/* write verified files to a folder (content/ prefix removed) */
function extractTo(dir, files) {
  for (const [n, data] of Object.entries(files)) {
    const rel = n.slice('content/'.length);
    const out = path.join(dir, ...rel.split('/'));
    if (!out.startsWith(path.resolve(dir) + path.sep)) throw new Error('unsafe path');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
  }
}

module.exports = { sha256, safeRel, assertPackId, keyId, generateKeyPair, passwordAccess, verifyPasswordAccess, loadTrustedKeys, buildPack, readPack, peekPack, extractTo };
