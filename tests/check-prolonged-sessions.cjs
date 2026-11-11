'use strict';
const assert = require('node:assert/strict');
const { Engine } = require('../public/roguelite/core.js');
const { createAtalaia } = require('../src/lib/games/atalaia.ts');

let passed = 0;
function logPass(name) { passed++; console.log('PASS ' + name); }

async function main() {
  // =========================================================================
  // 1. Prolonged 3,600 frame simulation (60s continuous real-time combat)
  // =========================================================================
  {
    const engine = new Engine();
    engine.start({ mode: 'horde', seed: 'prolonged-60s' });
    const p = engine.player;
    p.maxHp = 5000;
    p.hp = 5000;

    const t0 = performance.now();
    for (let frame = 0; frame < 3600; frame++) {
      p.hp = 5000; // Sustain hero during prolonged stress test
      const attackInput = frame % 25 === 0;
      const dashInput = frame % 90 === 0;
      const jumpInput = frame % 120 === 0;
      const moveDir = Math.sin(frame / 60) > 0 ? 1 : -1;

      engine.update(1 / 60, {
        left: moveDir < 0,
        right: moveDir > 0,
        attack: attackInput,
        dash: dashInput,
        jump: jumpInput
      });
    }
    const t1 = performance.now();
    const totalMs = t1 - t0;
    const avgFrameMs = totalMs / 3600;
    const simulatedFps = Math.round(1000 / avgFrameMs);

    assert(Math.abs(engine.time - 60.0) < 0.1, `Engine time must reach 60.0s, got ${engine.time.toFixed(2)}`);
    assert(avgFrameMs < 0.25, `Average step time must be under 0.25ms (got ${avgFrameMs.toFixed(3)}ms, ${simulatedFps} simulated FPS)`);
    assert(Number.isFinite(p.hp) && p.hp >= 0, 'Player HP must be finite and non-negative');
    logPass('Prolonged simulation: 3,600 continuous frames (60s @ 60fps) with spawn, input and particle load');
  }

  // =========================================================================
  // 2. Memory leak resistance across 50 consecutive run restarts in Cinzas
  // =========================================================================
  {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;

    for (let run = 0; run < 50; run++) {
      const e = new Engine();
      e.start({ seed: `restart-cycle-${run}`, difficulty: 'normal' });

      // Simulate 60 frames on stage 0
      for (let f = 0; f < 60; f++) {
        e.update(1 / 60, { right: true, attack: f % 15 === 0 });
      }

      // Transition to stage 1
      e.stage = 1;
      e.loadStage();

      // Simulate 60 frames on stage 1
      for (let f = 0; f < 60; f++) {
        e.update(1 / 60, { left: true, skill: f === 10 });
      }

      // Terminate run cleanly
      e.end(false);
    }

    if (global.gc) global.gc();
    const memAfter = process.memoryUsage().heapUsed;
    const deltaMb = (memAfter - memBefore) / 1024 / 1024;

    // Unbounded memory growth would produce > 30MB across 50 full engine lifecycles
    assert(deltaMb < 15.0, `Heap delta must be strictly bounded under 15MB across 50 runs (observed ${deltaMb.toFixed(2)}MB)`);
    logPass('Memory leak resistance: 50 consecutive run restarts and stage transitions in Cinzas');
  }

  // =========================================================================
  // 3. Atalaia lifecycle transitions across 50 consecutive runs
  // =========================================================================
  {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;

    for (let run = 0; run < 50; run++) {
      let views = 0, launches = 0;
      const game = createAtalaia({
        desktop: false,
        openView() { views++; },
        launchWeb() { launches++; }
      });

      game.open();
      assert.equal(views, 1);
      await game.launch();
      assert.equal(launches, 1);
      assert.match(game.getSnapshot().status, /outra aba/);

      // Clean disposal
      game.dispose();
    }

    if (global.gc) global.gc();
    const memAfter = process.memoryUsage().heapUsed;
    const deltaMb = (memAfter - memBefore) / 1024 / 1024;

    assert(deltaMb < 10.0, `Atalaia heap delta must be under 10MB across 50 transitions (observed ${deltaMb.toFixed(2)}MB)`);
    logPass('Atalaia lifecycle transitions: 50 consecutive open/launch/dispose cycles');
  }

  // =========================================================================
  // 4. State isolation and checkpoint integrity across repeated run transitions
  // =========================================================================
  {
    // 1. Create a baseline completed stage and checkpoint
    const master = new Engine();
    master.start({ mode: 'adventure', seed: 'isolation-master', legacyWeapon: 'hammer' });
    master.player.hp = 85;
    master.score = 450;
    master.kills = 12;
    master.cleared = true;
    const checkpoint = master.checkpointData();
    assert(checkpoint !== null);

    // 2. Start 10 consecutive new runs and verify pristine baseline state
    for (let i = 0; i < 10; i++) {
      const fresh = new Engine();
      fresh.start({ mode: 'adventure', seed: `fresh-${i}` });

      assert.equal(fresh.status, 'running');
      assert.equal(fresh.score, 0, 'New run score must start at 0');
      assert.equal(fresh.kills, 0, 'New run kills must start at 0');
      assert.equal(fresh.stage, 0, 'New run stage must start at 0');
      assert.equal(fresh.cleared, false, 'New run cleared must be false');
      assert.equal(fresh.effects.length, 0, 'Effects array must be empty on start');
      assert.equal(fresh.projectiles.length, 0, 'Projectiles array must be empty on start');
      assert.equal(fresh.particles.length, 0, 'Particles array must be empty on start');
      assert.equal(fresh.player.hp, fresh.player.maxHp, 'Player HP must start at full');
    }

    // 3. Restore earlier checkpoint in a new engine instance
    const restored = new Engine();
    restored.start({ mode: 'adventure', seed: 'isolation-master', legacyWeapon: 'hammer' });
    assert(restored.restoreCheckpoint(checkpoint), 'Checkpoint must restore cleanly');
    assert.equal(restored.player.hp, 85, 'Restored HP must match checkpoint');
    assert.equal(restored.score, 450, 'Restored score must match checkpoint');
    assert.equal(restored.kills, 12, 'Restored kills must match checkpoint');
    logPass('State isolation: ensure fresh runs never bleed state and checkpoints restore cleanly');
  }

  console.log(`${passed} prolonged sessions diagnostic suites passed.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
