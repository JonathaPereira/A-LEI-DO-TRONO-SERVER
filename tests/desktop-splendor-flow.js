'use strict';
// Test-only: inject the local fixture URL before the installed network module.
// Electron does not reliably apply context.addInitScript on a window reload.
// All game/UI code still comes from the actual installed resources.
const fs=require('node:fs/promises'),path=require('node:path'),{expect}=require('@playwright/test'),{startFixture}=require('./auth-fixture');
async function exerciseSplendor({page,frontend,screenshot}){
 const fixture=await startFixture({port:10844,appOrigin:'https://a-lei-do-trono.surge.sh'});
 try{
  const email='installed-splendor@example.test';await fixture.call('signup',{email,nickname:'Mercador instalado',password:'Senha12!'});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});const data=(await fixture.call('login',{email,password:'Senha12!'})).data;
  const installedNetwork=await fs.readFile(path.join(frontend,'network.js'),'utf8');
  await page.route('**/network.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:'window.TRONO_BACKEND_URL='+JSON.stringify(fixture.base)+';\n'+installedNetwork}));
  await page.evaluate(data=>{sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoMusicEnabled','0');localStorage.setItem('tronoSfxEnabled','0');},data);
  await page.reload();await page.evaluate(()=>window.TronoAuth.ready);
  if(!await page.evaluate(()=>!!window.TronoAuth.user))throw Error('Installed fixture session '+JSON.stringify(await page.evaluate(()=>({backend:window.TronoNetwork.BACKEND_HTTP,hasSession:!!sessionStorage.getItem('mn-auth-session-v1'),message:document.querySelector('#authMessage')?.textContent}))));
  await page.locator('[data-desktop-route=game]').click();await page.locator('#playSplendor').click();await page.locator('#splendorPlayerCount').selectOption('4');await page.getByRole('button',{name:'Criar mesa',exact:true}).click();await expect(page.locator('.sp-seats')).toBeVisible();await page.getByRole('button',{name:'Completar com bots e começar'}).click();
  await expect(page.locator('.sp-market-row')).toHaveCount(3);await expect(page.locator('.sp-market .sp-card')).toHaveCount(12);await expect(page.locator('.sp-noble')).toHaveCount(5);await expect(page.locator('.sp-player')).toHaveCount(4);
  await expect(page.locator('[data-token="0"]')).toBeEnabled({timeout:18000});const before=await page.evaluate(()=>window.TronoSplendor.room.state.revision);for(const color of [0,1,2])await page.locator('[data-token="'+color+'"]').click();await page.locator('#splendorTake').click();await expect.poll(()=>page.evaluate(()=>window.TronoSplendor.room.state.revision)).toBeGreaterThan(before);
  if(screenshot)await page.screenshot({path:screenshot});
 }finally{await fixture.stop();}
}
module.exports={exerciseSplendor};
