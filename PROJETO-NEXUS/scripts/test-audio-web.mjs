// Measure actual PCM at the browser output, not merely AudioStreamPlayer.playing.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createGameServer} from './serve-game.mjs';
const game=createGameServer();await new Promise(r=>game.listen(0,'127.0.0.1',r));
const gameURL=`http://127.0.0.1:${game.address().port}`;
const host=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(`<style>html,body{margin:0}iframe{width:1600px;height:900px;border:0}</style><iframe src="${gameURL}/?pvp=1" allow="autoplay; fullscreen"></iframe>`)});
await new Promise(r=>host.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const measurements=[];
try {
 for(const embedded of [false,true]) {
  console.log('Verificando áudio:',embedded?'iframe':'direto');
  const context=await browser.newContext({viewport:{width:1600,height:900}});
  await context.addInitScript(()=>{
   window.__audioPeak=0;window.__analysers=[];window.__contexts=[];
   const Original=window.AudioContext;
   window.AudioContext=class extends Original{constructor(...args){super(...args);__contexts.push(this)}};
   const connect=AudioNode.prototype.connect;
   AudioNode.prototype.connect=function(destination,...args){
    const result=connect.call(this,destination,...args);
    if(destination===this.context.destination){
     const analyser=this.context.createAnalyser();analyser.fftSize=2048;connect.call(this,analyser);
     // Keep the measurement branch in the rendering graph without doubling the sound.
     const silent=this.context.createGain();silent.gain.value=0;connect.call(analyser,silent);connect.call(silent,this.context.destination);__analysers.push(analyser);
    }
    return result;
   };
   setInterval(()=>{for(const analyser of __analysers){const values=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(values);for(const value of values)__audioPeak=Math.max(__audioPeak,Math.abs(value))}},20);
  });
  const page=await context.newPage();const errors=[],warnings=[];
  const recordError=message=>{
   // Chromium denies optional service-worker inspection in a third-party frame.
   // The non-PWA, single-threaded export does not require service workers.
   if(embedded && message.startsWith('Failed to get a ServiceWorkerRegistration:'))warnings.push(message);
   else errors.push(message);
  };
  page.on('pageerror',e=>recordError(e.message));page.on('console',m=>{if(m.type()==='error')recordError(m.text())});
  await page.goto(embedded?`http://localhost:${host.address().port}`:gameURL+'/?pvp=1');
  const frame=embedded?await(await page.waitForSelector('iframe')).contentFrame():page.mainFrame();
  await frame.waitForFunction(()=>!document.querySelector('#status'),null,{timeout:90000});await page.waitForTimeout(1800);
  await page.mouse.click(1500,45,{delay:120});await page.waitForTimeout(400);
  const sample=async(x,y)=>{await frame.evaluate(()=>window.__audioPeak=0);await page.mouse.click(x,y,{delay:120});try{await frame.waitForFunction(()=>window.__audioPeak>.003,null,{timeout:20000})}catch(e){await mkdir('artifacts/audio-web',{recursive:true});await page.screenshot({path:`artifacts/audio-web/failure-${embedded}.png`});console.error(await frame.evaluate(()=>({peak:__audioPeak,states:__contexts.map(c=>c.state),nodes:__analysers.length})));throw e}await page.waitForTimeout(400);return frame.evaluate(()=>({peak:__audioPeak,states:__contexts.map(c=>c.state)}));};
  const voice=await sample(790,395);await page.waitForTimeout(5000);
  const effect=await sample(790,627);await page.waitForTimeout(2000);
  // Disable the effects path: the same preview must now produce silence.
  await page.mouse.click(790,521,{delay:120});await page.waitForTimeout(500);await frame.evaluate(()=>window.__audioPeak=0);await page.mouse.click(790,627,{delay:120});await page.waitForTimeout(1800);
  const muted=await frame.evaluate(()=>__audioPeak);assert(muted<.0001,'Disabled effects must produce no PCM');
  assert.deepEqual(errors,[]);measurements.push({embedded,voice,effect,muted,warnings});
  await mkdir('artifacts/audio-web',{recursive:true});await page.screenshot({path:`artifacts/audio-web/${embedded?'embedded':'direct'}.png`});
  await context.close();
 }
 await writeFile('artifacts/audio-web/measurements.json',JSON.stringify(measurements,null,2)+'\n');
 console.log('✓ Voz e efeito geraram PCM audível; silenciar efeitos produziu zero. Verificado diretamente e em iframe de outra origem.');console.log(JSON.stringify(measurements));
}finally{await browser.close();await new Promise(r=>game.close(r));await new Promise(r=>host.close(r));}
