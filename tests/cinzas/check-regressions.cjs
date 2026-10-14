const assert=require('node:assert/strict');
const {Engine,CARDS,CHAPTERS,TERRAIN}=require('../../frontend/roguelite/core.js');
const {Controller,DEFAULT,buttonLabel,profileFor}=require('../../frontend/roguelite/controller.js');
let passed=0;const test=(name,run)=>{run();passed++;console.log('PASS '+name);};
const make=(options={})=>{const e=new Engine();e.start({seed:'v4-regression',...options});return e;};
const tick=(e,n,input={})=>{for(let i=0;i<n;i++)e.update(1/60,input);};
function select(e,id){e.status='running';e.offerCards('shrine');e.cards=[CARDS.find(c=>c.id===id)];assert(e.chooseCard(0));}
test('Uphill spawn never falls below solid terrain or enters a teleport loop',()=>{
  for(let stage=0;stage<CHAPTERS.length;stage++){
    const e=make();e.stage=stage;e.loadStage();
    for(const slope of e.platforms.filter(p=>p.oneWay===false&&!p.ceiling&&p.y2<p.y))for(const type of ['crawler','brute','caster','stalker']){
      const mob=e.addEnemy(type,slope.x+Math.min(150,slope.w*.25));assert(Math.abs(mob.y+mob.h-e.groundY(mob.x+mob.w/2))<.001);
      for(let i=0;i<600;i++){mob.vx=110;e.moveBody(mob,1/60);assert(mob.y+mob.h<=e.groundY(mob.x+mob.w/2)+3,'body must never sink through solid terrain');}assert.equal(mob.outOfBoundsRecoveries,0);
    }
  }
});
test('Real AI traverses all chapters without ground enemies leaving the map or bats flying below it',()=>{
  for(let stage=0;stage<CHAPTERS.length;stage++){
    const e=make();e.stage=stage;e.loadStage();e.player.invuln=999;e.player.x=e.width*.5;e.player.y=e.groundY(e.player.x+17)-e.player.h;
    for(let i=0;i<1500;i++)e.update(1/60,{right:i<700,left:i>=700});
    for(const mob of e.enemies){assert(Number.isFinite(mob.y));assert.equal(mob.outOfBoundsRecoveries,0);if(mob.type==='bat')assert(mob.y+mob.h<=e.groundY(mob.x+mob.w/2)+1);}
  }
});
test('Weapon → element → focused modifier → general modifier, with reroll preserving the step and build',()=>{
  const e=make(),kinds=['weapon','element','modifier','modifier'];
  for(let step=0;step<4;step++){
    e.offerCards('shrine');assert.equal(e.cards.length,3);assert(e.cards.every(c=>c.category===kinds[step]));
    if(step===2)assert(e.cards.every(c=>['body','weapon','fire','frost','lightning','poison'].includes(c.family)));
    const owned=JSON.stringify(e.owned),count=e.upgradeCount,previous=e.cards.map(c=>c.id);e.rerolls=1;assert(e.rerollCards());assert.equal(e.rerolls,0);assert.equal(e.upgradeCount,count);assert.equal(JSON.stringify(e.owned),owned);assert.equal(e.cards.length,3);assert(e.cards.every(c=>c.category===kinds[step]));assert(e.cards.some(c=>!previous.includes(c.id)));assert(!e.rerollCards());assert(e.chooseCard(0));
  }
  assert.equal(e.upgradeCount,4);
});
test('Same upgrade twice really stacks stats and visible preview; levels survive a new area',()=>{
  const e=make();select(e,'power');select(e,'power');assert.equal(e.owned.power,2);assert(Math.abs(e.player.power-1.44)<.001);
  assert(e.cardPreview(CARDS.find(c=>c.id==='power')).includes('144% → 166%'));
  select(e,'vitality');select(e,'vitality');assert.equal(e.player.maxHp,140);assert.equal(e.owned.vitality,2);e.stage=6;e.loadStage();assert.equal(e.player.maxHp,140);assert.equal(e.owned.power,2);assert.equal(e.owned.vitality,2);
});
test('All twelve exploration chapters have different geometry and the campaign uses seven active terrain mechanics',()=>{
  const signatures=new Set(),terrains=new Set();for(let stage=0;stage<CHAPTERS.length;stage++){const e=make();e.stage=stage;e.loadStage();if(!e.bossStage){assert(e.width>=9500);signatures.add(JSON.stringify(e.platforms.filter(p=>p.oneWay===false).map(p=>[p.w,p.y,p.y2,p.effect])));assert(e.shrines.length<=1);}for(const p of e.platforms)terrains.add(p.effect);}
  assert.equal(signatures.size,12);for(const terrain of Object.keys(TERRAIN))assert(terrains.has(terrain));
});
test('Terrain changes player movement, ice traction, jump and fire damage; ward mitigates it',()=>{
  function arena(effect){const e=make({mode:'horde'});e.enemies=[];e.spawnQueue=[{}];e.platforms=e.platforms.filter(p=>p.oneWay===false);e.platforms[0].effect=effect;e.player.x=200;e.player.y=770-e.player.h;e.player.platformId=e.platforms[0].id;e.player.ground=true;return e;}
  const dry=arena('normal'),mud=arena('mud'),water=arena('water');tick(dry,90,{right:true});tick(mud,90,{right:true});tick(water,90,{right:true});assert(dry.player.x>water.player.x&&water.player.x>mud.player.x);
  const ice=arena('ice');tick(ice,90,{right:true});const icy=ice.player.vx;tick(ice,10);assert(ice.player.vx>icy-40);
  const root=arena('spring');root.update(1/60,{jump:true});const normal=arena('normal');normal.update(1/60,{jump:true});assert(root.player.vy<normal.player.vy-100);
  const lava=arena('lava');lava.player.invuln=0;tick(lava,1);assert(lava.player.hp<100);assert(lava.player.burn>0);const protectedRun=arena('lava');protectedRun.player.terrainWard=1;protectedRun.player.invuln=0;tick(protectedRun,60);assert.equal(protectedRun.player.hp,100);
});
test('Physical blood, fire burns and electrical reaction are distinct and apply to both sides',()=>{
  const e=make();e.enemies=[];const target=e.addEnemy('brute',300);target.hp=1000;target.maxHp=1000;
  e.damageEnemy(target,10,false,false,'physical');assert(e.particles.some(p=>p.kind==='blood'));assert(target.hitReact>0);assert(e.effects.some(f=>f.type==='bloodcut'));
  e.damageEnemy(target,10,false,false,'fire');assert(target.burn>0);assert(target.charred>0);assert(e.particles.some(p=>p.kind==='ember'));
  e.damageEnemy(target,10,false,false,'lightning');assert(target.shock>0);assert(target.shockVisual>0);assert(e.effects.some(f=>f.type==='electrocute'));
  const hp=target.hp;tick(e,30);assert(target.hp<hp);assert.equal(target.shock,0);
  e.player.invuln=0;e.hurtPlayer(10,300,'physical');assert(e.player.bleed>0);e.player.invuln=0;e.hurtPlayer(10,300,'fire');assert(e.player.burn>0);e.player.invuln=0;e.hurtPlayer(10,300,'lightning');assert(e.player.shockVisual>0);tick(e,90);assert.equal(e.player.shockVisual,0);
});
test('Echo is a delayed additional hit and does not recursively trigger; ground rupture produces a traveling wave',()=>{
  const e=make();e.enemies=[];e.spawnQueue=[{}];select(e,'echo');const mob=e.addEnemy('brute',190);mob.hp=500;mob.maxHp=500;mob.cd=99;e.player.x=100;e.player.crit=0;e.damageEnemy(mob,100,false,false,'physical');assert.equal(mob.hp,400);tick(e,12);assert.equal(mob.hp,372);tick(e,60);assert.equal(mob.hp,372);assert.equal(e.echoQueue.length,0);
  select(e,'shockwave');e.player.attackCd=0;e.attack();tick(e,12);assert(e.projectiles.some(p=>p.kind==='wave'&&!p.enemy));
});
test('Every mob now telegraphs a different attack and uses recovery; casters have spread volleys',()=>{
  for(const type of ['crawler','stalker','brute','caster','bat']){
    const e=make({mode:'horde'});e.enemies=[];e.spawnQueue=[{}];e.player.invuln=999;e.player.x=950;const mob=e.addEnemy(type,type==='caster'?600:1050);mob.cd=0;const actions=new Set();let shots=0;
    for(let n=0;n<360;n++){e.update(1/60,{});actions.add(mob.action);shots=Math.max(shots,e.projectiles.filter(p=>p.enemy).length);}
    assert(actions.has('windup'),type+' windup');assert(actions.has('attack'),type+' attack');assert(actions.has('recover'),type+' recovery');if(type==='caster')assert(shots>=3);
  }
});
test('Mapping names are useful before connection, duplicate mappings swap, and reroll is edge-triggered',()=>{
  assert.equal(profileFor('DualSense Wireless Controller'),'playstation');assert.equal(buttonLabel(2,'xbox'),'X');assert.equal(buttonLabel(2,'playstation'),'□');const c=new Controller();assert(c.setBinding('attack',0));assert.equal(c.mapping.jump,2);assert.equal(c.mapping.attack,0);assert.equal(c.mapping.reroll,7);
  const pad={id:'test',index:0,connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};c.poll([pad]);pad.buttons[7].pressed=true;assert(c.poll([pad]).pressed.reroll);assert(!c.poll([pad]).pressed.reroll);
});
console.log(passed+' v0.4 regression groups passed.');
