'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs/promises'), os=require('node:os'),path=require('node:path');
const {_electron,expect}=require('@playwright/test');
const {startFixture}=require('./auth-fixture');
const {closeTestApp,killTestApp}=require('./desktop-test-close');
for(const backend of ['compatible','native'])test('native local clips '+backend+' require explicit source selection outside voice and release their source when disabled', {timeout:90000,skip:process.platform!=='win32'}, async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'trono-local-clips-'));let app,fixture,page,finished=false;
 t.signal.addEventListener('abort',()=>{if(!finished)killTestApp(app);},{once:true});
 try{
  fixture=await startFixture({port:11987,allowedOrigins:['https://a-lei-do-trono.surge.sh']});
  const email='native-local-clips@example.test',password='Senha12!';await fixture.call('signup',{email,nickname:'Clipes Nativos',password});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});
  app=await _electron.launch({executablePath:require('../electron/node_modules/electron'),args:[path.resolve('electron'),'--user-data-dir='+directory,'--mute-audio','--desktop-api-test-origin='+fixture.base,...(backend==='native'?['--desktop-replay-test-encoder=h264_mf']:[])],timeout:30000});
  page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://a-lei-do-trono-server.onrender.com/**',r=>r.abort());
  await page.addInitScript(base=>{window.TRONO_BACKEND_URL=base;localStorage.setItem('tronoMusicEnabled','0');},fixture.base);
  await page.waitForURL('https://a-lei-do-trono.surge.sh/');await page.waitForLoadState('load');
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:'E-mail',exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).last().click();await expect(page.locator('#chatOnlyScreen')).toBeVisible();
  await app.evaluate(({BrowserWindow})=>{const qa=new BrowserWindow({width:640,height:420,show:true,title:'QA clipes locais',webPreferences:{contextIsolation:true,nodeIntegration:false}});void qa.loadURL('data:text/html,'+encodeURIComponent('<title>QA clipes locais</title><canvas width="600" height="360"></canvas><script>setInterval(()=>{let c=document.querySelector("canvas").getContext("2d");c.fillStyle=`hsl(${Date.now()%360} 50% 50%)`;c.fillRect(0,0,600,360)},33)</script>'));});
  await app.evaluate(({BrowserWindow})=>{const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/'));main.show();main.focus();});
  await page.evaluate(()=>{const original=navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getDisplayMedia=async options=>{const source=await original(options);window.__localClipSource=source;return source;};});
  await page.evaluate(backend=>window.TronoClipPreferences.setSetting('encoder',backend==='native'?'auto':'compatible'),backend);
  if(backend==='native'){const capability=await page.evaluate(()=>window.TronoDesktop.replayCapability());assert.equal(capability.encoder,'Media Foundation (teste)',JSON.stringify(capability));assert.equal(capability.available,true,JSON.stringify(capability));}
  await page.locator('[data-account-card]').getByRole('button',{name:'Clipes',exact:true}).click();await expect(page.locator('#clipLocalStatus')).toContainText('desligada');
  await page.locator('#clipLocalStart').click();const picker=page.getByRole('dialog',{name:'Escolher tela ou janela',exact:true});await expect(picker).toBeVisible();await picker.getByRole('tab',{name:'Aplicativos',exact:true}).click();await picker.getByRole('button',{name:'QA clipes locais',exact:true}).click();await picker.locator('#desktopAudioMode').selectOption('none');await picker.locator('#desktopCaptureConfirm').click();
  await expect(page.locator('#clipNow')).toBeEnabled({timeout:15000});await expect.poll(()=>page.evaluate(()=>window.TronoClips.replayStatus?.seconds),{timeout:15000}).toBeGreaterThanOrEqual(1);
  assert.equal(await page.evaluate(()=>window.TronoSocial.voiceJoined||window.TronoSocial.screenSharing),false);
  assert.equal(await page.evaluate(()=>window.TronoClips.replayStatus.hasAudio),false);await expect(page.locator('#clipSource')).toHaveText('Capturando clipes');
  if(backend==='native'){const before=await page.evaluate(()=>window.TronoClips.replayStatus.seconds);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/')).hide());await expect.poll(()=>page.evaluate(()=>window.TronoClips.replayStatus.seconds),{timeout:10000}).toBeGreaterThan(before+1);await app.evaluate(({BrowserWindow})=>{const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/'));main.show();main.focus();});}
  await page.locator('#clipNow').click();await expect(page.locator('.clip-card')).toHaveCount(1);await page.getByRole('button',{name:'Prévia',exact:true}).click();await expect.poll(()=>page.locator('#clipsDialog video').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
  assert.equal(await page.evaluate(async()=>{const clips=await window.TronoClipStore.list(window.TronoAuth.user.id);return clips[0].filename.endsWith('.mp4');}),backend==='native');
  await page.locator('#clipLocalStop').click();assert.equal(await page.evaluate(()=>window.__localClipSource.getTracks().every(t=>t.readyState==='ended')),true);await expect(page.locator('.clip-card')).toHaveCount(1);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.TronoClips);assert.equal(await page.evaluate(()=>window.TronoClips.active),false);assert.deepEqual(errors,[]);
 }catch(error){console.error('Clipes nativos QA:',await page?.evaluate(()=>({source:document.querySelector('#clipSource')?.textContent,status:document.querySelector('#clipsStatus')?.textContent,local:document.querySelector('#clipLocalStatus')?.textContent,replay:window.TronoClips?.replayStatus})).catch(()=>null));throw error;}finally{finished=true;await closeTestApp(app);await fixture?.stop();await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});}
});
