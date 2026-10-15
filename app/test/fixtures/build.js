'use strict';
/* build.js — builds the end-to-end suite's fixture packages with a throwaway signing key.
   Nothing here is committed: the key and the built packages live in a temp folder for one run.
   That keeps the repository free of packages signed with the production key (which would install
   in any student's app as verified SemiTec content) and lets anyone run the suite with no secret.
   The fixture sources are self-contained, so no second repository is needed. */
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const FIXTURES = __dirname;                                     // app/test/fixtures
const STLP = path.join(FIXTURES, '..', '..', '..', 'packer', 'stlp.js');
const SPECS = ['fpga-starter', 'demo-partner'];

/* -> { packs: {<pack id>: <file>}, trustedDir, dir } */
function build() {
  if (!fs.existsSync(STLP)) throw new Error('packer not found at ' + STLP);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-fixtures-'));
  const trustedDir = path.join(dir, 'trusted-keys'), packDir = path.join(dir, 'packs');
  fs.mkdirSync(trustedDir); fs.mkdirSync(packDir);

  /* a key for this run only; --name without --dev so packs read as Verified, like a release */
  execFileSync(process.execPath, [STLP, 'keygen', dir, '--name', 'SemiTec Test Key'], { stdio: 'ignore' });
  const key = path.join(dir, 'semitec-test-key.key.pem');
  if (!fs.existsSync(key)) throw new Error('keygen did not write ' + key);
  for (const f of fs.readdirSync(dir)) {                        // public halves only -> the app trusts them
    if (/\.(pub\.pem|json)$/.test(f)) fs.copyFileSync(path.join(dir, f), path.join(trustedDir, f));
  }

  const packs = {};
  for (const name of SPECS) {
    const spec = path.join(FIXTURES, name, 'pack-spec.json');
    execFileSync(process.execPath, [STLP, 'create', spec, '--key', key, '--out', packDir], { stdio: 'ignore' });
  }
  for (const f of fs.readdirSync(packDir)) {
    if (f.endsWith('.stlp')) packs[f.replace(/-\d+\.\d+\.\d+\.stlp$/, '')] = path.join(packDir, f);
  }
  return { packs, trustedDir, dir };
}

module.exports = { build, SPECS };

if (require.main === module) {                                   // node app/test/fixtures/build.js
  const r = build();
  console.log('fixtures built in ' + r.dir);
  for (const [id, f] of Object.entries(r.packs)) console.log('  ' + id + ' -> ' + f);
}
