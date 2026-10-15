'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),express=require('express'),{chromium}=require('@playwright/test');
test('light filter measures background attenuation, speech retention and clean teardown without RNNoise',{timeout:30000},async()=>{
  const app=express().get('/',(_,res)=>res.send('<script src="/light-noise.js"></script>')).use(express.static(path.resolve('frontend')));
  app.get('/speech.ogg',(_,res)=>res.sendFile(path.resolve('tests/fixtures/speech-flite.ogg')));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});let browser;
  try{
    browser=await chromium.launch({...process.platform==='win32'?{channel:'msedge'}:{executablePath:'/usr/bin/chromium'},headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
    const measured=await page.evaluate(async()=>{
      const ctx=new AudioContext({sampleRate:48000});await ctx.resume();const filter=await window.TronoLightNoise.create(ctx),speech=await ctx.decodeAudioData(await(await fetch('/speech.ogg')).arrayBuffer()),voice=speech.getChannelData(0),length=192000+voice.length+48000,buffer=ctx.createBuffer(1,length,48000),data=buffer.getChannelData(0);let seed=32;
      for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=.012*(seed/4294967296*2-1)+.008*Math.sin(i*2*Math.PI*45/48000);}
      for(let i=0;i<voice.length;i++)data[i+192000]+=voice[i];
      const code=`class Check extends AudioWorkletProcessor{constructor(){super();this.frame=0;this.done=false;this.stats={noiseIn:0,noiseOut:0,voiceIn:0,voiceOut:0,finite:true};}process(inputs){const raw=inputs[0]?.[0],clean=inputs[1]?.[0];if(!raw)return true;for(let i=0;i<raw.length;i++){const t=this.frame++/sampleRate,kind=t>2.8&&t<3.8?'noise':t>4.1&&t<7.8?'voice':null;if(kind){this.stats[kind+'In']+=raw[i]**2;this.stats[kind+'Out']+=(clean?.[i]||0)**2;this.stats.finite&&=Number.isFinite(clean?.[i]);}}if(this.frame>sampleRate*8.4&&!this.done){this.done=true;this.port.postMessage(this.stats);}return true;}}registerProcessor('check-light',Check);`;
      const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);const meter=new AudioWorkletNode(ctx,'check-light',{numberOfInputs:2,numberOfOutputs:1}),source=ctx.createBufferSource();source.buffer=buffer;source.connect(filter.input);source.connect(meter,0,0);filter.node.connect(meter,0,1);const mute=ctx.createGain();mute.gain.value=0;meter.connect(mute);mute.connect(ctx.destination);
      const stats=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Light filter produced no PCM')),13000);meter.port.onmessage=e=>{clearTimeout(timer);resolve(e.data);};source.start();});source.stop();source.disconnect();filter.destroy();filter.destroy();meter.disconnect();meter.port.close();await ctx.close();return {noiseRatio:Math.sqrt(stats.noiseOut/stats.noiseIn),voiceRatio:Math.sqrt(stats.voiceOut/stats.voiceIn),finite:stats.finite};
    });console.log('Light filter measured PCM:',measured);assert(measured.finite);assert(measured.noiseRatio<.7,'background must lose at least 3 dB');assert(measured.voiceRatio>.8,'the filter must retain speech');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
