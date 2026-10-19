'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const rules = require('../src/legacy/game-rules.js');
const modules = Promise.all([
  import('../src/lib/games/throne-table.ts'),
  import('../src/lib/games/throne-match-protocol.ts'),
  import('../src/lib/games/throne-court-copy.ts'),
]);
const card = (id) => ({
  id: `c${id}`,
  suit: 'cetro',
  value: id + 1,
  public: false,
  publicReason: null,
});
const play = (id, hidden = false) => ({
  playerId: id,
  order: id,
  hidden,
  card: hidden && id !== 0 ? null : card(id),
  modifier: 0,
  influenceAction: hidden ? 'sigilo' : 'none',
});
function raw(patch = {}) {
  return {
    round: 1,
    trick: 1,
    phase: 'await-play',
    currentLaw: 'ordem',
    lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
    trump: null,
    declaredLeadSuit: null,
    previousWinningSuit: null,
    decree: null,
    youSeat: 0,
    lastCrown: null,
    lastShadow: null,
    leader: 0,
    turn: 0,
    turnDeadline: null,
    players: [0, 1, 2, 3].map((id) => ({
      id,
      seat: id,
      name: `Casa ${id}`,
      ai: false,
      handCount: 10,
      reservePresent: false,
      publicCards: [],
      totalCrowns: 0,
      totalShadows: 0,
      roundCrowns: 0,
      roundShadows: 0,
      influence: 0,
      prestige: 0,
      pairs: 0,
    })),
    plays: [],
    ...patch,
  };
}
function local(patch = {}) {
  return { ...raw(), localSeat: 0, names: ['Casa 0', 'Casa 1', 'Casa 2', 'Casa 3'], ...patch };
}
async function fixture() {
  const [{ createThroneTable }, { readThroneMatch }] = await modules;
  let state = { mode: null, match: null },
    updates = 0;
  const source = new Set(),
    warnings = [];
  const controller = createThroneTable({
    rules,
    source: () => state,
    subscribeSource(fn) {
      source.add(fn);
      return () => source.delete(fn);
    },
    warn(error) {
      warnings.push(error);
    },
  });
  controller.subscribe(() => updates++);
  controller.start();
  return {
    controller,
    source,
    warnings,
    updates: () => updates,
    set(next) {
      state = next;
      source.forEach((fn) => fn());
    },
    online(value) {
      this.set({ mode: 'online', match: readThroneMatch(value, 0) });
    },
  };
}

test('online table retains only validated visible plays; clock and stale local writes cannot change it', async () => {
  const f = await fixture();
  f.online(raw({ plays: [play(0, true), play(1, true)] }));
  const before = f.controller.getSnapshot(),
    count = f.updates();
  assert.equal(before.plays[0].card.id, 'c0');
  assert.equal(before.plays[1].card, null);
  f.controller.setLocal(local({ plays: [play(0)] }));
  assert.equal(f.controller.getSnapshot(), before);
  assert.equal(f.updates(), count);
  f.set({ mode: 'online', match: null });
  assert.equal(f.controller.getSnapshot(), null);
  f.controller.dispose();
  assert.equal(f.source.size, 0);
});

test('a result reveals cards with one flip, retains public knowledge through masked choice snapshots and clears it in the next trick', async () => {
  const f = await fixture(),
    hidden = [0, 1, 2, 3].map((id) => play(id, true));
  f.online(raw({ plays: hidden }));
  const shown = hidden.map((p, id) => ({ ...p, hidden: false, card: card(id) }));
  const result = raw({ phase: 'trick-result', lastCrown: 3, lastShadow: 0, plays: shown });
  f.online(result);
  let s = f.controller.getSnapshot();
  assert.deepEqual(s.flipping, [0, 1, 2, 3]);
  assert.deepEqual(s.winners, { crown: 3, shadow: 0 });
  assert(s.plays.every((p) => !p.hidden && p.card));
  // Presence/clock consumers see the same match; no new flip or render.
  const [, { readThroneMatch }] = await modules,
    match = readThroneMatch(result, 0);
  f.set({ mode: 'online', match });
  const stable = f.controller.getSnapshot(),
    updates = f.updates();
  f.set({ mode: 'online', match, status: { clock: '00:20' } });
  assert.equal(f.controller.getSnapshot(), stable);
  assert.equal(f.updates(), updates);
  f.online({ ...result, phase: 'choose-law', plays: hidden });
  s = f.controller.getSnapshot();
  assert(s.plays.every((p) => !p.hidden && p.card));
  assert.deepEqual(s.flipping, []);
  assert.deepEqual(s.winners, { crown: 3, shadow: 0 });
  f.online(raw({ trick: 2, plays: [play(0, true), play(1, true)] }));
  s = f.controller.getSnapshot();
  assert.equal(s.plays[1].card, null);
  assert.equal(s.winners, null);
  assert.deepEqual(s.flipping, []);
  f.controller.dispose();
});

test('local table copies visible facts without freezing the motor or retaining its private extras', async () => {
  const f = await fixture();
  f.set({ mode: 'local', match: null });
  const value = local({
    plays: [play(0, true), play(1, true)],
    hand: ['secret'],
    intelligence: 'clue',
  });
  f.controller.setLocal(value);
  const s = f.controller.getSnapshot();
  assert(Object.isFrozen(s.plays[0].card));
  assert(!Object.isFrozen(value.plays[0].card));
  assert(!('hand' in s) && !('intelligence' in s) && !('players' in s));
  value.plays[0].card.value = 12;
  assert.equal(s.plays[0].card.value, 1);
  f.set({ mode: 'local', match: null, visible: false });
  assert.equal(f.controller.getSnapshot(), s);
  f.set({ mode: null, match: null });
  assert.equal(f.controller.getSnapshot(), null);
  f.controller.dispose();
});

test('local opponent peeks, malformed laws, duplicate actors and inconsistent modifiers clear the view', async () => {
  for (const change of [
    (value) => {
      value.plays = [play(0), { ...play(1, true), card: card(1) }];
    },
    (value) => {
      value.plays = [play(0), { ...play(1), playerId: 0 }];
    },
    (value) => {
      value.currentLaw = 'unknown';
    },
    (value) => {
      value.lawUsage.ordem = 3;
    },
    (value) => {
      value.plays = [{ ...play(0), modifier: 3 }];
    },
    (value) => {
      value.names[0] = '';
    },
  ]) {
    const f = await fixture();
    f.set({ mode: 'local', match: null });
    f.controller.setLocal(local());
    const value = local();
    change(value);
    f.controller.setLocal(value);
    assert.equal(f.controller.getSnapshot(), null);
    assert.equal(f.warnings.length, 1);
    f.controller.dispose();
  }
});

test('local winners require a complete reveal, survive score updates and reset on a new trick or cancellation', async () => {
  const f = await fixture();
  f.set({ mode: 'local', match: null });
  const value = local({ phase: 'resolve', plays: [0, 1, 2, 3].map((id) => play(id)) });
  f.controller.setLocal(value, { crown: 3, shadow: 0 });
  assert.deepEqual(f.controller.getSnapshot().winners, { crown: 3, shadow: 0 });
  f.controller.setLocal({ ...value, previousWinningSuit: 'cetro' });
  assert.deepEqual(f.controller.getSnapshot().winners, { crown: 3, shadow: 0 });
  f.controller.setLocal({ ...value, trick: 2, plays: [] });
  assert.equal(f.controller.getSnapshot().winners, null);
  f.controller.setLocal(value, { crown: 0, shadow: 0 });
  assert.equal(f.controller.getSnapshot(), null);
  f.controller.setLocal({ ...value, plays: [play(0)] }, { crown: 3, shadow: 0 });
  assert.equal(f.controller.getSnapshot().winners, null);
  f.set({ mode: null, match: null });
  assert.equal(f.controller.getSnapshot(), null);
  f.controller.dispose();
  f.controller.start();
  f.controller.setLocal(value);
  assert.equal(f.controller.getSnapshot(), null);
  assert.equal(f.source.size, 0);
});

test('court descriptions preserve law counts, trump, decree timing and succession context', async () => {
  const [, { readThroneCourt }, { throneLawTooltip, throneDecreeTooltip }] = await modules;
  let s = readThroneCourt(raw({ currentLaw: 'estandarte', trump: 'chave' }));
  assert.match(throneLawTooltip(rules, s, 'estandarte'), /Trunfo atual: Chave/);
  assert.match(throneLawTooltip(rules, s, 'ordem'), /1\/2/);
  for (const d of rules.decrees) {
    s = readThroneCourt(raw({ decree: { id: d.id }, trick: 10, previousWinningSuit: 'lamina' }));
    assert(throneDecreeTooltip(rules, s).startsWith(`${d.name}: ${d.text}`));
  }
  assert.match(
    throneDecreeTooltip(rules, readThroneCourt(raw({ decree: { id: 'reserva' }, trick: 10 }))),
    /nesta 10ª vaza/,
  );
  assert.match(
    throneDecreeTooltip(rules, readThroneCourt(raw({ decree: { id: 'silencio' }, trick: 3 }))),
    /BLOQUEADO/,
  );
  assert.match(
    throneDecreeTooltip(
      rules,
      readThroneCourt(raw({ decree: { id: 'sucessao' }, previousWinningSuit: 'lamina' })),
    ),
    /Lâmina/,
  );
});
