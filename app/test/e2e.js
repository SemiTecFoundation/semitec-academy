/* e2e.js — end-to-end test of the desktop app with Playwright (Electron).
   Runs a fresh profile: first-run setup, account creation, pack install (signed), training / reading / lab
   progress, logout / login, second user, tampered and unsigned packs, restart.
   Usage:  npm test            (Linux CI: xvfb-run -a npm test)
   Env:    STPACK=path/to/pack.stlp (default: fixtures/packs/org.semitec.fpga-starter-1.6.0.stlp)
           SHOTS=folder for screenshots (default: test/screenshots) */
'use strict';
const { _electron: electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const { unzipSync, zipSync } = require('fflate');

const APP = path.join(__dirname, '..');
/* the test's own fixture packages — not shipped course content; see fixtures/README.md */
const PACK = path.resolve(process.env.STPACK || path.join(__dirname, 'fixtures', 'packs', 'org.semitec.fpga-starter-1.6.0.stlp'));
const SHOTS = path.resolve(process.env.SHOTS || path.join(__dirname, 'screenshots'));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-test-'));
fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function launch() {
  const app = await electron.launch({
    /* E2E_EXECUTABLE=<installed / unpacked app binary> tests a built installer instead of the sources */
    executablePath: process.env.E2E_EXECUTABLE || require('electron'),
    args: process.env.E2E_EXECUTABLE ? ['--no-sandbox'] : ['--no-sandbox', APP], cwd: APP,
    env: Object.assign({}, process.env, { HOME, XDG_CONFIG_HOME: path.join(HOME, '.config'), XDG_DOCUMENTS_DIR: path.join(HOME, 'Documents') })
  });
  const win = await app.firstWindow();
  global.__win = win;
  await win.setViewportSize({ width: 1320, height: 860 }).catch(() => {});
  win.on('pageerror', e => { console.log('  ! page error: ' + e.message); failures++; });
  win.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) console.log('  ! console: ' + m.text()); });
  return { app, win };
}
const shot = (win, name) => win.screenshot({ path: path.join(SHOTS, name + '.png') });
const sendPack = (app, file) => app.evaluate(({ BrowserWindow }, f) => BrowserWindow.getAllWindows()[0].webContents.send('open-pack', f), file);

(async () => {
  console.log('Profile: ' + HOME + '\nPack: ' + PACK);
  let { app, win } = await launch();

  console.log('1. First run');
  await win.waitForSelector('text=Welcome to SemiTec Academy');
  await shot(win, '01-setup');
  await win.click('text=Continue →');

  console.log('2. Create account');
  await win.fill('#f-username', 'anna');
  await win.click('button:has-text("Continue")');
  await win.waitForSelector('#f-fullname');
  await shot(win, '02-register');
  await win.fill('#f-fullname', 'Anna Petrosyan');
  await win.fill('#f-password', 'secret1');
  await win.fill('#f-password2', 'secret1');
  await win.click('button:has-text("Create account")');
  await win.waitForSelector('.dash-card.welcome');
  check(await win.isVisible('.ui-nav a.active:has-text("Dashboard")'), 'account created, the dashboard is the main page');
  await shot(win, '03-dashboard-empty');
  await win.click('.ui-nav a:has-text("Library")');
  await win.waitForSelector('text=No course packs yet');
  check(true, 'empty library shown');
  await shot(win, '03-empty-library');

  console.log('3. Install signed pack');
  await sendPack(app, PACK);
  await win.waitForSelector('.modal >> text=Add course pack');
  await shot(win, '04-install-dialog');
  await win.click('.modal button:has-text("Install")');
  await win.waitForSelector('.hero h1');
  check((await win.textContent('.hero h1')) === 'FPGA Starter Track', 'pack page opened after install');
  const secs = await win.$$eval('.module.sec h2', n => n.map(x => x.textContent));
  check(secs.length === 6 && /Trainings \(2\)/.test(secs[0]) && /Other materials/.test(secs[4]) && /Projects \(1\)/.test(secs[5]), 'sections by type: ' + secs.join(' | '));
  await shot(win, '05-pack');
  const pre = await win.evaluate(() => ({ g: !!document.querySelector('.module.prereq'), rows: [...document.querySelectorAll('.module.prereq .item-title')].map(n => n.textContent), line: document.querySelector('.hero .progress-line').textContent }));
  check(pre.g && pre.rows.length === 1 && /Digital logic refresher/.test(pre.rows[0]) && /not counted/.test(pre.rows[0]) && / \/ 10 completed/.test(pre.line) && /prerequisites not counted/.test(pre.line),
    'prerequisites shown first as "not counted"; progress counts 10 of 15 items (no prerequisite, no attached materials): ' + pre.line);
  await win.click('.seg button:has-text("Course order")');
  check(await win.isVisible('.module h2:has-text("Start here")'), 'course-order view shows modules');
  const nest = await win.evaluate(() => [...document.querySelectorAll('.item-row.sub .item-title')].map(n => n.textContent));
  check(nest.length === 4 && nest.some(t => /Lab 1 starter files/.test(t)), 'course order: materials shown under their lab (' + nest.length + ' attached rows)');
  await shot(win, '05b-pack-course-order');
  await win.click('.seg button:has-text("By type")');

  console.log('4. Training (engine in iframe, progress via postMessage)');
  await win.click('.item-row:has-text("How interactive trainings work")');
  const fr = win.frameLocator('.item-body iframe');
  await fr.locator('.pager-next').waitFor();
  await sleep(500);
  await fr.locator('.pager-next').click();
  await sleep(800);
  await shot(win, '06-training');
  let tp = await win.evaluate(() => window.api.progress.get('org.semitec.fpga-starter', 'feature-tour'));
  check(tp && tp.state && tp.state.topics && tp.state.topics.welcome && tp.state.topics.welcome.visited.length >= 2, 'training progress saved in DB (visited pages)');
  check(tp && tp.state.user && tp.state.user.name === 'Anna Petrosyan', 'training received the user from the app');

  console.log('5. Reading (pdf.js)');
  await win.click('.item-bar a:has-text("FPGA Starter Track")');
  await win.click('.item-row:has-text("ECC-protected")');
  await win.waitForSelector('.pdfv-page canvas');
  await sleep(1800);
  await shot(win, '07-reading');
  /* hiding the outline keeps the pages centred */
  await win.click('.pdfv-bar button[title="Contents of the document"]');
  await sleep(600);
  const centre = await win.evaluate(() => { const sc = document.querySelector('.pdfv-scroll').getBoundingClientRect(), pg = document.querySelector('.pdfv-page').getBoundingClientRect(); return Math.abs((pg.left + pg.right) / 2 - (sc.left + sc.right) / 2); });
  check(centre < 12, 'PDF stays centred when the outline is hidden (offset ' + Math.round(centre) + ' px)');
  await win.click('.pdfv-bar button[title="Contents of the document"]');
  await win.click('.pdfv-bar button[title="Next page"]');
  await sleep(1800);
  const pages = await win.$$eval('.pdfv-page', n => n.length);
  check(pages > 1, 'PDF opened with ' + pages + ' pages');
  await win.click('.item-bar a:has-text("FPGA Starter Track")');   // leaving saves the reading state
  await sleep(500);
  let rp = await win.evaluate(() => window.api.progress.get('org.semitec.fpga-starter', 'ecc-brief'));
  check(rp && rp.state.seen.length >= 2 && rp.state.last === 2, 'reading progress saved (seen ' + (rp && rp.state.seen) + ', last page ' + (rp && rp.state.last) + ')');

  console.log('5b. Markdown reading');
  await win.click('.item-row:has-text("Vivado quick reference")');
  await win.waitForSelector('.md-doc table');
  await sleep(800);
  const mdInfo = await win.evaluate(() => ({ outline: document.querySelectorAll('.mdv-outline a').length, imgs: [...document.querySelectorAll('.md-doc img')].filter(i => i.complete && i.naturalWidth > 0).length, code: document.querySelectorAll('.md-doc pre .pre-head').length }));
  check(mdInfo.outline >= 5 && mdInfo.code >= 2, `Markdown rendered: ${mdInfo.outline} outline entries, ${mdInfo.code} code blocks`);
  await win.evaluate(() => { const s = document.querySelector('.mdv-scroll'); s.scrollTop = s.scrollHeight; });
  await sleep(900);
  check(mdInfo.imgs >= 1 || await win.evaluate(() => [...document.querySelectorAll('.md-doc img')].some(i => i.naturalWidth > 0)), 'Markdown images loaded from the pack');
  await shot(win, '07b-markdown');
  await win.click('.item-bar a:has-text("FPGA Starter Track")');
  await sleep(400);
  const mp2 = await win.evaluate(() => window.api.progress.get('org.semitec.fpga-starter', 'vivado-quick-reference'));
  check(mp2 && mp2.completedAt && mp2.percent === 100, 'Markdown reading completed after scrolling to the end');

  console.log('6. Lab (manual, steps, quiz)');
  await win.click('.item-row:has-text("Lab 1: A 4-bit")');
  await win.waitForSelector('.lab-tabs');
  await sleep(1200);
  await shot(win, '08-lab-manual');
  await win.click('.lab-tabs-in button:has-text("Steps")');
  const checks = await win.$$('.step .check');
  for (const c of checks) await c.click();
  await shot(win, '09-lab-steps');
  await sleep(1300);
  await win.evaluate(() => { const p = document.querySelector('.lab-pane'); p.scrollTop = 400; p.dispatchEvent(new Event('scroll')); });
  await sleep(500);
  check(await win.evaluate(() => document.querySelector('.lab-wrap').classList.contains('compact')), 'lab header becomes compact when scrolling down');
  await shot(win, '09b-lab-compact');
  await win.click('.lab-tabs-in button:has-text("Files")');
  await win.waitForSelector('.files-view .text-view .ln');
  const nfiles = await win.$$eval('.files-item', n => n.length);
  check(nfiles === 6, 'Files tab lists the lab source files (' + nfiles + ')');
  await win.click('.files-item:has-text("tb_shift4.sv")');
  await sleep(400);
  check((await win.$$('.files-view .text-view .ln')).length > 10, 'source file shown with line numbers');
  await shot(win, '09c-lab-files');
  await win.click('.lab-tabs-in button:has-text("Materials")');
  await win.waitForSelector('.lab-mat');
  check((await win.$$('.lab-mat')).length === 3, 'lab Materials tab lists the 3 attached materials');
  await shot(win, '09d-lab-materials');
  await win.click('.lab-tabs-in button:has-text("Files")');
  await win.waitForSelector('.files-actions button');
  const zipOut = path.join(HOME, 'lab-files.zip');
  await app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, zipOut);
  await win.click('.files-actions button');
  await sleep(800);
  const zipped = fs.existsSync(zipOut) ? Object.keys(unzipSync(new Uint8Array(fs.readFileSync(zipOut)))) : [];
  check(zipped.length === 6 && zipped.some(n => n.endsWith('src/rtl/shift4.sv')), 'Download all: zip with ' + zipped.length + ' files');
  await win.click('.lab-tabs-in button:has-text("Check quiz")');
  /* answer: q1 option 0, q2 options 0+1, q3 order already correct after sorting, q4 option 0 */
  /* the answer key comes from the pack under test, so the test needs no second repository checked out */
  const packFiles = unzipSync(new Uint8Array(fs.readFileSync(PACK)));
  const labKey = Object.keys(packFiles).find(n => n.endsWith('labs/lab-01-shift-register/lab.json'));
  check(!!labKey, 'lab.json found in the pack');
  const lab = JSON.parse(new TextDecoder().decode(packFiles[labKey]));
  const qs = await win.$$('.quiz .question');
  for (let i = 0; i < qs.length; i++) {
    const q = lab.quiz.questions[i];
    if (q.type === 'order') await qs[i].evaluate(n => { const l = n.querySelector('.sortlist'); [...l.children].sort((a, b) => a.dataset.id - b.dataset.id).forEach(li => l.appendChild(li)); });
    else for (const c of q.correct) await (await qs[i].$(`input[value="${c}"]`)).check();
  }
  await win.click('.quiz .quiz-bar .btn.primary');
  await sleep(600);
  await shot(win, '10-lab-quiz');
  let lp = await win.evaluate(() => window.api.progress.get('org.semitec.fpga-starter', 'lab-01-shift-register'));
  check(lp && lp.percent === 100 && lp.completedAt, 'lab completed (100 %)');

  console.log('6b. Video and other materials');
  await win.click('.item-bar a:has-text("FPGA Starter Track")');
  await win.click('.item-row:has-text("The FPGA design flow")');
  await win.waitForSelector('video');
  await win.evaluate(() => { const v = document.querySelector('video'); v.muted = true; return v.play(); });
  await sleep(4500);
  await shot(win, '10b-video');
  await win.click('.item-bar a:has-text("FPGA Starter Track")');
  await sleep(400);
  let vp = await win.evaluate(() => window.api.progress.get('org.semitec.fpga-starter', 'design-flow'));
  check(vp && vp.state.watched.filter(Boolean).length >= 2 && vp.state.position > 2, 'video watched-time saved (' + (vp && vp.percent) + '%, at ' + (vp && Math.round(vp.state.position)) + ' s)');
  await win.click('.item-row:has-text("Example constraints")');
  await win.waitForSelector('.text-view .ln');
  check((await win.$$('.text-view .ln')).length > 5, 'text material shown with line numbers');
  await shot(win, '10c-material-text');
  await win.click('.item-bar a:has-text("FPGA Starter Track")');
  await win.click('.item-row:has-text("Lab 1 starter files")');
  await win.waitForSelector('.file-card');
  await shot(win, '10d-material-file');
  await win.click('.item-bar a:has-text("FPGA Starter Track")');
  await win.click('.item-row:has-text("Board overview")');
  await win.waitForSelector('.image-box img');
  await sleep(300);
  const mp = await win.evaluate(() => window.api.progress.get('org.semitec.fpga-starter', 'board-overview'));
  check(mp && mp.completedAt, 'image material marked as done');

  console.log('6c. Enrollment, study plan, Today, calendar');
  const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  await win.click('.item-bar a:has-text("FPGA Starter Track")');
  await win.waitForSelector('.plan-box');
  await win.click('.plan-box button:has-text("Enroll")');
  await win.waitForSelector('.modal input[type=date]');
  await win.fill('.modal input[type=date]', ago(23));                 // started 23 days ago -> week 4 of 7
  await sleep(500); await shot(win, '10e-enroll');
  await win.click('.modal button:has-text("Enroll")');
  await win.waitForSelector('.plan-box.on');
  check(/week 4 of 7/.test(await win.textContent('.plan-box.on')), 'enrolled: plan box shows ' + (await win.textContent('.plan-box.on')).replace(/\s+/g, ' ').trim());
  await win.click('.seg button:has-text("Study plan")');
  await win.waitForSelector('.plan-entry');
  const pe = await win.evaluate(() => ({ n: document.querySelectorAll('.plan-entry').length, late: document.querySelectorAll('.plan-entry.s-overdue').length, cur: document.querySelectorAll('.plan-entry.s-current').length, topics: document.querySelectorAll('.plan-topics li').length }));
  check(pe.n === 5 && pe.late >= 1 && pe.topics === 2, `study plan: ${pe.n} blocks, ${pe.late} overdue, ${pe.cur} current, ${pe.topics} training-topic weeks`);
  await sleep(500); await shot(win, '10f-study-plan');
  await win.click('.seg button:has-text("By type")');
  await win.click('.ui-nav a:has-text("Dashboard")');
  await win.waitForSelector('.today .today-card');
  check(/overdue/.test(await win.textContent('.today')), 'dashboard: Today panel lists overdue work');
  check((await win.$$('.cont-row')).length >= 1 && (await win.$$('.dash-tile')).length === 5, 'dashboard: tiles and Continue learning');
  await sleep(500); await shot(win, '10g-dashboard');
  await win.setViewportSize({ width: 1000, height: 800 }); await sleep(400);
  const ov = await win.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('.dash-card, .dash-tile')].filter(n => n.getBoundingClientRect().right > W + 1).length + (document.documentElement.scrollWidth > W + 1 ? 100 : 0); });
  const sr = await win.evaluate(() => {
    const long = ' — Week 1: read the specification, write the RTL of the controller, simulate every corner case and write the report';
    const rows = [...document.querySelectorAll('.soon-row .grow .soon-title, .today-list li > :first-child')];
    rows.forEach(n => { n.textContent += long; });
    const box = n => n.closest('.grow') || n;
    return rows.map(n => { const b = box(n), cs = getComputedStyle(b); return { scrolls: b.scrollWidth > b.clientWidth + 1 && cs.overflowX === 'auto', oneLine: n.getBoundingClientRect().height < 40, inside: b.getBoundingClientRect().right <= document.documentElement.clientWidth }; });
  });
  check(sr.length >= 2 && sr.every(r => r.scrolls && r.oneLine && r.inside), `dashboard: long titles stay on one line and scroll sideways inside their card (${sr.length} rows)`);
  await shot(win, '10g2-dashboard-narrow');
  await win.setViewportSize({ width: 1320, height: 860 });
  check(ov === 0, 'dashboard cards stay inside the window at 1000 px');
  await win.click('.ui-nav a:has-text("Library")');
  await win.waitForSelector('.pack-card');
  await win.fill('.lib-search', 'shift register');
  await sleep(200);
  check((await win.$$('.pack-card')).length === 1, 'search finds the course by an item title');
  await win.fill('.lib-search', 'quantum computing');
  await sleep(200);
  check(await win.isVisible('text=Nothing found'), 'search without results shows "Nothing found"');
  await win.fill('.lib-search', '');
  await win.click('.lib-tools .seg button[data-k="finished"]');
  check(!(await win.$('.pack-card')), 'filter "Finished" hides a course in progress');
  await win.click('.lib-tools .seg button[data-k="progress"]');
  check((await win.$$('.pack-card')).length === 1, 'filter "In progress" shows the enrolled course');
  await win.click('.lib-tools .seg button[data-k="all"]');
  await win.click('.ui-nav a:has-text("Calendar")');
  await win.waitForSelector('.cal-week');
  await sleep(300);
  const nev = await win.$$eval('.cal-ev', n => n.length);
  check(nev >= 3, 'calendar shows ' + nev + ' plan bars this month');
  await sleep(500); await shot(win, '10h-calendar');

  console.log('6d. Project: enroll, weekly plan, notes, brief');
  await win.click('.ui-nav a:has-text("Projects")');
  await win.waitForSelector('.proj-card');
  await win.click('.seg button:has-text("My projects")');                /* bug fix: an empty "My projects" tab */
  check(await win.getAttribute('.seg button[data-k="mine"]', 'aria-selected') === 'true' && !(await win.$('.proj-card')) && await win.isVisible('text=You are not enrolled in a project yet'), 'My projects (empty) is selected and says so');
  await win.click('.seg button:has-text("All projects")');
  check(await win.getAttribute('.seg button[data-k="all"]', 'aria-selected') === 'true' && (await win.$$('.proj-card')).length === 1, 'All projects selected again and listed');
  await win.click('.cat-chip:has-text("Diploma")');
  check((await win.$$('.proj-card')).length === 1 && /Diploma/.test(await win.textContent('.proj-card .cat-badge')), 'category filter "Diploma"');
  await sleep(500); await shot(win, '10i-projects');
  await win.click('.proj-card');
  await win.waitForSelector('.proj-head');
  await win.click('.proj-head button:has-text("Enroll")');
  await win.waitForSelector('.modal input[type=date]');
  await win.fill('.modal input[type=date]', ago(15));                  // week 3 of 30
  await win.click('.modal button:has-text("Enroll")');
  await win.waitForSelector('.proj-head .plan-box.on');
  check(/week 3 of 30/.test(await win.textContent('.proj-head')), 'project enrolled, week 3 of 30');
  await win.waitForSelector('.week-row');
  const boxes = await win.$$('.week-row .week-ck input');
  await boxes[0].check(); await sleep(250);
  await (await win.$$('.week-row .week-ck input'))[1].check(); await sleep(250);
  await win.click('.week-row.s-current summary');
  await win.fill('.week-row.s-current textarea', 'Warm-up 3 testbench written; SVA next.');
  await sleep(1000);
  const pj = await win.evaluate(() => window.api.progress.get('org.semitec.fpga-starter', 'ecc-sensor-memory'));
  check(pj && pj.state.weeks['1'] && pj.state.weeks['2'] && /SVA/.test(pj.state.notes['3'] || '') && pj.percent === 7, 'project weeks ticked and note saved (' + (pj && pj.percent) + '%)');
  check((await win.$$('.week-row.s-overdue')).length === 0 && (await win.$$('.week-row.s-current')).length === 1, 'ticked weeks are not overdue; one current week');
  await sleep(500); await shot(win, '10j-project-plan');
  await win.evaluate(() => { const b = document.querySelector('.proj-body'); b.scrollTop = 30; b.dispatchEvent(new Event('scroll')); });
  await sleep(300);
  await win.evaluate(() => { const b = document.querySelector('.proj-body'); b.scrollTop = 600; b.dispatchEvent(new Event('scroll')); });
  await sleep(350);
  const hc = await win.evaluate(() => ({ on: document.querySelector('.proj-view').classList.contains('compact'), h: document.querySelector('.proj-top-wrap').offsetHeight }));
  await shot(win, '10j2-project-compact');
  await win.evaluate(() => { const b = document.querySelector('.proj-body'); b.scrollTop = 450; b.dispatchEvent(new Event('scroll')); });
  await sleep(350);
  const hm = await win.evaluate(() => document.querySelector('.proj-view').classList.contains('compact'));
  await win.evaluate(() => { const b = document.querySelector('.proj-body'); b.scrollTop = 0; b.dispatchEvent(new Event('scroll')); });
  await sleep(350);
  const he = await win.evaluate(() => ({ on: document.querySelector('.proj-view').classList.contains('compact'), h: document.querySelector('.proj-top-wrap').offsetHeight }));
  check(hc.on && hm && !he.on && hc.h < he.h - 40, `project header compact while scrolling (${hc.h} px), still compact half-way up, full again only at the top (${he.h} px)`);
  await win.click('.proj-tabs button:has-text("Overview")');
  await win.waitForSelector('.overview .ptable');
  await sleep(500); await shot(win, '10k-project-overview');
  await win.click('.proj-tabs button:has-text("Learning")');
  check((await win.$$('.ptable tr.grp')).length >= 3, 'learning path grouped');
  await win.click('.proj-tabs button:has-text("Brief")');
  await win.waitForSelector('.pdfv-page canvas');
  check(true, 'project brief PDF opens');
  await win.click('.proj-tabs button:has-text("Plan")');
  const td = await win.evaluate(() => window.api.plan.today());
  check(td.projects.length === 1 && td.projects[0].thisWeek && td.projects[0].thisWeek.week === 3 && td.courses.length === 1, 'Today: course + project week 3 (' + td.counts.overdue + ' overdue, ' + td.counts.current + ' current)');

  console.log('6e. Certificates');
  await win.evaluate(async () => {     /* finish the second training and everything else of the package */
    const P = await window.api.packs.get('org.semitec.fpga-starter');
    for (const it of P.manifest.items) {
      if (P.progress[it.id] && P.progress[it.id].completedAt) continue;
      const st = it.type === 'training' ? { completedAt: new Date().toISOString(), percent: 100, topics: { basics: { passed: true, bestScore: 0.9 }, practice: { passed: true, bestScore: 1 } } }
        : it.type === 'project' ? (await window.api.progress.get(P.manifest.id, it.id)).state : { completed: true };
      if (it.type === 'project') { for (let w = 1; w <= 30; w++) st.weeks[String(w)] = new Date().toISOString(); }
      await window.api.progress.set(P.manifest.id, it.id, it.type, st, 100, true);
    }
  });
  await win.click('.ui-nav a:has-text("Certificates")');
  await win.waitForSelector('.cert-card');
  const certs = await win.$$eval('.cert-card .cm-kind', n => n.map(x => x.textContent));
  check(certs.includes('Course certificate') && certs.filter(c => c === 'Training certificate').length >= 1, 'certificates: ' + certs.join(', '));
  await sleep(500); await shot(win, '10l-certificates');
  await win.click('.cert-card.k-package');
  await win.waitForSelector('.cert-view .certificate');
  check(/Anna Petrosyan/.test(await win.textContent('.cert-view .certificate')), 'course certificate shows the student name');
  await sleep(500); await shot(win, '10m-certificate');
  const pdfOut = path.join(HOME, 'cert.pdf');
  await app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, pdfOut);
  await win.click('.modal button:has-text("Save as PDF")');
  await sleep(1500);
  check(fs.existsSync(pdfOut) && fs.readFileSync(pdfOut).slice(0, 4).toString() === '%PDF', 'certificate saved as PDF (' + (fs.existsSync(pdfOut) ? Math.round(fs.statSync(pdfOut).size / 1024) + ' KB' : 'missing') + ')');
  await win.click('.modal button:has-text("Close")');

  console.log('6f. Catalog: folder and catalog link, install from another publisher');
  const DIST = path.dirname(PACK);
  const CAT = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-cat-'));
  /* only the two packs these checks are about — one installed, one from another publisher — so that
     further fixture packs cannot change the counts below */
  const CAT_IDS = ['org.semitec.fpga-starter', 'org.example.mbist-track'];
  const catPacks = fs.readdirSync(DIST).filter(f => f.endsWith('.stlp') && CAT_IDS.some(id => f.startsWith(id + '-')));
  for (const f of catPacks) fs.copyFileSync(path.join(DIST, f), path.join(CAT, f));
  check(catPacks.length === CAT_IDS.length, 'the 2 catalog packs are built in dist/ (' + catPacks.join(', ') + ')');
  require('child_process').execFileSync(process.execPath, [path.join(APP, '..', 'packer', 'stlp.js'), 'catalog', CAT, '--name', 'Test catalog'], { stdio: 'ignore' });
  const http = require('http');
  const srv = http.createServer((q, r) => { const f = path.join(CAT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(CAT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': f.endsWith('.json') ? 'application/json' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const catUrl = 'http://127.0.0.1:' + srv.address().port + '/catalog.json';
  await win.click('.ui-nav a:has-text("Catalog")');
  await win.waitForSelector('text=No catalog sources yet');
  check(true, 'catalog without sources explains how to add them');
  await win.evaluate((u) => window.api.catalog.addUrl(u, 'Test catalog'), catUrl);
  const viaUrl = await win.evaluate(() => window.api.catalog.list(true));
  check(viaUrl.entries.length === 2 && viaUrl.entries.every(e => e.download && e.cover) && !viaUrl.problems.length, 'catalog link: 2 packages with covers (' + viaUrl.problems.map(p => p.message).join('; ') + ')');
  await win.evaluate((d) => window.api.catalog.addFolderPath(d), CAT);
  await win.click('.ui-nav a:has-text("Dashboard")'); await win.click('.ui-nav a:has-text("Catalog")');
  await win.waitForSelector('.cat-card');
  const cards = await win.$$eval('.cat-card', n => n.map(x => x.textContent));
  check(cards.length === 2 && cards.some(t => /Installed/.test(t) && /FPGA Starter/.test(t)) && cards.some(t => /Not installed/.test(t) && /Demo Partner Company/.test(t)), 'catalog lists installed and new packages with publishers');
  await sleep(400); await shot(win, '10n-catalog');
  await win.click('.cat-card:has-text("Memory Test") button:has-text("Install")');
  await win.waitForSelector('.modal button:has-text("Install")');
  await win.click('.modal button:has-text("Install")');
  await win.waitForSelector('.hero h1:has-text("Memory Test")');
  check(true, 'package installed from the catalog');
  srv.close();

  console.log('7. Library progress, publishers, settings');
  await win.click('.ui-nav a:has-text("Library")');
  await win.waitForSelector('.pack-card');
  await win.selectOption('.lib-tools select[aria-label="Publisher"]', { label: 'Demo Partner Company (1)' });
  check((await win.$$('.pack-card')).length === 1 && /Demo Partner Company/.test(await win.textContent('.pack-card .pub-line')), 'library: filter by publisher');
  await win.selectOption('.lib-tools select[aria-label="Publisher"]', 'any');
  await shot(win, '11-library');

  console.log('7b. Groups of packages');
  await win.click('.group-chip.new');
  await win.fill('.modal input[aria-label="Group name"]', 'Semester 1');
  await win.fill('.modal textarea', 'Digital design and memory test, autumn');
  await win.click('.modal .pick-row:has-text("FPGA Starter") input'); await win.click('.modal .pick-row:has-text("Memory Test") input');
  await win.click('.modal button:has-text("Create group")');
  await win.waitForSelector('.group-head h2:has-text("Semester 1")');
  check((await win.$$('.pack-card')).length === 2, 'group "Semester 1" with 2 packages');
  await win.click('.group-chip.new');
  await win.fill('.modal input[aria-label="Group name"]', 'FPGA only');
  await win.click('.modal .pick-row:has-text("FPGA Starter") input');
  await win.click('.modal button:has-text("Create group")');
  await win.waitForSelector('.group-head h2:has-text("FPGA only")');
  check((await win.$$('.pack-card')).length === 1, 'group "FPGA only" with 1 package — a package can be in several groups');
  const dupe = await win.evaluate(() => window.api.groups.save({ name: 'fpga ONLY', packs: [] }).then(() => 'saved', e => e.message));
  check(/already have a group/.test(dupe), 'group names are unique per user');
  await win.click('.group-chip[data-k="all"]');
  await win.fill('.lib-search', 'autumn');
  await sleep(200);
  const gs = await win.$$eval('.group-bar .group-chip', n => n.map(x => x.textContent));
  check((await win.$$('.pack-card')).length === 2 && gs.some(t => /Semester 1/.test(t)) && !gs.some(t => /FPGA only/.test(t)), 'search by group description finds the group and its packages');
  await win.fill('.lib-search', '');
  await sleep(300); await shot(win, '11c-library-groups');
  await win.click('.lib-tabs button[data-k="explore"]');
  await win.waitForSelector('.pack-card');
  check((await win.$$('.pack-card .status.mine')).length === 2, 'Explore marks packages that are in My packages');
  await win.click('.lib-tabs button[data-k="mine"]');
  check(/\d+%/.test(await win.textContent('.pack-card:has-text("FPGA Starter") .progress-line')), 'library card shows progress');
  await win.click('.ui-nav a:has-text("Projects")');
  await win.waitForSelector('.proj-card');
  check(await win.getAttribute('.seg button[data-k="mine"]', 'aria-selected') === 'true' && (await win.$$('.proj-card')).length === 1, 'Projects opens on "My projects" when enrolled');
  await win.click('.seg button:has-text("All projects")');
  check((await win.$$('.proj-card')).length === 2, 'projects of both publishers listed');
  await sleep(400); await shot(win, '11b-projects-all');
  await win.click('.ui-nav a:has-text("Settings")');
  await win.waitForSelector('.set-tabs');
  check(await win.isVisible('text=Profile') && !(await win.isVisible('text=Data on this computer')), 'settings: My account tab');
  await win.click('.set-tabs a:has-text("Application")');
  await win.waitForSelector('text=Data on this computer');
  check((await win.$$('.src-row')).length === 2, 'settings: Application tab lists the 2 catalog sources');
  await shot(win, '12-settings');

  console.log('8. Tampered and unsigned packs are refused');
  const files = unzipSync(new Uint8Array(fs.readFileSync(PACK)));
  const k = Object.keys(files).find(n => n.endsWith('training.json'));
  files[k] = new TextEncoder().encode(new TextDecoder().decode(files[k]).replace('Feature Tour', 'Hacked Tour'));
  const bad = path.join(HOME, 'tampered.stlp'); fs.writeFileSync(bad, zipSync(files));
  const r1 = await win.evaluate((f) => window.api.packs.inspect(f).then(() => 'accepted', e => e.message), bad);
  check(/modified|hash/.test(r1), 'tampered pack rejected: ' + r1);
  delete files['signature.json'];
  const k2 = Object.keys(files).find(n => n.endsWith('training.json'));
  const orig = unzipSync(new Uint8Array(fs.readFileSync(PACK)));
  files[k2] = orig[k2];
  const uns = path.join(HOME, 'unsigned.stlp'); fs.writeFileSync(uns, zipSync(files));
  const r2 = await win.evaluate((f) => window.api.packs.install(f).then(() => 'installed', e => e.message), uns);
  check(/not signed/.test(r2), 'unsigned pack refused without developer mode');

  console.log('9. Logout, wrong password, second user');
  await win.click('.ui-user > button'); await win.click('text=⎋ Log out');
  await win.waitForSelector('#f-password');                      // last user remembered
  await win.fill('#f-password', 'wrong!!'); await win.click('button:has-text("Log in")');
  await win.waitForSelector('text=Wrong username or password');
  check(true, 'wrong password rejected');
  await win.click('button:has-text("change")');
  await win.fill('#f-username', 'davit'); await win.click('button:has-text("Continue")');
  await win.fill('#f-fullname', 'Davit Hakobyan'); await win.fill('#f-password', 'secret2'); await win.fill('#f-password2', 'secret2');
  await win.click('button:has-text("Create account")');
  await win.waitForSelector('.dash-tiles');
  await win.click('.ui-nav a:has-text("Library")');
  await win.waitForSelector('.pack-card');
  check(await win.getAttribute('.lib-tabs button[data-k="explore"]', 'aria-selected') === 'true' && (await win.textContent('.pack-card:has-text("FPGA Starter") .progress-line')).includes('0%'), 'second user: My packages empty, Explore shows the pack with 0 % progress');
  await win.click('.pack-card:has-text("FPGA Starter") button:has-text("Add to My packages")');
  await win.click('.lib-tabs button[data-k="mine"]');
  await win.waitForSelector('.pack-card');
  check((await win.$$('.pack-card')).length === 1 && !(await win.$('.group-chip:has-text("Semester 1")')), 'second user added one package; groups are per user');
  await win.evaluate(async () => {     /* second user opens the prerequisite and an attached material only */
    await window.api.progress.set('org.semitec.fpga-starter', 'digital-logic-refresher', 'reading', { read: true }, 100, true);
    await window.api.progress.set('org.semitec.fpga-starter', 'constraints', 'material', { opened: true }, 100, true);
  });
  const pr2 = await win.evaluate(async () => (await window.api.packs.list()).find(p => p.id === 'org.semitec.fpga-starter').progress);
  check(pr2.percent === 0 && pr2.done === 0 && !pr2.lastActivity && !pr2.finishedAt && pr2.total === 10,
    'prerequisite and attached material done: still 0 %, no activity, not "in progress" (' + JSON.stringify({ p: pr2.percent, d: pr2.done, t: pr2.total, a: pr2.lastActivity }) + ')');
  /* remove from My packages with "reset my progress", add again: starts from 0 */
  await win.evaluate(() => { location.hash = '#/library'; }); await sleep(300);
  await win.click('.lib-tabs button[data-k="mine"]'); await win.waitForSelector('.pack-card');
  await win.click('.pack-card:has-text("FPGA Starter") button:has-text("Remove from mine")');
  await win.waitForSelector('.modal #rp-chk');
  const dlg = await win.textContent('.modal');
  await shot(win, '11b-remove-reset-dialog');
  await win.check('.modal #rp-chk'); await win.click('.modal button:has-text("Remove")'); await sleep(500);
  const after = await win.evaluate(async () => ({ pre: await window.api.progress.get('org.semitec.fpga-starter', 'digital-logic-refresher'), mat: await window.api.progress.get('org.semitec.fpga-starter', 'constraints'),
    mine: (await window.api.packs.list()).find(p => p.id === 'org.semitec.fpga-starter').mine }));
  check(/reset my progress/i.test(dlg) && !after.pre && !after.mat && !after.mine, 'remove from My packages offers "reset my progress"; after reset no progress is left');
  await win.evaluate(() => window.api.mine.add('org.semitec.fpga-starter'));
  await app.close();

  console.log('10. Restart: data persists');
  ({ app, win } = await launch());
  await win.waitForSelector('#f-password');
  check((await win.textContent('.ui-who strong')) === 'davit', 'remembers last user after restart');
  await win.click('button:has-text("change")');
  await win.fill('#f-username', 'anna'); await win.click('button:has-text("Continue")');
  await win.fill('#f-password', 'secret1'); await win.click('button:has-text("Log in")');
  await win.waitForSelector('.dash-tiles');
  await win.click('.ui-nav a:has-text("Library")');
  await win.waitForSelector('.pack-card');
  const pct = await win.textContent('.pack-card:has-text("FPGA Starter") .progress-line');
  check(!/^0%/.test(pct.trim()) && !pct.includes(' 0%'), 'progress of anna kept after restart: ' + pct.trim());
  await win.click('.pack-card:has-text("FPGA Starter")');
  await win.waitForSelector('.item-row');
  await shot(win, '13-pack-after-restart');
  /* pack page: Reset progress starts the package from 0 (progress, enrollment, package certificate) */
  await win.click('button:has-text("Reset progress")'); await win.waitForSelector('.modal');
  await shot(win, '14-reset-dialog');
  await win.click('.modal button:has-text("Reset to 0")'); await sleep(800);
  const rs = await win.evaluate(async () => { const P = await window.api.packs.get('org.semitec.fpga-starter'); const PL = await window.api.plan.pack('org.semitec.fpga-starter');
    return { pct: P.summary.percent, saved: P.summary.saved, en: !!PL.enrollment, btn: !!document.querySelector('button.btn.small.ghost') && /Reset progress/.test(document.body.textContent), start: /Start:/.test(document.querySelector('.hero').textContent) }; });
  check(rs.pct === 0 && rs.saved === 0 && !rs.en && rs.start && !rs.btn, 'pack page "Reset progress": back to 0 %, no enrollment, "Start" again (' + JSON.stringify(rs) + ')');
  await app.close();

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(async e => { console.error(e); try { await global.__win.screenshot({ path: path.join(SHOTS, 'FAILED.png') }); console.log('screenshot: FAILED.png'); } catch (x) {} process.exit(1); });
