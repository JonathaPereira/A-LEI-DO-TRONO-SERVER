'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ready = import('../src/lib/navigation/portal.ts');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function fixture() {
  const { createPortal } = await ready;
  let identity = { user: { id: 'alice', nickname: 'Alice' }, guest: null };
  let check = async (name) => ({ available: true, name, message: 'Disponível' });
  let enter = async (validation, current, show) => {
    if (!current()) return false;
    show();
    return true;
  };
  let screen = 'portalScreen';
  const auth = new Set(),
    messages = new Set(),
    timers = new Map(),
    calls = [],
    writes = [];
  const controller = createPortal({
    identity: () => identity,
    authReady: Promise.resolve(),
    connected: () => true,
    subscribeIdentity(fn) {
      auth.add(fn);
      return () => auth.delete(fn);
    },
    subscribeMessages(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    checkName(name) {
      calls.push(['check', name]);
      return check(name);
    },
    persistName(name) {
      writes.push(name);
    },
    showScreen(id) {
      screen = id;
      calls.push(['show', id]);
    },
    openAuth(mode) {
      calls.push(['auth', mode]);
    },
    openLibrary() {
      calls.push(['library']);
    },
    requestRooms() {
      calls.push(['rooms']);
    },
    focusIdentity(lobby) {
      calls.push(['focus', lobby]);
    },
    ensureAudio: async () => {},
    enterCommunity(...args) {
      calls.push(['enter']);
      return enter(...args);
    },
    communityVisible: () => screen === 'chatOnlyScreen',
    schedule(fn) {
      const id = Symbol();
      timers.set(id, fn);
      return () => timers.delete(id);
    },
    warn(error) {
      calls.push(['error', error.message]);
    },
  });
  controller.start();
  return {
    controller,
    calls,
    writes,
    timers,
    auth,
    messages,
    get screen() {
      return screen;
    },
    identity(value, notify = true) {
      identity = value;
      if (notify) auth.forEach((fn) => fn());
    },
    check(value) {
      check = value;
    },
    enter(value) {
      enter = value;
    },
    message(value) {
      messages.forEach((fn) => fn(value));
    },
  };
}
test('queued checks cannot authenticate guests after logout, including an already queued callback', async () => {
  const f = await fixture();
  f.controller.queueNameCheck('Alice');
  const callback = [...f.timers.values()][0];
  f.identity({ user: null, guest: null });
  assert.equal(f.timers.size, 0);
  callback();
  await flush();
  assert.deepEqual(f.calls, []);
  assert.equal(f.controller.getSnapshot().name, '');
});
test('account ABA and changes without notification invalidate queued and in-flight checks', async () => {
  const f = await fixture(),
    pending = deferred();
  f.check(() => pending.promise);
  f.controller.queueNameCheck('Alice');
  [...f.timers.values()][0]();
  f.identity({ user: { id: 'bob', nickname: 'Bob' }, guest: null });
  f.identity({ user: { id: 'alice', nickname: 'Alice' }, guest: null });
  pending.resolve({ available: true, message: 'Antigo' });
  await flush();
  assert.equal(f.controller.getSnapshot().feedback.message, 'Apelido da sua conta');
  f.controller.queueNameCheck('Alice');
  const callback = [...f.timers.values()].at(-1);
  f.identity({ user: { id: 'bob', nickname: 'Bob' }, guest: null }, false);
  callback();
  await flush();
  assert.equal(f.calls.length, 1);
});
test('current checks publish frozen feedback; superseded failure cannot overwrite newer results', async () => {
  const f = await fixture(),
    old = deferred();
  f.check(() => old.promise);
  f.controller.queueNameCheck('Alice');
  [...f.timers.values()][0]();
  f.check(async (name) => ({ available: true, name, message: 'Disponível' }));
  f.controller.queueNameCheck('Alice');
  [...f.timers.values()].at(-1)();
  await flush();
  old.reject(new Error('Offline'));
  await flush();
  assert.equal(f.controller.getSnapshot().feedback.message, 'Disponível');
  assert(Object.isFrozen(f.controller.getSnapshot()));
  assert(Object.isFrozen(f.controller.getSnapshot().feedback));
});
test('account names stay authoritative; guest names normalize; identity reset publishes atomically', async () => {
  const f = await fixture();
  assert.equal(f.controller.syncIdentity('Outro'), 'Alice');
  f.controller.setNameFeedback({ available: true, message: 'Segredo antigo' });
  const values = [];
  f.controller.subscribe(() => values.push(f.controller.getSnapshot()));
  f.identity({ user: null, guest: { id: 'guest', nickname: 'Visitante' } });
  assert(values.every((s) => !s.feedback.available && s.name === 'Visitante'));
  assert.equal(f.controller.getSnapshot().readOnly, false);
  const name = f.controller.syncIdentity('<🌟>\n' + 'a'.repeat(25));
  assert.equal([...name].length, 20);
  assert(!name.includes('<'));
  assert(!name.includes('\n'));
  assert.equal(f.writes.at(-1), name);
});
test('guests validate for games; voice requests login and visitor direct game requests guest access', async () => {
  const f = await fixture();
  f.identity({ user: null, guest: { id: 'guest', nickname: 'Visita' } });
  assert.equal((await f.controller.validateIdentity({ game: true })).ok, true);
  assert.equal((await f.controller.validateIdentity()).code, 'AUTH_REQUIRED');
  assert.deepEqual(f.calls.at(-1), ['auth', 'login']);
  f.identity({ user: null, guest: null });
  f.controller.openGame(true);
  assert.deepEqual(f.calls.at(-1), ['auth', 'guest']);
});
test('validation cancels on logout/ABA without publishing feedback or opening community', async () => {
  const f = await fixture(),
    pending = deferred();
  f.check(() => pending.promise);
  const opening = f.controller.openVoice();
  await flush();
  f.identity({ user: null, guest: null });
  f.identity({ user: { id: 'alice', nickname: 'Alice' }, guest: null });
  pending.resolve({ available: true, message: 'Antigo' });
  assert.equal(await opening, false);
  assert.equal(f.screen, 'portalScreen');
  assert(!f.calls.some((c) => c[0] === 'enter'));
  assert.equal(f.controller.getSnapshot().busy, false);
});
test('entry deduplicates; stale finalizer cannot unlock newer entry after navigation', async () => {
  const f = await fixture(),
    first = deferred(),
    second = deferred();
  let attempts = 0;
  f.check(() => (++attempts === 1 ? first.promise : second.promise));
  const one = f.controller.openVoice();
  assert.strictEqual(one, f.controller.openVoice());
  await flush();
  f.controller.showOnly('gamesScreen');
  const two = f.controller.openVoice();
  await flush();
  first.resolve({ available: true });
  assert.equal(await one, false);
  assert.equal(f.controller.getSnapshot().busy, true);
  second.resolve({ available: true });
  assert.equal(await two, true);
  assert.equal(f.screen, 'chatOnlyScreen');
  assert.equal(f.controller.getSnapshot().busy, false);
});
test('navigation during community refresh prevents stale presentation', async () => {
  const f = await fixture(),
    pending = deferred();
  f.enter(async (_validation, current, show) => {
    await pending.promise;
    if (!current()) return false;
    show();
    return true;
  });
  const opening = f.controller.openVoice();
  await flush();
  assert(f.calls.some((c) => c[0] === 'enter'));
  f.controller.showOnly('gameScreen');
  pending.resolve();
  assert.equal(await opening, false);
  assert.equal(f.screen, 'gameScreen');
});
test('welcome from an explicit validation connection does not supersede that validation', async () => {
  const f = await fixture();
  f.check(async (name) => {
    f.message({ type: 'welcome', serverVersion: 'test' });
    return { available: true, name };
  });
  assert.equal((await f.controller.validateIdentity()).ok, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.filter((c) => c[0] === 'check').length, 1);
});
test('failed entry releases its lock for retry; disconnect cancels the next continuation', async () => {
  const f = await fixture();
  f.enter(async () => {
    throw new Error('Falha de entrada');
  });
  assert.equal(await f.controller.openVoice(), false);
  assert.equal(f.controller.getSnapshot().entryStatus, 'Falha de entrada');
  assert.equal(f.controller.getSnapshot().busy, false);
  const pending = deferred();
  f.check(() => pending.promise);
  const opening = f.controller.openVoice();
  await flush();
  f.message({ type: 'connection', connected: false });
  pending.resolve({ available: true });
  assert.equal(await opening, false);
  assert.equal(f.controller.getSnapshot().serverStatus, 'Reconectando…');
});
test('start/dispose release subscriptions, timers and continuations exactly once', async () => {
  const f = await fixture();
  f.controller.start();
  assert.equal(f.auth.size, 1);
  assert.equal(f.messages.size, 1);
  f.controller.queueNameCheck('Alice');
  const callback = [...f.timers.values()][0];
  const pending = deferred();
  f.check(() => pending.promise);
  const opening = f.controller.openVoice();
  await flush();
  f.controller.dispose();
  f.controller.dispose();
  callback();
  pending.resolve({ available: true });
  assert.equal(await opening, false);
  assert.equal(f.auth.size, 0);
  assert.equal(f.messages.size, 0);
  assert.equal(f.timers.size, 0);
  const count = f.calls.length,
    writes = f.writes.length;
  f.controller.showPortal();
  f.controller.syncIdentity('Depois');
  f.controller.queueNameCheck('Depois');
  assert.equal(await f.controller.openVoice(), false);
  assert.equal(f.calls.length, count);
  assert.equal(f.writes.length, writes);
});
