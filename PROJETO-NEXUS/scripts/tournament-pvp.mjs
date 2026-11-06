// Reproducible AI tournament; uses the authoritative PvP engine without servers,
// campaign bonuses or writes to the real PvP/campaign balance logs.
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

const {values}=parseArgs({options:{output:{type:'string',default:'artifacts/tournament-014'},seed:{type:'string',default:'20261021'},gems:{type:'string',default:'balanced'}}});
const initialSeed=Number(values.seed);
assert(Number.isInteger(initialSeed)&&initialSeed>=0&&initialSeed<=0xffffffff,'Use an unsigned 32-bit seed');
assert(['balanced','none'].includes(values.gems),'Gems: balanced or none');
assert.equal(HEROES.length,20,'The balanced discovery schedule requires 20 heroes');
assert.deepEqual(JSON.parse(await readFile(new URL('../godot/data/catalog.json',import.meta.url),'utf8')),{schemaVersion:1,heroes:HEROES,archivedHeroes:ARCHIVED_HEROES,classes:Object.values(CLASS_BY_ID),defaultTeams:DEFAULT_TEAMS,guard:GUARD});
assert.deepEqual(JSON.parse(await readFile(new URL('../godot/data/combat-rules.json',import.meta.url),'utf8')),RULES);
assert.deepEqual(JSON.parse(await readFile(new URL('../godot/data/pvp-rules.json',import.meta.url),'utf8')),PVP);
let rng=initialSeed;
const next=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng;};
const shuffle=items=>{const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(next()/4294967296*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
const roleOrder={Tanque:0,Suporte:1,Dano:2};
const formation=ids=>[...ids].sort((a,b)=>roleOrder[HERO_BY_ID[a].role]-roleOrder[HERO_BY_ID[b].role]||a.localeCompare(b));
const key=ids=>[...ids].sort().join('+');
const name=ids=>ids.map(id=>HERO_BY_ID[id].name).join(' + ');
const gems=values.gems==='balanced'?['ember','pulse','sap']:['','',''];
const loadout=team=>({team:formation(team),gems:Object.fromEntries(team.map(id=>[id,[...gems]]))});
const hash=state=>createHash('sha256').update(JSON.stringify(state)).digest('hex');
const matches=[],traces=[];
let pairIndex=0;
function playPair(teamA,teamB,phase,seed=next()){
  assert.notEqual(key(teamA),key(teamB),'No mirror compositions in ranking');
  const pairId=pairIndex++;
  const pair=[];
  for(let swap=0;swap<2;swap++){
    const loadouts=(swap?[teamB,teamA]:[teamA,teamB]).map(loadout);
    const state=createPvpBattle(loadouts,seed),commands=[];
    let firstKO=null;
    while(state.phase==='playing'&&state.turns<400){
      const command=chooseAI(state);
      assert(command,'Every live turn has a legal AI move');
      const actor=currentUnit(state);
      commands.push({actor:actor.id,...command});
      act(state,command.actionId,command.targetId);
      for(const u of state.units){
        assert(u.hp>=0&&u.hp<=u.maxHp&&u.energy>=0&&u.energy<=100);
        assert(u.shield>=0&&u.shield<=Math.round(u.maxHp*RULES.shield.maxHpRatio));
      }
      if(firstKO===null&&state.units.some(u=>u.hp===0))firstKO=state.round;
    }
    assert.equal(state.phase,'finished','An unfinished battle must not become a loss');
    assert([0,1].includes(state.winner));
    const row={id:matches.length+1,pairId,phase,seed,teams:loadouts.map(l=>l.team),winner:state.winner,rounds:state.round,actions:state.turns,firstKO,fracture:state.round>=RULES.fracture.startRound,remainingHp:state.units.filter(u=>u.side===state.winner).reduce((n,u)=>n+u.hp/u.maxHp,0)/3,units:state.units.map(u=>({heroId:u.heroId,side:u.side,hp:u.hp,maxHp:u.maxHp,...u.stats}))};
    matches.push(row);pair.push(row);
    traces.push({...row,loadouts,commands,finalDigest:hash(state)});
  }
  return pair;
}
function rankTeams(rows){
  const table=new Map();
  for(const m of rows)for(let side=0;side<2;side++){
    const id=key(m.teams[side]);
    const row=table.get(id)||{key:id,team:m.teams[side],name:name(m.teams[side]),games:0,wins:0,winningHp:0,rounds:0};
    row.games++;row.wins+=Number(side===m.winner);row.winningHp+=side===m.winner?m.remainingHp:0;row.rounds+=m.rounds;table.set(id,row);
  }
  return [...table.values()].map(r=>({...r,losses:r.games-r.wins,winRate:100*r.wins/r.games,meanRounds:r.rounds/r.games})).sort((a,b)=>b.winRate-a.winRate||b.winningHp/b.games-a.winningHp/a.games||a.key.localeCompare(b.key));
}
function rankHeroes(rows){
  const table=Object.fromEntries(HEROES.map(h=>[h.id,{id:h.id,name:h.name,class:CLASS_BY_ID[h.classId].name,role:h.role,games:0,wins:0,nonMirrorGames:0,nonMirrorWins:0,damage:0,healing:0,protected:0,shieldGranted:0}]));
  for(const m of rows)for(const u of m.units){
    const r=table[u.heroId];r.games++;r.wins+=Number(u.side===m.winner);
    if(!m.teams[1-u.side].includes(u.heroId)){r.nonMirrorGames++;r.nonMirrorWins+=Number(u.side===m.winner);}
    for(const stat of ['damage','healing','protected','shieldGranted'])r[stat]+=u[stat];
  }
  return Object.values(table).map(r=>({...r,losses:r.games-r.wins,winRate:100*r.wins/r.games,nonMirrorWinRate:100*r.nonMirrorWins/r.nonMirrorGames,meanDamage:r.damage/r.games,meanHealing:r.healing/r.games,meanProtection:r.protected/r.games})).sort((a,b)=>b.winRate-a.winRate||a.id.localeCompare(b.id));
}

// Cyclic relabelling partitions C(20,3)=1,140 teams into 57 disjoint orbits
// of 20 teams. Sampling 30 whole orbits gives precisely 180 appearances per
// hero after swapping sides, without requiring a tank/support/damage template.
const allTeams=[],orbits=new Map();
for(let a=0;a<20;a++)for(let b=a+1;b<20;b++)for(let c=b+1;c<20;c++){
  const indices=[a,b,c],team=indices.map(i=>HEROES[i].id);
  allTeams.push(formation(team));
  const orbit=Array.from({length:20},(_,shift)=>indices.map(i=>(i+shift)%20).sort((a,b)=>a-b).join(',')).sort()[0];
  const group=orbits.get(orbit)||[];group.push(team);orbits.set(orbit,group);
}
assert.equal(orbits.size,57);assert([...orbits.values()].every(g=>g.length===20));
const sample=shuffle(shuffle([...orbits.values()]).slice(0,30).flat());
for(let i=0;i<sample.length;i+=2)playPair(sample[i],sample[i+1],'exploration');
const exploration=matches.filter(m=>m.phase==='exploration');
const heroes=rankHeroes(exploration);
assert(heroes.every(h=>h.games===180),'Equal hero exposure is required');

// Ridge Bradley-Terry fit is only a shortlist aid. Actual reported win rates
// always come from played games, and finalists get fresh opponents/seeds.
const index=Object.fromEntries(HEROES.map((h,i)=>[h.id,i]));
const features=exploration.map(m=>{
  const x=Array(21).fill(0);x[20]=1;
  for(const id of m.teams[0])x[index[id]]++;
  for(const id of m.teams[1])x[index[id]]--;
  return {x,y:1-m.winner};
});
const weights=Array(21).fill(0),sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
for(let iteration=0;iteration<1600;iteration++){
  const gradient=weights.map(w=>-4*w);
  for(const {x,y} of features){const error=y-sigmoid(x.reduce((n,v,i)=>n+v*weights[i],0));for(let i=0;i<21;i++)gradient[i]+=x[i]*error;}
  for(let i=0;i<21;i++)weights[i]+=.25*gradient[i]/features.length;
}
const strength=team=>team.reduce((n,id)=>n+weights[index[id]],0);
const predicted=[...allTeams].sort((a,b)=>strength(b)-strength(a)||key(a).localeCompare(key(b)));
const empirical=rankTeams(exploration).map(r=>({...r,residual:exploration.filter(m=>m.teams.some(t=>key(t)===r.key)).reduce((n,m)=>{
  const side=m.teams.findIndex(t=>key(t)===r.key);
  return n+Number(m.winner===side)-sigmoid(strength(m.teams[side])-strength(m.teams[1-side])+(side===0?weights[20]:-weights[20]));
},0)/r.games})).sort((a,b)=>b.residual-a.residual||b.winningHp/b.games-a.winningHp/a.games||a.key.localeCompare(b.key));
const candidates=[],candidateKeys=new Set();
function add(team){if(!candidateKeys.has(key(team))){candidates.push(formation(team));candidateKeys.add(key(team));}}
predicted.slice(0,10).forEach(add);
for(const row of empirical){add(row.team);if(candidates.length===20)break;}
assert.equal(candidates.length,20);
const screenOpponents=shuffle(allTeams.filter(t=>!candidateKeys.has(key(t)))).slice(0,5);
const screenSeeds=screenOpponents.map(()=>next());
for(const candidate of candidates)for(const [i,opponent] of screenOpponents.entries())playPair(candidate,opponent,'screening',screenSeeds[i]);
const screening=rankTeams(matches.filter(m=>m.phase==='screening')).filter(r=>candidateKeys.has(r.key));
// Advance at least three, including every team tied with third place.
const finalists=screening.filter(r=>r.winRate>=screening[2].winRate).map(r=>r.team),finalKeys=new Set(finalists.map(key));
const used=new Set([...candidates,...screenOpponents].map(key));
const confirmOpponents=shuffle(allTeams.filter(t=>!used.has(key(t)))).slice(0,30);
const confirmSeeds=confirmOpponents.map(()=>next());
for(const candidate of finalists)for(const [i,opponent] of confirmOpponents.entries())playPair(candidate,opponent,'confirmation',confirmSeeds[i]);
const confirmation=rankTeams(matches.filter(m=>m.phase==='confirmation')).filter(r=>finalKeys.has(r.key));
// All confirmed finalists face each other: broad-opponent win rate alone
// can hide a team that loses consistently to its strongest competitors.
const directFinalists=confirmation;
for(let a=0;a<directFinalists.length;a++)for(let b=a+1;b<directFinalists.length;b++)for(let i=0;i<10;i++)playPair(directFinalists[a].team,directFinalists[b].team,'head-to-head');
assert.equal(matches.length,800+60*finalists.length+10*directFinalists.length*(directFinalists.length-1));
const headToHead=rankTeams(matches.filter(m=>m.phase==='head-to-head'));
const winner=confirmation.find(r=>r.key===headToHead[0].key);

// Independently reconstruct saved commands for samples from every phase.
const replayIds=[0,1,149,598,599,600,799,800,800+60*finalists.length-1,800+60*finalists.length,matches.length-1];
for(const i of replayIds){
  const replay=traces[i],s=createPvpBattle(replay.loadouts,replay.seed);
  for(const {actor,...command} of replay.commands){assert.equal(currentUnit(s).id,actor);assert.deepEqual(chooseAI(s),command);act(s,command.actionId,command.targetId);}
  assert.equal(hash(s),replay.finalDigest);assert.equal(s.winner,replay.winner);
}
const output=resolve(values.output);await mkdir(output,{recursive:true});
const phases=['exploration','screening','confirmation','head-to-head'].map(phase=>{
  const rows=matches.filter(m=>m.phase===phase);
  return {phase,matches:rows.length,side0Wins:rows.filter(m=>m.winner===0).length,meanRounds:rows.reduce((n,m)=>n+m.rounds,0)/rows.length,meanActions:rows.reduce((n,m)=>n+m.actions,0)/rows.length,fractureMatches:rows.filter(m=>m.fracture).length};
});
const roleGroups=new Map();
for(const m of exploration)for(let side=0;side<2;side++){
  const counts={Dano:0,Tanque:0,Suporte:0};m.teams[side].forEach(id=>counts[HERO_BY_ID[id].role]++);
  const id=`${counts.Dano} Dano / ${counts.Tanque} Tanque / ${counts.Suporte} Suporte`;
  const row=roleGroups.get(id)||{composition:id,...counts,games:0,wins:0};
  row.games++;row.wins+=Number(side===m.winner);roleGroups.set(id,row);
}
const roleCompositions=[...roleGroups.values()].map(r=>({...r,winRate:100*r.wins/r.games})).sort((a,b)=>b.winRate-a.winRate);
const headToHeadMatrix=headToHead.map(team=>({team:team.key,opponents:headToHead.filter(r=>r.key!==team.key).map(opponent=>{
  const rows=matches.filter(m=>m.phase==='head-to-head'&&m.teams.some(t=>key(t)===team.key)&&m.teams.some(t=>key(t)===opponent.key));
  return {opponent:opponent.key,games:rows.length,wins:rows.filter(m=>key(m.teams[m.winner])===team.key).length};
})}));
const report={
  schemaVersion:1,source:'simulation',createdAt:new Date().toISOString(),
  commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),build:BUILD,
  rulesVersion:RULES.rulesVersion,pvpVersion:PVP.version,seed:initialSeed,gems,
  total:matches.length,actions:matches.reduce((n,m)=>n+m.actions,0),
  possibleTrios:allTeams.length,exploredTrios:sample.length,
  heroSampleMatches:exploration.length,heroAppearancesEach:180,
  selection:`600 exploration matches; 20 candidates × 5 shared opponents × 2 sides; ${finalists.length} finalists × 30 fresh shared opponents × 2 sides; direct round robin for all ${directFinalists.length} finalists × 10 seed pairs per matchup. All screening cutoff ties advance. Dominant finalist means best win rate in this equal-schedule round robin; broad-opponent winner is reported separately.`,
  conditions:'PvP authoritative engine, current AI on both sides, normal stats, no campaign progression. Fixed formation: tanks, supports, damage; alphabetical within role. Repeated roles/classes allowed. Same seed and lineup for reversed sides. Hero ranking uses exploration only; simulated matches never enter production PvP logs.',
  limits:'Shortlist model only aids selection. Team leader is the best observed finalist, not a proof of a global optimum among all 1,140 trios or every gem/formation build. Hero win rate means team victories when picked, not 1v1 strength. Paired games share seeds and are correlated. AI decisions are not optimal human PvP play.',
  phases,heroes,roleCompositions,screening,confirmation,headToHead,headToHeadMatrix,
  candidates:candidates.map(team=>({team,name:name(team),source:predicted.slice(0,10).some(t=>key(t)===key(team))?'hero-rating':'observed-residual'})),
  screenOpponents,confirmOpponents,
  shortlistWeights:Object.fromEntries(HEROES.map((h,i)=>[h.id,weights[i]])),
  winner,broadOpponentWinner:confirmation[0],matches,
};
await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2)+'\n');
const {matches:omitMatches,...summary}=report;
await writeFile(resolve(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const transcript=traces.map(t=>JSON.stringify({build:BUILD,...t})).join('\n')+'\n';
await writeFile(resolve(output,'replays.ndjson.gz'),gzipSync(transcript,{level:9}));
await writeFile(resolve(output,'heroes.csv'),'hero,class,role,games,wins,losses,win_rate_pct,non_mirror_games,non_mirror_wins,non_mirror_win_rate_pct,mean_damage,mean_healing,mean_protection\n'+heroes.map(h=>[h.name,h.class,h.role,h.games,h.wins,h.losses,h.winRate.toFixed(2),h.nonMirrorGames,h.nonMirrorWins,h.nonMirrorWinRate.toFixed(2),h.meanDamage.toFixed(1),h.meanHealing.toFixed(1),h.meanProtection.toFixed(1)].join(',')).join('\n')+'\n');
await writeFile(resolve(output,'trios.csv'),'team,confirmation_games,confirmation_wins,confirmation_win_rate_pct,final_games,final_wins,final_win_rate_pct\n'+headToHead.map(h=>{
  const c=confirmation.find(r=>r.key===h.key);return [h.name,c.games,c.wins,c.winRate.toFixed(2),h.games,h.wins,h.winRate.toFixed(2)].join(',');
}).join('\n')+'\n');
console.log(JSON.stringify({total:report.total,actions:report.actions,build:BUILD,phases,winner,confirmation,headToHead,heroes:heroes.map(({name,role,games,wins,winRate,nonMirrorGames,nonMirrorWinRate})=>({name,role,games,wins,winRate,nonMirrorGames,nonMirrorWinRate})),replaysChecked:replayIds.length,output},null,2));
