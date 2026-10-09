'use strict';
const {spawn}=require('child_process');
const path=require('path');
const assert=require('assert');
const backend=path.resolve(__dirname,'..');
const VERSION='0.7.9-alpha';
const WebSocket=require('ws');
const port=10181;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,timeout=8000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await wait(80);}throw new Error('timeout aguardando backend');}
function connect(){return new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),queue=[],waiters=[];ws.on('message',raw=>{const m=JSON.parse(raw.toString());const i=waiters.findIndex(w=>w.pred(m));if(i>=0){const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(m);}else queue.push(m);});ws.once('error',reject);ws.once('open',()=>resolve({ws,wait(pred,timeout=5000){const i=queue.findIndex(pred);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((res,rej)=>{const w={pred,resolve:res,timer:setTimeout(()=>{const x=waiters.indexOf(w);if(x>=0)waiters.splice(x,1);rej(new Error('mensagem WebSocket não recebida'));},timeout)};waiters.push(w);});}}));});}
(async()=>{
 const proc=spawn(process.execPath,[path.join(backend,'server.js')],{cwd:backend,env:{...process.env,PORT:String(port),AUTH_REQUIRED:'false',CLOUDFLARE_REALTIME_ENABLED:'false'},stdio:['ignore','pipe','pipe']});let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
 try{
  await waitFor(async()=>{try{const r=await fetch(`http://127.0.0.1:${port}/health`);const j=await r.json();return r.ok&&j.ok&&j.version===VERSION;}catch{return false;}});
  console.log('✓ /health');
  const a=await connect(),b=await connect();const wa=await a.wait(m=>m.type==='welcome'),wb=await b.wait(m=>m.type==='welcome');assert.equal(wa.serverVersion,VERSION);assert.equal(wb.serverVersion,VERSION);
  a.ws.send(JSON.stringify({type:'check-name',requestId:'name-a',name:'Alice'}));const pre=await a.wait(m=>m.type==='name-check-result'&&m.requestId==='name-a');assert.equal(pre.available,true);
  a.ws.send(JSON.stringify({type:'join-room',roomId:'chat-livre',name:'Alice'}));b.ws.send(JSON.stringify({type:'join-room',roomId:'chat-livre',name:'Bob'}));await a.wait(m=>m.type==='joined-room');await b.wait(m=>m.type==='joined-room');console.log('✓ entrada de dois clientes no chat-livre');
  b.ws.send(JSON.stringify({type:'check-name',requestId:'dup',name:'alice'}));const dup=await b.wait(m=>m.type==='name-check-result'&&m.requestId==='dup');assert.equal(dup.available,false);assert.equal(dup.code,'NAME_TAKEN');console.log('✓ nomes duplicados são recusados sem diferenciar maiúsculas/minúsculas');
  a.ws.send(JSON.stringify({type:'chat-message',text:'Teste automático M&N'}));const chat=await b.wait(m=>m.type==='chat-message'&&m.message?.text==='Teste automático M&N');assert.equal(chat.message.name,'Alice');console.log('✓ chat de texto');
  a.ws.send(JSON.stringify({type:'voice-state',joined:true,muted:false,camera:false,screen:false,quality:'balanced',transport:'p2p'}));b.ws.send(JSON.stringify({type:'voice-state',joined:true,muted:false,camera:false,screen:false,quality:'balanced',transport:'p2p'}));await a.wait(m=>m.type==='voice-roster'&&m.players?.length===2);await b.wait(m=>m.type==='voice-roster'&&m.players?.length===2);console.log('✓ roster de voz');
  a.ws.send(JSON.stringify({type:'voice-state',joined:true,transport:'sfu-pending'}));await b.wait(m=>m.type==='voice-roster'&&m.players?.some(p=>p.id===wa.clientId&&p.transport==='p2p'));
  a.ws.send(JSON.stringify({type:'voice-state',joined:true,transport:'p2p'}));await b.wait(m=>m.type==='voice-roster'&&m.players?.some(p=>p.id===wa.clientId&&p.transport==='p2p'));console.log('✓ modo da sala é distinto de P2P e o fallback é anunciado');
  a.ws.send(JSON.stringify({type:'voice-signal',targetId:wb.clientId,signalType:'offer',data:{sdp:'fake-test-sdp'}}));const sig=await b.wait(m=>m.type==='voice-signal'&&m.signalType==='offer');assert.equal(sig.fromId,wa.clientId);console.log('✓ sinalização P2P');
  a.ws.send(JSON.stringify({type:'voice-signal',targetId:wb.clientId,signalType:'stream-watch',data:{watching:true}}));const watch=await b.wait(m=>m.type==='voice-signal'&&m.signalType==='stream-watch');assert.equal(watch.data.watching,true);console.log('✓ Assistir stream é sinalizado entre membros da call');
  a.ws.send(JSON.stringify({type:'join-room',roomId:'chat-jogos',name:'Alice'}));
  const moved=await a.wait(m=>m.type==='joined-room'&&m.room?.id==='chat-jogos');assert.equal(moved.room.kind,'chat');
  a.ws.send(JSON.stringify({type:'voice-state',joined:true,transport:'p2p'}));await a.wait(m=>m.type==='voice-roster'&&m.players?.length===1);a.ws.send(JSON.stringify({type:'voice-signal',targetId:wb.clientId,signalType:'stream-watch',data:{watching:true}}));await assert.rejects(()=>b.wait(m=>m.type==='voice-signal'&&m.signalType==='stream-watch',400),/não recebida/);console.log('✓ sinal de stream não cruza salas');
  const c=await connect();await c.wait(m=>m.type==='welcome');
  c.ws.send(JSON.stringify({type:'join-room',roomId:'chat-jogos',name:'Carol'}));await c.wait(m=>m.type==='joined-room'&&m.room?.id==='chat-jogos');
  a.ws.send(JSON.stringify({type:'chat-message',text:'Somente Jogos'}));
  await c.wait(m=>m.type==='chat-message'&&m.message?.text==='Somente Jogos');
  await assert.rejects(()=>b.wait(m=>m.type==='chat-message'&&m.message?.text==='Somente Jogos',400),/não recebida/);
  a.ws.send(JSON.stringify({type:'list-chat-channels'}));const channels=await a.wait(m=>m.type==='chat-channels'&&m.channels?.find(x=>x.id==='chat-jogos')?.count===2);
  assert.equal(channels.channels.find(x=>x.id==='chat-jogos').count,2);
  assert.equal(channels.channels.find(x=>x.id==='chat-livre').count,1);
  console.log('✓ canais independentes: mensagens isoladas e participantes contabilizados');
  a.ws.send(JSON.stringify({type:'ping'}));await a.wait(m=>m.type==='pong');console.log('✓ ping/pong');a.ws.close();b.ws.close();c.ws.close();console.log('PASS — integração backend/WebSocket');
 }catch(err){console.error(logs);throw err;}finally{proc.kill('SIGTERM');await wait(200);if(proc.exitCode===null)proc.kill('SIGKILL');}
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
