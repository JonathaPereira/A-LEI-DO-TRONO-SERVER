'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws'),{startFixture}=require('./auth-fixture'),{createLoveLetterService}=require('../server/love-letter-service.ts'),R=require('../src/lib/games/love-letter-rules.ts');
async function peer(base,token){const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});const wait=async(fn,from=0)=>{for(let n=0;n<600;n++){const m=messages.slice(from).find(fn);if(m)return m;await new Promise(r=>setTimeout(r,10));}console.error('TIMED OUT WAITING FOR:',fn.toString(),'Current messages:',messages.map(m=>m.type));throw Error('Missing message '+fn);};const send=m=>ws.send(JSON.stringify(m));if(token){send({type:'authenticate',access_token:token});await wait(m=>m.type==='auth-result'&&m.ok);}return {ws,messages,send,wait};}
test('Love Letter real authenticated server preserves private cards, validates actions and independent voice/text/Splendor memberships',{timeout:30000},async()=>{
 const f=await startFixture({port:10845}),clients=[];
 try{const users=[];for(let i=0;i<3;i++){const email='love-ws-'+i+'@example.test';await f.call('signup',{email,nickname:'Cortesão '+i,password:'Senha12!'});await f.call('verify',{token_hash:[...f.links.keys()].at(-1),type:'signup'});users.push((await f.call('login',{email,password:'Senha12!'})).data);clients.push(await peer(f.base,users[i].session.access_token));}const [a,b,outsider]=clients;
  for(const c of [a,b]){c.send({type:'join-room',roomId:'chat-jogos'});await c.wait(m=>m.type==='joined-room');c.send({type:'voice-state',joined:true,muted:false,deafened:false});}
  a.send({type:'join-text-channel',roomId:'chat-livre'});await a.wait(m=>m.type==='joined-text-channel');a.send({type:'splendor',action:'create',maxPlayers:2});await a.wait(m=>m.type==='splendor-state');a.send({type:'love-letter',action:'create',maxPlayers:2});const id=(await a.wait(m=>m.type==='love-letter-state')).room.id;b.send({type:'love-letter',action:'join',roomId:id});await b.wait(m=>m.type==='love-letter-state');b.send({type:'love-letter',action:'start'});assert.equal((await b.wait(m=>m.type==='love-letter-error')).code,'LOVE_LETTER_FORBIDDEN');outsider.send({type:'love-letter',action:'state'});assert.equal((await outsider.wait(m=>m.type==='love-letter-error')).code,'LOVE_LETTER_NOT_MEMBER');assert(!outsider.messages.some(m=>m.type==='love-letter-state'));
  a.send({type:'love-letter',action:'start'});const state=(await a.wait(m=>m.type==='love-letter-state'&&m.room.state)).room.state;await b.wait(m=>m.type==='love-letter-state'&&m.room.state);assert(!('deck' in state));assert.equal(typeof state.removed,'boolean');assert.equal(state.faceUpRemoved.length,3);assert(state.players.find(p=>p.id===users[1].user.id).hand.every(c=>c.hidden));
  const active=state.players[state.turn].id===users[0].user.id?a:b,wrong=active===a?b:a;const wrongFrom=wrong.messages.length;wrong.send({type:'love-letter',action:'move',revision:0,move:{kind:'play',cardId:'forged'}});assert.equal((await wrong.wait(m=>m.type==='love-letter-error',wrongFrom)).code,'LOVE_LETTER_INVALID_MOVE');const from=active.messages.length;active.send({type:'love-letter',action:'move',revision:-1,move:{}});assert.equal((await active.wait(m=>m.type==='love-letter-error',from)).code,'LOVE_LETTER_STALE');
  const current=active.messages.findLast(m=>m.type==='love-letter-state').room.state,move=R.botMove(current);active.send({type:'love-letter',action:'move',revision:current.revision,move});await a.wait(m=>m.type==='love-letter-state'&&m.room.state?.revision===1);
  const bId=(await b.wait(m=>m.type==='welcome')).clientId;a.send({type:'voice-signal',targetId:bId,signalType:'offer',data:{type:'offer',sdp:'love-letter-call'}});await b.wait(m=>m.type==='voice-signal'&&m.data.sdp==='love-letter-call');a.send({type:'chat-message',text:'A corte segue na chamada'});assert.equal((await a.wait(m=>m.type==='chat-message'&&m.message.text==='A corte segue na chamada')).message.roomId,'chat-livre');const offset=a.messages.length;a.send({type:'splendor',action:'state'});assert((await a.wait(m=>m.type==='splendor-state',offset)).room.id);
 }finally{clients.forEach(c=>c.ws.terminate());await f.stop();}
});
test('Love Letter full service matches accept only legal server decisions; resume, bots, host transfer and expiry preserve privacy',async()=>{
 let clock=Date.now();const account=i=>({id:'person-'+i,nickname:'Pessoa '+i,expiresAt:clock+10000000}),clients=[0,1,2].map(i=>({account:account(i),out:[]})),wss={clients:new Set(clients)},service=createLoveLetterService({wss,send:(ws,msg)=>ws.out.push(msg),now:()=>clock,botDelay:60000,disconnectDelay:20});
 try{const [a,b,guest]=clients;guest.account=null;service.handle(guest,{action:'create',maxPlayers:2});assert.equal(guest.out.at(-1).code,'AUTH_REQUIRED');service.handle(a,{action:'create',maxPlayers:2});const id=a.loveLetterRoomId;service.handle(b,{action:'join',roomId:id});service.handle(a,{action:'start'});let room=service.rooms.get(id);service.disconnect(a);const restored={account:account(0),out:[]};wss.clients.add(restored);service.handle(restored,{action:'resume',roomId:id});assert.equal(room.players[0].ws,restored);const duplicate={account:account(0),out:[]};service.handle(duplicate,{action:'resume',roomId:id});assert.equal(duplicate.out.at(-1).code,'LOVE_LETTER_OTHER_SESSION');service.updateAccount({...restored.account,nickname:'Novo nome'});assert.equal(room.state.players[0].name,'Novo nome');
  let turns=0;const byId=new Map([[restored.account.id,restored],[b.account.id,b]]);while(room.state.phase!=='finished'){clock+=1000;const s=room.state;if(s.phase==='round-over')service.handle(restored,{action:'next-round'});else{const c=byId.get(s.players[s.turn].id),view=c.out.findLast(m=>m.type==='love-letter-state').room.state;service.handle(c,{action:'move',revision:s.revision,move:R.botMove(view),score:999});}assert(room.state.revision>s.revision);assert(++turns<1500);}assert(room.state.players.every(p=>p.score<999));assert(room.state.winners.length);service.handle(restored,{action:'leave'});assert.equal(room.hostId,b.account.id);service.handle(b,{action:'leave'});assert(!service.rooms.has(id));
  service.handle(restored,{action:'create',maxPlayers:2});service.handle(restored,{action:'start',fillBots:true});room=service.rooms.get(restored.loveLetterRoomId);assert.equal(room.players.length,2);service.disconnect(restored);await new Promise(r=>setTimeout(r,35));assert(!service.rooms.has(room.id));
 }finally{service.stop();}
});

test('each Love Letter room owns an independent injected random stream', () => {
  let streams = 0;
  const clients = [0, 1].map(i => ({ account: { id: 'seeded-' + i, nickname: 'Casa ' + i, expiresAt: Date.now() + 60000 } }));
  const service = createLoveLetterService({
    wss: { clients: new Set(clients) }, send() {}, botDelay: 60000,
    createRandom() {
      streams++;
      let seed = 1;
      return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    },
  });
  try {
    const snapshots = [];
    for (const client of clients) {
      service.handle(client, { action: 'create', maxPlayers: 4 });
      service.handle(client, { action: 'start', fillBots: true });
      const room = service.rooms.get(client.loveLetterRoomId);
      assert(room.state);
      snapshots.push({ turn: room.state.turn, deck: room.state.deck, hands: room.state.players.map(p => p.hand) });
    }
    assert.equal(streams, 2);
    assert.deepEqual(snapshots[1], snapshots[0]);
  } finally { service.stop(); }
});
