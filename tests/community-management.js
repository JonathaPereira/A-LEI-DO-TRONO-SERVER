'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws');
const {startFixture}=require('./auth-fixture');

function socket(base){return new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws')+'/ws'),queue=[],waiters=[];ws.once('error',reject);ws.on('message',raw=>{const m=JSON.parse(raw),i=waiters.findIndex(w=>w.pred(m));if(i<0)queue.push(m);else{const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(m);}});ws.once('open',()=>resolve({ws,send:m=>ws.send(JSON.stringify(m)),wait(pred){const i=queue.findIndex(pred);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={pred,resolve,timer:setTimeout(()=>reject(Error('WebSocket timeout')),4000)};waiters.push(w);});}}));});}

test('verified creator email, admin grant/revocation, channels and privacy over HTTP/WebSocket',async()=>{
  const f=await startFixture({port:10581,soundboard:true}),sockets=[];
  try{
    async function user(email,nickname){const signup=await f.call('signup',{email,nickname,password:'Senha12!'});assert.equal(signup.status,200);const hash=[...f.links].find(([,v])=>v.user.email===email.toLowerCase())[0];await f.call('verify',{token_hash:hash,type:'signup'});return (await f.call('login',{email,password:'Senha12!'})).data;}
    const creator=await user('JonathaPereira.JJ@gmail.com','Dono'),member=await user('membro@example.test','Membro'),other=await user('outro@example.test','Outro');
    assert.equal(creator.user.role,'creator');assert.equal(member.user.role,'member');
    async function call(path,body,who=creator,method='POST'){
      const response=await fetch(f.base+'/community'+path,{method,headers:{Authorization:'Bearer '+who.session.access_token,Origin:f.appOrigin,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body||{})})});return {status:response.status,data:await response.json()};
    }
    assert.equal((await call('/channels',{name:'Proibido',type:'text'},member)).status,403);
    assert.equal((await call('/roles',{userId:other.user.id,role:'admin'},member)).status,403);
    assert.equal((await call('/roles',{userId:member.user.id,role:'creator'})).status,400);
    assert.equal((await call('/roles',{userId:creator.user.id,role:'member'})).status,403);
    let result=await f.call('profile',{nickname:'Novo Criador',avatar_preset:'crown',community_role:'member'},creator.session.access_token);
    assert.equal(result.data.user.role,'creator');
    assert.equal((await call('/roles',{userId:member.user.id,role:'admin'})).status,200);
    assert.equal((await f.call('me',null,member.session.access_token,f.appOrigin,'GET')).data.user.role,'admin');
    assert.equal((await call('/roles',{userId:other.user.id,role:'admin'},member)).status,403);
    assert.equal((await call('/channels',{name:'Texto',type:'mixed'},member)).status,400);
    const text=(await call('/channels',{name:'Fotos',type:'text'},member)).data.channel;
    const voice=(await call('/channels',{name:'Conversa de voz',type:'voice'},member)).data.channel;
    assert(text.id.startsWith('channel-'));assert.equal(voice.channel_type,'voice');
    const a=await socket(f.base),b=await socket(f.base);sockets.push(a,b);
    for(const [s,u]of [[a,member],[b,other]]){await s.wait(m=>m.type==='welcome');s.send({type:'authenticate',access_token:u.session.access_token});assert((await s.wait(m=>m.type==='auth-result')).ok);}
    a.send({type:'join-room',roomId:text.id});assert.equal((await a.wait(m=>m.type==='joined-room')).room.channelType,'text');
    a.send({type:'voice-prepare',requestId:'text-voice'});assert.equal((await a.wait(m=>m.type==='sfu-response'&&m.requestId==='text-voice')).error.code,'TEXT_CHANNEL');
    a.send({type:'voice-state',joined:true});assert.equal((await a.wait(m=>m.type==='error')).code,'TEXT_CHANNEL');
    a.send({type:'chat-message',text:'Imagem aqui'});assert.equal((await a.wait(m=>m.type==='chat-message')).message.text,'Imagem aqui');
    b.send({type:'join-room',roomId:voice.id});await b.wait(m=>m.type==='joined-room');
    b.send({type:'chat-message',text:'Não é texto'});assert.equal((await b.wait(m=>m.type==='error')).code,'VOICE_CHANNEL');
    b.send({type:'voice-state',joined:true,transport:'p2p',screenFps:60});const roster=(await b.wait(m=>m.type==='voice-roster')).players;assert.equal(roster[0].screenFps,60);assert.equal(roster[0].accountId,other.user.id);
    a.send({type:'soundboard-play',fileId:f.soundId});assert.equal((await a.wait(m=>m.type==='error')).code,'VOICE_REQUIRED');
    b.send({type:'soundboard-play',fileId:f.soundId,volume:999,durationMs:1});const sound=await b.wait(m=>m.type==='soundboard-play');assert.equal(sound.roomId,voice.id);assert.equal(sound.file.durationMs,1000);assert(!('volume' in sound));
    b.send({type:'soundboard-play',fileId:f.soundId});assert.equal((await b.wait(m=>m.type==='error')).code,'SOUND_RATE');
    await new Promise(resolve=>setTimeout(resolve,180));b.send({type:'soundboard-play',fileId:f.soundId});const restarted=await b.wait(m=>m.type==='soundboard-play');assert.notEqual(restarted.id,sound.id);assert(restarted.at>sound.at&&restarted.at-sound.at<1000);
    b.send({type:'soundboard-play',fileId:'40000000-0000-4000-8000-000000000001'});assert.equal((await b.wait(m=>m.type==='error')).code,'SOUND_RATE');
    assert.equal((await call('/channels/'+voice.id,null,member,'DELETE')).status,200);await b.wait(m=>m.type==='channel-deleted'&&m.roomId===voice.id);
    b.send({type:'join-room',roomId:voice.id});assert.equal((await b.wait(m=>m.type==='error')).code,'ROOM_NOT_FOUND');
    assert.equal((await call('/roles',{userId:member.user.id,role:'member'})).status,200);assert.equal((await a.wait(m=>m.type==='role-updated')).role,'member');
    assert.equal((await call('/channels/'+text.id,null,member,'DELETE')).status,403);
    a.send({type:'presence-request'});const presence=await a.wait(m=>m.type==='presence'&&m.members.some(p=>p.role==='creator'));assert(!JSON.stringify(presence).includes('@gmail.com'));
    const badOrigin=await fetch(f.base+'/community/channels',{headers:{Authorization:'Bearer '+creator.session.access_token,Origin:'https://bad.example'}});assert.equal(badOrigin.status,403);
    const noAuth=await fetch(f.base+'/community/channels');assert.equal(noAuth.status,401);
  }finally{for(const s of sockets)s.ws.terminate();await f.stop();}
});
