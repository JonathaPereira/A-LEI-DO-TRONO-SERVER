'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),WebSocket=require('ws'),{startFixture}=require('./auth-fixture');
test('all four new Decrees finish authoritative rounds; Usurpação and intelligence stay private',{timeout:40000},async t=>{
 for(const [index,decree]of ['conselho','favor','espionagem','peso'].entries())await t.test(decree,async()=>{
 const f=await startFixture({port:10710+index,gameDecree:decree}),clients=[],states=Array(4),events=[];let finish,fail;const finished=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});let intelligence=0,exchanges=0,ended=false;
 try{
  for(let seat=0;seat<4;seat++){
   const email=seat+'@round.test',nickname='Casa '+seat;await f.call('signup',{email,nickname,password:'Senha12!'});await f.call('verify',{token_hash:[...f.links.keys()].at(-1),type:'signup'});const data=(await f.call('login',{email,password:'Senha12!'})).data;
   const c={seat,messages:[],ws:new WebSocket(f.base.replace('http','ws')+'/ws'),send:m=>c.ws.send(JSON.stringify(m)),count:0,waiters:[]};clients.push(c);
   c.wait=predicate=>{const old=c.messages.find(predicate);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing initial packet '+predicate)),5000);c.waiters.push({predicate,resolve:m=>{clearTimeout(timer);resolve(m);}});});};
   c.ws.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);for(const w of [...c.waiters])if(w.predicate(m)){c.waiters.splice(c.waiters.indexOf(w),1);w.resolve(m);}try{
    if(m.type==='error')throw Error(m.code+': '+m.message);
    if(m.type==='game-prompt'){
     const p=m.prompt;
     if(p.kind==='choose-decree')c.send({type:'game-action',action:'choose-decree',payload:{value:decree}});
     else if(p.kind==='choose-law')c.send({type:'game-action',action:'choose-law',payload:{value:p.options.includes('usurpacao')?'usurpacao':p.options[0]}});
     else if(p.kind==='choose-trump')c.send({type:'game-action',action:'choose-trump',payload:{value:p.options[0]}});
     else if(p.kind==='usurp-target'){const target=p.options.find(o=>o.seat!==states[seat]?.lastCrown)||p.options[0];c.send({type:'game-action',action:'usurp-target',payload:{targetSeat:target.seat}});}
     else if(p.kind==='usurp-pick')c.send({type:'game-action',action:'usurp-pick',payload:{index:0}});
     else c.send({type:'game-action',action:p.kind,payload:{cardId:p.cardIds[0]}});
    }
    if(m.type==='game-state'){
     const s=m.state;states[seat]=s;assert(s.players.every(p=>p.id===s.youSeat||!p.hand));assert(!s.players.some(p=>p.id!==s.youSeat&&p.intelligence));
     if(decree==='espionagem'&&s.intelligence){assert.equal(s.intelligence.target,(seat+3)%4);assert(s.intelligence.card.id);}
     if(s.phase==='await-play'&&s.turn===s.youSeat){const key=s.round+':'+s.trick;if(c.lastPlay!==key){c.lastPlay=key;if(decree==='favor'&&s.trick===1)assert.equal(s.players[seat].influence,1);if(decree==='peso'&&s.trick>1)assert.equal(s.influenceBlocked,s.lastCrown===seat);c.send({type:'game-action',action:'play-card',payload:{cardId:s.legalCardIds[0]}});}}
    }
    if(m.type==='private-intelligence'){intelligence++;assert.equal(decree,'espionagem');assert.equal(m.intelligence.target,(seat+3)%4);c.send({type:'game-action',action:'intelligence-ack'});}
    if(m.type==='private-usurpation'){exchanges++;assert.equal(m.returnedSameCard,false);assert.notEqual(m.incoming.id,m.outgoing.id);c.send({type:'game-action',action:'usurp-ack'});}
    if(m.type==='game-event'&&seat===0){events.push(m);if(m.event==='server-error')throw Error(m.message);if(m.event==='round-ended'&&m.round===1&&!ended){ended=true;finish(m);}}
   }catch(error){fail(error);}});
   await new Promise(r=>c.ws.once('open',r));c.send({type:'authenticate',access_token:data.session.access_token});await c.wait(m=>m.type==='auth-result'&&m.ok);c.send({type:'join-game-room',roomId:'sala-cetro'});await c.wait(m=>m.type==='joined-game-room');c.send({type:'ready',ready:true});await c.wait(m=>m.type==='room-state'&&m.room.players.some(p=>p.name===nickname&&p.ready));
  }
  clients[0].send({type:'start-room'});const timer=setTimeout(()=>fail(Error('Round timed out: '+states.map(s=>s?.phase+':'+s?.trick))),12000);let result;try{result=await finished;}finally{clearTimeout(timer);}
  assert.equal(result.scores.reduce((n,s)=>n+s.crowns+s.shadows,0),20);assert(exchanges>=4,'two Usurpações reveal privately to their two participants');if(decree==='espionagem')assert.equal(intelligence,4);else assert.equal(intelligence,0);
  assert.equal(events.filter(m=>m.event==='trick-result').length,10);for(const event of events.filter(m=>m.event==='exchange'&&m.kind==='usurpacao')){const recipients=clients.flatMap(c=>c.messages.filter(m=>m.type==='private-usurpation'&&m.otherName));assert(recipients.length>=2);assert.equal(event.moves.length,2);assert(!JSON.stringify(event).includes('incoming'));}
  if(decree==='conselho')assert.equal(events.filter(m=>m.event==='exchange'&&m.kind==='conselho').length,1);
 }finally{for(const c of clients)c.ws.terminate();await f.stop();}
 });
});
