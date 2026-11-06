'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const express=require('express'),{createFiles}=require('../server/files.ts'),{validateSound}=require('../server/soundboard.ts');
function wave(seconds,rate=16000,channels=1){
  const size=seconds*rate*channels*2,b=Buffer.alloc(44+size);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;
}
test('sound duration comes from validated PCM samples, including exact 15-second boundary',()=>{
  assert.equal(validateSound(wave(15,48000,2)).durationMs,15000);
  assert.throws(()=>validateSound(wave(16)),e=>e.code==='SOUND_TOO_LONG');
  const forged=wave(1);forged.writeUInt32LE(1,40);assert.throws(()=>validateSound(forged),e=>e.code==='INVALID_SOUND');
  const badRate=wave(1);badRate.writeUInt32LE(1,28);assert.throws(()=>validateSound(badRate),e=>e.code==='INVALID_SOUND');
  assert.throws(()=>validateSound(Buffer.from('renamed-mp3')),e=>e.code==='INVALID_SOUND');
});
test('HTTP sound uploads, authenticated library, owner deletion and admin photo moderation',async()=>{
  const owner=crypto.randomUUID(),other=crypto.randomUUID(),admin=crypto.randomUUID(),rows=new Map(),objects=new Map(),removed=[];
  const accounts={owner:{id:owner,role:'member'},other:{id:other,role:'member'},admin:{id:admin,role:'admin'}};
  const auth={configured:true,allowedOrigins:new Set(['https://app.example.test']),tokenFrom:req=>(req.headers.authorization||'').replace('Bearer ',''),identity:async token=>{if(!accounts[token])throw Object.assign(Error('Entre na conta'),{status:401,code:'AUTH_REQUIRED'});return accounts[token];}};
  function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}
  const fetchImpl=async(input,options)=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):{},id=url.searchParams.get('id')?.replace(/^eq\./,'');
    if(url.pathname.endsWith('/rpc/reserve_chat_file')){const row={id:body.p_id,owner_id:body.p_owner,object_key:body.p_key,name:body.p_name,bytes:body.p_bytes,mime:body.p_mime,kind:body.p_kind,room_id:body.p_room,state:'pending',created_at:new Date().toISOString()};rows.set(row.id,row);return reply(row);}
    if(url.pathname.endsWith('/rpc/mark_chat_file_deleting')){const row=rows.get(body.p_id);assert.equal(row.owner_id,body.p_owner);row.state='deleting';return reply(row);}
    if(url.pathname.endsWith('/rpc/chat_storage_usage'))return reply([...rows.values()].reduce((n,r)=>n+r.bytes,0));
    if(options.method==='PATCH'){Object.assign(rows.get(id),body);return reply([rows.get(id)]);}
    if(options.method==='DELETE'){rows.delete(id);return reply(null);}
    let list=id?[rows.get(id)].filter(Boolean):[...rows.values()];
    for(const key of ['kind','owner_id','state','room_id']){const filter=url.searchParams.get(key);if(filter?.startsWith('eq.'))list=list.filter(r=>r[key]===filter.slice(3));}
    return reply(list);
  };
  const adapter={put:async(key,body,size)=>{const chunks=[];for await(const c of body)chunks.push(c);const b=Buffer.concat(chunks);assert.equal(b.length,size);objects.set(key,b);},remove:async key=>{removed.push(key);objects.delete(key);},url:row=>'https://storage.example.test/'+row.id};
  const app=express(),files=createFiles({auth,env:{SUPABASE_URL:'https://db.example.test',SUPABASE_SECRET_KEY:'sb_secret_test_only',R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET:'tests',R2_ACCESS_KEY_ID:'test-only',R2_SECRET_ACCESS_KEY:'test-only'},membership:()=>true,canAttach:(_id,room)=>room==='text',fetchImpl,adapter});files.install(app);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
  async function request(route,{token='owner',method='GET',body,headers={}}={}){const response=await fetch(base+'/files'+route,{method,headers:{Authorization:'Bearer '+token,Origin:'https://app.example.test',...headers},...(body?{body}:{})});return {status:response.status,data:await response.json()};}
  async function upload(body){return request('/upload',{method:'POST',body,headers:{'X-File-Kind':'soundboard','X-File-Name':'efeito.wav','Content-Type':'audio/wav','X-Duration-Ms':'1'}});}
  try{
    const sound=await upload(wave(15));assert.equal(sound.status,200);assert.equal(sound.data.file.durationMs,15000);assert.equal(objects.size,1);
    assert.equal((await upload(wave(16))).data.error.code,'SOUND_TOO_LONG');assert.equal(objects.size,1);
    assert.equal((await upload(Buffer.from('not audio'))).data.error.code,'INVALID_SOUND');
    const library=await request('/soundboard',{token:'other'});assert.equal(library.data.files.length,1);assert.equal(library.data.files[0].durationMs,15000);
    assert.equal((await request('/soundboard',{token:'guest'})).status,401);
    assert.equal((await request('/'+sound.data.file.id,{token:'other',method:'DELETE'})).status,403);
    assert.equal((await request('/'+sound.data.file.id,{token:'owner',method:'DELETE'})).status,200);assert.equal(objects.size,0);
    const photo={id:crypto.randomUUID(),owner_id:owner,object_key:'chat/photo',name:'foto.png',kind:'chat',room_id:'text',state:'ready',mime:'image/png',bytes:100,created_at:new Date().toISOString()};rows.set(photo.id,photo);objects.set(photo.object_key,Buffer.alloc(100));
    assert.equal((await request('/channel/text',{token:'other'})).data.files[0].id,photo.id);
    assert.equal((await request('/'+photo.id,{token:'other',method:'DELETE'})).status,403);
    assert.equal((await request('/'+photo.id,{token:'admin',method:'DELETE'})).status,200);assert(removed.includes('chat/photo'));
    const voiceUpload=await request('/upload',{method:'POST',body:Buffer.from('%PDF-1.7'),headers:{'X-Room-Id':'voice','X-File-Kind':'chat'}});assert.equal(voiceUpload.status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
