'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareClipAudio}=require('../src/lib/clips/audio.ts');
function fixture(overrides={}) {
 const track=()=>({kind:'audio',readyState:'live',stop(){this.readyState='ended';}}),sound=track(),mic=track(),mixed=track(),tracks=[sound];
 const stream={getAudioTracks:()=>tracks.filter(t=>t.kind==='audio'),removeTrack:t=>tracks.splice(tracks.indexOf(t),1),addTrack:t=>tracks.push(t)};
 const inputs=[];let requests=0,closed=0;
 const environment={enabled:true,stream,isCurrent:()=>true,borrowMicrophone:()=>null,getMicrophone:async()=>{requests++;return {getTracks:()=>[mic],getAudioTracks:()=>[mic]};},createStream:t=>({getTracks:()=>t}),createContext:()=>({state:'running',createMediaStreamDestination:()=>({stream:{getAudioTracks:()=>[mixed]}}),createMediaStreamSource:s=>{inputs.push(s.getTracks());return {connect(){},disconnect(){}};},close:async()=>{closed++;}}),...overrides};
 return {environment,sound,mic,mixed,stream,inputs,get requests(){return requests;},get closed(){return closed;}};
}
test('silent clips remove only cloned capture audio and never request a microphone',async()=>{const f=fixture({enabled:false});const resource=await prepareClipAudio(f.environment);assert.equal(f.requests,0);assert.equal(f.sound.readyState,'ended');assert.equal(f.stream.getAudioTracks().length,0);resource.dispose();});
test('clips outside a call mix selected audio and an explicitly acquired microphone, releasing both owned inputs',async()=>{const f=fixture();const resource=await prepareClipAudio(f.environment);assert.equal(f.requests,1);assert.deepEqual(f.inputs,[[f.sound],[f.mic]]);assert.deepEqual(f.stream.getAudioTracks(),[f.mixed]);assert(resource.microphone);resource.dispose();resource.dispose();assert.equal(f.sound.readyState,'ended');assert.equal(f.mic.readyState,'ended');assert.equal(f.mixed.readyState,'ended');assert.equal(f.closed,1);});
test('a borrowed call microphone keeps its identity, mute state and lifetime when clip audio ends',async()=>{const mic={kind:'audio',readyState:'live',enabled:false,stop(){throw Error('borrowed microphone stopped');}};const f=fixture({borrowMicrophone:()=>mic});const resource=await prepareClipAudio(f.environment);assert.equal(f.requests,0);assert.equal(f.inputs[1][0],mic);resource.dispose();assert.equal(mic.enabled,false);assert.equal(mic.readyState,'live');});
test('cancelled microphone permission releases a late stream without starting an audio graph',async()=>{let resolve,current=true;const f=fixture({isCurrent:()=>current,getMicrophone:()=>new Promise(r=>resolve=r)});const pending=prepareClipAudio(f.environment);current=false;resolve({getTracks:()=>[f.mic],getAudioTracks:()=>[f.mic]});await assert.rejects(pending,/encerrada/);assert.equal(f.mic.readyState,'ended');assert.equal(f.inputs.length,0);});
test('clip microphone follows call entry and exit while retaining one mixed output and never stopping a borrowed track',async()=>{let borrowed=null,refresh,unsubscribed=0;const owned=[];const track=()=>({kind:'audio',readyState:'live',stop(){this.readyState='ended';}});const callMic=track();const f=fixture({borrowMicrophone:()=>borrowed,getMicrophone:async()=>{const t=track();owned.push(t);return {getTracks:()=>[t],getAudioTracks:()=>[t]};},subscribeMicrophone:fn=>{refresh=fn;return ()=>unsubscribed++;}});const resource=await prepareClipAudio(f.environment);assert.equal(owned.length,1);borrowed=callMic;refresh();await new Promise(r=>setImmediate(r));assert.equal(owned[0].readyState,'ended');assert.equal(f.stream.getAudioTracks()[0],f.mixed);borrowed=null;callMic.readyState='ended';refresh();await new Promise(r=>setImmediate(r));assert.equal(owned.length,2);assert.equal(owned[1].readyState,'live');resource.dispose();assert.equal(owned[1].readyState,'ended');assert.equal(unsubscribed,1);});
test('aborting active clip audio immediately releases its own microphone without waiting for encoder preparation',async()=>{const controller=new AbortController(),f=fixture({signal:controller.signal});await prepareClipAudio(f.environment);controller.abort();assert.equal(f.mic.readyState,'ended');assert.equal(f.mixed.readyState,'ended');assert.equal(f.closed,1);});
for(const [name,constraint,pattern] of [
 ['NotAllowedError',undefined,/Microfone não autorizado.*Sem som/],
 ['NotFoundError',undefined,/Microfone não encontrado.*Sem som/],
 ['NotReadableError',undefined,/Não foi possível abrir o microfone.*Sem som/],
 ['OverconstrainedError','deviceId',/microfone selecionado.*Sem som/],
])test('microphone startup '+name+' explains the shared audio failure and releases only owned inputs',async()=>{
 const error=Object.assign(new Error('Device failed'),{name,constraint});
 const f=fixture({getMicrophone:async()=>{throw error;}});
 await assert.rejects(prepareClipAudio(f.environment),pattern);
 assert.equal(f.sound.readyState,'ended');assert.equal(f.mic.readyState,'live');assert.equal(f.closed,0);
});
