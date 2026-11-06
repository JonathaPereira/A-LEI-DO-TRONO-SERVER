import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {act,RULES} from '../src/engine.js';
import {createPvpBattle,BUILD,PVP} from '../server/pvp-loadout.mjs';
const path=process.argv[2];if(!path)throw Error('Uso: node scripts/replay-pvp.mjs CAMINHO-DO-REGISTRO.json');
const record=JSON.parse(await readFile(path,'utf8'));
assert.equal(record.mode,'pvp');assert.equal(record.schemaVersion,1);assert.equal(record.rulesVersion,RULES.rulesVersion);assert.equal(record.pvpVersion,PVP.version);assert.equal(record.build,BUILD,'Use a revisão do jogo indicada pelo registro.');
const state=createPvpBattle(record.loadouts,record.seed);assert.deepEqual(state,record.initial);
for(const step of record.steps){const result=act(state,step.actionId,step.targetId);assert.deepEqual(result,step.result,'Eventos divergentes na ação '+step.seq);const after=structuredClone(state);delete after.log;assert.deepEqual(after,step.after,'Estado divergente na ação '+step.seq);}
if(record.reason!=='combat'){state.phase='finished';state.winner=record.winner;}
assert.deepEqual(state,record.finalState);console.log(`✓ PvP ${record.id}: ${record.steps.length} ações reproduzidas; gemas, eventos e resultado conferidos (${record.reason}).`);
