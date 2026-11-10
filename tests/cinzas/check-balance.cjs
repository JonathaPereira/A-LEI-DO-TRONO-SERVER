'use strict';
const fs = require('node:fs');
const { Engine, CARDS, CHAPTERS, WEAPONS } = require('../../public/roguelite/core.js');
const { WEAPON_VARIANTS } = require('../../public/roguelite/levels.js');
const variants = process.argv.includes('--variants');
const seeds = ['duelo-1', 'duelo-2', 'duelo-3'];
const seconds = 150;

function duel(seed, stage, weapon, policy) {
  const engine = new Engine();
  const variant = variants
    ? Object.keys(WEAPON_VARIANTS).find((id) => WEAPON_VARIANTS[id].weapon === weapon)
    : '';
  engine.start({ seed, legacyVariant: variant });
  const player = engine.player;
  player.weapon = weapon;
  // Representative pre-boss builds. This fixture skips earlier chapters and
  // equips a repeatable selection of their existing cards.
  const build = ['vitality', 'armor', 'power', 'haste'];
  for (let pass = 0; pass <= CHAPTERS[stage].biome; pass++) {
    for (const id of build) {
      const card = CARDS.find((candidate) => candidate.id === id);
      if ((engine.owned[id] || 0) >= card.max) continue;
      card.apply(player);
      engine.owned[id] = (engine.owned[id] || 0) + 1;
    }
  }
  player.hp = player.maxHp;
  engine.stage = stage;
  engine.loadStage();
  const boss = engine.enemies[0];
  const ranged = ['bow', 'staff'].includes(weapon);
  const reach = WEAPONS[weapon].range * (ranged ? 0.62 : 0.76);
  for (
    let frame = 0;
    frame < seconds * 60 && engine.status === 'running' && !engine.cleared;
    frame++
  ) {
    const distance = boss.x + boss.w / 2 - player.x - player.w / 2;
    const inRange = Math.abs(distance) < reach;
    const threat = boss.action === 'windup' && boss.actionTime < 0.2 && Math.abs(distance) < 210;
    const retreat = policy === 'space' && ranged && Math.abs(distance) < reach * 0.55;
    const away = -Math.sign(distance);
    const retreatPossible = away < 0 ? player.x > 180 : player.x < engine.width - 180;
    const move = retreat && retreatPossible ? away : inRange && !threat ? 0 : Math.sign(distance);
    const danger = engine.hazards.some((hazard) => Math.abs(hazard.x - player.x) < 75);
    const face = Math.sign(distance) === player.dir;
    engine.update(1 / 60, {
      left: move < 0,
      right: move > 0,
      attack: face && inRange && move === 0,
      skill: face && Math.abs(distance) < reach * 1.5 && !threat,
      dash: threat && player.dashCd <= 0,
      jump: danger && player.ground,
    });
  }
  return {
    seed,
    policy,
    region: CHAPTERS[stage].biome + 1,
    stage: stage + 1,
    weapon,
    variant,
    won: engine.cleared,
    seconds: Math.round(engine.time * 10) / 10,
    playerHp: Math.ceil(player.hp),
    bossHp: Math.ceil(Math.max(0, boss.hp)),
  };
}

const bosses = CHAPTERS.flatMap((chapter, index) => (chapter.boss ? [index] : []));
const rows = bosses.flatMap((stage) =>
  Object.keys(WEAPONS).flatMap((weapon) =>
    seeds.flatMap((seed) => ['close', 'space'].map((policy) => duel(seed, stage, weapon, policy))),
  ),
);
const output = process.argv[2];
if (output) fs.writeFileSync(output, JSON.stringify(rows, null, 2) + '\n');
console.table(
  bosses.flatMap((stage, index) =>
    ['close', 'space'].map((policy) => {
      const encounters = rows.filter((row) => row.stage === stage + 1 && row.policy === policy);
      return {
        region: index + 1,
        policy,
        cases: encounters.length,
        victories: encounters.filter((row) => row.won).length,
      };
    }),
  ),
);
if (rows.some((row) => !Number.isFinite(row.playerHp) || !Number.isFinite(row.bossHp)))
  process.exitCode = 1;
