const assert=require('node:assert/strict');
const {Engine,CHAPTERS,FLOOR}=require('../../public/roguelite/core.js');
const make=(options={})=>{const e=new Engine();e.start({seed:'exploration-check',...options});return e;};
const tick=(e,n,input={})=>{for(let i=0;i<n;i++)e.update(1/60,input);};
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}
test('The final guardian arena exposes a reachable conductor without adding it to other chapters or Horde',()=>{
  for(const seed of ['conductor-a','conductor-b','conductor-c']){
    const e=make({seed});e.stage=24;e.loadStage();
    const conductor=e.breakables.find(object=>object.id==='dawn-conductor');
    assert(conductor,'The final arena must contain a real destructible conductor');
    const shelf=e.platforms.find(platform=>platform.id===conductor.platformId);
    assert(shelf&&shelf.oneWay&&!shelf.moving);assert.equal(conductor.y+conductor.h,e.surface(shelf,conductor.x+conductor.w/2));
    assert(conductor.x>=shelf.x&&conductor.x+conductor.w<=shelf.x+shelf.w);
  }
  for(const stage of [0,4,17,21,23]){const e=make();e.stage=stage;e.loadStage();assert(!e.breakables.some(object=>object.id==='dawn-conductor'));}
  const horde=make({mode:'horde'});horde.stage=24;horde.loadStage();assert.equal(horde.breakables.length,0);
});
test('Breaking the conductor cancels only ambient Eclipse columns and prevents new ones without granting loot',()=>{
  const e=make();e.stage=24;e.loadStage();e.enemies=[];e.spawnQueue=[{}];e.player.invuln=100;
  const conductor=e.breakables.find(object=>object.id==='dawn-conductor');
  const bossColumn={x:1200,y:FLOOR,t:99,max:99,age:0,damage:17,active:false};e.hazards.push(bossColumn);
  e.hazardTimer=0;tick(e,1);const ambient=e.hazards.find(hazard=>hazard!==bossColumn);assert(ambient,'The intact conductor must allow the real environmental warning');
  const before={hp:e.player.hp,rerolls:e.rerolls,score:e.score,kills:e.kills};
  assert(e.damageBreakable(conductor,conductor.maxHp));assert(conductor.broken);
  assert(!e.hazards.includes(ambient),'Breaking the conductor must cancel the announced environmental column');
  assert(e.hazards.includes(bossColumn),'The guardian retains its independently authored columns');
  e.hazardTimer=0;tick(e,360);assert.deepEqual(e.hazards,[bossColumn],'No new environmental column may be scheduled after destruction');
  assert.deepEqual({hp:e.player.hp,rerolls:e.rerolls,score:e.score,kills:e.kills},before);
  assert.equal(e.damageBreakable(conductor,999),false);const events=e.events.filter(event=>event.type==='breakable');assert.equal(events.length,1);assert.equal(events[0].effect,'storm');
});
test('All four weapons can break the conductor, while the final guardian keeps its solar attack',()=>{
  for(const weapon of ['blade','hammer','bow','staff']){
    const e=make();e.stage=24;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const conductor=e.breakables[0],p=e.player;
    Object.assign(p,{weapon,crit:0,invuln:100,x:conductor.x-p.w-24,y:conductor.y+conductor.h-p.h,platformId:conductor.platformId,ground:true,dir:1});
    for(let shot=0;shot<4;shot++){assert(e.attack());tick(e,65);}assert(conductor.broken,weapon+' must disable the conductor through its actual attack');
    assert.equal(e.events.filter(event=>event.type==='breakable').length,1);assert.equal(e.score,0);assert.equal(e.rerolls,3);
  }
  const e=make();e.stage=24;e.loadStage();e.player.invuln=100;const boss=e.enemies.find(enemy=>enemy.type==='boss');
  assert(e.damageBreakable(e.breakables[0],999));Object.assign(boss,{action:'windup',nextAction:'sunrise',actionTime:0});tick(e,1);
  assert(e.projectiles.filter(shot=>shot.enemy&&shot.kind==='fireball').length>=5,'Disabling the environment cannot cancel the guardian actual solar volley');
});
test('Conductor destruction rolls back with the combat milestone and old saves retain the intact arena',()=>{
  const e=make();e.stage=24;e.loadStage();const entry=e.createCheckpoint(),old={...entry};delete old.brokenObjects;
  assert(e.damageBreakable(e.breakables[0],999));assert.deepEqual(e.createCheckpoint(),entry,'No mid-fight save may retain only the tactical advantage');
  for(const checkpoint of [entry,old]){
    const resumed=new Engine();assert(resumed.restoreCheckpoint(checkpoint));assert.equal(resumed.breakables[0].broken,false);assert.equal(resumed.breakables[0].hp,70);
    resumed.enemies=[];resumed.spawnQueue=[{}];resumed.hazardTimer=0;tick(resumed,1);assert(resumed.hazards.some(hazard=>hazard.source==='storm'));
  }
  const resumed=new Engine();assert(resumed.restoreCheckpoint(entry));const before=resumed.createCheckpoint();
  for(const ids of [['thaw-urn'],['dawn-conductor','dawn-conductor'],['unknown']]){assert.equal(resumed.restoreCheckpoint({...entry,brokenObjects:ids}),false);assert.deepEqual(resumed.createCheckpoint(),before);}
});
test('The conductor perch is reachable with ordinary jumps in three seeds',()=>{
  for(const seed of ['conductor-a','conductor-b','conductor-c']){
    const e=make({seed});e.stage=24;e.loadStage();e.enemies=[];e.spawnQueue=[{}];e.player.invuln=100;const conductor=e.breakables[0],p=e.player;
    Object.assign(p,{x:conductor.x+conductor.w/2-p.w/2,y:e.groundY(conductor.x+conductor.w/2)-p.h,vy:0,ground:true});
    for(let frame=0;frame<150;frame++)e.update(1/60,{jump:frame===0||frame===18});
    assert.equal(p.platformId,conductor.platformId);assert(p.ground);
  }
});
test('The frozen mirror has a reachable fragile urn without changing the main path',()=>{
  for(const seed of ['urn-a','urn-b','urn-c']){
    const e=make({seed});e.stage=17;e.loadStage();
    assert.equal(e.breakables?.length,1,'The authored chapter has one actual destructible urn');
    const urn=e.breakables[0],shelf=e.platforms.find(p=>p.id===urn.platformId);
    assert(shelf&&shelf.oneWay&&!shelf.moving);assert.equal(urn.y+urn.h,e.surface(shelf,urn.x+urn.w/2));
    assert.equal(urn.broken,false);assert(urn.hp>0);assert.equal(e.createCheckpoint().brokenObjects.length,0);
  }
  const horde=make({mode:'horde'});horde.stage=17;horde.loadStage();assert.equal(horde.breakables.length,0);
});
test('All four real basic attacks can break the urn and grant its contents only once',()=>{
  for(const weapon of ['blade','hammer','bow','staff']){
    const e=make();e.stage=17;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const urn=e.breakables[0],p=e.player;
    p.weapon=weapon;p.crit=0;p.hp=50;p.x=urn.x-p.w-24;p.y=urn.y+urn.h-p.h;p.ground=true;p.platformId=urn.platformId;p.dir=1;
    const before={score:e.score,kills:e.kills,rerolls:e.rerolls};
    for(let shot=0;shot<4&&!urn.broken;shot++){assert(e.attack());tick(e,65);}
    assert(urn.broken,weapon+' must destroy the prop through the actual attack');
    assert.equal(p.hp,62);assert.equal(e.rerolls,before.rerolls+1);assert.equal(e.score,before.score+40);assert.equal(e.kills,before.kills);
    assert.equal(e.events.filter(event=>event.type==='breakable').length,1);
    for(let shot=0;shot<3;shot++){assert(e.attack());tick(e,65);}
    assert.equal(e.rerolls,before.rerolls+1);assert.equal(p.hp,62);assert.equal(e.score,before.score+40);
  }
});
test('Each weapon special damages the urn through its real pulse, quake or projectile',()=>{
  for(const weapon of ['blade','hammer','bow','staff']){
    const e=make();e.stage=17;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const urn=e.breakables[0],p=e.player;
    p.weapon=weapon;p.x=urn.x-p.w-24;p.y=urn.y+urn.h-p.h;p.ground=true;p.platformId=urn.platformId;p.dir=1;
    assert(e.skill());tick(e,145);assert(urn.broken,weapon+' special must affect fragile objects');
    assert.equal(e.events.filter(event=>event.type==='breakable').length,1);assert.equal(p.hp,p.maxHp);
  }
});
test('A consumed urn survives a cleared milestone and cannot grant contents again after resuming',()=>{
  const e=make();e.stage=17;e.loadStage();e.enemies=[];e.spawnQueue=[];tick(e,1);assert(e.cleared);
  const urn=e.breakables[0],p=e.player;p.hp=50;p.weapon='hammer';p.crit=0;p.x=urn.x-p.w-24;p.y=urn.y+urn.h-p.h;p.platformId=urn.platformId;p.ground=true;p.dir=1;
  assert(e.attack());tick(e,65);assert(urn.broken);const saved=e.createCheckpoint();assert.deepEqual(saved.brokenObjects,['thaw-urn']);
  const resumed=new Engine();assert(resumed.restoreCheckpoint(saved));assert(resumed.breakables[0].broken,'Cleared checkpoints must consume the restored urn');
  assert.equal(resumed.player.hp,p.hp);assert.equal(resumed.rerolls,e.rerolls);assert.equal(resumed.score,e.score);
  const other=resumed.breakables[0];Object.assign(resumed.player,{x:other.x-resumed.player.w-24,y:other.y+other.h-resumed.player.h,platformId:other.platformId,ground:true,dir:1});
  const before={hp:resumed.player.hp,rerolls:resumed.rerolls,score:resumed.score};assert(resumed.attack());tick(resumed,65);
  assert.deepEqual({hp:resumed.player.hp,rerolls:resumed.rerolls,score:resumed.score},before);
});
test('Urn saves accept old checkpoints and reject unknown, duplicate or cross-mode consumed IDs atomically',()=>{
  const e=make();e.stage=17;e.loadStage();const old=e.createCheckpoint();delete old.brokenObjects;
  const resumed=new Engine();assert(resumed.restoreCheckpoint(old));assert.equal(resumed.breakables[0].broken,false);
  const before=resumed.createCheckpoint();
  for(const ids of [['unknown'],['thaw-urn','thaw-urn'],'thaw-urn',null]){const bad={...old,brokenObjects:ids};assert.equal(resumed.restoreCheckpoint(bad),false);assert.deepEqual(resumed.createCheckpoint(),before);}
  const horde=make({mode:'horde'}).createCheckpoint();assert.equal(resumed.restoreCheckpoint({...horde,brokenObjects:[]}),false);assert.deepEqual(resumed.createCheckpoint(),before);
});
test('The urn shelf is reachable with ordinary double jumps in three seeds',()=>{
  for(const seed of ['urn-a','urn-b','urn-c']){
    const e=make({seed});e.stage=17;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const urn=e.breakables[0],p=e.player;
    p.x=urn.x+urn.w/2-p.w/2;p.y=e.groundY(p.x+p.w/2)-p.h;p.vy=0;p.ground=true;
    for(let i=0;i<150;i++)e.update(1/60,{jump:i===0||i===18});
    assert.equal(p.platformId,urn.platformId);assert.equal(p.ground,true);
  }
});
test('Entry milestones roll back urn contents together with combat, while enemy shots cannot open it',()=>{
  const e=make();e.stage=17;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const urn=e.breakables[0],entry=e.createCheckpoint(),p=e.player;
  e.projectiles.push({x:urn.x+urn.w/2,y:urn.y+urn.h/2,vx:0,vy:0,w:18,h:12,t:.2,enemy:true,damage:999,color:'#fff',kind:'enemyArrow'});tick(e,20);
  assert.equal(urn.hp,urn.maxHp);assert.equal(urn.broken,false);
  Object.assign(p,{weapon:'hammer',crit:0,hp:50,x:urn.x-p.w-24,y:urn.y+urn.h-p.h,platformId:urn.platformId,ground:true,dir:1});
  assert(e.attack());tick(e,65);assert(urn.broken);assert.deepEqual(e.createCheckpoint(),entry);
  const resumed=new Engine();assert(resumed.restoreCheckpoint(entry));assert.equal(resumed.breakables[0].broken,false);assert.equal(resumed.rerolls,entry.rerolls);assert.equal(resumed.score,entry.score);assert.equal(resumed.player.hp,entry.hp);
});
test('The suspended library has a reachable fragile eclipse cache without changing the main path',()=>{
  for(const seed of ['cache-a','cache-b','cache-c']){
    const e=make({seed});e.stage=7;e.loadStage();
    assert.equal(e.breakables?.length,1,'The authored chapter has one actual destructible eclipse cache');
    const cache=e.breakables[0],shelf=e.platforms.find(p=>p.id===cache.platformId);
    assert.equal(cache.id,'eclipse-cache');assert.equal(cache.name,'Relicário do eclipse');
    assert(shelf&&shelf.oneWay&&!shelf.moving);assert.equal(cache.y+cache.h,e.surface(shelf,cache.x+cache.w/2));
    assert.equal(cache.broken,false);assert.equal(cache.hp,45);assert.equal(cache.maxHp,45);
    assert.equal(e.createCheckpoint().brokenObjects?.length||0,0);
  }
  const horde=make({mode:'horde'});horde.stage=7;horde.loadStage();assert.equal(horde.breakables.length,0);
  for(const stage of [0,1,2,3,4,5,6]){const e=make();e.stage=stage;e.loadStage();assert(!e.breakables.some(object=>object.id==='eclipse-cache'));}
});
test('All four real basic attacks can break the eclipse cache and grant its contents only once',()=>{
  for(const weapon of ['blade','hammer','bow','staff']){
    const e=make();e.stage=7;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const cache=e.breakables[0],p=e.player;
    p.weapon=weapon;p.crit=0;p.hp=50;p.x=cache.x-p.w-24;p.y=cache.y+cache.h-p.h;p.ground=true;p.platformId=cache.platformId;p.dir=1;
    const before={score:e.score,kills:e.kills,rerolls:e.rerolls};
    for(let shot=0;shot<4&&!cache.broken;shot++){assert(e.attack());tick(e,65);}
    assert(cache.broken,weapon+' must destroy the prop through the actual attack');
    assert.equal(p.hp,60);assert.equal(e.rerolls,before.rerolls+1);assert.equal(e.score,before.score+50);assert.equal(e.kills,before.kills);
    assert.equal(e.events.filter(event=>event.type==='breakable').length,1);
    for(let shot=0;shot<3;shot++){assert(e.attack());tick(e,65);}
    assert.equal(e.rerolls,before.rerolls+1);assert.equal(p.hp,60);assert.equal(e.score,before.score+50);
  }
});
test('Each weapon special damages the eclipse cache through its real pulse, quake or projectile',()=>{
  for(const weapon of ['blade','hammer','bow','staff']){
    const e=make();e.stage=7;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const cache=e.breakables[0],p=e.player;
    p.weapon=weapon;p.x=cache.x-p.w-24;p.y=cache.y+cache.h-p.h;p.ground=true;p.platformId=cache.platformId;p.dir=1;
    assert(e.skill());tick(e,145);assert(cache.broken,weapon+' special must affect fragile objects');
    assert.equal(e.events.filter(event=>event.type==='breakable').length,1);assert.equal(p.hp,p.maxHp);
  }
});
test('A consumed eclipse cache survives a cleared milestone and cannot grant contents again after resuming',()=>{
  const e=make();e.stage=7;e.loadStage();e.enemies=[];e.spawnQueue=[];tick(e,1);assert(e.cleared);
  const cache=e.breakables[0],p=e.player;p.hp=50;p.weapon='hammer';p.crit=0;p.x=cache.x-p.w-24;p.y=cache.y+cache.h-p.h;p.platformId=cache.platformId;p.ground=true;p.dir=1;
  assert(e.attack());tick(e,65);assert(cache.broken);const saved=e.createCheckpoint();assert.deepEqual(saved.brokenObjects,['eclipse-cache']);
  const resumed=new Engine();assert(resumed.restoreCheckpoint(saved));assert(resumed.breakables[0].broken,'Cleared checkpoints must consume the restored cache');
  assert.equal(resumed.player.hp,p.hp);assert.equal(resumed.rerolls,e.rerolls);assert.equal(resumed.score,e.score);
  const other=resumed.breakables[0];Object.assign(resumed.player,{x:other.x-resumed.player.w-24,y:other.y+other.h-resumed.player.h,platformId:other.platformId,ground:true,dir:1});
  const before={hp:resumed.player.hp,rerolls:resumed.rerolls,score:resumed.score};assert(resumed.attack());tick(resumed,65);
  assert.deepEqual({hp:resumed.player.hp,rerolls:resumed.rerolls,score:resumed.score},before);
});
test('Eclipse cache saves accept old checkpoints and reject unknown, duplicate or cross-mode consumed IDs atomically',()=>{
  const e=make();e.stage=7;e.loadStage();const old=e.createCheckpoint();delete old.brokenObjects;
  const resumed=new Engine();assert(resumed.restoreCheckpoint(old));assert.equal(resumed.breakables[0].broken,false);
  const before=resumed.createCheckpoint();
  for(const ids of [['unknown'],['eclipse-cache','eclipse-cache'],'eclipse-cache',['thaw-urn'],null]){const bad={...old,brokenObjects:ids};assert.equal(resumed.restoreCheckpoint(bad),false);assert.deepEqual(resumed.createCheckpoint(),before);}
  const horde=make({mode:'horde'}).createCheckpoint();assert.equal(resumed.restoreCheckpoint({...horde,brokenObjects:[]}),false);assert.deepEqual(resumed.createCheckpoint(),before);
});
test('The eclipse cache shelf is reachable with ordinary double jumps in three seeds',()=>{
  for(const seed of ['cache-a','cache-b','cache-c']){
    const e=make({seed});e.stage=7;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const cache=e.breakables[0],p=e.player;
    p.x=cache.x+cache.w/2-p.w/2;p.y=e.groundY(p.x+p.w/2)-p.h;p.vy=0;p.ground=true;
    for(let i=0;i<150;i++)e.update(1/60,{jump:i===0||i===18});
    assert.equal(p.platformId,cache.platformId);assert.equal(p.ground,true);
  }
});
test('Entry milestones roll back eclipse cache contents together with combat, while enemy shots cannot open it',()=>{
  const e=make();e.stage=7;e.loadStage();e.enemies=[];e.spawnQueue=[{}];const cache=e.breakables[0],entry=e.createCheckpoint(),p=e.player;
  e.projectiles.push({x:cache.x+cache.w/2,y:cache.y+cache.h/2,vx:0,vy:0,w:18,h:12,t:.2,enemy:true,damage:999,color:'#fff',kind:'enemyArrow'});tick(e,20);
  assert.equal(cache.hp,cache.maxHp);assert.equal(cache.broken,false);
  Object.assign(p,{weapon:'hammer',crit:0,hp:50,x:cache.x-p.w-24,y:cache.y+cache.h-p.h,platformId:cache.platformId,ground:true,dir:1});
  assert(e.attack());tick(e,65);assert(cache.broken);assert.deepEqual(e.createCheckpoint(),entry);
  const resumed=new Engine();assert(resumed.restoreCheckpoint(entry));assert.equal(resumed.breakables[0].broken,false);assert.equal(resumed.rerolls,entry.rerolls);assert.equal(resumed.score,entry.score);assert.equal(resumed.player.hp,entry.hp);
});
test('Every long region has a connected main route, with substantial ascent and descent',()=>{
  for(const stage of CHAPTERS.map((c,i)=>c.boss?null:i).filter(i=>i!==null))for(const seed of ['route-a','route-b','route-c']){
    const e=make({seed});e.stage=stage;e.loadStage();assert(e.width>6000);assert(e.shrines.length<=1);e.enemies=[];e.spawnQueue=[{}];e.player.invuln=1000;
    let high=Infinity,low=-Infinity,falls=0,maxCamera=0;for(let i=0;i<3600&&e.player.x<e.checkpoint.x-60;i++){e.update(1/60,{right:true});maxCamera=Math.max(maxCamera,e.cameraY);high=Math.min(high,e.player.y);low=Math.max(low,e.player.y);falls+=e.events.filter(ev=>ev.type==='fall').length;e.events=[];}
    assert(e.player.x>=e.checkpoint.x-65,'Main exit must be reachable');assert(low-high>450);assert.equal(falls,0);assert(maxCamera>400);assert(e.cameraY<=e.height-640);
  }
});
test('Drop-through passes a thin platform and lands on the terrain beneath',()=>{
  const e=make({mode:'horde'});e.enemies=[];e.spawnQueue=[{}];const platform=e.platforms.find(p=>p.oneWay&&!p.moving&&p.y===630);const p=e.player;p.x=platform.x+100;p.y=platform.y-p.h;p.ground=true;p.platformId=platform.id;p.vy=0;
  tick(e,1,{down:true,jump:true});assert(p.y+p.h>platform.y);tick(e,80);assert(p.ground);assert.equal(p.y+p.h,770);
});
test('An elevator carries a grounded player in both directions',()=>{
  const e=make({mode:'horde'});e.enemies=[];e.spawnQueue=[{}];const platform=e.platforms.find(p=>p.moving),p=e.player;p.x=platform.x+50;p.y=platform.y-p.h;p.platformId=platform.id;p.ground=true;p.vy=0;
  let min=Infinity,max=-Infinity;for(let i=0;i<420;i++){e.update(1/60,{});assert(Math.abs(p.y+p.h-platform.y)<1);min=Math.min(min,platform.y);max=Math.max(max,platform.y);}
  assert(max-min>160);
});
test('A protected shrine grants a card once and keeps the explored map and remaining enemies',()=>{
  const e=make();e.stage=1;e.loadStage();const s=e.shrines[0];e.enemies=e.enemies.filter(enemy=>Math.abs(enemy.x-s.x)>600);const enemies=e.enemies.map(a=>a.id),map=e.platforms,p=e.player;p.x=s.x-15;p.y=s.y-p.h;p.hp=40;
  assert(e.useCheckpoint());assert.equal(e.upgradeSource,'shrine');assert.equal(p.hp,48);assert(e.chooseCard(0));assert.equal(e.stage,1);assert.equal(e.platforms,map);assert.deepEqual(e.enemies.map(a=>a.id),enemies);assert.equal(e.useCheckpoint(),false);
});
test('A guarded shrine cannot be activated until nearby enemies are gone',()=>{
  const e=make();e.stage=1;e.loadStage();const s=e.shrines[0],p=e.player;p.x=s.x-15;p.y=s.y-p.h;e.addEnemy('crawler',s.x,s.y-46);assert.equal(e.useCheckpoint(),false);
});
test('Melee damage waits for the impact pose, lands once, and hammer has a longer windup',()=>{
  for(const weapon of ['blade','hammer']){const e=make();e.enemies=[];e.spawnQueue=[{}];e.player.x=100;e.player.weapon=weapon;e.player.crit=0;const target=e.addEnemy('brute',170,FLOOR-68);target.cd=99;const hp=target.hp;assert(e.attack());assert.equal(target.hp,hp);tick(e,weapon==='hammer'?10:3);assert.equal(target.hp,hp);tick(e,weapon==='hammer'?12:8);assert(target.hp<hp);const hitHp=target.hp;tick(e,15);assert.equal(target.hp,hitHp,'One hit per swing');}
});
test('Blade attacks chain through three distinct combo poses',()=>{
  const e=make();e.enemies=[];e.spawnQueue=[{}];const combos=[];for(let i=0;i<4;i++){assert(e.attack());combos.push(e.player.swing.combo);tick(e,26);}assert.deepEqual(combos,[0,1,2,0]);
});
test('Elemental sword specials apply distinct status reactions and respect cooldown',()=>{
  for(const element of ['fire','frost','lightning','poison']){const e=make();e.enemies=[];e.spawnQueue=[{}];e.player.x=100;e.player[element]=1;e.setElement(element);const enemy=e.addEnemy('brute',220,FLOOR-68),hp=enemy.hp;assert(e.skill());assert.equal(enemy.hp,hp);assert.equal(e.skill(),false);tick(e,18);assert(enemy.hp<hp);assert(e.effects.some(f=>f.type==='spin'&&f.element===element));if(element==='frost')assert(enemy.slow>0);if(element==='fire')assert(enemy.burn>0);if(element==='poison')assert(enemy.venom>0);if(element==='lightning')assert(enemy.shockVisual>0);}
});
test('Scarce relics award score without healing, only once',()=>{
  const e=make();e.stage=1;e.loadStage();const r=e.relics[0];e.enemies=[];e.spawnQueue=[{}];e.player.hp=30;e.player.x=r.x-e.player.w/2;e.player.y=r.y-e.player.h/2;tick(e,1);assert(r.taken);assert.equal(e.relicCount,1);assert.equal(e.player.hp,30);const score=e.score;tick(e,5);assert.equal(e.score,score);
});
test('Horde portals telegraph spawns, queued enemies prevent early clear, and rules vary',()=>{
  const e=make({mode:'horde'});e.spawnTimer=0;e.enemies=[];tick(e,1);assert(e.portals.length>0);assert.equal(e.enemies.length,0);assert(!e.cleared);tick(e,60);assert(e.enemies.length>0);const names=new Set();for(let stage=0;stage<5;stage++){e.stage=stage;e.loadStage();names.add(e.waveRule.name);}assert.equal(names.size,5);assert(e.bossStage);assert(e.platforms.some(p=>p.moving));
});
test('Horde does not clear while a telegraphed spawn is pending',()=>{
  const e=make({mode:'horde'});e.enemies=[];e.spawnQueue=[];e.portals=[{type:'crawler',x:70,y:730,t:.8,elite:false}];tick(e,1);assert(!e.cleared);tick(e,60);assert(e.enemies.length>0);
});
test('The optional vigil bell opens an elevated route without replacing the explored world',()=>{
  const e=make();e.offerCards('start');e.chooseCard(0);e.stage=CHAPTERS.findIndex(chapter=>chapter.shrineName==='Sino da vigília');e.loadStage();
  const shrine=e.shrines[0],world=e.platforms,available=new Set(world.filter(platform=>!platform.disabled).map(platform=>platform.id));
  e.enemies=[];e.spawnQueue=[{}];e.player.x=shrine.x-e.player.w/2;e.player.y=shrine.y-e.player.h;
  assert(e.useCheckpoint());assert(e.chooseCard(0));
  const opened=e.platforms.filter(platform=>!platform.disabled&&!available.has(platform.id));
  assert(opened.length>=2,'Ringing the bell must open a usable elevated path');
  assert.equal(e.platforms,world,'The event must preserve the explored map');
  const bridge=opened[0],p=e.player;p.x=bridge.x+60;p.y=bridge.y-p.h-40;p.vx=0;p.vy=0;p.ground=false;
  tick(e,30);assert(p.ground);assert.equal(p.platformId,bridge.id,'The newly opened path must support the actual player');
});
test('The bell reward stays unavailable before activation and cannot be duplicated after resuming',()=>{
  const e=make();e.offerCards('start');e.chooseCard(0);e.stage=CHAPTERS.findIndex(chapter=>chapter.shrineRoute);e.loadStage();e.enemies=[];e.spawnQueue=[{}];
  const reward=e.relics.find(relic=>relic.disabled),p=e.player,shrine=e.shrines[0];assert(reward,'The bell has an optional route reward');
  p.x=reward.x-p.w/2;p.y=reward.y-p.h/2;p.vx=0;p.vy=0;tick(e,1);
  assert(!reward.taken&&e.relicCount===0,'An unopened route cannot grant its relic');
  p.x=shrine.x-p.w/2;p.y=shrine.y-p.h;assert(e.useCheckpoint());assert(e.chooseCard(0));
  p.x=reward.x-p.w/2;p.y=reward.y-p.h/2;p.vx=0;p.vy=0;tick(e,1);assert(reward.taken);assert.equal(e.relicCount,1);
  e.spawnQueue=[];tick(e,1);assert(e.cleared);const checkpoint=JSON.parse(JSON.stringify(e.createCheckpoint())),resumed=new Engine();
  assert(resumed.restoreCheckpoint(checkpoint));assert(resumed.platforms.filter(platform=>Object.hasOwn(platform,'disabled')).every(platform=>!platform.disabled));
  const impossible=JSON.parse(JSON.stringify(checkpoint));impossible.usedShrines=[];
  const healthy=JSON.parse(JSON.stringify(resumed.createCheckpoint()));
  assert.equal(resumed.restoreCheckpoint(impossible),false,'A checkpoint cannot claim the hidden relic without its bell activation');
  assert.deepEqual(resumed.createCheckpoint(),healthy,'An impossible route reward must be rejected atomically');
  const recovered=resumed.relics.find(relic=>Object.hasOwn(relic,'disabled'));assert(recovered.taken);const before={count:resumed.relicCount,score:resumed.score};
  resumed.player.x=recovered.x-resumed.player.w/2;resumed.player.y=recovered.y-resumed.player.h/2;tick(resumed,2);assert.deepEqual({count:resumed.relicCount,score:resumed.score},before);
});
test('The elevated bell route is reachable with normal movement and double jumps in three authored seeds',()=>{
  for(const seed of ['route-a','route-b','route-c']){
    const e=make({seed});e.offerCards('start');e.chooseCard(0);e.stage=CHAPTERS.findIndex(chapter=>chapter.shrineRoute);e.loadStage();e.enemies=[];e.spawnQueue=[{}];
    const shrine=e.shrines[0],p=e.player;p.x=shrine.x-p.w/2;p.y=shrine.y-p.h;assert(e.useCheckpoint());assert(e.chooseCard(0));
    const bridges=e.platforms.filter(platform=>Object.hasOwn(platform,'disabled')),visited=new Set();
    for(let frame=0;frame<220;frame++){
      const target=bridges[Math.min(visited.size,bridges.length-1)];
      e.update(1/60,{right:p.x+p.w/2<target.x+target.w*.55,jump:frame%22===0});
      if(p.ground&&bridges.some(platform=>platform.id===p.platformId))visited.add(p.platformId);
    }
    assert.deepEqual([...visited],bridges.map(platform=>platform.id));assert(e.relics.find(relic=>Object.hasOwn(relic,'disabled')).taken,'The route reward must be reachable by normal movement');
  }
});
test('A campaign carrying all earlier relics can resume after collecting both bell-chapter rewards',()=>{
  const e=make();e.offerCards('start');e.chooseCard(0);e.stage=21;e.loadStage();e.relicCount=8;e.score=1600;e.enemies=[];e.spawnQueue=[{}];
  const shrine=e.shrines[0],p=e.player;p.x=shrine.x-p.w/2;p.y=shrine.y-p.h;assert(e.useCheckpoint());assert(e.chooseCard(0));
  for(const relic of e.relics){p.x=relic.x-p.w/2;p.y=relic.y-p.h/2;p.vx=0;p.vy=0;p.ground=false;tick(e,1);assert(relic.taken);}
  e.spawnQueue=[];tick(e,1);assert(e.cleared);const saved=JSON.parse(JSON.stringify(e.createCheckpoint()));assert.equal(saved.relicCount,10);
  const restored=new Engine();assert(restored.restoreCheckpoint(saved),'The new optional reward must fit the legitimate campaign relic budget');assert.equal(restored.relicCount,10);assert.equal(restored.score,2000);
});
console.log(passed+' exploration/combat/horde checks passed.');
