'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws'),{startFixture}=require('./auth-fixture'),R=require('../frontend/azul-rules');
async function client(base,token){const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages=[],waiters=[];ws.on('message',raw=>{const msg=JSON.parse(raw);messages.push(msg);for(const w of [...waiters])if(w.p(msg)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(msg);}});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const c={ws,messages,send:m=>ws.send(JSON.stringify(m)),wait(p,after=0){const found=messages.slice(after).find(p);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={p,resolve,timer:setTimeout(()=>reject(Error('Timeout '+p)),8000)};waiters.push(w);});}};if(token){c.send({type:'authenticate',access_token:token});await c.wait(m=>m.type==='auth-result'&&m.ok);}return c;}
test('Azul online is server-authoritative and independent of text/voice/Trono; completed records persist after restart',{timeout:40000},async()=>{
 const f=await startFixture({port:10741}),clients=[];
 try{
  const accounts=[];for(let i=0;i<3;i++){const email='azul'+i+'@example.test';await f.call('signup',{email,nickname:'Artesão '+i,password:'Senha12!'});await f.call('verify',{token_hash:[...f.links.keys()].at(-1),type:'signup'});accounts.push((await f.call('login',{email,password:'Senha12!'})).data);}
  const a=await client(f.base,accounts[0].session.access_token),b=await client(f.base,accounts[1].session.access_token),outsider=await client(f.base,accounts[2].session.access_token);clients.push(a,b,outsider);
  for(const c of [a,b]){c.send({type:'join-room',roomId:'chat-jogos'});await c.wait(m=>m.type==='joined-room');c.send({type:'voice-state',joined:true,muted:true,deafened:true,camera:true,screen:true});}
  a.send({type:'join-text-channel',roomId:'chat-livre'});await a.wait(m=>m.type==='joined-text-channel');a.send({type:'join-game-room',roomId:'sala-cetro'});await a.wait(m=>m.type==='joined-game-room');
  a.send({type:'azul',action:'create',maxPlayers:2});let view=(await a.wait(m=>m.type==='azul-state')).room;const id=view.id;
  b.send({type:'azul',action:'join',roomId:id});await b.wait(m=>m.type==='azul-state'&&m.room.players.length===2);
  outsider.send({type:'azul',action:'move',revision:0,move:{source:0,color:0,row:0}});assert.equal((await outsider.wait(m=>m.type==='azul-error')).code,'AZUL_NOT_MEMBER');assert.equal(outsider.messages.filter(m=>m.type==='azul-state').length,0);
  b.send({type:'azul',action:'start'});assert.equal((await b.wait(m=>m.type==='azul-error')).code,'AZUL_FORBIDDEN');
  a.send({type:'azul',action:'start'});view=(await a.wait(m=>m.type==='azul-state'&&!!m.room.state)).room;assert(!('bag' in view.state));const started=view.state;
  const byId=new Map([[accounts[0].user.id,a],[accounts[1].user.id,b]]),active=byId.get(started.players[started.turn].id),wrong=active===a?b:a;
  const wrongAfter=wrong.messages.length;wrong.send({type:'azul',action:'move',revision:0,move:R.botMove(started)});assert.equal((await wrong.wait(m=>m.type==='azul-error',wrongAfter)).code,'AZUL_INVALID_MOVE');
  const activeAfter=active.messages.length;active.send({type:'azul',action:'move',revision:-1,move:R.botMove(started)});assert.equal((await active.wait(m=>m.type==='azul-error',activeAfter)).code,'AZUL_STALE');
  let moves=0;while(view.state.phase!=='finished'){
    const s=view.state,c=byId.get(s.players[s.turn].id),after=a.messages.length;c.send({type:'azul',action:'move',revision:s.revision,move:R.botMove(s)});view=(await a.wait(m=>m.type==='azul-state'&&m.room.state?.revision>s.revision,after)).room;assert(++moves<400);
  }
  await a.wait(m=>m.type==='azul-state'&&m.room.recordStatus==='saved');assert.equal(f.azulRecords.size,1);const persisted=[...f.azulRecords.values()][0];assert.equal(persisted.p_players.length,2);for(const p of persisted.p_players)assert.equal(p.score,view.state.players.find(x=>x.id===p.id).score);
  const aId=(await a.wait(m=>m.type==='welcome')).clientId,bId=(await b.wait(m=>m.type==='welcome')).clientId,voiceCheck=b.messages.length;
  a.send({type:'voice-signal',targetId:bId,signalType:'offer',data:{sdp:'azul-kept-call'}});assert.equal((await b.wait(m=>m.type==='voice-signal'&&m.data.sdp==='azul-kept-call',voiceCheck)).fromId,aId);
  a.send({type:'chat-message',text:'Jogando Azul sem sair da voz'});assert.equal((await a.wait(m=>m.type==='chat-message'&&m.message.text==='Jogando Azul sem sair da voz')).message.roomId,'chat-livre');
  a.send({type:'ready',ready:true});await a.wait(m=>m.type==='room-state'&&m.room.id==='sala-cetro'&&m.room.players.some(p=>p.id===aId&&p.ready));
  const count=f.azulRecords.size;a.send({type:'azul',action:'retry-record'});a.send({type:'azul',action:'ranking',requestId:'top'});const rows=(await a.wait(m=>m.type==='azul-ranking'&&m.requestId==='top')).rows;assert.equal(rows.length,2);assert.equal(f.azulRecords.size,count);
  a.send({type:'azul',action:'leave'});await a.wait(m=>m.type==='azul-left');a.send({type:'voice-prepare',requestId:'after-azul'});assert((await a.wait(m=>m.type==='sfu-response'&&m.requestId==='after-azul')).ok);
  for(const c of clients)c.ws.terminate();await f.restart();const reopened=await client(f.base,accounts[0].session.access_token);clients.push(reopened);reopened.send({type:'azul',action:'ranking',requestId:'after-restart'});assert.deepEqual((await reopened.wait(m=>m.type==='azul-ranking')).rows,rows);
 }finally{for(const c of clients)c.ws.terminate();await f.stop();}
});
test('Azul resumes a disconnected seat, bots finish after explicit departure and cannot submit their own scores',{timeout:20000},async()=>{
 const {createAzulService}=require('../azul-service'),accounts=[0,1].map(i=>({id:'10000000-0000-4000-8000-00000000000'+i,nickname:'Pessoa '+i,expiresAt:Date.now()+60000})),sockets=accounts.map(account=>({account,out:[]})),wss={clients:new Set(sockets)},saved=[];
 const service=createAzulService({auth:{configured:true},wss,send:(ws,msg)=>ws.out.push(msg),env:{SUPABASE_URL:'http://test',SUPABASE_SECRET_KEY:'sb_secret_test'},botDelay:0,disconnectDelay:30,fetchImpl:async(url,options)=>{saved.push(JSON.parse(options.body));return {ok:true,json:async()=>({saved:true})};}});
 try{
 const [a,b]=sockets;service.handle(a,{action:'create',maxPlayers:2});const id=a.azulRoomId;service.handle(b,{action:'join',roomId:id});service.handle(a,{action:'start'});const state=service.rooms.get(id).state;service.disconnect(a);const other={account:accounts[0],out:[]};wss.clients.add(other);service.handle(other,{action:'resume',roomId:id});assert.equal(service.rooms.get(id).players[0].ws,other);assert.equal(service.rooms.get(id).state,state);service.updateAccount({...accounts[0],nickname:'Nome renovado'});assert.equal(service.rooms.get(id).state.players[0].name,'Nome renovado');
 service.handle(other,{action:'leave'});service.handle(b,{action:'leave'});for(let n=0;n<300&&service.rooms.has(id);n++)await new Promise(r=>setTimeout(r,3));assert.equal(service.rooms.has(id),false);assert.equal(saved.length,0);
 }finally{service.stop();}
});


test('failed ranking persistence stays pending and retries the same server-calculated result without duplicates',async()=>{
 const {createAzulService}=require('../azul-service'),sockets=[0,1].map(i=>({account:{id:'20000000-0000-4000-8000-00000000000'+i,nickname:'Pessoa '+i,expiresAt:Date.now()+60000},out:[]})),wss={clients:new Set(sockets)},attempts=[];let available=false;
 const service=createAzulService({auth:{configured:true},wss,send:(ws,msg)=>ws.out.push(msg),env:{SUPABASE_URL:'http://test',SUPABASE_SECRET_KEY:'sb_secret_test'},fetchImpl:async(url,options)=>{attempts.push(JSON.parse(options.body));if(!available)throw Error('offline');return {ok:true,json:async()=>({saved:true})};}});
 try{const [a,b]=sockets;service.handle(a,{action:'create',maxPlayers:2});service.handle(b,{action:'join',roomId:a.azulRoomId});service.handle(a,{action:'start'});const room=service.rooms.get(a.azulRoomId);while(room.state.phase!=='finished'){const player=room.state.players[room.state.turn],ws=sockets.find(w=>w.account.id===player.id);service.handle(ws,{action:'move',revision:room.state.revision,move:R.botMove(room.state)});}
 await new Promise(r=>setImmediate(r));assert.equal(room.recordStatus,'pending');assert.equal(attempts.length,1);available=true;service.handle(a,{action:'retry-record',score:999});await new Promise(r=>setImmediate(r));assert.equal(room.recordStatus,'saved');assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert(!attempts[1].p_players.some(p=>p.score===999));service.handle(a,{action:'retry-record'});assert.equal(attempts.length,2);
 }finally{service.stop();}
});

test('host fills a 2–4-player table with bots using the standard factory counts; no guest or expired account can create it',()=>{
 const {createAzulService}=require('../azul-service'),a={account:{id:'30000000-0000-4000-8000-000000000000',nickname:'Pessoa',expiresAt:Date.now()+60000},out:[]},guest={guest:{id:'guest'},out:[]},expired={account:{...a.account,expiresAt:Date.now()-1},out:[]},wss={clients:new Set([a,guest,expired])};
 const service=createAzulService({auth:{configured:false},wss,send:(ws,msg)=>ws.out.push(msg),botDelay:60000});try{for(const ws of [guest,expired]){service.handle(ws,{action:'create',maxPlayers:2});assert.equal(ws.out.at(-1).code,'AUTH_REQUIRED');}for(const n of [2,3,4]){service.handle(a,{action:'create',maxPlayers:n});const room=service.rooms.get(a.azulRoomId);service.handle(a,{action:'start',fillBots:true});assert.equal(room.state.players.length,n);assert.equal(room.state.factories.length,n*2+1);assert.equal(room.players.filter(p=>p.bot).length,n-1);assert.equal(room.usedBots,true);service.handle(a,{action:'leave'});}}finally{service.stop();}
});

test('a bot replacing an opponent labels the surviving human result correctly and frees the finished table',async()=>{
 const {createAzulService}=require('../azul-service'),sockets=[0,1].map(i=>({account:{id:'40000000-0000-4000-8000-00000000000'+i,nickname:'Pessoa '+i,expiresAt:Date.now()+60000},out:[]})),saved=[],wss={clients:new Set(sockets)};
 const service=createAzulService({auth:{configured:true},wss,send:(ws,msg)=>ws.out.push(msg),env:{SUPABASE_URL:'http://test',SUPABASE_SECRET_KEY:'sb_secret_test'},botDelay:60000,fetchImpl:async(url,options)=>{saved.push(JSON.parse(options.body));return {ok:true,json:async()=>({saved:true})};}});
 try{const [a,b]=sockets;service.handle(a,{action:'create',maxPlayers:2});const id=a.azulRoomId;service.handle(b,{action:'join',roomId:id});service.handle(a,{action:'start'});const room=service.rooms.get(id);service.handle(a,{action:'leave'});assert.equal(room.usedBots,true);while(room.state.phase!=='finished'){const player=room.state.players[room.state.turn];if(player.id===b.account.id)service.handle(b,{action:'move',revision:room.state.revision,move:R.botMove(room.state)});else room.state=R.move(room.state,player.id,R.botMove(room.state));}service.handle(b,{action:'retry-record'});await new Promise(r=>setImmediate(r));assert.equal(saved.length,1);assert.equal(saved[0].p_mode,'bots');assert.deepEqual(saved[0].p_players.map(p=>p.id),[b.account.id]);service.handle(b,{action:'leave'});assert.equal(service.rooms.has(id),false);
 }finally{service.stop();}
});
