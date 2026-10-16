'use strict';
// Real Windows windows and WebRTC capture: visibility is never mocked here.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),express=require('express');
const {_electron,chromium,expect}=require('@playwright/test'),{startFixture}=require('./auth-fixture'),{closeTestApp,killTestApp}=require('./desktop-test-close');
const root=path.resolve(__dirname,'..'),origin='https://a-lei-do-trono.surge.sh';
function initialize({base,data,desktop}){
 window.TRONO_BACKEND_URL=base;sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoSfxEnabled','0');localStorage.setItem('tronoMusicEnabled','0');localStorage.setItem('mnDesktopNoiseMode','native');localStorage.setItem('tronoNoiseSuppression',desktop?'1':'0');localStorage.setItem('mnMicrophoneGain','100');localStorage.setItem('mnVoiceProtection','1');
 window.__voicePeers=[];window.__microphoneCaptures=[];
 const Peer=RTCPeerConnection;window.RTCPeerConnection=class extends Peer{constructor(config){super({...config,iceServers:[],iceCandidatePoolSize:0});window.__voicePeers.push(this);}};
 const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{const stream=await capture(c);if(c.audio)window.__microphoneCaptures.push(stream);return stream;};
}
test('Windows microphone sends continuous PCM with the real app minimized, covered and hidden',{timeout:210000,skip:process.platform!=='win32'&&'Requires real Windows window scheduling'},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mn-background-voice-'));let app,browser,fixture,server,phase='setup',finished=false;const errors=[],evidence=[];
 t.signal.addEventListener('abort',()=>{if(!finished){console.error('Background voice stalled at '+phase);killTestApp(app);}},{once:true});
 try{
  server=await new Promise(resolve=>{const s=express().use(express.static(path.join(root,'frontend'))).listen(0,'127.0.0.1',()=>resolve(s));});const peerOrigin='http://127.0.0.1:'+server.address().port;
  fixture=await startFixture({port:10749,allowedOrigins:[origin,peerOrigin]});
  async function account(email,nickname){await fixture.call('signup',{email,nickname,password:'Background12!'});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});return (await fixture.call('login',{email,password:'Background12!'})).data;}
  const sender=await account('background-sender@example.test','Microfone em segundo plano'),receiver=await account('background-receiver@example.test','Ouvinte de teste');
  browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio']});
  const context=await browser.newContext({permissions:['microphone']});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const listener=await context.newPage();
  // Decode the existing speech fixture to a looping WAV for Chromium's actual
  // microphone capture service. No oscillator/JS timer generates sender PCM.
  const wav=await listener.evaluate(async b64=>{
   const ctx=new AudioContext({sampleRate:48000}),buffer=await ctx.decodeAudioData(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer),audio=buffer.getChannelData(0),bytes=new Uint8Array(44+audio.length*2),view=new DataView(bytes.buffer),label=(offset,s)=>{for(let i=0;i<s.length;i++)bytes[offset+i]=s.charCodeAt(i);};
   label(0,'RIFF');view.setUint32(4,bytes.length-8,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,48000,true);view.setUint32(28,96000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,audio.length*2,true);for(let i=0;i<audio.length;i++)view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,audio[i]))*32767),true);await ctx.close();let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);
  },(await fs.readFile(path.join(root,'tests/fixtures/speech-flite.ogg'))).toString('base64'));
  const wavPath=path.join(directory,'speech.wav');await fs.writeFile(wavPath,Buffer.from(wav,'base64'));
  app=await _electron.launch({executablePath:require('../desktop/app/node_modules/electron'),args:[path.join(root,'desktop/app'),'--user-data-dir='+path.join(directory,'profile'),'--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+wavPath,'--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio'],timeout:35000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>{global.__backgroundWindow=BrowserWindow.getAllWindows()[0];});page.setDefaultTimeout(12000);await page.route('https://a-lei-do-trono-server.onrender.com/**',r=>r.abort());await page.addInitScript(initialize,{base:fixture.base,data:sender,desktop:true});await page.waitForLoadState('load');await page.evaluate(()=>window.TronoAuth.ready);await page.reload();await page.evaluate(()=>window.TronoAuth.ready);page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(initialize,{base:fixture.base,data:receiver,desktop:false});await listener.goto(peerOrigin);await listener.evaluate(()=>window.TronoAuth.ready);listener.on('pageerror',e=>errors.push(e.message));
  for(const client of [page,listener]){await client.evaluate(async()=>{await window.TronoChatHub.enter({channelId:'chat-jogos'});if(!window.TronoSocial.voiceJoined)await window.TronoSocial.joinVoice();});await expect.poll(()=>client.evaluate(()=>window.TronoSocial.voiceJoined)).toBe(true);}
  await expect.poll(()=>listener.locator('#remoteAudioHost audio').count()).toBe(1);await expect.poll(()=>page.evaluate(()=>window.__voicePeers.some(pc=>pc.connectionState==='connected')),{timeout:20000}).toBe(true);
  // Measure the audio received by the other client, not just a local track's
  // readyState or the page timer. Each worklet reports independently of UI work.
  await listener.evaluate(async()=>{
   const ctx=new AudioContext({sampleRate:48000});await ctx.resume();window.__receiveContext=ctx;
   const code=`class Check extends AudioWorkletProcessor{constructor(){super();this.frames=0;this.energy=0;this.finite=true;this.port.onmessage=()=>{this.frames=0;this.energy=0;this.finite=true;this.active=true;};}process(inputs){if(!this.active)return true;const samples=inputs[0]?.[0];if(!samples)return true;for(const v of samples){this.frames++;this.energy+=v*v;this.finite&&=Number.isFinite(v);}if(this.frames>=sampleRate*5){this.active=false;this.port.postMessage({frames:this.frames,rms:Math.sqrt(this.energy/this.frames),finite:this.finite});}return true;}}registerProcessor('background-receive',Check);`;
   const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);const meter=new AudioWorkletNode(ctx,'background-receive'),source=ctx.createMediaStreamSource(document.querySelector('#remoteAudioHost audio').srcObject),mute=ctx.createGain();mute.gain.value=0;source.connect(meter);meter.connect(mute);mute.connect(ctx.destination);window.__receiveMeter=meter;
   window.__sampleReceive=async()=>{const stats=async()=>{for(const pc of window.__voicePeers)for(const [,s]of await pc.getStats())if(s.type==='inbound-rtp'&&s.kind==='audio')return {samples:s.totalSamplesReceived||0,concealed:s.concealedSamples||0,packets:s.packetsReceived||0};throw Error('No incoming voice RTP');};const before=await stats(),start=performance.now();const pcm=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No PCM from background sender')),9000);meter.port.onmessage=e=>{clearTimeout(timer);resolve(e.data);};meter.port.postMessage('sample');});const after=await stats();return {...pcm,elapsed:performance.now()-start,samples:after.samples-before.samples,concealed:after.concealed-before.concealed,packets:after.packets-before.packets};};
  });
  async function windowMode(mode){
   await app.evaluate(({BrowserWindow},mode)=>{const win=global.__backgroundWindow;global.__voiceCover?.destroy();global.__voiceCover=null;win.restore();win.show();win.focus();if(mode==='minimized')win.minimize();if(mode==='hidden')win.hide();if(mode==='covered'){const cover=new BrowserWindow({...win.getBounds(),alwaysOnTop:true,backgroundColor:'#202633',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});global.__voiceCover=cover;void cover.loadURL('about:blank');cover.show();cover.focus();}},mode);
   await new Promise(r=>setTimeout(r,500));
   const state=await app.evaluate(({app},mode)=>{const win=global.__backgroundWindow,pid=win.webContents.getOSProcessId(),os=process.getBuiltinModule('node:os');return {mode,visible:win.isVisible(),minimized:win.isMinimized(),focused:win.isFocused(),priority:os.getPriority(pid),normal:os.constants.priority.PRIORITY_NORMAL,backgroundThrottling:win.webContents.getBackgroundThrottling()};},mode);
   if(mode==='minimized')assert(state.minimized);if(mode==='hidden')assert(!state.visible);if(mode==='covered')assert(!state.focused);assert.equal(state.backgroundThrottling,false);assert(state.priority<=state.normal,JSON.stringify(state));return state;
  }
  for(const [mode,gain]of [['native',100],['native',180],['rnnoise',100]]){
   phase=mode+' '+gain;await windowMode('foreground');await page.locator('#micGainSlider').evaluate((n,v)=>{n.value=String(v);n.dispatchEvent(new Event('input',{bubbles:true}));},gain);
   if(mode==='rnnoise'){await page.locator('#noiseModeSelect').evaluate(n=>{n.value='rnnoise';n.dispatchEvent(new Event('change',{bubbles:true}));});await expect.poll(()=>page.evaluate(()=>window.TronoSocial.noiseState.mode),{timeout:20000}).toBe('rnnoise');}
   else await expect.poll(()=>page.evaluate(()=>window.TronoSocial.noiseState.mode)).toBe('native');
   const before=await page.evaluate(()=>{window.__beforeBackground={track:window.TronoSocial.getLocalAudioTrack(),peers:window.__voicePeers.filter(pc=>pc.connectionState==='connected'),captures:window.__microphoneCaptures.length};return {direct:window.TronoSocial.getLocalAudioTrack()===window.__microphoneCaptures.at(-1).getAudioTracks()[0]};});assert.equal(before.direct,mode==='native'&&gain===100);
   const baseline=await listener.evaluate(()=>window.__sampleReceive());assert(baseline.rms>.003,JSON.stringify({mode,gain,baseline}));
   for(const visibility of ['covered','minimized','hidden']){
    phase=mode+' '+gain+' '+visibility;const state=await windowMode(visibility),pcm=await listener.evaluate(()=>window.__sampleReceive());
    const same=await page.evaluate(()=>{const before=window.__beforeBackground;return window.TronoSocial.voiceJoined&&window.TronoSocial.getLocalAudioTrack()===before.track&&before.track.enabled&&before.track.readyState==='live'&&before.captures===window.__microphoneCaptures.length&&before.peers.every(pc=>pc.connectionState==='connected');});assert(same,'Background must not reopen the microphone or reconnect');assert(pcm.finite);assert(pcm.frames>=240000);assert(pcm.elapsed<7500,JSON.stringify(pcm));assert(pcm.rms>Math.max(.002,baseline.rms*.25),JSON.stringify({baseline,pcm}));assert(pcm.packets>100);assert(pcm.samples>200000);assert(pcm.concealed/pcm.samples<.04,JSON.stringify(pcm));evidence.push({mode,gain,state,pcm});console.log('Windows background outgoing PCM:',JSON.stringify(evidence.at(-1)));
   }
  }
  await windowMode('foreground');await page.locator('#muteMicBtn').click();assert.equal(await page.evaluate(()=>window.TronoSocial.getLocalAudioTrack().enabled),false);await page.locator('#muteMicBtn').click();assert.equal(await page.evaluate(()=>window.TronoSocial.getLocalAudioTrack().enabled),true);
  assert.deepEqual(errors,[]);await fs.mkdir(path.join(root,'artifacts'),{recursive:true});await fs.writeFile(path.join(root,'artifacts/windows-background-voice.json'),JSON.stringify(evidence,null,2));
 }catch(error){error.message='Background voice phase '+phase+': '+error.message;throw error;}
 finally{finished=true;await closeTestApp(app);await browser?.close();await fixture?.stop();if(server)await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});}
});
