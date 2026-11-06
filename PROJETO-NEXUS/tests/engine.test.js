import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HEROES,ARCHIVED_HEROES,CLASSES,CLASS_BY_ID,HERO_BY_ID,DEFAULT_TEAMS} from '../src/data.js';
import {createBattle,currentUnit,advantage,canUse,legalTargets,getAction,act,chooseAI,validateTeam,preview,healingMultiplier} from '../src/engine.js';
function scene(id='veyra') {
 const rest=HEROES.map(h=>h.id).filter(h=>h!==id);
 const s=createBattle([id,...rest.slice(0,2)],rest.slice(2,5));
 for(const u of s.units)u.statuses=[];
 const a=s.units[0];s.order=[a.id,...s.units.slice(1).map(u=>u.id)];s.cursor=0;a.energy=100;
 return {s,a,t:s.units[3]};
}
const damage=r=>r.events.find(e=>e.type==='damage'&&!e.reaction&&!e.intercepted);
test('six affinities each have a distinct tank, support and damage kit with stable art indices',()=>{
 assert.equal(HEROES.length,24);assert.equal(ARCHIVED_HEROES.length,0);assert.equal(CLASSES.length,6);
 assert.equal(new Set([...HEROES,...ARCHIVED_HEROES].map(h=>h.index)).size,24);
 for(const c of CLASSES) assert.deepEqual([...new Set(HEROES.filter(h=>h.classId===c.id).map(h=>h.role))].sort(),['Dano','Suporte','Tanque']);
 for(const h of HEROES) {assert(h.identity&&h.synergy);for(const k of ['basic','skill','ultimate'])assert(h[k].description&&h[k].name);}
 assert.equal(HERO_BY_ID.auren.index,20);
});
test('six-class cycle closes with Lumi over Ígneo and reversed resistance',()=>{
 for(const c of CLASSES){assert.equal(advantage(c.id,CLASS_BY_ID[c.id].strongAgainst),1.25);assert.equal(advantage(CLASS_BY_ID[c.id].strongAgainst,c.id),.85);}
 assert.equal(advantage('sombrio','lumi'),1.25);assert.equal(advantage('arcano','igneo'),1);
});
test('invalid teams, illegal targets and unavailable actions do not mutate a battle',()=>{
 assert(!validateTeam(['missing','veyra','astra']));assert(!validateTeam(['veyra','veyra','astra']));
 const s=createBattle(...DEFAULT_TEAMS),before=structuredClone(s);
 assert.throws(()=>act(s,'ultimate',s.units[3].id));assert.throws(()=>act(s,'basic',currentUnit(s).id));assert.deepEqual(s,before);
});
test('preview gives exact normal and critical shield/HP endpoints without changing RNG or live state',()=>{
 const {s,a,t}=scene();t.shield=200;const before=structuredClone(s),p=preview(s,'skill',t.id);
 assert.deepEqual(s,before);assert.deepEqual(p.normal,act(structuredClone(s),'skill',t.id,false));assert.deepEqual(p.critical,act(structuredClone(s),'skill',t.id,true));
 assert(damage(p.critical).total>damage(p.normal).total);assert.equal(a.energy,100);
});
test('Veyra consumes a burn for a 40% technique combo, while Riven keeps bleeding on his technique',()=>{
 for(const id of ['veyra','riven']){
  const {s,t}=scene(id),type=id==='veyra'?'burn':'bleed';t.statuses=[{type,turns:2}];
  const baseline=scene(id);const low=damage(act(baseline.s,'skill',baseline.t.id,false)).total;
  const r=act(s,'skill',t.id,false),d=damage(r);assert(d.total>low);assert.equal(d.combo,type);
  assert.equal(r.impactUnits.find(u=>u.id===t.id).statuses.some(st=>st.type===type),id==='riven');
 }
});
test('basic attacks apply their own marks and grant 24 energy; cooldown lasts two personal turns',()=>{
 const {s,a,t}=scene('riven');a.energy=40;const r=act(s,'basic',t.id,false);assert.equal(a.energy,64);assert.equal(damage(r).effect,'bleed');
 const q=scene();q.a.energy=100;act(q.s,'skill',q.t.id);assert.equal(q.a.cooldowns.skill,3);
 let visits=0;while(visits<3){const u=currentUnit(q.s);if(u===q.a){visits++;assert.equal(canUse(u,'skill'),visits===3);if(visits===3)break;}act(q.s,'guard',u.id);}
});
test('taunt constrains single-target damage but area attacks still reach all enemies',()=>{
 const {s,a,t}=scene();t.statuses=[{type:'taunt',turns:2}];
 assert.deepEqual(legalTargets(s,a,getAction(a,'basic')).map(u=>u.id),[t.id]);
 assert.equal(legalTargets(s,a,getAction(a,'ultimate')).length,3);
 const q=scene('rhazen');assert.deepEqual(legalTargets(q.s,q.a,getAction(q.a,'skill')).map(u=>u.id),[q.a.id]);
});
test('a live cover guardian receives 25% of a single hit; a dead guardian cannot protect',()=>{
 const {s,t}=scene();const g=s.units[4];t.statuses=[{type:'cover',turns:2,owner:g.id}];
 const r=act(s,'basic',t.id,false);const intercept=r.events.find(e=>e.intercepted);assert(intercept.amount>0);assert.equal(g.stats.protected,intercept.amount);
 assert.equal(intercept.total+damage(r).total,damage(act(scene().s,'basic',scene().t.id,false)).total);
 const q=scene();q.s.units[4].hp=0;q.t.statuses=[{type:'cover',turns:2,owner:q.s.units[4].id}];assert(!act(q.s,'basic',q.t.id).events.some(e=>e.intercepted));
});
test('Sylva seed heals the next attacker, is consumed, and cannot revive',()=>{
 const {s,a,t}=scene();a.hp-=300;t.statuses=[{type:'seed',turns:2}];
 const r=act(s,'basic',t.id,false),h=r.events.find(e=>e.source==='seed');assert.equal(h.amount,Math.round(a.maxHp*.1));assert(!r.impactUnits.find(u=>u.id===t.id).statuses.some(st=>st.type==='seed'));
});
test('fortification reduces incoming damage and inspiration increases attack',()=>{
 const base=scene();const normal=damage(act(base.s,'basic',base.t.id,false)).total;
 const fort=scene();fort.t.statuses=[{type:'fortify',turns:2}];assert(damage(act(fort.s,'basic',fort.t.id,false)).total<normal);
 const buff=scene();buff.a.statuses=[{type:'empower',turns:2}];assert(damage(act(buff.s,'basic',buff.t.id,false)).total>normal);
});
test('mirror and riposte react once, and do not trigger infinite counter chains',()=>{
 const {s,a,t}=scene();a.statuses=[{type:'riposte',turns:2}];t.statuses=[{type:'mirror',turns:2},{type:'riposte',turns:2}];
 const r=act(s,'basic',t.id,false);assert.equal(r.events.filter(e=>e.reaction).length,1);assert(a.hp<a.maxHp);
});
test('Kira pierces shield while Elun spends his stored shield once for an area supreme',()=>{
 const q=scene('kira');q.t.shield=300;q.t.shieldTurns=2;const d=damage(act(q.s,'skill',q.t.id,false));assert(d.amount>0&&d.absorbed>0);
 const {s,a,t}=scene('elun');a.shield=300;a.shieldTurns=2;const r=act(s,'ultimate',t.id,false);assert.equal(r.impactUnits[0].shield,Math.round(a.maxHp*.08));assert.equal(r.events.find(e=>e.type==='converted').shieldSpent,300);assert.equal(r.events.filter(e=>e.type==='converted').length,1);assert.equal(r.events.filter(e=>e.type==='damage'&&!e.reaction).length,3);
});
test('Vektor restores only available energy and purification preserves positive statuses',()=>{
 const {s,a}=scene('vektor');const ally=s.units[1];ally.energy=90;ally.statuses=['burn','bleed','expose','regen','fortify','empower'].map(type=>({type,turns:2}));
 const r=act(s,'skill',ally.id);assert.equal(ally.energy,100);assert.equal(r.events.find(e=>e.type==='energy').amount,10);assert.deepEqual(ally.statuses.map(x=>x.type),['regen','fortify','empower']);assert.equal(a.stats.energyGiven,10);
});
test('Maura benefits from allied bleeding to heal the most wounded ally',()=>{
 const {s,a,t}=scene('maura');a.hp=100;t.statuses=[{type:'bleed',turns:2}];
 const r=act(s,'skill',t.id,false);assert.equal(r.events.find(e=>e.source==='secondary').amount,Math.round(a.maxHp*.14*1.5));
});
test('critical against shield reports exact remaining barrier and useful protection',()=>{
 const {s,t}=scene();t.shield=300;t.shieldTurns=2;const d=damage(act(s,'basic',t.id,true));assert(d.critical);assert.equal(d.amount,0);assert.equal(t.shield,300-d.absorbed);assert.equal(t.stats.shieldAbsorbed,d.absorbed);
});
test('damage is capped at remaining HP and shield; attacks cannot revive defeated targets',()=>{
 const {s,t}=scene();t.hp=10;t.shield=40;const d=damage(act(s,'skill',t.id,true));assert.equal(d.amount,10);assert.equal(d.absorbed,40);assert.equal(d.hpAfter,0);
});
test('burn and bleeding tick separately after impact and bypass shields; regeneration never revives',()=>{
 const {s,a,t}=scene();s.order=[a.id,t.id,...s.units.filter(u=>![a,t].includes(u)).map(u=>u.id)];t.shield=300;t.shieldTurns=2;t.statuses=['burn','bleed'].map(type=>({type,turns:2}));
 const r=act(s,'basic',t.id,false);assert.deepEqual(r.turnEvents.map(e=>e.type),['burn','bleed']);assert.equal(r.turnEvents[0].remaining,1);assert.equal(t.hp,t.maxHp-2*Math.round(t.maxHp*.065));
 const q=scene();q.s.order=[q.a.id,q.t.id];q.t.hp=1;q.t.statuses=[{type:'burn',turns:2},{type:'regen',turns:2}];act(q.s,'guard',q.a.id);assert.equal(q.t.hp,0);
});
test('Fracture starts at round 12 with 4% max HP, bypasses barriers and ends defensive loops',()=>{
 const {s,a}=scene();s.round=11;s.order=[a.id];a.speed=999;const hp=a.hp;act(s,'guard',a.id);assert.equal(s.round,12);assert.equal(a.hp,hp-Math.ceil(a.maxHp*.04));assert(a.shield>0);
 const q=createBattle(...DEFAULT_TEAMS);while(q.phase==='playing'&&q.turns<400)act(q,'guard',currentUnit(q).id);assert.equal(q.phase,'finished');
});
test('deterministic AI exercises all twenty-four kits and keeps resources bounded through complete matches',()=>{
 for(let i=0;i<HEROES.length;i++){
 const teams=[0,5].map(offset=>[0,1,2].map(j=>HEROES[(i+offset+j)%HEROES.length].id));const s=createBattle(...teams,{seed:i+1});
 while(s.phase==='playing'&&s.turns<400){const m=chooseAI(s);assert(m);assert(canUse(currentUnit(s),m.actionId));act(s,m.actionId,m.targetId);for(const u of s.units){assert(u.hp>=0&&u.hp<=u.maxHp);assert(u.shield>=0&&u.shield<=Math.round(u.maxHp*.25));assert(u.energy>=0&&u.energy<=100);}}
 assert.equal(s.phase,'finished',`match ${i}`);
 }
});
test('difficulty scales enemy HP and attack, while roles and speeds are persistent',()=>{
 const easy=createBattle(...DEFAULT_TEAMS,{difficulty:'easy'}),hard=createBattle(...DEFAULT_TEAMS,{difficulty:'hard'});
 assert(easy.units[3].maxHp<hard.units[3].maxHp);assert.equal(easy.units[3].speed,hard.units[3].speed);assert.equal(easy.units[0].maxHp,hard.units[0].maxHp);
});

test('periodic burn, bleeding and regeneration activate exactly twice per target',()=>{
 const s=createBattle(...DEFAULT_TEAMS),a=currentUnit(s);a.hp-=400;
 a.statuses=['burn','bleed','regen'].map(type=>({type,turns:2}));
 const initial=a.hp,delta=2*Math.round(a.maxHp*.065)-Math.round(a.maxHp*.04*.65);
 act(s,'guard',a.id);let visits=0;
 while(visits<3){const u=currentUnit(s);if(u.id===a.id){visits++;assert.equal(a.hp,initial-delta*Math.min(2,visits));if(visits===3)break;}act(s,'guard',u.id);}
 assert.equal(a.statuses.length,0);
});

test('independent shields add up to the cap without renewing an older layer',()=>{
 const {s,a}=scene('rhazen');a.shield=100;a.shieldTurns=1;
 const r=act(s,'skill',a.id).events.find(e=>e.type==='shield');
 assert.equal(r.shieldAfter,100+Math.round(a.maxHp*.16));
 assert.deepEqual(a.shieldLayers.map(l=>l.expiresRound),[2,3]);
 const q=scene();q.a.shield=Math.round(q.a.maxHp*.25);q.a.shieldTurns=1;
 assert.equal(act(q.s,'guard',q.a.id).events[0].amount,0);
 assert.equal(q.a.shieldLayers[0].expiresRound,2);
});
test('round 1 shield expires in round 3 while round 2 shield survives, consuming oldest layers first',()=>{
 const {s,a}=scene();const grant=Math.round(a.maxHp*.06);
 act(s,'guard',a.id);
 while(s.round<2)act(s,'guard',currentUnit(s).id);
 s.order=[a.id];s.cursor=0;
 const r=act(s,'guard',a.id);
 assert.equal(s.round,3);assert.equal(a.shield,grant);
 assert.deepEqual(a.shieldLayers,[{amount:grant,expiresRound:4}]);
 assert(r.turnEvents.some(e=>e.type==='shieldExpired'&&e.target===a.id&&e.amount===grant&&e.shieldAfter===grant));
 const q=scene();q.t.shield=240;q.t.shieldTurns=2;
 q.t.shieldLayers=[{amount:80,expiresRound:3},{amount:160,expiresRound:4}];
 const d=damage(act(q.s,'basic',q.t.id,false));
 assert(d.absorbed>80);assert.equal(q.t.shieldLayers.length,1);
 assert.equal(q.t.shieldLayers[0].expiresRound,4);assert.equal(q.t.shieldLayers[0].amount,240-d.absorbed);
});
test('basic attacks can target front or rear unless a live enemy is provoking',()=>{
 const {s,a}=scene();assert.equal(legalTargets(s,a,getAction(a,'basic')).length,3);
 for(const slot of [0,1,2])assert(legalTargets(s,a,getAction(a,'basic')).some(u=>u.slot===slot));
 const tank=s.units[3];tank.statuses=[{type:'taunt',turns:2}];assert.deepEqual(legalTargets(s,a,getAction(a,'basic')).map(u=>u.id),[tank.id]);tank.hp=0;assert.equal(legalTargets(s,a,getAction(a,'basic')).length,2);
});

test('bleeding reduces direct, secondary, seed and drain healing; previews report the actual reduction',()=>{
 const direct=scene('sylva');direct.a.hp=200;direct.a.statuses=[{type:'bleed',turns:2}];
 const before=structuredClone(direct.s),p=preview(direct.s,'skill',direct.a.id);
 assert.deepEqual(direct.s,before);const heal=p.normal.events.find(e=>e.type==='heal');
 assert.equal(heal.amount,Math.round(direct.a.maxHp*.2*.65));assert.equal(heal.healingPenalty,35);
 assert.deepEqual(act(direct.s,'skill',direct.a.id,false),p.normal);
 const q=scene('riven');q.a.hp=200;q.a.statuses=[{type:'bleed',turns:2}];q.t.statuses=[{type:'seed',turns:2}];
 const r=act(q.s,'basic',q.t.id,false),seed=r.events.find(e=>e.source==='seed'),drain=r.events.find(e=>e.source==='drain');
 assert.equal(seed.amount,Math.round(q.a.maxHp*.1*.65));assert.equal(drain.amount,Math.round(damage(r).amount*.15*.65));
 assert.equal(seed.healingPenalty,35);assert.equal(drain.healingPenalty,35);assert.equal(q.a.stats.healing,seed.amount+drain.amount);
 const m=scene('maura');m.a.hp=100;m.a.statuses=[{type:'bleed',turns:2}];m.t.statuses=[{type:'bleed',turns:2}];
 const secondary=act(m.s,'skill',m.t.id,false).events.find(e=>e.source==='secondary');
 assert.equal(secondary.amount,Math.round(m.a.maxHp*.14*1.5*.65));assert.equal(secondary.healingPenalty,35);
});
test('purifying heals apply before cleanse; cleanse removes bleeding but cannot remove Fracture',()=>{
 const {s,a}=scene('saira');a.hp=100;a.statuses=[{type:'bleed',turns:2}];s.round=16;
 const r=act(s,'skill',a.id,false),h=r.events.find(e=>e.type==='heal'&&e.target===a.id);
 assert.equal(h.amount,Math.round(a.maxHp*.12*.65*.5));assert.equal(h.healingPenalty,68);
 assert.deepEqual(h.cleansed,['bleed']);assert(!a.statuses.some(st=>st.type==='bleed'));assert.equal(healingMultiplier(s,a),.5);
});
test('Fracture reduces every healing source progressively from round 12 and blocks healing from round 21',()=>{
 for(const round of [11,12,16,20,21,24]){
  const {s,a}=scene('sylva');s.round=round;a.hp=100;
  const multiplier=Math.max(0,1-Math.max(0,round-11)*.1);
  const h=act(s,'skill',a.id,false).events.find(e=>e.type==='heal');
  assert.equal(h.amount,Math.round(a.maxHp*.2*multiplier));assert.equal(h.healingPenalty,Math.min(100,Math.max(0,round-11)*10));
  if(round>=21){
   const q=scene('riven');q.s.round=round;q.a.hp=100;q.t.statuses=[{type:'seed',turns:2}];
   const result=act(q.s,'basic',q.t.id,false);assert.equal(q.a.hp,100-result.events.filter(e=>e.reaction).reduce((n,e)=>n+e.amount,0));assert.equal(q.a.stats.healing,0);
   assert.equal(result.events.find(e=>e.source==='seed').amount,0);assert(!result.events.some(e=>e.source==='drain'));
   const m=scene('maura');m.s.round=round;m.a.hp=100;assert.equal(act(m.s,'skill',m.t.id,false).events.find(e=>e.source==='secondary').amount,0);
  }
 }
 const {s,a,t}=scene();s.round=21;s.order=[a.id,t.id];t.hp=t.maxHp;t.statuses=[{type:'regen',turns:2}];
 const events=act(s,'guard',a.id).turnEvents;assert.equal(events.find(e=>e.type==='heal').amount,0);assert.equal(events.find(e=>e.type==='heal').healingPenalty,100);
});

test('one archived hero per affinity returns with a distinct specialty and stable artwork index',()=>{
 const returned=['torv','brin','bast','ivo','noct'].map(id=>HERO_BY_ID[id]);
 assert.deepEqual(returned.map(h=>h.index),[3,7,10,15,18]);
 assert.equal(new Set(returned.map(h=>h.classId)).size,5);
 assert.equal(new Set(returned.map(h=>h.specialty)).size,5);
 assert.equal(ARCHIVED_HEROES.length,0);
 for(const c of CLASSES)assert.equal(HEROES.filter(h=>h.classId===c.id).length,4);
});
test('dark marks tick actual HP through shields, heal only their living author and record correct off-turn endpoints',()=>{
 const {s,a,t}=scene('noct');a.hp=300;t.shield=200;t.shieldTurns=2;
 s.order=[a.id,t.id];t.statuses=[{type:'darkmark',turns:2,owner:a.id}];
 const r=act(s,'guard',a.id,false),tick=r.turnEvents.find(e=>e.type==='darkmark'),h=r.turnEvents.find(e=>e.source==='darkmark');
 assert.equal(tick.amount,Math.round(t.maxHp*.035));assert.equal(t.shield,200);
 assert.equal(h.amount,Math.round(tick.amount*.6));assert.equal(h.hpAfter,300+h.amount);assert.equal(h.target,a.id);assert.equal(t.statuses.find(x=>x.type==='darkmark').turns,1);
 const q=scene('noct');q.a.hp=0;q.s.order=[q.s.units[1].id,q.t.id];q.t.statuses=[{type:'darkmark',turns:2,owner:q.a.id}];
 const d=act(q.s,'guard',q.s.units[1].id,false);assert(d.turnEvents.some(e=>e.type==='darkmark'));assert(!d.turnEvents.some(e=>e.source==='darkmark'));assert.equal(q.a.hp,0);
});
test('mark refresh cannot stack; purification removes marks and preserves elemental protection',()=>{
 const {s,a,t}=scene('noct');t.statuses=[{type:'darkmark',turns:1,owner:'0-maura'}];
 const r=act(s,'basic',t.id,false),mark=r.impactUnits.find(u=>u.id===t.id).statuses.filter(x=>x.type==='darkmark');
 assert.deepEqual(mark,[{type:'darkmark',turns:2,owner:a.id}]);
 const q=scene('brin');const ally=q.s.units[1];ally.hp=500;ally.statuses=[{type:'darkmark',owner:q.t.id,turns:2},{type:'elementalWard',turns:2}];
 const clean=act(q.s,'skill',ally.id,false).events.find(e=>e.type==='heal');
 assert(clean.cleansed.includes('darkmark'));assert(ally.statuses.some(x=>x.type==='elementalWard'));assert(!ally.statuses.some(x=>x.type==='darkmark'));
});
test('Ivo spreads exactly one existing affliction without extending its duration or taking ownership',()=>{
 const {s,a,t}=scene('ivo');t.statuses=[{type:'darkmark',turns:1,owner:'0-maura'},{type:'bleed',turns:2}];
 const r=act(s,'skill',t.id,false),copy=r.events.filter(e=>e.source==='spread');
 assert.equal(copy.length,1);assert.equal(copy[0].effect,'darkmark');assert.equal(copy[0].effectTurns,1);
 const recipient=r.impactUnits.find(u=>u.id===copy[0].target);
 assert.deepEqual(recipient.statuses.find(x=>x.type==='darkmark'),{type:'darkmark',turns:1,owner:'0-maura'});
 const empty=scene('ivo');assert(!act(empty.s,'skill',empty.t.id,false).events.some(e=>e.source==='spread'));
});
test('elemental ward reduces advantageous direct damage only; enemies remain selectable',()=>{
 const {s,a,t}=scene();t.heroId='sylva';t.statuses=[{type:'elementalWard',turns:2}];
 const shielded=damage(act(structuredClone(s),'basic',t.id,false));t.statuses=[];
 const plain=damage(act(structuredClone(s),'basic',t.id,false));assert(Math.abs(shielded.total-plain.total*.8)<=1);
 t.heroId='kira';const neutral=damage(act(structuredClone(s),'basic',t.id,false));t.statuses=[{type:'elementalWard',turns:2}];
 assert.equal(damage(act(structuredClone(s),'basic',t.id,false)).total,neutral.total);
 assert.equal(legalTargets(s,a,getAction(a,'basic')).length,3);
});
test('Sentinel weakens a direct aggressor after contact and never chains counter reactions',()=>{
 const {s,a,t}=scene();t.statuses=[{type:'sentinel',turns:2},{type:'mirror',turns:2}];a.statuses=[{type:'mirror',turns:2}];
 const r=act(s,'basic',t.id,false);assert.equal(r.events.filter(e=>e.source==='sentinel').length,1);assert.equal(r.events.filter(e=>e.reaction).length,1);
 assert(r.impactUnits.find(u=>u.id===a.id).statuses.some(x=>x.type==='weaken'));
});
test('a nearly defeated interceptor cannot erase overflow damage and cannot intercept an area attack',()=>{
 const {s,a,t}=scene('kira'),guardian=s.units[4];guardian.hp=1;guardian.shield=0;t.statuses=[{type:'cover',owner:guardian.id,turns:2}];
 const r=act(s,'basic',t.id,false),direct=damage(r),intercept=r.events.find(e=>e.intercepted);
 const plain=structuredClone(s);plain.phase='playing';plain.order=[a.id];plain.cursor=0;plain.units.find(u=>u.id===t.id).hp=t.maxHp;plain.units.find(u=>u.id===t.id).statuses=[];
 const p=damage(act(plain,'basic',t.id,false));assert.equal(intercept.amount,1);assert.equal(direct.total+intercept.amount,p.total);
 const q=scene('astra');q.t.statuses=[{type:'cover',owner:q.s.units[4].id,turns:2}];assert(!act(q.s,'ultimate',q.t.id,false).events.some(e=>e.intercepted));
});
test('Vesper creates two-turn taunt and riposte while multi-status combos consume just one opening',()=>{
 const q=scene('vesper'),r=act(q.s,'skill',q.a.id,false);const statuses=r.impactUnits[0].statuses;
 assert.equal(statuses.find(s=>s.type==='taunt').turns,2);assert.equal(statuses.find(s=>s.type==='riposte').turns,2);
 assert.equal(r.events.find(e=>e.extraEffect==='riposte').extraEffectTurns,2);
 const {s,a,t}=scene('veyra');t.statuses=[{type:'bleed',turns:2},{type:'burn',turns:2}];const hit=act(s,'skill',t.id,false);
 const after=hit.impactUnits.find(u=>u.id===t.id);assert(!after.statuses.some(x=>x.type==='burn'));assert(after.statuses.some(x=>x.type==='bleed'));
});
test('Igneo defensive reflection uses HP damage only, and Torv receives his advertised critical window',()=>{
 const q=scene('kira');q.t.heroId='rhazen';q.t.shield=2000;q.t.shieldTurns=2;
 assert(!act(structuredClone(q.s),'basic',q.t.id,false).events.some(e=>e.reaction));q.t.shield=0;
 const r=act(q.s,'basic',q.t.id,false);assert.equal(r.events.find(e=>e.reaction).amount,Math.round(damage(r).amount*.1));
 const x=scene('torv');let seed=0;while(true){const roll=((Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;if(roll>.4&&roll<.49)break;seed++;}
 x.s.random=seed;assert(damage(act(structuredClone(x.s),'skill',x.t.id)).critical);assert(!damage(act(x.s,'basic',x.t.id)).critical);
});
test('an isolated interceptor skips its unavailable ally protection and always selects a legal attack',()=>{
 for(const id of ['oren','bast']){
  const {s,a}=scene(id);s.units[1].hp=0;s.units[2].hp=0;a.energy=40;
  const action=chooseAI(s);assert(action);assert.notEqual(action.actionId,'skill');
  assert(legalTargets(s,a,getAction(a,action.actionId)).some(t=>t.id===action.targetId));
 }
});

test('provoking tank pays a bound defense penalty; cleansing cannot remove that price',()=>{
 const {s,a,t}=scene();t.heroId='vesper';t.defense=108;t.statuses=[];
 const plain=damage(act(structuredClone(s),'basic',t.id,false)).total;
 t.statuses=[{type:'taunt',turns:2}];
 const taunted=damage(act(structuredClone(s),'basic',t.id,false)).total;
 assert(taunted>plain);assert.equal(a.defense,HERO_BY_ID[a.heroId].defense);
 const q=scene('vektor');q.a.statuses=[{type:'taunt',turns:2},{type:'burn',turns:2}];
 act(q.s,'skill',q.a.id);assert(q.a.statuses.some(st=>st.type==='taunt'));assert(!q.a.statuses.some(st=>st.type==='burn'));
});
test('opening cover selects a single tank and stops redirecting when that tank falls',()=>{
 const s=createBattle(['vesper','oren','sylva'],['veyra','kira','nima']);
 for(const u of s.units.slice(1,3))assert.equal(u.statuses.find(st=>st.type==='cover').owner,'0-vesper');
 assert(!s.units[0].statuses.some(st=>st.type==='cover'));
});
test('AI finishes an exposed damage hero, conserves energy, protects a dying ally and never changes RNG',()=>{
 const {s,a}=scene('veyra');s.units[3].hp=1;s.units[3].heroId='nima';s.units[4].hp=0;s.units[5].hp=0;
 const before=structuredClone(s),choice=chooseAI(s);assert.equal(choice.targetId,s.units[3].id);assert.equal(choice.actionId,'basic');assert.deepEqual(s,before);
 const q=scene('sylva');q.s.units[1].hp=10;assert.equal(chooseAI(q.s).targetId,q.s.units[1].id);assert(['skill','ultimate'].includes(chooseAI(q.s).actionId));
});
