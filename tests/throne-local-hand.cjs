'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-hand.ts'),
  import('../src/lib/games/throne-local-hand-protocol.ts'),
]);
function hand(patch = {}) {
  return {
    you: 0,
    round: 1,
    trick: 1,
    phase: 'await-play',
    turn: 0,
    opening: true,
    automaticReserve: false,
    hand: [
      { id: 'c0', suit: 'cetro', value: 1, public: false, publicReason: null },
      { id: 'c12', suit: 'chave', value: 1, public: true, publicReason: 'Corte Aberta' },
    ],
    reserve: null,
    influence: 2,
    legal: ['c0', 'c12'],
    hiddenLegal: ['c0'],
    canUseInfluence: true,
    canUseManeuver: true,
    influenceBlocked: false,
    decreeName: 'Favor',
    ...patch,
  };
}
async function fixture() {
  const [{ createThroneHand }] = await modules;
  let identity = 'a',
    connected = false,
    visible = true,
    scope = null;
  const sources = new Set(),
    messages = new Set(),
    sends = [],
    warnings = [];
  const c = createThroneHand({
    identity: () => identity,
    scope: () => scope,
    connected: () => connected,
    visible: () => visible,
    subscribeSource(fn) {
      sources.add(fn);
      return () => sources.delete(fn);
    },
    subscribeMessages(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    send(...args) {
      sends.push(args);
      return true;
    },
    warn: (error) => warnings.push(error),
  });
  const refresh = () => sources.forEach((fn) => fn());
  c.start();
  return {
    c,
    sends,
    sources,
    messages,
    warnings,
    session: () => c.beginLocal(),
    identity(value) {
      identity = value;
      refresh();
    },
    visible(value) {
      visible = value;
      refresh();
    },
    online() {
      connected = true;
      scope = { key: 'a:room', seat: 0 };
      refresh();
    },
    emit: (value) => messages.forEach((fn) => fn(value)),
  };
}
test('local hand projection validates canonical own cards and permissions without freezing the engine', async () => {
  const [, { readThroneLocalHand }] = await modules,
    raw = hand();
  raw.deck = ['secret'];
  raw.players = [{ hand: 'opponent secret' }];
  raw.hand[0].extra = 'secret';
  const parsed = readThroneLocalHand(raw, false);
  assert(Object.isFrozen(parsed.hand[0]));
  assert(!Object.isFrozen(raw.hand[0]));
  assert(!JSON.stringify(parsed).includes('secret'));
  raw.hand[0].value = 12;
  assert.equal(parsed.hand[0].value, 1);
  for (const invalid of [
    hand({ you: 1 }),
    hand({ legal: ['c47'] }),
    hand({ hiddenLegal: ['c12'] }),
    hand({ canUseManeuver: true, influence: 1 }),
    hand({ phase: 'setup' }),
    hand({ automaticReserve: true }),
    hand({ turn: 3 }),
  ])
    assert.throws(() => readThroneLocalHand(invalid, false));
  assert.throws(() => readThroneLocalHand(hand(), true));
});
test('local play works offline, resolves once with bounded geometry and never sends a socket command', async () => {
  const f = await fixture(),
    session = f.session(),
    raw = hand(),
    result = f.c.waitLocal(session, raw),
    offered = f.c.getSnapshot().context;
  assert(f.c.play(offered, 'c0', { left: 10, top: 20, width: 80, height: 110, src: 'private' }));
  assert(!f.c.play(offered, 'c0'));
  assert.deepEqual(await result, {
    cardId: 'c0',
    influenceAction: 'none',
    declaredSuit: null,
    origin: { left: 10, top: 20, width: 80, height: 110 },
  });
  assert.deepEqual(f.sends, []);
  assert(!Object.isFrozen(raw.hand));
  assert.equal(f.c.waitingLocal, false);
});
test('local influence shares declaration, legal-card and cost controls while leaving rule application to the engine', async () => {
  const f = await fixture(),
    session = f.session(),
    result = f.c.waitLocal(session, hand()),
    offered = f.c.getSnapshot().context;
  f.c.toggleInfluence(offered, true);
  assert(f.c.chooseInfluence(offered, 'plus'));
  assert(!f.c.play(offered, 'c0'));
  assert(!f.c.chooseSuit(offered, 'chave'));
  assert(f.c.chooseSuit(offered, 'cetro'));
  assert(!f.c.play(offered, 'c12'));
  assert(f.c.play(offered, 'c0'));
  assert.equal((await result).influenceAction, 'plus');
  assert.equal(offered.influence, 2);
  assert.deepEqual(f.sends, []);
});
test('hiding retains local choices but blocks clicks; an engine timeout can resolve the hidden offer once', async () => {
  const f = await fixture(),
    session = f.session(),
    result = f.c.waitLocal(session, hand()),
    offered = f.c.getSnapshot().context;
  f.c.toggleInfluence(offered, true);
  f.c.chooseInfluence(offered, 'minus');
  f.visible(false);
  assert.equal(f.c.getSnapshot().dialog, 'suit');
  assert(!f.c.play(offered, 'c0'));
  assert(!f.c.timeoutLocal(offered, 'c47'));
  assert(f.c.timeoutLocal(offered, 'c12'));
  assert.deepEqual(await result, {
    cardId: 'c12',
    influenceAction: 'none',
    declaredSuit: null,
    origin: null,
  });
  assert(!f.c.timeoutLocal(offered, 'c0'));
  assert.equal(f.c.getSnapshot().dialog, null);
});
test('equal refreshes preserve selections but a replacement offer always invalidates previous click and timeout tokens', async () => {
  const f = await fixture(),
    session = f.session(),
    old = f.c.waitLocal(session, hand()),
    offered = f.c.getSnapshot().context;
  f.c.toggleInfluence(offered, true);
  f.c.chooseInfluence(offered, 'sigilo');
  f.c.presentLocal(session, hand());
  assert.equal(f.c.getSnapshot().context, offered);
  assert.equal(f.c.getSnapshot().dialog, 'suit');
  const rejected = assert.rejects(old, { name: 'AbortError' }),
    next = f.c.waitLocal(session, hand());
  await rejected;
  assert.notEqual(f.c.getSnapshot().context, offered);
  assert(!f.c.play(offered, 'c0'));
  assert(!f.c.timeoutLocal(offered, 'c0'));
  f.c.clear();
  await assert.rejects(next, { name: 'AbortError' });
});
test('identity ABA, new local sessions, cancellation and disposal reject pending offers without restoring old hands', async () => {
  const f = await fixture(),
    first = f.session(),
    pending = f.c.waitLocal(first, hand()),
    offered = f.c.getSnapshot().context;
  f.identity('b');
  f.identity('a');
  await assert.rejects(pending, { name: 'AbortError' });
  assert(!f.c.presentLocal(first, hand()));
  assert(!f.c.play(offered, 'c0'));
  const second = f.session(),
    next = f.c.waitLocal(second, hand());
  f.c.dispose();
  await assert.rejects(next, { name: 'AbortError' });
  assert.equal(f.sources.size, 0);
  assert.equal(f.messages.size, 0);
  assert.throws(f.session, { name: 'AbortError' });
});
test('local mode ignores background state packets, while an authoritative new game replaces it and cancels its offer', async () => {
  const f = await fixture(),
    session = f.session(),
    result = f.c.waitLocal(session, hand());
  f.online();
  f.emit({ type: 'game-state', state: {} });
  assert.equal(f.c.getSnapshot().mode, 'local');
  assert(f.c.waitingLocal);
  f.emit({ type: 'game-started' });
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(f.c.getSnapshot().mode, 'online');
  assert(!f.c.presentLocal(session, hand()));
});
test('invalid geometry does not settle a move; demo projections never accept AI private cards or enabled actions', async () => {
  const f = await fixture(),
    session = f.session(),
    result = f.c.waitLocal(session, hand()),
    offered = f.c.getSnapshot().context;
  assert(!f.c.play(offered, 'c0', { left: NaN, top: 0, width: 0, height: 100 }));
  assert(f.c.waitingLocal);
  assert(f.c.play(offered, 'c0'));
  await result;
  const demo = hand({
    hand: [],
    influence: 0,
    legal: [],
    hiddenLegal: [],
    canUseInfluence: false,
    canUseManeuver: false,
    opening: false,
  });
  assert(f.c.presentLocal(session, demo, true));
  assert(f.c.getSnapshot().demo);
  assert.equal(f.c.getSnapshot().context.hand.length, 0);
  assert(!f.c.play(f.c.getSnapshot().context, 'c0'));
});
