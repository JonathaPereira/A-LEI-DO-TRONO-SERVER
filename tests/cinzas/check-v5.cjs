const assert=require('node:assert/strict');
const {Engine,CARDS,Rig,SPECIALS,MONSTERS,hordeTuning,CHAPTERS}=require('../../frontend/roguelite/core.js');
const Ledger=require('../../frontend/roguelite/persistence.js');
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const make=()=>{const e=new Engine();e.start({mode:'horde',seed:'v5-check',name:'Lia'});return e;};
const tick=(e,n)=>{for(let i=0;i<n;i++)e.update(1/60,{});};
const select=(e,id)=>{e.status='running';e.offerCards('start');e.cards=[CARDS.find(c=>c.id===id)];assert(e.chooseCard(0));};
test('Bow and staff release at the shared rendered anchor in both directions, low and airborne poses',()=>{
 for(const weapon of ['bow','staff'])for(const dir of [-1,1])for(const pose of ['normal','low','air']){const e=make(),p=e.player;p.weapon=weapon;p.dir=dir;p.ground=pose!=='air';p.swing={weapon,t:.16,duration:.4,windup:.144,combo:0,variant:pose==='low'?1:0,airborne:pose==='air'};const anchor=Rig.muzzle(p,weapon,e.time);e.resolveAttack(p.swing);const shot=e.projectiles[0];assert(Math.abs(shot.x-anchor.x)<1e-9);assert(Math.abs(shot.y-anchor.y)<1e-9);assert(shot.y<p.y+p.h-30);assert((shot.x-(p.x+p.w/2))*dir>15);const q=Rig.pose(p);assert.equal(anchor.pose.sheet,q.sheet);assert.equal(anchor.pose.index,q.index);}
});
test('Every weapon has a distinct delayed R1 special and its own cooldown',()=>{
 for(const weapon of ['blade','bow','staff','hammer']){const e=make(),p=e.player;p.weapon=weapon;e.spawnQueue=[{}];e.enemies=[];const target=e.addEnemy('brute',p.x+110);target.hp=2000;target.maxHp=2000;target.cd=999;assert(e.skill());assert.equal(p.skillCd,SPECIALS[weapon].cooldown);assert.equal(target.hp,2000);assert(!e.skill());tick(e,70);if(weapon==='blade')assert(target.hp<1940);if(weapon==='hammer')assert(target.hp<=1915);if(weapon==='bow')assert(e.events.some(ev=>ev.type==='release'&&ev.super&&ev.weapon==='bow'));if(weapon==='staff')assert(e.events.some(ev=>ev.type==='release'&&ev.super&&ev.weapon==='staff'));}
});
test('Campaign has three shrines, six scarce relics, and physical underground passages',()=>{
 const e=make();e.mode='adventure';let shrines=0,relics=0,tunnels=0;for(let i=0;i<CHAPTERS.length;i++){e.stage=i;e.loadStage();shrines+=e.shrines.length;relics+=e.relics.length;tunnels+=(e.tunnels||[]).length;for(const roof of e.platforms.filter(p=>p.ceiling)){const x=roof.x+roof.w/2;assert(e.groundY(x)-e.ceilingY(x)>=245);}}
 assert.equal(shrines,3);assert.equal(relics,6);assert.equal(tunnels,12);
});
test('Jump collides with a tunnel ceiling and fast airborne motion cannot penetrate an uphill floor',()=>{
 const e=make();e.platforms=[{id:1,x:0,w:2400,y:900,y2:900,h:300,oneWay:false},{id:2,x:200,w:1000,y:500,y2:500,h:110,ceiling:true,oneWay:false}];let p=e.player;Object.assign(p,{x:300,y:615,vy:-540,vx:0,ground:false});e.moveBody(p,1/60);assert(p.y>=610);assert(p.vy>=0);
 e.platforms=[{id:3,x:0,w:2400,y:200,y2:1400,oneWay:false}];Object.assign(p,{x:1000,y:e.groundY(1017)-p.h-1,vx:-500,vy:-90,ground:false});for(let i=0;i<100;i++){e.moveBody(p,1/60);assert(p.y+p.h<=e.groundY(p.x+p.w/2)+.01);}
});
test('Seven horde layouts vary; ten roles unlock gradually and tuning rises without an abrupt health reset',()=>{
 const e=make(),maps=new Set();for(let i=0;i<7;i++){e.stage=i;e.loadStage();maps.add(JSON.stringify(e.platforms.filter(p=>!p.oneWay).map(p=>[p.x,p.w,p.y,p.y2,p.effect,!!p.ceiling])));}assert.equal(maps.size,7);assert.equal(Object.keys(MONSTERS).length,10);for(let wave=1;wave<=35;wave++){const t=hordeTuning(wave);if(wave>1){const old=hordeTuning(wave-1);assert(t.hp>old.hp);assert(t.damage>old.damage);assert(t.count>=old.count);assert(t.interval<=old.interval);}e.stage=wave-1;e.loadStage();for(const entry of e.spawnQueue)assert(MONSTERS[entry.type].unlock<=wave);}
});
test('Real horde AI and spawn queues stay above terrain across 21 waves and all seven layouts',()=>{
 for(let stage=0;stage<21;stage++){const e=make();e.seed='horde-v5-soak';e.stage=stage;e.loadStage();e.player.invuln=9999;for(let frame=0;frame<1800;frame++){e.update(1/60,{right:frame%600<300,left:frame%600>=300,jump:frame%240===0});for(const a of e.enemies){assert(Number.isFinite(a.y));assert.equal(a.outOfBoundsRecoveries,0);assert(a.y+a.h<=e.groundY(a.x+a.w/2)+5);}}}
});
test('Entry, clear and draft checkpoints rebuild the same card stats; invalid data cannot replace a run',()=>{
 const e=make();select(e,'bow');select(e,'frost');select(e,'power');select(e,'power');select(e,'vitality');e.player.hp=77;
 for(const phase of ['entry','cleared','draft']){if(phase!=='entry'){e.cleared=true;e.completedWaves=e.stage+1;}if(phase==='draft')e.offerCards('exit');const cp=JSON.parse(JSON.stringify(e.createCheckpoint())),copy=new Engine();assert(copy.restoreCheckpoint(cp),phase);assert.equal(copy.player.hp,77);assert.equal(copy.player.power,e.player.power);assert.equal(copy.player.maxHp,120);assert.equal(copy.player.weapon,'bow');assert.equal(copy.player.frost,1);assert.equal(copy.owned.power,2);assert.deepEqual(copy.chosenHistory,e.chosenHistory);if(phase==='draft'){assert.deepEqual(copy.cards.map(c=>c.id),e.cards.map(c=>c.id));const token=copy.rerolls;assert(copy.rerollCards());assert.equal(copy.rerolls,token-1);}const old=copy.seed;assert(!copy.restoreCheckpoint({...cp,hp:Infinity}));assert.equal(copy.seed,old);assert(!copy.restoreCheckpoint({...cp,history:['unknown-card']}));}
});
test('Record merge preserves personal bests by difficulty, sanitizes imports and roundtrips a backup',()=>{
 const base={edition:'0.5',name:'Lia',difficulty:'normal',kills:20,wave:5,reached:6,score:100};const scores=Ledger.mergeRecords([base],[{...base,name:'lia',wave:2},{...base,difficulty:'hard',wave:3},{...base,name:'João',wave:7}]);assert.equal(scores.length,3);assert.equal(scores[0].name,'João');assert(scores.some(r=>r.difficulty==='normal'&&r.wave===5));const encoded=Ledger.backup(scores,make().createCheckpoint());const imported=Ledger.parseBackup(encoded);assert.deepEqual(imported.scores,scores);assert(new Engine().restoreCheckpoint(imported.checkpoint));assert.equal(Ledger.parseBackup('{bad'),null);assert.equal(Ledger.parseBackup(JSON.stringify({format:'other',version:1,scores:[]})),null);
});
console.log(passed+' v0.5 regression groups passed.');
