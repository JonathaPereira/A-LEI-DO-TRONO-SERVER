'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-history.ts'),
  import('../src/lib/games/throne-history-protocol.ts'),
  import('../src/lib/games/throne-log-layout.ts'),
]);
function scores(round = 1) {
  return [4, 3, 2, 1].map((count, seat) => {
    const crowns = count * round,
      shadows = (5 - count) * round,
      pairs = Math.min(crowns, shadows);
    return {
      seat,
      name: `Casa ${seat}`,
      crowns,
      shadows,
      pairs,
      prestige: crowns + shadows + 2 * pairs,
      roundScore: {
        crowns: count,
        shadows: 5 - count,
        pairs: Math.min(count, 5 - count),
        gained: count + (5 - count) + 2 * Math.min(count, 5 - count),
      },
      hand: ['secret'],
    };
  });
}
const entry = (message = 'Public record') => ({
  ts: 1000,
  round: 1,
  trick: 1,
  message,
  private: 'ignore',
});
const result = (kind = 'round', round = kind === 'final' ? 3 : 1) => ({
  kind,
  round,
  scores: scores(round),
  winners: [1],
  finalLog: [entry()],
});
function table(round = 1, phase = 'round-end') {
  return {
    round,
    trick: 10,
    phase,
    localPlayerId: 0,
    players: scores(round).map((p) => ({
      id: p.seat,
      name: p.name,
      totalCrowns: p.crowns,
      totalShadows: p.shadows,
    })),
  };
}
async function fixture() {
  const [{ createThroneHistory }] = await modules;
  let view = { mode: null, match: null },
    identity = 'a',
    scope = { key: 'a:room', seat: 0 },
    connected = true,
    visible = true,
    leaves = 0;
  const source = new Set(),
    messages = new Set(),
    notices = [],
    warnings = [];
  const c = createThroneHistory({
    identity: () => identity,
    scope: () => scope,
    match: () => view,
    connected: () => connected,
    visible: () => visible,
    now: () => 1000,
    subscribeSource(fn) {
      source.add(fn);
      return () => source.delete(fn);
    },
    subscribeMessages(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    notify(message) {
      notices.push(message);
    },
    leave() {
      leaves++;
    },
    warn(error) {
      warnings.push(error);
    },
  });
  c.start();
  const refresh = () => source.forEach((fn) => fn());
  return {
    c,
    source,
    messages,
    notices,
    warnings,
    leaves: () => leaves,
    view(value) {
      view = value;
      refresh();
    },
    emit(message) {
      messages.forEach((fn) => fn(message));
    },
    identity(value) {
      identity = value;
      refresh();
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
  };
}
test('public result/log parsers copy only known fields, compute the final ranking and validate scores, ties and bounds', async () => {
  const [, { readThroneLog, readThroneResult }] = await modules,
    raw = result('final');
  const parsed = readThroneResult(raw, 'online');
  assert.equal(parsed.scores[0].seat, 1);
  assert.deepEqual(parsed.winners, [1]);
  assert(!('hand' in parsed.scores[0]));
  assert(!('private' in parsed.entries[0]));
  assert(Object.isFrozen(parsed.entries[0]));
  assert(!Object.isFrozen(raw.scores[0]));
  assert.equal(
    readThroneLog(entry('<img src=x onerror=bad>'), 5).message,
    '<img src=x onerror=bad>',
  );
  for (const change of [
    (r) => {
      r.scores[1].seat = 0;
    },
    (r) => {
      r.scores[0].prestige++;
    },
    (r) => {
      r.scores[0].pairs++;
    },
    (r) => {
      r.winners = [0];
    },
    (r) => {
      r.finalLog = Array(601).fill(entry());
    },
    (r) => {
      r.scores[0].crowns = 31;
    },
  ]) {
    const r = result('final');
    change(r);
    assert.throws(() => readThroneResult(r, 'online'));
  }
  const tied = [10, 10, 5, 5].map((crowns, seat) => ({
    seat,
    name: `Casa ${seat}`,
    crowns,
    shadows: 15 - crowns,
    pairs: 5,
    prestige: 25,
  }));
  assert.deepEqual(
    readThroneResult({ kind: 'final', round: 3, scores: tied, winners: [0, 1] }, 'online').winners,
    [0, 1],
  );
  assert.throws(() => readThroneLog(entry('x'.repeat(8001)), 1));
  assert.throws(() =>
    readThroneResult(
      { ...result(), scores: scores().map((p) => ({ ...p, roundScore: null })) },
      'local',
    ),
  );
});
test('early public logs survive initial state, remain bounded, and clearing the log does not erase a result', async () => {
  const f = await fixture();
  f.view({ mode: 'online', match: null });
  f.emit({ type: 'game-started' });
  f.emit({ type: 'game-event', event: 'log', message: 'Partida iniciada' });
  f.view({ mode: 'online', match: table() });
  assert.equal(f.c.getSnapshot().entries[0].message, 'Partida iniciada');
  f.c.appendPublic('Influência pública obtida', 1, 10);
  assert.equal(f.c.getSnapshot().entries.at(-1).message, 'Influência pública obtida');
  for (let i = 0; i < 605; i++)
    f.emit({ type: 'game-event', event: 'log', message: 'Record ' + i });
  assert.equal(f.c.getSnapshot().entries.length, 600);
  assert.equal(f.c.getSnapshot().entries[0].message, 'Record 5');
  f.emit({ type: 'game-event', event: 'round-ended', round: 1, scores: scores() });
  const round = f.c.getSnapshot().lastRound;
  f.c.clearEntries();
  assert.equal(f.c.getSnapshot().entries.length, 0);
  assert.equal(f.c.getSnapshot().lastRound, round);
  f.c.dispose();
});
test('round/final events wait for matching authoritative scores and cannot auto-advance online play', async () => {
  const f = await fixture();
  f.view({ mode: 'online', match: table(1, 'await-play') });
  f.emit({ type: 'game-event', event: 'round-ended', round: 1, scores: scores() });
  assert.equal(f.c.getSnapshot().lastRound, null);
  f.view({ mode: 'online', match: table() });
  assert.equal(f.notices.length, 1);
  assert.equal(f.c.getSnapshot().dialog, null);
  f.emit({ type: 'game-event', event: 'round-ended', round: 1, scores: scores() });
  assert.equal(f.notices.length, 1);
  f.emit({ type: 'game-event', event: 'game-ended', ...result('final'), round: undefined });
  assert.equal(f.c.getSnapshot().dialog, null);
  f.view({ mode: 'online', match: table(3, 'game-over') });
  const dialog = f.c.getSnapshot().dialog;
  assert(dialog && f.c.getSnapshot().resultOpen);
  assert.equal(f.leaves(), 0);
  f.visible(false);
  assert(!f.c.confirm(dialog));
  assert.equal(f.c.getSnapshot().dialog, dialog);
  f.visible(true);
  assert(f.c.confirm(dialog));
  assert(!f.c.confirm(dialog));
  assert.equal(f.leaves(), 1);
  f.c.dispose();
});
test('invalid or mismatched results cannot open a dialog; disconnect, identity ABA and room changes clear public history', async () => {
  const f = await fixture();
  f.view({ mode: 'online', match: table(3, 'game-over') });
  f.emit({
    type: 'game-event',
    event: 'game-ended',
    ...result('final'),
    scores: scores(3).map((p) => ({ ...p, name: 'Wrong name' })),
  });
  assert.equal(f.c.getSnapshot().dialog, null);
  assert.equal(f.warnings.length, 1);
  for (const change of [
    () => f.connected(false),
    () => f.identity('b'),
    () => f.scope({ key: 'a:new-room', seat: 1 }),
  ]) {
    f.connected(true);
    f.view({ mode: 'online', match: table(3, 'game-over') });
    f.emit({ type: 'game-started' });
    f.emit({ type: 'game-event', event: 'log', message: 'Public' });
    change();
    assert.equal(f.c.getSnapshot().entries.length, 0);
  }
  f.identity('a');
  assert.equal(f.c.getSnapshot().entries.length, 0);
  f.c.dispose();
});
test('local results resolve only their own confirmation, reject on cancellation and never leave online rooms', async () => {
  const f = await fixture();
  f.view({ mode: 'local', match: null });
  f.c.appendPublic('<b>literal name</b>', 1, 1);
  const first = f.c.showLocal(result()),
    old = f.c.getSnapshot().dialog;
  const aborted = assert.rejects(first, { name: 'AbortError' });
  const second = f.c.showLocal(result('final'));
  await aborted;
  assert(!f.c.confirm(old));
  const current = f.c.getSnapshot().dialog;
  f.visible(false);
  assert(!f.c.confirm(current));
  f.visible(true);
  assert(f.c.confirm(current));
  await second;
  assert.equal(f.leaves(), 0);
  const pending = f.c.showLocal(result()),
    cancelled = assert.rejects(pending, { name: 'AbortError' });
  f.view({ mode: null, match: null });
  await cancelled;
  assert.equal(f.c.getSnapshot().entries.length, 0);
  assert.equal(f.c.getSnapshot().dialog, null);
  f.c.dispose();
});
test('cancellation blocks late events; disposal removes listeners and rejects local continuations', async () => {
  const f = await fixture();
  f.view({ mode: 'online', match: table(3, 'game-over') });
  f.c.clear();
  f.c.appendPublic('Late public effect', 3, 10);
  assert.equal(f.c.getSnapshot().entries.length, 0);
  f.emit({ type: 'game-event', event: 'game-ended', ...result('final') });
  assert.equal(f.c.getSnapshot().dialog, null);
  f.view({ mode: 'local', match: null });
  const pending = f.c.showLocal(result()),
    rejected = assert.rejects(pending, { name: 'AbortError' });
  f.c.dispose();
  await rejected;
  assert.equal(f.source.size, 0);
  assert.equal(f.messages.size, 0);
  f.c.start();
  f.c.toggleLog();
  assert.equal(f.c.getSnapshot().logOpen, false);
});
test('saved log geometry rejects corrupt data and stays inside normal, small-height and mobile viewports', async () => {
  const [, , { clampLogGeometry }] = await modules;
  assert.equal(
    clampLogGeometry(
      { left: 0, top: Infinity, width: 390, height: 250 },
      { width: 1440, height: 960 },
    ),
    null,
  );
  assert.equal(
    clampLogGeometry({ left: 0, top: 0, width: 390, height: 250 }, { width: 480, height: 800 }),
    null,
  );
  for (const height of [120, 520, 960]) {
    const g = clampLogGeometry(
      { left: 9999, top: 9999, width: 9999, height: 9999 },
      { width: 1280, height },
    );
    assert(g.left >= 0 && g.top >= 0 && g.left + g.width <= 1280 && g.top + g.height <= height);
  }
  assert.equal(
    clampLogGeometry({ left: 100, top: 350, width: 390, height: 250 }, { width: 1440, height: 960 })
      .top,
    350,
  );
});
