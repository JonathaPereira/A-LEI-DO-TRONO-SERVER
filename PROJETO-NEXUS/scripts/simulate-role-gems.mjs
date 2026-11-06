// Equal-schedule role comparison and gem experiments on the live PvP rules.
// Only local analysis files are written; game balance and player logs are untouched.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {parseArgs} from 'node:util';
import {HEROES,HERO_BY_ID,CLASS_BY_ID,ARCHIVED_HEROES,DEFAULT_TEAMS,GUARD} from '../src/data.js';
import {act,chooseAI,currentUnit,RULES} from '../src/engine.js';
import {BUILD,PVP,createPvpBattle} from '../server/pvp-loadout.mjs';

const {values}=parseArgs({options:{output:{type:'string',default:'artifacts/roles-gems-014'},seed:{type:'string',default:'20261021'}}});
const seed=Number(values.seed);
assert(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff);
assert.equal(HEROES.length,20);
assert.deepEqual(JSON.parse(await readFile(new URL('../godot/data/catalog.json',import.meta.url),'utf8')),{schemaVersion:1,heroes:HEROES,archivedHeroes:ARCHIVED_HEROES,classes:Object.values(CLASS_BY_ID),defaultTeams:DEFAULT_TEAMS,guard:GUARD});
assert.deepEqual(JSON.parse(await readFile(new URL('../godot/data/combat-rules.json',import.meta.url),'utf8')),RULES);
assert.deepEqual(JSON.parse(await readFile(new URL('../godot/data/pvp-rules.json',import.meta.url),'utf8')),PVP);
let random=seed;
const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random;};
const pick=n=>Math.floor(next()/4294967296*n);
const shuffle=items=>{const result=[...items];for(let i=result.length-1;i>0;i--){const j=pick(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;};
const roleOrder={Tanque:0,Suporte:1,Dano:2};
const formation=team=>[...team].sort((a,b)=>roleOrder[HERO_BY_ID[a].role]-roleOrder[HERO_BY_ID[b].role]||a.localeCompare(b));
const teamKey=team=>[...team].sort().join('+');
const teamName=team=>team.map(id=>HERO_BY_ID[id].name).join(' + ');
const digest=state=>createHash('sha256').update(JSON.stringify(state)).digest('hex');
const profileLabel=(a,h,e)=>[[a,'ATQ'],[h,'VIDA'],[e,'EN']].filter(([count])=>count).map(([count,label])=>`${count} ${label}`).join(' + ');
const profiles=[];
for(let attack=3;attack>=0;attack--)for(let hp=3-attack;hp>=0;hp--){
  const energy=3-attack-hp;
  profiles.push({id:profiles.length,attack,hp,energy,name:profileLabel(attack,hp,energy),slots:[...Array(attack).fill('ember'),...Array(hp).fill('sap'),...Array(energy).fill('pulse')],attackPct:attack*4,hpPct:hp*5,initialEnergy:energy*8});
}
const noGems={id:10,attack:0,hp:0,energy:0,name:'Sem gemas',slots:['','',''],attackPct:0,hpPct:0,initialEnergy:0};
const controls=[...profiles,noGems];
const balanced=profiles.find(p=>p.attack===1&&p.hp===1&&p.energy===1).id;
const fullAttack=profiles.find(p=>p.attack===3).id;
const fullHp=profiles.find(p=>p.hp===3).id;
const fullEnergy=profiles.find(p=>p.energy===3).id;
const groupId=(d,t,s)=>`${d}D${t}T${s}S`;
function label(d,t,s){return [[d,'Dano','Danos'],[t,'Tanque','Tanques'],[s,'Suporte','Suportes']].filter(([n])=>n).map(([n,singular,plural])=>`${n} ${n===1?singular:plural}`).join(' + ');}
const groups=[];
for(let d=3;d>=0;d--)for(let t=3-d;t>=0;t--){const s=3-d-t;groups.push({id:groupId(d,t,s),name:label(d,t,s),d,t,s,teams:[]});}
const byGroup=Object.fromEntries(groups.map(g=>[g.id,g]));
function groupOf(team){const counts={Dano:0,Tanque:0,Suporte:0};team.forEach(id=>counts[HERO_BY_ID[id].role]++);return groupId(counts.Dano,counts.Tanque,counts.Suporte);}
for(let a=0;a<HEROES.length;a++)for(let b=a+1;b<HEROES.length;b++)for(let c=b+1;c<HEROES.length;c++){
  const team=formation([HEROES[a].id,HEROES[b].id,HEROES[c].id]);byGroup[groupOf(team)].teams.push(team);
}
assert.equal(groups.length,10);assert.equal(groups.reduce((n,g)=>n+g.teams.length,0),1140);
// Complete shuffled decks ensure all compositions are exercised in mixed play.
const decks={};
function draw(group){let deck=decks[group.id];if(!deck?.length)decks[group.id]=deck=shuffle(group.teams);return deck.pop();}
function loadout(team,recipe){team=formation(team);return {team,gems:Object.fromEntries(team.map((id,i)=>[id,[...controls[recipe[i]].slots]]))};}
const uniform=id=>[id,id,id];
const records=[],samples=[];
let pairId=0,totalActions=0;
function pair(left,right,phase,matchSeed=next(),extra={}){
  const id=pairId++,out=[];
  const lineups=[left,right],roleGroups=lineups.map(l=>groupOf(l.team));
  assert.notEqual(roleGroups[0],roleGroups[1],'Role matchups exclude own-group mirrors');
  for(let swap=0;swap<2;swap++){
    const loadouts=swap?[right,left]:[left,right];
    const state=createPvpBattle(loadouts,matchSeed),usage={};
    for(const u of state.units)usage[u.id]={basic:0,skill:0,ultimate:0,guard:0};
    const saveSample=records.length%911===0||phase==='final'&&records.length%97===0;
    const commands=saveSample?[]:null;
    while(state.phase==='playing'&&state.turns<400){
      const command=chooseAI(state),actor=currentUnit(state);
      assert(command);usage[actor.id][command.actionId]++;
      if(commands)commands.push({actor:actor.id,...command});
      act(state,command.actionId,command.targetId);
      for(const u of state.units){assert(u.hp>=0&&u.hp<=u.maxHp&&u.energy>=0&&u.energy<=100);assert(u.shield>=0&&u.shield<=Math.round(u.maxHp*RULES.shield.maxHpRatio));}
    }
    assert.equal(state.phase,'finished','Never score incomplete games');
    assert([0,1].includes(state.winner));
    totalActions+=state.turns;
    const row={id:records.length+1,pairId:id,phase,seed:matchSeed,swap,groups:roleGroups,loadouts:lineups,winner:swap?1-state.winner:state.winner,side0Won:state.winner===0,actions:state.turns,rounds:state.round,fracture:state.round>=RULES.fracture.startRound,usage:lineups.map((l,originalSide)=>{
      const actualSide=swap?1-originalSide:originalSide;const result={basic:0,skill:0,ultimate:0,guard:0};
      for(const hero of l.team)for(const action of Object.keys(result))result[action]+=usage[`${actualSide}-${hero}`][action];return result;
    }),finalDigest:digest(state),...extra};
    records.push(row);out.push(row);
    if(commands)samples.push({id:row.id,loadouts,seed:matchSeed,commands,finalDigest:row.finalDigest,winner:state.winner});
  }
  return out;
}
const rate=row=>100*row.wins/row.games;
function stats(){return {games:0,wins:0,rounds:0,actions:0,fractureGames:0,basics:0,skills:0,ultimates:0,guards:0};}
function add(row,match,side){row.games++;row.wins+=Number(match.winner===side);row.rounds+=match.rounds;row.actions+=match.actions;row.fractureGames+=Number(match.fracture);row.basics+=match.usage[side].basic;row.skills+=match.usage[side].skill;row.ultimates+=match.usage[side].ultimate;row.guards+=match.usage[side].guard;}
function finish(row){return {...row,losses:row.games-row.wins,winRate:rate(row),meanRounds:row.rounds/row.games,meanUltimates:row.ultimates/row.games};}
const descending=(a,b)=>b.winRate-a.winRate||b.games-a.games||String(a.id??a.key).localeCompare(String(b.id??b.key));
const wilson=row=>{const z=1.96,n=row.games,p=row.wins/n;return (p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n);};
function groupRanking(phase){const rows=Object.fromEntries(groups.map(g=>[g.id,{id:g.id,name:g.name,...stats()}]));for(const match of records.filter(m=>m.phase===phase))for(let side=0;side<2;side++)add(rows[match.groups[side]],match,side);return Object.values(rows).map(finish).sort(descending);}

// Controlled gem study: only the focal team's gems change; opponent always
// equips one attack, one health and one energy gem per hero. Each profile
// faces identical opponents/seeds with side reversal. Score focal teams only.
console.log('Controlled role × gem study…');
const controlRows=Object.fromEntries(groups.map(g=>[g.id,Object.fromEntries(controls.map(p=>[p.id,{group:g.id,groupName:g.name,profile:p.id,profileName:p.name,...stats()}]))]));
let controlCase=0;
for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++)for(let repeat=0;repeat<10;repeat++){
  const teams=[draw(groups[a]),draw(groups[b])],matchSeed=next(),caseId=controlCase++;
  for(let focal=0;focal<2;focal++)for(const profile of controls){
    const lineups=teams.map((team,side)=>loadout(team,uniform(side===focal?profile.id:balanced)));
    for(const m of pair(...lineups,'controlled',matchSeed,{caseId,focal,profile:profile.id}))add(controlRows[groupOf(teams[focal])][profile.id],m,focal);
  }
}
const controlResults=Object.values(controlRows).flatMap(g=>Object.values(g).map(finish));
assert(controlResults.every(r=>r.games===180));
assert.equal(records.length,19800);
console.log('Controlled matches:',records.length);

// Independent per-hero recipes: role groups have equal opponent schedules.
// Exactly 900 lineup draws per group, cycling through shuffled complete decks;
// each group receives 1,800 scored appearances after side reversal.
console.log('Independent gem builds on all 1,140 trios…');
for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++)for(let repeat=0;repeat<100;repeat++){
  const left=loadout(draw(groups[a]),Array.from({length:3},()=>pick(profiles.length)));
  const right=loadout(draw(groups[b]),Array.from({length:3},()=>pick(profiles.length)));
  pair(left,right,'mixed');
}
const mixed=records.filter(m=>m.phase==='mixed'),mixedRanking=groupRanking('mixed');
assert(mixedRanking.every(g=>g.games===1800));
assert.equal(mixed.length,9000);
const covered=new Set(mixed.flatMap(m=>m.loadouts.map(l=>teamKey(l.team))));
assert.equal(covered.size,1140,'Every active hero trio must be covered');

// Training tables select trio candidates and per-hero profiles, with shrinkage
// and a minimum sample for recipes; all selections receive fresh validation.
const trioRows={},heroRecipes={};
for(const m of mixed)for(let side=0;side<2;side++){
  const group=m.groups[side],l=m.loadouts[side],key=teamKey(l.team);
  const row=trioRows[key]??={key,group,team:l.team,name:teamName(l.team),...stats()};add(row,m,side);
  for(const hero of l.team){
    const recipe=profiles.find(p=>p.slots.join(',')===l.gems[hero].join(',')).id;
    const k=`${group}/${hero}/${recipe}`;const hr=heroRecipes[k]??={games:0,wins:0};hr.games++;hr.wins+=Number(m.winner===side);
  }
}
const trainingTrios=Object.values(trioRows).map(r=>({...finish(r),wilson: wilson(r)}));
const candidateTeams=groups.flatMap(g=>trainingTrios.filter(r=>r.group===g.id).sort((a,b)=>b.wilson-a.wilson||b.games-a.games||a.key.localeCompare(b.key)).slice(0,3));
const topUniform=Object.fromEntries(groups.map(g=>[g.id,controlResults.filter(r=>r.group===g.id&&r.profile!==noGems.id).sort(descending)[0].profile]));
const recipeForHero=(group,hero)=>profiles.map(p=>{
  const sample=heroRecipes[`${group}/${hero}/${p.id}`]||{games:0,wins:0};
  return {profile:p.id,...sample,score:sample.games>=8?(sample.wins+5)/(sample.games+10):-1};
}).sort((a,b)=>b.score-a.score||b.games-a.games||a.profile-b.profile)[0].profile;
const candidates=[];
for(const row of candidateTeams){
  const plans=[['balanced',uniform(balanced)],['attack',uniform(fullAttack)],['health',uniform(fullHp)],['energy',uniform(fullEnergy)],['group-best',uniform(topUniform[row.group])],['hero-specific',row.team.map(hero=>recipeForHero(row.group,hero))]];
  const used=new Set();
  for(const [strategy,recipe] of plans){const id=recipe.join(',');if(used.has(id))continue;used.add(id);candidates.push({id:candidates.length,group:row.group,team:row.team,name:row.name,strategy,recipe,loadout:loadout(row.team,recipe),...stats()});}
}
console.log('Fresh candidate builds:',candidates.length);
// Two new shared opponent teams/builds from each of nine opposing role groups.
const candidateOpponents={};
for(const group of groups)candidateOpponents[group.id]=groups.filter(g=>g.id!==group.id).flatMap(foe=>Array.from({length:2},()=>({loadout:loadout(draw(foe),Array.from({length:3},()=>pick(profiles.length))),seed:next()})));
for(const candidate of candidates)for(const opponent of candidateOpponents[candidate.group])for(const m of pair(candidate.loadout,opponent.loadout,'selection',opponent.seed,{candidate:candidate.id}))add(candidate,m,0);
const candidateResults=candidates.map(finish);
assert(candidateResults.every(c=>c.games===36));
const selected=groups.map(g=>candidateResults.filter(c=>c.group===g.id).sort((a,b)=>b.winRate-a.winRate||a.id-b.id)[0]);

// One selected build per role group, all against all, 20 new seed pairs per
// opponent. Each group receives 360 appearances and identical role coverage.
console.log('Final optimized role round robin…');
for(let a=0;a<selected.length;a++)for(let b=a+1;b<selected.length;b++)for(let repeat=0;repeat<20;repeat++)pair(selected[a].loadout,selected[b].loadout,'final',next(),{candidates:[selected[a].id,selected[b].id]});
const finals=groupRanking('final');
assert(finals.every(g=>g.games===360));
assert.equal(records.filter(m=>m.phase==='final').length,1800);
assert.equal(records.length,19800+9000+candidates.length*36+1800);

// Bootstrap full reversed pairs, preserving the fixed opponent schedule.
function intervals(phase,resamples=2000){
  const phasePairs=new Map();
  for(const m of records.filter(r=>r.phase===phase)){const arr=phasePairs.get(m.pairId)||[];arr.push(m);phasePairs.set(m.pairId,arr);}
  const matchups=new Map();
  for(const rows of phasePairs.values()){assert.equal(rows.length,2);const k=rows[0].groups.join('/');const arr=matchups.get(k)||[];arr.push(rows);matchups.set(k,arr);}
  const tables=Object.fromEntries(groups.map(g=>[g.id,[]]));
  let bootstrapSeed=seed^0x9e3779b9;
  const sample=n=>{bootstrapSeed=(Math.imul(bootstrapSeed,1664525)+1013904223)>>>0;return Math.floor(bootstrapSeed/4294967296*n);};
  for(let i=0;i<resamples;i++){
    const wins=Object.fromEntries(groups.map(g=>[g.id,0]));const games={...wins};
    for(const pool of matchups.values())for(let j=0;j<pool.length;j++)for(const m of pool[sample(pool.length)])for(let side=0;side<2;side++){const id=m.groups[side];games[id]++;wins[id]+=Number(m.winner===side);}
    for(const g of groups)tables[g.id].push(100*wins[g.id]/games[g.id]);
  }
  return Object.fromEntries(groups.map(g=>{const samples=tables[g.id].sort((a,b)=>a-b);return [g.id,{lower:samples[Math.floor(resamples*.025)],upper:samples[Math.floor(resamples*.975)]}];}));
}
console.log('Resampling paired matches…');
const mixedCI=intervals('mixed'),finalCI=intervals('final');
for(const row of mixedRanking)row.ci95=mixedCI[row.id];
for(const row of finals)row.ci95=finalCI[row.id];
const matrix=groups.map(g=>({id:g.id,name:g.name,opponents:groups.filter(foe=>foe.id!==g.id).map(foe=>{
  const rows=records.filter(m=>m.phase==='final'&&m.groups.includes(g.id)&&m.groups.includes(foe.id));
  return {id:foe.id,name:foe.name,games:rows.length,wins:rows.filter(m=>m.groups[m.winner]===g.id).length};
})}));

// Reconstruct saved action sequences across every phase from persisted inputs.
for(const sample of samples){
  const state=createPvpBattle(sample.loadouts,sample.seed);
  for(const {actor,...command} of sample.commands){assert.equal(currentUnit(state).id,actor);assert.deepEqual(chooseAI(state),command);act(state,command.actionId,command.targetId);}
  assert.equal(digest(state),sample.finalDigest);assert.equal(state.winner,sample.winner);
}
const phases=['controlled','mixed','selection','final'].map(phase=>{
  const rows=records.filter(r=>r.phase===phase);return {phase,matches:rows.length,actions:rows.reduce((n,m)=>n+m.actions,0),side0Wins:rows.filter(m=>m.side0Won).length,meanRounds:rows.reduce((n,m)=>n+m.rounds,0)/rows.length};
});
const output=resolve(values.output);await mkdir(output,{recursive:true});
const report={schemaVersion:1,source:'simulation',seed,createdAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),build:BUILD,rulesVersion:RULES.rulesVersion,pvpVersion:PVP.version,total:records.length,actions:totalActions,pairs:pairId,profiles:controls,groups:groups.map(({teams,...g})=>({...g,possibleTrios:teams.length})),phases,controlResults,mixedRanking,candidateResults,selected,finals,matrix,replaySamples:samples.length,coveredTrios:covered.size,method:'Controlled own-team gem profiles versus fixed balanced opponents; independently randomized per-hero recipes with equal role schedules; fresh gem/trio selection; all ten selected role builds in an independent reversed-side round robin. Same-role opponents excluded from aggregate role ranking. Fixed tank/support/damage alphabetical formation. Current AI on both sides. Stratified 2,000-sample bootstrap of complete reversed pairs.',limits:'Role groups are equally weighted, not weighted by the number of available hero trios. All 1,140 hero combinations appear in mixed play, but all 1,000 gem allocations per trio are not exhaustively tested. Gem effects in the controlled stage apply to uniform recipes on all three heroes versus fixed balanced opponents; they are not a global optimum for every hero. Selected builds are sample winners among tested candidates. Bootstrap is conditional on sampled lineups and finalists. AI behavior can differ from human PvP. Simulation writes no production player logs.'};
await writeFile(resolve(output,'summary.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(resolve(output,'matches.ndjson.gz'),gzipSync(records.map(r=>JSON.stringify({build:BUILD,...r})).join('\n')+'\n',{level:9}));
await writeFile(resolve(output,'replay-samples.ndjson.gz'),gzipSync(samples.map(r=>JSON.stringify({build:BUILD,...r})).join('\n')+'\n',{level:9}));
await writeFile(resolve(output,'roles.csv'),'role_group,games,wins,win_rate_pct,ci95_low,ci95_high,mean_rounds,mean_ultimates\n'+mixedRanking.map(r=>[r.name,r.games,r.wins,r.winRate.toFixed(3),r.ci95.lower.toFixed(3),r.ci95.upper.toFixed(3),r.meanRounds.toFixed(3),r.meanUltimates.toFixed(3)].join(',')).join('\n')+'\n');
await writeFile(resolve(output,'gems.csv'),'role_group,gem_recipe,games,wins,win_rate_pct,mean_ultimates\n'+controlResults.map(r=>[r.groupName,r.profileName,r.games,r.wins,r.winRate.toFixed(3),r.meanUltimates.toFixed(3)].join(',')).join('\n')+'\n');
console.log(JSON.stringify({total:report.total,actions:totalActions,phases,mixedRanking,finals,selected:selected.map(s=>({group:s.group,name:s.name,recipe:s.recipe.map(id=>controls[id].name),strategy:s.strategy,selectionWins:s.wins,selectionGames:s.games})),replaySamples:samples.length,output},null,2));
