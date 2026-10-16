'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),express=require('express');
const {chromium,expect}=require('@playwright/test'),{startFixture}=require('./auth-fixture');
test('received voice keeps its tracks and audio through focus changes, long UI tasks, volume and protection changes',{timeout:150000},async t=>{
  const server=await new Promise(resolve=>{const s=express().use(express.static(path.resolve('out'))).listen(0,'127.0.0.1',()=>resolve(s));}),origin='http://127.0.0.1:'+server.address().port;
  let restricted=false;if(process.platform==='linux')try{restricted=JSON.parse(await fs.readFile('/etc/chromium/policies/managed/misc.json','utf8')).WebRtcIPHandling==='disable_non_proxied_udp';}catch{}
  const fixture=await startFixture({port:10867,appOrigin:origin});let browser;const errors=[];
  try{
    await fs.mkdir('artifacts/voice021',{recursive:true});browser=await chromium.launch({...process.platform==='win32'?{channel:'msedge'}:{executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined},args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio']});
    async function client(i){
      const email='receive-'+i+'@example.test';await fixture.call('signup',{email,nickname:'Voz Teste '+i,password:'Senha12!'});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});const data=(await fixture.call('login',{email,password:'Senha12!'})).data;
      const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['camera','microphone']});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
      await context.addInitScript(({base,data,i})=>{
        window.TRONO_BACKEND_URL=base;Object.defineProperty(window,'TRONO_RTC_CONFIG',{configurable:true,get:()=>({iceServers:[],iceCandidatePoolSize:0}),set:()=>{}});sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoSfxEnabled','0');localStorage.setItem('tronoMusicEnabled','0');localStorage.setItem('tronoNoiseSuppression','0');localStorage.setItem('mnDesktopNoiseMode','off');
window.__focused=true;window.__hidden=false;document.hasFocus=()=>window.__focused;Object.defineProperty(document,'hidden',{get:()=>window.__hidden});Object.defineProperty(document,'visibilityState',{get:()=>window.__hidden?'hidden':'visible'});window.__nativeStates=[];window.__pcs=[];
        const PC=RTCPeerConnection;window.RTCPeerConnection=class extends PC{constructor(...args){super(...args);window.__pcs.push(this);}};
        window.TronoDesktop={version:'0.2.1',clipsSuspended:true,readSession:async()=>null,saveSession:async()=>{},onCapture:()=>{},onCaptureCancel:()=>{},onApplicationAudio:()=>{},getWindowState:async()=>({fullscreen:false}),onWindowState:()=>{},onUpdateState:()=>{},getUpdateState:async()=>({status:'idle'}),configureClips:async()=>({suspended:true}),getResources:async()=>({appCpuPercent:4,appMemoryMB:200,freeMemoryMB:4096}),setVoiceProtection:async active=>{window.__nativeStates.push(active);return {active,status:active?'managed':'idle'};}};
        navigator.mediaDevices.getUserMedia=async constraints=>{
          if(!constraints.audio)throw Error('This test only requests audio');
          const ctx=new AudioContext({sampleRate:48000});await ctx.resume();const oscillator=ctx.createOscillator(),gain=ctx.createGain(),out=ctx.createMediaStreamDestination();oscillator.frequency.value=440+i*110;gain.gain.value=.1;oscillator.connect(gain);gain.connect(out);oscillator.start();(window.__toneContexts||=[]).push(ctx);return out.stream;
        };
      },{base:fixture.base,data,i});
      const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.TronoAuth?.ready);await page.evaluate(()=>window.TronoAuth.ready);await page.evaluate(async()=>{await window.TronoPortal.openVoice();if(!window.TronoSocial.voiceJoined)await window.TronoSocial.joinVoice();});try{await expect.poll(()=>page.evaluate(()=>window.TronoSocial.voiceJoined)).toBe(true);}catch(error){console.error('Voice join diagnostics',await page.evaluate(()=>({status:document.querySelector('#voiceStatus')?.textContent,room:window.TronoNetwork.primaryRoom,joined:window.TronoSocial.voiceJoined,joining:window.TronoSocial.voiceJoining})),errors);throw error;}return {page,context,data};
    }
    const a=await client(1),b=await client(2),p=a.page,q=b.page;
    await expect.poll(()=>p.locator('#remoteAudioHost audio').count()).toBe(1);
    const voiceState=()=>p.evaluate(()=>({mic:window.TronoSocial.getLocalAudioTrack().id,room:window.TronoNetwork.primaryRoom,receivers:window.__pcs.flatMap(pc=>pc.getReceivers()).filter(r=>r.track.kind==='audio'&&r.track.readyState==='live').map(r=>r.track.id)}));const before=await voiceState();
    await t.test('normal volume stays direct; native receiver buffer and per-voice interval metrics are real',{skip:restricted?'Managed Chromium policy blocks non-proxied WebRTC; this real-RTP check is required on Windows':false},async()=>{
    try{await expect.poll(()=>p.evaluate(()=>window.TronoSocial.voiceReception.rows.length),{timeout:18000}).toBe(1);}catch(error){console.error('Receiver diagnostics',JSON.stringify(await p.evaluate(async()=>({rx:window.TronoSocial.voiceReception,telemetry:window.TronoSocial.telemetry,pcs:await Promise.all(window.__pcs.map(async pc=>({state:pc.connectionState,signal:pc.signalingState,ice:pc.iceConnectionState,local:pc.localDescription?.type,remote:pc.remoteDescription?.type,transceivers:pc.getTransceivers().map(t=>({mid:t.mid,kind:t.receiver.track.kind,id:t.receiver.track.id})),stats:[...await pc.getStats()].map(([,v])=>v).filter(v=>v.type==='inbound-rtp')})))}))),errors);throw error;}

      const r=await p.evaluate(()=>window.TronoSocial.voiceReception);assert.equal(r.rows[0].supported,true);assert(r.rows[0].targetMs>=60&&r.rows[0].targetMs<=140);assert.equal(r.playbackContext,null);
      const report=JSON.parse(await p.evaluate(()=>window.TronoSocial.diagnostics()));assert.equal(report.reception.rows.length,1);assert(report.reception.recent.length>0);assert(report.playback.includes('direto'));assert(!JSON.stringify(report).includes('Voz Teste'));assert(!JSON.stringify(report).includes(a.data.session.access_token));
      assert.equal(await p.evaluate(()=>window.__nativeStates.at(-1)),true);
    });
    await t.test('background suspends visual meters, not voice; receive PCM remains continuous across long main-thread tasks',{skip:restricted?'Managed Chromium policy blocks non-proxied WebRTC; this real-PCM check is required on Windows':false},async()=>{
      const result=await p.evaluate(async()=>{
        window.__focused=false;window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('blur'));const background=window.TronoSocial.voiceReception;
        const ctx=new AudioContext({sampleRate:48000});await ctx.resume();
        const code=`class Check extends AudioWorkletProcessor{constructor(){super();this.frames=0;this.energy=0;this.count=0;this.quiet=0;this.maxQuiet=0;this.done=false;}process(inputs){const samples=inputs[0]?.[0];if(!samples)return true;for(const v of samples){this.frames++;if(this.frames<48000)continue;this.energy+=v*v;this.count++;if(Math.abs(v)<.00001)this.quiet++;else this.quiet=0;this.maxQuiet=Math.max(this.maxQuiet,this.quiet);}if(this.frames>=48000*5&&!this.done){this.done=true;this.port.postMessage({frames:this.frames,rms:Math.sqrt(this.energy/this.count),quietMs:this.maxQuiet/48});}return true;}}registerProcessor('voice-check',Check);`;
        const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);const meter=new AudioWorkletNode(ctx,'voice-check'),source=ctx.createMediaStreamSource(document.querySelector('#remoteAudioHost audio').srcObject),mute=ctx.createGain();mute.gain.value=0;source.connect(meter);meter.connect(mute);mute.connect(ctx.destination);
        const measured=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No receive PCM')),10000);meter.port.onmessage=e=>{clearTimeout(timer);resolve(e.data);};});
        for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,300));const until=performance.now()+90;while(performance.now()<until)Math.sqrt(Math.random());}
        const pcm=await measured;source.disconnect();meter.disconnect();meter.port.close();await ctx.close();return {background,pcm,joined:window.TronoSocial.voiceJoined};
      });
      console.log('Receive PCM under long UI tasks:',JSON.stringify(result));assert(result.background.background);assert.equal(result.background.metersRunning,0);assert(result.joined);assert(result.pcm.frames>=240000);assert(result.pcm.rms>.015);assert(result.pcm.quietMs<250);
      await p.evaluate(()=>{window.__focused=true;window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('focus'));});await expect.poll(()=>p.evaluate(()=>window.TronoSocial.voiceReception.metersRunning)).toBeGreaterThan(0);assert.deepEqual(await voiceState(),before);
    });
    await t.test('protection toggle restores native target without changing call or microphone; amplified output uses its own context',async()=>{
      await p.evaluate(()=>{window.__focused=false;window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('blur'));});assert.equal(await p.evaluate(()=>window.TronoSocial.voiceReception.metersRunning),0);await p.evaluate(()=>{window.__focused=true;window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('focus'));});await expect.poll(()=>p.evaluate(()=>window.TronoSocial.voiceReception.metersRunning)).toBeGreaterThan(0);
      await p.locator('#voiceSettingsBtn').click();await p.locator('[data-settings-tab=audio]').click();await p.locator('#voiceProtection').uncheck();
      assert.equal(await p.evaluate(()=>window.__nativeStates.at(-1)),false);
      assert(await p.evaluate(()=>window.__pcs.filter(pc=>pc.connectionState!=='closed').flatMap(pc=>pc.getReceivers()).filter(r=>r.track.kind==='audio').every(r=>r.jitterBufferTarget===null)));
      await p.locator('#voiceProtection').check();assert.deepEqual(await voiceState(),before);
      const output=p.locator('#outputGainSlider');await output.evaluate(n=>{n.value='180';n.dispatchEvent(new Event('input',{bubbles:true}));});await expect.poll(()=>p.evaluate(()=>window.TronoSocial.voiceReception.playbackContext)).toBe('running');
      await output.evaluate(n=>{n.value='80';n.dispatchEvent(new Event('input',{bubbles:true}));});const report=JSON.parse(await p.evaluate(()=>window.TronoSocial.diagnostics()));assert(report.playback.includes('direto'));assert.deepEqual(await voiceState(),before);
      await p.locator('#voiceSettingsClose').click();
    });
    await t.test('receive diagnostics fit portrait and smaller screens in both layouts; leave releases protection',async()=>{
      await p.evaluate(()=>window.TronoSocial.toggleTelemetry(true));await expect(p.locator('#telemetryVoiceRows')).toContainText(restricted?'Aguardando':'Voz 1');
      for(const layout of ['original','discord']){await p.evaluate(v=>window.TronoAppLayout.apply(v),layout);for(const [width,height]of [[480,800],[720,1280],[1080,1920]]){await p.setViewportSize({width,height});const box=await p.locator('#telemetryPanel').boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1);assert(await p.locator('#telemetryPanel').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await p.screenshot({path:'artifacts/voice021/'+layout+'-'+width+'.png'});}}
      await p.evaluate(()=>window.TronoSocial.leaveVoice());assert.equal(await p.evaluate(()=>window.__nativeStates.at(-1)),false);assert.equal(await p.evaluate(()=>window.TronoSocial.voiceReception.rows.length),0);assert.equal(await p.evaluate(()=>window.TronoSocial.voiceReception.playbackContext),null);assert.equal(await q.evaluate(()=>window.TronoSocial.voiceJoined),true);
    });
    assert.deepEqual(errors,[]);await a.context.close();await b.context.close();
  }finally{await browser?.close();await fixture.stop();await new Promise(r=>server.close(r));}
});
