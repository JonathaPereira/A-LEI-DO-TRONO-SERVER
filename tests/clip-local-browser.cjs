'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),path=require('node:path');
const {chromium,expect}=require('@playwright/test');
const {startFixture}=require('./auth-fixture');
test('main clips action starts local capture only on request, outside voice, and stopping preserves saved clips', {timeout:60000}, async()=>{
 const server=express().use(express.static(path.resolve('out'))).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const origin='http://127.0.0.1:'+server.address().port, fixture=await startFixture({port:11986,appOrigin:origin});let browser;
 try{
 const email='local-clips@example.test',password='Senha12!';await fixture.call('signup',{email,nickname:'Clipes Locais',password});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});const data=(await fixture.call('login',{email,password})).data;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--mute-audio']});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript(({base,data})=>{
  window.TRONO_BACKEND_URL=base;sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoClips:'+data.user.id,JSON.stringify({version:2,auto:false,desktopAuto:true}));window.__localCaptures=[];window.__clipMicrophones=[];
  navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext(),tone=context.createOscillator(),out=context.createMediaStreamDestination();tone.frequency.value=880;tone.connect(out);tone.start();const stream=out.stream,track=stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{stop();void context.close();};window.__clipMicrophones.push(stream);return stream;};
  navigator.mediaDevices.getDisplayMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;window.__localCanvas=canvas;
   const timer=setInterval(()=>{const ctx=canvas.getContext('2d');ctx.fillStyle=`hsl(${performance.now()%360} 60% 50%)`;ctx.fillRect(0,0,640,360);},33);
   const stream=canvas.captureStream(30),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};window.__localCaptures.push(stream);return stream;};
 },{base:fixture.base,data});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.TronoClips);
 const button=page.locator('[data-account-card]').getByRole('button',{name:'Clipes',exact:true});await expect(button).toBeVisible();await button.click();
 assert.equal(await page.evaluate(()=>window.__localCaptures.length),0);await expect(page.locator('#clipLocalStatus')).toContainText('desligada');
 await page.locator('#clipLocalStart').click();await expect(page.locator('#clipNow')).toBeEnabled({timeout:15000});await expect.poll(()=>page.evaluate(()=>window.TronoClips.replayStatus?.seconds)).toBeGreaterThanOrEqual(1);
 assert.equal(await page.evaluate(()=>window.TronoSocial.voiceJoined),false);assert.equal(await page.evaluate(()=>window.TronoSocial.screenSharing),false);
 await expect(page.locator('#clipSource')).toHaveText('Capturando clipes');await expect(page.locator('#clipCaptureIndicator')).toHaveAttribute('data-active','true');assert.equal(await page.evaluate(()=>window.TronoClips.replayStatus.hasAudio),true);assert.equal(await page.evaluate(()=>window.__clipMicrophones.length),1);
 await page.locator('#clipNow').click();await expect(page.locator('.clip-card')).toHaveCount(1);
 await page.locator('[data-clips-tab=preferences]').click();await page.getByRole('button',{name:'Econômica · 720p / 30 FPS',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.TronoClips.active)).toBe(true);
 await page.locator('#clipAudioMode').selectOption('none');await expect.poll(()=>page.evaluate(()=>window.TronoClips.replayStatus?.hasAudio)).toBe(false);assert.equal(await page.evaluate(()=>window.__clipMicrophones.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 await page.locator('#clipLocalStop').click();await expect(page.locator('#clipLocalStatus')).toContainText('desligada');await expect(page.locator('#clipSource')).toHaveText('Captura desligada');assert.equal(await page.evaluate(()=>window.__localCaptures[0].getTracks().every(t=>t.readyState==='ended')),true);
 await page.locator('[data-clips-tab=library]').click();await expect(page.locator('.clip-card')).toHaveCount(1);await page.reload();await page.waitForFunction(()=>window.TronoClips);assert.equal(await page.evaluate(()=>window.__localCaptures.length),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await fixture.stop();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
