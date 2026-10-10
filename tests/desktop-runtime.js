'use strict';
// Real Electron/Windows smoke test; browser flow coverage is in desktop-browser.js.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
const {_electron,expect}=require('@playwright/test');
test('installed desktop boundary, native shortcut, picker and filesystem integration',{timeout:90000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mn-runtime-'));let app;
  try{
    app=await _electron.launch({executablePath:require('../desktop/app/node_modules/electron'),args:[path.resolve(__dirname,'../desktop/app'),'--user-data-dir='+directory],timeout:40000});
    const page=await app.firstWindow();await expect(page.locator('#desktopRail')).toBeVisible({timeout:30000});assert.equal(page.url(),'https://a-lei-do-trono.surge.sh/');
    await page.evaluate(()=>window.TronoAuth.ready);if(await page.locator('#authDialog').isVisible())await page.locator('#authClose').click();
    assert.equal(await page.evaluate(()=>typeof require),'undefined');assert.equal(await page.evaluate(()=>typeof process),'undefined');assert.equal(await page.evaluate(()=>window.TronoDesktop.version),'0.1.0');
    await page.locator('[data-desktop-route="clips"]').click();await expect(page.locator('.desktop-clips-page')).toBeVisible();await page.locator('[data-desktop-route="home"]').click();await expect(page.locator('#portalScreen')).toBeVisible();
    // The installed bundle never falls back to remote Surge files.
    assert.equal(await page.evaluate(async()=> (await fetch('/missing-desktop-file')).status),404);
    const registered=await page.evaluate(()=>window.TronoDesktop.configureClips({active:true,shortcut:{ctrl:true,alt:true,code:'F9'}}));assert.equal(registered.active,true);
    assert(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F9')));await page.evaluate(()=>window.TronoDesktop.configureClips({active:false}));assert(!await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F9')));
    // An untrusted child page cannot issue native filesystem IPC, even if it
    // navigates to the app origin with a manually injected test preload.
    const denied=await app.evaluate(async({BrowserWindow})=>{
      const child=new BrowserWindow({show:false,webPreferences:{session:BrowserWindow.getAllWindows()[0].webContents.session,preload:require('node:path').resolve('desktop/app/preload.cjs'),sandbox:true,contextIsolation:true}});
      try{await child.loadURL('https://a-lei-do-trono.surge.sh/');return await child.webContents.executeJavaScript("window.TronoDesktop.chooseFolder().then(()=>false,()=>true)");}finally{child.destroy();}
    });assert(denied);
    await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});dialog.showSaveDialog=async()=>({canceled:true});},directory);
    const folder=await page.evaluate(()=>window.TronoDesktop.chooseFolder());assert.equal(folder.native,true);
    assert.deepEqual(await page.evaluate(()=>window.TronoDesktop.saveClip({filename:'Trono_Clipe_cancel.webm',bytes:Uint8Array.from([0x1a,0x45,0xdf,0xa3,4]).buffer})),{canceled:true});
    const result=await page.evaluate(folder=>window.TronoDesktop.saveClip({directory:folder.id,filename:'Trono_Clipe_native.webm',bytes:Uint8Array.from([0x1a,0x45,0xdf,0xa3,4]).buffer}),folder);assert(result.saved);assert.equal((await fs.readFile(path.join(directory,'Trono_Clipe_native.webm'))).length,5);
    await assert.rejects(page.evaluate(folder=>window.TronoDesktop.saveClip({directory:folder.id,filename:'../bad.webm',bytes:new ArrayBuffer(5)}),folder));
    // Enumerate real OS sources and cancel without starting a capture.
    await page.evaluate(()=>{window.__captureResult=navigator.mediaDevices.getDisplayMedia({video:true,audio:false}).then(()=> 'unexpected',error=>error.name);});
    await expect(page.locator('.desktop-capture-dialog')).toBeVisible({timeout:30000});await page.locator('.desktop-capture-dialog .dialog-close').click();assert.equal(await page.evaluate(()=>window.__captureResult),'NotAllowedError');
    await page.screenshot({path:path.resolve(__dirname,'../artifacts/windows-app-runtime.png')});
    // Closing the window retains the process/call for the tray; quit is explicit.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  }finally{await app?.close();await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});}
});
