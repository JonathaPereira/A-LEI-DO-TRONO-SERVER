'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const express=require('express'),{chromium}=require('@playwright/test');

test('real RNNoise worklet reduces stationary noise while retaining speech; destroys cleanly', {timeout:30000},async()=>{
  const app=express();app.get('/',(_,res)=>res.send('<script src="/noise-suppression.js"></script>'));
  app.get('/speech.ogg',(_,res)=>res.sendFile(path.resolve(__dirname,'fixtures/speech-flite.ogg')));
  app.use(express.static(path.resolve(__dirname,'../out')));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.AUTH_TEST_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
    const metrics=await page.evaluate(async()=>{
      const ctx=new AudioContext({sampleRate:48000});await ctx.resume();
      const rn=await window.TronoNoise.create(ctx);
      const speech=await ctx.decodeAudioData(await (await fetch('/speech.ogg')).arrayBuffer());
      const duration=2.5+speech.duration+1,length=Math.ceil(duration*ctx.sampleRate),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0),voice=speech.getChannelData(0);let seed=7341;
      for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=.02*(seed/4294967296*2-1)+.025*Math.sin(i*2*Math.PI*110/ctx.sampleRate);}
      for(let i=0;i<voice.length;i++)data[i+120000]+=voice[i];
      const code=`class Meter extends AudioWorkletProcessor {
        constructor(o){super();this.frames=0;this.started=false;this.sent=false;this.stats={noiseIn:0,noiseOut:0,voiceIn:0,voiceOut:0,noiseCount:0,voiceCount:0,finite:true};this.total=o.processorOptions.total;this.voiceEnd=o.processorOptions.voiceEnd;}
        process(inputs){const raw=inputs[0]?.[0],clean=inputs[1]?.[0];if(!raw)return true;for(let i=0;i<raw.length;i++){
          if(!this.started&&Math.abs(raw[i])>.000001)this.started=true;if(!this.started)continue;const sec=this.frames++/sampleRate,kind=sec>=.8&&sec<2?'noise':sec>=3&&sec<this.voiceEnd?'voice':null;
          if(kind){this.stats[kind+'In']+=raw[i]*raw[i];this.stats[kind+'Out']+=(clean?.[i]||0)**2;this.stats[kind+'Count']++;this.stats.finite&&=Number.isFinite(clean?.[i]);}
          if(!this.sent&&this.frames>=this.total){this.sent=true;this.port.postMessage(this.stats);}
        }return true;}}
        registerProcessor('rnnoise-test-meter',Meter);`;
      const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));try{await ctx.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}
      const meter=new AudioWorkletNode(ctx,'rnnoise-test-meter',{numberOfInputs:2,numberOfOutputs:1,processorOptions:{total:length-128,voiceEnd:2.5+speech.duration-.3}});
      const source=ctx.createBufferSource();source.buffer=buffer;source.connect(rn.node);source.connect(meter,0,0);rn.node.connect(meter,0,1);meter.connect(ctx.destination);
      const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No processed audio samples received.')),15000);meter.port.onmessage=e=>{clearTimeout(timer);resolve(e.data);};source.start();});
      source.stop();source.disconnect();rn.destroy();meter.disconnect();meter.port.close();await ctx.close();
      return {noiseRatio:Math.sqrt(result.noiseOut/result.noiseIn),voiceRatio:Math.sqrt(result.voiceOut/result.voiceIn),voiceRms:Math.sqrt(result.voiceOut/result.voiceCount),finite:result.finite,noiseCount:result.noiseCount,voiceCount:result.voiceCount};
    });
    console.log('RNNoise measured audio:',JSON.stringify(metrics));
    assert(metrics.finite);assert(metrics.noiseCount>40000);assert(metrics.voiceCount>100000);
    assert(metrics.noiseRatio<.5,'stationary noise must lose at least 6 dB');
    assert(metrics.voiceRatio>.2,'speech must remain audible instead of muting every input');assert(metrics.voiceRms>.01);
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
