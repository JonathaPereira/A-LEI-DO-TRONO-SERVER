'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const R = require('../src/legacy/splendor-rules');
const moduleReady = import('../src/lib/games/splendor.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('a preview from an older animation cannot reserve until reopened against the current table', async (t) => {
  const f = await setup(t, { reduced: false }),
    s = game();
  f.emit({ type: 'splendor-state', room: room(s) });
  const next = R.move(s, 'a', { kind: 'take', tokens: [1, 1, 1, 0, 0, 0] }, () => 0);
  // Make the viewer the next actor, as after a bot's move in the native flow.
  f.account('b');
  await f.owner.refreshRooms();
  f.emit({ type: 'splendor-state', room: room(s, 'mesa', 'b') });
  f.emit({ type: 'splendor-state', room: room(next, 'mesa', 'b') });
  const id = s.market[0][0].id;
  f.owner.openCard(id);
  assert.equal(f.owner.getSnapshot().card.revision, 0);
  f.owner.stopAnimations();
  await f.owner.reserve();
  assert.equal(f.calls.filter((c) => c.action === 'move').length, 0);
  f.owner.openCard(id);
  await f.owner.reserve();
  assert.equal(f.calls.filter((c) => c.action === 'move').length, 1);
});
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function game() {
  return R.create(
    [
      { id: 'a', name: 'Mercador' },
      { id: 'b', name: 'Amigo' },
    ],
    () => 0,
  );
}
function room(s, id = 'mesa', viewer = 'a') {
  return {
    id,
    hostId: 'a',
    maxPlayers: 2,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      bot: !!p.bot,
      online: true,
      forfeited: !!p.forfeited,
    })),
    state: R.publicState(s, viewer),
    recordStatus: null,
  };
}
async function setup(t, { reduced = true } = {}) {
  const { createSplendor } = await moduleReady;
  let account = 'a',
    connected = true,
    visible = true,
    auth = async () => true,
    serial = 0,
    cancels = 0;
  const identities = new Set(),
    messages = new Set(),
    calls = [],
    jobs = [],
    errors = [];
  const owner = createSplendor({
    getAccountId: () => account,
    connected: () => connected,
    visible: () => visible,
    reduced: () => reduced,
    rules: R,
    uuid: () => String(++serial),
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
    schedule(fn, ms) {
      const job = { fn, ms, canceled: false };
      jobs.push(job);
      return () => {
        job.canceled = true;
      };
    },
    cancelEffects() {
      cancels++;
    },
    warn: (e) => errors.push(e),
  });
  owner.start();
  await tick();
  calls.length = 0;
  t.after(() => owner.dispose());
  return {
    owner,
    calls,
    jobs,
    errors,
    identities,
    messages,
    get cancels() {
      return cancels;
    },
    emit(value) {
      if (value.type === 'connection') connected = value.connected;
      messages.forEach((fn) => fn(value));
    },
    account(id) {
      account = id;
      identities.forEach((fn) => fn());
    },
    auth(fn) {
      auth = fn;
    },
    visible(v) {
      visible = v;
      owner.visibilityChanged();
    },
    reduce() {
      reduced = true;
      owner.visibilityChanged();
    },
    async advance(ms) {
      const job = jobs.find((j) => !j.canceled && (ms === undefined || j.ms === ms));
      assert(job, 'No scheduled job');
      job.canceled = true;
      job.fn();
      await tick();
    },
  };
}
test('parsers isolate/freeze snapshots and reject leaked reservations and malformed nested tables', async (t) => {
  const f = await setup(t),
    s = game();
  s.players[1].reserved.push(s.decks[0].pop());
  const wire = room(s);
  f.emit({ type: 'splendor-state', room: wire });
  const snapshot = f.owner.getSnapshot();
  assert(Object.isFrozen(snapshot.room.state.players[0].tokens));
  assert.deepEqual(snapshot.room.state.players[1].reserved, [{ hidden: true, level: 1 }]);
  wire.state.players[0].name = 'Mutado';
  assert.equal(snapshot.room.state.players[0].name, 'Mercador');
  for (const mutate of [
    (r) => (r.state.turn = 7),
    (r) => (r.state.players[1].reserved = [s.players[1].reserved[0]]),
    (r) => (r.state.bank = []),
    (r) => (r.state.players[0].tokens = [11, 0, 0, 0, 0, 0]),
    (r) => (r.state.market[0][1] = r.state.market[0][0]),
  ]) {
    const bad = room(s);
    mutate(bad);
    f.emit({ type: 'splendor-state', room: bad });
    assert.equal(f.owner.getSnapshot(), snapshot);
  }
  assert.equal(f.errors.length, 5);
});
test('token selection follows the single/double rule; stale revisions cannot erase current choices', async (t) => {
  const f = await setup(t),
    s = game();
  f.emit({ type: 'splendor-state', room: room(s) });
  f.owner.selectToken(0);
  f.owner.selectToken(0);
  assert.deepEqual(f.owner.getSnapshot().selected, [2, 0, 0, 0, 0, 0]);
  f.owner.selectToken(1);
  assert.equal(f.owner.getSnapshot().selected[1], 0);
  f.owner.selectToken(0);
  f.owner.selectToken(0);
  f.owner.selectToken(1);
  f.owner.selectToken(2);
  f.owner.selectToken(3);
  assert.equal(R.sum(f.owner.getSnapshot().selected), 3);
  f.owner.selectToken(5);
  assert.equal(f.owner.getSnapshot().selected[5], 0);
  const wire = room(s);
  wire.players[1].online = false;
  f.emit({ type: 'splendor-state', room: wire });
  assert.equal(R.sum(f.owner.getSnapshot().selected), 3);
  const next = R.move(s, 'a', { kind: 'take', tokens: [1, 1, 1, 0, 0, 0] }, () => 0);
  f.emit({ type: 'splendor-state', room: room(next) });
  const snapshot = f.owner.getSnapshot();
  f.emit({ type: 'splendor-state', room: room(s) });
  assert.equal(f.owner.getSnapshot(), snapshot);
});
test('gold choices stay within the wallet and purchase sends the exact selected payment once', async (t) => {
  const f = await setup(t),
    s = game(),
    c = s.market[0][0],
    i = c.cost.findIndex((n) => n > 0);
  s.players[0].tokens = [...c.cost, 1];
  f.emit({ type: 'splendor-state', room: room(s) });
  f.owner.openCard(c.id);
  const before = f.owner.getSnapshot().card.payment;
  f.owner.payGold(i, true);
  const pay = f.owner.getSnapshot().card.payment;
  assert.equal(pay[i], before[i] - 1);
  assert.equal(pay[5], 1);
  f.owner.payGold(i, true);
  assert.equal(f.owner.getSnapshot().card.payment[5], 1);
  f.owner.payGold(i, false);
  assert.deepEqual(f.owner.getSnapshot().card.payment, before);
  f.owner.payGold(i, true);
  await f.owner.buy();
  await f.owner.buy();
  assert.equal(f.calls.filter((c) => c.action === 'move').length, 1);
  assert.deepEqual(f.calls.at(-1).payload.move.payment, pay);
});
test('over-limit actions require the exact returned tokens and confirmation is invalidated by a new revision', async (t) => {
  const f = await setup(t),
    s = game();
  s.players[0].tokens = [3, 3, 3, 0, 0, 0];
  f.emit({ type: 'splendor-state', room: room(s) });
  f.owner.submit({ kind: 'take', tokens: [0, 0, 0, 2, 0, 0] });
  assert.equal(f.owner.getSnapshot().returns.excess, 1);
  await f.owner.confirmReturn();
  assert.equal(f.calls.length, 0);
  f.owner.returnToken(0);
  await f.owner.confirmReturn();
  assert.deepEqual(f.calls.at(-1).payload.move.returnTokens, [1, 0, 0, 0, 0, 0]);
  assert.equal(f.owner.getSnapshot().returns, null);
  const g = await setup(t);
  g.emit({ type: 'splendor-state', room: room(s) });
  g.owner.submit({ kind: 'take', tokens: [0, 0, 0, 2, 0, 0] });
  g.owner.returnToken(0);
  const next = R.move(
    s,
    'a',
    { kind: 'take', tokens: [0, 0, 0, 2, 0, 0], returnTokens: [1, 0, 0, 0, 0, 0] },
    () => 0,
  );
  g.emit({ type: 'splendor-state', room: room(next) });
  await g.owner.confirmReturn();
  assert.equal(g.calls.length, 0);
  assert.equal(g.owner.getSnapshot().returns, null);
});
test('account ABA cancels authentication continuations and old ranking/list payloads stay outside the new scope', async (t) => {
  const f = await setup(t);
  f.emit({ type: 'splendor-state', room: room(game()) });
  const held = deferred();
  f.auth(() => held.promise);
  f.owner.refreshRanking();
  const waiting = f.owner.refreshRooms();
  f.visible(false);
  f.account(null);
  f.account('a');
  held.resolve(true);
  await waiting;
  await tick();
  assert.equal(f.calls.length, 0);
  assert.equal(f.owner.getSnapshot().room, null);
  f.emit({ type: 'splendor-rooms', rooms: [], resumeId: 'mesa-antiga' });
  f.emit({ type: 'splendor-ranking', requestId: '1', rows: [] });
  assert.equal(f.owner.getSnapshot().resumeId, null);
});
test('pending moves deduplicate and an obsolete timeout or auth result cannot release/send a newer intent', async (t) => {
  const f = await setup(t);
  f.emit({ type: 'splendor-state', room: room(game()) });
  const held = deferred();
  f.auth(() => held.promise);
  const input = { kind: 'take', tokens: [1, 1, 1, 0, 0, 0] },
    first = f.owner.submit(input);
  f.owner.submit(input);
  input.tokens[0] = 2;
  assert.equal(f.jobs.length, 1);
  const old = f.jobs[0];
  await f.advance(12000);
  const second = f.owner.submit({ kind: 'take', tokens: [0, 1, 1, 1, 0, 0] });
  old.fn();
  assert.equal(f.owner.getSnapshot().pending, true);
  held.resolve(true);
  await first;
  await second;
  await tick();
  const moves = f.calls.filter((c) => c.action === 'move');
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].payload.move.tokens, [0, 1, 1, 1, 0, 0]);
});
test('replay keeps its own display while later moves arrive, and hiding cancels every pending phase', async (t) => {
  const f = await setup(t, { reduced: false }),
    s = game(),
    next = R.move(s, 'a', { kind: 'take', tokens: [1, 1, 1, 0, 0, 0] }, () => 0);
  f.emit({ type: 'splendor-state', room: room(s) });
  f.emit({ type: 'splendor-state', room: room(next) });
  const replay = f.owner.getSnapshot().replay;
  assert.equal(replay.phase, 'flight');
  assert.equal(replay.state.revision, 0);
  const later = R.move(next, 'b', { kind: 'take', tokens: [0, 0, 0, 2, 0, 0] }, () => 0);
  f.emit({ type: 'splendor-state', room: room(later) });
  assert.equal(f.owner.getSnapshot().replay, replay);
  assert.equal(f.owner.getSnapshot().room.state.revision, 2);
  f.visible(false);
  await tick();
  assert.equal(f.owner.getSnapshot().replay, null);
  assert(f.jobs.every((j) => j.canceled));
  assert(f.cancels > 0);
});
test('purchase presentation uses payment/showcase/flight/landed without modifying authoritative scores', async (t) => {
  const f = await setup(t, { reduced: false }),
    s = game(),
    c = s.market[0][0];
  s.players[0].tokens = [...c.cost, 0];
  const next = R.move(s, 'a', { kind: 'buy', id: c.id }, () => 0);
  f.emit({ type: 'splendor-state', room: room(s) });
  f.emit({ type: 'splendor-state', room: room(next) });
  const authority = structuredClone(f.owner.getSnapshot().room.state);
  assert.equal(f.owner.getSnapshot().replay.phase, 'payment');
  await f.advance();
  assert.equal(f.owner.getSnapshot().replay.phase, 'showcase');
  await f.advance();
  assert.equal(f.owner.getSnapshot().replay.phase, 'flight');
  await f.advance();
  assert.equal(f.owner.getSnapshot().replay.phase, 'landed');
  assert.deepEqual(f.owner.getSnapshot().room.state, authority);
  f.reduce();
  await tick();
  assert.equal(f.owner.getSnapshot().replay, null);
});
test('correlated ranking, disconnect and disposal keep private choices and resource lifetime bounded', async (t) => {
  const f = await setup(t);
  f.owner.refreshRanking();
  f.owner.refreshRanking();
  await tick();
  const id = f.calls.at(-1).payload.requestId;
  f.emit({
    type: 'splendor-ranking',
    requestId: id,
    rows: [
      { playerId: 'a', name: 'Mercador', score: 20, cards: 10, mode: 'online', date: '2026-10-19' },
    ],
  });
  const before = f.owner.getSnapshot();
  f.emit({ type: 'splendor-error', requestId: 'antigo', message: 'Antigo' });
  assert.equal(f.owner.getSnapshot(), before);
  f.emit({ type: 'splendor-state', room: room(game()) });
  f.owner.showRules(true);
  f.emit({ type: 'connection', connected: false });
  assert.equal(f.owner.getSnapshot().rulesOpen, false);
  assert.equal(f.owner.getSnapshot().connected, false);
  f.owner.subscribe(() => f.owner.dispose());
  f.owner.dispose();
  assert.equal(f.messages.size, 0);
  assert.equal(f.identities.size, 0);
});
