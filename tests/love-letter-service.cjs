'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createLoveLetterService } = require('../server/love-letter-service.ts');
const { readLoveLetterCommand, readLoveLetterMove } = require('../server/love-letter-protocol.ts');
const Rules = require('../src/lib/games/love-letter-rules.ts');
function fixture(options = {}) {
  const clients = [0, 1, 2].map((i) => ({
    account: { id: 'account-' + i, nickname: 'Pessoa ' + i, expiresAt: 10000000 },
    out: [],
  }));
  const service = createLoveLetterService({
    wss: { clients },
    send: (ws, event) => ws.out.push(event),
    now: () => 0,
    createRandom: () => () => 0.75,
    ...options,
  });
  return {
    clients,
    service,
    start() {
      service.handle(clients[0], { action: 'create', maxPlayers: 2 });
      service.handle(clients[1], { action: 'join', roomId: clients[0].loveLetterRoomId });
      service.handle(clients[0], { action: 'start' });
      return service.rooms.get(clients[0].loveLetterRoomId);
    },
  };
}
test('opaque commands and moves are bounded and retain only their own domain fields', () => {
  for (const bad of [
    null,
    [],
    42,
    {},
    { action: 'constructor' },
    { action: 'create', maxPlayers: '2' },
    { action: 'create', maxPlayers: 7 },
    { action: 'join', roomId: {} },
    { action: 'start', fillBots: 'false' },
    { action: 'move', revision: NaN },
    { action: 'list', requestId: 'x'.repeat(129) },
  ])
    assert.throws(() => readLoveLetterCommand(bad));
  assert.deepEqual(
    readLoveLetterCommand({
      action: 'create',
      maxPlayers: 2,
      role: 'creator',
      state: { score: 100 },
    }),
    { action: 'create', maxPlayers: 2, requestId: undefined },
  );
  for (const bad of [
    null,
    [],
    {},
    { kind: 'play', cardId: [] },
    { kind: 'play', cardId: '1-0', targetId: {} },
    { kind: 'play', cardId: '1-0', guess: '9' },
    { kind: 'play', cardId: '1-0', guess: 10 },
    { kind: 'chancellor', keep: '1-0', bottom: ['1-0'] },
    { kind: 'chancellor', keep: '1-0', bottom: Array(100).fill('2-0') },
  ])
    assert.throws(() => readLoveLetterMove(bad), { code: 'LOVE_LETTER_INVALID_MOVE' });
  assert.deepEqual(
    readLoveLetterMove({ kind: 'play', cardId: '1-0', targetId: 'target', guess: 9, score: 999 }),
    { kind: 'play', cardId: '1-0', targetId: 'target', guess: 9 },
  );
});
test('malformed and stale moves leave private state and revision unchanged', () => {
  const f = fixture();
  try {
    const room = f.start(),
      actor = f.clients.find((c) => c.account.id === room.state.players[room.state.turn].id),
      before = structuredClone(room.state);
    for (const move of [
      null,
      { kind: 'play', cardId: [] },
      { kind: 'chancellor', keep: {}, bottom: [] },
    ]) {
      f.service.handle(actor, {
        action: 'move',
        revision: room.state.revision,
        move,
        requestId: 'attempt',
      });
      assert.equal(actor.out.at(-1).code, 'LOVE_LETTER_INVALID_MOVE');
      assert.equal(actor.out.at(-1).requestId, 'attempt');
      assert.deepEqual(room.state, before);
    }
    f.service.handle(actor, { action: 'move', revision: -1, move: null });
    assert.equal(actor.out.at(-1).code, 'LOVE_LETTER_STALE');
    f.service.handle(actor, {
      action: 'move',
      revision: room.state.revision,
      move: Rules.botMove(Rules.publicState(room.state, actor.account.id)),
    });
    assert.equal(room.state.revision, before.revision + 1);
  } finally {
    f.service.stop();
  }
});
test('a malformed start cannot coerce bot filling or mutate the open table', () => {
  const f = fixture();
  try {
    const actor = f.clients[0];
    f.service.handle(actor, { action: 'create', maxPlayers: 2 });
    const room = f.service.rooms.get(actor.loveLetterRoomId);
    f.service.handle(actor, { action: 'start', fillBots: 'false' });
    assert.equal(actor.out.at(-1).code, 'LOVE_LETTER_ACTION');
    assert.equal(room.players.length, 1);
    assert.equal(room.state, null);
    f.service.handle(actor, { action: 'next-round' });
    assert.equal(actor.out.at(-1).code, 'LOVE_LETTER_NOT_PLAYING');
    assert.equal(room.state, null);
    f.service.handle(actor, { action: 'start', fillBots: true });
    assert.equal(room.players.length, 2);
    assert(room.state);
  } finally {
    f.service.stop();
  }
});
test('views retain only the viewer hand/private effects and never authoritative deck or other account secrets', () => {
  const f = fixture();
  try {
    const room = f.start(),
      [a, b, outsider] = f.clients;
    for (const client of [a, b]) {
      const value = client.out.findLast((e) => e.type === 'love-letter-state').room.state;
      assert(!('deck' in value));
      assert.equal(typeof value.removed, 'boolean');
      assert(
        value.players
          .find((p) => p.id === client.account.id)
          .hand.every((card) => typeof card.rank === 'number'),
      );
      assert(
        value.players
          .find((p) => p.id !== client.account.id)
          .hand.every((card) => card.hidden === true),
      );
      assert(Array.isArray(value.private));
    }
    assert(!outsider.out.some((e) => e.type === 'love-letter-state'));
    f.service.handle(outsider, { action: 'state' });
    assert.equal(outsider.out.at(-1).code, 'LOVE_LETTER_NOT_MEMBER');
    const first = room.state.players[0],
      second = room.state.players[1];
    room.state.private[first.id] = [
      { kind: 'peek', revision: 0, targetId: second.id, card: second.hand[0] },
    ];
    f.service.handle(a, { action: 'state' });
    assert.equal(a.out.at(-1).room.state.private.length, 1);
    assert.equal(b.out.at(-1).room.state.private.length, 0);
  } finally {
    f.service.stop();
  }
});
test('rate limits preserve the exact boundary and expired identities never get private views', () => {
  let clock = 0;
  const f = fixture({ now: () => clock });
  try {
    const actor = f.clients[0];
    for (let n = 0; n < 100; n++) f.service.handle(actor, { action: 'list' });
    f.service.handle(actor, { action: 'list' });
    assert.equal(actor.out.at(-1).code, 'LOVE_LETTER_RATE_LIMIT');
    clock = 10000;
    f.service.handle(actor, { action: 'list' });
    assert.equal(actor.out.at(-1).code, 'LOVE_LETTER_RATE_LIMIT');
    clock++;
    f.service.handle(actor, { action: 'list' });
    assert.equal(actor.out.at(-1).type, 'love-letter-rooms');
    actor.account.expiresAt = clock;
    f.service.handle(actor, { action: 'create', maxPlayers: 2 });
    assert.equal(actor.out.at(-1).code, 'AUTH_REQUIRED');
    assert.equal(f.service.rooms.size, 0);
  } finally {
    f.service.stop();
  }
});
test('stop releases bot/disconnect/cleanup timers and private rooms; queued callbacks and later commands stay inert', (t) => {
  const timeouts = new Set(),
    intervals = new Set(),
    callbacks = [];
  t.mock.method(global, 'setTimeout', (fn) => {
    const timer = { unref() {} };
    timeouts.add(timer);
    callbacks.push(fn);
    return timer;
  });
  t.mock.method(global, 'clearTimeout', (timer) => timeouts.delete(timer));
  t.mock.method(global, 'setInterval', (fn) => {
    const timer = { unref() {} };
    intervals.add(timer);
    callbacks.push(fn);
    return timer;
  });
  t.mock.method(global, 'clearInterval', (timer) => intervals.delete(timer));
  const f = fixture(),
    actor = f.clients[0];
  f.service.handle(actor, { action: 'create', maxPlayers: 2 });
  f.service.handle(actor, { action: 'start', fillBots: true });
  const room = f.service.rooms.get(actor.loveLetterRoomId);
  assert.equal(room.state.turn, 1);
  assert(timeouts.size > 0);
  f.service.disconnect(actor);
  assert(timeouts.size >= 2);
  const previous = f.clients.map((c) => c.out.length);
  f.service.stop();
  f.service.stop();
  assert.equal(timeouts.size, 0);
  assert.equal(intervals.size, 0);
  assert.equal(f.service.rooms.size, 0);
  assert.equal(actor.loveLetterRoomId, null);
  assert.equal(actor.loveLetterWatching, false);
  callbacks.forEach((fn) => fn());
  f.service.handle(actor, { action: 'create', maxPlayers: 2 });
  f.service.updateAccount({ ...actor.account, nickname: 'Outro' });
  f.service.disconnect(actor);
  assert.deepEqual(
    f.clients.map((c) => c.out.length),
    previous,
  );
  assert.equal(timeouts.size, 0);
  assert.equal(f.service.health().available, false);
});
