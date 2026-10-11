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
