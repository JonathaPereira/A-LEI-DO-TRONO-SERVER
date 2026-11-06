import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HEROES, HERO_BY_ID, DEFAULT_TEAMS } from '../src/data.js';
import { createBattle, RULES } from '../src/engine.js';
import PVP from '../src/pvp-rules.json' with {type:'json'};
export { PVP };
export const BUILD = createHash('sha256').update(JSON.stringify({protocol:1,engine:readFileSync(new URL('../src/engine.js',import.meta.url),'utf8'),heroes:HEROES,rules:RULES,pvp:PVP})).digest('hex');
export function defaultLoadout(side = 0) { return {team:[...DEFAULT_TEAMS[side]],gems:Object.fromEntries(DEFAULT_TEAMS[side].map(id=>[id,['','','']]))}; }
export function validateLoadout(input) {
  if (!input || !Array.isArray(input.team) || input.team.length!==3 || new Set(input.team).size!==3 || !input.team.every(id=>typeof id==='string' && Object.hasOwn(HERO_BY_ID,id))) throw Error('Escolha três heróis diferentes do elenco ativo.');
  if (!input.gems || typeof input.gems!=='object' || Array.isArray(input.gems) || Object.keys(input.gems).some(id=>!input.team.includes(id))) throw Error('Engastes inválidos.');
  return {team:[...input.team],gems:Object.fromEntries(input.team.map(id=>{
    const slots=input.gems[id] ?? ['','',''];
    if (!Array.isArray(slots) || slots.length!==PVP.slotCount || !slots.every(g=>g==='' || PVP.gems.some(item=>item.id===g))) throw Error('Cada herói tem três engastes; use somente as gemas disponíveis.');
    return [id,[...slots]];
  }))};
}
export function createPvpBattle(loadouts,seed) {
  const checked=loadouts.map(validateLoadout);
  const state=createBattle(checked[0].team,checked[1].team,{seed,difficulty:'normal'});
  for (const unit of state.units) {
    const slots=checked[unit.side].gems[unit.heroId];
    const bonus=stat=>slots.reduce((sum,id)=>sum+(PVP.gems.find(g=>g.id===id && g.stat===stat)?.bonus||0),0);
    unit.attack=Math.round(unit.attack*(1+bonus('attack')));
    unit.maxHp=Math.round(unit.maxHp*(1+bonus('maxHp'))); unit.hp=unit.maxHp;
    unit.energy=Math.min(RULES.energy.maximum,unit.energy+bonus('energy'));
  }
  return state;
}
