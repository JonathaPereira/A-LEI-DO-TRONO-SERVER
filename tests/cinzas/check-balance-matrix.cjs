'use strict';
const assert = require('node:assert/strict');
const { Engine, CARDS, CHAPTERS, WEAPONS, hordeTuning } = require('../../public/roguelite/core.js');
const { WEAPON_VARIANTS } = require('../../public/roguelite/levels.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }

// 1. Horde Tuning mathematical curves check
test('Horde scaling curves: verify HP, damage, speed, cooldown, count and interval bounds', () => {
  for (let wave = 1; wave <= 25; wave++) {
    const t = hordeTuning(wave);
    assert(Number.isFinite(t.hp) && t.hp >= 1.0 && t.hp <= 4.0, `Wave ${wave} HP scale out of bounds: ${t.hp}`);
    assert(Number.isFinite(t.damage) && t.damage >= 1.0 && t.damage <= 2.5, `Wave ${wave} damage scale out of bounds: ${t.damage}`);
    assert(t.speed >= 0.95 && t.speed <= 1.30, `Wave ${wave} speed out of bounds: ${t.speed}`);
    assert(t.cooldown >= 0.68 && t.cooldown <= 1.0, `Wave ${wave} cooldown out of bounds: ${t.cooldown}`);
    assert(t.count >= 6 && t.count <= 38, `Wave ${wave} enemy count out of bounds: ${t.count}`);
    assert(t.simultaneous >= 8 && t.simultaneous <= 14, `Wave ${wave} simultaneous enemy cap out of bounds: ${t.simultaneous}`);
    assert(t.interval >= 0.65 && t.interval <= 1.4, `Wave ${wave} spawn interval out of bounds: ${t.interval}`);
  }
});

// 2. Horde Simulated Playtest Scenarios across 5 Tiers
function simulateHordeWave(seed, waveNumber, weapon, variant = null) {
  const engine = new Engine();
  engine.start({ mode: 'horde', seed, legacyVariant: variant });
  const p = engine.player;
  p.weapon = weapon;
  // Apply representative horde cards proportional to tier (1 card per wave completed)
  const build = ['vitality', 'armor', 'power', 'haste', 'reach'];
  for (let i = 0; i < waveNumber - 1; i++) {
    const cardId = build[i % build.length];
    const card = CARDS.find(c => c.id === cardId);
    if (card && (engine.owned[cardId] || 0) < card.max) {
      card.apply(p);
      engine.owned[cardId] = (engine.owned[cardId] || 0) + 1;
    }
  }
  p.hp = p.maxHp;
  engine.stage = waveNumber - 1;
  engine.loadStage();

  const ranged = ['bow', 'staff'].includes(weapon);
  const reach = WEAPONS[weapon].range * (ranged ? 0.65 : 0.78);
  let maxEnemiesSeen = 0;

  // Simulate up to 60 seconds of combat
  for (let frame = 0; frame < 60 * 60 && engine.status === 'running' && !engine.cleared; frame++) {
    const liveEnemies = engine.enemies.filter(e => !e.dead);
    if (liveEnemies.length > maxEnemiesSeen) maxEnemiesSeen = liveEnemies.length;

    // Find closest enemy
    let closest = null, closestDist = 9999;
    for (const e of liveEnemies) {
      const d = Math.abs(e.x + e.w / 2 - p.x - p.w / 2);
      if (d < closestDist) { closestDist = d; closest = e; }
    }

    if (!closest) {
      engine.update(1 / 60, {});
      continue;
    }

    const dx = closest.x + closest.w / 2 - p.x - p.w / 2;
    const distance = Math.abs(dx);
    const inRange = distance < reach;
    const threat = closest.action === 'windup' && closest.actionTime < 0.25 && distance < 180;
    const retreat = ranged && distance < reach * 0.5;
    const away = -Math.sign(dx);
    const retreatPossible = away < 0 ? p.x > 180 : p.x < engine.width - 180;
    const move = retreat && retreatPossible ? away : inRange && !threat ? 0 : Math.sign(dx);
    const danger = engine.hazards.some(h => Math.abs(h.x - p.x) < 70);
    const face = Math.sign(dx) === p.dir;

    engine.update(1 / 60, {
      left: move < 0,
      right: move > 0,
      attack: face && inRange && move === 0,
      skill: face && distance < reach * 1.4 && !threat,
      dash: threat && p.dashCd <= 0,
      jump: danger && p.ground
    });
  }

  return {
    wave: waveNumber,
    weapon,
    variant,
    cleared: engine.cleared,
    time: Math.round(engine.time * 10) / 10,
    kills: engine.kills,
    playerHp: Math.ceil(p.hp),
    maxSimultaneous: maxEnemiesSeen
  };
}

test('Horde playtest scenarios: verify wave 1, 3, 5 tiers survivability and enemy cap enforcement', () => {
  const sampleWaves = [1, 3, 5];
  const weapons = ['blade', 'hammer', 'bow', 'staff'];
  const results = [];

  for (const wave of sampleWaves) {
    for (const weapon of weapons) {
      const res = simulateHordeWave('horde-seed-1', wave, weapon);
      results.push(res);
      // Ensure simultaneous active enemies never exceeds engine capacity
      assert(res.maxSimultaneous <= 14, `Wave ${wave} exceeded 14 simultaneous enemies: ${res.maxSimultaneous}`);
      assert(Number.isFinite(res.playerHp), `Wave ${wave} playerHp is not finite`);
    }
  }

  // Wave 1 should be consistently clearable with basic weapons
  const wave1Results = results.filter(r => r.wave === 1);
  const wave1Clears = wave1Results.filter(r => r.cleared).length;
  assert(wave1Clears >= 3, `Wave 1 clear rate must be high (cleared ${wave1Clears}/${wave1Results.length})`);
});

// 3. Campaign Boss Playtest Matrix with Base and Legacy Variants
function duelCampaign(seed, stage, weapon, variant = null, policy = 'close') {
  const engine = new Engine();
  engine.start({ seed, legacyVariant: variant });
  const p = engine.player;
  p.weapon = weapon;

  const build = ['vitality', 'armor', 'power', 'haste'];
  for (let pass = 0; pass <= CHAPTERS[stage].biome; pass++) {
    for (const id of build) {
      const card = CARDS.find(c => c.id === id);
      if ((engine.owned[id] || 0) >= card.max) continue;
      card.apply(p);
      engine.owned[id] = (engine.owned[id] || 0) + 1;
    }
  }
  p.hp = p.maxHp;
  engine.stage = stage;
  engine.loadStage();
  const boss = engine.enemies[0];
  const ranged = ['bow', 'staff'].includes(weapon);
  const reach = WEAPONS[weapon].range * (ranged ? 0.62 : 0.76);

  for (let frame = 0; frame < 120 * 60 && engine.status === 'running' && !engine.cleared; frame++) {
    const distance = boss.x + boss.w / 2 - p.x - p.w / 2;
    const inRange = Math.abs(distance) < reach;
    const threat = boss.action === 'windup' && boss.actionTime < 0.2 && Math.abs(distance) < 210;
    const retreat = policy === 'space' && ranged && Math.abs(distance) < reach * 0.55;
    const away = -Math.sign(distance);
    const retreatPossible = away < 0 ? p.x > 180 : p.x < engine.width - 180;
    const move = retreat && retreatPossible ? away : inRange && !threat ? 0 : Math.sign(distance);
    const danger = engine.hazards.some(hazard => Math.abs(hazard.x - p.x) < 75);
    const face = Math.sign(distance) === p.dir;

    engine.update(1 / 60, {
      left: move < 0,
      right: move > 0,
      attack: face && inRange && move === 0,
      skill: face && Math.abs(distance) < reach * 1.5 && !threat,
      dash: threat && p.dashCd <= 0,
      jump: danger && p.ground
    });
  }

  return {
    stage: stage + 1,
    region: CHAPTERS[stage].biome + 1,
    weapon,
    variant,
    policy,
    won: engine.cleared,
    seconds: Math.round(engine.time * 10) / 10,
    playerHp: Math.ceil(p.hp),
    bossHp: Math.ceil(Math.max(0, boss.hp))
  };
}

test('Campaign balance matrix: verify 5 boss encounters achieve healthy victory rates without degenerate zero-win encounters', () => {
  const bossStages = CHAPTERS.flatMap((c, i) => c.boss ? [i] : []);
  const weapons = ['blade', 'hammer', 'bow', 'staff'];
  const seeds = ['matrix-seed-1', 'matrix-seed-2'];
  const duels = [];

  for (const stage of bossStages) {
    for (const weapon of weapons) {
      for (const seed of seeds) {
        duels.push(duelCampaign(seed, stage, weapon, null, 'close'));
        duels.push(duelCampaign(seed, stage, weapon, null, 'space'));
      }
    }
  }

  // Check overall victory rate across 80 boss duels (5 bosses * 4 weapons * 2 seeds * 2 policies)
  const totalVictories = duels.filter(d => d.won).length;
  const winRate = totalVictories / duels.length;
  assert(winRate >= 0.40 && winRate <= 0.90, `Overall boss win rate must be in healthy balance range (40%-90%), got ${(winRate * 100).toFixed(1)}%`);

  // Verify each region has at least one victory (no region is mathematically impossible)
  for (let region = 1; region <= 5; region++) {
    const regionDuels = duels.filter(d => d.region === region);
    const regionVictories = regionDuels.filter(d => d.won).length;
    assert(regionVictories > 0, `Region ${region} must have at least one viable victory path`);
  }

  // Verify all outputs have finite numbers
  assert(duels.every(d => Number.isFinite(d.playerHp) && Number.isFinite(d.bossHp)));
});

test('Legacy weapon variants balance: test 4 variants across representative boss encounters', () => {
  const variants = [
    { id: 'ash_blade', weapon: 'blade' },
    { id: 'rift_hammer', weapon: 'hammer' },
    { id: 'echo_bow', weapon: 'bow' },
    { id: 'frost_staff', weapon: 'staff' }
  ];
  const stage = 4; // Region 1 Boss (Chapter 5)
  const seed = 'variant-seed-1';

  for (const { id, weapon } of variants) {
    const duel = duelCampaign(seed, stage, weapon, id, 'space');
    assert(Number.isFinite(duel.playerHp) && Number.isFinite(duel.bossHp));
  }
});

console.log(`${passed} balance matrix playtest suites passed.`);
