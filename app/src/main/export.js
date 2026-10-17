/* export.js — create learner-owned copies of installed content. Format-1 trainings are
   rendered into one self-contained HTML file; custom-web trainings keep their local folder. */
'use strict';
const fs = require('fs');
const path = require('path');

const MEDIA = /\.(svg|png|jpe?g|gif|webp|mp4|webm)$/i;
const mime = (file) => ({ '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' }[path.extname(file).toLowerCase()] || 'application/octet-stream');
const safeName = (value) => String(value || 'academy-content').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'academy-content';
const escScript = (text) => String(text).replace(/<\/script/gi, '<\\/script');
const exists = (file) => { try { return fs.statSync(file).isFile(); } catch (e) { return false; } };

function dataUri(file) { return `data:${mime(file)};base64,${fs.readFileSync(file).toString('base64')}`; }
function localFile(root, ref) {
  if (typeof ref !== 'string' || !MEDIA.test(ref) || /^(data:|https?:)/i.test(ref)) return null;
  const rel = path.posix.normalize(ref.replace(/\\/g, '/'));
  if (rel.startsWith('../') || rel.startsWith('/') || rel === '..') return null;
  const file = path.join(root, ...rel.split('/'));
  return exists(file) ? file : null;
}
function embedAssets(value, root) {
  if (Array.isArray(value)) return value.map(v => embedAssets(v, root));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, embedAssets(v, root)]));
  const file = localFile(root, value);
  return file ? dataUri(file) : value;
}
function readTheme(trainingDir, engineDir, name) {
  const local = path.join(trainingDir, 'css', 'themes', name + '.css');
  return fs.readFileSync(exists(local) ? local : path.join(engineDir, 'css', 'themes', name + '.css'), 'utf8');
}

function standaloneTraining({ trainingDir, engineDir, preview = false }) {
  const training = JSON.parse(fs.readFileSync(path.join(trainingDir, 'training.json'), 'utf8'));
  const files = { 'training.json': training };
  for (const topic of training.topics || []) files['topics/' + topic] = embedAssets(JSON.parse(fs.readFileSync(path.join(trainingDir, 'topics', topic), 'utf8')), trainingDir);
  if (typeof training.certificate === 'string' && /\.json$/i.test(training.certificate) && exists(path.join(trainingDir, training.certificate))) files[training.certificate] = embedAssets(JSON.parse(fs.readFileSync(path.join(trainingDir, training.certificate), 'utf8')), trainingDir);
  const themes = [...new Set((training.themes || ['foundation', 'midnight', 'paper']).concat(training.theme || 'foundation'))];
  let html = fs.readFileSync(path.join(engineDir, 'index.html'), 'utf8');
  html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>\s*/g, (all, href) => href.includes('themes/') ? '' : `<style>\n${fs.readFileSync(path.join(engineDir, href), 'utf8')}\n</style>\n`);
  const themeCss = themes.map(name => `<style data-theme="${name}"${name === (training.theme || 'foundation') ? '' : ' disabled'}>\n${readTheme(trainingDir, engineDir, name)}\n</style>`).join('\n');
  html = html.replace('</head>', `${themeCss}\n<link id="theme-css">\n</head>`);
  const payload = JSON.stringify({ files, themes }).replace(/<\//g, '<\\/');
  const config = `<script>window.TRAINING_DATA=${payload};window.TRAINING_CONFIG={mode:'${preview ? 'preview' : 'standalone'}',urlParams:false};</script>`;
  html = html.replace('<script src="js/md.js"></script>', config + '\n<script src="js/md.js"></script>');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (all, src) => `<script>\n${escScript(fs.readFileSync(path.join(engineDir, src), 'utf8'))}\n</script>`);
  return html;
}

// Preview files are reserved author-only assets when a password has not been entered.
const isPreview = file => /(?:^|[\\/])(?:index_preview|training-preview|certificate-preview)\.html?$/i.test(file);
function copyTree(src, dst, allowPreview) {
  fs.cpSync(src, dst, { recursive: true, filter: file => path.basename(file) !== '.manifest.json' && (allowPreview || !isPreview(file)) });
}
function prepareTraining(trainingDir, item, engineDir, allowPreview) {
  if (item.format === 1) {
    // Keep the entire editable folder, with a directly openable learner entry.
    fs.writeFileSync(path.join(trainingDir, 'index.html'), standaloneTraining({ trainingDir, engineDir }));
    if (allowPreview) fs.writeFileSync(path.join(trainingDir, 'index_preview.html'), standaloneTraining({ trainingDir, engineDir, preview: true }));
  }
}
function newDestination(targetDir, name) {
  const destination = path.join(targetDir, safeName(name));
  if (fs.existsSync(destination)) throw new Error('A folder already exists there: ' + path.basename(destination));
  return destination;
}
function copyOne(packDir, item, destination, engineDir, allowPreview) {
  fs.mkdirSync(destination, { recursive: true });
  if (item.path) {
    copyTree(path.join(packDir, item.path), destination, allowPreview);
    if (item.type === 'training') prepareTraining(destination, item, engineDir, allowPreview);
  } else {
    for (const rel of [item.file, item.poster].filter(Boolean)) copyTree(path.join(packDir, rel), path.join(destination, path.basename(rel)), allowPreview);
    for (const rel of item.assets || []) {
      const dst = path.join(destination, rel); fs.mkdirSync(path.dirname(dst), { recursive: true });
      copyTree(path.join(packDir, path.dirname(item.file), rel), dst, allowPreview);
    }
    if (item.url) fs.writeFileSync(path.join(destination, 'external-link.txt'), 'This material is hosted externally; its contents are not included in the package.\n' + item.url + '\n');
  }
}
function copyItem({ packDir, manifest, item, targetDir, engineDir, allowPreview = false }) {
  const destination = newDestination(targetDir, item.title || item.id);
  try {
    copyOne(packDir, item, destination, engineDir, allowPreview);
    for (const attachment of manifest.items.filter(x => x.for === item.id)) {
      copyOne(packDir, attachment, path.join(destination, 'academy-attachments', attachment.id), engineDir, allowPreview);
    }
    return destination;
  } catch (e) { fs.rmSync(destination, { recursive: true, force: true }); throw e; }
}
function copyPack({ packDir, manifest, engineDir, targetDir, allowPreview = false }) {
  const destination = newDestination(targetDir, manifest.title);
  try {
    copyTree(packDir, destination, allowPreview);
    for (const item of manifest.items || []) if (item.type === 'training') prepareTraining(path.join(destination, item.path), item, engineDir, allowPreview);
    const description = { ...manifest }; delete description.files; delete description.access;
    fs.writeFileSync(path.join(destination, 'academy-package.json'), JSON.stringify(description, null, 2));
    return destination;
  } catch (e) { fs.rmSync(destination, { recursive: true, force: true }); throw e; }
}
function copyItemFolder({ itemDir, item, targetDir, allowPreview = false }) {
  const destination = newDestination(targetDir, item.title || item.id);
  copyTree(itemDir, destination, allowPreview);
  return destination;
}
module.exports = { safeName, isPreview, standaloneTraining, copyPack, copyItem, copyItemFolder };
