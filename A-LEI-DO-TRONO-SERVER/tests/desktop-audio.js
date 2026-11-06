'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const executable=path.resolve(__dirname,'../artifacts/native-audio/Release/MN-Application-Audio.exe');
function start(args){const child=spawn(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});child.stdin.on('error',()=>{});let log='';child.firstStatus=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Native audio startup timed out')),20000);child.on('error',error=>{clearTimeout(timeout);reject(error);});child.stderr.on('data',chunk=>{log+=chunk;const end=log.indexOf('\n');if(end>=0){clearTimeout(timeout);try{resolve(JSON.parse(log.slice(0,end)));}catch{reject(Error(log));}}});child.once('close',()=>{clearTimeout(timeout);if(!log)reject(Error('Native audio exited before startup'));});});return child;}
function stop(child){if(!child)return;child.stdin.end('q');const timeout=setTimeout(()=>child.kill(),2000);timeout.unref();child.once('close',()=>clearTimeout(timeout));}
function energy(samples,frequency){const coefficient=2*Math.cos(2*Math.PI*frequency/44100);let a=0,b=0;for(const sample of samples){const value=sample+coefficient*a-b;b=a;a=value;}return a*a+b*b-coefficient*a*b;}
test('Windows application loopback captures the selected process and excludes a second process',{timeout:70000},async t=>{
  const probe=spawnSync(executable,['--probe'],{encoding:'utf8',timeout:10000});assert.equal(probe.status,0,probe.stderr);assert.equal(JSON.parse(probe.stdout).available,true);
  let selected,other,capture;
  t.signal.addEventListener('abort',()=>{for(const child of [selected,other,capture])child?.kill();},{once:true});
  try{
    selected=start(['--test-tone','440']);other=start(['--test-tone','880']);
    const sources=await Promise.all([selected.firstStatus,other.firstStatus]);
    // Hosted Windows runners can have no audio endpoint. Do not hide API,
    // format or isolation failures when an actual endpoint is available.
    const missingDevice=new Set([0x80070490,0x88890010,0x800706ba]);
    if(sources.some(status=>status.type==='error'&&missingDevice.has(status.code))){t.skip('Windows runner has no active audio output endpoint; isolation needs a physical/virtual playback device.');return;}
    assert(sources.every(status=>status.type==='tone-ready'),JSON.stringify(sources));
    capture=start(['--pid',String(selected.pid)]);let buffered=Buffer.alloc(0),samples=[];
    const recorded=new Promise((resolve,reject)=>{capture.stdout.on('data',chunk=>{buffered=Buffer.concat([buffered,chunk]);while(buffered.length>=4){const size=buffered.readUInt32LE();if(size>1024*1024)return reject(Error('Invalid native PCM frame'));if(buffered.length<size+4)break;const pcm=buffered.subarray(4,4+size);for(let offset=0;offset<pcm.length;offset+=4)samples.push(pcm.readInt16LE(offset)/32768);buffered=buffered.subarray(4+size);if(samples.length>=44100)resolve();}});capture.once('close',()=>reject(Error('Capture ended before one second of audio')));});
    recorded.catch(()=>{}); // Startup errors are asserted below; avoid an orphan rejection on cleanup.
    assert.equal((await capture.firstStatus).type,'ready');await recorded;
    const signal=energy(samples,440),excluded=energy(samples,880);assert(signal>1,'selected process must produce audible PCM');assert(signal>excluded*64,'audio from the other process must be excluded');
  }finally{stop(capture);stop(selected);stop(other);}
});
