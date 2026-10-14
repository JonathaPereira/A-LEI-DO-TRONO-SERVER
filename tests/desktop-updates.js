'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createUpdates,UPDATE_URL}=require('../desktop/app/updates.cjs');
test('updates download internally and install only after readiness and restart consent',async()=>{
  const updater=new EventEmitter();let installed=0,prepared=0,allowed=false,checks=0,feed;
  updater.setFeedURL=value=>feed=value;updater.checkForUpdates=async()=>{checks++;updater.emit('checking-for-update');};updater.quitAndInstall=()=>installed++;
  const states=[],service=createUpdates({updater,enabled:true,publish:state=>states.push(state),confirm:async()=>allowed,prepareInstall:()=>prepared++});
  assert.equal(feed.url,UPDATE_URL);assert(updater.autoDownload&&updater.autoInstallOnAppQuit);
  await assert.rejects(service.install(),/Nenhuma/);await service.check();assert.equal(checks,1);
  updater.emit('update-available',{version:'0.1.2'});await service.check();assert.equal(checks,1);updater.emit('download-progress',{percent:42.1});assert.equal(service.state.percent,42);
  updater.emit('update-downloaded',{version:'0.1.2'});assert.equal((await service.install()).canceled,true);assert.equal(installed,0);assert.equal(prepared,0);
  allowed=true;assert.equal((await service.install()).restarting,true);assert.equal(installed,1);assert.equal(prepared,1);assert(states.some(state=>state.status==='ready'));
});
test('development and offline update checks preserve the running app',async()=>{
  const updater=new EventEmitter();updater.setFeedURL=()=>{};updater.checkForUpdates=async()=>{throw Error('offline');};
  const service=createUpdates({updater,enabled:true,publish:()=>{},confirm:async()=>false,prepareInstall:()=>{}});assert.equal((await service.check()).status,'error');await assert.rejects(service.install(),/Nenhuma/);
  const dev=createUpdates({updater,enabled:false,publish:()=>{},confirm:async()=>false,prepareInstall:()=>{}});assert.equal((await dev.check()).status,'development');
});
test('an app several releases behind downloads the latest full installer in one step',async()=>{
  const updater=new EventEmitter();updater.currentVersion={version:'0.1.1'};let feed,checks=0,installed=0;
  updater.setFeedURL=value=>feed=value;updater.quitAndInstall=()=>installed++;
  updater.checkForUpdates=async()=>{checks++;updater.emit('update-available',{version:'0.1.8',files:[{url:'MN-Trono-0.1.8-Windows.exe'}]});updater.emit('download-progress',{percent:62});};
  const service=createUpdates({updater,enabled:true,publish:()=>{},confirm:async()=>true,prepareInstall:()=>{}});
  await service.check();assert.equal(feed.url,UPDATE_URL);assert.equal(service.state.version,'0.1.8');assert.equal(service.state.percent,62);assert.equal(updater.disableDifferentialDownload,true);assert.equal(updater.allowDowngrade,false);
  updater.emit('update-downloaded',{version:'0.1.8'});await service.check();assert.equal(checks,1);await service.install();assert.equal(installed,1);
});
test('checking again replaces an older downloaded version with the latest before installation',async()=>{
  const updater=new EventEmitter();let checks=0,installed=0,releaseConsent;
  updater.setFeedURL=()=>{};updater.quitAndInstall=()=>installed++;updater.checkForUpdates=async()=>{checks++;updater.emit('checking-for-update');updater.emit('update-available',{version:'0.1.8'});};
  const service=createUpdates({updater,enabled:true,publish:()=>{},confirm:()=>new Promise(resolve=>releaseConsent=resolve),prepareInstall:()=>{}});
  updater.emit('update-downloaded',{version:'0.1.2'});const oldInstall=service.install();await service.check({force:true});assert.equal(checks,1);assert.equal(service.state.version,'0.1.8');releaseConsent(true);assert.equal((await oldInstall).pending,true);assert.equal(installed,0);
  updater.emit('update-downloaded',{version:'0.1.8'});const latestInstall=service.install();releaseConsent(true);assert.equal((await latestInstall).restarting,true);assert.equal(installed,1);
});
test('an offline latest-version check retains the already verified installer',async()=>{
  const updater=new EventEmitter();updater.setFeedURL=()=>{};updater.checkForUpdates=async()=>{updater.emit('checking-for-update');updater.emit('error',Error('offline'));throw Error('offline');};
  const service=createUpdates({updater,enabled:true,publish:()=>{},confirm:async()=>false,prepareInstall:()=>{}});updater.emit('update-downloaded',{version:'0.1.2'});
  await service.check({force:true});assert.equal(service.state.status,'ready');assert.equal(service.state.version,'0.1.2');assert.match(service.state.message,/já baixada/);
});
test('the installed updater reads the existing Surge feed and resolves an external GitHub installer with SHA-512',async()=>{
 const {GenericProvider}=require('../desktop/app/node_modules/electron-updater/out/providers/GenericProvider'),crypto=require('node:crypto'),bytes=Buffer.from('test installer'),sha512=crypto.createHash('sha512').update(bytes).digest('base64');
 const download='https://github.com/JonathaPereira/MN-Trono-Downloads/releases/download/v0.1.11/MN-Trono-0.1.11-Windows.exe',requests=[];
 const provider=new GenericProvider({provider:'generic',url:UPDATE_URL},{channel:null,isAddNoCacheQuery:false},{platform:'win32',executor:{request:async options=>{requests.push(options);return `version: 0.1.11\nfiles:\n  - url: ${download}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${download}\nsha512: ${sha512}\n`;}}});
 const info=await provider.getLatestVersion(),resolved=provider.resolveFiles(info);assert.equal(requests[0].hostname,'a-lei-do-trono.surge.sh');assert.equal(requests[0].path,'/downloads/latest.yml');assert.equal(resolved.length,1);assert.equal(resolved[0].url.href,download);assert.equal(resolved[0].info.sha512,sha512);assert.equal(resolved[0].info.size,bytes.length);
});
