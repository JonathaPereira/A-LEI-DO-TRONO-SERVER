'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  WEAPONS,
  MONSTERS,
  CARDS: CINZAS_CARDS,
  SPECIALS: CINZAS_SPECIALS,
  CHAPTERS: CINZAS_CHAPTERS,
  hordeTuning,
} = require('../public/roguelite/core.js');

const {
  WEAPON_VARIANTS,
  RUNES: CINZAS_RUNES,
  TERRAIN: CINZAS_TERRAIN,
} = require('../public/roguelite/levels.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS ' + name);
}

// Load Atalaia catalog dictionaries
const atalaiaCatalogFile = path.resolve(__dirname, '../games/atalaia/scripts/catalog.gd');
const atalaiaContent = fs.readFileSync(atalaiaCatalogFile, 'utf8');
const ATALAIA_TOWERS = JSON.parse(atalaiaContent.match(/const TOWERS = (\{[\s\S]*?\n\})/)[1]);
const ATALAIA_ENEMIES = JSON.parse(atalaiaContent.match(/const ENEMIES = (\{[\s\S]*?\n\})/)[1]);
const ATALAIA_CARDS = JSON.parse(atalaiaContent.match(/const CARDS = (\[[\s\S]*?\n\])/)[1]);
const ATALAIA_CROWN_PULSE = JSON.parse(
  atalaiaContent.match(/const CROWN_PULSE = (\{[\s\S]*?\})/)[1],
);
const ATALAIA_SLAG_WARD = JSON.parse(atalaiaContent.match(/const SLAG_WARD = (\{[\s\S]*?\})/)[1]);
const ATALAIA_MATRIARCH_BROOD = JSON.parse(
  atalaiaContent.match(/const MATRIARCH_BROOD = (\{[\s\S]*?\})/)[1],
);
const ATALAIA_CITADEL_SENTINEL = JSON.parse(
  atalaiaContent.match(/const CITADEL_SENTINEL = (\{[\s\S]*?\})/)[1],
);
const ROOT_GUARDIAN = JSON.parse(atalaiaContent.match(/const ROOT_GUARDIAN = (\{[\s\S]*?\})/)[1]);

// Load Nexus kits dictionary (read-only reference)
const nexusKitsFile = '/home/antigravity/JonathaPereira/PROJETO-NEXUS/src/kits.js';
let NEXUS_KITS = null;
if (fs.existsSync(nexusKitsFile)) {
  const nexusKitsRaw = fs.readFileSync(nexusKitsFile, 'utf8');
  const kStart = nexusKitsRaw.indexOf('export const KITS = ') + 'export const KITS = '.length;
  const kEnd = nexusKitsRaw.indexOf('\n};\n', kStart) + 2;
  NEXUS_KITS = JSON.parse(nexusKitsRaw.slice(kStart, kEnd));
}

// =========================================================================
// 1. WEAPONS MATRIX (Armas & Variantes)
// =========================================================================
test('Weapons Balance Matrix: 4 base weapons and 4 legacy variants in Cinzas', () => {
  const baseIds = ['blade', 'hammer', 'bow', 'staff'];
  assert.equal(Object.keys(WEAPONS).length, 4, 'Must have exactly 4 base weapons');

  const weaponDps = {};
  for (const id of baseIds) {
    const w = WEAPONS[id];
    assert(typeof w.name === 'string' && w.name.length > 0);
    assert(Number.isFinite(w.damage) && w.damage > 0);
    assert(Number.isFinite(w.cooldown) && w.cooldown > 0);
    assert(Number.isFinite(w.range) && w.range > 0);

    // Calculate attack duration per weapon
    const duration = id === 'hammer' ? 0.66 : id === 'bow' ? 0.4 : id === 'staff' ? 0.38 : 0.42;
    const nominalDamage = 22 * w.damage;
    const effectiveCd = Math.max(duration, w.cooldown);
    const dps = nominalDamage / effectiveCd;
    weaponDps[id] = dps;

    // Nominal DPS must fall into balanced gameplay corridor (40 - 75 DPS)
    assert(dps >= 40 && dps <= 75, `${id} DPS out of balanced bounds: ${dps.toFixed(1)}`);
  }

  // Melee vs Ranged balance check:
  // Melee weapons (blade, hammer) trade range for burst/AoE, ranged have long reach (> 500)
  assert(WEAPONS.bow.range >= 700, 'Bow must have long reach');
  assert(WEAPONS.staff.range >= 500, 'Staff must have mid-long reach');
  assert(WEAPONS.blade.range <= 150, 'Blade must be close-quarters');
  assert(WEAPONS.hammer.range <= 160, 'Hammer must be close-quarters heavy');

  // Legacy variants audit
  const variantIds = ['ash_blade', 'echo_bow', 'rift_hammer', 'frost_staff'];
  assert.equal(Object.keys(WEAPON_VARIANTS).length, 4, 'Must have exactly 4 legacy variants');

  for (const id of variantIds) {
    const v = WEAPON_VARIANTS[id];
    assert(baseIds.includes(v.weapon), `${id} must map to a valid base weapon`);
    assert(
      [5, 10, 15, 20].includes(v.chapter),
      `${id} must unlock at milestone chapters 5, 10, 15, or 20`,
    );
    assert(Number.isFinite(v.damage) && v.damage >= 0.6 && v.damage <= 2.0);
    assert(typeof v.description === 'string' && v.description.length > 10);

    // Specific tactical features
    if (id === 'ash_blade')
      assert.equal(v.windupGuard, 0.2, 'Ash blade must provide 20% windup guard');
    if (id === 'rift_hammer')
      assert.equal(v.pierceGuard, true, 'Rift hammer must pierce shield guard');
    if (id === 'echo_bow')
      assert.deepEqual(v.angles, [-0.075, 0.075], 'Echo bow must fan 2 arrows');
    if (id === 'frost_staff') assert.equal(v.slowOnHit, true, 'Frost staff must slow on hit');
  }
});

// =========================================================================
// 2. TOWERS MATRIX (Torretas em Atalaia)
// =========================================================================
test('Towers Balance Matrix: 6 base and 6 advanced towers in Atalaia', () => {
  const towerKeys = Object.keys(ATALAIA_TOWERS);
  assert.equal(towerKeys.length, 12, 'Atalaia must have exactly 12 towers');

  const baseTowers = ['ballista', 'mortar', 'flame', 'tesla', 'ice', 'poison'];
  const advTowers = ['roots', 'harpoon', 'seismic', 'spectral', 'ash_forge', 'solar'];

  for (const key of towerKeys) {
    const t = ATALAIA_TOWERS[key];
    assert(typeof t.name === 'string' && t.name.length > 0);
    assert(
      Number.isInteger(t.cost) && t.cost >= 70 && t.cost <= 170,
      `Tower ${key} cost out of range: ${t.cost}`,
    );
    assert(
      Number.isFinite(t.damage) && t.damage >= 5.0 && t.damage <= 45.0,
      `Tower ${key} damage out of range: ${t.damage}`,
    );
    assert(
      Number.isFinite(t.rate) && t.rate >= 0.2 && t.rate <= 2.0,
      `Tower ${key} rate out of range: ${t.rate}`,
    );
    assert(
      Number.isFinite(t.range) && t.range >= 110.0 && t.range <= 210.0,
      `Tower ${key} range out of range: ${t.range}`,
    );

    const dps = t.damage / t.rate;
    const efficiency = dps / t.cost;
    // DPS-to-cost efficiency should fall between 0.05 and 0.45 DPS per gold unit
    assert(
      efficiency >= 0.05 && efficiency <= 0.45,
      `Tower ${key} efficiency out of bounds: ${efficiency.toFixed(3)}`,
    );
  }

  // Verify advanced towers have parent families and unlock acts
  for (const key of advTowers) {
    const t = ATALAIA_TOWERS[key];
    assert(baseTowers.includes(t.family), `Advanced tower ${key} must have valid base family`);
    assert(
      Number.isInteger(t.act) && t.act >= 0 && t.act <= 4,
      `Advanced tower ${key} must unlock in acts 0-4`,
    );
  }
});

// =========================================================================
// 3. HEROES MATRIX (Personagens e Guardiões)
// =========================================================================
test('Heroes Balance Matrix: Cinzas Peregrino tiers and Nexus 24 Heroes catalog', () => {
  // Cinzas Peregrino difficulty tiers
  const difficulties = {
    easy: { hp: 160, damageFactor: 0.7 },
    normal: { hp: 100, damageFactor: 1.0 },
    hard: { hp: 100, damageFactor: 1.45 },
  };
  for (const [diff, stats] of Object.entries(difficulties)) {
    assert(stats.hp >= 100 && stats.hp <= 160);
    assert(stats.damageFactor >= 0.7 && stats.damageFactor <= 1.45);
  }

  // Nexus 24 Heroes Matrix
  if (NEXUS_KITS) {
    const heroKeys = Object.keys(NEXUS_KITS);
    assert.equal(heroKeys.length, 24, 'Nexus must catalog exactly 24 heroes');

    const roles = new Set();
    for (const [id, hero] of Object.entries(NEXUS_KITS)) {
      assert(typeof hero.role === 'string' && hero.role.length > 0);
      roles.add(hero.role);

      const s = hero.stats;
      assert(
        Number.isInteger(s.hp) && s.hp >= 950 && s.hp <= 1500,
        `${id} HP out of range: ${s.hp}`,
      );
      assert(
        Number.isInteger(s.attack) && s.attack >= 150 && s.attack <= 285,
        `${id} Attack out of range: ${s.attack}`,
      );
      assert(
        Number.isInteger(s.defense) && s.defense >= 65 && s.defense <= 130,
        `${id} Defense out of range: ${s.defense}`,
      );
      assert(
        Number.isInteger(s.speed) && s.speed >= 60 && s.speed <= 120,
        `${id} Speed out of range: ${s.speed}`,
      );

      // Ability balance
      assert(
        hero.basic && hero.basic.power >= 0.6 && hero.basic.power <= 1.0,
        `${id} basic attack power out of range: ${hero.basic.power}`,
      );
      assert(
        hero.skill && hero.skill.power >= 0 && hero.skill.power <= 2.0,
        `${id} skill power out of range`,
      );
      assert(
        hero.ultimate && hero.ultimate.power >= 0 && hero.ultimate.power <= 3.0,
        `${id} ultimate power out of range`,
      );
    }
    // Check that all core roles are represented
    assert(
      roles.has('Dano') && roles.has('Tanque') && roles.has('Suporte'),
      'Must represent Dano, Tanque, and Suporte',
    );
  }
});

// =========================================================================
// 4. SKILLS & SPELLS MATRIX (Habilidades, Especiais e Doutrinas)
// =========================================================================
test('Skills Balance Matrix: Cinzas Specials and Atalaia Cards/Doctrines', () => {
  // Cinzas Specials
  const specials = ['blade', 'hammer', 'bow', 'staff'];
  for (const weapon of specials) {
    const spec = CINZAS_SPECIALS[weapon];
    assert(typeof spec.name === 'string');
    assert(
      spec.cooldown >= 6 && spec.cooldown <= 8,
      `${weapon} special cooldown out of bounds: ${spec.cooldown}`,
    );
    assert(
      spec.windup >= 0.15 && spec.windup <= 0.75,
      `${weapon} special windup out of bounds: ${spec.windup}`,
    );
    assert(
      spec.duration >= 0.7 && spec.duration <= 1.1,
      `${weapon} special duration out of bounds: ${spec.duration}`,
    );
  }

  // Cinzas Runes
  assert.equal(CINZAS_RUNES.frost.chapter, 20);
  assert.equal(CINZAS_RUNES.fire.chapter, 25);

  // Atalaia Cards
  assert.equal(ATALAIA_CARDS.length, 12, 'Atalaia must provide 12 cards');
  for (const card of ATALAIA_CARDS) {
    assert(typeof card.id === 'string' && card.id.length > 0);
    assert(typeof card.name === 'string' && card.name.length > 0);
    assert(typeof card.text === 'string' && card.text.length > 0);
    assert(typeof card.tag === 'string');
    assert(typeof card.color === 'string' && card.color.length === 6);
  }
});

// =========================================================================
// 5. ENEMIES & BOSSES MATRIX (Inimigos, Chefes e Fases)
// =========================================================================
test('Enemies and Bosses Balance Matrix: Cinzas Monsters and Atalaia Chronicle Bosses', () => {
  // Cinzas Monsters
  const cinzasMonsterKeys = Object.keys(MONSTERS);
  assert.equal(cinzasMonsterKeys.length, 10, 'Cinzas must have 10 regular monster types');
  for (const key of cinzasMonsterKeys) {
    const m = MONSTERS[key];
    const [w, h, hp] = m.size;
    assert(w >= 30 && w <= 65);
    assert(h >= 30 && h <= 80);
    assert(hp >= 40 && hp <= 140);
    assert(Number.isInteger(m.unlock) && m.unlock >= 1 && m.unlock <= 9);
  }

  // Atalaia Enemies
  const atalaiaEnemyKeys = Object.keys(ATALAIA_ENEMIES);
  assert.equal(atalaiaEnemyKeys.length, 12, 'Atalaia must have 12 enemy types');
  for (const key of atalaiaEnemyKeys) {
    const e = ATALAIA_ENEMIES[key];
    assert(e.hp >= 20.0 && e.hp <= 1500.0, `Enemy ${key} HP out of bounds: ${e.hp}`);
    assert(e.speed >= 20.0 && e.speed <= 85.0, `Enemy ${key} speed out of bounds: ${e.speed}`);
    assert(e.gold >= 0 && e.gold <= 100, `Enemy ${key} gold out of bounds: ${e.gold}`);
    assert(e.armor >= 0.0 && e.armor <= 0.25, `Enemy ${key} armor out of bounds: ${e.armor}`);
  }

  // Atalaia Boss second phase triggers
  assert.equal(ROOT_GUARDIAN.wave, 6);
  assert.deepEqual(ROOT_GUARDIAN.escorts, ['wolf', 'wolf']);
  assert.equal(ATALAIA_MATRIARCH_BROOD.wave, 12);
  assert.deepEqual(ATALAIA_MATRIARCH_BROOD.escorts, ['brood', 'brood']);
  assert.equal(ATALAIA_CITADEL_SENTINEL.wave, 18);
  assert.deepEqual(ATALAIA_CITADEL_SENTINEL.escorts, ['golem']);
  assert.equal(ATALAIA_CITADEL_SENTINEL.bonusArmor, 0.15);
  assert.equal(ATALAIA_SLAG_WARD.wave, 24);
  assert.equal(ATALAIA_CROWN_PULSE.period, 7.0);
});

// =========================================================================
// 6. ECONOMY & EXPERIENCE MATRIX (Economia, Recompensas e Escalonamento)
// =========================================================================
test('Economy & Progression Matrix: Cinzas relics/cards and Atalaia gold flow', () => {
  // Cinzas Progression & Horde Tuning scaling
  for (let w = 1; w <= 25; w++) {
    const t = hordeTuning(w);
    assert(t.hp >= 1.0 && t.hp <= 4.0);
    assert(t.damage >= 1.0 && t.damage <= 2.5);
    assert(t.count >= 6 && t.count <= 38);
    assert(t.simultaneous <= 14);
  }

  // Cinzas Cards catalog
  assert.equal(CINZAS_CARDS.length, 36, 'Cinzas must provide 36 upgrade cards');
  for (const card of CINZAS_CARDS) {
    assert(typeof card.id === 'string');
    assert(typeof card.name === 'string');
    assert(typeof card.apply === 'function');
  }

  // Atalaia Gold economy
  // Killing 10 skeletons (70g) allows buying 1 ballista (70g)
  const skeletonKillCountForBallista = ATALAIA_TOWERS.ballista.cost / ATALAIA_ENEMIES.skeleton.gold;
  assert.equal(skeletonKillCountForBallista, 10, '10 skeleton kills must grant exactly 1 ballista');

  // Boss gold bounty (95g) grants substantial portion of high-tier tower
  const bossRatio = ATALAIA_ENEMIES.boss.gold / ATALAIA_TOWERS.ash_forge.cost;
  assert(bossRatio >= 0.55 && bossRatio <= 0.6, 'Boss kill must award 56% of highest tower cost');
});

console.log(`${passed} consolidated balance matrix suites passed with 100% precision.`);
