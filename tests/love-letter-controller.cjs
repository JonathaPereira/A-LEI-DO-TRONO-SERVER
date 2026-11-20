'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const R = require('../src/lib/games/love-letter-rules.ts');
const moduleReady = import('../src/lib/games/love-letter.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function game(a = [1, 4], b = [2]) {
  const s = R.create(
      [
        { id: 'a', name: 'Cortesão' },
        { id: 'b', name: 'Amigo' },
      ],
      () => 0,
    ),
    pool = [...s.deck, s.removed, ...s.faceUpRemoved, ...s.players.flatMap((p) => p.hand)];
  function take(rank) {
    const i = pool.findIndex((c) => c.rank === rank);
    assert(i >= 0);
    return pool.splice(i, 1)[0];
  }
  s.players[0].hand = a.map(take);
  s.players[1].hand = b.map(take);
  s.removed = pool.pop();
  s.faceUpRemoved = pool.splice(-3);
  s.deck = pool;
  s.turn = 0;
  s.starter = 0;
  return s;
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
      avatar_preset: 'crown',
      avatar_file_id: null,
    })),
    state: R.publicState(s, viewer),
  };
}
function endRound(s) {
  for (let i = 0; !['round-over', 'finished'].includes(s.phase); i++) {
    assert(i < 50);
    s = R.move(
      s,
      s.players[s.turn].id,
      R.botMove(s, () => 0),
    );
  }
  return s;
}
async function setup(t, viewer = 'a') {
  const { createLoveLetter } = await moduleReady;
  let account = viewer,
    connected = true,
    visible = true,
    reduced = false,
    auth = async () => true;
  const identities = new Set(),
    messages = new Set(),
    jobs = [],
    calls = [],
    errors = [],
    sounds = [];
  const owner = createLoveLetter({
    getAccountId: () => account,
    connected: () => connected,
    visible: () => visible,
    reduced: () => reduced,
    rules: R,
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
    sound: (kind) => sounds.push(kind),
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
    sounds,
    identities,
    messages,
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
      const job = jobs.find((j) => !j.canceled && j.ms === ms);
      assert(job);
      job.canceled = true;
      job.fn();
      await tick();
    },
  };
}
test('wire validation freezes copies, preserves hidden hands and rejects malformed private/active state', async (t) => {
  const f = await setup(t),
    s = game(),
    wire = room(s);
  wire.state.players[1].hand[0].rank = 9;
  wire.state.players[1].hand[0].id = '9-0';
  f.emit({ type: 'love-letter-state', room: wire });
  const snapshot = f.owner.getSnapshot();
  assert.deepEqual(snapshot.room.state.players[1].hand, [{ hidden: true }]);
  assert(Object.isFrozen(snapshot.room.state.players[0].hand));
  wire.state.players[0].hand[0].rank = 8;
  assert.equal(snapshot.room.state.players[0].hand[0].rank, 1);
  for (const mutate of [
    (r) => (r.state.players[1].hand = [s.players[1].hand[0]]),
    (r) => (r.state.players[0].handCount = 0),
    (r) => (r.state.players[0].hand[0].rank = 22),
    (r) => (r.state.turn = 8),
    (r) => (r.state.private = {}),
    (r) => {
      r.state.phase = 'chancellor';
      r.state.chancellor = { playerId: 'a' };
      r.state.players[0].hand = [];
      r.state.players[0].handCount = 0;
    },
  ]) {
    const bad = room(s);
    mutate(bad);
    f.emit({ type: 'love-letter-state', room: bad });
    assert.equal(f.owner.getSnapshot(), snapshot);
  }
  assert.equal(f.errors.length, 6);
});
test('Padre information requires the viewer as actor and never becomes a public opponent hand', async (t) => {
  const f = await setup(t),
    s = game([2, 4], [7]),
    next = R.move(s, 'a', { kind: 'play', cardId: s.players[0].hand[0].id, targetId: 'b' }),
    wire = room(next);
  f.emit({ type: 'love-letter-state', room: wire });
  assert.equal(f.owner.getSnapshot().privateOpen, true);
  assert.equal(f.owner.getSnapshot().room.state.private[0].card.rank, 7);
  assert(f.owner.getSnapshot().room.state.players[1].hand.every((c) => c.hidden));
  const g = await setup(t);
  g.visible(false);
  g.account('b');
  g.auth(async () => true);
  await g.owner.refreshRooms();
  g.emit({ type: 'love-letter-state', room: room(next, 'mesa', 'b') });
  assert.equal(g.owner.getSnapshot().room.state.private.length, 0);
  const good = g.owner.getSnapshot(),
    leak = room(next, 'mesa', 'b');
  leak.state.private = wire.state.private;
  g.emit({ type: 'love-letter-state', room: leak });
  assert.equal(g.owner.getSnapshot(), good);
});
test('forced Condessa and protected targets are enforced before any move is sent', async (t) => {
  const f = await setup(t),
    s = game([8, 5], [2]);
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.owner.selectCard(s.players[0].hand[1].id);
  assert.equal(f.owner.getSnapshot().selected, null);
  assert.match(f.owner.getSnapshot().notice, /Condessa/);
  await f.owner.commit({ kind: 'play', cardId: s.players[0].hand[1].id, targetId: 'b' });
  assert.equal(f.calls.length, 0);
  f.owner.selectCard(s.players[0].hand[0].id);
  await f.owner.confirmSelected();
  assert.equal(f.calls.length, 1);
  const g = await setup(t),
    protectedState = game();
  protectedState.players[1].protected = true;
  g.emit({ type: 'love-letter-state', room: room(protectedState) });
  g.owner.selectCard(protectedState.players[0].hand[0].id);
  await g.owner.chooseTarget('b');
  assert.equal(g.calls.length, 0);
  await g.owner.confirmSelected();
  assert.deepEqual(g.calls[0].payload.move, {
    kind: 'play',
    cardId: protectedState.players[0].hand[0].id,
  });
});
test('Guarda rejects guessing Guarda, preserves target navigation and ignores a selection from a previous revision', async (t) => {
  const f = await setup(t),
    s = game();
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.owner.selectCard(s.players[0].hand[0].id);
  await f.owner.chooseTarget('b');
  await f.owner.guess(1);
  assert.equal(f.calls.length, 0);
  f.owner.backTargets();
  assert.equal(f.owner.getSnapshot().selected.targetId, null);
  await f.owner.chooseTarget('b');
  const next = R.move(s, 'a', { kind: 'play', cardId: s.players[0].hand[1].id });
  f.emit({ type: 'love-letter-state', room: room(next) });
  await f.owner.guess(2);
  assert.equal(f.calls.length, 0);
  assert.equal(f.owner.getSnapshot().selected, null);
});
test('Príncipe can target self when protected opponents cannot be selected', async (t) => {
  const f = await setup(t),
    s = game([5, 4], [2]);
  s.players[1].protected = true;
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.owner.selectCard(s.players[0].hand[0].id);
  await f.owner.chooseTarget('b');
  assert.equal(f.calls.length, 0);
  await f.owner.chooseTarget('a');
  assert.equal(f.calls[0].payload.move.targetId, 'a');
});
test('Chanceler keeps its private order through presence updates and submits that order only once', async (t) => {
  const f = await setup(t),
    s = game([6, 4], [2]),
    next = R.move(s, 'a', { kind: 'play', cardId: s.players[0].hand[0].id });
  f.emit({ type: 'love-letter-state', room: room(next) });
  const hand = next.players[0].hand;
  f.owner.chooseKeep(hand[1].id);
  f.owner.invertBottom();
  const choice = f.owner.getSnapshot().chancellor,
    wire = room(next);
  wire.players[1].online = false;
  f.emit({ type: 'love-letter-state', room: wire });
  assert.equal(f.owner.getSnapshot().chancellor, choice);
  await f.owner.confirmChancellor();
  await f.owner.confirmChancellor();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].payload.move, {
    kind: 'chancellor',
    keep: choice.keep,
    bottom: [...choice.bottom],
  });
  const after = R.move(next, 'a', f.calls[0].payload.move);
  f.emit({ type: 'love-letter-state', room: room(after) });
  await f.owner.confirmChancellor();
  assert.equal(f.calls.length, 1);
  assert.equal(f.owner.getSnapshot().chancellor, null);
});
test('account ABA and disconnect clear choices and invalidate authentication continuations and old private payloads', async (t) => {
  const f = await setup(t),
    s = game();
  f.emit({ type: 'love-letter-state', room: room(s) });
  const held = deferred();
  f.auth(() => held.promise);
  f.owner.selectCard(s.players[0].hand[0].id);
  await f.owner.chooseTarget('b');
  const sending = f.owner.guess(2);
  f.visible(false);
  const published = [];
  const unsubscribe = f.owner.subscribe(() => published.push(f.owner.getSnapshot().room));
  f.account(null);
  f.account('a');
  unsubscribe();
  assert(
    published.every((room) => room === null),
    'Account changes must not republish old private cards',
  );
  held.resolve(true);
  await sending;
  assert.equal(f.calls.length, 0);
  assert.equal(f.owner.getSnapshot().room, null);
  f.emit({ type: 'love-letter-rooms', rooms: [], resumeId: 'mesa-antiga' });
  assert.equal(f.owner.getSnapshot().resumeId, null);
  f.auth(async () => true);
  await f.owner.refreshRooms();
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.owner.showRules(true);
  f.emit({ type: 'connection', connected: false });
  assert.equal(f.owner.getSnapshot().rulesOpen, false);
  assert.equal(f.owner.getSnapshot().selected, null);
});
test('pending sends are deduplicated and an old timeout cannot release or send in the new table', async (t) => {
  const f = await setup(t),
    s = game();
  f.emit({ type: 'love-letter-state', room: room(s) });
  const held = deferred();
  f.auth(() => held.promise);
  const move = { kind: 'play', cardId: s.players[0].hand[1].id },
    sending = f.owner.commit(move);
  f.owner.commit(move);
  assert.equal(f.jobs.length, 1);
  const old = f.jobs[0];
  await f.advance(12000);
  f.emit({ type: 'love-letter-state', room: room(s, 'nova') });
  const next = f.owner.commit(move);
  old.fn();
  assert.equal(f.owner.getSnapshot().pending, true);
  held.resolve(true);
  await sending;
  await next;
  await tick();
  assert.equal(f.calls.filter((c) => c.action === 'move').length, 1);
});
test('private information opens once on visibility, clears at the new round, and next-round requests deduplicate', async (t) => {
  const f = await setup(t),
    s = game([2, 4], [7]),
    peek = R.move(s, 'a', { kind: 'play', cardId: s.players[0].hand[0].id, targetId: 'b' });
  f.visible(false);
  f.emit({ type: 'love-letter-state', room: room(peek) });
  assert.equal(f.owner.getSnapshot().privateOpen, false);
  f.visible(true);
  assert.equal(f.owner.getSnapshot().privateOpen, true);
  f.owner.closePrivate();
  f.emit({ type: 'love-letter-state', room: room(peek) });
  assert.equal(f.owner.getSnapshot().privateOpen, false);
  const ended = endRound(peek);
  assert.equal(ended.phase, 'round-over');
  f.emit({ type: 'love-letter-state', room: room(ended) });
  await f.owner.nextRound();
  await f.owner.nextRound();
  assert.equal(f.calls.filter((c) => c.action === 'next-round').length, 1);
  const next = R.nextRound(ended, () => 0);
  f.emit({ type: 'love-letter-state', room: room(next) });
  assert.equal(f.owner.getSnapshot().privateOpen, false);
  assert.equal(f.owner.getSnapshot().room.state.private.length, 0);
  assert.equal(f.owner.getSnapshot().pending, false);
});
test('effect timers do not replay on roster delivery and disposal detaches every owner subscription', async (t) => {
  const f = await setup(t),
    s = game(),
    next = R.move(s, 'a', {
      kind: 'play',
      cardId: s.players[0].hand[0].id,
      targetId: 'b',
      guess: 0,
    });
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.emit({ type: 'love-letter-state', room: room(next) });
  assert.equal(f.owner.getSnapshot().effectTarget, 'b');
  const count = f.sounds.length,
    wire = room(next);
  wire.players[1].online = false;
  f.emit({ type: 'love-letter-state', room: wire });
  assert.equal(f.sounds.length, count);
  await f.advance(2000);
  await f.advance(2800);
  assert.equal(f.owner.getSnapshot().effectTarget, null);
  const snapshot = f.owner.getSnapshot();
  f.emit({ type: 'love-letter-state', room: room(s) });
  assert.equal(f.owner.getSnapshot(), snapshot);
  f.owner.subscribe(() => f.owner.dispose());
  f.owner.dispose();
  assert.equal(f.identities.size, 0);
  assert.equal(f.messages.size, 0);
  assert(f.jobs.every((j) => j.canceled));
});

test('every viewer sees the Guard announcement for two seconds before elimination, scores and the next round', async (t) => {
  const s = game(),
    after = R.move(s, 'a', {
      kind: 'play',
      cardId: s.players[0].hand[0].id,
      targetId: 'b',
      guess: 2,
    });
  for (const viewer of ['a', 'b']) {
    const f = await setup(t, viewer);
    f.emit({ type: 'love-letter-state', room: room(s, 'mesa', viewer) });
    f.emit({ type: 'love-letter-state', room: room(after, 'mesa', viewer) });
    const snapshot = f.owner.getSnapshot();
    assert.equal(snapshot.presentation?.phase, 'announce');
    assert.equal(snapshot.presentation.event.playerId, 'a');
    assert.equal(snapshot.presentation.event.targetId, 'b');
    assert.equal(snapshot.presentation.event.guess, 2);
    assert.equal(snapshot.displayState.players[1].eliminated, false);
    assert.equal(snapshot.displayState.roundResult, null);
    assert.equal(snapshot.room.state.phase, 'round-over', 'authoritative state is never delayed');
    assert(snapshot.displayState.players.find((p) => p.id !== viewer).hand.every((c) => c.hidden));
    await f.owner.nextRound();
    assert.equal(f.calls.length, 0, 'round actions wait for the presentation');
    await f.advance(2000);
    assert.equal(f.owner.getSnapshot().presentation.phase, 'result');
    assert.equal(f.owner.getSnapshot().displayState.players[1].eliminated, true);
    await f.advance(2800);
    assert.equal(f.owner.getSnapshot().presentation, null);
    assert.equal(f.owner.getSnapshot().displayState.revision, after.revision);
    assert.equal(f.errors.length, 0);
  }
});

test('consecutive plays queue in order and roster delivery never restarts their presentation', async (t) => {
  const f = await setup(t),
    s = game(),
    first = R.move(s, 'a', {
      kind: 'play',
      cardId: s.players[0].hand[0].id,
      targetId: 'b',
      guess: 0,
    }),
    second = R.move(
      first,
      'b',
      R.botMove(R.publicState(first, 'b'), () => 0),
    );
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.emit({ type: 'love-letter-state', room: room(first) });
  const old = f.jobs.at(-1);
  f.emit({ type: 'love-letter-state', room: room(second) });
  assert.equal(f.owner.getSnapshot().presentation?.event.revision, first.revision);
  const jobs = f.jobs.length,
    soundCount = f.sounds.length;
  f.emit({ type: 'love-letter-state', room: room(second) });
  assert.equal(f.jobs.length, jobs);
  assert.equal(f.sounds.length, soundCount);
  await f.advance(2000);
  await f.advance(2800);
  assert.equal(f.owner.getSnapshot().presentation.event.revision, second.revision);
  old.fn();
  assert.equal(f.owner.getSnapshot().presentation.phase, 'announce');
  f.visible(false);
  assert.equal(f.owner.getSnapshot().presentation, null);
  assert.equal(f.owner.getSnapshot().displayState.revision, second.revision);
  f.visible(true);
  assert.equal(
    f.owner.getSnapshot().presentation,
    null,
    'returning to the table does not replay history',
  );
});

test('reduced motion keeps the Guard suspense and clear announcements, while account changes cancel queued results', async (t) => {
  const f = await setup(t),
    s = game(),
    next = R.move(s, 'a', {
      kind: 'play',
      cardId: s.players[0].hand[0].id,
      targetId: 'b',
      guess: 0,
    });
  f.reduce();
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.emit({ type: 'love-letter-state', room: room(next) });
  assert.equal(f.owner.getSnapshot().presentation?.phase, 'announce');
  const old = f.jobs.at(-1);
  await f.advance(2000);
  assert.equal(f.owner.getSnapshot().presentation.phase, 'result');
  f.account(null);
  old.fn();
  assert.equal(f.owner.getSnapshot().presentation, null);
  assert.equal(f.owner.getSnapshot().displayState, null);
  assert.equal(f.owner.getSnapshot().room, null);
});

test('Padre, Baron, Prince and King announce their actor and target without exposing secret hands', async (t) => {
  for (const rank of [2, 3, 5, 7]) {
    const f = await setup(t),
      s = game([rank, 4], [7 === rank ? 2 : 7]),
      next = R.move(s, 'a', { kind: 'play', cardId: s.players[0].hand[0].id, targetId: 'b' });
    f.emit({ type: 'love-letter-state', room: room(s) });
    f.emit({ type: 'love-letter-state', room: room(next) });
    assert.equal(f.owner.getSnapshot().presentation.event.card.rank, rank);
    assert.equal(f.owner.getSnapshot().presentation.event.targetId, 'b');
    assert.equal(f.owner.getSnapshot().privateOpen, false);
    assert(!('hand' in f.owner.getSnapshot().presentation.event));
    assert(!('private' in f.owner.getSnapshot().presentation.event));
    await f.advance(1200);
    const result = f.owner.getSnapshot();
    assert.equal(result.presentation.phase, 'result');
    assert(result.displayState.players[1].hand.every((c) => c.hidden));
    await f.advance(2800);
    assert.equal(f.owner.getSnapshot().privateOpen, rank === 2);
  }
});

test('no-target effects and round transitions remain readable without replaying after a reconnect', async (t) => {
  const f = await setup(t),
    s = game([7, 4], [2]);
  s.players[1].protected = true;
  const next = R.move(s, 'a', { kind: 'play', cardId: s.players[0].hand[0].id });
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.emit({ type: 'love-letter-state', room: room(next) });
  assert.equal(f.owner.getSnapshot().presentation.event.noTarget, true);
  await f.advance(1200);
  assert.equal(f.owner.getSnapshot().presentation.phase, 'result');
  f.emit({ type: 'connection', connected: false });
  assert.equal(f.owner.getSnapshot().presentation, null);
  f.emit({ type: 'connection', connected: true });
  await f.owner.refreshRooms();
  f.emit({ type: 'love-letter-state', room: room(next) });
  assert.equal(f.owner.getSnapshot().presentation, null);
});

test('disposing from a presentation subscriber cannot start orphaned timers or sounds', async (t) => {
  const f = await setup(t),
    s = game(),
    next = R.move(s, 'a', {
      kind: 'play',
      cardId: s.players[0].hand[0].id,
      targetId: 'b',
      guess: 0,
    });
  f.emit({ type: 'love-letter-state', room: room(s) });
  f.owner.subscribe(() => {
    if (f.owner.getSnapshot().presentation) f.owner.dispose();
  });
  f.emit({ type: 'love-letter-state', room: room(next) });
  assert(f.jobs.every((j) => j.canceled));
  assert.equal(f.sounds.length, 0);
  assert.equal(f.identities.size, 0);
  assert.equal(f.messages.size, 0);
});

test('a round started by another host closes the previous round private dialog', async (t) => {
  const f = await setup(t),
    s = game([2, 4], [7]),
    peek = R.move(s, 'a', { kind: 'play', cardId: s.players[0].hand[0].id, targetId: 'b' });
  f.emit({ type: 'love-letter-state', room: room(peek) });
  assert.equal(f.owner.getSnapshot().privateOpen, true);
  const ended = endRound(peek);
  f.emit({ type: 'love-letter-state', room: room(ended) });
  f.emit({ type: 'love-letter-state', room: room(R.nextRound(ended, () => 0)) });
  assert.equal(f.owner.getSnapshot().privateOpen, false);
});

test('same-revision account updates refresh the idle table without replaying a card', async (t) => {
  const f = await setup(t),
    s = game();
  f.emit({ type: 'love-letter-state', room: room(s) });
  const wire = room(s);
  wire.state.players[1].name = 'Novo nome';
  wire.players[1].name = 'Novo nome';
  f.emit({ type: 'love-letter-state', room: wire });
  assert.equal(f.owner.getSnapshot().displayState.players[1].name, 'Novo nome');
  assert.equal(f.owner.getSnapshot().presentation, null);
  assert.equal(f.jobs.length, 0);
});
