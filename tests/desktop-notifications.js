'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createNotifications,notificationPayload}=require('../electron/notifications.cjs');
test('Windows notices respect focus, duplicates and rate limits; clicks have a bounded application target',()=>{
  const created=[],clicks=[];let focused=true,clock=0;
  class Fake extends EventEmitter{static isSupported(){return true;}constructor(value){super();this.value=value;created.push(this);}show(){this.shown=true;}close(){this.emit('close');}}
  const notices=createNotifications({Notification:Fake,window:{isFocused:()=>focused,isVisible:()=>true},activate:target=>clicks.push(target),now:()=>clock});
  const target={type:'direct',id:'10000000-0000-4000-8000-000000000001',accountId:'10000000-0000-4000-8000-000000000002'},value={key:'test',title:'Amigo',body:'Mensagem',target};
  assert.equal(notices.notify(value).reason,'focused');focused=false;assert.equal(notices.notify(value).shown,true);assert.equal(notices.notify(value).reason,'limited');created[0].emit('click');assert.deepEqual(clicks[0],target);
  for(let i=0;i<5;i++)assert.equal(notices.notify({...value,key:'message'+i}).shown,true);assert.equal(notices.notify({...value,key:'last'}).reason,'limited');clock=61000;assert.equal(notices.notify({...value,key:'last'}).shown,true);
  assert.throws(()=>notificationPayload({...value,target:{...target,id:'https://foreign.test'}}));assert.throws(()=>notificationPayload({...value,target:{...target,type:'execute'}}));notices.dispose();
});
test('a user-requested Windows preview works in focus while normal messages remain suppressed',()=>{
  const created=[];
  class Fake extends EventEmitter{static isSupported(){return true;}constructor(value){super();created.push(value);}show(){}close(){}}
  const notices=createNotifications({Notification:Fake,window:{isFocused:()=>true,isVisible:()=>true},activate(){}});
  const target={type:'friends',id:'10000000-0000-4000-8000-000000000001',accountId:'10000000-0000-4000-8000-000000000001'},value={key:'preview',title:'Teste',body:'Mensagem',target};
  assert.equal(notices.notify({...value,preview:'true'}).reason,'focused');
  assert.equal(notices.notify({...value,preview:true}).shown,true);
  assert.equal(created.length,1);assert.equal(notices.notify({...value,key:'ordinary'}).reason,'focused');notices.dispose();
});
