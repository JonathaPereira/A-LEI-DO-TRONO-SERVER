const assert = require('node:assert/strict');
const {Engine, CARDS, CHAPTERS, FLOOR} = require('../../public/roguelite/core.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function create(options={}){const e=new Engine();e.start({seed:'qa-fixed',...options});return e;}
function tick(e,frames=1,input={}){for(let i=0;i<frames;i++)e.update(1/60,input);}
function clearArea(e){e.spawnQueue=[];e.portals=[];for(const enemy of [...e.enemies])e.damageEnemy(enemy,1e6,false,false);tick(e);assert.equal(e.cleared,true);}
function checkpoint(e){e.player.x=e.checkpoint.x-14;e.player.y=e.checkpoint.y-e.player.h;return e.useCheckpoint();}
function terminalArena(options={}){
  const e=create(options);e.enemies=[];e.spawnQueue=[];e.portals=[];const p=e.player;
  p.weapon='bow';p.x=400;p.y=e.groundY(417)-p.h;p.hp=1;p.invuln=0;p.vampire=1;return e;
}
test('Maps and first checkpoint drafts reproduce from the same seed',()=>{const a=create(),b=create();assert.deepEqual(a.platforms,b.platforms);assert.deepEqual(a.enemies,b.enemies);clearArea(a);clearArea(b);checkpoint(a);checkpoint(b);assert.deepEqual(a.cards.map(c=>c.id),b.cards.map(c=>c.id));assert.equal(new Set(a.cards.map(c=>c.id)).size,3);assert(a.cards.every(c=>c.category==='weapon'));});
test('Combat RNG does not change later maps or checkpoint drafts for equal builds',()=>{const a=create(),b=create();for(let i=0;i<80;i++){b.player.attackCd=0;b.attack();}clearArea(a);clearArea(b);checkpoint(a);checkpoint(b);assert.deepEqual(a.cards.map(c=>c.id),b.cards.map(c=>c.id));a.chooseCard(0);b.chooseCard(0);assert.deepEqual(a.platforms,b.platforms);});
test('Double jump works, third jump is blocked, landing restores it',()=>{const e=create();e.enemies=[];e.spawnQueue=[{}];tick(e,1,{jump:true});const first=e.player.vy;assert(first<0);tick(e,10);tick(e,1,{jump:true});assert(e.player.vy<first+1);const before=e.player.vy;tick(e,1,{jump:true});assert(e.player.vy>before);tick(e,150);assert.equal(e.player.y,FLOOR-e.player.h);assert.equal(e.player.jumps,0);});
test('Dash grants invulnerability and respects cooldown',()=>{const e=create();e.player.invuln=0;tick(e,1,{dash:true});assert(e.player.dashTime>0);const hp=e.player.hp;assert.equal(e.hurtPlayer(50),false);assert.equal(e.player.hp,hp);const cd=e.player.dashCd;tick(e,1,{dash:true});assert(e.player.dashCd<cd);tick(e,100);assert.equal(e.player.dashCd,0);});
test('Checkpoint waits for clear, requires proximity, heals and advances once',()=>{const e=create();assert.equal(checkpoint(e),false);e.player.hp=25;clearArea(e);e.player.x=90;assert.equal(e.useCheckpoint(),false);assert.equal(checkpoint(e),true);assert.equal(e.player.hp,35);const first=e.cards[0],oldWeapon=e.player.weapon;assert.equal(e.chooseCard(0),true);assert.equal(e.stage,1);assert.equal(e.owned[first.id],1);assert.equal(e.chooseCard(0),false);assert.equal(e.player.weapon,first.id);});
test('Weapon replacement preserves stacked elements',()=>{const e=create();const p=e.player;CARDS.find(c=>c.id==='fire').apply(p);CARDS.find(c=>c.id==='frost').apply(p);CARDS.find(c=>c.id==='bow').apply(p);assert.equal(p.weapon,'bow');assert.equal(p.fire,1);assert.equal(p.frost,1);});
test('Fire and poison tick down enemy health, frost slows, lightning chains',()=>{const e=create();e.enemies=[];e.spawnQueue=[{}];e.player.fire=1;e.player.poison=1;e.player.frost=1;e.player.lightning=1;const one=e.addEnemy('crawler',500,FLOOR-34),two=e.addEnemy('crawler',570,FLOOR-34);const before=two.hp;e.damageEnemy(one,5);assert(two.hp<before);assert.equal(one.burn,3);assert.equal(one.venom,5);assert.equal(one.slow,2);const hp=one.hp;tick(e,30);assert(one.hp<hp-4);});
test('Death explosion damages nearby enemies and cannot duplicate kills',()=>{const e=create();e.enemies=[];e.player.inferno=true;e.player.fire=1;const one=e.addEnemy('crawler',500,FLOOR-34),two=e.addEnemy('crawler',550,FLOOR-34);one.burn=3;const before=two.hp;e.damageEnemy(one,500,false,false);assert(two.hp<before);const kills=e.kills;e.killEnemy(one);assert.equal(e.kills,kills);});
test('Ranged projectile hits once per target; skill cannot spam during recharge',()=>{const e=create();e.enemies=[];e.spawnQueue=[{}];const p=e.player;p.weapon='bow';p.x=100;p.y=FLOOR-p.h;p.crit=0;const target=e.addEnemy('crawler',250,FLOOR-34);target.cd=99;e.attack();tick(e,30);assert(target.hp<target.maxHp);assert.equal(e.projectiles.filter(s=>!s.enemy).length,0);p.skillCd=0;e.skill();const cooldown=p.skillCd;assert.equal(e.skill(),false);assert.equal(p.skillCd,cooldown);});
test('Armor, difficulty and lifesteal affect health; death terminates the run once',()=>{const e=create({difficulty:'hard'});e.player.invuln=0;e.player.armor=.24;e.hurtPlayer(10);assert(Math.abs(e.player.hp-(100-10*1.45*.76))<.01);e.player.vampire=2;const hp=e.player.hp;const victim=e.enemies[0];e.killEnemy(victim);assert.equal(e.player.hp,hp+2);e.player.invuln=0;e.hurtPlayer(1e6);assert.equal(e.status,'ended');e.end(false);assert.equal(e.events.filter(event=>event.type==='end').length,1);});
test('A lethal contact ends the frame before another projectile can grant a kill or lifesteal',()=>{
  const e=terminalArena(),p=e.player;
  const attacker=e.addEnemy('crawler',400);attacker.cd=999;
  const victim=e.addEnemy('crawler',600);victim.hp=1;victim.cd=999;
  e.projectiles.push({x:victim.x+victim.w/2,y:victim.y+victim.h/2,vx:0,vy:0,w:18,h:12,t:1,enemy:false,damage:100,critical:false,pierce:0,hit:[],kind:'bow',damageKind:'physical',color:'#d1b7de',trail:[]});
  e.events=[];e.update(1/60,{});
  assert.equal(e.status,'ended');assert.equal(e.won,false);
  assert.equal(p.hp,0,'lifesteal cannot heal a run after its defeat was emitted');
  assert.equal(e.kills,0);assert.equal(e.score,0);assert.equal(victim.dead,false);
  assert.equal(e.events.filter(event=>event.type==='end').length,1);
  assert(!e.events.slice(e.events.findIndex(event=>event.type==='end')+1).some(event=>['kill','bosskill','clear'].includes(event.type)));
  const terminal={hp:p.hp,kills:e.kills,score:e.score,time:e.time};tick(e,60,{attack:true,skill:true});
  assert.deepEqual({hp:p.hp,kills:e.kills,score:e.score,time:e.time},terminal);
});
test('A lethal enemy projectile stops later projectiles from rewarding a defeated player',()=>{
  const e=terminalArena(),p=e.player;
  const victim=e.addEnemy('crawler',600);victim.hp=1;victim.cd=999;
  const shot={vx:0,vy:0,w:18,h:12,t:1,damage:100,critical:false,pierce:0,hit:[],kind:'bow',damageKind:'physical',color:'#d1b7de',trail:[]};
  e.projectiles=[{...shot,x:p.x+p.w/2,y:p.y+p.h/2,enemy:true},{...shot,x:victim.x+victim.w/2,y:victim.y+victim.h/2,enemy:false}];
  e.update(1/60,{});
  assert.equal(e.status,'ended');assert.equal(p.hp,0,'a later friendly shot cannot heal after the lethal enemy shot');
  assert.equal(e.kills,0);assert.equal(e.score,0);assert.equal(victim.dead,false);
});
test('A lethal hostile field prevents a later friendly field from granting post-defeat lifesteal',()=>{
  const e=terminalArena(),p=e.player;
  const victim=e.addEnemy('crawler',600);victim.hp=1;victim.cd=999;
  e.fields=[{x:p.x+p.w/2,y:p.y+p.h-10,radius:60,t:1,damage:100,enemy:true,element:'fire'},
    {x:victim.x+victim.w/2,y:victim.y+victim.h/2,radius:60,t:1,damage:1000,enemy:false,element:'poison'}];
  e.update(1/60,{});
  assert.equal(e.status,'ended');assert.equal(p.hp,0,'a friendly field cannot reward the defeat already resolved by another field');
  assert.equal(e.kills,0);assert.equal(e.score,0);assert.equal(victim.dead,false);
});
test('Lethal lava stops burning-enemy rewards before the rest of the frame',()=>{
  const e=create();e.enemies=[];e.spawnQueue=[{}];const p=e.player;
  p.x=400;const ground=e.platforms.find(platform=>platform.oneWay===false&&!platform.ceiling&&p.x+p.w/2>=platform.x&&p.x+p.w/2<=platform.x+platform.w);
  ground.effect='lava';p.y=e.surface(ground,p.x+p.w/2)-p.h;p.platformId=ground.id;p.ground=true;p.hp=1;p.invuln=0;p.vampire=1;
  const victim=e.addEnemy('crawler',600);victim.hp=.01;victim.burn=1;victim.cd=999;
  e.update(1/60,{});
  assert.equal(e.status,'ended');assert.equal(p.hp,0,'burning damage cannot grant rewards after terrain has killed the player');
  assert.equal(e.kills,0);assert.equal(e.score,0);assert.equal(victim.dead,false);
});
test('A fatal fall cancels a prepared melee hit before it resolves at the respawn point',()=>{
  const e=create();e.enemies=[];e.spawnQueue=[{}];const p=e.player;
  p.weapon='blade';p.x=400;p.hp=1;p.invuln=0;p.vampire=1;p.dir=1;
  const victim=e.addEnemy('crawler',200);victim.hp=1;victim.cd=999;
  assert(e.attack());p.swing.t=p.swing.windup-.005;p.y=e.height+150;p.vy=200;p.ground=false;
  e.update(1/60,{});
  assert.equal(e.status,'ended');assert.equal(p.hp,0,'the prepared swing cannot heal a defeated player at the fallback location');
  assert.equal(e.kills,0);assert.equal(e.score,0);assert.equal(victim.dead,false);
  assert.equal(e.events.filter(event=>event.type==='end').length,1);
});
test('Surviving contact still resolves later hits and normal lifesteal in both modes',()=>{
  for(const mode of ['adventure','horde']){
    const e=terminalArena({mode}),p=e.player;p.hp=100;
    const attacker=e.addEnemy('crawler',400);attacker.cd=999;
    const victim=e.addEnemy('crawler',600);victim.hp=1;victim.cd=999;
    e.projectiles=[{x:victim.x+victim.w/2,y:victim.y+victim.h/2,vx:0,vy:0,w:18,h:12,t:1,enemy:false,damage:100,critical:false,pierce:0,hit:[],kind:'bow',damageKind:'physical',color:'#d1b7de',trail:[]}];
    e.update(1/60,{});
    assert.equal(e.status,'running');assert.equal(p.hp,91);assert.equal(e.kills,1);assert.equal(e.score,40);assert.equal(victim.dead,true);
  }
});
test('Hits resolved before lethal damage retain their earned points without reviving the player',()=>{
  const e=terminalArena(),p=e.player,victim=e.addEnemy('crawler',600);victim.hp=1;victim.cd=999;
  const shot={vx:0,vy:0,w:18,h:12,t:1,damage:100,critical:false,pierce:0,hit:[],kind:'bow',damageKind:'physical',color:'#d1b7de',trail:[]};
  e.projectiles=[{...shot,x:victim.x+victim.w/2,y:victim.y+victim.h/2,enemy:false},
    {...shot,x:p.x+p.w/2,y:p.y+p.h/2,enemy:true}];
  e.events=[];e.update(1/60,{});
  assert.equal(e.status,'ended');assert.equal(p.hp,0);assert.equal(e.kills,1);assert.equal(e.score,40);
  assert(e.events.findIndex(event=>event.type==='kill')<e.events.findIndex(event=>event.type==='end'));
});
test('All twenty-five adventure chapters progress to victory with five distinct bosses',()=>{const e=create();const bosses=[];for(let stage=0;stage<CHAPTERS.length;stage++){assert.equal(e.stage,stage);if(e.bossStage)bosses.push(e.biome);clearArea(e);assert(checkpoint(e));if(stage<CHAPTERS.length-1){assert.equal(e.status,'upgrade');assert(e.cards.length>0);assert(e.chooseCard(0));}}assert.deepEqual(bosses,[0,1,2,3,4]);assert.equal(e.status,'ended');assert.equal(e.won,true);assert.equal(e.bosses,5);});
test('The sentries guard the glacier portal while regular encounters remain optional',()=>{
  const e=create();
  e.stage=15;e.loadStage();
  const guardians=e.enemies.filter(enemy=>enemy.gateGuard);
  assert.equal(guardians.length,3);
  assert(e.objectiveText().includes('3'));
  for(const guard of guardians.slice(0,-1))e.damageEnemy(guard,1e6,false,false);
  tick(e);assert.equal(e.cleared,false);
  e.damageEnemy(guardians.at(-1),1e6,false,false);
  tick(e);assert(e.cleared&&e.enemies.length>0);
  const reopened=create();
  assert(reopened.restoreCheckpoint(e.createCheckpoint()));
  assert(reopened.cleared&&reopened.enemies.length===e.enemies.length&&checkpoint(reopened));
});
test('The bastion signal awards one reroll when its guarded shrine is activated',()=>{
  const e=create();e.stage=21;e.loadStage();
  const shrine=e.shrines[0];
  e.player.x=shrine.x-17;e.player.y=shrine.y-e.player.h;
  const before=e.rerolls;
  assert.equal(e.useCheckpoint(),false);
  e.enemies=e.enemies.filter(enemy=>Math.abs(enemy.x-shrine.x)>560);
  assert(e.useCheckpoint());
  assert.equal(e.rerolls,before+1);
  e.chooseCard(0);
  assert.equal(e.useCheckpoint(),false);
  assert.equal(e.rerolls,before+1);
});
test('The eight late exploration chapters present distinct combat lineups',()=>{const decks=new Set();for(let stage=15;stage<CHAPTERS.length;stage++){if(CHAPTERS[stage].boss)continue;const e=create();e.stage=stage;e.loadStage();decks.add(e.enemies.map(enemy=>enemy.type).join(','));}assert.equal(decks.size,8);});
test('Horde waits for queued spawns, counts completed waves, and continues beyond boss',()=>{const e=create({mode:'horde'});tick(e,1);assert(e.spawnQueue.length>0);assert(!e.cleared);for(let wave=0;wave<7;wave++){assert.equal(e.bossStage,(wave+1)%5===0);clearArea(e);assert.equal(e.completedWaves,wave+1);assert(checkpoint(e));if(e.status==='upgrade')assert(e.chooseCard(0));}assert.equal(e.stage,7);assert.equal(e.status,'running');assert.equal(e.bosses,1);});
test('Each boss produces attacks in both phases without invalid coordinates',()=>{for(let biome=0;biome<CHAPTERS.length/5;biome++){const e=create();e.stage=biome*5+4;e.loadStage();const boss=e.enemies[0];e.player.invuln=1000;e.player.x=700;let observedAttack=false;for(let frame=0;frame<1800;frame++){tick(e);if(e.projectiles.length+e.hazards.length>0)observedAttack=true;}assert(e.events.some(ev=>ev.type==='telegraph'));assert(observedAttack);boss.hp=boss.maxHp*.3;tick(e,180);assert.equal(boss.phase,2);assert(Number.isFinite(boss.x));assert(Number.isFinite(boss.y));assert(Number.isFinite(e.player.hp));}});
test('Unlocked weapon variants change attacks with explicit tradeoffs and survive the expedition save',()=>{
  const e=create({legacyVariant:'echo_bow'});
  e.player.weapon='bow';e.enemies=[];e.spawnQueue=[{}];e.player.crit=0;
  assert(e.attack());tick(e,12);
  assert.equal(e.projectiles.filter(shot=>!shot.enemy).length,2,'Echo bow splits its attack into two weaker arrows');
  assert(e.projectiles.every(shot=>shot.damage<22*1.1));
  const reopened=create();assert(reopened.restoreCheckpoint(e.createCheckpoint()));
  assert.equal(reopened.legacyVariant,'echo_bow');
  const horde=create({mode:'horde',legacyVariant:'echo_bow'});
  horde.player.weapon='bow';horde.enemies=[];horde.spawnQueue=[{}];
  assert(horde.attack());tick(horde,12);
  assert.equal(horde.projectiles.filter(shot=>!shot.enemy).length,1);
});
test('The guard blade, rift hammer and glacial staff have their promised mechanics',()=>{
  const blade=create({legacyVariant:'ash_blade'});
  blade.player.invuln=0;blade.attack();const before=blade.player.hp;
  blade.hurtPlayer(10);
  assert(Math.abs(before-blade.player.hp-8)<1e-8);
  const hammer=create({legacyVariant:'rift_hammer'});
  hammer.enemies=[];hammer.spawnQueue=[{}];hammer.player.weapon='hammer';hammer.player.crit=0;hammer.player.x=100;
  const shield=hammer.addEnemy('bulwark',170,FLOOR-76);shield.dir=-1;shield.cd=100;shield.ground=true;
  hammer.attack();tick(hammer,19);
  assert(!hammer.effects.some(effect=>effect.type==='block'));
  const staff=create({legacyVariant:'frost_staff'});
  staff.enemies=[];staff.spawnQueue=[{}];staff.player.weapon='staff';staff.player.x=100;
  const target=staff.addEnemy('brute',250,FLOOR-68);target.cd=100;
  staff.attack();tick(staff,30);
  assert(target.slow>0);
});
test('Drafts have no duplicate cards and respect prerequisites and level caps',()=>{const e=create();for(let n=0;n<300;n++){e.offerCards('shrine');const ids=e.cards.map(c=>c.id);assert.equal(new Set(ids).size,ids.length);for(const c of e.cards){if(c.id==='rest')continue;assert((e.owned[c.id]||0)<c.max);assert(!c.requires||c.requires(e.player));}assert(e.chooseCard(0));}assert(e.player.armor<=.4801);assert(e.player.crit<=.6501);});
test('Pause halts simulation, clocks and health regeneration',()=>{const e=create();e.player.regen=2;e.player.hp=50;e.status='paused';const before={time:e.time,hp:e.player.hp,x:e.player.x};tick(e,60,{right:true});assert.deepEqual({time:e.time,hp:e.player.hp,x:e.player.x},before);});
test('Region practice starts at its chosen territory and cannot create a campaign checkpoint',()=>{
 const e=create({practiceRegion:3});
 assert.equal(e.stage,15);
 assert.equal(e.biome,3);
 assert.equal(e.player.maxHp,160);
 assert.equal(e.createCheckpoint(),null);
 for(let stage=15;stage<20;stage++){
  assert.equal(e.stage,stage);
  clearArea(e);assert(checkpoint(e));
  assert.equal(e.createCheckpoint(),null);
  if(stage<19)assert(e.chooseCard(0));
 }
 assert.equal(e.status,'ended');assert.equal(e.won,true);
 e.start();assert.equal(e.stage,0);assert(e.createCheckpoint());
 const horde=create({mode:'horde',practiceRegion:3});
 assert.equal(horde.stage,0);assert.equal(horde.createCheckpoint().format,'cinzas-horde');
});
console.log(`\n${passed} gameplay checks passed.`);
