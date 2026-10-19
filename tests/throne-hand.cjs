'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-hand.ts'),
  import('../src/lib/games/throne-hand-protocol.ts'),
]);
const cards = [
  { id: 'c0', suit: 'cetro', value: 1, public: false, publicReason: null },
  { id: 'c12', suit: 'chave', value: 1, public: false, publicReason: null },
];
function table(patch = {}) {
  return {
    youSeat: 0,
    round: 1,
    trick: 1,
    phase: 'await-play',
    turn: 0,
    leader: 0,
    plays: [],
    lastCrown: 0,
    lastShadow: 0,
    lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
    players: [0, 1, 2, 3].map((id) => ({
      id,
      seat: id,
      name: 'Casa ' + id,
      handCount: 2,
      hand: id === 0 ? structuredClone(cards) : undefined,
      reserve: null,
      influence: 2,
    })),
    legalCardIds: ['c0', 'c12'],
    influenceLegalCardIds: ['c0', 'c12'],
    canUseInfluence: true,
    canUseManeuver: true,
    influenceBlocked: false,
    decree: { name: 'Favor' },
    ...patch,
  };
}
async function fixture() {
  const [{ createThroneHand }] = await modules;
  let scope = { key: 'a:room', seat: 0 },
    connected = true,
    visible = true,
    send = () => true;
  const messages = new Set(),
    source = new Set(),
    calls = [],
    warnings = [];
  const controller = createThroneHand({
    scope: () => scope,
    connected: () => connected,
    visible: () => visible,
    subscribeSource(fn) {
      source.add(fn);
      return () => source.delete(fn);
    },
    subscribeMessages(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    send(action, payload) {
      calls.push({ action, payload });
      return send();
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
    calls,
    warnings,
    messages,
    source,
    emit,
    context(value = table()) {
      emit({ type: 'game-state', state: value });
      return controller.getSnapshot().context;
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
    send(fn) {
      send = fn;
    },
  };
}
test('hand protocol copies only viewer cards and authorized moves; raw and other private fields are not retained', async () => {
  const [, { readThroneHandContext }] = await modules,
    raw = table();
  raw.players[1].hand = [{ secret: 'not-yours' }];
  raw.deck = ['secret'];
  const c = readThroneHandContext(raw, 0);
  assert(Object.isFrozen(c.hand[0]));
  assert(!Object.isFrozen(raw.players[0].hand));
  assert(!('players' in c));
  assert(!('deck' in c));
  raw.players[0].hand[0].value = 12;
  assert.equal(c.hand[0].value, 1);
});
test('hand protocol rejects foreign, repeated, public Corte moves and inconsistent capabilities', async () => {
  const [, { readThroneHandContext }] = await modules;
  const corte = table();
  corte.players[0].hand[0].publicReason = 'Corte Aberta';
  corte.players[0].hand[0].public = true;
  const poor = table();
  poor.players[0].influence = 1;
  for (const raw of [
    table({ legalCardIds: ['c47'] }),
    table({ legalCardIds: ['c0', 'c0'] }),
    table({ influenceBlocked: true }),
    table({ canUseInfluence: false }),
    table({ turn: 1 }),
    table({ turn: 4 }),
    table({ canUseManeuver: 1 }),
    corte,
    poor,
  ])
    assert.throws(() => readThroneHandContext(raw, 0));
});
test('one current offered hand sends one exact normal play; presence does not release pending', async () => {
  const f = await fixture(),
    c = f.context();
  assert(f.controller.play(c, 'c0'));
  assert(!f.controller.play(c, 'c12'));
  f.context();
  assert.strictEqual(f.controller.getSnapshot().context, c);
  assert(f.controller.getSnapshot().pending);
  assert(!f.controller.play(c, 'c12'));
  assert.deepEqual(f.calls, [
    { action: 'play-card', payload: { cardId: 'c0', influenceAction: 'none', declaredSuit: null } },
  ]);
});
test('opening influence requires an eligible real suit and filters cards without changing server cards', async () => {
  const f = await fixture(),
    c = f.context();
  f.controller.toggleInfluence(c, true);
  assert(!f.controller.play(c, 'c0'));
  assert(f.controller.chooseInfluence(c, 'plus'));
  assert.equal(f.controller.getSnapshot().dialog, 'suit');
  assert(!f.controller.chooseSuit(c, 'mascara'));
  assert(f.controller.chooseSuit(c, 'chave'));
  assert(!f.controller.play(c, 'c0'));
  assert(f.controller.play(c, 'c12'));
  assert.deepEqual(f.calls[0].payload, {
    cardId: 'c12',
    influenceAction: 'plus',
    declaredSuit: 'chave',
  });
  assert.equal(c.hand[1].value, 1);
});
test('non-opening Sigilo and Manobra use no declaration; one balance cannot offer Manobra', async () => {
  for (const action of ['sigilo', 'plus', 'minus']) {
    const f = await fixture(),
      c = f.context(table({ plays: [{ playerId: 1 }], leader: 1 }));
    f.controller.toggleInfluence(c, true);
    assert(f.controller.chooseInfluence(c, action));
    assert.equal(f.controller.getSnapshot().dialog, null);
    assert(f.controller.play(c, 'c0'));
    assert.deepEqual(f.calls[0].payload, {
      cardId: 'c0',
      influenceAction: action,
      declaredSuit: null,
    });
  }
  const f = await fixture(),
    raw = table({ canUseManeuver: false });
  raw.players[0].influence = 1;
  const c = f.context(raw);
  f.controller.toggleInfluence(c, true);
  assert(!f.controller.chooseInfluence(c, 'plus'));
  assert(f.controller.chooseInfluence(c, 'sigilo'));
});
test('Corte cannot be concealed and blocked influence cannot open its choices', async () => {
  const f = await fixture(),
    raw = table({ influenceLegalCardIds: ['c12'] });
  raw.players[0].hand[0].public = true;
  raw.players[0].hand[0].publicReason = 'Corte Aberta';
  const c = f.context(raw);
  f.controller.toggleInfluence(c, true);
  f.controller.chooseInfluence(c, 'sigilo');
  f.controller.chooseSuit(c, 'chave');
  assert(!f.controller.play(c, 'c0'));
  f.controller.toggleInfluence(c, false);
  assert(f.controller.play(c, 'c0'));
  const other = await fixture(),
    blocked = other.context(
      table({
        influenceBlocked: true,
        canUseInfluence: false,
        canUseManeuver: false,
        influenceLegalCardIds: [],
      }),
    );
  other.controller.toggleInfluence(blocked, true);
  assert.equal(other.controller.getSnapshot().dialog, null);
});
test('phase, turn and hand changes invalidate old clicks and influence dialogs, including same coordinates in new games', async () => {
  const f = await fixture(),
    c = f.context();
  f.controller.toggleInfluence(c, true);
  f.emit({ type: 'game-started' });
  const next = f.context();
  assert(!f.controller.chooseInfluence(c, 'sigilo'));
  assert(!f.controller.play(c, 'c0'));
  assert.notStrictEqual(c, next);
  assert.equal(f.controller.getSnapshot().dialog, null);
  f.controller.toggleInfluence(next, true);
  const wait = f.context(
    table({
      turn: 1,
      legalCardIds: [],
      influenceLegalCardIds: [],
      canUseInfluence: false,
      canUseManeuver: false,
    }),
  );
  assert.equal(f.controller.getSnapshot().dialog, null);
  assert(!f.controller.play(wait, 'c0'));
});
test('same turn broadcasts keep selected action and declaration; hidden views retain choice but cannot play', async () => {
  const f = await fixture(),
    c = f.context();
  f.controller.toggleInfluence(c, true);
  f.controller.chooseInfluence(c, 'minus');
  f.controller.chooseSuit(c, 'cetro');
  f.context();
  assert.equal(f.controller.getSnapshot().action, 'minus');
  f.visible(false);
  assert(!f.controller.play(c, 'c0'));
  f.visible(true);
  assert.equal(f.controller.getSnapshot().declaredSuit, 'cetro');
  assert(f.controller.play(c, 'c0'));
});
test('identity/ABA, room/seat, disconnection and explicit clearing discard private hand and stale actions', async () => {
  for (const clear of [
    (f) => {
      f.scope({ key: 'b:room', seat: 0 });
      f.scope({ key: 'a:room', seat: 0 });
    },
    (f) => f.scope({ key: 'a:room2', seat: 0 }),
    (f) => f.scope({ key: 'a:room', seat: 1 }),
    (f) => f.connected(false),
    (f) => f.controller.clear(),
  ]) {
    const f = await fixture(),
      c = f.context();
    clear(f);
    assert.equal(f.controller.getSnapshot().context, null);
    assert(!f.controller.play(c, 'c0'));
    assert.equal(f.calls.length, 0);
  }
});
test('rejected and failed sends allow explicit retry without automatic duplicate commands', async () => {
  const f = await fixture(),
    c = f.context();
  f.send(() => false);
  assert(!f.controller.play(c, 'c0'));
  assert(!f.controller.getSnapshot().pending);
  f.send(() => true);
  assert(f.controller.play(c, 'c0'));
  f.emit({ type: 'error', code: 'INVALID_ACTION', message: 'Escolha outra carta.' });
  assert(!f.controller.getSnapshot().pending);
  assert.equal(f.controller.getSnapshot().notice, 'Escolha outra carta.');
  assert(f.controller.play(c, 'c12'));
  assert.equal(f.calls.length, 3);
});
test('sorting is presentation-only; older rounds do not restore hands and disposal releases subscriptions', async () => {
  const f = await fixture(),
    raw = table({ round: 2 }),
    c = f.context(raw);
  f.controller.sort();
  assert(f.controller.getSnapshot().sorted);
  assert.deepEqual(c.hand, raw.players[0].hand);
  f.context();
  assert.strictEqual(f.controller.getSnapshot().context, c);
  let updates = 0;
  f.controller.subscribe(() => updates++);
  f.emit({ type: 'unrelated' });
  assert.equal(updates, 0);
  f.controller.dispose();
  assert.equal(f.source.size, 0);
  assert.equal(f.messages.size, 0);
  assert.equal(f.controller.getSnapshot().context, null);
  assert(!f.controller.play(c, 'c0'));
});
test('invalid state clears private controls without exposing a previous local hand', async () => {
  const f = await fixture(),
    c = f.context();
  f.context(table({ legalCardIds: ['c47'] }));
  assert.equal(f.controller.getSnapshot().context, null);
  assert.equal(f.controller.getSnapshot().active, true);
  assert.equal(f.controller.getSnapshot().mode, 'online');
  assert(!f.controller.play(c, 'c0'));
  assert.equal(f.warnings.length, 1);
  f.controller.clear();
  assert.equal(f.controller.getSnapshot().active, false);
});

test('tenth-trick Reserve accepts the server authorization but remains automatic and cannot spend influence', async () => {
  const f = await fixture(),
    raw = table({
      trick: 10,
      decree: { id: 'reserva', name: 'Reserva' },
      legalCardIds: ['c0'],
      influenceLegalCardIds: ['c0'],
    });
  raw.players[0].hand = [];
  raw.players[0].handCount = 0;
  raw.players[0].reserve = structuredClone(cards[0]);
  const c = f.context(raw);
  assert(c.automaticReserve);
  assert.equal(f.warnings.length, 0);
  assert.equal(c.hand.length, 0);
  assert.equal(c.reserve.id, 'c0');
  f.controller.toggleInfluence(c, true);
  assert.equal(f.controller.getSnapshot().dialog, null);
  assert(!f.controller.play(c, 'c0'));
  assert.equal(f.calls.length, 0);
  raw.trick = 9;
  f.controller.clear();
  f.context(raw);
  assert.equal(f.controller.getSnapshot().context, null);
  assert.equal(f.warnings.length, 1);
});

test('all play-specific server rejections release only the current pending move', async () => {
  for (const code of [
    'ILLEGAL_CARD',
    'NO_INFLUENCE',
    'CORTE_INFLUENCE_BLOCKED',
    'BAD_DECLARATION',
  ]) {
    const f = await fixture(),
      c = f.context();
    f.controller.play(c, 'c0');
    f.emit({ type: 'error', code: 'OTHER_DOMAIN' });
    assert(f.controller.getSnapshot().pending);
    f.emit({ type: 'error', code, message: 'Recusada' });
    assert(!f.controller.getSnapshot().pending);
    assert.equal(f.calls.length, 1);
    assert(f.controller.play(c, 'c12'));
  }
});
