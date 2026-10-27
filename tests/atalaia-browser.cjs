'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),express=require('express');
const {chromium,expect}=require('@playwright/test');
const {startFixture}=require('./auth-fixture');
const {installCanvasCamera}=require('./camera-fixture');
const {url:gameURL}=require('../electron/atalaia-config.cjs');
async function readSave(frame) {
 return frame.evaluate(async()=>{
  for(const database of await indexedDB.databases()) {
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   try { for(const store of db.objectStoreNames) {
    const values=await new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    for(const value of values) if(value.contents) {
     try {const data=JSON.parse(new TextDecoder().decode(value.contents));if(Array.isArray(data.towers)&&'wave' in data)return data;}catch{}
    }
   }}finally{db.close();}
  }
  return null;
 });
}
test('Atalaia runs its actual Godot export, saves combat, downloads CSV and preserves the call', {timeout:120000},async()=>{
 const server=express().use(express.static(path.resolve('out'))).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));
 const origin='http://127.0.0.1:'+server.address().port;
 let gameRequests=0,workletRequests=0;
 const gameServer=express().use((req,res,next)=>{gameRequests++;if(req.path.endsWith('.audio.position.worklet.js'))workletRequests++;next();}).use(express.static(path.resolve('artifacts/atalaia/web'))).listen(0,'127.0.0.1');
 await new Promise(r=>gameServer.on('listening',r));
 const mirror='http://127.0.0.1:'+gameServer.address().port+'/';
 const fixture=await startFixture({port:10863,appOrigin:origin});let browser;
 try{
  await fs.access('artifacts/atalaia/web/index.wasm');
  const email='atalaia-browser@example.test';
  await fixture.call('signup',{email,nickname:'Defensor',password:'Senha12!'});
  await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});
  const {data}=await fixture.call('login',{email,password:'Senha12!'});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||(process.platform==='linux'?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--mute-audio']});
  const context=await browser.newContext({viewport:{width:1600,height:1050},permissions:['microphone','camera']});
  const gameErrors=[];
  context.on('page',p=>{
   p.on('pageerror',e=>{if(p.url().startsWith(mirror))gameErrors.push(e.message);});
   p.on('console',m=>{if(m.type()==='error'&&m.location().url.startsWith(mirror))gameErrors.push(m.text());});
  });
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await context.addInitScript({content:'if (location.origin === '+JSON.stringify(origin)+') ('+installCanvasCamera.toString()+')({display:true});'});
  await context.addInitScript(({data,base,origin,mirror,gameURL})=>{if(window!==window.top||location.origin!==origin)return;const open=window.open.bind(window);window.open=(url,...args)=>{if(url===gameURL){window.__atalaiaRequestedURL=url;url=mirror;}return open(url,...args);};window.TRONO_BACKEND_URL=base;sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoMusicEnabled','0');localStorage.setItem('tronoSfxEnabled','0');},{data,base:fixture.base,origin,mirror,gameURL});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.waitForFunction(()=>window.TronoAuth?.ready);await page.evaluate(()=>window.TronoAuth.ready);
  await page.getByRole('button',{name:'Entrar na voz de Jogos',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.TronoSocial.voiceJoined)).toBe(true);
  await page.evaluate(()=>window.TronoCallToolbar.activate('cameraBtn'));
  await expect.poll(()=>page.evaluate(()=>window.TronoSocial.cameraOn)).toBe(true);
  const media=()=>page.evaluate(()=>({socket:window.TronoNetwork.clientId,audio:window.TronoSocial.getLocalAudioTrack()?.id,camera:window.TronoSocial.getMediaSources().find(s=>s.self)?.camera?.getVideoTracks()[0]?.id}));
  const before=await media();assert(before.audio&&before.camera);
  await page.evaluate(()=>window.TronoGames.openLibrary());
  await page.locator('#gamesScreen [data-game=atalaia]').click();
  const screen=page.locator('#atalaiaScreen');await expect(screen).toBeVisible();assert.equal(gameRequests,0);
  const popupPromise=context.waitForEvent('page');
  await screen.getByRole('button',{name:'Jogar Atalaia',exact:true}).click();
  const game=await popupPromise;
  await game.waitForLoadState();
  assert.equal(game.url(),mirror);assert.equal(await page.evaluate(()=>window.__atalaiaRequestedURL),gameURL);
  assert.equal(await game.evaluate(()=>window.opener),null);assert.equal(await game.evaluate(()=>sessionStorage.getItem('mn-auth-session-v1')),null);
  const frame=game.mainFrame();
  await expect(frame.locator('#status')).toHaveCount(0,{timeout:60000});
  assert.equal(await frame.evaluate(()=>typeof window.TronoDesktop),'undefined');
  const click=async(x,y)=>{const box=await frame.locator('canvas').boundingBox();const scale=Math.min(box.width/1600,box.height/900);await game.mouse.click(box.x+(box.width-1600*scale)/2+x*scale,box.y+(box.height-900*scale)/2+y*scale);};
  await click(800,545);await click(120,850);await click(115,440);
  await frame.locator('canvas').press('Space');
  await expect.poll(async()=>{const save=await readSave(frame);return save?.wave;},{timeout:20000}).toBe(1);
  const saved=await readSave(frame);assert.equal(saved.towers.length,1);
  await game.screenshot({path:'artifacts/atalaia/integrated-wave.png'});
  const downloadPromise=game.waitForEvent('download');await click(1390,788);const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/^atalaia-dano-onda-01\.csv$/);
  await download.saveAs('artifacts/atalaia/damage.csv');assert.match(await fs.readFile('artifacts/atalaia/damage.csv','utf8'),/Dano campanha/);
  await screen.getByRole('button',{name:'‹ Jogos',exact:true}).click();
  await page.locator('#gamesScreen [data-game=atalaia]').click();
  assert.deepEqual(await media(),before);
  await game.reload();await expect(game.locator('#status')).toHaveCount(0,{timeout:60000});
  assert.equal((await readSave(game.mainFrame())).towers.length,1);
  await game.screenshot({path:'artifacts/atalaia/saved-campaign-menu.png'});
  assert.deepEqual(await media(),before);assert.deepEqual(errors,[]);assert(workletRequests>0);assert.deepEqual(gameErrors,[]);
 }finally{await browser?.close();await fixture.stop();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>gameServer.close(r))]);}
});
