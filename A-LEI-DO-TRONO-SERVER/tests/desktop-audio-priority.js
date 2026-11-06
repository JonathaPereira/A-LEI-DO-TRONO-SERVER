'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),os=require('node:os');
const {AudioPriority}=require('../electron/audio-priority.cjs');
const audio=(pid=2,creationTime=100)=>({pid,creationTime,type:'Utility',serviceName:'audio.mojom.AudioService'});
test('Windows priority changes only owned audio services during voice, preserving stronger priorities and restoring on exit',()=>{
  let rows=[audio(),{pid:3,creationTime:100,type:'Tab',name:'Audio Service'},audio(4)],calls=[];const priorities=new Map([[2,0],[3,0],[4,os.constants.priority.PRIORITY_HIGH]]);
  const c=new AudioPriority({platform:'win32',metrics:()=>rows,getPriority:pid=>priorities.get(pid),setPriority:(pid,p)=>{calls.push([pid,p]);priorities.set(pid,p);}});
  try{c.setActive(true);assert.deepEqual(calls,[[2,os.constants.priority.PRIORITY_ABOVE_NORMAL]]);c.refresh();assert.equal(calls.length,1);assert.equal(priorities.get(3),0);c.setActive(false);assert.equal(priorities.get(2),0);assert.equal(priorities.get(4),os.constants.priority.PRIORITY_HIGH);assert.equal(c.timer,null);assert.throws(()=>c.setActive({pid:3}));}finally{c.dispose();}
});
test('process restarts, PID reuse, denied changes and external priority choices are safe',()=>{
  let rows=[audio()],priority=0;const calls=[];const c=new AudioPriority({platform:'win32',metrics:()=>rows,getPriority:()=>priority,setPriority:(pid,p)=>{calls.push([pid,p]);priority=p;}});
  try{c.setActive(true);priority=os.constants.priority.PRIORITY_HIGH;c.refresh();c.setActive(false);assert.equal(calls.length,1,'Do not undo a stronger user/system priority');priority=0;c.setActive(true);rows=[{pid:2,creationTime:200,type:'Tab',name:'Game'}];c.setActive(false);assert.equal(calls.length,2,'A recycled PID is never restored');rows=[audio(5,300)];priority=0;c.setActive(true);assert.equal(calls.at(-1)[0],5);}finally{c.dispose();}
  const denied=new AudioPriority({platform:'win32',metrics:()=>[audio()],getPriority:()=>0,setPriority:()=>{throw Error('Access denied');}});try{assert.equal(denied.setActive(true).status,'unavailable');}finally{denied.dispose();}
  const other=new AudioPriority({platform:'linux',metrics:()=>{throw Error('Should not query');}});assert.equal(other.setActive(true).status,'system');other.dispose();
});
