const assert = require('node:assert/strict');
const { Engine, CARDS, WEAPONS, SPECIALS, FLOOR, Rig } = require('../../public/roguelite/core.js');
const Levels = require('../../public/roguelite/levels.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function make(options = {}) {
  const e = new Engine();
  e.start({ seed: 'combat-review', ...options });
  return e;
}
function tick(e, n = 1, input = {}) {
  for (let i = 0; i < n; i++) e.update(1 / 60, input);
}

test('Damage review: 4 base weapons, 4 variants, power scaling, bloodrage, fury combo and critical hits', () => {
  // 1. Base weapons nominal damage
  const baseDamages = { blade: 22, hammer: 22 * 2.15, bow: 22 * 1.1, staff: 22 * 0.95 };
  for (const [weapon, expected] of Object.entries(baseDamages)) {
    const e = make(); e.enemies = []; e.spawnQueue = [{}];
    const p = e.player; p.weapon = weapon; p.crit = 0; p.power = 1; p.meleePower = 1;
    const target = e.addEnemy('brute', 200); target.hp = 1000; target.maxHp = 1000; target.cd = 999;
    if (['blade', 'hammer'].includes(weapon)) {
      p.x = target.x - p.w - 20; p.y = target.y + target.h - p.h; p.ground = true; p.dir = 1;
      assert(e.attack()); tick(e, weapon === 'hammer' ? 25 : 12);
      assert(Math.abs(target.hp - (1000 - expected)) < 0.05, weapon + ' must deal exactly ' + expected + ' base damage');
    } else {
      p.x = 100; p.y = FLOOR - p.h; p.dir = 1;
      assert(e.attack()); tick(e, 40);
      assert(Math.abs(target.hp - (1000 - expected)) < 0.05, weapon + ' projectile must deal ' + expected + ' base damage');
    }
  }

  // 2. Weapon variants nominal damage
  const variantChecks = [
    { id: 'ash_blade', weapon: 'blade', expected: 22 * 0.85 },
    { id: 'rift_hammer', weapon: 'hammer', expected: 22 * 1.80 },
    { id: 'echo_bow', weapon: 'bow', expected: 22 * 0.65 },
    { id: 'frost_staff', weapon: 'staff', expected: 22 * 0.75 }
  ];
  for (const { id, weapon, expected } of variantChecks) {
    const e = make({ legacyVariant: id }); e.enemies = []; e.spawnQueue = [{}];
    const p = e.player; p.weapon = weapon; p.crit = 0; p.power = 1; p.meleePower = 1;
    const target = e.addEnemy('brute', 200); target.hp = 1000; target.maxHp = 1000; target.cd = 999;
    if (['blade', 'hammer'].includes(weapon)) {
      p.x = target.x - p.w - 20; p.y = target.y + target.h - p.h; p.ground = true; p.dir = 1;
      assert(e.attack()); tick(e, weapon === 'hammer' ? 25 : 12);
      assert(Math.abs(target.hp - (1000 - expected)) < 0.05, id + ' must deal exactly ' + expected);
    } else {
      p.x = 100; p.y = FLOOR - p.h; p.dir = 1;
      assert(e.attack()); tick(e, 40);
      const totalExpected = id === 'echo_bow' ? expected * 2 : expected;
      assert(Math.abs(target.hp - (1000 - totalExpected)) < 0.05, id + ' projectile must deal ' + totalExpected);
    }
  }

  // 3. Power and MeleePower scaling
  const e = make(); e.enemies = []; e.spawnQueue = [{}];
  const p = e.player; p.weapon = 'blade'; p.crit = 0;
  p.power = 1.44; // 2x power card
  p.meleePower = 1.24; // 2x pierce card
  const target = e.addEnemy('brute', 200); target.hp = 1000; target.maxHp = 1000; target.cd = 999;
  p.x = target.x - p.w - 20; p.y = target.y + target.h - p.h; p.ground = true; p.dir = 1;
  assert(e.attack()); tick(e, 12);
  const scaledExpected = 22 * 1.44 * 1.24;
  assert(Math.abs(target.hp - (1000 - scaledExpected)) < 0.1, 'Power and MeleePower must multiply damage cleanly');

  // 4. Fury on 3rd combo and Bloodrage below 40% HP
  const furyRun = make(); furyRun.enemies = []; furyRun.spawnQueue = [{}];
  const fp = furyRun.player; fp.weapon = 'blade'; fp.crit = 0; fp.fury = 2; // +50% fury
  fp.hp = 30; fp.maxHp = 100; fp.bloodrage = true; // +35% bloodrage
  const mob = furyRun.addEnemy('brute', 200); mob.hp = 2000; mob.maxHp = 2000; mob.cd = 999;
  fp.y = mob.y + mob.h - fp.h; fp.ground = true; fp.dir = 1;
  // Step combo 0 -> 1 -> 2
  mob.x = 200; fp.x = mob.x - fp.w - 20;
  assert(furyRun.attack());
  while (fp.swing || fp.attackCd > 0) furyRun.update(1 / 60, {});
  assert.equal(fp.combo, 0);

  mob.x = 200; fp.x = mob.x - fp.w - 20;
  assert(furyRun.attack());
  while (fp.swing || fp.attackCd > 0) furyRun.update(1 / 60, {});
  assert.equal(fp.combo, 1);

  mob.x = 200; fp.x = mob.x - fp.w - 20;
  assert(furyRun.attack());
  while (fp.swing) furyRun.update(1 / 60, {});
  assert.equal(fp.combo, 2);

  // Hit 1: 22 * 1.00 * 1.35
  // Hit 2: 22 * 1.12 * 1.35
  // Hit 3 (combo 2 + fury): 22 * 1.45 * 1.35 * 1.50
  const hit1 = 22 * 1.00 * 1.35;
  const hit2 = 22 * 1.12 * 1.35;
  const hit3 = 22 * 1.45 * 1.35 * 1.50;
  const totalDamage = hit1 + hit2 + hit3;
  assert(Math.abs(mob.hp - (2000 - totalDamage)) < 0.2, 'Fury and Bloodrage must stack multiplicatively across combo');

  // 5. Critical hit doubles damage (2x) and emits impact event
  const critRun = make(); critRun.enemies = []; critRun.spawnQueue = [{}];
  const cp = critRun.player; cp.weapon = 'blade'; cp.crit = 1.0; cp.power = 1; cp.meleePower = 1;
  const cTarget = critRun.addEnemy('brute', 200); cTarget.hp = 1000; cTarget.maxHp = 1000; cTarget.cd = 999;
  cp.x = cTarget.x - cp.w - 20; cp.y = cTarget.y + cTarget.h - cp.h; cp.ground = true; cp.dir = 1;
  assert(critRun.attack()); tick(critRun, 12);
  assert.equal(cTarget.hp, 1000 - 44, 'Critical hit must double the 22 base damage to 44');
  assert(critRun.events.some(ev => ev.type === 'impact' && ev.critical === true), 'Critical hit must emit critical impact event');
});

test('Cadence review: attack duration, windup, weapon cooldowns, haste scaling and skill recharge', () => {
  // 1. Nominal attack timings by weapon
  const timings = {
    blade: { duration: 0.42, windup: 0.42 * 0.36, cooldown: 0.32 },
    hammer: { duration: 0.66, windup: 0.66 * 0.45, cooldown: 0.65 },
    bow: { duration: 0.40, windup: 0.40 * 0.36, cooldown: 0.40 },
    staff: { duration: 0.38, windup: 0.38 * 0.36, cooldown: 0.28 }
  };
  for (const [weapon, expected] of Object.entries(timings)) {
    const e = make(); const p = e.player; p.weapon = weapon; p.haste = 1.0;
    assert(e.attack());
    assert(Math.abs(p.attackDuration - expected.duration) < 1e-6);
    assert(Math.abs(p.swing.windup - expected.windup) < 1e-6);
    assert(Math.abs(p.attackCd - Math.max(expected.duration, expected.cooldown)) < 1e-6);
    assert.equal(e.attack(), false, 'Cannot attack during active attackCd');
  }

  // 2. Haste scaling reduces attack duration and attackCd cleanly by 1 / haste
  const e = make(); const p = e.player; p.weapon = 'hammer'; p.haste = 1.36; // 2x haste cards (+36%)
  assert(e.attack());
  const expectedDuration = 0.66 / 1.36;
  assert(Math.abs(p.attackDuration - expectedDuration) < 1e-6, 'Haste must scale attack duration by 1/haste');
  assert(Math.abs(p.attackCd - Math.max(expectedDuration, 0.65 / 1.36)) < 1e-6);

  // 3. Special skill cooldowns by weapon
  for (const weapon of ['blade', 'hammer', 'bow', 'staff']) {
    const sRun = make(); const sp = sRun.player; sp.weapon = weapon; sp.magicRate = 1.0;
    assert(sRun.skill());
    assert.equal(sp.skillCd, SPECIALS[weapon].cooldown, weapon + ' must set nominal skill cooldown');
    assert.equal(sRun.skill(), false, 'Skill cannot spam while on cooldown');
  }

  // 4. MagicRate scaling accelerates skill cooldown by 1 / magicRate
  const mRun = make(); const mp = mRun.player; mp.weapon = 'blade'; mp.magicRate = 1.30;
  assert(mRun.skill());
  assert(Math.abs(mp.skillCd - SPECIALS.blade.cooldown / 1.30) < 1e-6, 'MagicRate must accelerate skill recharge');
});

test('Collision review: melee arc reach, projectile pierce, tunnel ceiling and terrain slope navigation', () => {
  // 1. Melee arc reach scaling
  const e = make(); e.enemies = []; e.spawnQueue = [{}];
  const p = e.player; p.weapon = 'blade'; p.reach = 1.5; p.crit = 0;
  const expectedRange = WEAPONS.blade.range * 1.5; // 120 * 1.5 = 180
  const inReachTarget = e.addEnemy('brute', p.x + p.w / 2 + expectedRange - 5);
  inReachTarget.hp = 500; inReachTarget.maxHp = 500; inReachTarget.cd = 999;
  const outReachTarget = e.addEnemy('brute', p.x + p.w / 2 + expectedRange + 30);
  outReachTarget.hp = 500; outReachTarget.maxHp = 500; outReachTarget.cd = 999;
  p.dir = 1; assert(e.attack()); tick(e, 12);
  assert(inReachTarget.hp < 500, 'Enemy within extended reach must be hit');
  assert.equal(outReachTarget.hp, 500, 'Enemy beyond reach cannot be hit');

  // 2. Projectile pierce count
  const pRun = make(); pRun.enemies = []; pRun.spawnQueue = [{}];
  const pp = pRun.player; pp.weapon = 'bow'; pp.pierce = 2; pp.crit = 0; pp.x = 100; pp.y = FLOOR - pp.h; pp.dir = 1;
  const muzzle = Rig.muzzle(pp, 'bow', pRun.time);
  const m1 = pRun.addEnemy('brute', 250); m1.hp = 500; m1.cd = 999;
  const m2 = pRun.addEnemy('brute', 350); m2.hp = 500; m2.cd = 999;
  const m3 = pRun.addEnemy('brute', 450); m3.hp = 500; m3.cd = 999;
  const m4 = pRun.addEnemy('brute', 550); m4.hp = 500; m4.cd = 999;
  const mobs = [m1, m2, m3, m4];
  for (const m of mobs) { m.y = muzzle.y - m.h / 2; m.ground = false; m.vy = 0; }
  assert(pRun.attack());
  for (let i = 0; i < 45; i++) {
    for (const m of mobs) { m.y = muzzle.y - m.h / 2; m.vy = 0; }
    pRun.update(1 / 60, {});
  }
  assert(m1.hp < 500, 'First mob must be pierced');
  assert(m2.hp < 500, 'Second mob must be pierced');
  assert(m3.hp < 500, 'Third mob must be hit (pierce depleted to 0)');
  assert.equal(m4.hp, 500, 'Fourth mob cannot be hit after pierce exhausted');

  // 3. Tunnel ceiling collision
  const cRun = make();
  cRun.platforms = [
    { id: 1, x: 0, w: 2400, y: 900, y2: 900, h: 300, oneWay: false },
    { id: 2, x: 200, w: 1000, y: 500, y2: 500, h: 110, ceiling: true, oneWay: false }
  ];
  const cp = cRun.player; Object.assign(cp, { x: 300, y: 615, vy: -540, vx: 0, ground: false });
  cRun.moveBody(cp, 1 / 60);
  assert(cp.y >= 610, 'Player head cannot pass tunnel ceiling');
  assert(cp.vy >= 0, 'Upward velocity must be stopped on ceiling contact');

  // 4. Slope navigation without sinking or teleporting
  const sRun = make();
  sRun.platforms = [{ id: 1, x: 0, w: 2400, y: 800, y2: 400, h: 300, oneWay: false }];
  const sp = sRun.player; Object.assign(sp, { x: 500, y: sRun.groundY(517) - sp.h, vx: 200, vy: 0, ground: true });
  for (let frame = 0; frame < 60; frame++) {
    sRun.moveBody(sp, 1 / 60);
    assert(Math.abs(sp.y + sp.h - sRun.groundY(sp.x + sp.w / 2)) < 0.05, 'Slope walking must stay anchored to ground');
  }
});

test('Dodge review: dash speed, duration, complete invulnerability window, cooldown scaling and post-dash aegis', () => {
  // 1. Dash velocity, duration, and invulnerability
  const e = make(); const p = e.player; p.invuln = 0; p.dir = 1;
  tick(e, 1, { dash: true });
  assert(p.dashTime > 0.19, 'Dash must set 0.21s duration');
  assert.equal(p.vx, 790, 'Dash velocity must be dir * 790');
  assert(p.invuln >= 0.25, 'Dash must guarantee at least 0.25s of invulnerability');

  // 2. Invulnerability during dash against attacks, projectiles, and hazards
  assert.equal(e.hurtPlayer(999, 100, 'physical'), false, 'Cannot be hurt during active dashTime');
  assert.equal(p.hp, p.maxHp, 'HP must remain full during dash');

  // 3. Dash cooldown scaling with dashRate
  const dRun = make(); const dp = dRun.player; dp.dashRate = 1.4; // 2x dash cards (+40%)
  tick(dRun, 1, { dash: true });
  const expectedCd = 1.3 / 1.4;
  assert(Math.abs(dp.dashCd - expectedCd) < 0.02, 'Dash cooldown must scale by 1 / dashRate');

  // 4. Post-dash aegis mitigation
  const aRun = make(); const ap = aRun.player; ap.aegis = 2; // +30% post-dash mitigation
  tick(aRun, 1, { dash: true });
  assert.equal(ap.postDash, 2, 'Dash must set 2s postDash window');
  tick(aRun, 15); // Wait for dashTime to expire while postDash is active
  assert.equal(ap.dashTime, 0); assert(ap.postDash > 0);
  ap.invuln = 0;
  assert(aRun.hurtPlayer(100, undefined, 'physical'));
  // Base 100 * (1 - 2 * 0.15) = 70 damage taken
  assert.equal(ap.hp, ap.maxHp - 70, 'Post-dash aegis must reduce incoming damage by 30%');
});

test('Resistance review: armor percentage cap, difficulty scaling, heavy windup guard and bulwark block', () => {
  // 1. Player armor reduction
  const e = make(); const p = e.player; p.invuln = 0; p.armor = 0.20; // 20% armor
  assert(e.hurtPlayer(50, undefined, 'physical'));
  assert.equal(p.hp, p.maxHp - 40, '20% armor must reduce 50 damage to 40');

  // 2. Difficulty scaling: easy 0.7x, normal 1.0x, hard 1.45x
  const easyRun = make({ difficulty: 'easy' }); easyRun.player.invuln = 0;
  assert(easyRun.hurtPlayer(100, undefined, 'physical'));
  assert.equal(easyRun.player.hp, easyRun.player.maxHp - 70, 'Easy difficulty must apply 0.70x damage factor');

  const hardRun = make({ difficulty: 'hard' }); hardRun.player.invuln = 0;
  hardRun.player.hp = 200; hardRun.player.maxHp = 200;
  assert(hardRun.hurtPlayer(100, undefined, 'physical'));
  assert.equal(hardRun.player.hp, 200 - 145, 'Hard difficulty must apply 1.45x damage factor');

  // 3. Heavy windup guard with ash_blade
  const gRun = make({ legacyVariant: 'ash_blade' }); const gp = gRun.player;
  gp.weapon = 'blade'; gp.invuln = 0;
  assert(gRun.attack()); // Start swing
  assert(gp.swing && gp.swing.t < gp.swing.windup);
  assert(gRun.hurtPlayer(100, undefined, 'physical'));
  // 100 * (1 - 0.20 windupGuard) = 80 damage
  assert.equal(gp.hp, gp.maxHp - 80, 'Ash blade must absorb 20% damage during windup');

  // 4. Terrain ward on lava
  const lRun = make(); lRun.enemies = []; lRun.spawnQueue = [{}];
  const lp = lRun.player; lp.terrainWard = 0.5; // 50% ward
  const lavaGround = lRun.platforms.find(plat => plat.oneWay === false && !plat.ceiling);
  lavaGround.effect = 'lava'; lp.x = lavaGround.x + 50; lp.y = lRun.surface(lavaGround, lp.x + lp.w / 2) - lp.h;
  lp.platformId = lavaGround.id; lp.ground = true; lp.invuln = 0;
  tick(lRun, 1);
  // Base lava damage is 9 * (1 - 0.5) = 4.5
  assert.equal(lp.hp, lp.maxHp - 4.5, '50% terrain ward must halve lava tick damage');

  // 5. Bulwark shield block vs unblockable rift hammer
  const bRun = make(); bRun.enemies = []; bRun.spawnQueue = [{}];
  const bp = bRun.player; bp.weapon = 'blade'; bp.crit = 0; bp.power = 1;
  const bulwark = bRun.addEnemy('bulwark', 300); bulwark.hp = 1000; bulwark.cd = 999; bulwark.dir = -1;
  bp.x = 200; bp.dir = 1; // Facing bulwark from the front
  bRun.damageEnemy(bulwark, 100, false, false, 'physical');
  // Blocked: 100 * 0.42 = 42 damage taken
  assert.equal(bulwark.hp, 1000 - 42, 'Bulwark frontal block must reduce physical damage by 58%');

  // Unblockable attack bypasses block completely
  bRun.damageEnemy(bulwark, 100, false, false, 'physical', true, { unblockable: true });
  assert.equal(bulwark.hp, 1000 - 42 - 100, 'Unblockable attack must bypass Bulwark shield entirely');
});

test('Status review: fire burn, frost slow, poison venom, chain lightning and player crowd control', () => {
  // 1. Fire burn and Inferno explosion
  const e = make(); e.enemies = []; e.spawnQueue = [{}];
  const p = e.player; p.fire = 2; p.inferno = true;
  const m1 = e.addEnemy('crawler', 300); m1.hp = 100; m1.maxHp = 100;
  const m2 = e.addEnemy('crawler', 350); m2.hp = 100; m2.maxHp = 100;
  e.damageEnemy(m1, 10);
  assert.equal(m1.burn, 3, 'Fire must apply 3s burn duration');
  // 6 * max(1, fire) = 12 dps. After 0.5s (30 ticks) -> 6 damage
  const hpBefore = m1.hp; tick(e, 30);
  assert(Math.abs((hpBefore - m1.hp) - 6) < 0.2, 'Burn must deal 12 dps with 2 fire stacks');
  // Kill m1 to trigger inferno explosion (24 damage in 125 radius)
  const m2Hp = m2.hp; e.killEnemy(m1);
  assert.equal(m2.hp, m2Hp - 24, 'Inferno must deal 24 explosion damage to nearby enemy');

  // 2. Frost slow and Shatter bonus
  const fRun = make(); fRun.enemies = []; fRun.spawnQueue = [{}];
  const fp = fRun.player; fp.frost = 1; fp.shatter = true; fp.crit = 0; fp.power = 1;
  const fMob = fRun.addEnemy('crawler', 300); fMob.hp = 500; fMob.maxHp = 500;
  fRun.damageEnemy(fMob, 10);
  assert.equal(fMob.slow, 2, 'Frost must apply 2s slow duration');
  // Next attack on slowed target gains +30% shatter bonus
  fRun.damageEnemy(fMob, 100, false, false, 'physical');
  assert.equal(fMob.hp, 500 - 10 - 130, 'Shatter must grant +30% damage against slowed targets');

  // 3. Poison venom and Plague doubling
  const pRun = make(); pRun.enemies = []; pRun.spawnQueue = [{}];
  const pp = pRun.player; pp.poison = 2; pp.plague = true;
  const pMob = pRun.addEnemy('crawler', 300); pMob.hp = 200; pMob.maxHp = 200;
  pRun.damageEnemy(pMob, 10);
  assert.equal(pMob.venom, 5, 'Poison must apply 5s venom duration');
  // 4 * poison * 2 = 16 dps. After 0.5s (30 ticks) -> 8 damage
  const vHp = pMob.hp; tick(pRun, 30);
  assert(Math.abs((vHp - pMob.hp) - 8) < 0.2, 'Plague must double venom tick rate to 16 dps');

  // 4. Chain lightning jumps
  const lRun = make(); lRun.enemies = []; lRun.spawnQueue = [{}];
  const lp = lRun.player; lp.lightning = 2; lp.storm = true;
  const targetA = lRun.addEnemy('crawler', 300); targetA.hp = 500;
  const targetB = lRun.addEnemy('crawler', 400); targetB.hp = 500;
  const targetC = lRun.addEnemy('crawler', 500); targetC.hp = 500;
  lRun.damageEnemy(targetA, 100);
  // Storm lightning deals 60% of damage per jump
  assert(targetB.hp <= 500 - 60, 'Chain lightning must jump to second enemy');
  assert(targetC.hp <= 500 - 36, 'Chain lightning must jump to third enemy');

  // 5. Player crowd control: web snare, physical bleed, fire burn, lightning shock
  const rRun = make(); const rp = rRun.player; rp.invuln = 0;
  rRun.hurtPlayer(10, 400, 'web');
  assert.equal(rp.snare, 1.8, 'Web projectile must apply 1.8s snare');
  rp.invuln = 0; rRun.hurtPlayer(10, 400, 'physical');
  assert.equal(rp.bleed, 0.3, 'Physical damage must set bleed timer');
  assert(rRun.effects.some(f => f.type === 'bloodcut'), 'Physical damage must create bloodcut effect');
  rp.invuln = 0; rRun.hurtPlayer(10, 400, 'fire');
  assert(rp.burn > 0, 'Fire damage must ignite player burn timer');
  rp.invuln = 0; rRun.hurtPlayer(10, 400, 'lightning');
  assert(rp.shockVisual > 0, 'Lightning damage must activate player shock visual');
});

console.log(passed + ' comprehensive combat review tests passed.');
