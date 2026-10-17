/* Exercises the current content contract against a fresh, isolated Electron profile. */
'use strict';
const { _electron: electron }=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {build}=require('./fixtures/contract');
const fixture=build(), APP=path.join(__dirname,'..'), profile=path.join(fixture.root,'profile'), data=path.join(fixture.root,'data');fs.mkdirSync(data);
const shots=path.join(__dirname,'screenshots');fs.mkdirSync(shots,{recursive:true});
const timeout=setTimeout(()=>{console.error('Content integration test exceeded 150 seconds');process.exit(1);},150000);
let app,win;
async function packagePage(id) {
  await win.evaluate(id=>{location.hash='#/pack/'+id;},id);
  await win.waitForSelector('.item-row');
}
async function checkRows() {
  for (const width of [1320, 1000, 760, 600]) {
    await win.setViewportSize({width,height:900});
    const problems = await win.locator('.item-row').evaluateAll((rows,width)=>rows.flatMap(row=>{
      const issues=[], box=row.getBoundingClientRect(), actions=[...row.querySelectorAll('.item-actions > *')];
      for(const a of actions){
        const r=a.getBoundingClientRect(), range=document.createRange();range.selectNodeContents(a);const text=range.getBoundingClientRect();
        if(r.left<box.left-1 || r.right>box.right+1 || r.top<box.top || r.bottom>box.bottom+1) issues.push('control outside row: '+a.textContent);
        if(text.left<r.left-1 || text.right>r.right+1 || text.bottom>r.bottom+1) issues.push('text outside control: '+a.textContent);
      }
      for(let i=0;i<actions.length;i++) for(let j=i+1;j<actions.length;j++) {
        const a=actions[i].getBoundingClientRect(),b=actions[j].getBoundingClientRect();
        if(Math.min(a.right,b.right)>Math.max(a.left,b.left)+1 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1) issues.push('overlapping controls');
      }
      const buttons=[...row.querySelectorAll('.btn')].map(b=>b.getBoundingClientRect());
      if(width>760 && buttons.length===2 && Math.abs(buttons[0].top-buttons[1].top)>2) issues.push('desktop actions on different lines');
      return issues.map(i=>width+'px '+row.querySelector('.item-title').textContent+': '+i);
    }),width);
    assert.deepEqual(problems,[]);
  }
  await win.setViewportSize({width:1320,height:900});
}
async function checkOffline(file, text, mode) {
  const pending=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow},file)=>{const w=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});w.loadFile(file);},file);
  const page=await pending;
  try {
    await page.getByText(text,{exact:false}).first().waitFor();
    if(mode==='json-normal') { await page.waitForSelector('.toc-item.is-locked');assert.equal(await page.locator('.toc-item.is-locked').count(),1); }
    if(mode==='json-preview') { await page.waitForSelector('.mode-badge');assert.equal(await page.locator('.toc-item.is-locked').count(),0); }
    if(mode==='web-normal') assert.equal(await page.locator('#answer').isHidden(),true);
    if(mode==='web-preview') assert.equal(await page.locator('#answer').isVisible(),true);
    if(mode==='bridge') {
      await page.locator('#input-a').click();await page.locator('#input-b').click();
      assert.equal(await page.locator('#output').textContent(),'1');await page.locator('#complete').click();
      await page.getByText('Activity complete (standalone)',{exact:true}).waitFor();
    }
    if(mode==='bridge-preview') {
      const before=await page.evaluate(()=>localStorage.getItem('logic-test'));
      await page.locator('#input-a').click();await page.locator('#complete').click();
      await page.getByText('Preview — progress not saved',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>localStorage.getItem('logic-test')),before);
    }
  }
  finally { await page.close(); }
}

(async()=>{
  app=await electron.launch({executablePath:process.env.E2E_EXECUTABLE || require('electron'),args:[...(process.env.E2E_EXECUTABLE ? [] : [APP]),'--no-sandbox','--user-data-dir='+profile],cwd:APP});
  win=await app.firstWindow(); win.setDefaultTimeout(20000); await win.setViewportSize({width:1320,height:900});
  const errors=[];win.on('pageerror',e=>errors.push(e.message));
  await win.waitForSelector('text=Welcome to SemiTec Academy');
  await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},data);
  await win.click('button:has-text("Choose another folder")');await win.waitForFunction(dir=>document.querySelector('.path').textContent===dir,data);await win.click('text=Continue →');
  await win.fill('#f-username','tester');await win.click('button:has-text("Continue")');await win.fill('#f-fullname','Test Learner');await win.fill('#f-password','test-pass');await win.fill('#f-password2','test-pass');await win.click('button:has-text("Create account")');await win.waitForSelector('.dash-card.welcome');
  console.log('Created isolated test account');
  await win.evaluate(()=>{location.hash='#/settings/account';});
  await win.getByLabel('Current password',{exact:true}).fill('wrong-password');
  await win.getByLabel('New password',{exact:true}).fill('new-test-pass');
  await win.getByLabel('Repeat new password',{exact:true}).fill('different-password');
  await win.getByRole('button',{name:'Change password',exact:true}).click();
  await win.getByText('The new passwords do not match',{exact:true}).waitFor();
  await win.getByLabel('Repeat new password',{exact:true}).fill('new-test-pass');
  await win.getByRole('button',{name:'Change password',exact:true}).click();
  await win.locator('.ui-error').filter({hasText:'Current password is wrong'}).waitFor();
  await win.getByLabel('Current password',{exact:true}).fill('test-pass');
  await win.getByLabel('New password',{exact:true}).fill('short');
  await win.getByLabel('Repeat new password',{exact:true}).fill('short');
  await win.getByRole('button',{name:'Change password',exact:true}).click();
  await win.locator('.ui-error').filter({hasText:'at least 6'}).waitFor();
  await win.getByLabel('New password',{exact:true}).fill('new-test-pass');
  await win.getByLabel('Repeat new password',{exact:true}).fill('new-test-pass');
  await win.getByRole('button',{name:'Change password',exact:true}).click();
  await win.getByText('Password changed',{exact:true}).waitFor();
  await win.click('.ui-user > button');
  await win.getByRole('button',{name:'Log out',exact:false}).click();
  await win.fill('#f-password','test-pass');await win.getByRole('button',{name:'Log in',exact:false}).click();
  await win.locator('.ui-error').filter({hasText:'Wrong username or password'}).waitFor();
  await win.fill('#f-password','new-test-pass');await win.getByRole('button',{name:'Log in',exact:false}).click();
  await win.waitForSelector('.dash-card.welcome');
  console.log('✓ Password change UI: mismatch, wrong current, short password, old-login rejection and new-login success');
  await win.evaluate(async()=>{await window.api.app.setDevMode(true);});
  // Exercise the same install IPC as the import dialog; unsigned test-only archive.
  await win.evaluate(file=>window.api.packs.install(file),fixture.file);
  const id=fixture.spec.pack.id;
  await win.evaluate(id=>window.api.progress.set(id,'json','training',{},20,false),id);
  await packagePage(id);
  await win.click('.seg button:has-text("By type")');
  assert.equal(await win.locator('.item-row button:has-text("Download folder")').count(),8);
  await checkRows();
  await win.click('.seg button:has-text("Course order")');assert.equal(await win.locator('.item-row button:has-text("Download folder")').count(),8);
  assert.equal(await win.locator('.item-row.sub').count(),1);
  await checkRows();
  await win.screenshot({animations:'disabled',path:path.join(shots,'contract-rows-desktop.png')});
  await win.setViewportSize({width:600,height:900});await win.screenshot({animations:'disabled',path:path.join(shots,'contract-rows-narrow.png')});await win.setViewportSize({width:1320,height:900});
  console.log('✓ Complete-folder download controls in both package views');
  const out=path.join(fixture.root,'downloads');fs.mkdirSync(out);
  await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},out);
  await win.locator('.item-row.t-training').filter({hasText:'Custom presentation'}).locator('button:has-text("Download folder")').click();
  await win.waitForFunction(()=>!document.querySelector('.item-row button:disabled'));
  assert.ok(fs.existsSync(path.join(out,'Custom presentation/index.html')));assert.equal(fs.existsSync(path.join(out,'Custom presentation/index_preview.html')),false);
  assert.equal(fs.existsSync(path.join(out,'Custom presentation/certificate/index_preview.html')),false);
  await checkOffline(path.join(out,'Custom presentation/index.html'),'Custom presentation','web-normal');
  const collision=await win.evaluate(async id=>{try{await window.api.packs.exportItem(id,'web');return '';}catch(e){return e.message;}},id);
  assert.match(collision,/already exists/);
  const status=await win.evaluate(id=>fetch('stl://pack/'+id+'/trainings/web/index_preview.html').then(r=>r.status),id);assert.equal(status,403);
  await win.evaluate(id=>{location.hash='#/pack/'+id+'/web';},id);await win.waitForSelector('.manual-progress');
  assert.equal(await win.frameLocator('.item-body iframe').locator('body').evaluate(()=>window.bridgeAvailableInHead),true);
  await win.locator('.manual-progress input').first().check();
  await win.waitForFunction(async id=>(await window.api.progress.get(id,'web')).percent===50,id);
  await win.locator('.manual-progress input').nth(1).check();
  await win.waitForFunction(async id=>(await window.api.progress.get(id,'web')).percent===100,id);
  await win.screenshot({animations:'disabled',path:path.join(shots,'contract-manual.png')});
  await packagePage(id);await checkRows();
  await win.locator('.item-row.t-training').filter({hasText:'Custom presentation'}).getByRole('link',{name:'Review',exact:true}).waitFor();
  console.log('✓ Manual web progress stored, preview withheld without password');
  await win.evaluate(()=>{location.hash='#/certificates';});await win.waitForSelector('.cert-card');await win.click('.cert-card');await win.waitForSelector('.cert-view iframe');
  const certFrame=win.frameLocator('.cert-view iframe');await certFrame.getByText('Test Learner',{exact:true}).waitFor();
  assert.equal(await certFrame.locator('#course').textContent(),'Custom presentation');
  await win.screenshot({animations:'disabled',path:path.join(shots,'contract-certificate.png')});
  const pdfPath=path.join(fixture.root,'certificate.pdf');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},pdfPath);
  await win.click('.cert-modal button:has-text("Save as PDF")');
  await win.waitForFunction(()=>!document.body.classList.contains('print-web-cert'));
  // Wait for the PDF save to resolve before inspecting its bytes.
  await win.waitForFunction(()=>document.body.textContent.includes('Saved:'));
  assert.ok(fs.statSync(pdfPath).size>1000);
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const printed=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(pdfPath)),isEvalSupported:false}).promise;
  const printedText=(await (await printed.getPage(1)).getTextContent()).items.map(x=>x.str).join(' ');assert.match(printedText,/Test Learner/);assert.match(printedText,/Custom presentation/);await printed.destroy();
  console.log('✓ HTML/JavaScript training certificate receives learner data and exports PDF');
  await win.click('.cert-modal button:has-text("Close")');
  await win.evaluate(id=>{location.hash='#/pack/'+id+'/guide';},id);await win.waitForSelector('.textLayer span');
  await app.evaluate(async({clipboard,ClipboardItem,BrowserWindow})=>{global.__testClipboard=await Promise.all((await clipboard.read()).map(async item=>new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)]))))));clipboard.clear();BrowserWindow.getAllWindows()[0].focus();});
  const selected=await win.evaluate(()=>{const span=document.querySelector('.textLayer span'),range=document.createRange();range.selectNodeContents(span);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);return selection.toString();});assert.match(selected,/Academy PDF test/);
  await win.keyboard.press(process.platform==='darwin'?'Meta+C':'Control+C');
  assert.match(await app.evaluate(({clipboard})=>clipboard.readText()),/Academy PDF test/);
  await app.evaluate(({shell})=>{shell.openExternal=async url=>{global.__testExternalUrl=url;};});
  await win.locator('.pdfv-links a[aria-label="https://example.org/lesson"]').first().click();
  assert.equal(await app.evaluate(()=>global.__testExternalUrl),'https://example.org/lesson');
  await win.locator('.pdfv-links a[aria-label="Go to linked page"]').first().click();await win.waitForFunction(()=>document.querySelector('.pdfv-bar input.page').value==='2');
  await win.screenshot({animations:'disabled',path:path.join(shots,'contract-pdf.png')});
  console.log('✓ PDF actual clipboard copy, external links and internal destinations');
  await win.evaluate(id=>{location.hash='#/pack/'+id+'/project';},id);
  await win.getByRole('tab',{name:'Brief',exact:false}).click();
  await win.locator('.textLayer span').filter({hasText:'Capstone project brief'}).first().waitFor();
  assert.ok(await win.locator('.pdfv-links a').count()>=2);
  await packagePage(id);
  await win.getByRole('button',{name:'Unlock author previews',exact:true}).click();
  await win.getByLabel('Package password',{exact:true}).fill('wrong-password');await win.locator('.modal').getByRole('button',{name:'Unlock',exact:true}).click();
  await win.locator('.modal .ui-error').filter({hasText:'Incorrect package password'}).waitFor();
  assert.equal(await win.evaluate(id=>fetch('stl://pack/'+id+'/trainings/web/index_preview.html').then(r=>r.status),id),403);
  await win.getByLabel('Package password',{exact:true}).fill('test-preview-password');await win.locator('.modal').getByRole('button',{name:'Unlock',exact:true}).click();
  await win.waitForSelector('.modal',{state:'detached'});
  assert.equal(await win.evaluate(id=>fetch('stl://pack/'+id+'/trainings/web/index_preview.html').then(r=>r.status),id),200);
  await packagePage(id);
  await win.locator('.item-row.t-training').filter({hasText:'Custom presentation'}).getByRole('link',{name:'Open all sections',exact:true}).click();
  await win.frameLocator('.item-body iframe').locator('#answer').waitFor();
  assert.equal(await win.locator('.manual-progress').count(),0,'author preview cannot mark learner steps complete');
  await win.getByText('Author preview · all sections open',{exact:true}).waitFor();
  await win.getByRole('link',{name:'Study normally',exact:true}).click();
  await win.locator('.manual-progress').waitFor();
  await packagePage(id);
  const unlocked=path.join(fixture.root,'unlocked');fs.mkdirSync(unlocked);await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},unlocked);
  await win.evaluate(id=>window.api.packs.exportItem(id,'web'),id);assert.ok(fs.existsSync(path.join(unlocked,'Custom presentation/index_preview.html')));
  await win.evaluate(id=>window.api.packs.exportItem(id,'project'),id);assert.ok(fs.existsSync(path.join(unlocked,'Capstone project/requirements/srs.md')));assert.ok(fs.existsSync(path.join(unlocked,'Capstone project/academy-attachments/data/data.csv')));
  for(const rel of ['brief.pdf','src/main.js','materials/notes.txt','project.json']) assert.ok(fs.existsSync(path.join(unlocked,'Capstone project',rel)),rel);
  await checkOffline(path.join(unlocked,'Custom presentation/index_preview.html'),'Author preview: all sections','web-preview');
  await checkOffline(path.join(unlocked,'Custom presentation/certificate/index_preview.html'),'PREVIEW — NOT ISSUED');
  for(const item of ['json','bridge','practice','guide','video','data']) await win.evaluate(({id,item})=>window.api.packs.exportItem(id,item),{id,item});
  await checkOffline(path.join(unlocked,'JSON lesson/index.html'),'JSON lesson','json-normal');
  await checkOffline(path.join(unlocked,'JSON lesson/index_preview.html'),'JSON lesson','json-preview');
  await checkOffline(path.join(unlocked,'Interactive logic gate/index.html'),'Interactive logic gate','bridge');
  await checkOffline(path.join(unlocked,'Interactive logic gate/index_preview.html'),'Interactive logic gate','bridge-preview');
  assert.ok(fs.existsSync(path.join(unlocked,'Practice lab/src/example.js')));
  assert.ok(fs.existsSync(path.join(unlocked,'Design flow video/design-flow.mp4')));
  await win.evaluate(id=>{location.hash='#/pack/'+id+'/bridge';},id);
  await win.frameLocator('.item-body iframe').locator('#input-a').click();
  await win.waitForFunction(async id=>(await window.api.progress.get(id,'bridge')).percent===30,id);
  await win.frameLocator('.item-body iframe').locator('#complete').click();
  await win.waitForFunction(async id=>(await window.api.progress.get(id,'bridge')).percent===100,id);
  await win.evaluate(async id=>{const p=await window.api.packs.get(id);for(const it of p.manifest.items){if(!it.for && it.id!=='web')await window.api.progress.set(id,it.id,it.type,{},100,true);}},id);
  // Reinstalling the exact same archive is a new delivery: access is re-approved,
  // while learner progress deliberately stays with the stable package/item ids.
  await win.evaluate(file=>window.api.packs.install(file),fixture.file);
  const afterReinstall=await win.evaluate(id=>window.api.packs.get(id),id);
  assert.equal(afterReinstall.access.unlocked,false);
  assert.equal(await win.evaluate(async id=>(await window.api.progress.get(id,'web')).percent,id),100);
  assert.equal(await win.evaluate(id=>fetch('stl://pack/'+id+'/trainings/web/index_preview.html').then(r=>r.status),id),403);
  await win.evaluate(()=>{location.hash='#/certificates';});
  await win.waitForFunction(()=>document.querySelectorAll('.cert-card').length===2);
  assert.equal(await win.locator('.cert-card').filter({hasText:'JSON lesson'}).count(),0);
  await win.locator('.cert-card.k-package').click();
  await win.frameLocator('.cert-view iframe').getByText('Contract test course',{exact:true}).waitFor();
  await win.frameLocator('.cert-view iframe').getByText('Test Learner',{exact:true}).waitFor();
  await win.click('.cert-modal button:has-text("Close")');
  // No-password packages (such as MBIST) must be open for learning but closed to author previews.
  const {readPack,buildPack}=require('../src/shared/packfmt');
  const openSource=readPack(fs.readFileSync(fixture.file));
  delete openSource.manifest.access;openSource.manifest.format=1;
  openSource.manifest.id=id+'.open';openSource.manifest.title='Open access course';
  const openFile=path.join(fixture.root,'open.stlp');fs.writeFileSync(openFile,buildPack({manifest:openSource.manifest,files:openSource.files}).bytes);
  const openId=openSource.manifest.id;
  await win.evaluate(file=>window.api.packs.install(file),openFile);
  const normalOut=path.join(fixture.root,'no-password');fs.mkdirSync(normalOut);
  await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},normalOut);
  for(const item of openSource.manifest.items.filter(i=>i.type==='training')) {
    await win.evaluate(({id,item})=>window.api.packs.exportItem(id,item),{id:openId,item:item.id});
    const folder=path.join(normalOut,item.title);
    assert.ok(fs.existsSync(path.join(folder,'index.html')));
    assert.equal(fs.existsSync(path.join(folder,'index_preview.html')),false,item.id);
    assert.equal(fs.existsSync(path.join(folder,'certificate/index_preview.html')),false,item.id);
    assert.equal(await win.evaluate(url=>fetch(url).then(r=>r.status),'stl://pack/'+openId+'/'+item.path+'/index_preview.html'),403);
  }
  await win.evaluate(id=>window.api.packs.exportPackage(id),openId);
  assert.equal(fs.readdirSync(path.join(normalOut,'Open access course'),{recursive:true}).some(f=>/(?:index_preview|training-preview|certificate-preview)\.html?$/i.test(f)),false);
  await checkOffline(path.join(normalOut,'JSON lesson/index.html'),'JSON lesson','json-normal');
  console.log('✓ No password configured: normal folders remain usable, all author previews excluded from item/course downloads and direct requests');
  assert.deepEqual(errors,[]);
  console.log('✓ Brief links, wrong/correct preview passwords, re-install relock, full folders, offline entries, bridge progress and optional package/training certificates');
  console.log('All content integration checks passed.');
})().catch(async e=>{console.error(e);if(win){console.error((await win.locator('body').innerText().catch(()=>'' )).slice(-4000));await win.screenshot({path:path.join(shots,'contract-failure.png')}).catch(()=>{});}process.exitCode=1;}).finally(async()=>{clearTimeout(timeout);if(app){await app.evaluate(async({clipboard})=>{if(global.__testClipboard){clipboard.clear();if(global.__testClipboard.length)await clipboard.write(global.__testClipboard);}}).catch(()=>{});await app.close().catch(()=>{});}fs.rmSync(fixture.root,{recursive:true,force:true});});
