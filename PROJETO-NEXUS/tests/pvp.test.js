import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import WebSocket from 'ws';
import {createPvpServer} from '../server/pvp.mjs';
import {PvpStore,summarize} from '../server/pvp-store.mjs';
import {BUILD,PVP,defaultLoadout,validateLoadout,createPvpBattle} from '../server/pvp-loadout.mjs';
import {act,chooseAI,currentUnit,RULES} from '../src/engine.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(t,options={}){
 const directory=await mkdtemp(join(tmpdir(),'nexus-pvp-'));const store=new PvpStore({directory});
 const app=await createPvpServer({store,adminToken:'test-secret-long-enough-for-admin',...options});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const address=`http://127.0.0.1:${app.server.address().port}`;
 return {...app,address,directory,async connect(){
  const ws=new WebSocket(address.replace('http','ws')+'/pvp');const inbox=[];let signal;
  ws.on('message',bytes=>{inbox.push(JSON.parse(bytes));signal?.();});
  const c={ws,send(packet){ws.send(JSON.stringify({build:BUILD,...packet}));},async next(predicate,timeout=3000){
   const match=typeof predicate==='string'?m=>m.type===predicate:predicate;const deadline=Date.now()+timeout;
   while(Date.now()<deadline){const i=inbox.findIndex(match);if(i>=0){const [m]=inbox.splice(i,1);return m;}await new Promise(r=>{signal=r;setTimeout(r,20)});}
   throw Error('Timed out waiting for '+predicate+'; inbox='+JSON.stringify(inbox.map(m=>m.type)));
  }};await c.next('hello');return c;
 }};
}
async function pair(app){
 const a=await app.connect();a.send({type:'create',name:'Anfitrião'});const sessionA=await a.next('session');await a.next('room');
 const b=await app.connect();b.send({type:'join',name:'Convidado',code:sessionA.code});const sessionB=await b.next('session');await b.next('room');
 return {a,b,sessionA,sessionB,room:app.rooms.rooms.get(sessionA.code)};
}
async function start(pair){pair.a.send({type:'ready',ready:true});pair.b.send({type:'ready',ready:true});return Promise.all([pair.a.next(m=>m.type==='room'&&m.phase==='playing'),pair.b.next(m=>m.type==='room'&&m.phase==='playing')]);}
test('free gem copies preserve three slots, reject invalid heroes and apply additive bonuses once',()=>{
 const l=defaultLoadout();for(const id of l.team)l.gems[id]=['ember','ember','ember'];
 const state=createPvpBattle([l,defaultLoadout(1)],73);const base=createPvpBattle([defaultLoadout(),defaultLoadout(1)],73);
 assert.equal(state.units[0].attack,Math.round(base.units[0].attack*1.12));
 l.gems[l.team[0]]=['sap','sap','pulse'];const s=createPvpBattle([l,defaultLoadout(1)],73);assert.equal(s.units[0].maxHp,Math.round(base.units[0].maxHp*1.1));assert.equal(s.units[0].energy,RULES.energy.initial+8);
 for(const bad of [{...l,team:[l.team[0],l.team[0],l.team[2]]},{...l,team:['boss-vesper',...l.team.slice(1)]},{...l,gems:{...l.gems,[l.team[0]]:['ember','ember','ember','ember']}},{...l,gems:{...l.gems,[l.team[0]]:['hacked','','']}},{...l,gems:{__proto__:null,other:['','','']}}])assert.throws(()=>validateLoadout(bad));
 assert.equal(PVP.inventory,'unlimited-test');assert.notEqual(BUILD.length,0);
});
test('two sockets finish a full battle and reproduce every authoritative action, then persist a separate replay',async t=>{
 const app=await fixture(t);const p=await pair(app);
 const loadout=defaultLoadout();loadout.gems[loadout.team[0]]=['sap','pulse','ember'];p.a.send({type:'loadout',loadout});await p.a.next(m=>m.type==='room'&&m.players[0].loadout.gems[loadout.team[0]][0]==='sap');
 const [aStart,bStart]=await start(p);assert.deepEqual(aStart.state,bStart.state);
 const expected=structuredClone(aStart.state);let seq=0;
 while(expected.phase==='playing'&&seq<400){
  const choice=chooseAI(expected),side=currentUnit(expected).side;const peer=p.room.players[0].side===side?p.a:p.b;
  const predicted=act(expected,choice.actionId,choice.targetId);peer.send({type:'action',seq,...choice});
  const [a,b]=await Promise.all([p.a.next(m=>m.type==='turn'&&m.seq===seq+1),p.b.next(m=>m.type==='turn'&&m.seq===seq+1)]);
  assert.deepEqual(a.state,expected);assert.deepEqual(a.result,predicted);assert.deepEqual(a,b);seq++;await delay(80);
 }
 assert.equal(expected.phase,'finished');await app.store.serial;assert.equal(app.store.records.length,1);
 const record=app.store.records[0];assert.equal(record.mode,'pvp');assert.equal(record.reason,'combat');assert.equal(record.steps.length,seq);assert.deepEqual(record.finalState,expected);
 assert(!JSON.stringify(record).includes(p.sessionA.token));assert(!JSON.stringify(record).includes(p.sessionB.token));
 const persisted=new PvpStore({directory:app.directory});await persisted.init();assert.deepEqual(persisted.records,[record]);
 assert.equal(summarize([record]).combatMatches,1);assert.equal(summarize([record],{hero:'nonexistent'}).total,0);
 const raw=await readFile(join(app.directory,'matches.ndjson'),'utf8');assert.equal(JSON.parse(raw).id,record.id);
});
test('server rejects opponent control, illegal targets, forged damage, stale sequence and loadout edits during a match',async t=>{
 const app=await fixture(t);const p=await pair(app);await start(p);const before=structuredClone(p.room.state);
 const owner=p.room.players[0].side===currentUnit(before).side?p.a:p.b;const other=owner===p.a?p.b:p.a;
 other.send({type:'action',seq:0,actionId:'guard',targetId:currentUnit(before).id});assert.match((await other.next('error')).message,/sua vez/);
 owner.send({type:'action',seq:0,actionId:'basic',targetId:currentUnit(before).id});assert.match((await owner.next('error')).message,/Alvo/);
 owner.send({type:'action',seq:0,actionId:'hacked',targetId:'1-foo',damage:999999});await owner.next('error');
 owner.send({type:'action',seq:999,actionId:'guard',targetId:currentUnit(before).id});await owner.next('error');
 owner.send({type:'loadout',loadout:defaultLoadout()});assert.match((await owner.next('error')).message,/travada/);
 assert.deepEqual(p.room.state,before);assert.equal(p.room.seq,0);
 owner.send({type:'action',seq:0,actionId:'guard',targetId:currentUnit(before).id,damage:999999,hp:999999});await owner.next('turn');
 const expected=structuredClone(before);act(expected,'guard',currentUnit(before).id);assert.deepEqual(p.room.state,expected);
 owner.send({type:'action',seq:0,actionId:'guard',targetId:currentUnit(before).id});assert.match((await owner.next('error')).message,/repetida/);
});
test('session tokens reconnect only their own seat; replacement cannot be disconnected by an old socket',async t=>{
 const app=await fixture(t,{reconnectMs:500});const p=await pair(app);await start(p);
 p.a.ws.terminate();await delay(40);const resumed=await app.connect();resumed.send({type:'resume',code:p.sessionA.code,token:p.sessionA.token});const session=await resumed.next('session');assert.equal(session.seat,0);assert.equal((await resumed.next('room')).phase,'playing');
 const bad=await app.connect();bad.send({type:'resume',code:p.sessionA.code,token:'invalid'});await bad.next('error');
 assert.equal(p.room.players[0].peer.readyState,1);
 resumed.send({type:'leave'});await resumed.next('left');await app.store.serial;assert.equal(app.store.records[0].reason,'surrender');assert.equal(app.store.records[0].winner,p.room.players[1].side);
});
test('turn timeout and exhausted reconnect grace create distinct outcomes, excluded from combat win rates',async t=>{
 const app=await fixture(t,{turnMs:100,reconnectMs:100});const p=await pair(app);await start(p);
 app.rooms.tick(Date.now()+200);assert.equal(p.room.reason,'timeout');await app.store.serial;
 assert(summarize(app.store.records).heroes.every(h=>h.combatGames===0&&h.winRate===null));
 const q=await pair(app);await start(q);q.a.ws.terminate();await delay(40);app.rooms.tick(Date.now()+200);assert.equal(q.room.reason,'disconnect');
});
test('logs require an admin key, origins are checked and client build mismatches cannot create rooms',async t=>{
 const app=await fixture(t,{origins:['https://game.example']});const c=await app.connect();c.send({type:'create',build:'old'});await c.next('error');assert.equal(app.rooms.rooms.size,0);
 assert.equal((await fetch(app.address+'/admin/logs')).status,401);
 const authorized=await fetch(app.address+'/admin/logs',{headers:{Authorization:'Bearer test-secret-long-enough-for-admin'}});assert.equal(authorized.status,200);
 assert.equal((await fetch(app.address+'/health')).status,200);
 const denied=new WebSocket(app.address.replace('http','ws')+'/pvp',{origin:'https://other.example'});const error=await new Promise(r=>denied.on('error',r));assert.match(error.message,/403/);
});
test('remote log failures keep a local copy and retry with a backend-only key',async t=>{
 const {createServer}=await import('node:http');let fail=true;let posted=[];
 const remote=createServer(async(req,res)=>{
  assert.equal(req.headers.apikey,'backend-test-key');assert.equal(req.headers.authorization,'Bearer backend-test-key');
  if(req.method==='GET'){res.setHeader('Content-Type','application/json');return res.end('[]');}
  let body='';for await(const bytes of req)body+=bytes;
  if(fail){res.writeHead(503);return res.end('unavailable');}
  posted=JSON.parse(body);res.writeHead(201);res.end();
 });await new Promise(r=>remote.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>remote.close(r)));
 const directory=await mkdtemp(join(tmpdir(),'nexus-pvp-remote-'));const store=new PvpStore({directory,url:`http://127.0.0.1:${remote.address().port}`,key:'backend-test-key'});await store.init();
 const record={id:'test-record',startedAt:new Date().toISOString(),mode:'pvp'};await store.save(record);
 assert.equal(store.status().pending,1);assert.deepEqual(JSON.parse(await readFile(join(directory,'matches.ndjson'),'utf8')),record);
 fail=false;await store.flushRemote();assert.equal(store.status().pending,0);assert.deepEqual(posted,[{id:record.id,created_at:record.startedAt,payload:record}]);
 assert.throws(()=>new PvpStore({url:'https://example.com',key:''}));
});
