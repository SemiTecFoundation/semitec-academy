/* versions.js — which content formats each app version understands.
   Shared by the app (to accept or refuse a pack) and by the packer (to target an app version).
   RULE: when a format changes in an incompatible way, add a new format number, add a new row
   to HISTORY for the app release that supports it, and keep old formats working as long as possible. */
'use strict';
let APP_VERSION;
try { APP_VERSION = require('../../package.json').version; }            // inside the app
catch (e) { APP_VERSION = require('./app-version.json').version; }     // bundled packer (skill scripts)

/* Each row: an app release and the format versions it can open. Newest last. */
const HISTORY = [
  {
    app: '1.0.0',
    pack: [1],        // .stlp container: manifest.json and content/ (see docs/PACKAGE-FORMAT.md)
    training: [1],    // training-template JSON (training.json, topics/*.json, certificate.json), engine "training-engine 1"
    reading: [1],     // PDF document + metadata
    lab: [1],         // lab.json: manual PDF + steps checklist + quiz
    notes: 'First release: accounts, library, trainings, readings, labs.'
  },
  {
    app: '1.1.0',
    pack: [1], training: [1], reading: [1], lab: [1],
    video: [1],       // video file (mp4/webm) or external link; watched-time tracking
    material: [1],    // any other file (PDF, image, text/code, zip …) or link
    notes: 'Sections by type, videos, other materials, pack specs (stlp create).'
  },
  {
    app: '1.2.0',
    pack: [1], training: [1], reading: [1], video: [1], material: [1],
    lab: [1, 2],      // lab format 2 = format 1 + source files ("files" in lab.json): viewer + zip download
    notes: 'Lab source files, compact lab header.'
  },
  {
    app: '1.3.0',
    pack: [1], training: [1], video: [1], material: [1], lab: [1, 2],
    reading: [1, 2],  // reading format 2 = Markdown document (+ its images); format 1 = PDF
    notes: 'SemiTec Academy, .stlp packages, Markdown readings and materials.'
  },
  {
    app: '1.4.0',
    pack: [1], training: [1], video: [1], material: [1], lab: [1, 2], reading: [1, 2],
    project: [1],     // project.json from the project-brief template: weekly plan, milestones, deliverables, brief PDF
    notes: 'Library search and filters, enrollment and study plans (package schedule), calendar, Today panel, projects, certificates.'
  },
  {
    app: '1.5.0',
    pack: [1], training: [1], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Dashboard, catalog (folders and catalog links), publishers with logos, materials attached to labs ("for"), project categories, user and application settings.'
  },
  {
    app: '1.6.0',
    pack: [1], training: [1], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Prerequisites ("prerequisite": true): optional refreshers shown before the course, not counted. Attached materials ("for") no longer count in progress. Reset progress of a package (pack page, or when removing it from My packages).'
  },
  {
    app: '1.7.0',
    pack: [1], training: [1], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Publisher feedback contact, optional package certificates, and clearer independent project plans.'
  },
  {
    app: '1.7.1',
    pack: [1], training: [1], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Projects follow My packages; removing a package stops its active plans after confirmation and clears stale plan references on sign-in.'
  },
  {
    app: '1.8.0',
    pack: [1, 2], training: [1], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Package format 2 adds a publisher-defined, accessible accent style for package details and non-training material views.'
  },
  {
    app: '1.9.0',
    pack: [1, 2], training: [1, 2], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Training format 2 is a self-contained custom web training: local HTML, CSS and JavaScript run in a sandboxed iframe and use the Academy bridge to save progress.'
  },
  {
    app: '2.0.0',
    pack: [1, 2, 3], training: [1, 2], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Package format 3 adds an optional per-package password gate. Learners can export local package files; JSON trainings export as a standalone HTML file and custom web trainings export as their local folder.'
  },
  {
    app: '2.1.0',
    pack: [1, 2, 3], training: [1, 2], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Two training formats: JSON and custom web, optional HTML certificates, manual progress, full-folder exports and mandatory course order and study plan.'
  },
  {
    app: '2.1.1',
    pack: [1, 2, 3], training: [1, 2], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'After preview-password approval, Academy opens an all-sections author preview for trainings; normal tracked study remains separately available.'
  },
  {
    app: '2.1.2',
    pack: [1, 2, 3], training: [1, 2], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Keeps the 2.1.1 author-preview route and uses an isolated Electron test profile on every release platform.'
  },
  {
    app: '2.1.3',
    pack: [1, 2, 3], training: [1, 2], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Keeps 2.1.2 compatibility and makes the PDF clipboard test work when the operating system has an empty clipboard entry.'
  },
  {
    app: '2.2.0',
    pack: [1, 2, 3], training: [1, 2], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Open package publishing, with a Foundation catalog and selectable catalog sources.'
  },
  {
    app: '2.2.1',
    pack: [1, 2, 3], training: [1, 2], video: [1], material: [1], lab: [1, 2], reading: [1, 2], project: [1],
    notes: 'Accepts a package renamed to .zip (file picker, drag and drop, catalog folders); the content checks are unchanged.'
  }
];

function cmp(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
/* The row for an app version (the newest row not newer than it). */
function capabilities(appVersion = APP_VERSION) {
  let row = null;
  for (const r of HISTORY) if (cmp(r.app, appVersion) <= 0) row = r;
  return row;
}
/* formatsUsed: { pack: 1, training: 1, ... } -> lowest app version able to open it, or null. */
function minAppFor(formatsUsed) {
  for (const r of HISTORY) {
    if (Object.entries(formatsUsed).every(([k, v]) => (r[k] || []).includes(v))) return r.app;
  }
  return null;
}
/* Can THIS app open the manifest? -> { ok, reasons[] } */
function supports(manifest, appVersion = APP_VERSION) {
  const caps = capabilities(appVersion), reasons = [];
  if (!caps) return { ok: false, reasons: ['unknown app version ' + appVersion] };
  if (!caps.pack.includes(manifest.format)) reasons.push(`package format ${manifest.format} is not supported (this app reads ${caps.pack.join(', ')})`);
  if (manifest.minAppVersion && cmp(manifest.minAppVersion, appVersion) > 0) reasons.push(`needs app version ${manifest.minAppVersion} or newer (this is ${appVersion})`);
  if (!Array.isArray(manifest.items)) return { ok: false, reasons: reasons.concat('manifest.items must be an array of material descriptions') };
  for (const [index, it] of manifest.items.entries()) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) { reasons.push(`manifest.items[${index}] must be an object`); continue; }
    const ok = (caps[it.type] || []).includes(it.format);
    if (!ok) reasons.push(`item "${it.id}" uses ${it.type} format ${it.format}, not supported by this app`);
  }
  return { ok: reasons.length === 0, reasons };
}
const CURRENT = { pack: 3, training: 2, reading: 1, lab: 1, video: 1, material: 1, project: 1 };

module.exports = { APP_VERSION, HISTORY, CURRENT, cmp, capabilities, minAppFor, supports };
