'use strict';
const assert=require('assert/strict'),WebSocket=require('ws'),{startFixture}=require('./auth-fixture');
function client(base){return new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws')+'/ws'),queue=[],waiters=[];ws.on('message',raw=>{const msg=JSON.parse(raw);const at=waiters.findIndex(w=>w.p(msg));if(at>=0){const w=waiters.splice(at,1)[0];clearTimeout(w.t);w.resolve(msg);}else queue.push(msg);});ws.once('error',reject);ws.once('open',()=>resolve({ws,send:msg=>ws.send(JSON.stringify(msg)),wait(p,timeout=5000){const at=queue.findIndex(p);if(at>=0)return Promise.resolve(queue.splice(at,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve,t:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('WebSocket timeout: '+p.toString()+'; recent='+JSON.stringify(queue.slice(-8))));},timeout)};waiters.push(w);});}}));});}
(async()=>{const f=await startFixture({port:10480}),clients=[];
 try{
   for(const [email,nickname]of [['ana@example.test','Ana'],['bob@example.test','Bob'],['off@example.test','Off']]){await f.call('signup',{email,nickname,password:'Senha12!'});const hash=[...f.links].find(([,v])=>v.user.email===email)[0];await f.call('verify',{token_hash:hash,type:'signup'});}
   const login=await f.call('login',{email:'ana@example.test',password:'Senha12!'});
   const a=await client(f.base),g=await client(f.base),b=await client(f.base);clients.push(a,g,b);
   const aw=await a.wait(m=>m.type==='welcome');await g.wait(m=>m.type==='welcome');await b.wait(m=>m.type==='welcome');assert(aw.features.guestGame);
   a.send({type:'authenticate',requestId:'a',access_token:login.data.session.access_token});assert((await a.wait(m=>m.type==='auth-result')).ok);
   g.send({type:'guest-authenticate',requestId:'guest',name:'Visitante'});const identity=(await g.wait(m=>m.type==='guest-result')).guest;assert(identity.id.startsWith('guest:'));assert.equal(identity.ticket.length,64);
   for(const id of ['chat-livre','chat-jogos','chat-conversa']){g.send({type:'join-room',roomId:id,name:'Falso'});assert.equal((await g.wait(m=>m.type==='error')).code,'LOGIN_REQUIRED_CHAT');}
   g.send({type:'sfu-request',requestId:'bad-sfu',action:'create-session'});assert.equal((await g.wait(m=>m.type==='error')).code,'LOGIN_REQUIRED_CHAT');
   assert.equal((await fetch(f.base+'/files/upload',{method:'POST',headers:{Authorization:'Bearer '+identity.ticket,'Content-Type':'application/octet-stream'},body:'%PDF-1.7'})).status,401);
   g.send({type:'join-room',roomId:'sala-cetro',name:'Nome adulterado'});const joined=await g.wait(m=>m.type==='joined-room');assert(joined.me.guest);assert.equal(joined.me.name,'Visitante');
   a.send({type:'join-room',roomId:'sala-cetro'});await a.wait(m=>m.type==='joined-room');
   g.send({type:'chat-message',text:'Olá da mesa'});assert.equal((await a.wait(m=>m.type==='chat-message')).message.text,'Olá da mesa');
   g.send({type:'voice-prepare',requestId:'prepare'});assert.equal((await g.wait(m=>m.type==='sfu-response')).data.mode,'p2p');
   a.send({type:'voice-state',joined:true,transport:'p2p'});g.send({type:'voice-state',joined:true,transport:'p2p'});assert.equal((await a.wait(m=>m.type==='voice-event'&&m.name==='Visitante')).kind,'joined');
   await g.wait(m=>m.type==='voice-roster'&&m.players.some(p=>p.id===aw.clientId));
   const gwelcomeId=joined.me.id;g.send({type:'voice-signal',targetId:aw.clientId,signalType:'offer',data:{type:'offer',sdp:'test'}});assert.equal((await a.wait(m=>m.type==='voice-signal')).fromId,gwelcomeId);
   g.send({type:'voice-state',joined:false});assert.equal((await a.wait(m=>m.type==='voice-event'&&m.name==='Visitante')).kind,'left');
   g.send({type:'voice-state',joined:true});await a.wait(m=>m.type==='voice-event'&&m.name==='Visitante'&&m.kind==='joined');g.ws.terminate();assert((await a.wait(m=>m.type==='voice-roster'&&m.players.some(p=>p.id===gwelcomeId&&p.reconnecting))).players.some(p=>p.id===gwelcomeId));
   a.send({type:'presence-request'});const online=await a.wait(m=>m.type==='presence'&&m.members.some(p=>p.name==='Visitante'&&!p.online));assert(online.members.some(p=>p.name==='Ana'&&p.online&&p.roomId==='sala-cetro'));
   assert(online.members.some(p=>p.name==='Off'&&!p.online));assert(!JSON.stringify(online).includes('@example.test'));assert(!JSON.stringify(online).includes(identity.ticket));
   b.send({type:'guest-authenticate',requestId:'resume',ticket:identity.ticket,name:'Visitante'});assert.equal((await b.wait(m=>m.type==='guest-result')).guest.id,identity.id);b.send({type:'presence-request'});const scoped=await b.wait(m=>m.type==='presence');assert.equal(scoped.scope,'game');assert(scoped.members.every(p=>p.online&&p.roomKind==='game'));assert(!scoped.members.some(p=>p.name==='Off'));
   b.send({type:'join-room',roomId:'sala-chave'});await b.wait(m=>m.type==='joined-room');b.send({type:'ready',ready:true});assert((await b.wait(m=>m.type==='room-state'&&m.room.players.some(p=>p.ready))).room.kind==='game');
   b.send({type:'chat-message',text:'fake file',attachmentId:'00000000-0000-4000-8000-000000000080'});assert.equal((await b.wait(m=>m.type==='error')).code,'LOGIN_REQUIRED_FILES');
   b.send({type:'leave-room'});b.send({type:'join-room',roomId:'sala-cetro'});await b.wait(m=>m.type==='joined-room'&&m.room.id==='sala-cetro');a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await a.wait(m=>m.type==='room-state'&&m.room.players.length===2&&m.room.players.every(p=>p.ready));b.send({type:'start-room'});await b.wait(m=>m.type==='game-started');b.send({type:'state-request'});const game=await b.wait(m=>m.type==='game-state');assert(game.state.online);assert.equal(game.state.players.filter(p=>!p.ai).length,2);
   console.log('PASS — convidado entra no jogo/voz/texto da mesa, identidade não adulterável; M&N/SFU/anexos bloqueados; presença por sala e saída/desconexão distintas');
   a.ws.close();b.ws.close();
 }finally{for(const c of clients)c.ws.terminate();await f.stop();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
