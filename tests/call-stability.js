'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {CallStability,diagnosticReport}=require('../frontend/call-stability');
test('temporary video adaptation needs sustained trouble and restores slowly without modifying audio or selected settings',()=>{
  const controller=new CallStability(),base={camera:{width:1280,height:720,fps:30},screen:{width:1920,height:1080,fps:60},screenBitrate:10000000,videoBitrate:3000000,audioBitrate:96000};
  assert.equal(controller.sample({audioLossPct:10},0),false);assert.equal(controller.sample({},2000),false);assert.equal(controller.level,0);
  for(const time of [10000,12000,15000])assert.equal(controller.sample({limiter:'cpu'},time),false);assert.equal(controller.sample({limiter:'cpu'},22000),true);assert.equal(controller.level,1);assert.equal(controller.profile(base).screen.fps,30);assert.equal(controller.profile(base).audioBitrate,base.audioBitrate);assert.equal(base.screen.fps,60);
  assert.equal(controller.sample({eventLoopLagMs:250},34000),false);assert.equal(controller.sample({eventLoopLagMs:250},42000),true);assert.equal(controller.level,2);assert.equal(controller.profile(base).camera.fps,15);
  controller.sample({},44000);assert.equal(controller.sample({},100000),false);assert.equal(controller.sample({},104000),true);assert.equal(controller.level,1);assert.equal(controller.sample({},164000),true);assert.equal(controller.level,0);
  controller.sample({audioJitterMs:90},190000);controller.sample({audioJitterMs:90},202000);assert.equal(controller.level,1);assert.equal(controller.sample({},203000,false),true);assert.deepEqual(controller.profile(base),base);
});
test('diagnostic report only includes selected technical fields and excludes messages, credentials, addresses and identities',()=>{
  const report=JSON.parse(diagnosticReport({version:'0.1.7',platform:'Windows',call:{joined:true,name:'Private name',token:'secret',transport:'p2p'},telemetry:{rttMs:75,ip:'10.1.1.1',sdp:'private',messages:['secret']},processing:'native',resources:{appCpuPercent:4,appMemoryMB:200,freeMemoryMB:4000,path:'private'}}));
  assert.equal(report.metrics.rttMs,75);assert(!JSON.stringify(report).includes('secret'));assert(!JSON.stringify(report).includes('Private name'));assert(!JSON.stringify(report).includes('10.1.1.1'));assert.equal(report.resources.appMemoryMB,200);
});
