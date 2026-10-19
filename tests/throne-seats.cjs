'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-seats.ts'),
  import('../src/lib/games/throne-match-protocol.ts'),
]);
function players() {
  return [0, 1, 2, 3].map((id) => ({
    id,
    seat: id,
    name: `Casa ${id}`,
    ai: id !== 0,
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
    hand: [{ secret: 'private' }],
    reserve: { secret: 'reserve' },
  }));
}
async function fixture() {
  const [{ createThroneSeats }] = await modules;
  let state = { mode: null, match: null };
  const source = new Set(),
    warnings = [];
  const controller = createThroneSeats({
    source: () => state,
    subscribeSource(fn) {
      source.add(fn);
      return () => source.delete(fn);
    },
    warn(error) {
      warnings.push(error);
    },
  });
  controller.start();
  return {
    controller,
    source,
    warnings,
    set(next) {
      state = next;
      source.forEach((fn) => fn());
    },
  };
}

test('public seats reuse the online match without clock notifications or accepting stale local projections', async () => {
  const f = await fixture(),
    [, { readThronePublicPlayers }] = await modules;
  const publicPlayers = readThronePublicPlayers(players());
  const match = { players: publicPlayers, turn: 1, localPlayerId: 0 };
  f.set({ mode: 'online', match });
  assert.equal(f.controller.getSnapshot().players, publicPlayers);
  let updates = 0;
  f.controller.subscribe(() => updates++);
  const before = f.controller.getSnapshot();
  f.set({ mode: 'online', match, status: { clock: '00:12' } });
  f.controller.setLocal({ players: players(), turn: 0, localSeat: 0 });
  assert.equal(f.controller.getSnapshot(), before);
  assert.equal(updates, 0);
  f.set({ mode: 'online', match: { ...match, turn: 2 } });
  assert.equal(f.controller.getSnapshot().turn, 2);
  assert.equal(updates, 1);
  f.set({ mode: 'online', match: null });
  assert.deepEqual(f.controller.getSnapshot().players, []);
  f.controller.setLocal({ players: players(), turn: 0, localSeat: 0 });
  assert.deepEqual(f.controller.getSnapshot().players, []);
  f.controller.dispose();
  assert.equal(f.source.size, 0);
});

test('local projection copies public cards, leaves the engine mutable and drops every private field', async () => {
  const f = await fixture(),
    raw = players();
  raw[1].publicCards = [
    { id: 'c12', suit: 'chave', value: 1, public: true, publicReason: 'Desafio', secret: 'ignore' },
  ];
  raw[1].intelligence = { secret: 'private clue' };
  f.set({ mode: 'local', match: null });
  const input = { players: raw, turn: 1, localSeat: 0 };
  f.controller.setLocal(input);
  const s = f.controller.getSnapshot();
  assert.equal(s.players[1].publicCards[0].id, 'c12');
  assert(Object.isFrozen(s.players[1].publicCards[0]));
  assert(!Object.isFrozen(raw[1].publicCards[0]));
  assert(s.players.every((p) => !('hand' in p) && !('reserve' in p) && !('intelligence' in p)));
  assert(!('secret' in s.players[1].publicCards[0]));
  f.controller.setLocal(input);
  assert.equal(f.controller.getSnapshot(), s);
  raw[1].publicCards[0].publicReason = 'Corte Aberta';
  raw[1].influence = 2;
  f.controller.setLocal(input);
  assert.equal(f.controller.getSnapshot().players[1].influence, 2);
  assert.equal(s.players[1].publicCards[0].publicReason, 'Desafio');
  // A clock/visibility refresh must not discard offline seats.
  f.set({ mode: 'local', match: null, visible: false });
  assert.equal(f.controller.getSnapshot().players.length, 4);
  f.set({ mode: null, match: null });
  assert.deepEqual(f.controller.getSnapshot().players, []);
  f.controller.dispose();
});

test('invalid public disclosures, duplicate seats/cards and impossible counters clear the local view', async () => {
  for (const corrupt of [
    (p) =>
      p[1].publicCards.push({
        id: 'c0',
        suit: 'cetro',
        value: 1,
        public: false,
        publicReason: null,
      }),
    (p) => {
      p[1].id = 0;
      p[1].seat = 0;
    },
    (p) => {
      p[1].influence = 3;
    },
    (p) => {
      p[1].handCount = 11;
    },
    (p) => {
      p[1].publicCards = p[2].publicCards = [
        { id: 'c0', suit: 'cetro', value: 1, public: true, publicReason: 'Corte Aberta' },
      ];
    },
  ]) {
    const f = await fixture();
    f.set({ mode: 'local', match: null });
    f.controller.setLocal({ players: players(), turn: 0, localSeat: 0 });
    const raw = players();
    corrupt(raw);
    f.controller.setLocal({ players: raw, turn: 0, localSeat: 0 });
    assert.equal(f.controller.getSnapshot().players.length, 0);
    assert.equal(f.warnings.length, 1);
    f.controller.dispose();
  }
});

test('demo has no human seat; cancellation and disposal cannot restore prior seats', async () => {
  const f = await fixture(),
    raw = players();
  raw.forEach((p) => {
    p.ai = true;
  });
  f.set({ mode: 'local', match: null });
  f.controller.setLocal({ players: raw, turn: 2, localSeat: null });
  assert.equal(f.controller.getSnapshot().localSeat, null);
  assert.equal(f.controller.getSnapshot().turn, 2);
  f.controller.setLocal({ players: raw, turn: 4, localSeat: null });
  assert.equal(f.controller.getSnapshot().players.length, 0);
  f.controller.dispose();
  f.controller.start();
  f.controller.setLocal({ players: raw, turn: 0, localSeat: null });
  assert.equal(f.controller.getSnapshot().players.length, 0);
  assert.equal(f.source.size, 0);
});
