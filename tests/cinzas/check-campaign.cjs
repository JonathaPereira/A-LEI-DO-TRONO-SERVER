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

test('All twenty-five authored chapters can be continued at their cleared boundary through the existing campaign ending', () => {
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

test('A legacy weapon stays in the expedition opening draft after reloading and rerolling, without changing the horde', () => {
  const expedition = new Engine();
  expedition.start({ mode: 'adventure', seed: 'cinzas-test', legacyWeapon: 'staff' });
  expedition.offerCards('start');
  const resumed = new Engine();
  assert(resumed.restoreCheckpoint(copy(expedition.createCheckpoint())));
  for (let reroll = 0; reroll < 3; reroll++) {
    assert(resumed.rerollCards());
    assert.equal(resumed.cards.filter(card => card.id === 'staff').length, 1);
  }
  assert(resumed.chooseCard(resumed.cards.findIndex(card => card.id === 'staff')));
  assert.equal(resumed.player.weapon, 'staff');
  const normal = new Engine(), horde = new Engine();
  normal.start({ mode: 'horde', seed: 'cinzas-test' });
  horde.start({ mode: 'horde', seed: 'cinzas-test', legacyWeapon: 'staff' });
  assert.deepEqual(horde.offerCards('start'), normal.offerCards('start'));
});

test('Legacy only credits real campaign milestones, keeps the highest progress and survives backup import', () => {
  const locked = Ledger.updateLegacy(null, { format: 'cinzas-horde', completedChapters: 15 });
  assert.deepEqual(locked, { version: 1, cleared: 0, weapon: '' });
  assert.equal(Ledger.selectLegacy(locked, 'staff'), null);
  const reached = Ledger.updateLegacy(locked, { format: 'cinzas-campaign', completedChapters: 10 });
  const selected = Ledger.selectLegacy(reached, 'hammer');
  assert.deepEqual(selected, { version: 1, cleared: 10, weapon: 'hammer' });
  assert.deepEqual(Ledger.updateLegacy(selected, { format: 'cinzas-campaign', completedChapters: 5 }), selected);
  const backup = Ledger.backup([], null, null, selected);
  assert.equal(JSON.parse(backup).version, 3);
  assert.deepEqual(Ledger.parseBackup(backup).legacy, selected);
  const invalid = { ...JSON.parse(backup), legacy: { ...selected, cleared: 0 } };
  assert.equal(Ledger.parseBackup(JSON.stringify(invalid)), null);
});


test('The expedition has five regions and continues a restored Forge victory into the fourth', () => {
  assert.equal(CHAPTERS.length, 25);
  assert.deepEqual(CHAPTERS.filter(chapter => chapter.boss).map(chapter => chapter.biome), [0, 1, 2, 3, 4]);
  const forge = make();
  forge.offerCards('start'); forge.chooseCard(0);
  forge.stage = 14; forge.loadStage();
  forge.enemies = []; forge.spawnQueue = []; forge.portals = []; forge.update(1/60, {});
  const restored = new Engine();
  assert(restored.restoreCheckpoint(forge.createCheckpoint()));
  assert(restored.useCheckpoint());
  assert(restored.chooseCard(0));
  assert.equal(restored.biome, 3);
  assert.equal(restored.stage, 15);
});

test('Regional runes unlock only after their bosses and restore the chosen special in the expedition',()=>{
  const mark={version:1,cleared:20,weapon:''};
  assert.equal(Ledger.selectRune({...mark,cleared:19},'frost'),null);
  assert.equal(Ledger.selectRune(mark,'fire'),null);
  const legacy=Ledger.selectRune(mark,'frost');
  assert.equal(legacy.rune,'frost');
  assert.equal(Ledger.parseBackup(Ledger.backup([],null,null,legacy)).legacy.rune,'frost');
  const run=make();run.start({legacyRune:legacy.rune});
  const reopened=make();assert(reopened.restoreCheckpoint(run.createCheckpoint()));
  assert(reopened.skill());assert.equal(reopened.player.pendingSkill.element,'frost');
  reopened.player.specialTime=0;reopened.player.skillCd=0;reopened.player.lightning=1;
  reopened.setElement('lightning');assert(reopened.skill());assert.equal(reopened.player.pendingSkill.element,'lightning');
  const horde=make();horde.start({mode:'horde',legacyRune:'fire'});
  assert(horde.skill());assert.equal(horde.player.pendingSkill.element,'arcane');
  assert.equal(horde.restoreCheckpoint({...horde.createCheckpoint(),legacyRune:'fire'}),false);
  assert.equal(Ledger.selectRune({...mark,cleared:25},'fire').rune,'fire');
});
test('Weapon variant acquisition uses regional milestones and preserves the chosen base family',()=>{
  const original={version:1,cleared:9,weapon:''};
  assert.equal(Ledger.selectLegacy(original,'echo_bow'),null);
  const selected=Ledger.selectLegacy({...original,cleared:10},'echo_bow');
  assert.equal(selected.weapon,'bow');assert.equal(selected.variant,'echo_bow');
  const backup=Ledger.parseBackup(Ledger.backup([],null,null,selected));
  assert.deepEqual(backup.legacy,selected);
  assert.equal(Ledger.selectLegacy(selected,'blade').variant,undefined);
});
test('Selecting a variant through the engine entry point guarantees its base weapon in every opening offer',()=>{
  for(const seed of ['variant-a','variant-b','variant-c']){
    const run=new Engine();run.start({seed,legacyVariant:'echo_bow'});
    run.offerCards('start');
    for(let attempt=0;attempt<4;attempt++){
      assert(run.cards.some(card=>card.id==='bow'));
      if(attempt<3)assert(run.rerollCards());
    }
  }
});
test('Local achievements use recorded chapter clears and current-edition horde results only', () => {
  const fresh={version:1,cleared:0,weapon:''};
  assert.equal(Ledger.achievements(fresh,[]).filter(entry=>entry.unlocked).length,0);
  const old=[{edition:'0.4',name:'Lia',difficulty:'normal',wave:100,kills:50}];
  assert.equal(Ledger.achievements(fresh,old).filter(entry=>entry.unlocked).length,0);
  const recorded=[{edition:'0.5',name:'Lia',difficulty:'normal',wave:5,kills:12}];
  const partial={version:1,cleared:10,weapon:'bow'};
  assert.equal(Ledger.achievements(partial,recorded).filter(entry=>entry.unlocked).length,4);
  assert.equal(Ledger.achievements({version:2,cleared:25,weapon:''},[]).filter(entry=>entry.unlocked).length,0);
  assert.equal(Ledger.achievements(null,null).filter(entry=>entry.unlocked).length,0);
});

test('Achievement queries preserve their inputs, weapon choices and backup compatibility', () => {
  const legacy={version:1,cleared:25,weapon:'staff'};
  const records=[{edition:'0.5',name:'Lia',difficulty:'hard',wave:20,kills:50}];
  const before=JSON.stringify({legacy,records});
  const entries=Ledger.achievements(legacy,records);
  assert.equal(entries.filter(entry=>entry.unlocked).length,8);
  entries[0].unlocked=false;
  assert.equal(Ledger.achievements(legacy,records).filter(entry=>entry.unlocked).length,8);
  assert.equal(JSON.stringify({legacy,records}),before);
  assert.equal(Ledger.achievements(Ledger.selectLegacy(legacy,''),records).filter(entry=>entry.unlocked).length,8);
  const restored=Ledger.parseBackup(Ledger.backup(records,null,null,legacy));
  assert.deepEqual(Ledger.achievements(restored.legacy,restored.scores),Ledger.achievements(legacy,records));
});

test('Every chapter can resume with the maximum optional relic and shrine collection in three seeds',()=>{
  for(const seed of ['full-ledger-a','full-ledger-b','full-ledger-c']){
    let run=new Engine();run.start({mode:'adventure',seed});run.offerCards('start');assert(run.chooseCard(0));
    let expectedRelics=0;
    for(let chapter=0;chapter<CHAPTERS.length;chapter++){
      assert.equal(run.stage,chapter);run.enemies=[];run.portals=[];run.spawnQueue=[{}];
      for(const shrine of run.shrines){run.player.x=shrine.x-run.player.w/2;run.player.y=shrine.y-run.player.h;assert(run.useCheckpoint());assert(run.chooseCard(0));}
      for(const relic of run.relics){assert(!relic.disabled);run.player.x=relic.x-run.player.w/2;run.player.y=relic.y-run.player.h/2;run.player.vx=0;run.player.vy=0;run.player.ground=false;run.update(1/60,{});assert(relic.taken);expectedRelics++;}
      run.spawnQueue=[];run.update(1/60,{});assert(run.cleared);
      const source=copy(run.createCheckpoint()),restored=new Engine();
      assert(restored.restoreCheckpoint(source),'The maximum earned ledger must resume in chapter '+(chapter+1));
      assert.equal(restored.relicCount,expectedRelics);assert.equal(restored.score,run.score);assert.equal(restored.rerolls,run.rerolls);
      assert.deepEqual(restored.shrines.map(shrine=>shrine.used),run.shrines.map(shrine=>shrine.used));assert.deepEqual(restored.relics.map(relic=>relic.taken),run.relics.map(relic=>relic.taken));
      assert(restored.useCheckpoint());
      if(chapter<CHAPTERS.length-1)assert(restored.chooseCard(0));
      else assert.equal(restored.status,'ended');
      run=restored;
    }
    assert.equal(expectedRelics,11);assert.equal(run.score,2200);assert(run.won);
  }
});
console.log(passed + ' campaign continuation groups passed.');
