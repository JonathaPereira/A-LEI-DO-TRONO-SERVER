import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {createPvpServer} from '../server/pvp.mjs';
import {PvpStore} from '../server/pvp-store.mjs';
import {createGameServer} from './serve-game.mjs';
import {currentUnit} from '../src/engine.js';
const scratch=await mkdtemp(join(tmpdir(),'nexus-pvp-web-'));
const app=await createPvpServer({store:new PvpStore({directory:scratch})});
const web=createGameServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await new Promise(r=>web.listen(0,'127.0.0.1',r));
const address=`http://127.0.0.1:${web.address().port}`;const socket=`ws://127.0.0.1:${app.server.address().port}/pvp`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pages=[];const errors=[];const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(condition,message){const limit=Date.now()+20000;while(!condition()&&Date.now()<limit)await delay(100);assert(condition(),message);}
try{
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1600,height:900}});const page=await context.newPage();pages.push(page);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(address+'/?pvp=1&pvp_server='+encodeURIComponent(socket));
  await page.waitForFunction(()=>!document.querySelector('#status'),null,{timeout:60000});await page.waitForTimeout(1800);
 }
 const [a,b]=pages;
 await a.mouse.click(80,184,{delay:120});await until(()=>app.rooms.rooms.size===1,'Browser creates room');const room=[...app.rooms.rooms.values()][0];
 await b.mouse.click(190,184,{delay:120});await b.keyboard.type(room.code,{delay:180});await b.mouse.click(375,184,{delay:120});await until(()=>room.players.every(Boolean),'Browser joins by code');await delay(1000);
 // Both clients have the default loadout. Confirm through the rendered buttons.
 await a.mouse.click(790,684,{delay:120});await until(()=>room.players[0].ready,'First browser confirms');await delay(500);await b.mouse.click(790,684,{delay:120});await until(()=>room.phase==='playing','Both browser clients confirm their teams');
 await delay(1000);
 const active=currentUnit(room.state).side;const owner=room.players[0].side===active?a:b;
 await owner.mouse.click(500,420,{delay:120});await owner.keyboard.press('1',{delay:100});await owner.keyboard.press('Enter',{delay:100});
 await until(()=>room.seq>=1,'A keyboard action in the exported Godot reaches the authoritative server');await delay(1800);
 await mkdir('artifacts/pvp-browser',{recursive:true});await a.screenshot({path:'artifacts/pvp-browser/player-one.png'});await b.screenshot({path:'artifacts/pvp-browser/player-two.png'});
 assert.deepEqual(errors,[],'Exported Godot has no browser errors');
 console.log('✓ Dois navegadores carregaram a exportação Godot, criaram uma sala, confirmaram os trios e executaram uma ação online.');
}catch(error){
 await mkdir('artifacts/pvp-browser',{recursive:true});
 for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`artifacts/pvp-browser/failure-${i}.png`}).catch(()=>{});
 console.error('Browser errors:',errors);throw error;
}finally{await browser.close();await app.close();await new Promise(r=>web.close(r));}
