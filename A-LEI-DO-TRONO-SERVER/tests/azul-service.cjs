'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createAzulService } = require('../server/azul-service.ts');
const { createGameRanking } = require('../server/game-ranking.ts');
const { readAzulCommand, readAzulMove } = require('../server/azul-protocol.ts');
const { readAzulRanking } = require('../src/lib/games/azul-protocol.ts');
const Rules = require('../src/lib/games/azul-rules.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const entry = (patch = {}) => ({
  playerId: 'account-a',
  name: 'Pessoa',
  score: 70,
  mode: 'online',
  date: '2026-10-21T12:00:00Z',
  ...patch,
});
function fixture(ports = {}) {
  let clock = 0;
  const clients = [0, 1].map((i) => ({
      account: { id: 'account-' + i, nickname: 'Pessoa ' + i, expiresAt: 1e12 },
      out: [],
    })),
    calls = [];
  const service = createAzulService({
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
        : Response.json(url.endsWith('azul_record_match') ? { saved: true } : []);
    },
  });
  return {
    service,
    clients,
    calls,
    start() {
      service.handle(clients[0], { action: 'create', maxPlayers: 2 });
      service.handle(clients[1], { action: 'join', roomId: clients[0].azulRoomId });
      service.handle(clients[0], { action: 'start' });
      return service.rooms.get(clients[0].azulRoomId);
    },
    finish(room) {
      let count = 0;
      while (room.state.phase !== 'finished') {
        clock += 1000;
        const actor = clients.find((c) => c.account.id === room.state.players[room.state.turn].id);
        service.handle(actor, {
          action: 'move',
          revision: room.state.revision,
          move: Rules.botMove(room.state, () => 0.5),
        });
        assert(++count < 500);
      }
    },
  };
}
function ranking(fetchImpl, options = {}) {
  const scope = new AbortController();
  const provider = createGameRanking({
    game: 'azul',
    configured: true,
    url: 'https://provider.invalid',
    key: 'sb_secret_fixture',
    fetchImpl,
    signal: scope.signal,
    read: readAzulRanking,
    unavailable: () =>
      Object.assign(Error('Ranking indisponível.'), { code: 'AZUL_RANKING_UNAVAILABLE' }),
    ...options,
  });
  return { provider, scope };
}
test('Azul commands and moves reject opaque coercions while projecting only bounded domain fields', () => {
  for (const bad of [
    null,
    [],
    {},
    { action: 'create', maxPlayers: '2' },
    { action: 'create', maxPlayers: 6 },
    { action: 'start', fillBots: 'false' },
    { action: 'resume', roomId: [] },
    { action: 'move', revision: Infinity },
    { action: 'list', requestId: 7 },
  ])
    assert.throws(() => readAzulCommand(bad));
  for (const bad of [
    null,
    [],
    {},
    { source: '0', color: 1, row: 1 },
    { source: 9, color: 1, row: 1 },
    { source: 0, color: 5, row: 1 },
    { source: 0, color: 1, row: -2 },
  ])
    assert.throws(() => readAzulMove(bad), { code: 'AZUL_INVALID_MOVE' });
  assert.deepEqual(readAzulMove({ source: -1, color: 0, row: -1, score: 999 }), {
    source: -1,
    color: 0,
    row: -1,
  });
  const f = fixture();
  try {
    const actor = f.clients[0];
    f.service.handle(actor, { action: 'create', maxPlayers: 2 });
    f.service.handle(actor, { action: 'start', fillBots: 'false' });
    assert.equal(actor.out.at(-1).code, 'AZUL_ACTION');
    assert.equal([...f.service.rooms.values()][0].state, null);
  } finally {
    f.service.stop();
  }
});
test('ranking validates the complete page, strips private fields and rejects false save acknowledgements', async () => {
  let value = [entry({ email: 'private@example.test' })];
  const f = ranking(async () => Response.json(value));
  try {
    const rows = await f.provider.list();
    assert.equal(rows.length, 1);
    assert(!('email' in rows[0]));
    assert.equal(f.provider.ready, true);
    for (const bad of [
      null,
      [null],
      [entry(), entry()],
      Array.from({ length: 6 }, (_, n) => entry({ playerId: String(n) })),
      [entry({ score: '70' })],
      [entry({ date: 'invalid' })],
    ]) {
      value = bad;
      await assert.rejects(f.provider.list(), { code: 'AZUL_RANKING_UNAVAILABLE' });
      assert.equal(f.provider.ready, false);
    }
    value = { saved: false };
    await assert.rejects(f.provider.save({}), { code: 'AZUL_RANKING_UNAVAILABLE' });
    value = { saved: true, private: 'secret' };
    assert.equal(await f.provider.save({}), undefined);
    assert.equal(f.provider.ready, true);
  } finally {
    f.scope.abort();
  }
});
test('ranking preserves privileged key headers and masks malformed JSON or provider failures', async () => {
  for (const key of ['sb_secret_fixture', 'legacy-fixture-key']) {
    let options,
      response = Response.json([]);
    const f = ranking(
      async (_url, input) => {
        options = input;
        return response;
      },
      { key },
    );
    try {
      await f.provider.list();
      assert.equal(options.headers.apikey, key);
      assert.equal(
        options.headers.Authorization,
        key.startsWith('sb_secret_') ? undefined : 'Bearer ' + key,
      );
      response = new Response('private HTML response');
      await assert.rejects(
        f.provider.list(),
        (error) => error.code === 'AZUL_RANKING_UNAVAILABLE' && !error.message.includes('private'),
      );
      response = Response.json({ message: 'credential secret' }, { status: 500 });
      await assert.rejects(f.provider.list(), { code: 'AZUL_RANKING_UNAVAILABLE' });
    } finally {
      f.scope.abort();
    }
  }
});
test('caller cancellation preserves provider health while a real request timeout marks it unavailable', async (t) => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  let pending = false;
  const seen = [];
  const f = ranking(async (_url, options) => {
    if (!pending) return Response.json([]);
    seen.push(options.signal);
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () => reject(Error('private transport')), {
        once: true,
      }),
    );
  });
  try {
    await f.provider.list();
    pending = true;
    const caller = new AbortController(),
      first = f.provider.list(caller.signal),
      rejected = assert.rejects(first, { code: 'AZUL_RANKING_UNAVAILABLE' });
    caller.abort();
    await rejected;
    assert.equal(f.provider.ready, true);
    const second = f.provider.list(),
      failed = assert.rejects(second, { code: 'AZUL_RANKING_UNAVAILABLE' });
    deadline.abort();
    await failed;
    assert.equal(f.provider.ready, false);
    assert(seen.every((s) => s.aborted));
  } finally {
    f.scope.abort();
  }
});
test('manual failed retries keep one timer and the same server-calculated idempotent match', async (t) => {
  const timers = new Set();
  t.mock.method(global, 'setTimeout', () => {
    const timer = { unref() {} };
    timers.add(timer);
    return timer;
  });
  t.mock.method(global, 'clearTimeout', (timer) => timers.delete(timer));
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
    assert.equal(timers.size, 1);
    f.service.handle(f.clients[0], { action: 'retry-record', score: 999 });
    await tick();
    assert.equal(room.recordStatus, 'pending');
    assert.equal(timers.size, 1);
    available = true;
    f.service.handle(f.clients[0], { action: 'retry-record' });
    await tick();
    assert.equal(room.recordStatus, 'saved');
    assert.equal(timers.size, 0);
    assert.equal(f.calls.length, 3);
    assert.deepEqual(f.calls[0].body, f.calls[1].body);
    assert.deepEqual(f.calls[1].body, f.calls[2].body);
    assert(f.calls[0].body.p_players.every((p) => p.score !== 999));
    f.service.handle(f.clients[0], { action: 'retry-record' });
    assert.equal(f.calls.length, 3);
  } finally {
    f.service.stop();
  }
});
test('stop aborts a pending record and a provider ignoring abort cannot revive rooms, health or retry timers', async (t) => {
  const entered = deferred(),
    answer = deferred(),
    timers = new Set();
  t.mock.method(global, 'setTimeout', () => {
    const timer = { unref() {} };
    timers.add(timer);
    return timer;
  });
  t.mock.method(global, 'clearTimeout', (timer) => timers.delete(timer));
  const f = fixture({
    fetch: async () => {
      entered.resolve();
      return answer.promise;
    },
  });
  const room = f.start();
  f.finish(room);
  await entered.promise;
  const before = f.clients.map((c) => c.out.length);
  f.service.stop();
  f.service.stop();
  assert.equal(f.calls[0].options.signal.aborted, true);
  answer.resolve(Response.json({ saved: true }));
  await tick();
  assert.equal(f.service.rooms.size, 0);
  assert.equal(f.service.health().ready, false);
  assert.equal(timers.size, 0);
  assert.deepEqual(
    f.clients.map((c) => c.out.length),
    before,
  );
  f.service.handle(f.clients[0], { action: 'create', maxPlayers: 2 });
  assert.equal(f.service.rooms.size, 0);
});
test('disconnected or replaced identities never receive a late ranking response', async () => {
  for (const disconnect of [true, false]) {
    const entered = deferred(),
      answer = deferred(),
      f = fixture({
        fetch: async () => {
          entered.resolve();
          return answer.promise;
        },
      }),
      actor = f.clients[0];
    try {
      f.service.handle(actor, { action: 'ranking', requestId: 'top' });
      await entered.promise;
      if (disconnect) f.service.disconnect(actor);
      else actor.account = { ...actor.account, id: 'different-account' };
      answer.resolve(Response.json([entry()]));
      await tick();
      assert.equal(actor.out.length, 0);
      if (disconnect) assert.equal(f.calls[0].options.signal.aborted, true);
    } finally {
      f.service.stop();
    }
  }
});
