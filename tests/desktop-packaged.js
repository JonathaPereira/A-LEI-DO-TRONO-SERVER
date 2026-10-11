'use strict';
// Launch the binary produced by electron-builder, with its installed resource
// paths. This catches missing bundled files that development-mode tests cannot.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
const {_electron,expect}=require('@playwright/test');
test('compiled Windows app starts with its own game, interface and RNNoise resources',{timeout:90000},async t=>{
  const executable=path.resolve(__dirname,'../artifacts/windows-app/win-unpacked/MN Trono.exe');
  await fs.access(executable);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mn-packaged-'));let app,finished=false;
  t.signal.addEventListener('abort',()=>{if(!finished)app?.process().kill();},{once:true});
  try{
    app=await _electron.launch({executablePath:executable,args:['--user-data-dir='+directory],timeout:40000});
    assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
    const page=await app.firstWindow();await expect(page.locator('#desktopRail')).toBeVisible({timeout:30000});
    assert.equal(page.url(),'https://a-lei-do-trono.surge.sh/');
    assert.equal(await page.evaluate(()=>typeof require),'undefined');
    assert.equal(await page.evaluate(()=>window.TronoDesktop.version),'0.1.1');
    const resources=await page.evaluate(async()=>Promise.all(['/game.js','/desktop-shell.js','/desktop-shell.css','/assets/portal_realms.png','/vendor/rnnoise/rnnoise.wasm','/application-audio-worklet.js'].map(async url=>{const response=await fetch(url);return {url,status:response.status,bytes:(await response.arrayBuffer()).byteLength};})));
    for(const resource of resources){assert.equal(resource.status,200,resource.url);assert(resource.bytes>0,resource.url);}
    await page.evaluate(()=>window.TronoAuth.ready);if(await page.locator('#authDialog').isVisible())await page.locator('#authCloseBtn').click();
    await page.locator('[data-desktop-route="clips"]').click();await expect(page.locator('.desktop-clips-page')).toBeVisible();
    await expect(page.locator('.clips-footnote')).toContainText('neste aplicativo');
    await page.locator('[data-desktop-route="home"]').click();await expect(page.locator('#portalScreen')).toBeVisible();
    assert(await page.evaluate(async()=>{const context=new AudioContext({sampleRate:48000});let processor;try{await context.resume();processor=await window.TronoNoise.create(context);return processor.node instanceof AudioWorkletNode;}finally{processor?.destroy();await context.close();}}));
    await page.screenshot({path:path.resolve(__dirname,'../artifacts/windows-packaged-app.png')});
  }finally{finished=true;if(app){const timer=setTimeout(()=>app.process().kill(),5000);try{await app.close();}finally{clearTimeout(timer);}}await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});}
});
