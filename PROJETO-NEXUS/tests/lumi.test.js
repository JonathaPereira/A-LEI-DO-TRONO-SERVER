import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HEROES,HERO_BY_ID,ARCHIVED_HEROES,CLASSES} from '../src/data.js';
import {createBattle,act,preview,advantage} from '../src/engine.js';
function setup(id){
 const team=[id,'veyra','axion'],s=createBattle(team,['rhazen','nima','noct'],{seed:463});
 for(const u of s.units)u.statuses=[];
 const a=s.units[0];a.energy=100;s.order=[a.id,...s.units.slice(1).map(u=>u.id)];s.cursor=0;
 return {s,a,ally:s.units[1],foe:s.units[3]};
}
test('four original Lumi heroes return with stable identities, portraits and complete distinct kits',()=>{
 assert.equal(HEROES.length,24);assert.equal(CLASSES.length,6);assert.deepEqual(ARCHIVED_HEROES,[]);
 const heroes=['auren','elyra','solen','zaya'].map(id=>HERO_BY_ID[id]);
 assert.deepEqual(heroes.map(h=>h?.index),[20,21,22,23]);assert.deepEqual(heroes.map(h=>h.role),['Tanque','Suporte','Dano','Suporte']);
 assert.equal(new Set(heroes.map(h=>h.specialty)).size,4);
 for(const h of heroes){assert.equal(h.classId,'lumi');assert(h.identity&&h.synergy);for(const k of ['basic','skill','ultimate'])assert(h[k].name&&h[k].description);}
});
test('the sixth affinity closes the cycle through Sombrio, Lumi and Igneo',()=>{
 assert.equal(advantage('sombrio','lumi'),1.25);assert.equal(advantage('lumi','igneo'),1.25);
 assert.equal(advantage('lumi','sombrio'),.85);assert.equal(advantage('igneo','lumi'),.85);assert.equal(advantage('sombrio','igneo'),1);
});
test('Auren purifies and shields one ally with an elemental ward, without granting healing',()=>{
 const {s,a,ally}=setup('auren');ally.hp=100;ally.statuses=[{type:'bleed',turns:2},{type:'regen',turns:2}];
 const result=act(s,'skill',ally.id,false),impact=result.impactUnits.find(u=>u.id===ally.id);
 assert.equal(impact.hp,100);assert.equal(impact.shield,Math.round(ally.maxHp*.18));
 assert(!impact.statuses.some(x=>x.type==='bleed'));assert(impact.statuses.some(x=>x.type==='regen'));assert(impact.statuses.some(x=>x.type==='elementalWard'));
 assert(!result.events.some(x=>x.type==='heal'));assert.equal(a.energy,70);
});
test('Elyra heals before purifying bleeding and then grants a separate small barrier',()=>{
 const {s,ally}=setup('elyra');ally.hp=100;ally.statuses=[{type:'bleed',turns:2},{type:'darkmark',turns:2,owner:'1-noct'}];
 const result=act(s,'skill',ally.id,false),h=result.events.find(e=>e.type==='heal'),barrier=result.events.find(e=>e.type==='shield');
 assert.equal(h.amount,Math.round(ally.maxHp*.20*.65));assert.deepEqual(h.cleansed,['bleed','darkmark']);assert.equal(barrier.amount,Math.round(ally.maxHp*.04));
});
test('Solen consumes an existing weakened opening only with his ultimate',()=>{
 for(const weak of [false,true]){
 const {s,foe}=setup('solen');if(weak)foe.statuses=[{type:'weaken',turns:2}];
 const result=act(s,'ultimate',foe.id,false);const hit=result.events.find(e=>e.type==='damage'&&e.target===foe.id&&!e.reaction&&!e.intercepted);
 assert.equal(hit.combo,weak?'weaken':undefined);assert(!result.impactUnits.find(u=>u.id===foe.id).statuses.some(x=>x.type==='weaken'));
 }
});
test('Zaya restores modest team health and energy without reviving fallen allies',()=>{
 const {s,a,ally}=setup('zaya');for(const u of s.units.filter(u=>u.side===0)){u.hp=100;u.energy=20;}a.energy=100;ally.hp=0;
 const result=act(s,'ultimate',a.id,false),team=result.impactUnits.filter(u=>u.side===0);
 assert.equal(team[1].hp,0);assert.equal(team[1].energy,20);assert.equal(team[0].energy,30);assert.equal(team[2].energy,30);
 assert.equal(result.events.filter(e=>e.type==='heal').length,2);assert.equal(result.events.filter(e=>e.type==='energy').length,2);
});
test('every restored action keeps deterministic public previews equal to actual receipts',()=>{
 for(const id of ['auren','elyra','solen','zaya'])for(const action of ['basic','skill','ultimate']){
 const {s,a,foe}=setup(id);for(const u of s.units){u.hp=Math.round(u.maxHp*.45);u.statuses=[{type:'weaken',turns:2},{type:'bleed',turns:2}];}
 const h=HERO_BY_ID[id],target=/^(heal|shield|support)/.test(h[action].kind)?a:foe,before=structuredClone(s),p=preview(s,action,target.id);
 assert.deepEqual(s,before);assert.deepEqual(act(structuredClone(s),action,target.id,false),p.normal);assert.deepEqual(act(structuredClone(s),action,target.id,true),p.critical);
 }
});
