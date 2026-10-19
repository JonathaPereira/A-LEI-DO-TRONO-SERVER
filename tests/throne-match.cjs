'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-match.ts'),
  import('../src/lib/games/throne-match-protocol.ts'),
]);
const card = { id: 'c0', suit: 'cetro', value: 1, public: false, publicReason: null };
function table(patch = {}) {
  return {
    online: true,
    youSeat: 0,
    round: 1,
    trick: 1,
    phase: 'await-play',
    currentLaw: 'ordem',
    lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
    trump: null,
    declaredLeadSuit: null,
    decree: { id: 'favor', name: 'Ignored' },
    lastCrown: null,
    lastShadow: null,
    previousWinningSuit: null,
    leader: 0,
    turn: 0,
    turnDeadline: 160000,
    plays: [],
    players: [0, 1, 2, 3].map((id) => ({
      id,
      seat: id,
      name: 'Casa ' + id,
      ai: false,
      handCount: 10,
      reservePresent: false,
      publicCards: [],
      totalCrowns: 0,
      totalShadows: 0,
      roundCrowns: 0,
      roundShadows: 0,
      influence: 1,
      prestige: 0,
      pairs: 0,
      hand: [{ private: 'secret' }],
      reserve: { private: 'reserve' },
    })),
    ...patch,
  };
}
const play = (playerId = 0, patch = {}) => ({
  playerId,
  order: 0,
  hidden: false,
  card: structuredClone(card),
  modifier: 0,
  influenceAction: 'none',
  ...patch,
});
async function fixture() {
  const [{ createThroneMatch }] = await modules;
  let scope = { key: 'user:a:room', seat: 0 },
    connected = true,
    visible = true,
    now = 100000;
  const messages = new Set(),
    source = new Set(),
    ticks = new Set(),
    warnings = [];
  const controller = createThroneMatch({
    scope: () => scope,
    connected: () => connected,
    visible: () => visible,
    now: () => now,
    every250ms(fn) {
      ticks.add(fn);
      return () => ticks.delete(fn);
    },
    subscribeMessages(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    subscribeSource(fn) {
      source.add(fn);
      return () => source.delete(fn);
    },
    warn(error) {
      warnings.push(error);
    },
  });
  controller.start();
  const emit = (message) => messages.forEach((fn) => fn(message)),
    refresh = () => source.forEach((fn) => fn());
  return {
    controller,
    ticks,
    source,
    messages,
    warnings,
    emit,
    context(value = table()) {
      emit({ type: 'game-state', state: value });
      return controller.getSnapshot().match;
    },
    scope(value) {
      scope = value;
      refresh();
    },
    connected(value) {
      connected = value;
      refresh();
    },
    visible(value) {
      visible = value;
      refresh();
    },
    time(value) {
      now = value;
      ticks.forEach((fn) => fn());
    },
  };
}
test('public match parser clones/freezes visible facts, canonicalizes seats and drops hands, intelligence and raw decree content', async () => {
  const [, { readThroneMatch }] = await modules,
    raw = table();
  raw.intelligence = { card };
  raw.deck = [card];
  raw.players.reverse();
  const m = readThroneMatch(raw, 0);
  assert(Object.isFrozen(m.players[0]));
  assert(!Object.isFrozen(raw.players[0]));
  assert.deepEqual(
    m.players.map((p) => p.id),
    [0, 1, 2, 3],
  );
  assert.equal(m.decree, 'favor');
  assert(!('intelligence' in m));
  assert(!('deck' in m));
  assert(!('hand' in m.players[0]));
  assert(!('reserve' in m.players[0]));
  raw.players[0].name = 'Changed';
  assert.equal(m.players[3].name, 'Casa 3');
});
test('public match parser rejects malformed counters, duplicate seats/cards, unknown rules and impossible deadlines', async () => {
  const [, { readThroneMatch }] = await modules;
  const duplicate = table();
  duplicate.players[3].id = 0;
  duplicate.players[3].seat = 0;
  const negative = table();
  negative.players[0].influence = -1;
  const hiddenPublic = table();
  hiddenPublic.players[1].publicCards = [card];
  for (const raw of [
    duplicate,
    negative,
    hiddenPublic,
    table({ currentLaw: 'other' }),
    table({ decree: { id: 'other' } }),
    table({ phase: 'other' }),
    table({ turnDeadline: -1 }),
    table({ turn: 4 }),
    table({ players: [] }),
    table({ trick: 11 }),
  ])
    assert.throws(() => readThroneMatch(raw, 0));
  assert.throws(() => readThroneMatch(table(), 1));
});
test('visible play parser allows only own hidden peek or public reveal, with unique actors/order and matching modifiers', async () => {
  const [, { readThroneMatch }] = await modules;
  assert(
    readThroneMatch(
      table({ plays: [play(0, { hidden: true, influenceAction: 'plus', modifier: 3 })] }),
      0,
    ).plays[0].card,
  );
  assert.equal(
    readThroneMatch(
      table({ plays: [play(1, { hidden: true, card: null, influenceAction: 'sigilo' })] }),
      0,
    ).plays[0].card,
    null,
  );
  assert(
    readThroneMatch(table({ plays: [play(1, { influenceAction: 'plus', modifier: 3 })] }), 0)
      .plays[0].card,
  );
  for (const plays of [
    [play(1, { hidden: true })],
    [play(0, { card: null })],
    [play(0, { order: 1 })],
    [play(0, { modifier: 3 })],
    [play(), play(0, { order: 1 })],
  ])
    assert.throws(() => readThroneMatch(table({ plays }), 0));
});
test('one clock publishes exact seconds and warning thresholds without changing authoritative state', async () => {
  const f = await fixture(),
    match = f.context(),
    initial = f.controller.getSnapshot();
  assert.equal(f.ticks.size, 1);
  assert.equal(initial.status.clock, '01:00');
  assert(initial.status.yourTurn);
  f.time(100250);
  assert.strictEqual(f.controller.getSnapshot(), initial);
  f.time(140000);
  assert.equal(f.controller.getSnapshot().status.clock, '00:20');
  assert.equal(f.controller.getSnapshot().status.clockClass, 'warning');
  f.time(150000);
  assert.equal(f.controller.getSnapshot().status.clockClass, 'danger');
  f.time(161000);
  assert.equal(f.controller.getSnapshot().status.clock, '00:00');
  assert.equal(f.ticks.size, 0);
  assert.strictEqual(f.controller.getSnapshot().match, match);
  assert.equal(match.turnDeadline, 160000);
});
test('presence packets and unrelated messages preserve match identity and never create a second ticker', async () => {
  const f = await fixture(),
    m = f.context(),
    state = f.controller.getSnapshot();
  f.context();
  f.emit({ type: 'unrelated' });
  assert.strictEqual(f.controller.getSnapshot(), state);
  assert.strictEqual(f.controller.getSnapshot().match, m);
  assert.equal(f.ticks.size, 1);
});
test('hiding the table stops the ticker; resuming computes elapsed time from the same deadline', async () => {
  const f = await fixture(),
    m = f.context();
  f.visible(false);
  assert.equal(f.ticks.size, 0);
  f.time(135000);
  f.visible(true);
  assert.equal(f.controller.getSnapshot().status.clock, '00:25');
  assert.strictEqual(f.controller.getSnapshot().match, m);
  assert.equal(f.ticks.size, 1);
  f.context(table({ phase: 'choose-law', turn: null, turnDeadline: null }));
  assert.equal(f.ticks.size, 0);
  assert.equal(f.controller.getSnapshot().status.clockClass, 'idle');
});
test('identity ABA, room/seat changes and disconnect discard table and clock atomically', async () => {
  for (const reset of [
    (f) => {
      f.scope({ key: 'user:b:room', seat: 0 });
      f.scope({ key: 'user:a:room', seat: 0 });
    },
    (f) => f.scope({ key: 'user:a:other', seat: 0 }),
    (f) => f.scope({ key: 'user:a:room', seat: 1 }),
    (f) => f.connected(false),
  ]) {
    const f = await fixture();
    f.context();
    reset(f);
    assert.equal(f.controller.getSnapshot().match, null);
    assert.equal(f.ticks.size, 0);
    assert(!f.controller.getSnapshot().status.yourTurn);
    assert.equal(f.controller.getSnapshot().status.clockClass, 'idle');
  }
});
test('explicit cancellation blocks delayed state packets; a new match can reuse the first round/trick', async () => {
  const f = await fixture();
  f.context();
  f.controller.clear();
  f.context();
  assert.equal(f.controller.getSnapshot().match, null);
  assert.equal(f.controller.getSnapshot().mode, null);
  f.emit({ type: 'game-started' });
  assert(f.context());
  assert.equal(f.ticks.size, 1);
});
test('malformed and older snapshots cannot display a prior accepted table', async () => {
  const f = await fixture(),
    m = f.context(table({ round: 2 }));
  f.context();
  assert.strictEqual(f.controller.getSnapshot().match, m);
  f.context(table({ phase: 'invalid' }));
  assert.equal(f.controller.getSnapshot().match, null);
  assert.equal(f.warnings.length, 1);
  assert.equal(f.ticks.size, 0);
});
test('local status uses the same clock without retaining game objects or depending on connection', async () => {
  const f = await fixture(),
    input = {
      round: 1,
      trick: 2,
      phase: 'await-play',
      turnName: 'Casa local',
      yourTurn: true,
      deadline: 160000,
    };
  f.controller.setLocal(input);
  input.turnName = 'Changed';
  assert.equal(f.controller.getSnapshot().status.turn, 'Vez: Casa local');
  f.connected(false);
  f.time(151000);
  assert.equal(f.controller.getSnapshot().status.clock, '00:09');
  assert.equal(f.controller.getSnapshot().mode, 'local');
  assert.equal(f.ticks.size, 1);
  f.connected(true);
  f.context();
  assert.equal(f.controller.getSnapshot().match, null);
  f.controller.setLocal({ ...input, phase: 'trick-result', deadline: null });
  assert.equal(f.ticks.size, 0);
});
test('new deadlines replace expired turns; disposal cancels listeners, ticks and late callbacks', async () => {
  const f = await fixture();
  f.context();
  const late = [...f.ticks][0];
  f.time(161000);
  f.context(table({ trick: 2, turnDeadline: 221000 }));
  assert.equal(f.controller.getSnapshot().status.clock, '01:00');
  assert.equal(f.ticks.size, 1);
  f.controller.dispose();
  f.controller.dispose();
  late();
  f.controller.setLocal({});
  assert.equal(f.messages.size, 0);
  assert.equal(f.source.size, 0);
  assert.equal(f.ticks.size, 0);
  assert.equal(f.controller.getSnapshot().mode, null);
});
