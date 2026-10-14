'use strict';
// Test-only: inject the fixture URL into the local file response before the
// installed network module executes. Electron custom protocols bypass the
// Playwright routing/init-script hooks; no production test flag is introduced.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{expect}=require('@playwright/test'),{startFixture}=require('./auth-fixture');
async function exerciseSplendor({app,page,frontend,screenshot}){
 const fixture=await startFixture({port:10844,loveLetterSeed:1,allowedOrigins:['https://a-lei-do-trono.surge.sh']});
 try{
  const email='installed-splendor@example.test';await fixture.call('signup',{email,nickname:'Mercador instalado',password:'Senha12!'});await fixture.call('verify',{token_hash:[...fixture.links.keys()].at(-1),type:'signup'});const login=await fixture.call('login',{email,password:'Senha12!'});assert.equal(login.status,200,'Native fixture login must succeed before browser injection');const data=login.data;
  await fs.access(path.join(frontend,'network.js'));
  await app.evaluate(({net},base)=>{
    const original=net.fetch.bind(net);global.__mnSplendorTestFetch=net.fetch;
    net.fetch=async(input,options)=>{
      const response=await original(input,options);
      if(typeof input==='string'&&input.startsWith('file:')&&input.endsWith('/network.js')){
        const source='window.TRONO_BACKEND_URL='+JSON.stringify(base)+';\n'+await response.text(),headers=new Headers(response.headers);headers.delete('content-length');headers.set('content-type','application/javascript');return new Response(source,{status:response.status,headers});
      }
      return response;
    };
  },fixture.base);
  await page.evaluate(data=>{sessionStorage.setItem('mn-auth-session-v1',JSON.stringify(data));localStorage.setItem('tronoMusicEnabled','0');localStorage.setItem('tronoSfxEnabled','0');},data);
  await page.reload();await page.evaluate(()=>window.TronoAuth.ready);
  if(!await page.evaluate(()=>!!window.TronoAuth.user))throw Error('Installed fixture session '+JSON.stringify(await page.evaluate(()=>({backend:window.TronoNetwork.BACKEND_HTTP,hasSession:!!sessionStorage.getItem('mn-auth-session-v1'),message:document.querySelector('#authMessage')?.textContent}))));
  await page.locator('[data-desktop-route=game]').click();await page.locator('#playSplendor').click();await page.locator('#splendorPlayerCount').selectOption('4');await page.getByRole('button',{name:'Criar mesa',exact:true}).click();await expect(page.locator('.sp-seats')).toBeVisible();await page.getByRole('button',{name:'Completar com bots e começar'}).click();
  await expect(page.locator('.sp-market-row')).toHaveCount(3);await expect(page.locator('.sp-market .sp-card')).toHaveCount(12);await expect(page.locator('.sp-noble')).toHaveCount(5);await expect(page.locator('.sp-player')).toHaveCount(4);
  await expect(page.locator('[data-token="0"]')).toBeEnabled({timeout:18000});const before=await page.evaluate(()=>window.TronoSplendor.room.state.revision);for(const color of [0,1,2])await page.locator('[data-token="'+color+'"]').click();await page.locator('#splendorTake').click();await expect.poll(()=>page.evaluate(()=>window.TronoSplendor.room.state.revision)).toBeGreaterThan(before);
  if(screenshot)await page.screenshot({path:screenshot});
  await require('./desktop-love-letter-flow').exerciseLoveLetter({page,screenshot:screenshot?.replace('splendor','love-letter')});
 }finally{await app.evaluate(({net})=>{if(global.__mnSplendorTestFetch){net.fetch=global.__mnSplendorTestFetch;delete global.__mnSplendorTestFetch;}}).catch(()=>{});await fixture.stop();}
}
module.exports={exerciseSplendor};
