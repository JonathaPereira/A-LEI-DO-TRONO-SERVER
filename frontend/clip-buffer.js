'use strict';
// MediaRecorder chunks are fragments, not standalone videos. Rebuild a WebM
// from retained encoded blocks, starting at a video keyframe, in a Worker.
// No frames are decoded/re-encoded and no audio processing touches the call.
(function(root){
  const ID={EBML:0x1a45dfa3,SEGMENT:0x18538067,INFO:0x1549a966,TRACKS:0x1654ae6b,CLUSTER:0x1f43b675,TIME:0xe7,SIMPLE:0xa3,GROUP:0xa0,BLOCK:0xa1,REFERENCE:0xfb,SCALE:0x2ad7b1,DURATION:0x4489};
  const join=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
  function vint(data,offset,identifier=false){
    if(offset>=data.length)return null;const first=data[offset];let width=1,marker=128;while(width<=8&&!(first&marker)){width++;marker>>=1;}if(width>8)throw Error('Cabeçalho WebM inválido.');if(offset+width>data.length)return null;
    let value=identifier?first:first&(marker-1),unknown=!identifier&&(first&(marker-1))===marker-1;
    for(let i=1;i<width;i++){value=value*256+data[offset+i];unknown=unknown&&data[offset+i]===255;}
    return {value,width,unknown};
  }
  function header(data,offset=0){const id=vint(data,offset,true);if(!id)return null;const size=vint(data,offset+id.width);if(!size)return null;return {id:id.value,size:size.value,unknown:size.unknown,length:id.width+size.width};}
  function number(data){let value=0;for(const b of data)value=value*256+b;return value;}
  function uint(value){const result=[];do{result.unshift(value%256);value=Math.floor(value/256);}while(value);return new Uint8Array(result);}
  function size(value){for(let n=1;n<=7;n++)if(value<2**(7*n)-1){const out=new Uint8Array(n);let v=value;for(let i=n-1;i>=0;i--){out[i]=v%256;v=Math.floor(v/256);}out[0]|=1<<(8-n);return out;}throw Error('Clipe grande demais.');}
  const element=(id,payload)=>join([uint(id),size(payload.length),payload]);
  function children(data){const result=[];let pos=0;while(pos<data.length){const h=header(data,pos);if(!h||h.unknown||pos+h.length+h.size>data.length)throw Error('Elemento WebM incompleto.');result.push({id:h.id,data:data.subarray(pos+h.length,pos+h.length+h.size),offset:pos+h.length});pos+=h.length+h.size;}return result;}
  function block(data){const track=vint(data,0);if(!track||track.width+3>data.length)throw Error('Quadro WebM inválido.');let relative=data[track.width]*256+data[track.width+1];if(relative>=32768)relative-=65536;return {track:track.value,relative,offset:track.width,key:!!(data[track.width+2]&128)};}
  class ClipBuffer{
    constructor({seconds=30,maxBytes=64*1024*1024,fps=30}={}){this.seconds=seconds;this.maxBytes=maxBytes;this.fps=fps;this.pending=new Uint8Array();this.stage='top';this.cluster=null;this.ebml=null;this.info=null;this.tracks=null;this.videoTrack=null;this.scale=1000000;this.frames=[];this.bytes=0;this.end=0;}
    append(data){
      this.pending=join([this.pending,new Uint8Array(data)]);let pos=0;
      while(pos<this.pending.length){
        if(this.cluster&&this.cluster.remaining===0){this.cluster=null;this.stage='segment';}
        const h=header(this.pending,pos);if(!h)break;
        if(h.id===ID.SEGMENT){pos+=h.length;this.stage='segment';continue;}
        if(h.id===ID.CLUSTER){pos+=h.length;this.cluster={tick:0,remaining:h.unknown?null:h.size};this.stage='cluster';continue;}
        if(h.unknown||h.size>this.maxBytes)throw Error('Este formato de gravação não é compatível com clipes.');
        const length=h.length+h.size;if(pos+length>this.pending.length)break;
        const raw=this.pending.slice(pos,pos+length),payload=raw.subarray(h.length);
        if(this.stage==='cluster'){
          if(this.cluster.remaining!==null){this.cluster.remaining-=length;if(this.cluster.remaining<0)throw Error('Bloco WebM inválido.');}
          if(h.id===ID.TIME)this.cluster.tick=number(payload);
          if(h.id===ID.SIMPLE||h.id===ID.GROUP){
            let frame,offset,key;
            if(h.id===ID.SIMPLE){frame=block(payload);offset=h.length+frame.offset;key=frame.key;}
            else{const parts=children(payload),b=parts.find(p=>p.id===ID.BLOCK);if(!b)throw Error('Quadro WebM inválido.');frame=block(b.data);offset=h.length+b.offset+frame.offset;key=!parts.some(p=>p.id===ID.REFERENCE);}
            const tick=this.cluster.tick+frame.relative;
            this.frames.push({raw,offset,tick,key:key&&frame.track===this.videoTrack});this.bytes+=raw.length;this.end=Math.max(this.end,tick);
          }
        }else if(h.id===ID.EBML)this.ebml=raw;
        else if(h.id===ID.INFO){this.info=raw;const scale=children(payload).find(p=>p.id===ID.SCALE);if(scale)this.scale=number(scale.data);if(!this.scale||!Number.isSafeInteger(this.scale))throw Error('Escala de tempo WebM inválida.');}
        else if(h.id===ID.TRACKS){this.tracks=raw;for(const entry of children(payload).filter(p=>p.id===0xae)){const fields=children(entry.data),type=fields.find(p=>p.id===0x83),n=fields.find(p=>p.id===0xd7);if(type&&n&&number(type.data)===1)this.videoTrack=number(n.data);}}
        pos+=length;
      }
      this.pending=this.pending.slice(pos);if(this.pending.length>this.maxBytes)throw Error('O buffer do clipe excedeu o limite local.');this.prune();return this.status();
    }
    prune(){
      const cutoff=this.end-this.seconds*1e9/this.scale;let start=null;for(const f of this.frames)if(f.key&&f.tick<=cutoff)start=f.tick;
      if(start!==null)this.frames=this.frames.filter(f=>{if(f.tick>=start)return true;this.bytes-=f.raw.length;return false;});
      while(this.bytes>this.maxBytes&&this.frames.length)this.bytes-=this.frames.shift().raw.length;
    }
    status(){const key=this.frames.find(f=>f.key);return {ready:!!(key&&this.ebml&&this.info&&this.tracks),seconds:key?Math.max(0,(this.end-key.tick)*this.scale/1e9):0,bytes:this.bytes};}
    snapshot(){
      if(!this.status().ready)throw Error('Aguarde alguns segundos de captura antes de clipar.');
      const cutoff=this.end-this.seconds*1e9/this.scale,keys=this.frames.filter(f=>f.key);let key=keys[0];for(const f of keys)if(f.tick<=cutoff)key=f;
      const base=key.tick,frames=this.frames.filter(f=>f.tick>=base),bucketTicks=Math.min(30000,Math.max(1,Math.floor(1e9/this.scale))),buckets=new Map();
      for(const f of frames){const bucket=Math.floor((f.tick-base)/bucketTicks)*bucketTicks,raw=f.raw.slice(),relative=f.tick-base-bucket;raw[f.offset]=(relative>>8)&255;raw[f.offset+1]=relative&255;if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(raw);}
      const durationTicks=this.end-base+1e9/(this.fps*this.scale),duration=new Uint8Array(8);new DataView(duration.buffer).setFloat64(0,durationTicks);
      const ih=header(this.info),infoParts=children(this.info.subarray(ih.length)).filter(p=>p.id!==ID.DURATION).map(p=>element(p.id,p.data));infoParts.push(element(ID.DURATION,duration));
      const info=element(ID.INFO,join(infoParts)),clusters=[...buckets].sort((a,b)=>a[0]-b[0]).map(([tick,blocks])=>element(ID.CLUSTER,join([element(ID.TIME,uint(tick)),...blocks])));
      // Known segment length and an explicit Duration make the result seekable.
      const segmentSize=info.length+this.tracks.length+clusters.reduce((n,c)=>n+c.length,0),parts=[this.ebml,uint(ID.SEGMENT),size(segmentSize),info,this.tracks,...clusters];
      return {blob:new Blob(parts,{type:'video/webm'}),duration:durationTicks*this.scale/1e9,bytes:parts.reduce((n,p)=>n+p.length,0)};
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={ClipBuffer};
  if(typeof importScripts==='function'){
    let buffer=null;
    root.onmessage=e=>{const {type,id,...args}=e.data;try{if(type==='init'){buffer=new ClipBuffer(args);root.postMessage({type:'ready'});}else if(type==='chunk')root.postMessage({type:'status',...buffer.append(args.data)});else if(type==='clip')root.postMessage({type:'clip',id,...buffer.snapshot()});}catch(error){root.postMessage({type:'error',id,message:error.message});}};
  }
})(globalThis);
