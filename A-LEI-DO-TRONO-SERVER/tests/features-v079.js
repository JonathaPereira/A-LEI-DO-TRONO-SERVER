'use strict';
const assert=require('assert/strict'),{WebSocket}=require('ws'),{startFixture}=require('./auth-fixture');
function socket(base){return new Promise(resolve=>{const ws=new WebSocket(base.replace('http','ws')+'/ws'),queue=[],waiting=[];ws.on('message',raw=>{const msg=JSON.parse(raw),i=waiting.findIndex(p=>p.test(msg));if(i<0)queue.push(msg);else{const p=waiting.splice(i,1)[0];clearTimeout(p.timer);p.resolve(msg);}});ws.on('open',()=>resolve({ws,send:type=>ws.send(JSON.stringify(type)),wait(test){const i=queue.findIndex(test);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{waiting.push({test,resolve,timer:setTimeout(()=>reject(Error('Message timeout')),4000)});});}}));});}
(async()=>{const fixture=await startFixture({port:10379,realtime:true});const sockets=[];
 try{
   async function user(email,nickname){await fixture.call('signup',{email,nickname,password:'Senha12!'});const hash=[...fixture.links].find(([,v])=>v.user.email===email)[0];await fixture.call('verify',{token_hash:hash,type:'signup'});return (await fixture.call('login',{email,password:'Senha12!'})).data;}
   const ana=await user('ana@example.test','Ana'),bob=await user('bob@example.test','Bob');
   const a=await socket(fixture.base),b=await socket(fixture.base);sockets.push(a,b);
   for(const [sock,u]of [[a,ana],[b,bob]]){sock.send({type:'authenticate',requestId:'auth',access_token:u.session.access_token});assert((await sock.wait(m=>m.type==='auth-result')).ok);sock.send({type:'join-room',roomId:'chat-livre'});await sock.wait(m=>m.type==='joined-room');}
   a.send({type:'voice-prepare',requestId:'prepare'});assert.equal((await a.wait(m=>m.type==='sfu-response'&&m.requestId==='prepare')).data.mode,'sfu');
   a.send({type:'voice-state',joined:true,transport:'sfu-pending'});b.send({type:'voice-state',joined:true,transport:'sfu'});await a.wait(m=>m.type==='voice-roster'&&m.players.length===2);
   b.send({type:'voice-fallback'});await a.wait(m=>m.type==='voice-mode'&&m.mode==='p2p');const roster=await a.wait(m=>m.type==='voice-roster'&&m.players.length===2&&m.players.every(p=>p.transport==='p2p'));assert.equal(roster.players.length,2);
   a.send({type:'voice-state',joined:true,transport:'sfu'});await b.wait(m=>m.type==='voice-roster'&&m.players.every(p=>p.transport==='p2p'));
   a.send({type:'sfu-request',requestId:'stale',action:'list-publications'});assert.equal((await a.wait(m=>m.type==='sfu-response'&&m.requestId==='stale')).error.code,'ROOM_P2P');
   b.send({type:'voice-prepare',requestId:'sticky'});assert.equal((await b.wait(m=>m.type==='sfu-response'&&m.requestId==='sticky')).data.mode,'p2p');
   console.log('✓ fallback muda a sala inteira; estado SFU atrasado não cria divisão; novos participantes seguem o modo da sala');
   const renamed=await fixture.call('profile',{nickname:'Ana Nova',avatar_preset:'dragon',avatar_file_id:null},ana.session.access_token);assert.equal(renamed.status,200);await b.wait(m=>m.type==='room-state'&&m.room.players.some(p=>p.name==='Ana Nova'&&p.avatar_preset==='dragon'));
   assert.equal((await fixture.call('profile',{nickname:'Bob',avatar_preset:'cat'},ana.session.access_token)).status,409);
   a.send({type:'chat-message',text:'Novo nome'});const chat=await b.wait(m=>m.type==='chat-message'&&m.message.text==='Novo nome');assert.equal(chat.message.name,'Ana Nova');assert.equal(chat.message.avatar_preset,'dragon');
   console.log('✓ mudança de apelido e ícone persiste e aparece para os demais; apelido duplicado bloqueado');
   // Reconnect while the old socket is still open: this is the F5 handoff race.
   const reloaded=await socket(fixture.base);sockets.push(reloaded);reloaded.send({type:'authenticate',requestId:'reload',access_token:ana.session.access_token});assert((await reloaded.wait(m=>m.type==='auth-result')).ok);
   reloaded.send({type:'check-name',requestId:'name'});assert((await reloaded.wait(m=>m.type==='name-check-result')).available);reloaded.send({type:'join-room',roomId:'chat-livre'});await reloaded.wait(m=>m.type==='joined-room');
   // Two auth messages may arrive during token renewal; neither is discarded.
   reloaded.send({type:'authenticate',requestId:'one',access_token:ana.session.access_token});reloaded.send({type:'authenticate',requestId:'two',access_token:ana.session.access_token});assert((await reloaded.wait(m=>m.type==='auth-result'&&m.requestId==='one')).ok);assert((await reloaded.wait(m=>m.type==='auth-result'&&m.requestId==='two')).ok);
   console.log('✓ F5 reassume a mesma sessão sem nome preso; autenticações concorrentes recebem resposta');
   b.send({type:'voice-state',joined:false});reloaded.send({type:'voice-prepare',requestId:'new-call'});assert.equal((await reloaded.wait(m=>m.type==='sfu-response'&&m.requestId==='new-call')).data.mode,'sfu');
   console.log('PASS — perfis, sessão e transporte de sala (WebSocket real; serviços externos simulados)');
 }finally{for(const s of sockets)s.ws.close();await fixture.stop();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
