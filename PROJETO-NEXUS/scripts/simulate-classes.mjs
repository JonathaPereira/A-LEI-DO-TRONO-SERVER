import { mkdir, writeFile } from 'node:fs/promises';
import {HEROES,HERO_BY_ID,CLASSES} from '../src/data.js';
import {createBattle,chooseAI,act} from '../src/engine.js';
import RULES from '../src/balance.json' with {type:'json'};
let rng=7112026;
const next=limit=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return Math.floor(rng/4294967296*limit);};
function trio(){
 const classes=[...CLASSES];const roles=['Tanque','Suporte','Dano'];
 return roles.map(role=>{const c=classes.splice(next(classes.length),1)[0];const pool=HEROES.filter(h=>h.classId===c.id&&h.role===role);return pool[next(pool.length)].id;});
}
const pairs=[];
for(let i=0;i<150;i++)pairs.push({teams:[trio(),trio()],seed:113+i*193,group:'mixed'});
const partners=[['sylva','axion'],['kira','vesper'],['astra','oren'],['maura','rhazen'],['vektor','nima'],['saira','riven']];
for(const [index,id] of ['torv','brin','bast','ivo','noct'].entries())for(const [p,allies] of partners.entries())for(let i=0;i<10;i++)pairs.push({teams:[[id,...allies],trio()],seed:1999+index*7109+p*193+i*131,group:'return-'+id});
const rows=Object.fromEntries(HEROES.map(h=>[h.id,{id:h.id,name:h.name,specialty:h.specialty,appearances:0,wins:0,damage:0,healing:0,protection:0}]));
const matches=[];
for(const pair of pairs)for(let side=0;side<2;side++){
 const teams=side?[pair.teams[1],pair.teams[0]]:pair.teams;
 const state=createBattle(...teams,{seed:pair.seed});
 while(state.phase==='playing'&&state.turns<400){const choice=chooseAI(state);act(state,choice.actionId,choice.targetId);}
 if(state.phase!=='finished')throw Error('Unfinished match');
 for(const u of state.units){if(u.hp<0||u.hp>u.maxHp||u.shield<0||u.shield>Math.round(u.maxHp*.25)||u.energy<0||u.energy>100)throw Error('Resource invariant');const r=rows[u.heroId];r.appearances++;r.wins+=Number(u.side===state.winner);r.damage+=u.stats.damage;r.healing+=u.stats.healing;r.protection+=u.stats.protected;}
 matches.push({teams,seed:pair.seed,group:pair.group,winner:state.winner,rounds:state.round,actions:state.turns,fracture:state.round>=RULES.fracture.startRound});
}
if(Object.values(rows).some(r=>r.appearances===0))throw Error('Sample must cover all active heroes');
const heroes=Object.values(rows).map(r=>({...r,winRatePct:Number((r.wins/r.appearances*100).toFixed(1)),damage:Math.round(r.damage/r.appearances),healing:Math.round(r.healing/r.appearances),protection:Math.round(r.protection/r.appearances)}));
const report={rulesVersion:RULES.rulesVersion,method:'IA × IA, 150 pares de trios mistos (tanque, suporte e dano de classes diferentes) e 300 pares dirigidos aos cinco retornos. Cada par usa a mesma semente com lados invertidos. Gemas desativadas. Taxas por aparição da equipe, dependentes de composição e IA; não medem duelos individuais nem PvP humano.',total:matches.length,meanRounds:Number((matches.reduce((n,m)=>n+m.rounds,0)/matches.length).toFixed(2)),fractureMatches:matches.filter(m=>m.fracture).length,heroes,matches};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/classes-0.11-balance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,meanRounds:report.meanRounds,fractureMatches:report.fractureMatches}));
console.table(heroes.map(({name,specialty,appearances,winRatePct,damage,healing,protection})=>({name,specialty,appearances,winRatePct,damage,healing,protection})));
