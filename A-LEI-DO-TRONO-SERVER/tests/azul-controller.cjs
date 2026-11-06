'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/lib/games/azul-rules.ts');
const P = require('../src/lib/games/azul-presentation.ts');
const modules = Promise.all([
  import('../src/lib/games/azul.ts'),
  import('../src/lib/games/azul-protocol.ts'),
  import('../src/lib/games/fullscreen.ts'),
]);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function state() {
  return R.create(
    [
      { id: 'a', name: 'Artesão' },
      { id: 'b', name: 'Amigo' },
    ],
    () => 0,
  );
}
function room(s = null, id = 'mesa') {
  return {
    id,
    hostId: 'a',
    maxPlayers: 2,
    players: (s?.players ?? [{ id: 'a', name: 'Artesão' }]).map((p) => ({
      id: p.id,
      name: p.name,
      bot: !!p.bot,
      online: true,
      forfeited: !!p.forfeited,
    })),
    state: s ? R.publicState(s) : null,
    recordStatus: null,
  };
}
async function setup(t, { motion = true } = {}) {
  const [{ createAzul }] = await modules;
  let account = 'a',
    visible = true,
    reduced = motion,
    auth = async () => true,
    serial = 0;
  const messages = new Set(),
    identities = new Set(),
    calls = [],
    jobs = [],
    sounds = [],
    errors = [];
  const controller = createAzul({
    getAccountId: () => account,
    subscribeIdentity(fn) {
      identities.add(fn);
      return () => identities.delete(fn);
    },
    subscribeMessages(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    ensureAuthenticated: () => auth(),
    send(action, payload) {
      calls.push({ action, payload });
      return true;
    },
    visible: () => visible,
    reducedMotion: () => reduced,
    rules: R,
    presentation: P,
    uuid: () => String(++serial),
    sound: (kind) => sounds.push(kind),
    warn: (e) => errors.push(e),
    schedule(fn, ms) {
      const job = { fn, ms, canceled: false };
      jobs.push(job);
      return () => {
        job.canceled = true;
      };
    },
  });
  controller.start();
  await tick();
  calls.length = 0;
  t.after(() => controller.dispose());
  return {
    controller,
    calls,
    jobs,
    sounds,
    errors,
    messages,
    identities,
    emit(value) {
      messages.forEach((fn) => fn(value));
    },
    account(id) {
      account = id;
      identities.forEach((fn) => fn());
    },
    auth(fn) {
      auth = fn;
    },
    visible(value) {
      visible = value;
      controller.visibilityChanged();
    },
    reduced(value) {
      reduced = value;
      controller.visibilityChanged();
    },
    async advance(ms) {
      const job = jobs.find((j) => !j.canceled && j.ms === ms);
      assert(job, 'Missing timer ' + ms);
      job.canceled = true;
      job.fn();
      await tick();
    },
  };
}
test('wire parsing clones/freezes complete rooms and rejects malformed nested state without publishing', async (t) => {
  const f = await setup(t),
    wire = room(state());
  f.emit({ type: 'azul-state', room: wire });
  const snapshot = f.controller.getSnapshot();
  assert(Object.isFrozen(snapshot.room.state.players[0].lines));
  wire.state.players[0].name = 'Mutado';
  assert.equal(snapshot.room.state.players[0].name, 'Artesão');
  for (const mutate of [
    (r) => (r.state.turn = 8),
    (r) => (r.state.players[0].lines[1].count = 3),
    (r) => (r.state.players[0].wall[0] = []),
    (r) => (r.players[1].id = 'a'),
    (r) => (r.state.last = { playerId: 'a', source: 100, color: 0, row: 0, count: 1, accepted: 1 }),
  ]) {
    const bad = room(state());
    mutate(bad);
    f.emit({ type: 'azul-state', room: bad });
    assert.equal(f.controller.getSnapshot(), snapshot);
  }
  assert.equal(f.errors.length, 5);
  const stranger = room(state());
  stranger.players = stranger.players.map((p) => ({ ...p, id: p.id + 'other' }));
  stranger.hostId = 'aother';
  stranger.state.players = stranger.state.players.map((p) => ({ ...p, id: p.id + 'other' }));
  f.emit({ type: 'azul-state', room: stranger });
  assert.equal(f.controller.getSnapshot(), snapshot);
});
test('stale room revisions cannot regress a move; same-revision presence updates preserve selection', async (t) => {
  const f = await setup(t),
    s = state(),
    wire = room(s);
  f.emit({ type: 'azul-state', room: wire });
  const move = R.botMove(s, () => 0);
  f.controller.select(move.source, move.color);
  const selection = f.controller.getSnapshot().selection;
  wire.players[1].online = false;
  f.emit({ type: 'azul-state', room: wire });
  assert.equal(f.controller.getSnapshot().selection, selection);
  const next = R.move(s, 'a', move, () => 0);
  f.emit({ type: 'azul-state', room: room(next) });
  const snapshot = f.controller.getSnapshot();
  assert.equal(snapshot.selection, null);
  f.emit({ type: 'azul-state', room: room(s) });
  assert.equal(f.controller.getSnapshot(), snapshot);
});
test('account ABA invalidates deferred authentication, clears private state and ignores old ranking results', async (t) => {
  const f = await setup(t);
  f.emit({ type: 'azul-state', room: room(state()) });
  const held = deferred();
  f.auth(() => held.promise);
  f.controller.refreshRanking();
  const waiting = f.controller.refreshRooms();
  f.visible(false);
  f.account(null);
  f.account('a');
  held.resolve(true);
  await waiting;
  await tick();
  assert.equal(f.controller.getSnapshot().room, null);
  assert.equal(f.calls.length, 0);
  f.emit({
    type: 'azul-ranking',
    requestId: '1',
    rows: [{ playerId: 'a', name: 'Antigo', score: 80, mode: 'online', date: '2026-10-19' }],
  });
  assert.deepEqual(f.controller.getSnapshot().ranking, []);
  f.emit({ type: 'azul-rooms', rooms: [], resumeId: 'mesa-antiga' });
  assert.equal(f.controller.getSnapshot().resumeId, null);
});
test('move intents are deduplicated; timeout recovery and late authentication cannot send in a new room', async (t) => {
  const f = await setup(t),
    s = state(),
    move = R.botMove(s, () => 0);
  f.emit({ type: 'azul-state', room: room(s) });
  f.controller.select(move.source, move.color);
  const held = deferred();
  f.auth(() => held.promise);
  const sending = f.controller.move(move.row);
  await f.controller.move(move.row);
  assert.equal(f.controller.getSnapshot().pending, true);
  assert.equal(f.jobs.filter((j) => j.ms === 12000).length, 1);
  f.emit({ type: 'azul-state', room: room(s, 'outra') });
  held.resolve(true);
  await sending;
  assert.equal(f.calls.length, 0);
  assert.equal(f.controller.getSnapshot().pending, false);
  f.auth(async () => true);
  f.controller.select(move.source, move.color);
  await f.controller.move(move.row);
  assert.equal(f.calls.filter((c) => c.action === 'move').length, 1);
  await f.advance(12000);
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.match(f.controller.getSnapshot().notice, /Aguardando conexão/);
  assert.equal(f.calls.at(-1).action, 'state');
});
test('ranking correlation rejects old results/errors and malformed lists while preserving the valid view', async (t) => {
  const f = await setup(t);
  f.controller.refreshRanking();
  f.controller.refreshRanking();
  await tick();
  assert.equal(f.calls.length, 1);
  const requestId = f.calls[0].payload.requestId;
  const row = { playerId: 'a', name: 'Artesão', score: 80, mode: 'online', date: '2026-10-19' };
  f.emit({ type: 'azul-ranking', requestId, rows: [row] });
  const before = f.controller.getSnapshot();
  f.emit({ type: 'azul-ranking', requestId: 'antigo', rows: [] });
  f.emit({ type: 'azul-error', requestId: 'antigo', message: 'Antigo' });
  assert.equal(f.controller.getSnapshot(), before);
  f.emit({ type: 'azul-ranking', requestId, rows: [row, row] });
  assert.equal(f.controller.getSnapshot(), before);
  assert.equal(f.errors.length, 1);
});
test('replay uses copies and preserves the displayed placement while a newer authoritative move arrives', async (t) => {
  const f = await setup(t, { motion: false });
  let s = state();
  f.emit({ type: 'azul-state', room: room(s) });
  do {
    s = R.move(
      s,
      s.players[s.turn].id,
      R.botMove(s, () => 0),
      () => 0,
    );
    f.emit({ type: 'azul-state', room: room(s) });
  } while (s.round === 1 && s.phase !== 'finished');
  assert(f.controller.getSnapshot().replay);
  const authority = structuredClone(f.controller.getSnapshot().room.state);
  await f.advance(900);
  await f.advance(720);
  const replay = f.controller.getSnapshot().replay;
  assert.equal(replay.detail.landed, true);
  assert.equal(replay.detail.kind, 'placement');
  assert.deepEqual(f.controller.getSnapshot().room.state, authority);
  const next = R.move(
    s,
    s.players[s.turn].id,
    R.botMove(s, () => 0),
    () => 0,
  );
  f.emit({ type: 'azul-state', room: room(next) });
  assert.equal(f.controller.getSnapshot().replay, replay);
  assert.equal(f.controller.getSnapshot().room.state.revision, next.revision);
  f.controller.finishReplay();
  assert.equal(f.controller.getSnapshot().replay, null);
  assert.equal(f.controller.getSnapshot().room.state.revision, next.revision);
  assert(f.jobs.every((j) => j.canceled));
});
test('hidden/reduced-motion and disposal release replay, timers and subscriptions without resuming old work', async (t) => {
  const f = await setup(t, { motion: false });
  let s = state();
  f.emit({ type: 'azul-state', room: room(s) });
  while (s.round === 1) {
    s = R.move(
      s,
      s.players[s.turn].id,
      R.botMove(s, () => 0),
      () => 0,
    );
    f.emit({ type: 'azul-state', room: room(s) });
  }
  assert(f.controller.getSnapshot().replay);
  f.visible(false);
  assert.equal(f.controller.getSnapshot().replay, null);
  await tick();
  assert(f.jobs.every((j) => j.canceled));
  f.controller.subscribe(() => f.controller.dispose());
  f.controller.dispose();
  assert.equal(f.messages.size, 0);
  assert.equal(f.identities.size, 0);
});
test('fullscreen preserves the original gesture, deduplicates requests and rejects a late fallback after navigation', async () => {
  const [, , { createGameFullscreen }] = await modules;
  let visible = true,
    owned = false,
    exits = 0,
    calls = 0;
  const held = deferred();
  const full = createGameFullscreen({
    visible: () => visible,
    owned: () => owned,
    enter() {
      calls++;
      return held.promise;
    },
    async exit() {
      exits++;
      owned = false;
    },
  });
  const entering = full.toggle();
  assert.equal(calls, 1);
  await full.toggle();
  assert.equal(calls, 1);
  visible = false;
  full.sync();
  owned = true;
  held.resolve();
  await entering;
  assert.equal(exits, 1);
  assert.equal(full.getSnapshot().active, false);
  full.dispose();
});
test('fullscreen denial uses the fallback; Escape and a rejected native exit leave controls usable', async () => {
  const [, , { createGameFullscreen }] = await modules;
  let owned = false;
  const full = createGameFullscreen({
    visible: () => true,
    owned: () => owned,
    async enter() {
      throw Error('Denied');
    },
    async exit() {
      throw Error('Denied');
    },
  });
  await full.toggle();
  assert.equal(full.getSnapshot().immersive, true);
  full.escape();
  assert.equal(full.getSnapshot().active, false);
  owned = true;
  await assert.doesNotReject(full.toggle());
  assert.equal(full.getSnapshot().pending, false);
  assert.equal(full.getSnapshot().active, true);
  full.dispose();
});
