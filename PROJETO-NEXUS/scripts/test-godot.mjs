import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { HEROES, ARCHIVED_HEROES, CLASS_BY_ID, DEFAULT_TEAMS, GUARD } from "../src/data.js";
import { createBattle, chooseAI, act, currentUnit, preview, getAction } from "../src/engine.js";
import RULES from "../src/balance.json" with {type: "json"};

const root = fileURLToPath(new URL("../", import.meta.url));
assert.deepEqual(JSON.parse(await readFile(resolve(root, "godot/data/combat-rules.json"), "utf8")), RULES,
  "Shared formula parameters are current; run npm run sync:godot after editing src/balance.json");
assert.deepEqual(JSON.parse(await readFile(resolve(root, "godot/data/catalog.json"), "utf8")), {
  schemaVersion: 1, heroes: HEROES, archivedHeroes: ARCHIVED_HEROES, classes: Object.values(CLASS_BY_ID), defaultTeams: DEFAULT_TEAMS, guard: GUARD,
}, "Shared catalog is current; run npm run sync:godot after editing src/data.js");
await mkdir(resolve(root, "artifacts"), { recursive: true });
const scratch = await mkdtemp(resolve(root, "artifacts/godot-test-"));
const fixtures = [];
function scenario(name, teams, difficulty, seed, patch = {}, defensive = false) {
  const state = createBattle(...teams, { difficulty, seed });
  const initial = structuredClone(state);
  for (const unit of state.units) Object.assign(unit, structuredClone(patch[unit.id] || {}));
  const commands = [];
  while (state.phase === "playing" && state.turns < 400) {
    const choice = chooseAI(state);
    const action = getAction(currentUnit(state), choice.actionId);
    const forceGuard = defensive === true || (defensive === 'healers' && !/^(heal|shield|support)/.test(action.kind) && action.secondary?.kind !== 'heal');
    const command = forceGuard ? { actionId: "guard", targetId: currentUnit(state).id } : choice;
    const prediction = commands.length === 0 ? preview(state, command.actionId, command.targetId) : null;
    const result = act(state, command.actionId, command.targetId);
    commands.push({ ...command, choice, result, prediction });
  }
  assert.equal(state.phase, "finished", name);
  fixtures.push({ name, teams, difficulty, seed, patch, initial, commands, final: state });
}
for (let group = 0; group < Object.keys(CLASS_BY_ID).length; group++) {
  const teams = [0,1].map(offset => HEROES.filter(h=>h.classId===Object.keys(CLASS_BY_ID)[(group+offset)%Object.keys(CLASS_BY_ID).length]).slice(0,3).map(h=>h.id));
  for (const [index,difficulty] of ['easy','normal','hard'].entries())
    scenario(`class-${group}-${difficulty}`,teams,difficulty,73+group*139+index*113);
}
scenario('cleanse-and-energy', [['vektor','sylva','saira'],['rhazen','vesper','axion']], 'normal',391, {
 '0-sylva':{hp:500,statuses:['burn','regen','expose','weaken','fortify'].map(type=>({type,turns:2}))},
 '0-vektor':{energy:100}
});
scenario('all-status-combos-and-shields', DEFAULT_TEAMS, 'normal',1972, Object.fromEntries(
 DEFAULT_TEAMS.flatMap((team,side)=>team.map(id=>[`${side}-${id}`,{energy:100,shield:250,shieldTurns:2,statuses:['burn','bleed','expose','seed','focus','empower','fortify','mirror','riposte','emberguard'].map(type=>({type,turns:2}))}]))
));
scenario('cover-guardian', DEFAULT_TEAMS, 'normal',127, {'1-kira':{statuses:[{type:'cover',owner:'1-oren',turns:2}]}});
scenario('fracture-stalemate',DEFAULT_TEAMS,'normal',73,{},true);
for (const [index,foe] of [['saira','maura','sylva'],['nima','riven','kira'],['vesper','oren','elun']].entries())
  scenario(`reported-healers-${index}`, [['saira','maura','sylva'],foe], 'normal',229+index*173,{},index===0?'healers':false);
scenario('bleeding-heals-and-cleanses', [['saira','maura','sylva'],['nima','riven','kira']], 'normal',331, Object.fromEntries(
 ['saira','maura','sylva'].map(id=>[`0-${id}`,{hp:400,energy:100,statuses:['bleed','regen'].map(type=>({type,turns:2}))}])
));
for (const [i,id] of ['torv','brin','bast','ivo','noct','auren','elyra','solen','zaya'].entries()) {
  scenario(`returned-${id}`,[[id,'sylva','axion'],['nima','maura','elun']],'normal',799+i*131,{
    [`0-${id}`]:{energy:100}, '1-nima':{statuses:[{type:'darkmark',owner:`0-${id}`,turns:2},{type:'bleed',turns:1}]}
  });
}
scenario('spread-and-finite-protection',[['ivo','maura','bast'],['noct','torv','brin']],'normal',503,{
 '0-ivo':{energy:40},'1-noct':{statuses:[{type:'darkmark',turns:1,owner:'0-maura'}]},
 '0-maura':{hp:200,statuses:[{type:'cover',turns:2,owner:'0-bast'},{type:'sentinel',turns:2},{type:'elementalWard',turns:2}]},
 '0-bast':{hp:1,shield:0}
});
const fixturePath = resolve(scratch, "cases.json");
const outputPath = resolve(scratch, "results.json");
await writeFile(fixturePath, JSON.stringify(fixtures));
const env = { ...process.env,
  XDG_DATA_HOME: resolve(scratch, "data"), XDG_CONFIG_HOME: resolve(scratch, "config"),
  XDG_CACHE_HOME: resolve(scratch, "cache"),
};
const executable = process.env.GODOT_EXECUTABLE || "godot";
function run(args, timeout = 240000, commandEnv = env) {
  const result = spawnSync(executable, args, { cwd: root, env: commandEnv, encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
  const log = (result.stdout || "") + (result.stderr || "");
  if (result.error || result.status !== 0 || /SCRIPT ERROR|Parse Error|ERROR:/i.test(log))
    throw Error(`Godot validation failed: ${result.error?.message || result.status}\n${log}`);
  return log;
}
console.log("Importando o projeto com Godot…");
run(["--headless", "--path", "godot", "--editor", "--import", "--quit"]);
for (const suite of ["mission_field", "mission_waves", "escort", "lumi", "ability_training", "mastery", "gem_forge", "equipment", "mission_objectives", "mission_progress", "save_recovery", "damage_receipt", "progression", "polish_012", "polish_014", "polish_015", "two_d", "stage_3d", "vesper"]) {
  const suiteEnv={...env,XDG_DATA_HOME:resolve(scratch,suite,"data"),XDG_CONFIG_HOME:resolve(scratch,suite,"config"),XDG_CACHE_HOME:resolve(scratch,suite,"cache")};
  console.log(run(["--headless", "--audio-driver", "Dummy", "--path", "godot", "--script", `res://tests/${suite}.gd`],240000,suiteEnv).trim());
}
console.log("Executando paridade do motor e teste de interface…");
const log = run(["--headless", "--audio-driver", "Dummy", "--path", "godot", "--script", "res://tests/run.gd", "--", fixturePath, outputPath]);
const actual = JSON.parse(await readFile(outputPath, "utf8"));
assert.equal(actual.cases.length, fixtures.length);
for (const [i, fixture] of fixtures.entries()) {
  assert.deepEqual(actual.cases[i].initial, fixture.initial, `${fixture.name}: initial state`);
  assert.deepEqual(actual.cases[i].commands, fixture.commands.map(({ choice, result, prediction }) => ({ choice, result, prediction })), `${fixture.name}: AI and action results`);
  assert.deepEqual(actual.cases[i].final, fixture.final, `${fixture.name}: final state`);
}
assert(actual.uiChecks >= 20, "Meaningful native interface coverage");
let exportedMatches = 0, exportedActions = 0;
assert.equal(actual.exports.length, 4, "Two filters export JSON logs and CSV tables");
for (const path of actual.exports) {
  const contents = await readFile(path, "utf8");
  if (path.endsWith('.csv')) {
    const lines = contents.trim().split(/\r?\n/);
    assert.equal(lines.length, HEROES.length + 1, "CSV contains the header and all active heroes");
    assert(lines.every(line=>line.split(';').length===12), "CSV columns remain aligned");
    continue;
  }
  const report = JSON.parse(contents);
  assert.equal(report.rulesVersion, RULES.rulesVersion, 'Exports identify the current ruleset');
  assert.equal(report.fullLogMatches, report.matches.length);
  assert.equal(report.summaryMatches, report.historicalSummaries.length);
  assert.equal(report.heroSummary.length, HEROES.length);
  for (const match of report.matches) {
    const state = createBattle(...match.teams, {difficulty:match.difficulty, seed:match.seed});
    assert.deepEqual(state,match.initial,'Exported seed and teams reconstruct the initial battle');
    for (const step of match.steps) {
      assert.equal(step.round,state.round);
      assert.equal(step.actor,currentUnit(state).id);
      const result=act(state,step.actionId,step.targetId);
      assert.deepEqual(result.events,step.events,'Exported action receipts replay exactly');
      assert.deepEqual(result.turnEvents,step.turnEvents,'Exported periodic damage and healing replay exactly');
      assert.deepEqual(step.after,{round:state.round,phase:state.phase,winner:state.winner,random:state.random,nextActor:state.phase==='playing'?currentUnit(state).id:null,
        units:state.units.map(u=>({id:u.id,hp:u.hp,shield:u.shield,shieldTurns:u.shieldTurns,shieldLayers:u.shieldLayers,energy:u.energy,statuses:u.statuses,cooldowns:u.cooldowns}))});
      exportedActions++;
    }
    assert.equal(state.phase,'finished');
    assert.equal(state.winner,match.winner);
    assert.equal(state.turns,match.actions);
    assert.deepEqual(state.units.map(u=>({id:u.id,stats:u.stats})),match.finalStats);
    exportedMatches++;
  }
}
assert.equal(exportedMatches,282);
console.log(log.trim());
console.log(`✓ ${fixtures.length} partidas reproduzidas com resultados idênticos ao JavaScript (${fixtures.reduce((n, f) => n + f.commands.length, 0)} ações).`);
console.log(`✓ ${actual.checks} verificações nativas, incluindo ${actual.uiChecks} de interface: formação, persistência, IA, animação, partida completa e replay.`);
console.log(`✓ Logs exportados reproduzem ${exportedMatches} simulações completas (${exportedActions} ações); tabelas CSV e filtros conferidos.`);
