'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const express=require('express'),{chromium,expect}=require('@playwright/test');
test('anonymous website login offers a direct Windows download on desktop and mobile',{timeout:45000},async()=>{
  const host=express();host.get('/downloads/MN-Trono-0.1.7-Windows.exe',(_,response)=>response.type('application/octet-stream').send(Buffer.from([0x4d,0x5a,1,2])));host.use(express.static(path.resolve(__dirname,'../frontend')));
  const server=await new Promise(resolve=>{const value=host.listen(0,'127.0.0.1',()=>resolve(value));}),origin='http://127.0.0.1:'+server.address().port;let browser;
  try{
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const context=await browser.newContext({acceptDownloads:true});await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());const page=await context.newPage();await page.goto(origin);await page.evaluate(()=>window.TronoAuth.open('login'));
    assert.equal(await page.evaluate(()=>window.TronoAuth.user),null);
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});const button=page.locator('#authDesktopDownload');await expect(button).toBeVisible();assert.equal(await button.getAttribute('href'),'/downloads/MN-Trono-0.1.7-Windows.exe');const box=await button.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
      const event=page.waitForEvent('download');await button.click();const download=await event;assert.equal(download.suggestedFilename(),'MN-Trono-0.1.7-Windows.exe');assert.equal(await download.failure(),null);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
