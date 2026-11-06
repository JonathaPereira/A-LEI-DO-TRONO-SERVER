const assert = require('node:assert/strict');
const { Engine, CARDS, CHAPTERS } = require('../../public/roguelite/core.js');
const Ledger = require('../../public/roguelite/persistence.js');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const make = () => { const e = new Engine(); e.start({ mode: 'adventure', seed: 'campaign-resume', name: 'Lia' }); return e; };
const copy = value => JSON.parse(JSON.stringify(value));

test('Campaign initial choice and entry restore the actual seed, weapon and pending draft', () => {
  const e = make(); e.offerCards('start');
  const draft = copy(e.createCheckpoint()), resumed = new Engine();
  assert.equal(draft.format, 'cinzas-campaign');
  assert(resumed.restoreCheckpoint(draft));
  assert.equal(resumed.mode, 'adventure');
  assert.deepEqual(resumed.cards.map(c => c.id), e.cards.map(c => c.id));
  assert(resumed.chooseCard(0));
  const entry = copy(resumed.createCheckpoint()), restored = new Engine();
  assert(restored.restoreCheckpoint(entry));
  assert.equal(restored.player.weapon, resumed.player.weapon);
  assert.equal(restored.seed, 'campaign-resume');
  assert.equal(restored.stage, 0);
  assert.deepEqual(restored.chosenHistory, resumed.chosenHistory);
});

test('Partial combat and shrine rewards cannot overwrite an entry checkpoint or be farmed on reload', () => {
  const e = make(); e.offerCards('start'); e.chooseCard(0);
  const entry = copy(e.createCheckpoint());
  e.player.hp = 30; e.kills = 5; e.relicCount = 1; e.score = 200;
  if (e.relics[0]) e.relics[0].taken = true;
  if (e.shrines[0]) e.shrines[0].used = true;
  e.offerCards('shrine'); e.cards = [CARDS.find(c => c.id === 'power')]; e.chooseCard(0);
  assert.deepEqual(e.createCheckpoint(), entry);
  const restored = new Engine(); assert(restored.restoreCheckpoint(e.createCheckpoint()));
  assert.equal(restored.kills, 0); assert.equal(restored.relicCount, 0);
  assert.equal(restored.owned.power || 0, 0);
  assert.equal(restored.player.hp, entry.hp);
  const detached = e.createCheckpoint(); detached.history.push('power');
  assert.deepEqual(e.createCheckpoint(), entry);
});

test('A cleared chapter and its exit choice preserve rewards and consumed world objects exactly once', () => {
  const e = make(); e.offerCards('start'); e.chooseCard(0);
  e.kills = 18; e.relicCount = 2; e.score = 400; e.player.hp = 73;
  e.relics.forEach(r => r.taken = true); e.shrines.forEach(s => s.used = true);
  e.enemies = []; e.spawnQueue = []; e.portals = []; e.update(1/60, {});
  const cp = copy(e.createCheckpoint()), restored = new Engine();
  assert.equal(cp.phase, 'cleared'); assert.equal(cp.completedChapters, 1);
  assert(restored.restoreCheckpoint(cp));
  assert(restored.cleared); assert.equal(restored.enemies.length, 0);
  assert(restored.relics.every(r => r.taken)); assert(restored.shrines.every(s => s.used));
  assert.equal(restored.relicCount, 2); assert.equal(restored.score, 400);
  assert(restored.useCheckpoint());
  const draft = copy(restored.createCheckpoint()), next = new Engine();
  assert.equal(draft.upgradeSource, 'exit'); assert(next.restoreCheckpoint(draft));
  assert.equal(next.player.hp, restored.player.hp);
  assert.deepEqual(next.cards.map(c => c.id), restored.cards.map(c => c.id));
  assert(next.rerollCards()); const rerolled = new Engine();
  assert(rerolled.restoreCheckpoint(next.createCheckpoint()));
  assert.equal(rerolled.rerolls, next.rerolls);
  assert.deepEqual(rerolled.cards.map(c => c.id), next.cards.map(c => c.id));
  assert(rerolled.chooseCard(0)); assert.equal(rerolled.stage, 1);
  const chapter = new Engine(); assert(chapter.restoreCheckpoint(rerolled.createCheckpoint()));
  assert.equal(chapter.stage, 1); assert.equal(chapter.score, 400); assert.equal(chapter.relicCount, 2);
  assert.equal(chapter.player.hp, rerolled.player.hp);
});

test('Malformed campaign checkpoints are rejected atomically, while horde format stays compatible', () => {
  const cp = copy(make().createCheckpoint()), target = make(), before = copy(target.createCheckpoint());
  for (const patch of [{ stage: CHAPTERS.length }, { completedChapters: 9 }, { relicCount: -1 }, { relicCount: 7 }, { usedShrines: ['unknown'] }, { takenRelics: [99] }, { history: ['missing'] }, { version: 999 }]) {
    assert.equal(target.restoreCheckpoint({ ...cp, ...patch }), false, JSON.stringify(patch));
    assert.deepEqual(target.createCheckpoint(), before);
  }
  const horde = new Engine(); horde.start({ mode: 'horde', seed: 'legacy' });
  const legacy = copy(horde.createCheckpoint()); assert.equal(legacy.format, 'cinzas-horde');
  const restored = new Engine(); assert(restored.restoreCheckpoint(legacy)); assert.equal(restored.mode, 'horde');
});

test('Version-two backups roundtrip both independent saves and preserve version-one imports', () => {
  const campaign = make().createCheckpoint(), horde = new Engine(); horde.start({ mode: 'horde' });
  const scores = [{ edition:'0.5', name:'Lia', difficulty:'normal', wave:4, kills:12 }];
  const parsed = Ledger.parseBackup(Ledger.backup(scores, horde.createCheckpoint(), campaign));
  assert.deepEqual(parsed.campaignCheckpoint, campaign);
  assert.equal(parsed.checkpoint.format, 'cinzas-horde'); assert.equal(parsed.scores.length, 1);
  const legacy = Ledger.parseBackup(JSON.stringify({ format:'cinzas-save', version:1, scores, checkpoint:horde.createCheckpoint() }));
  assert.equal(legacy.campaignCheckpoint, null); assert(legacy.checkpoint);
  assert.equal(Ledger.parseBackup(JSON.stringify({ format:'cinzas-save', version:999, scores:[] })), null);
});

test('All fifteen authored chapters can be continued at their cleared boundary through the existing campaign ending', () => {
  let e = make(); e.offerCards('start'); e.chooseCard(0);
  for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
    assert.equal(e.stage, chapter);
    e.enemies = []; e.spawnQueue = []; e.portals = []; e.update(1/60, {});
    const resumed = new Engine(); assert(resumed.restoreCheckpoint(copy(e.createCheckpoint())));
    assert.equal(resumed.chapter, e.chapter); assert.equal(resumed.biome, CHAPTERS[chapter].biome);
    assert(resumed.useCheckpoint());
    if (chapter === CHAPTERS.length-1) {
      assert.equal(resumed.status, 'ended'); assert.equal(resumed.won, true);
    } else {
      assert.equal(resumed.status, 'upgrade'); assert(resumed.chooseCard(0));
    }
    e = resumed;
  }
});
console.log(passed + ' campaign continuation groups passed.');
