'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {createLocalClipCapture}=require('../src/lib/clips/local-capture.ts');
function stream() { const video=new EventTarget(); video.readyState='live';video.stops=0;video.stop=()=>{video.stops++;video.readyState='ended';};return {getTracks:()=>[video],getVideoTracks:()=>[video],video}; }
test('local capture is off until explicit start, reuses one request and stops only its own tracks',async()=>{
 const own=stream(),borrowed=stream();let captures=0,stopped;
 const c=createLocalClipCapture({capture:async()=>{captures++;return own;},started:async s=>assert.equal(s,own),stopped:s=>stopped=s});
 assert.equal(captures,0);assert.equal(c.getSnapshot().active,false);
 await Promise.all([c.start(),c.start()]);assert.equal(captures,1);assert.equal(c.getSnapshot().active,true);
 c.stop();assert.equal(stopped,own);assert.equal(own.video.stops,1);assert.equal(borrowed.video.stops,0);c.dispose();
});
test('stopping while the picker is pending releases late permission without starting replay',async()=>{
 let resolve,started=0;const own=stream();const c=createLocalClipCapture({capture:()=>new Promise(r=>resolve=r),started:async()=>{started++;},stopped:()=>{}});
 const pending=c.start();c.stop();resolve(own);await pending;assert.equal(started,0);assert.equal(own.video.stops,1);assert.equal(c.getSnapshot().active,false);
});
test('source end, failed replay setup and disposal release capture and permit no automatic restart',async()=>{
 const own=stream();let calls=0;const c=createLocalClipCapture({capture:async()=>{calls++;return own;},started:async()=>{},stopped:()=>{}});
 await c.start();own.video.dispatchEvent(new Event('ended'));assert.equal(c.getSnapshot().active,false);assert.equal(own.video.stops,1);c.dispose();await c.start();assert.equal(calls,1);
 const failed=stream();const d=createLocalClipCapture({capture:async()=>failed,started:async()=>{throw Error('encoder failed');},stopped:()=>{}});await d.start();assert.equal(failed.video.stops,1);assert.match(d.getSnapshot().message,/encoder failed/);
});
test('a replay failure keeps its reason, releases the selected source once and requires an explicit restart',async()=>{
 const sources=[stream(),stream()];let captures=0,stops=0;
 const c=createLocalClipCapture({capture:async()=>sources[captures++],started:async()=>{},stopped:()=>stops++});
 await c.start();c.stop('Microfone interrompido. Escolha Sem som.');
 assert.equal(c.getSnapshot().message,'Microfone interrompido. Escolha Sem som.');
 assert.equal(c.getSnapshot().active,false);assert.equal(stops,1);assert.equal(sources[0].video.stops,1);assert.equal(captures,1);
 sources[0].video.dispatchEvent(new Event('ended'));assert.equal(c.getSnapshot().message,'Microfone interrompido. Escolha Sem som.');
 await c.start();assert.equal(c.getSnapshot().active,true);assert.equal(captures,2);c.dispose();
});
test('source ended reports its own reason instead of passing the Event as a stop message',async()=>{
 const own=stream();const c=createLocalClipCapture({capture:async()=>own,started:async()=>{},stopped:()=>{}});
 await c.start();own.video.dispatchEvent(new Event('ended'));
 assert.equal(typeof c.getSnapshot().message,'string');assert.match(c.getSnapshot().message,/tela.*janela.*encerr/i);assert.equal(own.video.stops,1);c.dispose();
});
