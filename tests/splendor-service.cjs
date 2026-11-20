'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createSplendorService } = require('../server/splendor-service.ts');
const { readSplendorCommand, readSplendorMove } = require('../server/splendor-protocol.ts');
const Rules = require('../src/lib/games/splendor-rules.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
function fixture(ports = {}) {
  let clock = 0;
  const clients = [0, 1, 2].map((i) => ({
      account: { id: 'account-' + i, nickname: 'Pessoa ' + i, expiresAt: 1e12 },
      out: [],
    })),
    calls = [];
  const service = createSplendorService({
    auth: { configured: true },
    wss: { clients },
    send: (ws, event) => ws.out.push(event),
    now: () => clock,
    createRandom: () => () => 0.75,
    env: { SUPABASE_URL: 'https://provider.invalid', SUPABASE_SECRET_KEY: 'sb_secret_fixture' },
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return ports.fetch
        ? ports.fetch(url, options)
        : Response.json(url.endsWith('splendor_record_match') ? { saved: true } : []);
    },
  });
  return {
    service,
    clients,
    calls,
    start() {
      service.handle(clients[0], { action: 'create', maxPlayers: 2 });
      service.handle(clients[1], { action: 'join', roomId: clients[0].splendorRoomId });
      service.handle(clients[0], { action: 'start' });
      return service.rooms.get(clients[0].splendorRoomId);
    },
    finish(room) {
      let count = 0;
      while (room.state.phase !== 'finished') {
        clock += 1000;
        const actor = clients.find((c) => c.account.id === room.state.players[room.state.turn].id);
        service.handle(actor, {
          action: 'move',
          revision: room.state.revision,
          move: Rules.botMove(Rules.publicState(room.state, actor.account.id), () => 0.5),
        });
        assert(++count < 1000);
      }
    },
  };
}
test('Splendor bounds wallets/identifiers and projects only move fields without retaining caller vectors', () => {
  for (const bad of [
    null,
    [],
    { action: 'create', maxPlayers: 6 },
    { action: 'start', fillBots: 'true' },
    { action: 'ranking', requestId: [] },
    { action: 'move', revision: '0' },
  ])
    assert.throws(() => readSplendorCommand(bad));
  for (const bad of [
    null,
    [],
    {},
    { kind: 'take', tokens: [1, 1] },
    { kind: 'take', tokens: [1, 0, 0, 0, 0, 11] },
    { kind: 'reserve', level: 4 },
    { kind: 'buy', id: {} },
    { kind: 'buy', id: 'card', payment: [0, 0, 0, 0, 0, -1] },
    { kind: 'noble', id: 7 },
    { kind: 'take', tokens: [1, 1, 1, 0, 0, 0], returnTokens: 'forged' },
  ])
    assert.throws(() => readSplendorMove(bad), { code: 'SPLENDOR_INVALID_MOVE' });
  const tokens = [1, 1, 1, 0, 0, 0],
    value = readSplendorMove({ kind: 'take', tokens, score: 999 });
  tokens[0] = 99;
  assert.deepEqual(value, { kind: 'take', tokens: [1, 1, 1, 0, 0, 0] });
  assert.deepEqual(readSplendorMove({ kind: 'reserve', level: 2, id: 'discarded-extra' }), {
    kind: 'reserve',
    level: 2,
  });
});
test('blind reserves are visible only to their owner, including subsequent log/state broadcasts', () => {
  const f = fixture();
  try {
    const room = f.start(),
      actor = f.clients.find((c) => c.account.id === room.state.players[room.state.turn].id),
      other = f.clients.find((c) => c !== actor && room.players.some((p) => p.id === c.account.id));
    f.service.handle(actor, {
      action: 'move',
      revision: room.state.revision,
      move: { kind: 'reserve', level: 1 },
    });
    const own = actor.out.at(-1).room.state,
      remote = other.out.at(-1).room.state,
      card = own.players.find((p) => p.id === actor.account.id).reserved[0];
    assert(card.id);
    assert.equal(remote.players.find((p) => p.id === actor.account.id).reserved[0].hidden, true);
    assert(!('decks' in own));
    assert(!('decks' in remote));
    assert(!JSON.stringify(remote).includes(card.id));
    f.service.handle(other, { action: 'state' });
    assert(!JSON.stringify(other.out.at(-1)).includes(card.id));
    const outsider = f.clients[2];
    f.service.handle(outsider, { action: 'state' });
    assert.equal(outsider.out.at(-1).code, 'SPLENDOR_NOT_MEMBER');
    assert(!outsider.out.some((event) => event.type === 'splendor-state'));
  } finally {
    f.service.stop();
  }
});
test('invalid payments, token returns and stale moves cannot change authoritative wallets or scores', () => {
  const f = fixture();
  try {
    const room = f.start(),
      actor = f.clients.find((c) => c.account.id === room.state.players[room.state.turn].id),
      before = structuredClone(room.state);
    for (const move of [
      { kind: 'take', tokens: [1, 1, 1, 0, 0, 0], returnTokens: [1, 0, 0, 0, 0, 0] },
      { kind: 'buy', id: room.state.market[0][0].id, payment: [0, 0, 0, 0, 0, 10] },
    ]) {
      f.service.handle(actor, { action: 'move', revision: room.state.revision, move });
      assert.equal(actor.out.at(-1).code, 'SPLENDOR_INVALID_MOVE');
      assert.deepEqual(room.state, before);
    }
    f.service.handle(actor, { action: 'move', revision: -1, move: null });
    assert.equal(actor.out.at(-1).code, 'SPLENDOR_STALE');
    f.service.handle(actor, {
      action: 'move',
      revision: room.state.revision,
      move: { kind: 'take', tokens: [1, 1, 1, 0, 0, 0], score: 999 },
      score: 999,
    });
    const player = room.state.players.find((p) => p.id === actor.account.id);
    assert.equal(player.score, 0);
    assert.equal(
      player.tokens.reduce((a, b) => a + b, 0),
      3,
    );
  } finally {
    f.service.stop();
  }
});
test('record retries preserve match identity and calculated card counts without accepting client scores', async () => {
  let available = false;
  const f = fixture({
    fetch: async () => {
      if (!available) throw Error('offline');
      return Response.json({ saved: true });
    },
  });
  try {
    const room = f.start();
    f.finish(room);
    await tick();
    assert.equal(room.recordStatus, 'pending');
    const original = f.calls[0].body;
    assert.equal(original.p_mode, 'online');
    assert.equal(original.p_players.length, 2);
    for (const p of original.p_players) {
      assert.equal(p.cards, room.state.players.find((x) => x.id === p.id).cards.length);
      assert(!('rows' in p));
    }
    available = true;
    f.service.handle(f.clients[0], { action: 'retry-record', score: 999, cards: 999 });
    await tick();
    assert.equal(room.recordStatus, 'saved');
    assert.deepEqual(f.calls[1].body, original);
    f.service.handle(f.clients[0], { action: 'retry-record' });
    assert.equal(f.calls.length, 2);
  } finally {
    f.service.stop();
  }
});
test('ranking refuses malformed card counts and strips private provider fields', async () => {
  let records = [
    {
      playerId: 'account-a',
      name: 'Pessoa',
      score: 16,
      cards: 20,
      mode: 'online',
      date: '2026-10-21T12:00:00Z',
      email: 'private@example.test',
    },
  ];
  const f = fixture({ fetch: async () => Response.json(records) });
  try {
    const actor = f.clients[0];
    f.service.handle(actor, { action: 'ranking', requestId: 'first' });
    await tick();
    assert.equal(actor.out.at(-1).type, 'splendor-ranking');
    assert(!('email' in actor.out.at(-1).rows[0]));
    records = [{ ...records[0], cards: 91 }];
    f.service.handle(actor, { action: 'ranking', requestId: 'bad' });
    await tick();
    assert.equal(actor.out.at(-1).code, 'SPLENDOR_RANKING_UNAVAILABLE');
    assert.equal(f.service.health().ready, false);
  } finally {
    f.service.stop();
  }
});
test('stop cancels simultaneous record/ranking RPCs and late acknowledgements cannot publish or retry', async (t) => {
  const save = deferred(),
    list = deferred(),
    timers = new Set();
  t.mock.method(global, 'setTimeout', () => {
    const timer = { unref() {} };
    timers.add(timer);
    return timer;
  });
  t.mock.method(global, 'clearTimeout', (timer) => timers.delete(timer));
  const f = fixture({
    fetch: async (url) => (url.endsWith('splendor_record_match') ? save.promise : list.promise),
  });
  const room = f.start();
  f.finish(room);
  f.service.handle(f.clients[0], { action: 'ranking' });
  assert.equal(f.calls.length, 2);
  const before = f.clients.map((c) => c.out.length);
  f.service.stop();
  f.service.stop();
  assert(f.calls.every((call) => call.options.signal.aborted));
  save.resolve(Response.json({ saved: true }));
  list.resolve(Response.json([]));
  await tick();
  assert.equal(f.service.rooms.size, 0);
  assert.equal(f.service.health().ready, false);
  assert.equal(timers.size, 0);
  assert.deepEqual(
    f.clients.map((c) => c.out.length),
    before,
  );
  assert(f.clients.every((c) => c.splendorRoomId === null));
});
