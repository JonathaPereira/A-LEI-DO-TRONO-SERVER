'use strict';
const assert=require('node:assert/strict'),{expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
const {url}=require('../electron/atalaia-config.cjs');
// Actual Godot bytes served into the real packaged app's isolated game session.
async function exerciseAtalaia({app,page}) {
 const exportRoot=path.resolve('artifacts/atalaia/web');
 await app.evaluate(async({session},{exportRoot})=>{
  const fs=process.getBuiltinModule('node:fs').promises,path=process.getBuiltinModule('node:path');
  await session.fromPartition('persist:mn-atalaia').protocol.handle('https',async request=>{
   const pathname=new URL(request.url).pathname;
   const name=pathname==='/'?'index.html':pathname.slice(1);
   if(!/^[\w.-]+$/.test(name))return new Response('Invalid path',{status:400});
   const type={'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.pck':'application/octet-stream','.png':'image/png'}[path.extname(name)]||'text/plain';
   return new Response(await fs.readFile(path.join(exportRoot,name)),{headers:{'content-type':type}});
  });
 },{exportRoot});
 await page.locator('#gamesScreen [data-game=atalaia]').click();
 const opened=app.waitForEvent('window');await page.getByRole('button',{name:'Jogar Atalaia',exact:true}).click();
 const game=await opened;await game.waitForURL(url,{waitUntil:'load',timeout:60000});
 await expect(game.locator('canvas')).toBeVisible();
 try { await expect(game.locator('#status')).toHaveCount(0,{timeout:60000}); }
 catch(error) { const detail=await game.locator('#status-notice').innerText().catch(()=>game.url());throw new Error('Atalaia did not initialize: '+detail,{cause:error}); }
 assert.equal(game.url(),url);
 assert.deepEqual(await game.evaluate(()=>[typeof window.TronoDesktop,typeof require,window.opener]),['undefined','undefined',null]);
 const policy=await app.evaluate(({BrowserWindow,session})=>{
  const viewer=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('atalaia-mn.surge.sh'));
  const preferences=viewer.webContents.getLastWebPreferences();
  return {isolated:viewer.webContents.session===session.fromPartition('persist:mn-atalaia')&&viewer.webContents.session!==session.fromPartition('persist:mn-trono')&&viewer.webContents.session!==session.fromPartition('persist:mn-nexus'),node:preferences.nodeIntegration,sandbox:preferences.sandbox,preload:preferences.preload||null,count:BrowserWindow.getAllWindows().length};
 });
 assert.deepEqual({...policy,count:undefined},{isolated:true,node:false,sandbox:true,preload:null,count:undefined});
 await page.evaluate(()=>window.TronoDesktop.openAtalaia());
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),policy.count);
 await app.evaluate(({BrowserWindow})=>{
  const viewer=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('atalaia-mn.surge.sh'));
  viewer.focus();
  viewer.webContents.sendInputEvent({type:'keyDown',keyCode:'F11'});
  viewer.webContents.sendInputEvent({type:'keyUp',keyCode:'F11'});
 });
 await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('atalaia-mn.surge.sh')).isFullScreen())).toBe(true);
 await app.evaluate(({BrowserWindow})=>{
  const viewer=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('atalaia-mn.surge.sh'));
  viewer.focus();
  viewer.webContents.sendInputEvent({type:'keyDown',keyCode:'F11'});
  viewer.webContents.sendInputEvent({type:'keyUp',keyCode:'F11'});
 });
 await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('atalaia-mn.surge.sh')).isFullScreen())).toBe(false);
 await fs.mkdir('artifacts/atalaia',{recursive:true});await game.screenshot({path:'artifacts/atalaia/windows-game.png'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('atalaia-mn.surge.sh')).destroy());
 await page.locator('#atalaiaScreen').getByRole('button',{name:'‹ Jogos',exact:true}).click();
 await expect(page.locator('#gamesScreen')).toBeVisible();
 await app.evaluate(async({session})=>session.fromPartition('persist:mn-atalaia').protocol.unhandle('https'));
}
module.exports={exerciseAtalaia};
