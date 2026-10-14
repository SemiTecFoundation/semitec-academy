#!/usr/bin/env node
/* sync-engine.js — copy the training ENGINE (index.html, css/, js/) from the web training template
   into the app (src/engine/training/). Content (topics, assets) is never copied: it comes from packs.
   Usage:  npm run sync-engine [-- <path-to-training-template>]
   Default source: a checkout of the Skills repository next to this one, as
   ../../../Skills/AcademyTemplates/skills/training (the SemiTec Foundation's own layout).
   Elsewhere, pass the path: npm run sync-engine -- <path-to-skills>/AcademyTemplates/skills/training
   Skills repository: https://github.com/SemiTecFoundation/semitec-academy-skills */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const src = path.resolve(process.argv[2] || path.join(__dirname, '../../../Skills/AcademyTemplates/skills/training'));
const dst = path.join(__dirname, '../src/engine/training');
if (!fs.existsSync(path.join(src, 'js/app.js'))) {
  console.error('Training template not found at ' + src +
    '\nPass the path to a checkout of https://github.com/SemiTecFoundation/semitec-academy-skills :' +
    '\n  npm run sync-engine -- <skills>/AcademyTemplates/skills/training');
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
const hash = crypto.createHash('sha256');
function copy(rel) {
  const s = path.join(src, rel), d = path.join(dst, rel);
  if (fs.statSync(s).isDirectory()) { for (const f of fs.readdirSync(s).sort()) if (!f.startsWith('.')) copy(path.join(rel, f)); return; }
  fs.mkdirSync(path.dirname(d), { recursive: true });
  const buf = fs.readFileSync(s); fs.writeFileSync(d, buf); hash.update(rel).update(buf);
}
['index.html', 'css', 'js'].forEach(copy);
const info = { engine: 'training-engine', trainingFormat: 1, source: 'AcademyTemplates/skills/training', copiedAt: new Date().toISOString(), sha256: hash.digest('hex').slice(0, 16) };
fs.writeFileSync(path.join(dst, 'ENGINE.json'), JSON.stringify(info, null, 2));
console.log('Engine copied to src/engine/training', info);
