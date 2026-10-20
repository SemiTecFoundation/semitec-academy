/* Fictional course for export, progress, certificate and PDF integration tests. No production content. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { passwordAccess } = require('../../src/shared/packfmt');
const { standaloneTraining } = require('../../src/main/export');
function pdf(title = 'Academy PDF test') {
  const content = `BT /F1 20 Tf 50 240 Td (${title}) Tj 0 -65 Td (Go to page 2) Tj 0 -60 Td (Open example website) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R /Annots [7 0 R 8 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Annot /Subtype /Link /Rect [50 160 190 190] /Border [0 0 1] /Dest [4 0 R /Fit] >>',
    '<< /Type /Annot /Subtype /Link /Rect [50 100 190 130] /Border [0 0 1] /A << /S /URI /URI (https://example.org/lesson) >> >>'
  ];
  let out = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const offset = Buffer.byteLength(out); out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(n => { out += String(n).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${offset}\n%%EOF\n`; return Buffer.from(out);
}
function build() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-contract-'));
  function put(rel, value) { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value, null, 2) : value); }
  const cert = '<!doctype html><meta charset="utf-8"><title>Certificate</title><style>body{font-family:serif;padding:40px;color:#15495c}h1{font-size:34px}@page{size:A4 landscape}</style><h1>Completion certificate</h1><h2 id="name">Preview sample</h2><p id="course">Example course</p><script src="certificate.js"></script>';
  for (const dir of ['certificate', 'trainings/web/certificate']) {
    put(dir + '/index.html', cert); put(dir + '/index_preview.html', cert.replace('Preview sample', 'PREVIEW — NOT ISSUED'));
    put(dir + '/certificate.js', "window.addEventListener('message', e => { if(e.source === parent && e.data.type === 'semitec-certificate'){document.getElementById('name').textContent=e.data.data.name;document.getElementById('course').textContent=e.data.data.training;} });");
  }
  put('trainings/web/training.json', { format: 2, id: 'web', title: 'Custom presentation', runtime: { kind: 'web', entry: 'index.html' }, progress: { mode: 'manual', steps: [{ id: 'review', title: 'Review slides' }, { id: 'exercise', title: 'Do the exercise' }] }, certificate: 'certificate/index.html' });
  const webStyle = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px/1.6 system-ui;max-width:850px;margin:40px auto;padding:24px;background:#f2f7fa;color:#173749}section{background:white;padding:24px;margin:20px 0;border-radius:16px}button{font:inherit;padding:8px 18px}code{background:#e6eff3;padding:4px}</style>';
  const slides = '<h1>Custom presentation</h1><p>Fictional review material. In Academy, tick the two learning steps above after reading and completing the exercise.</p><section><h2>1. Review slides</h2><p>An AND gate outputs 1 only when both inputs are 1. A lab tests a small idea; a project combines several ideas.</p></section><section id="exercise"><h2>2. Do the exercise</h2><p>Write the four rows of the AND-gate truth table. Check your answer:</p><button onclick="document.querySelector(\'#answer\').hidden=false">Reveal answer</button><p id="answer" hidden>00 → 0; 01 → 0; 10 → 0; 11 → 1.</p></section>';
  put('trainings/web/index.html', '<!doctype html><head>' + webStyle + '<script>window.bridgeAvailableInHead = !!window.SemiTecAcademy;</script></head><body>' + slides + '</body>');
  put('trainings/web/index_preview.html', '<!doctype html><head>' + webStyle + '</head><body><p>Author preview: all sections and answers open</p>' + slides.replace('id="answer" hidden', 'id="answer"') + '</body>');
  fs.cpSync(path.join(__dirname,'demo-partner/trainings/logic-playground'), path.join(root,'trainings/bridge'), {recursive:true});
  const bridgeFile = path.join(root,'trainings/bridge/js/logic.js');
  // The same activity must also work after a folder download, without Academy's injected bridge.
  fs.writeFileSync(bridgeFile, 'window.SemiTecAcademy = window.SemiTecAcademy || {onState:function(fn){fn({state:JSON.parse(localStorage.getItem("logic-test")||"{}")});},save:function(state){localStorage.setItem("logic-test",JSON.stringify(state));},complete:function(state){this.save(state);document.getElementById("academy-state").textContent="Activity complete (standalone)";}};\n' + fs.readFileSync(bridgeFile,'utf8'));
  const bridgePreview = path.join(root,'trainings/bridge/index_preview.html');
  fs.writeFileSync(bridgePreview, fs.readFileSync(bridgePreview,'utf8').replace('<script src="js/logic.js"></script>', '<script>window.SemiTecAcademy={onState:function(fn){fn({});},save:function(){},complete:function(){document.getElementById("academy-state").textContent="Preview — progress not saved";}};</script><script src="js/logic.js"></script>'));
  put('trainings/json/training.json', { id: 'json', title: 'JSON lesson', topics: ['intro.json','practice.json'], delivery: { urlParams: false } });
  put('trainings/json/topics/intro.json', { id: 'intro', title: 'Intro', subsections: [{ id: 'read', title: 'Read', blocks: [{ type: 'text', md: 'Fictional learning material for tests.' }] }] });
  put('trainings/json/topics/practice.json', { id: 'practice', title: 'Second section', subsections: [{ id: 'apply', title: 'Apply', blocks: [{ type: 'text', md: 'This section is immediately available in the author preview. The normal learner entry follows sequential progression.' }] }] });
  const engineDir = path.join(__dirname, '../../src/engine/training');
  for (const entry of ['index.html','css','js']) fs.cpSync(path.join(engineDir, entry), path.join(root,'trainings/json',entry), { recursive:true });
  put('trainings/json/index_preview.html', standaloneTraining({ trainingDir: path.join(root,'trainings/json'), engineDir, preview:true }));
  put('trainings/json/index_offline.html', standaloneTraining({ trainingDir: path.join(root,'trainings/json'), engineDir }));
  put('labs/practice/lab.json', { title: 'Practice lab', manual: 'manual.pdf', files: 'src', steps: [{ id: 'run', title: 'Run the source', md: 'Run the sample.' }] });
  put('labs/practice/manual.pdf', pdf('Practice lab manual')); put('labs/practice/src/example.js', 'console.log("practice");'); put('labs/practice/materials/notes.txt', 'Supporting lab material');
  put('projects/project/project.json', { format:1, title:'Capstone project', brief:'brief.pdf', durationWeeks:1, weeks:[{week:1,tasks:'Complete the project'}] });
  put('projects/project/brief.pdf', pdf('Capstone project brief')); put('projects/project/src/main.js', 'console.log("project");'); put('projects/project/requirements/srs.md', '# Requirements\nBuild an example.'); put('projects/project/materials/notes.txt','Project material');
  put('readings/guide.pdf', pdf()); put('attachments/data.csv','x,y\n1,2\n');
  put('videos/design-flow.mp4',fs.readFileSync(path.join(__dirname,'fpga-starter/videos/design-flow.mp4')));
  const ids = ['json','web','bridge','practice','project','guide','video'];
  const spec = { specVersion:1, pack:{id:'org.example.contract',version:'1.1.0',title:'Contract test course',publisher:'Example Publisher',certificate:'certificate/index.html',access:{scope:'preview',password:passwordAccess('test-preview-password')}},
    trainings:[{id:'json',source:'trainings/json'},{id:'web',source:'trainings/web'},{id:'bridge',source:'trainings/bridge'}],labs:[{id:'practice',source:'labs/practice'}],projects:[{id:'project',source:'projects/project'}],readings:[{id:'guide',title:'Linked PDF guide',source:'readings/guide.pdf'}],videos:[{id:'video',title:'Design flow video',source:'videos/design-flow.mp4'}],materials:[{id:'data',title:'Project data',source:'attachments/data.csv',for:'project'}],modules:[{id:'course',title:'Course',items:ids}],schedule:{weeks:2,entries:[{week:1,items:ids.slice(0,4)},{week:2,items:ids.slice(4)}]} };
  put('pack-spec.json',spec);
  const cli=path.join(__dirname,'../../../packer/stlp.js');
  execFileSync(process.execPath,[cli,'create',path.join(root,'pack-spec.json'),'--out',root],{stdio:'pipe'});
  return {root, spec, file:path.join(root,'org.example.contract-1.1.0.stlp'), engineDir};
}
module.exports={build,pdf};
