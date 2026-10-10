'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,readFileSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {ClipBuffer}=require('../frontend/clip-buffer');

function run(binary,args){
  const result=spawnSync(binary,args,{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.error?.message||result.stderr);
  return result.stdout;
}

test('replay remux handles fragmented EBML, keyframes, audio and bounded retention',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'trono-clips-'));
  try{
    const input=path.join(dir,'source.webm');
    run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=96x64:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libvpx','-b:v','100k','-g','10','-threads','1','-c:a','libopus','-cluster_time_limit','1000','-y',input]);
    const data=readFileSync(input),whole=new ClipBuffer({seconds:3,fps:10});
    whole.append(data);
    await t.test('arbitrary byte boundaries produce the same standalone replay',async()=>{
      const fragmented=new ClipBuffer({seconds:3,fps:10}),sizes=[1,2,7,19,31,67,127,251];
      for(let pos=0,i=0;pos<data.length;i++){
        const end=Math.min(data.length,pos+sizes[i%sizes.length]);fragmented.append(data.subarray(pos,end));pos=end;
      }
      const a=whole.snapshot(),b=fragmented.snapshot();
      assert.deepEqual(Buffer.from(await a.blob.arrayBuffer()),Buffer.from(await b.blob.arrayBuffer()));
      assert(b.duration>=2.8&&b.duration<=4.3,'recent keyframe is kept instead of the full eight seconds');
      const output=path.join(dir,'replay.webm');writeFileSync(output,Buffer.from(await b.blob.arrayBuffer()));
      const info=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,start_time','-of','json',output]));
      assert(info.streams.some(s=>s.codec_name==='vp8'));assert(info.streams.some(s=>s.codec_name==='opus'));
      assert(info.streams.every(s=>Math.abs(Number(s.start_time))<.2),'video and audio timestamps reset together');
      assert(Math.abs(Number(info.format.duration)-b.duration)<.2);
      run('ffmpeg',['-v','error','-i',output,'-f','null','-']);
    });
    await t.test('memory limit shortens a long requested replay and preserves decodability',async()=>{
      const limited=new ClipBuffer({seconds:120,maxBytes:40000,fps:10});
      for(let pos=0;pos<data.length;pos+=4096){const status=limited.append(data.subarray(pos,pos+4096));assert(status.bytes<=40000);}
      const clip=limited.snapshot();assert(clip.duration<8);assert(clip.bytes<42000);
      const output=path.join(dir,'limited.webm');writeFileSync(output,Buffer.from(await clip.blob.arrayBuffer()));
      run('ffmpeg',['-v','error','-i',output,'-f','null','-']);
    });
    await t.test('empty capture and invalid headers fail without returning a fake clip',()=>{
      assert.throws(()=>new ClipBuffer().snapshot(),/Aguarde/);
      assert.throws(()=>new ClipBuffer().append(new Uint8Array([0])),/inválido/);
    });
  }finally{rmSync(dir,{recursive:true,force:true});}
});
