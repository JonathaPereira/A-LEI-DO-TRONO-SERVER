'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {testEncoder,readConfig}=require('../electron/replay-native.cjs');
test('native capture preserves wide/portrait proportions within encoding bounds and keeps smaller sources at their real size',()=>{const {fitNativeCapture}=require('../src/lib/clips/native-session.ts');const bounds={width:1920,height:1080};assert.deepEqual(fitNativeCapture(3840,2160,bounds),{width:1920,height:1080});assert.deepEqual(fitNativeCapture(3440,1440,bounds),{width:1920,height:802});assert.deepEqual(fitNativeCapture(1080,1920,bounds),{width:606,height:1080});assert.deepEqual(fitNativeCapture(640,480,bounds),{width:640,height:480});});
test('only an unpackaged local QA fixture can select the software H264 test encoder',()=>{
 const expected={encoder:'h264_mf',encoderLabel:'Media Foundation (teste)'};
 for(const protocol of ['http','https'])assert.deepEqual(testEncoder({packaged:false,origin:protocol+'://127.0.0.1:11987',encoder:'h264_mf'}),expected);
 for(const origin of ['https://example.com','http://127.0.0.1.attacker.test','file:///127.0.0.1','bad-url'])assert.deepEqual(testEncoder({packaged:false,origin,encoder:'h264_mf'}),{});
 assert.deepEqual(testEncoder({packaged:true,origin:'http://127.0.0.1:11987',encoder:'h264_mf'}),{});
 assert.deepEqual(testEncoder({packaged:false,origin:'http://127.0.0.1:11987',encoder:'anything-else'}),{});
});
test('native capture configuration bounds dimensions, rate, memory pressure and cannot select an executable or codec',()=>{
 const valid={width:1280,height:720,fps:30,seconds:30,audio:true,bitrate:6000000};assert.deepEqual(readConfig({...valid,executable:'unsafe',encoder:'unsafe'}),valid);
 for(const patch of [{width:99999},{height:721},{fps:999},{seconds:9999},{audio:'yes'},{bitrate:Infinity}])assert.throws(()=>readConfig({...valid,...patch}),/inválida/);
});
test('native packet framing borrows the full pixel payload instead of copying it into nested containers',()=>{const {replayPacketParts}=require('../electron/replay-input.cjs');const data=Buffer.alloc(1280*720*4);const parts=replayPacketParts(1,42,data);assert.equal(parts.length,2);assert.equal(parts[1],data);assert(parts[0].length<64);});
