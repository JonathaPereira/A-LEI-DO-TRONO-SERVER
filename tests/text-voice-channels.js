'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws');
const {startFixture}=require('./auth-fixture');
function client(base){return new Promise((resolve,reject)=>{
  const ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[],waiters=[];
  ws.once('error',reject);ws.on('message',raw=>{const msg=JSON.parse(raw);messages.push(msg);for(const w of [...waiters])if(w.p(msg)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(msg);}});
  ws.once('open',()=>resolve({ws,messages,send:msg=>ws.send(JSON.stringify(msg)),wait(p,after=0){const msg=messages.slice(after).find(p);if(msg)return Promise.resolve(msg);return new Promise((resolve,reject)=>{const w={p,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('WebSocket timeout: '+p));},5000)};waiters.push(w);});}}));
});}
test('text subscriptions preserve voice signaling, media flags, presence and separate channel membership', {timeout:30000}, async t=>{
  const f=await startFixture({port:10682,soundboard:true}),clients=[];
  try{
    async function user(email,nickname){await f.call('signup',{email,nickname,password:'Senha12!'});const hash=[...f.links].find(([,v])=>v.user.email===email)[0];await f.call('verify',{token_hash:hash,type:'signup'});return (await f.call('login',{email,password:'Senha12!'})).data;}
    const owner=await user('jonathapereira.jj@gmail.com','Criador'),member=await user('reader@example.test','Leitor');
    async function manage(path,body,method='POST'){const r=await fetch(f.base+'/community'+path,{method,headers:{Origin:f.appOrigin,'Content-Type':'application/json',Authorization:'Bearer '+owner.session.access_token},body:JSON.stringify(body||{})});assert.equal(r.status,200);return r.json();}
    const text=(await manage('/channels',{name:'Texto 1',type:'text'})).channel,second=(await manage('/channels',{name:'Texto 2',type:'text'})).channel,voice=(await manage('/channels',{name:'Voz',type:'voice'})).channel;
    const a=await client(f.base),b=await client(f.base),guest=await client(f.base);clients.push(a,b,guest);
    const welcome=await a.wait(m=>m.type==='welcome');assert(welcome.features.independentTextChannels);
    for(const [c,u]of [[a,owner],[b,member]]){c.send({type:'authenticate',access_token:u.session.access_token});assert((await c.wait(m=>m.type==='auth-result')).ok);c.send({type:'join-room',roomId:voice.id});await c.wait(m=>m.type==='joined-room'&&m.room.id===voice.id);c.send({type:'voice-state',joined:true,camera:true,screen:true});await c.wait(m=>m.type==='voice-roster'&&m.players.some(p=>p.id===(c===a?welcome.clientId:c.messages.find(m=>m.type==='welcome').clientId)&&p.screen));}
    const aId=welcome.clientId,bId=b.messages.find(m=>m.type==='welcome').clientId;
    await t.test('open/type text without leaving voice or changing camera/screen state',async()=>{
      const before=b.messages.length;
      for(const c of [a,b]){c.send({type:'join-text-channel',roomId:text.id});await c.wait(m=>m.type==='joined-text-channel'&&m.room.id===text.id);}
      a.send({type:'chat-message',text:'Mensagem no texto'});assert.equal((await b.wait(m=>m.type==='chat-message'&&m.message.text==='Mensagem no texto')).message.roomId,text.id);
      a.send({type:'voice-state',joined:true,muted:true,deafened:true,camera:true,screen:true});const roster=await b.wait(m=>m.type==='voice-roster'&&m.players.some(p=>p.id===aId&&p.muted&&p.deafened),before);assert.equal(roster.roomId,voice.id);assert.equal(roster.players.length,2);assert(roster.players.find(p=>p.id===aId).camera&&roster.players.find(p=>p.id===aId).screen);
      const health=await (await fetch(f.base+'/health')).json();assert(!JSON.stringify(health).includes('deafened'),'private listening state is absent from public health');assert(!b.messages.slice(before).filter(m=>m.type==='room-state').some(m=>m.room.players.some(p=>'deafened' in p)));
      const change=b.messages.length;a.send({type:'voice-state',joined:true,muted:false,deafened:true,camera:true,screen:true});await b.wait(m=>m.type==='voice-roster'&&m.players.some(p=>p.id===aId&&!p.muted&&p.deafened),change);
      a.send({type:'voice-signal',targetId:bId,signalType:'offer',data:{sdp:'still-in-voice'}});assert.equal((await b.wait(m=>m.type==='voice-signal'&&m.data.sdp==='still-in-voice')).fromId,aId);
      assert(!b.messages.slice(before).some(m=>m.type==='voice-event'&&m.playerId===aId&&m.kind!=='joined'));
      a.send({type:'presence-request'});const presence=await a.wait(m=>m.type==='presence'&&m.members.some(p=>p.id===owner.user.id&&p.inVoice));assert.equal(presence.members.find(p=>p.id===owner.user.id).roomId,voice.id);
    });
    await t.test('reading a mixed-channel mention preserves the original voice and media state',async()=>{
      for(const c of [a,b]){c.send({type:'join-text-channel',roomId:'chat-livre'});const event=await c.wait(m=>m.type==='joined-text-channel'&&m.room.id==='chat-livre');assert.equal(event.primaryRoomId,voice.id);}
      a.send({type:'chat-message',text:'Texto no canal misto'});await b.wait(m=>m.type==='chat-message'&&m.message.text==='Texto no canal misto');
      a.send({type:'voice-prepare',requestId:'mixed-preserved'});assert.equal((await a.wait(m=>m.type==='sfu-response'&&m.requestId==='mixed-preserved')).data.mode,'p2p');
      const health=await (await fetch(f.base+'/health')).json();assert.equal(health.chatChannels.find(c=>c.id===voice.id).count,2);assert.equal(health.chatChannels.find(c=>c.id==='chat-livre').voiceActive,false);
      for(const c of [a,b]){const cursor=c.messages.length;c.send({type:'join-text-channel',roomId:text.id});await c.wait(m=>m.type==='joined-text-channel'&&m.room.id===text.id,cursor);}
    });
    await t.test('invalid destinations leave both memberships intact; guests cannot subscribe',async()=>{
      a.send({type:'join-text-channel',roomId:voice.id});assert.equal((await a.wait(m=>m.type==='error')).code,'TEXT_CHANNEL_REQUIRED');
      a.send({type:'voice-prepare',requestId:'preserved'});assert.equal((await a.wait(m=>m.type==='sfu-response'&&m.requestId==='preserved')).data.mode,'p2p');
      guest.send({type:'guest-authenticate',name:'Convidado'});await guest.wait(m=>m.type==='guest-result');guest.send({type:'join-text-channel',roomId:text.id});assert.equal((await guest.wait(m=>m.type==='error')).code,'LOGIN_REQUIRED_CHAT');
    });
    await t.test('switch between text channels; returning to voice clears only text membership',async()=>{
      a.send({type:'join-text-channel',roomId:second.id});await a.wait(m=>m.type==='joined-text-channel'&&m.room.id===second.id);
      let health=await (await fetch(f.base+'/health')).json();assert.equal(health.chatChannels.find(c=>c.id===text.id).count,1);assert.equal(health.chatChannels.find(c=>c.id===second.id).count,1);assert.equal(health.chatChannels.find(c=>c.id===voice.id).count,2);
      for(const [id,status]of [[text.id,403],[second.id,200]]){const response=await fetch(f.base+'/files/channel/'+id,{headers:{Origin:f.appOrigin,Authorization:'Bearer '+owner.session.access_token}});assert.equal(response.status,status,'attachment membership must follow the selected text channel');}
      const stale=a.messages.length;a.send({type:'chat-message',roomId:text.id,text:'Do not send to a different channel'});assert.equal((await a.wait(m=>m.type==='error',stale)).code,'NOT_IN_ROOM');
      const before=a.messages.length;a.send({type:'join-room',roomId:voice.id});await a.wait(m=>m.type==='joined-room'&&m.room.id===voice.id,before);
      health=await (await fetch(f.base+'/health')).json();assert.equal(health.chatChannels.find(c=>c.id===second.id).count,0);assert(health.chatChannels.find(c=>c.id===voice.id).voiceActive);
    });
    await t.test('deleting text retains voice; deleting voice retains selected text',async()=>{
      a.send({type:'join-text-channel',roomId:text.id});await a.wait(m=>m.type==='joined-text-channel'&&m.room.id===text.id,a.messages.length-1);
      const before=a.messages.length;await manage('/channels/'+text.id,null,'DELETE');await a.wait(m=>m.type==='channel-deleted'&&m.roomId===text.id,before);
      a.send({type:'voice-prepare',requestId:'after-text-delete'});assert.equal((await a.wait(m=>m.type==='sfu-response'&&m.requestId==='after-text-delete')).data.mode,'p2p');
      a.send({type:'join-text-channel',roomId:second.id});await a.wait(m=>m.type==='joined-text-channel'&&m.room.id===second.id,before);
      const deletion=a.messages.length;await manage('/channels/'+voice.id,null,'DELETE');await a.wait(m=>m.type==='channel-deleted'&&m.roomId===voice.id,deletion);
      a.send({type:'chat-message',text:'Texto sobrevive à exclusão da voz'});assert.equal((await a.wait(m=>m.type==='chat-message'&&m.message.text==='Texto sobrevive à exclusão da voz')).message.roomId,second.id);
      a.send({type:'voice-prepare',requestId:'deleted-voice'});assert.equal((await a.wait(m=>m.type==='sfu-response'&&m.requestId==='deleted-voice')).error.code,'NOT_IN_ROOM');
    });
    await t.test('disconnect removes remaining text membership',async()=>{
      a.ws.close();await new Promise(resolve=>a.ws.once('close',resolve));await new Promise(resolve=>setTimeout(resolve,80));const health=await (await fetch(f.base+'/health')).json();assert.equal(health.chatChannels.find(c=>c.id===second.id).count,0);
    });
  }finally{for(const c of clients)c.ws.terminate();await f.stop();}
});
