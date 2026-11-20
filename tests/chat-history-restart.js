'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws'),crypto=require('node:crypto');
const {startFixture}=require('./auth-fixture');
function client(base){return new Promise((resolve,reject)=>{
  const ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[],waiters=[];
  ws.once('error',reject);ws.on('message',raw=>{const message=JSON.parse(raw);messages.push(message);for(const w of [...waiters])if(w.p(message)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(message);}});
  ws.once('open',()=>resolve({ws,messages,send:m=>ws.send(JSON.stringify(m)),wait(p,after=0){const m=messages.slice(after).find(p);if(m)return Promise.resolve(m);return new Promise((resolve,reject)=>{const w={p,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('WebSocket timeout: '+p));},5000)};waiters.push(w);});}}));
});}
test('real backend restart restores external chat history, rejects unsaved messages and scopes older pages', {timeout:20000},async()=>{
  const f=await startFixture({port:10684}),clients=[];
  try{
    async function user(email,nickname){await f.call('signup',{email,nickname,password:'Senha12!'});const hash=[...f.links].find(([,v])=>v.user.email===email)[0];await f.call('verify',{token_hash:hash,type:'signup'});return (await f.call('login',{email,password:'Senha12!'})).data;}
    const owner=await user('jonathapereira.jj@gmail.com','Dono'),member=await user('membro@example.test','Membro');
    const response=await fetch(f.base+'/community/channels',{method:'POST',headers:{Origin:f.appOrigin,'Content-Type':'application/json',Authorization:'Bearer '+owner.session.access_token},body:JSON.stringify({name:'Conversas',type:'text'})});assert.equal(response.status,200);const text=(await response.json()).channel.id;
    async function account(data){const c=await client(f.base);clients.push(c);await c.wait(m=>m.type==='welcome');c.send({type:'authenticate',access_token:data.session.access_token});assert((await c.wait(m=>m.type==='auth-result')).ok);c.send({type:'join-room',roomId:'chat-jogos'});await c.wait(m=>m.type==='joined-room');c.send({type:'voice-state',joined:true});c.send({type:'join-text-channel',roomId:text});await c.wait(m=>m.type==='joined-text-channel');return c;}
    const a=await account(owner),b=await account(member);a.send({type:'chat-message',roomId:text,text:'Sobrevive ao deploy'});const saved=(await b.wait(m=>m.type==='chat-message'&&m.message.text==='Sobrevive ao deploy')).message;assert.deepEqual(f.chatMessages.get(saved.id),saved,'persist before broadcast');assert.equal(saved.accountId,owner.user.id);
    await new Promise(resolve=>setTimeout(resolve,460));f.historyState.fail=true;const mark=a.messages.length;a.send({type:'chat-message',roomId:text,text:'Não confirmado'});assert.equal((await a.wait(m=>m.type==='error',mark)).code,'CHAT_HISTORY_UNAVAILABLE');assert(![...f.chatMessages.values()].some(m=>m.text==='Não confirmado'));assert(!b.messages.some(m=>m.type==='chat-message'&&m.message.text==='Não confirmado'));f.historyState.fail=false;
    // Seed older rows in the external provider contract to exercise paging, without chat rate waits.
    f.chatMessages.clear();for(let i=0;i<55;i++){const message={...saved,id:crypto.randomUUID(),text:'Antiga '+i};f.chatMessages.set(message.id,message);}f.chatMessages.set(saved.id,saved);
    await f.restart();assert(clients.every(c=>c.ws.readyState!==WebSocket.OPEN));
    const after=await account(owner),history=await after.wait(m=>m.type==='chat-history'&&m.roomId===text);assert.equal(history.messages.length,50);assert.equal(history.messages.at(-1).id,saved.id);assert(history.hasMore);
    const readMark=after.messages.length;after.send({type:'chat-history-request',roomId:text,before:history.before});const older=await after.wait(m=>m.type==='chat-history'&&m.older,readMark);assert.equal(older.messages.length,6);assert.equal(older.messages[0].text,'Antiga 0');assert(!older.hasMore);const rate=after.messages.length;after.send({type:'chat-history-request',roomId:text,before:older.before});assert.equal((await after.wait(m=>m.type==='error',rate)).code,'CHAT_HISTORY_RATE');
    const combined=[...older.messages,...history.messages];assert.equal(new Set(combined.map(m=>m.id)).size,56);
    after.send({type:'join-room',roomId:'chat-jogos'});const switched=after.messages.length;const clean=await after.wait(m=>m.type==='chat-history'&&m.roomId==='chat-jogos',switched);assert.equal(clean.messages.length,0);
    const unauthorized=await client(f.base);clients.push(unauthorized);unauthorized.send({type:'chat-history-request',roomId:text});assert.equal((await unauthorized.wait(m=>m.type==='error')).code,'AUTH_REQUIRED');
  }finally{for(const c of clients)c.ws.terminate();await f.stop();}
});
