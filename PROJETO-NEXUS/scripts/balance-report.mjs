import {writeFile,mkdir} from 'node:fs/promises';
import {HEROES,CLASSES} from '../src/data.js';
const {createBattle,chooseAI,act,currentUnit,getAction} = await import(new URL(process.env.NEXUS_BALANCE_ENGINE || '../src/engine.js', import.meta.url));
export function sampleTeams(pair) {
  return [0,1].map(side=>['Tanque','Suporte','Dano'].map((role,index)=>{
    const group=Math.floor(pair/CLASSES.length),base=pair%CLASSES.length,offsets=[side*2,group+side,group*2+side*3];
    const c=CLASSES[(pair<CLASSES.length?base+side:base+offsets[index])%CLASSES.length].id;
    return HEROES.find(h=>h.classId===c&&h.role===role).id;
  }));
}
const cases=[];
for(let pair=0;pair<CLASSES.length*6;pair++){
 const teams=sampleTeams(pair);
 for(let swap=0;swap<2;swap++)cases.push({teams:[teams[swap],teams[1-swap]],seed:73+pair*113,group:'varied'});
}
const trio=['vesper','kira','oren'];
for(let pair=0;pair<15;pair++)for(let swap=0;swap<2;swap++){
 const foe=sampleTeams(pair)[0];cases.push({teams:swap?[foe,trio]:[trio,foe],seed:137+pair*139,group:'reported-trio',trioSide:swap});
}
const healers=['saira','maura','sylva'];
for(let pair=0;pair<15;pair++)for(let swap=0;swap<2;swap++) {
 const foe=sampleTeams(pair)[0];cases.push({teams:swap?[foe,healers]:[healers,foe],seed:229+pair*173,group:'reported-healers',trioSide:swap});
}
for(const role of ['Suporte','Tanque','Dano']) {
 const ids=HEROES.filter(h=>h.role===role).map(h=>h.id);
 for(let pair=0;pair<CLASSES.length;pair++)for(let swap=0;swap<2;swap++) {
  const foe=[0,1,3].map(i=>ids[(pair+i)%ids.length]);
  const team=role==='Tanque'?['vesper','oren','elun']:healers;
  cases.push({teams:swap?[foe,team]:[team,foe],seed:331+pair*181,group:role==='Tanque'?'tank-trios':'healers-vs-'+role});
 }
}
for(let seed=1;seed<=6;seed++)cases.push({teams:[healers,healers],seed:seed*197,group:'healing-only',defensive:true});
const returning=['torv','brin','bast','ivo','noct','auren','elyra','solen','zaya'];
const partners=[['sylva','axion'],['kira','vesper'],['astra','oren'],['maura','rhazen'],['vektor','nima'],['saira','riven']];
for(const [index,id] of returning.entries())for(const [pair,duo] of partners.entries())for(let swap=0;swap<2;swap++){
 const team=[id,...duo],foe=sampleTeams(index*6+pair)[0];
 cases.push({teams:swap?[foe,team]:[team,foe],seed:911+index*199+pair*131,group:'return-'+id});
}
const matches=cases.map(c=>{
 const s=createBattle(...c.teams,{seed:c.seed});let fracture=false,firstKO=null;
 while(s.phase==='playing'&&s.turns<400){
  let m=chooseAI(s);
  const action=getAction(currentUnit(s),m.actionId);
  if(c.defensive && !/^(heal|shield|support)/.test(action.kind) && action.secondary?.kind!=='heal')m={actionId:'guard',targetId:currentUnit(s).id};
  const r=act(s,m.actionId,m.targetId);
  fracture ||= r.turnEvents.some(e=>e.type==='fracture');
  if(firstKO===null&&s.units.some(u=>u.hp===0))firstKO=s.round;
 }

 return {...c,rounds:s.round,actions:s.turns,fracture,firstKO,winner:s.winner,units:s.units.map(u=>({id:u.heroId,won:u.side===s.winner,...u.stats}))};
});
const summary={};
for(const group of [...new Set(matches.map(m=>m.group))]){
 const rows=matches.filter(m=>m.group===group);
 summary[group]={matches:rows.length,unfinished:rows.filter(m=>m.winner===null).length,maxRounds:Math.max(...rows.map(m=>m.rounds)),meanRounds:rows.reduce((n,m)=>n+m.rounds,0)/rows.length,fracturePct:rows.filter(m=>m.fracture).length*100/rows.length,meanFirstKO:rows.reduce((n,m)=>n+m.firstKO,0)/rows.length};
 if(rows.every(m=>m.trioSide!==undefined))summary[group].trioWinPct=rows.filter(m=>m.winner===m.trioSide).length*100/rows.length;
}
await mkdir('artifacts',{recursive:true});
const path=process.argv[2]||'artifacts/balance-current.json';
await writeFile(path,JSON.stringify({summary,matches},null,2));
console.log(JSON.stringify(summary,null,2));
if(process.argv.includes('--check') && (matches.some(m=>m.winner===null) || summary['healing-only'].maxRounds>21))throw Error('Falha na regressão de sustentação: partida sem fim ou espelho de curas além da rodada 21.');
