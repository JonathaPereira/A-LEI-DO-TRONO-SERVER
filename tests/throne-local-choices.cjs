'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-choices.ts'),
  import('../src/lib/games/throne-choice-protocol.ts'),
]);
const card = (value = 1) => ({
  id: `c${value - 1}`,
  suit: 'cetro',
  value,
  public: false,
  publicReason: null,
});
const context = (phase = 'choose-decree', patch = {}) => ({
  you: 0,
  round: 1,
  trick: 1,
  phase,
  lastShadow: 0,
  lastCrown: 0,
  hand: [card(), card(2)],
  reserve: card(3),
  players: [0, 1, 2, 3].map((seat) => ({ seat, name: `Casa ${seat}` })),
  lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
  ...patch,
});
async function fixture() {
  const [{ createThroneChoices }] = await modules;
  let identity = 'a',
    connected = false,
    visible = true,
    scope = null;
  const sources = new Set(),
    messages = new Set(),
    sends = [];
  const c = createThroneChoices({
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
  });
  const refresh = () => sources.forEach((fn) => fn());
  c.start();
  return {
    c,
    sends,
    sources,
    messages,
    emit: (message) => messages.forEach((fn) => fn(message)),
    visible(value) {
      visible = value;
      refresh();
    },
    identity(value) {
      identity = value;
      refresh();
    },
    online() {
      connected = true;
      scope = { key: 'a:room', seat: 0 };
      refresh();
    },
  };
}
test('local choices copy only own cards and public names without freezing mutable engine data', async () => {
  const [, { readThroneLocalChoiceContext }] = await modules;
  const raw = context();
  raw.players[1].hand = [card(12)];
  raw.deck = [card(10)];
  raw.token = 'secret';
  const c = readThroneLocalChoiceContext(raw);
  assert(Object.isFrozen(c.hand[0]));
  assert(!Object.isFrozen(raw.hand[0]));
  assert(!('hand' in c.players[1]));
  assert(!('deck' in c));
  assert(!('token' in c));
  raw.hand[0].value = 12;
  assert.equal(c.hand[0].value, 1);
  for (const bad of [
    context('bad'),
    context(undefined, { you: 1 }),
    context(undefined, { hand: [card(), card()] }),
    context(undefined, { reserve: card() }),
    context(undefined, { players: [] }),
  ])
    assert.throws(() => readThroneLocalChoiceContext(bad));
});
test('every local stage resolves once offline, with exact value types and no network action', async () => {
  const f = await fixture(),
    session = f.c.beginLocal();
  const stages = [
    [{ kind: 'choose-decree', options: ['favor', 'reserva'] }, 'favor'],
    [{ kind: 'choose-law', options: ['estandarte'] }, 'estandarte'],
    [{ kind: 'choose-trump', options: ['chave'] }, 'chave'],
    [{ kind: 'usurp-target', options: [{ seat: 1, name: 'Casa 1' }] }, 1],
    [{ kind: 'usurp-pick', count: 2, otherName: 'Casa 1', cards: [card(12)] }, 0],
    ...[
      'choose-reserva',
      'choose-corte',
      'choose-conselho',
      'rotation',
      'challenge',
      'usurp-give',
    ].map((kind) => [{ kind, cardIds: ['c0'] }, 'c0']),
  ];
  for (const [prompt, value] of stages) {
    const result = f.c.showLocal(session, context(prompt.kind), prompt);
    const offered = f.c.getSnapshot().prompt;
    assert.equal(f.c.getSnapshot().open, true);
    assert.equal(f.c.choose({ ...offered }, value), false);
    assert.equal(f.c.choose(offered, 'forged'), false);
    assert.equal(f.c.choose(offered, value), true);
    assert.equal(f.c.choose(offered, value), false);
    assert.equal(await result, value);
    assert.equal(f.c.getSnapshot().context, null);
  }
  assert.deepEqual(f.sends, []);
  f.c.dispose();
});
test('local choices reject wrong actors, self targets, exhausted laws and foreign cards', async () => {
  const f = await fixture(),
    session = f.c.beginLocal();
  for (const [prompt, patch] of [
    [{ kind: 'choose-law', options: ['ordem'] }, { lastShadow: 1 }],
    [{ kind: 'choose-law', options: ['ordem'] }, { lawUsage: { ...context().lawUsage, ordem: 2 } }],
    [{ kind: 'challenge', cardIds: ['c0'] }, { lastCrown: 1 }],
    [{ kind: 'usurp-target', options: [{ seat: 0, name: 'Casa 0' }] }, {}],
    [{ kind: 'usurp-target', options: [{ seat: 1, name: 'forged' }] }, {}],
    [{ kind: 'rotation', cardIds: ['c11'] }, {}],
    [{ kind: 'usurp-pick', count: 0 }, {}],
  ])
    await assert.rejects(f.c.showLocal(session, context(prompt.kind, patch), prompt));
  assert.equal(f.c.getSnapshot().prompt, null);
  f.c.dispose();
});
test('law preview and hidden navigation preserve the same unanswered choice; blind indices expose no faces', async () => {
  const f = await fixture(),
    session = f.c.beginLocal();
  const result = f.c.showLocal(session, context('choose-law'), {
    kind: 'choose-law',
    options: ['ordem'],
  });
  const offered = f.c.getSnapshot().prompt;
  f.c.preview(true);
  assert.equal(f.c.getSnapshot().preview, true);
  f.visible(false);
  assert.equal(f.c.getSnapshot().open, false);
  assert.equal(f.c.choose(offered, 'ordem'), false);
  f.visible(true);
  assert.equal(f.c.getSnapshot().prompt, offered);
  assert(f.c.getSnapshot().preview);
  f.c.preview(false);
  assert(f.c.choose(offered, 'ordem'));
  await result;
  const blind = f.c.showLocal(session, context('usurp-pick'), {
    kind: 'usurp-pick',
    count: 2,
    otherName: 'Casa 1',
    cards: [card(12)],
  });
  const p = f.c.getSnapshot().prompt;
  assert(!('cards' in p));
  for (const bad of ['0', -1, 2, 0.5]) assert.equal(f.c.choose(p, bad), false);
  assert(f.c.choose(p, 0));
  assert.equal(await blind, 0);
  f.c.dispose();
});
test('replacement, clear, identity ABA and disposal invalidate sessions and reject outstanding promises', async () => {
  for (const action of ['replace', 'clear', 'identity', 'dispose']) {
    const f = await fixture(),
      session = f.c.beginLocal();
    const pending = f.c.showLocal(session, context(), {
      kind: 'choose-decree',
      options: ['favor'],
    });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    const offered = f.c.getSnapshot().prompt;
    if (action === 'replace') f.c.beginLocal();
    if (action === 'clear') f.c.clear();
    if (action === 'identity') {
      f.identity('b');
      f.identity('a');
    }
    if (action === 'dispose') f.c.dispose();
    await rejected;
    assert.equal(f.c.choose(offered, 'favor'), false);
    await assert.rejects(
      f.c.showLocal(session, context(), { kind: 'choose-decree', options: ['favor'] }),
      { name: 'AbortError' },
    );
    f.c.dispose();
    assert.equal(f.sources.size, 0);
    assert.equal(f.messages.size, 0);
  }
});
test('background network data cannot replace a local choice; a real online start cancels it', async () => {
  const f = await fixture(),
    session = f.c.beginLocal();
  const pending = f.c.showLocal(session, context(), { kind: 'choose-decree', options: ['favor'] });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  const offered = f.c.getSnapshot().prompt;
  f.online();
  for (const message of [
    { type: 'game-state', state: {} },
    { type: 'game-prompt', prompt: {} },
    { type: 'error', code: 'INVALID_ACTION' },
  ])
    f.emit(message);
  assert.equal(f.c.getSnapshot().prompt, offered);
  await assert.rejects(
    f.c.showLocal(session, context(), { kind: 'choose-decree', options: ['favor'] }),
  );
  assert.equal(f.c.getSnapshot().prompt, offered);
  f.emit({ type: 'game-started' });
  await rejected;
  assert.equal(f.c.getSnapshot().context, null);
  assert.equal(f.c.choose(offered, 'favor'), false);
  f.c.dispose();
});
