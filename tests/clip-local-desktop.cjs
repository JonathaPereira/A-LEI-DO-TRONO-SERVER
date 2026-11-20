'use strict';
const {launchDesktop}=require('./desktop-first-window.cjs');
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs/promises'), os=require('node:os'),path=require('node:path');
const {_electron,expect}=require('@playwright/test');
const {startFixture}=require('./auth-fixture');
const {closeTestApp,killTestApp}=require('./desktop-test-close');
for(const backend of ['compatible','compatible-audio','native','native-audio'])test('native local clips '+backend+' require explicit source selection outside voice and release their source when disabled', {timeout:90000,skip:process.platform!=='win32'}, async t=>{
 const native=backend.startsWith('native'),withSound=backend.endsWith('-audio');let syntheticApplicationAudio=false;
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'trono-local-clips-'));let app,qaApp,fixture,page,focusState,finished=false;const mainLogs=[];
 t.signal.addEventListener('abort',()=>{if(!finished){killTestApp(app);killTestApp(qaApp);}},{once:true});
 try{
  fixture=await startFixture({port:11987,allowedOrigins:['https://a-lei-do-trono.surge.sh']});
  const email='native-local-clips@example.test',password='Senha12!';await fixture.call('signup',{email,nickname:'Clipes Nativos',password});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});
  if(withSound)await fs.writeFile(path.join(directory,'media-permissions.json'),JSON.stringify({allowed:['audio']}));
  app=await launchDesktop(_electron,{executablePath:require('../electron/node_modules/electron'),args:[path.resolve('electron'),'--user-data-dir='+directory,'--desktop-diagnostics',...(withSound?['--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']:['--mute-audio']),'--desktop-api-test-origin='+fixture.base,...(native?['--desktop-replay-test-encoder=h264_mf']:[])],timeout:30000});
  app.process().stderr.on('data',data=>{mainLogs.push(data.toString());if(mainLogs.length>25)mainLogs.shift();});
  page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://a-lei-do-trono-server.onrender.com/**',r=>r.abort());
  await page.addInitScript(base=>{window.TRONO_BACKEND_URL=base;localStorage.setItem('tronoMusicEnabled','0');},fixture.base);
  await page.waitForURL('https://a-lei-do-trono.surge.sh/');await page.waitForLoadState('load');
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:'E-mail',exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).last().click();await expect(page.locator('#chatOnlyScreen')).toBeVisible();
  if(!withSound)await app.evaluate(({BrowserWindow})=>{const qa=new BrowserWindow({width:640,height:420,show:true,title:'QA clipes locais',webPreferences:{contextIsolation:true,nodeIntegration:false}});void qa.loadURL('data:text/html,'+encodeURIComponent('<title>QA clipes locais</title><canvas width="600" height="360"></canvas><script>setInterval(()=>{let c=document.querySelector("canvas").getContext("2d");c.fillStyle=`hsl(${Date.now()%360} 50% 50%)`;c.fillRect(0,0,600,360)},33)</script>'));});
  if(withSound){
    const target=path.join(directory,'qa-window.cjs');
    const html='<title>QA clipes locais</title><canvas width="600" height="360"></canvas><script>setInterval(()=>{let c=document.querySelector("canvas").getContext("2d");c.fillStyle=`hsl(${Date.now()%360} 50% 50%)`;c.fillRect(0,0,600,360)},33);</script>';
    await fs.writeFile(target,require('./clip-native-qa.cjs').nativeQAProgram(html,path.resolve('artifacts/native-audio/Release/MN-Application-Audio.exe')));
    qaApp=await launchDesktop(_electron,{executablePath:require('../electron/node_modules/electron'),args:[target,'--user-data-dir='+path.join(directory,'qa-profile'),'--autoplay-policy=no-user-gesture-required'],timeout:30000});await (await qaApp.firstWindow()).waitForLoadState('load');const deviceStatus=await qaApp.evaluate(()=>global.qaToneStatus);if(deviceStatus.type==='error'&&new Set([0x80070490,0x88890010,0x800706ba]).has(deviceStatus.code)){syntheticApplicationAudio=true;console.log('QA audio: runner sem endpoint de reprodução; PCM de aplicativo controlado pela entrada nativa.');}else assert.equal(deviceStatus.type,'tone-ready',JSON.stringify(deviceStatus));
  }
  if(syntheticApplicationAudio)await page.evaluate(()=>{const create=window.TronoApplicationAudio.create.bind(window.TronoApplicationAudio);window.TronoApplicationAudio.create=async info=>{window.__qaApplicationInfo=info;return create(info);};});
  if(withSound)await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext(),tone=context.createOscillator(),gain=context.createGain(),out=context.createMediaStreamDestination();tone.frequency.value=880;gain.gain.value=0.15;tone.connect(gain).connect(out);tone.start();const track=out.stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{stop();void context.close();};window.__qaMicrophone=out.stream;return out.stream;};});
  await app.evaluate(({BrowserWindow})=>{const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/'));main.show();main.focus();});
  await page.evaluate(()=>{const original=navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getDisplayMedia=async options=>{const source=await original(options);window.__localClipSource=source;return source;};});
  // The QA window can finish loading before Windows exposes it to desktopCapturer.
  // Native probing used to hide that race by delaying the picker; compatible does no probe.
  if(qaApp)await qaApp.evaluate(({BrowserWindow})=>{const qa=BrowserWindow.getAllWindows()[0];qa.show();});
  await expect.poll(()=>app.evaluate(async({desktopCapturer})=>(await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}})).some(s=>s.name==='QA clipes locais'))).toBe(true);
  await page.evaluate(mode=>window.TronoClipPreferences.setSetting('encoder',mode),native?'auto':'compatible');
  if(native){const capability=await page.evaluate(()=>window.TronoDesktop.replayCapability());assert.equal(capability.encoder,'Media Foundation (teste)',JSON.stringify(capability));assert.equal(capability.available,true,JSON.stringify(capability));}
  await page.locator('[data-account-card]').getByRole('button',{name:'Clipes',exact:true}).click();await expect(page.locator('#clipLocalStatus')).toContainText('desligada');
  await page.locator('#clipLocalStart').click();const picker=page.getByRole('dialog',{name:'Escolher tela ou janela',exact:true});await expect(picker).toBeVisible();await picker.getByRole('tab',{name:'Aplicativos',exact:true}).click();await picker.getByRole('button',{name:'QA clipes locais',exact:true}).click();await picker.locator('#desktopAudioMode').selectOption(withSound?'application':'none');await picker.locator('#desktopCaptureConfirm').click();
  if(syntheticApplicationAudio){await page.waitForFunction(()=>window.__qaApplicationInfo);const info=await page.evaluate(()=>window.__qaApplicationInfo);await page.evaluate(id=>window.TronoDesktop.stopApplicationAudio(id),info.id);await app.evaluate(({BrowserWindow,app},info)=>{let position=0;const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/'));const timer=setInterval(()=>{const frames=882,bytes=new Uint8Array(frames*4),view=new DataView(bytes.buffer);for(let i=0;i<frames;i++){const value=Math.round(Math.sin(2*Math.PI*440*position++/44100)*6000);view.setInt16(i*4,value,true);view.setInt16(i*4+2,value,true);}if(!main.isDestroyed())main.webContents.send('mn:application-audio',{type:'chunk',id:info.id,bytes});},20);app.once('will-quit',()=>clearInterval(timer));},info);}
  await expect(page.locator('#clipNow')).toBeEnabled({timeout:15000});await expect.poll(()=>page.evaluate(()=>window.TronoClips.replayStatus?.seconds),{timeout:15000}).toBeGreaterThanOrEqual(withSound?3:1);
  assert.equal(await page.evaluate(()=>window.TronoSocial.voiceJoined||window.TronoSocial.screenSharing),false);
  assert.equal(await page.evaluate(()=>window.TronoClips.replayStatus.hasAudio),withSound);await expect(page.locator('#clipSource')).toHaveText('Capturando clipes');
  if(native){const before=await page.evaluate(()=>window.TronoClips.replayStatus.seconds);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/')).hide());await expect.poll(()=>page.evaluate(()=>window.TronoClips.replayStatus.seconds),{timeout:10000}).toBeGreaterThan(before+1);}
  await expect.poll(()=>page.evaluate(()=>window.TronoClipDesktop.globalActive)).toBe(true);
  const displays=await app.evaluate(({BrowserWindow,screen})=>{const all=screen.getAllDisplays(),other=all.find(d=>d.id!==screen.getPrimaryDisplay().id),main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/'));if(other)main.setBounds({x:other.workArea.x+20,y:other.workArea.y+20,width:Math.min(1000,other.workArea.width),height:Math.min(800,other.workArea.height)});return all.length;});
  if(qaApp){
   // Windows may deny programmatic foreground transfer to a separate process.
   // Activate the disposable target with a real OS click, then assert actual focus.
   const point=await qaApp.evaluate(({BrowserWindow,screen})=>{const game=BrowserWindow.getAllWindows()[0];game.setAlwaysOnTop(true);game.show();const b=game.getContentBounds();return screen.dipToScreenPoint({x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)});});
   await require('./desktop-shortcut-input.cjs').clickDesktop(point);
   const target=await qaApp.evaluate(({BrowserWindow})=>({pid:process.pid,handle:BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString()}));
   focusState={mainPid:await app.evaluate(()=>process.pid),target};
   await expect.poll(async()=>{focusState.actual=await require('./desktop-shortcut-input.cjs').foregroundWindow();return focusState.actual.handle;}).toBe(target.handle);
  }
  else await app.evaluate(({BrowserWindow})=>{const game=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='QA clipes locais');game.show();game.focus();});
  if(!qaApp)await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/')).isFocused())).toBe(false);
  await require('./desktop-shortcut-input.cjs').pressClipShortcut();
  // Do not poll the renderer here: a CDP evaluation could wake a suspended page
  // and hide exactly the failure reported by a player using another monitor.
  await new Promise(resolve=>setTimeout(resolve,3000));
  const beforeFirstProbe=Date.now();
  const saved=await page.evaluate(()=>window.TronoClipStore.list(window.TronoAuth.user.id));
  assert.equal(saved.length,1,'the OS shortcut must retain a clip before any renderer probe');
  assert(saved[0].createdAt<beforeFirstProbe-100,'clip creation must precede the first renderer probe');
  await expect(page.locator('.clip-card')).toHaveCount(1,{timeout:15000});
  if(qaApp){focusState.afterClip=await require('./desktop-shortcut-input.cjs').foregroundWindow();assert.equal(focusState.afterClip.handle,focusState.target.handle,'the OS foreground must remain the external QA window through clip retention: '+JSON.stringify(focusState));}
  else assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/')).isFocused()),false,'clip must be retained without returning focus to Trono');
  let latestClipId;
  for(let count=2;count<=3;count++){
    await require('./desktop-shortcut-input.cjs').pressClipShortcut();
    await new Promise(resolve=>setTimeout(resolve,3000));const probe=Date.now();
    const retained=await page.evaluate(()=>window.TronoClipStore.list(window.TronoAuth.user.id));
    assert.equal(retained.length,count,'repeated shortcuts must retain each clip');assert(retained[0].createdAt<probe-100);
    latestClipId=retained.reduce((latest,clip)=>clip.createdAt>latest.createdAt?clip:latest).id;
    assert.equal(await page.evaluate(()=>window.TronoClips.active&&window.__localClipSource.getVideoTracks()[0].readyState==='live'),true,'capture must survive repeated clips');
  }
  console.log('Windows global clip shortcut with another window focused:',JSON.stringify({backend,displays}));
  if(qaApp)await qaApp.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setAlwaysOnTop(false));
  await app.evaluate(({BrowserWindow})=>{const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://a-lei-do-trono.surge.sh/'));main.show();main.focus();});await expect(page.locator('.clip-card')).toHaveCount(3);await page.locator('.clip-card[data-clip-id="'+latestClipId+'"]').getByRole('button',{name:'Prévia',exact:true}).click();await expect.poll(()=>page.locator('#clipsDialog video').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
  assert.equal(await page.evaluate(async()=>{const clips=await window.TronoClipStore.list(window.TronoAuth.user.id);return clips[0].filename.endsWith('.mp4');}),native);
  if(withSound){const base64=await page.evaluate(async()=>{const row=(await window.TronoClipStore.list(window.TronoAuth.user.id))[0];return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(row.blob);});});const file=path.join(directory,'native-audio.mp4');await fs.writeFile(file,Buffer.from(base64,'base64'));const decoded=require('node:child_process').spawnSync(path.resolve('artifacts/ffmpeg/bin/ffmpeg.exe'),['-v','error','-i',file,'-map','0:a:0','-f','f32le','-ac','1','-ar','48000','pipe:1'],{maxBuffer:8*1048576,timeout:15000,windowsHide:true});assert.equal(decoded.status,0,decoded.stderr.toString());const samples=new Float32Array(decoded.stdout.buffer,decoded.stdout.byteOffset,Math.floor(decoded.stdout.length/4));const amplitude=f=>{let a=0,b=0;for(let i=0;i<samples.length;i++){a+=samples[i]*Math.sin(2*Math.PI*f*i/48000);b+=samples[i]*Math.cos(2*Math.PI*f*i/48000);}return Math.hypot(a,b)/samples.length;};const measured={application:amplitude(440),microphone:amplitude(880),samples:samples.length,syntheticApplicationAudio};assert(measured.microphone>0.01,'microphone must be audible in the native MP4: '+JSON.stringify(measured));assert(measured.application>0.005,'application audio must be audible in the native MP4: '+JSON.stringify(measured));}
  await page.locator('#clipLocalStop').click();assert.equal(await page.evaluate(()=>window.__localClipSource.getTracks().every(t=>t.readyState==='ended')),true);await expect(page.locator('.clip-card')).toHaveCount(3);if(withSound)assert.equal(await page.evaluate(()=>window.__qaMicrophone.getTracks().every(t=>t.readyState==='ended')),true);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.TronoClips);assert.equal(await page.evaluate(()=>window.TronoClips.active),false);assert.deepEqual(errors,[]);
 }catch(error){const state=await page?.evaluate(()=>({source:document.querySelector('#clipSource')?.textContent,status:document.querySelector('#clipsStatus')?.textContent,local:document.querySelector('#clipLocalStatus')?.textContent,replay:window.TronoClips?.replayStatus})).catch(()=>null);let windows;try{windows=await app?.evaluate(({BrowserWindow,app})=>({ready:app.isReady(),windows:BrowserWindow.getAllWindows().map(w=>({title:w.getTitle(),url:w.webContents.getURL(),visible:w.isVisible()}))}));}catch{}error.message+='\nClipes QA: '+JSON.stringify({focusState,state,windows,logs:mainLogs.join('').slice(-5000)});throw error;}finally{finished=true;await closeTestApp(qaApp);await closeTestApp(app);await fixture?.stop();await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});}
});
