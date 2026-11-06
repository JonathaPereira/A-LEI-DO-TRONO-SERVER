'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-private.ts'),
  import('../src/lib/games/throne-private-protocol.ts'),
]);
const card = (value = 1) => ({
  id: 'c' + (value - 1),
  suit: 'cetro',
  value,
  public: false,
  publicReason: null,
});
const clue = () => ({ target: 3, name: 'Casa 3', card: card() });
const swap = (patch = {}) => ({
  type: 'private-usurpation',
  role: 'shadow',
  otherName: 'Casa 1',
  outgoing: card(),
  incoming: card(2),
  returnedSameCard: false,
  ...patch,
});
const match = (patch = {}) => ({
  localPlayerId: 0,
  round: 1,
  trick: 2,
  phase: 'usurp-pick',
  currentLaw: 'usurpacao',
  lastShadow: 0,
  decree: 'espionagem',
  players: [0, 1, 2, 3].map((id) => ({ id, name: 'Casa ' + id })),
  ...patch,
});
async function fixture() {
  const [{ createThronePrivate }] = await modules;
  let scope = { key: 'user:a:room', seat: 0 },
    connected = true,
    visible = true,
    send = () => true;
  let view = { mode: 'online', match: match(), status: { round: 1 } };
  const source = new Set(),
    messages = new Set(),
    calls = [],
    warnings = [];
  const controller = createThronePrivate({
    scope: () => scope,
    connected: () => connected,
    visible: () => visible,
    match: () => view,
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
  const refresh = () => source.forEach((fn) => fn()),
    emit = (m) => messages.forEach((fn) => fn(m));
  return {
    controller,
    calls,
    warnings,
    source,
    messages,
    emit,
    state(patch) {
      view = { ...view, match: match(patch) };
      refresh();
    },
    raw(intelligence = clue()) {
      const m = view.match;
      emit({
        type: 'game-state',
        state: {
          youSeat: m.localPlayerId,
          round: m.round,
          trick: m.trick,
          phase: m.phase,
          intelligence,
        },
      });
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
    local() {
      view = { mode: 'local', match: null, status: { round: 1 } };
      refresh();
    },
    send(fn) {
      send = fn;
    },
    confirm() {
      return controller.confirm(controller.getSnapshot().dialog);
    },
  };
}
test('private parsers copy and freeze only the disclosed cards and reject protected/identical exchanges', async () => {
  const [, p] = await modules,
    raw = { ...swap(), kind: 'usurpation', secret: 'ignore' };
  const d = p.readThroneDisclosure(raw);
  assert(Object.isFrozen(d.incoming));
  assert(!Object.isFrozen(raw.incoming));
  assert(!('secret' in d));
  raw.incoming.value = 12;
  assert.equal(d.incoming.value, 2);
  for (const bad of [
    { ...swap(), kind: 'usurpation', incoming: card() },
    { ...swap(), kind: 'usurpation', role: 'observer' },
    { ...swap(), kind: 'usurpation', returnedSameCard: true },
    {
      ...swap(),
      kind: 'usurpation',
      outgoing: { ...card(), public: true, publicReason: 'Corte Aberta' },
    },
  ])
    assert.throws(() => p.readThroneDisclosure(bad));
  assert.throws(() => p.readThroneIntelligence({ ...clue(), target: 4 }));
});
test('Espionagem arriving before its phase waits for the matching state and acknowledges exactly once', async () => {
  const f = await fixture();
  f.state({ phase: 'choose-decree', trick: 1 });
  f.emit({ type: 'private-intelligence', intelligence: clue() });
  assert.equal(f.controller.getSnapshot().dialog, null);
  f.state({ phase: 'private-intelligence', trick: 1 });
  const offered = f.controller.getSnapshot().dialog;
  assert(f.controller.getSnapshot().open);
  assert(f.confirm());
  f.emit({ type: 'private-intelligence', intelligence: clue() });
  assert.equal(f.controller.getSnapshot().dialog, null);
  assert(!f.controller.confirm(offered));
  assert.deepEqual(f.calls, [{ action: 'intelligence-ack', payload: {} }]);
});
test('Espionagem validates recipient direction and public name; cache permits review without a second acknowledgement', async () => {
  const f = await fixture();
  f.state({ phase: 'private-intelligence' });
  f.emit({ type: 'private-intelligence', intelligence: { ...clue(), target: 1, name: 'Casa 1' } });
  assert.equal(f.controller.getSnapshot().dialog, null);
  f.emit({ type: 'private-intelligence', intelligence: clue() });
  f.confirm();
  f.state({ phase: 'await-play' });
  f.raw();
  assert(f.controller.openIntelligence());
  assert.equal(f.controller.getSnapshot().dialog.action, null);
  assert(f.confirm());
  assert.equal(f.calls.length, 1);
  f.state({ round: 2, phase: 'choose-decree' });
  assert.equal(f.controller.getSnapshot().intelligence, null);
  assert(!f.controller.openIntelligence());
});
test('Usurpação waits for the animation and matching phase; earlier release cannot unlock a newer exchange', async () => {
  const f = await fixture(),
    release = f.controller.holdExchange();
  f.emit(swap());
  f.state({ phase: 'usurp-reveal' });
  assert(f.controller.getSnapshot().dialog);
  assert(!f.controller.getSnapshot().open);
  assert(!f.confirm());
  const newer = f.controller.holdExchange();
  release();
  assert(!f.controller.getSnapshot().open);
  newer();
  assert(f.controller.getSnapshot().open);
  assert(f.confirm());
  assert.deepEqual(f.calls, [{ action: 'usurp-ack', payload: {} }]);
});
test('Usurpação enforces shadow/target roles; uninvolved recipients cannot activate the private cards', async () => {
  const f = await fixture();
  f.state({ phase: 'usurp-reveal' });
  f.emit(swap({ role: 'target' }));
  assert.equal(f.controller.getSnapshot().dialog, null);
  f.state({ phase: 'usurp-reveal', lastShadow: 2 });
  f.emit(swap());
  assert.equal(f.controller.getSnapshot().dialog, null);
  f.emit(swap({ role: 'target', otherName: 'Casa 2' }));
  assert(f.controller.getSnapshot().open);
  assert(f.confirm());
});
test('hidden views and legacy modals retain the offer without sending; returning restores it', async () => {
  const f = await fixture();
  f.state({ phase: 'usurp-reveal' });
  f.emit(swap());
  const offered = f.controller.getSnapshot().dialog;
  f.visible(false);
  assert(!f.controller.getSnapshot().open);
  assert(!f.controller.confirm(offered));
  assert.equal(f.calls.length, 0);
  f.visible(true);
  assert.strictEqual(f.controller.getSnapshot().dialog, offered);
  assert(f.controller.confirm(offered));
});
test('phase changes invalidate pending offers and stale click handlers, including a new game with repeated coordinates', async () => {
  const f = await fixture();
  f.state({ phase: 'usurp-reveal' });
  f.emit(swap());
  const old = f.controller.getSnapshot().dialog;
  f.state({ phase: 'await-play' });
  assert.equal(f.controller.getSnapshot().dialog, null);
  assert(!f.controller.confirm(old));
  f.emit({ type: 'game-started' });
  f.state({ phase: 'usurp-reveal' });
  f.emit(swap());
  assert.notStrictEqual(f.controller.getSnapshot().dialog, old);
  assert(!f.controller.confirm(old));
  assert(f.confirm());
});
test('failed sends allow explicit retry; unrelated state does not emit automatic acknowledgements', async () => {
  const f = await fixture();
  f.state({ phase: 'usurp-reveal' });
  f.emit(swap());
  f.send(() => false);
  assert(!f.confirm());
  assert(!f.controller.getSnapshot().pending);
  assert(f.controller.getSnapshot().notice);
  f.emit({ type: 'unrelated' });
  assert.equal(f.calls.length, 1);
  f.send(() => true);
  assert(f.confirm());
  assert.equal(f.calls.length, 2);
});
test('identity ABA, room/seat, disconnection, cancellation and disposal discard queued and visible private data', async () => {
  for (const reset of [
    (f) => {
      f.scope({ key: 'b', seat: 0 });
      f.scope({ key: 'user:a:room', seat: 0 });
    },
    (f) => f.scope({ key: 'other', seat: 0 }),
    (f) => f.scope({ key: 'user:a:room', seat: 1 }),
    (f) => f.connected(false),
    (f) => f.controller.clear(),
    (f) => f.controller.dispose(),
  ]) {
    const f = await fixture();
    const release = f.controller.holdExchange();
    f.state({ phase: 'usurp-reveal' });
    f.emit(swap());
    const old = f.controller.getSnapshot().dialog;
    reset(f);
    release();
    assert.equal(f.controller.getSnapshot().dialog, null);
    assert.equal(f.controller.getSnapshot().intelligence, null);
    assert(!f.controller.confirm(old));
    assert.equal(f.calls.length, 0);
  }
});
test('local disclosure resolves only on confirmation, shares the view, and sends no network command', async () => {
  const f = await fixture();
  f.local();
  f.connected(false);
  let resolved = false;
  const promise = f.controller.showLocal({ kind: 'intelligence', clue: clue() }).then(() => {
    resolved = true;
  });
  await Promise.resolve();
  assert(!resolved);
  assert(f.controller.getSnapshot().open);
  assert(f.confirm());
  await promise;
  assert(resolved);
  assert.equal(f.calls.length, 0);
  assert(f.controller.openIntelligence());
  f.confirm();
  assert.equal(f.calls.length, 0);
});
test('local cancellation rejects the pending motor continuation and cannot confirm it in the next game', async () => {
  const f = await fixture();
  f.local();
  const pending = f.controller.showLocal({ kind: 'usurpation', ...swap() });
  const old = f.controller.getSnapshot().dialog;
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  f.controller.clear();
  await rejected;
  assert(!f.controller.confirm(old));
  assert.equal(f.calls.length, 0);
});
test('disposal removes subscriptions and prevents late packets or releases from reopening private dialogs', async () => {
  const f = await fixture(),
    release = f.controller.holdExchange();
  f.emit(swap());
  f.controller.dispose();
  f.controller.dispose();
  release();
  f.state({ phase: 'usurp-reveal' });
  assert.equal(f.source.size, 0);
  assert.equal(f.messages.size, 0);
  assert.equal(f.controller.getSnapshot().dialog, null);
});
