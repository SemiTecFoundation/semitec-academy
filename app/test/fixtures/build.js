'use strict';
/* Build self-contained fixture packages in a temporary folder for one test run. */
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const FIXTURES = __dirname;                                     // app/test/fixtures
const STLP = path.join(FIXTURES, '..', '..', '..', 'packer', 'stlp.js');
const SPECS = ['fpga-starter', 'demo-partner'];

/* -> { packs: {<pack id>: <file>}, dir } */
function build() {
  if (!fs.existsSync(STLP)) throw new Error('packer not found at ' + STLP);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-fixtures-'));
  const packDir = path.join(dir, 'packs');
  fs.mkdirSync(packDir);

  const packs = {};
  for (const name of SPECS) {
    const spec = path.join(FIXTURES, name, 'pack-spec.json');
    execFileSync(process.execPath, [STLP, 'create', spec, '--out', packDir], { stdio: 'ignore' });
  }
  for (const f of fs.readdirSync(packDir)) {
    if (f.endsWith('.stlp')) packs[f.replace(/-\d+\.\d+\.\d+\.stlp$/, '')] = path.join(packDir, f);
  }
  return { packs, dir };
}

module.exports = { build, SPECS };

if (require.main === module) {                                   // node app/test/fixtures/build.js
  const r = build();
  console.log('fixtures built in ' + r.dir);
  for (const [id, f] of Object.entries(r.packs)) console.log('  ' + id + ' -> ' + f);
}
