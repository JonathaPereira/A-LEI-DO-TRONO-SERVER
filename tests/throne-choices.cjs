'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-choices.ts'),
  import('../src/lib/games/throne-choice-protocol.ts'),
]);
const card = (value = 1) => ({
  id: 'c' + (value - 1),
  suit: 'cetro',
  value,
  public: false,
  publicReason: null,
});
const table = (phase = 'choose-decree', patch = {}) => ({
  youSeat: 0,
  round: 1,
  trick: 1,
  phase,
  lastCrown: 0,
  lastShadow: 0,
  lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
  players: [0, 1, 2, 3].map((seat) => ({
    id: seat,
    seat,
    name: 'Casa ' + seat,
    handCount: 2,
    hand: seat === 0 ? [card(), card(2)] : undefined,
    reserve: null,
  })),
  ...patch,
});
const prompt = (kind = 'choose-decree', patch = {}) => ({
  id: 'p1',
  kind,
  options: ['favor', 'reserva'],
  ...patch,
});
async function fixture() {
  const [{ createThroneChoices }] = await modules;
  let scope = { key: 'user:a:sala-cetro', seat: 0 },
    connected = true,
    visible = true;
  let send = () => true;
  const messages = new Set(),
    source = new Set(),
    calls = [],
    warnings = [];
  const controller = createThroneChoices({
    scope: () => scope,
    connected: () => connected,
    visible: () => visible,
    subscribeMessages(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    subscribeSource(fn) {
      source.add(fn);
      return () => source.delete(fn);
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
  return {
    controller,
    calls,
    warnings,
    messages,
    source,
    emit(message) {
      messages.forEach((fn) => fn(message));
    },
    context(value = table()) {
      this.emit({ type: 'game-state', state: value });
    },
    prompt(value = prompt()) {
      this.emit({ type: 'game-prompt', prompt: value });
    },
    scope(value) {
      scope = value;
      source.forEach((fn) => fn());
    },
    visible(value) {
      visible = value;
      source.forEach((fn) => fn());
    },
    connected(value) {
      connected = value;
      source.forEach((fn) => fn());
    },
    send(fn) {
      send = fn;
    },
    choose(value) {
      return controller.choose(controller.getSnapshot().prompt, value);
    },
  };
}
test('choice context clones/freezes only viewer cards and public names without retaining other private fields', async () => {
  const [, { readThroneChoiceContext }] = await modules;
  const raw = table();
  raw.players[1].hand = [{ secret: 'other-hand' }];
  raw.players[0].token = 'private';
  raw.deck = [card(12)];
  const value = readThroneChoiceContext(raw, 0);
  assert(Object.isFrozen(value.hand[0]));
  assert(!Object.isFrozen(raw));
  assert(!('hand' in value.players[1]));
  assert(!('token' in value));
  assert(!('deck' in value));
  raw.players[0].hand[0].value = 12;
  assert.equal(value.hand[0].value, 1);
  for (const bad of [
    table('unknown'),
    table('choose-decree', { youSeat: 1 }),
    table('choose-decree', { round: 0 }),
    table('choose-decree', { players: [] }),
  ])
    assert.throws(() => readThroneChoiceContext(bad, 0));
  const duplicate = table();
  duplicate.players[0].hand[1] = card();
  assert.throws(() => readThroneChoiceContext(duplicate, 0));
});
test('prompt parser validates each shape and strips hidden-card identities and extra server fields', async () => {
  const [, { readThronePrompt }] = await modules;
  const blind = readThronePrompt({
    id: 'p2',
    kind: 'usurp-pick',
    count: 2,
    cards: [card()],
    otherName: 'Outra Casa',
  });
  assert(!('cards' in blind));
  assert(Object.isFrozen(blind));
  for (const bad of [
    prompt('unknown'),
    prompt('choose-law', { options: ['unknown'] }),
    prompt('choose-trump', { options: ['cetro', 'cetro'] }),
    { id: 'p0', kind: 'usurp-pick', count: 1 },
    { id: 'p1', kind: 'usurp-pick', count: 11 },
    { id: 'p1', kind: 'challenge', cardIds: ['c48'] },
  ])
    assert.throws(() => readThronePrompt(bad));
});
test('decree choice sends the exact offered value once and waits across same-phase presence updates', async () => {
  const f = await fixture();
  f.context();
  f.prompt();
  const offered = f.controller.getSnapshot().prompt;
  assert.equal(f.choose('corte'), false);
  assert.equal(f.choose('favor'), true);
  assert.equal(f.choose('favor'), false);
  f.context();
  assert.equal(f.controller.getSnapshot().pending, true);
  assert.strictEqual(f.controller.getSnapshot().prompt, offered);
  assert.deepEqual(f.calls, [{ action: 'choose-decree', payload: { value: 'favor' } }]);
  f.context(table('await-play'));
  assert.equal(f.controller.getSnapshot().prompt, null);
  f.prompt();
  assert.equal(f.controller.getSnapshot().prompt, null);
});
test('card prompt arriving before the multi-player phase is held until the next matching state', async () => {
  const f = await fixture();
  f.context();
  f.prompt({ id: 'p2', kind: 'choose-reserva', cardIds: ['c0', 'c1'] });
  assert.equal(f.controller.getSnapshot().prompt, null);
  f.context(table('choose-reserva'));
  assert.equal(f.controller.getSnapshot().open, true);
  assert.equal(f.choose('c2'), false);
  assert.equal(f.choose('c1'), true);
  assert.deepEqual(f.calls, [{ action: 'choose-reserva', payload: { cardId: 'c1' } }]);
});
test('rotation prompt may precede its state; a queue that does not match the next state is discarded', async () => {
  const f = await fixture();
  f.context(table('trick-result'));
  f.prompt({ id: 'p1', kind: 'rotation', cardIds: ['c0'] });
  f.context(table('rotation'));
  assert.equal(f.choose('c0'), true);
  f.prompt({ id: 'p2', kind: 'choose-corte', cardIds: ['c0'] });
  f.context(table('await-play'));
  f.context(table('choose-corte'));
  assert.equal(f.controller.getSnapshot().prompt, null);
});
test('law hand preview keeps only own cards/reserve and a same-phase update preserves the preview', async () => {
  const f = await fixture(),
    raw = table('choose-law');
  raw.players[0].reserve = card(3);
  f.context(raw);
  f.prompt(prompt('choose-law', { options: ['anarquia', 'usurpacao'] }));
  f.controller.preview(true);
  f.context(raw);
  assert.equal(f.controller.getSnapshot().preview, true);
  assert.equal(f.controller.getSnapshot().context.reserve.id, 'c2');
  f.controller.preview(false);
  assert.equal(f.choose('ordem'), false);
  assert.equal(f.choose('anarquia'), true);
  assert.deepEqual(f.calls[0], { action: 'choose-law', payload: { value: 'anarquia' } });
});
test('shadow/crown choices are rejected for another actor, self targets and cards outside the own hand', async () => {
  const f = await fixture();
  f.context(table('choose-trump', { lastShadow: 1 }));
  f.prompt(prompt('choose-trump', { options: ['cetro'] }));
  assert.equal(f.controller.getSnapshot().prompt, null);
  f.context(table('usurp-target'));
  f.prompt({ id: 'p2', kind: 'usurp-target', options: [{ seat: 0, name: 'Casa 0' }] });
  assert.equal(f.controller.getSnapshot().prompt, null);
  f.context(table('challenge', { lastCrown: 1 }));
  f.prompt({ id: 'p3', kind: 'challenge', cardIds: ['c0'] });
  assert.equal(f.controller.getSnapshot().prompt, null);
  f.context(table('choose-conselho'));
  f.prompt({ id: 'p4', kind: 'choose-conselho', cardIds: ['c3'] });
  assert.equal(f.controller.getSnapshot().prompt, null);
  assert.deepEqual(f.calls, []);
});
test('usurpation target, offered card and blind position preserve payload types, including position zero', async () => {
  const f = await fixture();
  f.context(table('usurp-target'));
  f.prompt({ id: 'p1', kind: 'usurp-target', options: [{ seat: 2, name: 'Casa 2' }] });
  assert.equal(f.choose(2), true);
  f.context(table('usurp-give'));
  f.prompt({ id: 'p2', kind: 'usurp-give', cardIds: ['c0'], otherName: 'Casa 2' });
  assert.equal(f.choose('c0'), true);
  f.context(table('usurp-pick'));
  f.prompt({ id: 'p3', kind: 'usurp-pick', count: 2, otherName: 'Casa 2' });
  assert.equal(f.choose(2), false);
  assert.equal(f.choose(0), true);
  assert.deepEqual(f.calls, [
    { action: 'usurp-target', payload: { targetSeat: 2 } },
    { action: 'usurp-give', payload: { cardId: 'c0' } },
    { action: 'usurp-pick', payload: { index: 0 } },
  ]);
});
test('old handlers cannot choose on a new prompt or a new match that reuses the same prompt ID', async () => {
  const f = await fixture();
  f.context();
  f.prompt();
  const old = f.controller.getSnapshot().prompt;
  f.emit({ type: 'game-started' });
  f.context();
  f.prompt();
  assert.equal(f.controller.choose(old, 'favor'), false);
  assert.equal(f.choose('favor'), true);
});
test('identity ABA, room/seat changes and disconnect clear private context and pending choices atomically', async () => {
  const f = await fixture();
  f.context();
  f.prompt();
  f.choose('favor');
  const values = [];
  const off = f.controller.subscribe(() => values.push(f.controller.getSnapshot()));
  f.scope(null);
  assert(values.every((s) => !s.context && !s.prompt && !s.pending));
  off();
  f.scope({ key: 'user:b:sala-cetro', seat: 0 });
  f.scope({ key: 'user:a:sala-cetro', seat: 0 });
  assert.equal(f.controller.getSnapshot().context, null);
  f.context();
  f.prompt();
  f.connected(false);
  assert.equal(f.controller.getSnapshot().context, null);
  f.connected(true);
  assert.equal(f.controller.getSnapshot().prompt, null);
});
test('navigation hides private choices without answering or losing the current prompt', async () => {
  const f = await fixture();
  f.context();
  f.prompt();
  const before = f.controller.getSnapshot().prompt;
  f.visible(false);
  assert.equal(f.controller.getSnapshot().open, false);
  assert.equal(f.choose('favor'), false);
  f.visible(true);
  assert.strictEqual(f.controller.getSnapshot().prompt, before);
  assert.equal(f.controller.getSnapshot().open, true);
  assert.deepEqual(f.calls, []);
});
test('failed sends can retry, invalid action unlocks only the current pending choice and newer phases clear it', async () => {
  const f = await fixture();
  f.context();
  f.prompt();
  f.send(() => false);
  assert.equal(f.choose('favor'), false);
  assert.equal(f.controller.getSnapshot().pending, false);
  f.send(() => true);
  assert.equal(f.choose('favor'), true);
  f.emit({ type: 'error', code: 'UNRELATED' });
  assert.equal(f.controller.getSnapshot().pending, true);
  f.emit({ type: 'error', code: 'INVALID_ACTION', message: 'Atualize a escolha' });
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.equal(f.choose('reserva'), true);
  f.context(table('choose-reserva'));
  assert.equal(f.controller.getSnapshot().prompt, null);
});
test('older round/trick snapshots cannot resurrect earlier private hands', async () => {
  const f = await fixture();
  f.context(table('await-play', { round: 2, trick: 4 }));
  const before = f.controller.getSnapshot().context;
  f.context(table('choose-decree'));
  f.context(table('choose-law', { round: 2, trick: 3 }));
  assert.strictEqual(f.controller.getSnapshot().context, before);
});
test('irrelevant messages do not rerender; disposal releases subscribers and rejects all late choices', async () => {
  const f = await fixture();
  f.controller.start();
  f.context();
  f.prompt();
  let changes = 0;
  const old = f.controller.getSnapshot().prompt;
  f.controller.subscribe(() => changes++);
  f.emit({ type: 'chat-message' });
  assert.equal(changes, 0);
  f.controller.dispose();
  f.controller.dispose();
  assert.equal(f.messages.size, 0);
  assert.equal(f.source.size, 0);
  assert.equal(f.controller.choose(old, 'favor'), false);
  assert.equal(f.controller.getSnapshot().context, null);
});
