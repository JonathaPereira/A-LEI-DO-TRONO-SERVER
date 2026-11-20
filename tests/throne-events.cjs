'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-events.ts'),
  import('../src/lib/games/throne-event-protocol.ts'),
  import('../src/lib/games/throne-effect-protocol.ts'),
]);
function match(patch = {}) {
  return {
    online: true,
    localPlayerId: 0,
    round: 1,
    trick: 1,
    phase: 'await-play',
    currentLaw: 'ordem',
    lastCrown: 0,
    lastShadow: 1,
    turn: 1,
    players: [0, 1, 2, 3].map((id) => ({
      id,
      name: `Casa ${id}`,
      hand: ['secret hand'],
      intelligence: 'secret clue',
    })),
    ...patch,
  };
}
const message = (event, data = {}) => ({ type: 'game-event', event, ...data });
const exchange = () =>
  message('exchange', {
    kind: 'usurpacao',
    title: 'Troca',
    moves: [
      { from: 0, to: 1 },
      { from: 1, to: 0, role: 'shadow', delay: 220 },
    ],
  });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function fixture() {
  const [{ createThroneEvents }] = await modules;
  let scope = { key: 'user:a:room', room: 'sala-chave', seat: 0 },
    connected = true,
    view = { mode: 'online', match: match() },
    releases = 0,
    requests = 0;
  const source = new Set(),
    messages = new Set(),
    calls = [],
    warnings = [],
    holds = new Set(),
    effects = {};
  for (const name of ['clear', 'toast', 'turn', 'influence', 'played', 'challenge', 'connection'])
    effects[name] = (...args) => {
      calls.push([name, ...args]);
    };
  effects.exchange = async (data) => {
    calls.push(['exchange', data]);
    return true;
  };
  effects.result = async (data) => {
    calls.push(['result', data]);
  };
  const c = createThroneEvents({
    scope: () => scope,
    match: () => view,
    connected: () => connected,
    effects,
    lawName: (law) => `Lei ${law}`,
    requestState() {
      requests++;
    },
    holdExchange() {
      const token = {};
      holds.add(token);
      return () => {
        releases++;
        holds.delete(token);
      };
    },
    subscribeSource(fn) {
      source.add(fn);
      return () => source.delete(fn);
    },
    subscribeMessages(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    warn: (error) => warnings.push(error),
  });
  const refresh = () => source.forEach((fn) => fn());
  c.start();
  return {
    c,
    effects,
    calls,
    warnings,
    holds,
    source,
    messages,
    releases: () => releases,
    requests: () => requests,
    emit: (value) => messages.forEach((fn) => fn(value)),
    scope(value) {
      scope = value;
      refresh();
    },
    connected(value) {
      connected = value;
      refresh();
    },
    view(value) {
      view = value;
      refresh();
    },
    refresh,
  };
}
test('event projections discard private extras and never reveal cards from play/result packets', async () => {
  const [, { readThroneEvent }] = await modules,
    table = match();
  assert.deepEqual(
    readThroneEvent(
      message('card-played', { playerId: 1, card: 'private card', hidden: false }),
      table,
    ),
    { kind: 'card-played', data: { seat: 1 } },
  );
  const data = readThroneEvent(
    message('trick-result', {
      crownId: 0,
      shadowId: 1,
      influenceGains: [{ seat: 2, after: 1, private: 'secret' }],
      revealedPlays: ['secret card'],
    }),
    table,
  );
  assert(!JSON.stringify(data).includes('secret'));
  assert(Object.isFrozen(data.data.players[0]));
  const influence = readThroneEvent(
    message('influence-used', {
      playerId: 0,
      name: 'wrong name',
      action: 'plus',
      cost: 2,
      modifier: 3,
    }),
    table,
  );
  assert.equal(influence.data.name, 'Casa 0');
  table.players[0].name = 'changed';
  assert.equal(data.data.players[0].name, 'Casa 0');
  for (const event of [
    'log',
    'private-intelligence',
    'usurp-private',
    'round-ended',
    'game-ended',
    'unknown-extension',
  ])
    assert.equal(readThroneEvent(message(event, { private: 'secret' }), table), null);
});
test('projected exchange moves can cross the effect boundary without losing roles or accepting cards', async () => {
  const [, { readThroneEvent }, { effectExchange }] = await modules;
  const projected = readThroneEvent(exchange(), match()).data;
  assert.equal(effectExchange(projected).moves[0].role, undefined);
  assert.equal(effectExchange(projected).moves[1].role, 'shadow');
  assert(!JSON.stringify(projected).includes('secret'));
});
test('malformed public events are rejected before reaching effects or acquiring a private hold', async () => {
  const f = await fixture();
  for (const m of [
    message('card-played', { playerId: 9 }),
    message('influence-used', { playerId: 0, action: 'plus', cost: 1 }),
    message('turn-timeout', { seat: 0, seconds: '60' }),
    message('exchange', { kind: 'rotation', moves: null }),
    message('challenge-reveal', {
      seat: 0,
      card: { id: 'c0', suit: 'cetro', value: 1, public: false, publicReason: null },
    }),
    message('player-replaced-by-bot', { seat: 0, name: 'Casa', botName: {} }),
    message('server-error', { message: 'x'.repeat(1001) }),
  ])
    f.emit(m);
  assert.equal(f.warnings.length, 7);
  assert.equal(f.calls.length, 0);
  assert.equal(f.holds.size, 0);
});
test('the dispatcher routes public notices and validated cards without mutating the match', async () => {
  const f = await fixture();
  f.emit(message('influence-used', { playerId: 0, action: 'sigilo' }));
  f.emit(message('card-played', { playerId: 2 }));
  f.emit(message('turn-timeout', { seat: 3, seconds: 60 }));
  f.emit(
    message('player-replaced-by-bot', {
      seat: 1,
      name: 'Casa 1',
      botName: 'Bot',
      reason: 'auth-expired',
    }),
  );
  f.emit(message('server-error', { message: 'Falha' }));
  const card = { id: 'c0', suit: 'cetro', value: 1, public: true, publicReason: 'Desafio' };
  f.emit(message('challenge-reveal', { seat: 0, card }));
  assert.deepEqual(
    f.calls.map((call) => call[0]),
    ['influence', 'played', 'toast', 'connection', 'toast', 'challenge'],
  );
  assert(f.calls[2][1].includes('Casa 3'));
  assert.equal(f.calls[5][1].card.value, 1);
  assert.deepEqual(f.warnings, []);
});
test('turn feedback occurs once per local trick and never from ticks, repeats or an opponent turn', async () => {
  const f = await fixture();
  f.c.start();
  assert.equal(f.messages.size, 1);
  assert.equal(f.source.size, 1);
  f.view({ mode: 'online', match: match({ turn: 0 }) });
  f.refresh();
  f.view({ mode: 'online', match: match({ turn: 0 }) });
  f.view({ mode: 'online', match: match({ turn: 1 }) });
  f.view({ mode: 'online', match: match({ turn: 0 }) });
  assert.equal(f.calls.filter((c) => c[0] === 'turn').length, 1);
  f.view({ mode: 'online', match: match({ turn: 0, trick: 2 }) });
  assert.equal(f.calls.filter((c) => c[0] === 'turn').length, 2);
  f.view({ mode: 'local', match: null });
  f.refresh();
  assert.equal(f.calls.filter((c) => c[0] === 'turn').length, 2);
});
test('local mode, cancelled participation, missing matches and disconnection suppress game effects', async () => {
  const f = await fixture(),
    play = message('card-played', { playerId: 0 });
  f.view({ mode: 'local', match: null });
  f.emit(play);
  f.view({ mode: 'online', match: null });
  f.emit(play);
  f.view({ mode: 'online', match: match() });
  f.connected(false);
  f.emit(play);
  f.connected(true);
  f.c.clear();
  f.emit(play);
  f.view({ mode: 'online', match: match({ trick: 2 }) });
  f.emit(play);
  assert.equal(f.calls.filter((c) => c[0] === 'played').length, 0);
  f.emit({ type: 'game-started', seat: 0, room: { id: 'wrong room' } });
  f.emit(play);
  assert.equal(f.requests(), 0);
  f.emit({ type: 'game-started', seat: 0, room: { id: 'sala-chave' } });
  f.emit(play);
  assert.equal(f.requests(), 1);
  assert.equal(f.calls.filter((c) => c[0] === 'played').length, 1);
});
test('each exchange holds its private presentation until completion, with guaranteed release on failure', async () => {
  const f = await fixture(),
    pending = deferred();
  f.effects.exchange = () => pending.promise;
  f.emit(exchange());
  assert.equal(f.holds.size, 1);
  pending.resolve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.holds.size, 0);
  assert.equal(f.releases(), 1);
  f.effects.exchange = async () => {
    throw new Error('animation failure');
  };
  f.emit(exchange());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.holds.size, 0);
  assert.equal(f.releases(), 2);
  assert.equal(f.warnings.length, 1);
});
test('changing scope or stage releases old holds immediately; a late failure cannot affect a new exchange', async () => {
  const f = await fixture(),
    old = deferred(),
    next = deferred();
  f.effects.exchange = () => old.promise;
  f.emit(exchange());
  f.scope({ key: 'user:b:room', room: 'sala-chave', seat: 0 });
  f.scope({ key: 'user:a:room', room: 'sala-chave', seat: 0 }); // The old A continuation must also fail after A → B → A.
  assert.equal(f.holds.size, 0);
  assert.equal(f.releases(), 1);
  f.effects.exchange = () => next.promise;
  f.emit(exchange());
  assert.equal(f.holds.size, 1);
  old.reject(new Error('late old failure'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.holds.size, 1);
  assert.deepEqual(f.warnings, []);
  f.view({ mode: 'online', match: match({ trick: 2 }) });
  assert.equal(f.holds.size, 0);
  assert.equal(f.releases(), 2);
  next.resolve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.releases(), 2);
});
test('disposing removes subscriptions, releases holds and blocks captured callbacks and late promises', async () => {
  const f = await fixture(),
    pending = deferred(),
    receive = [...f.messages][0];
  f.effects.exchange = () => pending.promise;
  f.emit(exchange());
  f.c.dispose();
  f.c.dispose();
  f.c.start();
  assert.equal(f.source.size, 0);
  assert.equal(f.messages.size, 0);
  assert.equal(f.holds.size, 0);
  const count = f.calls.length;
  receive(message('card-played', { playerId: 0 }));
  pending.reject(new Error('disposed task'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.length, count);
  assert.equal(f.releases(), 1);
  assert.deepEqual(f.warnings, []);
});
