'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {_electron}=require('@playwright/test'),{launchDesktop,firstAppWindow}=require('./desktop-first-window.cjs'),{closeTestApp}=require('./desktop-test-close');
test('an explicit Electron executable starts its application only after the automation connection is ready',{timeout:40000,skip:process.platform!=='win32'&&'Windows Electron startup boundary'},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mn-startup-sync-'));let app;
 try {
  const entry=path.join(directory,'main.cjs');
  await fs.writeFile(entry,`const {app,BrowserWindow}=require('electron');app.setName('Trono Startup QA');globalThis.synchronizedStartup=typeof globalThis.__playwright_run==='function';app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:640,height:480});void window.loadURL('data:text/html,<title>Startup synchronization QA</title>');});`);
  app=await launchDesktop(_electron,{executablePath:require('../electron/node_modules/electron'),args:[entry,'--user-data-dir='+path.join(directory,'profile')]});
  assert.equal(await app.evaluate(()=>globalThis.synchronizedStartup),true,'The explicit executable must use the startup handshake before running its entry.');
  const page=await firstAppWindow(app);await page.waitForLoadState();assert.equal(await page.title(),'Startup synchronization QA');
 } finally {await closeTestApp(app);await fs.rm(directory,{recursive:true,force:true});}
});
