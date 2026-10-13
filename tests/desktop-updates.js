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
