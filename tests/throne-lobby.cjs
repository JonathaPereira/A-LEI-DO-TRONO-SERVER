'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-lobby.ts'),
  import('../src/lib/games/throne-lobby-protocol.ts'),
]);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}
const player = (id = 'me', seat = 0, patch = {}) => ({
  id,
  seat,
  name: id,
  guest: false,
  ready: false,
  host: seat === 0,
  avatar_preset: 'crown',
  avatar_file_id: null,
  ...patch,
});
const room = (id = 'sala-cetro', players = [player()], patch = {}) => ({
  id,
  name: 'Sala do Cetro',
  kind: 'game',
  max: 4,
  count: players.length,
  players,
  voiceActive: false,
  gameActive: false,
  ...patch,
});
async function fixture() {
  const [{ createThroneLobby }] = await modules;
  let identity = 'user:a',
    screen = 'setupScreen',
    membership = null;
  let validate = async () => ({ ok: true, name: 'Alice' }),
    audio = async () => true;
  const listeners = new Set(),
    auth = new Set(),
    calls = [],
    timers = new Map(),
    warnings = [];
  const controller = createThroneLobby({
    identity: () => identity,
    clientId: () => 'me',
    connected: () => true,
    gameRoom: () => membership,
    screen: () => screen,
    recoveryScreen: () => (controller.getSnapshot().room ? 'roomScreen' : 'setupScreen'),
    subscribeIdentity(fn) {
      auth.add(fn);
      return () => auth.delete(fn);
    },
    subscribeMessages(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    validateIdentity: () => validate(),
    ensureAudio: () => audio(),
    prepareJoin(name) {
      calls.push(['prepare', name]);
    },
    showRoom() {
      screen = 'roomScreen';
    },
    restore(value) {
      screen = value;
      calls.push(['restore', value]);
    },
    joinRoom: async (id, name, current) => {
      if (!current()) return false;
      calls.push(['join', id, name]);
      return true;
    },
    setReady(value) {
      calls.push(['ready', value]);
      return true;
    },
    startRoom() {
      calls.push(['start']);
      return true;
    },
    requestRooms() {
      calls.push(['list']);
    },
    requestState() {
      calls.push(['state']);
    },
    focusIdentity() {
      calls.push(['focus']);
    },
    notify(message) {
      calls.push(['notify', message]);
    },
    schedule(fn) {
      const id = Symbol();
      timers.set(id, fn);
      return () => timers.delete(id);
    },
    warn(error) {
      warnings.push(error);
    },
  });
  controller.start();
  return {
    controller,
    calls,
    timers,
    warnings,
    auth,
    listeners,
    emit(message) {
      if (message.type === 'joined-game-room') membership = message.room.id;
      if (message.type === 'left-game-room') membership = null;
      listeners.forEach((fn) => fn(message));
    },
    identity(value) {
      identity = value;
      auth.forEach((fn) => fn());
    },
    screen(value) {
      screen = value;
    },
    getScreen: () => screen,
    validate(fn) {
      validate = fn;
    },
    audio(fn) {
      audio = fn;
    },
    async join(id = 'sala-cetro', players) {
      await controller.enter(id);
      this.emit({ type: 'joined-game-room', room: room(id, players) });
    },
  };
}
test('room parser copies/freezes public fields, drops private data and validates the entire roster/catalog', async () => {
  const [, { readThroneRoom, readThroneRooms }] = await modules;
  const raw = room();
  raw.players[0].hand = [{ secret: true }];
  raw.private = 'secret';
  const value = readThroneRoom(raw);
  assert(Object.isFrozen(value.players[0]));
  assert(!Object.isFrozen(raw));
  assert(!('hand' in value.players[0]));
  assert(!('private' in value));
  raw.players[0].name = 'changed';
  assert.equal(value.players[0].name, 'me');
  for (const input of [
    room('unknown'),
    room('sala-cetro', [player(), player('b', 0)]),
    room('sala-cetro', [player(), player('me', 1)]),
    room('sala-cetro', [player('me', 0, { ready: 'yes' })]),
    room('sala-cetro', [player()], { count: 4 }),
    room('sala-cetro', [player('me', 0, { host: false })]),
  ])
    assert.throws(() => readThroneRoom(input));
  assert.throws(() => readThroneRooms([room(), room()]));
  const avatar = readThroneRoom(
    room('sala-cetro', [player('me', 0, { avatar_preset: '__proto__', avatar_file_id: '<img>' })]),
  ).players[0];
  assert.equal(avatar.avatar_preset, 'crown');
  assert.equal(avatar.avatar_file_id, null);
});
test('join is deduplicated through validation and authoritative acknowledgement; unrelated tables are ignored', async () => {
  const f = await fixture(),
    validation = deferred();
  f.validate(() => validation.promise);
  const first = f.controller.enter('sala-cetro');
  assert.equal(await f.controller.enter('sala-chave'), false);
  validation.resolve({ ok: true, name: 'Alice' });
  assert.equal(await first, true);
  assert.equal(f.controller.getSnapshot().entering, true);
  assert.equal(await f.controller.enter('sala-chave'), false);
  f.emit({ type: 'joined-game-room', room: room('sala-chave') });
  assert.equal(f.controller.getSnapshot().room, null);
  f.emit({ type: 'joined-game-room', room: room() });
  assert.equal(f.controller.getSnapshot().me.id, 'me');
  assert.equal(f.controller.getSnapshot().entering, false);
  assert.equal(f.calls.filter((c) => c[0] === 'join').length, 1);
  assert.equal(f.timers.size, 0);
});
test('identity ABA cancels pending validation and old roster payloads cannot restore the previous lobby', async () => {
  const f = await fixture(),
    validation = deferred();
  f.validate(() => validation.promise);
  const entering = f.controller.enter('sala-cetro');
  f.identity('user:b');
  f.identity('user:a');
  validation.resolve({ ok: true, name: 'Alice' });
  assert.equal(await entering, false);
  f.emit({ type: 'joined-game-room', room: room() });
  assert.equal(f.controller.getSnapshot().room, null);
  assert.equal(f.calls.length, 0);
});
test('navigation during validation or audio activation cancels entry before a network command', async () => {
  for (const stage of ['validate', 'audio']) {
    const f = await fixture(),
      pending = deferred();
    f[stage](() => pending.promise);
    const entering = f.controller.enter('sala-cetro');
    await tick();
    f.screen('gamesScreen');
    pending.resolve(stage === 'validate' ? { ok: true, name: 'Alice' } : true);
    assert.equal(await entering, false);
    assert.equal(f.getScreen(), 'gamesScreen');
    assert(!f.calls.some((c) => c[0] === 'join'));
    assert.equal(f.controller.getSnapshot().entering, false);
  }
});
test('failed transfer restores the previous roster; navigating elsewhere prevents a screen rollback', async () => {
  const f = await fixture();
  await f.join();
  const before = f.controller.getSnapshot().room;
  await f.controller.enter('sala-chave');
  f.emit({ type: 'error', code: 'ROOM_FULL', message: 'Cheia' });
  assert.strictEqual(f.controller.getSnapshot().room, before);
  assert.equal(f.controller.getSnapshot().selected.id, 'sala-cetro');
  await f.controller.enter('sala-chave');
  f.screen('chatOnlyScreen');
  f.emit({ type: 'error', code: 'GAME_IN_PROGRESS' });
  assert.equal(f.getScreen(), 'chatOnlyScreen');
});
test('navigation releases a waiting validation immediately; its late result cannot release the next entry', async () => {
  const f = await fixture(),
    old = deferred();
  f.validate(() => old.promise);
  const first = f.controller.enter('sala-cetro');
  await tick();
  f.screen('gamesScreen');
  f.controller.navigationChanged();
  assert.equal(f.controller.getSnapshot().entering, false);
  f.validate(async () => ({ ok: true, name: 'Alice' }));
  await f.controller.enter('sala-chave');
  old.resolve({ ok: true, name: 'Alice' });
  assert.equal(await first, false);
  assert.equal(f.controller.getSnapshot().entering, true);
  assert.deepEqual(
    f.calls.filter((c) => c[0] === 'join'),
    [['join', 'sala-chave', 'Alice']],
  );
});
test('ready is deduplicated until its own acknowledgement and presence retains the pending intent', async () => {
  const f = await fixture();
  await f.join();
  f.controller.toggleReady();
  f.controller.toggleReady();
  assert.deepEqual(
    f.calls.filter((c) => c[0] === 'ready'),
    [['ready', true]],
  );
  f.emit({ type: 'room-state', room: room('sala-cetro', [player(), player('other', 1)]) });
  assert.equal(f.controller.getSnapshot().readyPending, true);
  f.emit({
    type: 'room-state',
    room: room('sala-cetro', [player('me', 0, { ready: true }), player('other', 1)]),
  });
  assert.equal(f.controller.getSnapshot().readyPending, false);
  f.controller.toggleReady();
  assert.deepEqual(f.calls.filter((c) => c[0] === 'ready').at(-1), ['ready', false]);
});
test('starting requires the current host and two ready humans; acknowledgements cannot start twice', async () => {
  const f = await fixture();
  await f.join();
  f.controller.startGame();
  assert(!f.calls.some((c) => c[0] === 'start'));
  f.emit({
    type: 'room-state',
    room: room('sala-cetro', [
      player('me', 0, { ready: true }),
      player('other', 1, { ready: true }),
    ]),
  });
  f.controller.startGame();
  f.controller.startGame();
  assert.equal(f.calls.filter((c) => c[0] === 'start').length, 1);
  f.emit({
    type: 'game-started',
    room: room('sala-cetro', [player(), player('other', 1)], { gameActive: true }),
  });
  assert.equal(f.controller.getSnapshot().starting, false);
  f.controller.startGame();
  assert.equal(f.calls.filter((c) => c[0] === 'start').length, 1);
});
test('non-hosts cannot start and malformed updates cannot replace the current room', async () => {
  const f = await fixture();
  await f.join('sala-cetro', [
    player('host', 0, { ready: true }),
    player('me', 1, { ready: true }),
  ]);
  const before = f.controller.getSnapshot().room;
  f.controller.startGame();
  assert(!f.calls.some((c) => c[0] === 'start'));
  f.emit({ type: 'room-state', room: { ...before, players: [] } });
  assert.strictEqual(f.controller.getSnapshot().room, before);
  f.emit({ type: 'room-state', room: { id: 'chat-livre', kind: 'chat' } });
  assert.equal(f.warnings.length, 1);
});
test('old timers cannot release a newer intent; disconnect clears pending actions without replaying them', async () => {
  const f = await fixture();
  await f.join();
  f.controller.toggleReady();
  const old = [...f.timers.values()][0];
  f.emit({ type: 'room-state', room: room('sala-cetro', [player('me', 0, { ready: true })]) });
  f.controller.toggleReady();
  old();
  assert.equal(f.controller.getSnapshot().readyPending, true);
  f.emit({ type: 'connection', connected: false });
  assert.equal(f.controller.getSnapshot().readyPending, false);
  f.emit({ type: 'connection', connected: true });
  assert.equal(f.calls.filter((c) => c[0] === 'ready').length, 2);
});
test('entry timeout and departure clear their own intents; identity reset removes snapshots atomically', async () => {
  const f = await fixture();
  await f.controller.enter('sala-cetro');
  [...f.timers.values()][0]();
  assert.equal(f.controller.getSnapshot().entering, false);
  assert.equal(f.controller.getSnapshot().selected, null);
  await f.join();
  const values = [];
  f.controller.subscribe(() => values.push(f.controller.getSnapshot()));
  f.identity('user:b');
  assert(values.every((s) => s.room === null && s.me === null && s.selected === null));
  await f.join();
  f.emit({ type: 'left-game-room', roomId: 'sala-cetro' });
  assert.equal(f.controller.getSnapshot().room, null);
});
test('dispose is idempotent and invalidates resources and late continuations', async () => {
  const f = await fixture(),
    pending = deferred();
  f.audio(() => pending.promise);
  const entering = f.controller.enter('sala-cetro');
  await tick();
  f.controller.dispose();
  f.controller.dispose();
  pending.resolve();
  assert.equal(await entering, false);
  assert.equal(f.auth.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(await f.controller.enter('sala-chave'), false);
  f.controller.toggleReady();
  f.controller.startGame();
  assert(!f.calls.some((c) => ['join', 'ready', 'start'].includes(c[0])));
});
