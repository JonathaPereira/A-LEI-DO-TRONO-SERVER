'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCommunity}=require('../server/community');
function setup(){const make=id=>({readyState:1,clientId:id,account:{id,nickname:id,expiresAt:Date.now()+60000}}),a=make('one'),b=make('two'),guest={readyState:1,clientId:'guest',guest:{id:'guest',nickname:'Guest',guest:true,expiresAt:Date.now()+60000}},clients=new Set([a,b,guest]),events=[];
  const community=createCommunity({wss:{clients},rooms:new Map(),send:(socket,data)=>events.push({socket,data}),auth:{configured:false},env:{}});return {community,a,b,guest,events,clients};
}
test('reported game activity belongs to the authenticated connection and clears on hide or disconnect',()=>{const f=setup();try{
  assert.equal(f.community.updateActivity(f.a,{name:'Counter-Strike 2',userId:'two',path:'private',pid:8123}).ok,true);
  let members=f.community.snapshot(f.b).members;assert.equal(members.find(row=>row.id==='one').activity.name,'Counter-Strike 2');assert.equal(members.find(row=>row.id==='two').activity,null);assert(!JSON.stringify(members).includes('private'));assert(!JSON.stringify(members).includes('8123'));
  const since=members.find(row=>row.id==='one').activity.startedAt;f.community.updateActivity(f.a,{name:'Counter-Strike 2'});assert.equal(f.community.snapshot(f.b).members.find(row=>row.id==='one').activity.startedAt,since);
  f.community.updateActivity(f.a,null);assert.equal(f.community.snapshot(f.b).members.find(row=>row.id==='one').activity,null);
  f.community.updateActivity(f.a,{name:'Another game'});f.clients.delete(f.a);const offline=f.community.snapshot(f.b).members.find(row=>row.id==='one');assert.equal(offline.online,false);assert.equal(offline.activity,null);
}finally{f.community.stop();}});
test('anonymous, guest, expired and invalid reports cannot publish activity',()=>{const f=setup();try{
  assert.equal(f.community.updateActivity({}, {name:'game'}).code,'AUTH_REQUIRED');assert.equal(f.community.updateActivity(f.guest,{name:'game'}).code,'AUTH_REQUIRED');
  for(const value of [{name:'a'.repeat(81)},{name:'private\ncaption'},{name:42},'game',undefined])assert.equal(f.community.updateActivity(f.a,value).code,'INVALID_ACTIVITY');
  f.a.account.expiresAt=0;assert.equal(f.community.updateActivity(f.a,{name:'game'}).code,'AUTH_REQUIRED');
}finally{f.community.stop();}});
test('stale activity expires independently from online presence and guest views omit account activity',t=>{const f=setup();const now=Date.now();try{
  f.community.updateActivity(f.a,{name:'A Lei do Trono'});f.a.activity.seenAt=now-46000;assert.equal(f.community.snapshot(f.b).members.find(row=>row.id==='one').activity,null);assert.equal(f.community.snapshot(f.b).members.find(row=>row.id==='one').online,true);
  f.community.updateActivity(f.a,{name:'Game'});assert(!f.community.snapshot(f.guest).members.some(row=>row.activity));
}finally{f.community.stop();}});
