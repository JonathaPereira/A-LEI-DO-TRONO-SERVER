'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws'),crypto=require('node:crypto');
const {startFixture}=require('./auth-fixture');
function client(base){return new Promise((resolve,reject)=>{
  const ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[],waiters=[];ws.once('error',reject);
  ws.on('message',raw=>{const message=JSON.parse(raw);messages.push(message);for(const waiter of [...waiters])if(waiter.match(message)){clearTimeout(waiter.timer);waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(message);}});
  ws.once('open',()=>resolve({ws,messages,send:message=>ws.send(JSON.stringify(message)),wait(match,after=0){const old=messages.slice(after).find(match);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const waiter={match,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(Error('WebSocket timeout: '+match));},5000)};waiters.push(waiter);});}}));
});}
test('creator chat moderation persists, rejects forged/admin actions and serializes pagination without changing media/game membership',{timeout:25000},async()=>{
  const fixture=await startFixture({port:10708}),clients=[];
  try{
    async function user(email,nickname,admin=false){await fixture.call('signup',{email,nickname,password:'Senha12!'});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});if(admin)fixture.users.get(email).community_role='admin';return (await fixture.call('login',{email,password:'Senha12!'})).data;}
    const owner=await user('Jonathapereira.jj@gmail.com','Criador'),member=await user('member@example.test','Membro'),admin=await user('admin@example.test','Admin',true);
    async function account(data){const c=await client(fixture.base);clients.push(c);c.send({type:'authenticate',access_token:data.session.access_token});assert.equal((await c.wait(m=>m.type==='auth-result')).ok,true);c.send({type:'join-room',roomId:'chat-jogos'});await c.wait(m=>m.type==='joined-room');c.send({type:'voice-state',joined:true});c.send({type:'join-text-channel',roomId:'chat-livre'});await c.wait(m=>m.type==='joined-text-channel');await c.wait(m=>m.type==='chat-history'&&m.roomId==='chat-livre');return c;}
    const a=await account(owner),b=await account(member),d=await account(admin);a.send({type:'join-game-room',roomId:'sala-cetro'});assert.equal((await a.wait(m=>m.type==='joined-game-room')).primaryRoomId,'chat-jogos');
    a.send({type:'chat-message',roomId:'chat-livre',text:'Apagar esta'});const saved=(await b.wait(m=>m.type==='chat-message'&&m.message.text==='Apagar esta')).message;assert(fixture.chatMessages.has(saved.id));
    const foreign={...saved,id:crypto.randomUUID(),roomId:'chat-conversa',text:'Preservar outro canal'};fixture.chatMessages.set(foreign.id,foreign);
    for(const actor of [b,d]){actor.send({type:'chat-message-delete',roomId:'chat-livre',id:saved.id,accountId:owner.user.id,role:'creator'});assert.equal((await actor.wait(m=>m.type==='chat-moderation-result')).error.code,'FORBIDDEN');assert(fixture.chatMessages.has(saved.id));}
    a.send({type:'chat-history-clear',roomId:'chat-conversa',requestId:'wrong-channel'});assert.equal((await a.wait(m=>m.requestId==='wrong-channel')).error.code,'NOT_IN_ROOM');assert(fixture.chatMessages.has(foreign.id));
    const mark=b.messages.length;a.send({type:'chat-message-delete',roomId:'chat-livre',id:saved.id,requestId:'delete'});const removed=await b.wait(m=>m.type==='chat-message-deleted',mark);assert.equal(removed.id,saved.id);assert.equal((await a.wait(m=>m.requestId==='delete')).ok,true);assert(!fixture.chatMessages.has(saved.id));assert(fixture.chatMessages.has(foreign.id));
    await new Promise(resolve=>setTimeout(resolve,460));a.send({type:'chat-message',roomId:'chat-livre',text:'Falha mantém esta'});const retained=(await b.wait(m=>m.type==='chat-message'&&m.message.text==='Falha mantém esta')).message;
    fixture.historyState.fail=true;const failureMark=b.messages.length;a.send({type:'chat-message-delete',roomId:'chat-livre',id:retained.id,requestId:'fail'});assert.equal((await a.wait(m=>m.requestId==='fail')).ok,false);assert(fixture.chatMessages.has(retained.id));assert(!b.messages.slice(failureMark).some(m=>m.type==='chat-message-deleted'));fixture.historyState.fail=false;
    // Request history before clearing, then append after clearing. Socket order
    // must never deliver the old page after the clear notification.
    const raceMark=a.messages.length;a.send({type:'chat-history-request',roomId:'chat-livre'});a.send({type:'chat-history-clear',roomId:'chat-livre',requestId:'clear'});
    const cleared=await b.wait(m=>m.type==='chat-history-cleared');assert(cleared.revision>removed.revision);assert.equal((await a.wait(m=>m.requestId==='clear')).ok,true);
    const race=a.messages.slice(raceMark),clearIndex=race.findIndex(m=>m.type==='chat-history-cleared');assert(clearIndex>=0);assert(!race.slice(clearIndex+1).some(m=>m.type==='chat-history'&&m.messages.some(x=>x.id===retained.id)));
    assert(!fixture.chatMessages.has(retained.id));assert(fixture.chatMessages.has(foreign.id));
    await new Promise(resolve=>setTimeout(resolve,460));a.send({type:'chat-message',roomId:'chat-livre',text:'Depois da limpeza'});const afterClear=(await b.wait(m=>m.type==='chat-message'&&m.message.text==='Depois da limpeza')).message;assert(fixture.chatMessages.has(afterClear.id));
    const membershipMark=a.messages.length;a.send({type:'join-game-room',roomId:'sala-cetro'});const membership=await a.wait(m=>m.type==='joined-game-room',membershipMark);assert.equal(membership.primaryRoomId,'chat-jogos');assert.equal(membership.chatRoomId,'chat-livre');
    const unauth=await client(fixture.base);clients.push(unauth);unauth.send({type:'chat-history-clear',roomId:'chat-livre',accountId:owner.user.id,role:'creator'});assert.equal((await unauth.wait(m=>m.type==='error')).code,'AUTH_REQUIRED');
    await fixture.restart();const restarted=await account(owner),history=await restarted.wait(m=>m.type==='chat-history'&&m.roomId==='chat-livre');assert.deepEqual(history.messages.map(m=>m.id),[afterClear.id],'deleted/cleared messages remain absent after backend restart');
  }finally{for(const c of clients)c.ws.terminate();await fixture.stop();}
});
