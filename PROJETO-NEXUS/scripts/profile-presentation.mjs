// Exercise the real exported Godot client and authoritative server, direct and embedded.
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium} from '@playwright/test';
import WebSocket from 'ws';
import {createPvpServer} from '../server/pvp.mjs';
import {PvpStore} from '../server/pvp-store.mjs';
import {BUILD,createPvpBattle} from '../server/pvp-loadout.mjs';
import {getAction,legalTargets,currentUnit} from '../src/engine.js';
import {createGameServer} from './serve-game.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await delay(100);}throw Error('Profiling client did not connect');};
const app=await createPvpServer({store:new PvpStore({directory:await mkdtemp(join(tmpdir(),'nexus-profile-'))})});
const web=createGameServer({directory:process.env.NEXUS_PROFILE_EXPORT||'artifacts/web-game'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>web.listen(0,'127.0.0.1',r));
const address=`http://127.0.0.1:${web.address().port}`,socket=`ws://127.0.0.1:${app.server.address().port}/pvp`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--mute-audio']});
const reports=[];
try{
 for(const embedded of [false,true]){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const page=await context.newPage();
  const url=address+'/?pvp=1&pvp_server='+encodeURIComponent(socket);
  if(embedded){await page.route(address+'/host',r=>r.fulfill({contentType:'text/html',body:`<style>html,body{margin:0;height:100%;background:#101827}iframe{border:0;width:100%;height:100%}</style><iframe src="${url}"></iframe>`}));await page.goto(address+'/host');}
  else await page.goto(url);
  const frame=embedded?page.frames().find(f=>f!==page.mainFrame()):page.mainFrame();
  await frame.waitForFunction(()=>!document.querySelector('#status'),null,{timeout:60000});await delay(1400);
  await page.mouse.click(65,147);await until(()=>app.rooms.rooms.size>0);
  const room=[...app.rooms.rooms.values()].at(-1);
  const bot=new WebSocket(socket);await new Promise(r=>bot.once('open',r));bot.send(JSON.stringify({type:'join',code:room.code,build:BUILD}));await until(()=>room.players.every(Boolean));
  for(const p of room.players)app.rooms.receive(p.peer,{type:'ready',ready:true,build:BUILD});
  await delay(900);
  for(const hero of ['veyra','astra','saira','vesper']){
   const team=[hero,...['veyra','saira','astra'].filter(id=>id!==hero)].slice(0,3);
   const loadouts=[team,['rhazen','oren','maura']].map(team=>({team,gems:Object.fromEntries(team.map(id=>[id,['','','']]))}));
   room.players[0].side=0;room.players[1].side=1;room.players.forEach((p,i)=>p.loadout=loadouts[i]);
   room.state=createPvpBattle(loadouts,1972);room.phase='playing';room.seq+=100;
   room.state.order=room.state.order.filter(id=>id!=='0-'+hero);room.state.order.unshift('0-'+hero);room.state.cursor=0;
   for(const unit of room.state.units){unit.energy=100;unit.hp=Math.floor(unit.maxHp*.6);}
   room.deadline=Date.now()+90000;app.rooms.broadcast(room);await delay(1300);
   await page.evaluate(()=>{window.__frames=[];window.__sampling=true;let last=performance.now();function tick(now){if(!window.__sampling)return;window.__frames.push(now-last);last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
   const actor=currentUnit(room.state),action=getAction(actor,'ultimate'),target=legalTargets(room.state,actor,action)[0];
   app.rooms.receive(room.players[0].peer,{type:'action',seq:room.seq,actionId:'ultimate',targetId:target.id,build:BUILD});
   await delay(5200);
   const samples=await page.evaluate(()=>{window.__sampling=false;return window.__frames.slice(2).sort((a,b)=>a-b);});
   const result={embedded,hero,frames:samples.length,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],worstMs:samples.at(-1),over50ms:samples.filter(t=>t>50).length};reports.push(result);console.log(JSON.stringify(result));
  }
  bot.close();room.players[0].peer.close();app.rooms.rooms.delete(room.code);await context.close();
 }
 await mkdir('artifacts/performance',{recursive:true});await writeFile(resolve(process.argv[2]||'artifacts/performance/current.json'),JSON.stringify({renderer:'Chromium SwiftShader (software, not representative of a real GPU)',reports},null,2));
}finally{await browser.close();await app.close();await new Promise(r=>web.close(r));}
