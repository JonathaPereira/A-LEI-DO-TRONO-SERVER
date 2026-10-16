const assert=require('node:assert/strict');
const {Engine,CHAPTERS,FLOOR}=require('../../public/roguelite/core.js');
const make=(options={})=>{const e=new Engine();e.start({seed:'exploration-check',...options});return e;};
const tick=(e,n,input={})=>{for(let i=0;i<n;i++)e.update(1/60,input);};
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}
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
console.log(passed+' exploration/combat/horde checks passed.');
