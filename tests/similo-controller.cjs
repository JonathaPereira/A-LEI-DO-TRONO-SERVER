const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createSimilo } = require('../src/lib/games/similo/controller.ts');
const { createSimiloService } = require('../server/similo-service.ts');
function fixture() {
  let id = 'a',
    connected = true,
    visible = true,
    authenticate = async () => true;
  const identities = new Set(),
    messages = new Set(),
    sent = [],
    tasks = [];
  const c = createSimilo({
    getAccountId: () => id,
    connected: () => connected,
    visible: () => visible,
    subscribeIdentity: (fn) => (identities.add(fn), () => identities.delete(fn)),
    subscribeMessages: (fn) => (messages.add(fn), () => messages.delete(fn)),
    ensureAuthenticated: () => authenticate(),
    send: (action, payload) => (sent.push({ action, ...payload }), true),
    schedule(fn) {
      tasks.push(fn);
      return () => {
        const i = tasks.indexOf(fn);
        if (i >= 0) tasks.splice(i, 1);
      };
    },
  });
  return {
    c,
    sent,
    tasks,
    identities,
    messages,
    message(m) {
      messages.forEach((fn) => fn(m));
    },
    identity(next) {
      id = next;
      identities.forEach((fn) => fn());
    },
    offline() {
      connected = false;
      this.message({ type: 'connection', connected: false });
    },
    hide() {
      visible = false;
      c.visibilityChanged();
    },
    defer(fn) {
      authenticate = fn;
    },
  };
}
const flush = () => new Promise((r) => setImmediate(r));
test('Similo controller owns one subscription, refuses stale account packets and cancels delayed authentication', async () => {
  const f = fixture();
  f.c.start();
  f.c.start();
  await flush();
  assert.equal(f.identities.size, 1);
  assert.equal(f.messages.size, 1);
  let done;
  f.defer(
    () =>
      new Promise((r) => {
        done = r;
      }),
  );
  f.c.create({ maxPlayers: 3, boardThemes: ['animals'], clueThemes: ['animals'] });
  assert(f.c.getSnapshot().pending);
  f.identity('b');
  done(true);
  await flush();
  assert(!f.sent.some((x) => x.action === 'create'));
  assert.equal(f.c.getSnapshot().room, null);
  assert(!f.c.getSnapshot().pending);
  f.message({ type: 'similo-state', room: { id: 'old-account' } });
  assert.equal(f.c.getSnapshot().room, null);
  f.c.dispose();
  assert.equal(f.messages.size, 0);
  assert.equal(f.identities.size, 0);
  assert.equal(f.tasks.length, 0);
});
test('Similo pending commands survive list refresh and timeout releases the UI; disconnect prevents edits', async () => {
  const f = fixture();
  f.c.start();
  await flush();
  f.c.create({ maxPlayers: 3, boardThemes: ['animals'], clueThemes: ['animals'] });
  await flush();
  assert.equal(f.sent.at(-1).action, 'create');
  assert(f.c.getSnapshot().pending);
  await f.c.refresh();
  assert.equal(f.tasks.length, 1);
  f.tasks[0]();
  await flush();
  assert.equal(f.c.getSnapshot().pending, false);
  assert.match(f.c.getSnapshot().notice, /confirmação/);
  f.offline();
  const before = f.sent.length;
  f.c.move({ kind: 'resolve', selected: ['animals-0'] });
  await flush();
  assert.equal(f.sent.length, before);
  f.c.dispose();
});
test('Similo snapshots use only valid private projections and ignore older room revisions', async () => {
  const f = fixture();
  f.c.start();
  await flush();
  const a = { account: { id: 'a', nickname: 'A', expiresAt: Date.now() + 60000 }, out: [] },
    b = { account: { id: 'b', nickname: 'B', expiresAt: Date.now() + 60000 }, out: [] },
    service = createSimiloService({ wss: { clients: [a, b] }, send: (ws, m) => ws.out.push(m) });
  try {
    service.handle(a, {
      action: 'create',
      settings: { maxPlayers: 2, boardThemes: ['animals'], clueThemes: ['animals'] },
    });
    service.handle(b, { action: 'join', roomId: a.similoRoomId });
    const room = service.rooms.get(a.similoRoomId);
    f.message(a.out.findLast((e) => e.type === 'similo-state'));
    const before = f.c.getSnapshot().room;
    f.message({ type: 'similo-state', room: { ...before, revision: before.revision - 1 } });
    assert.equal(f.c.getSnapshot().room, before);
    service.handle(a, { action: 'start', revision: room.revision });
    f.message(a.out.findLast((e) => e.type === 'similo-state'));
    assert.equal(f.c.getSnapshot().room.state.hand.length, 5);
    f.identity(null);
    assert.equal(f.c.getSnapshot().room, null);
    f.message(a.out.findLast((e) => e.type === 'similo-state'));
    assert.equal(f.c.getSnapshot().room, null);
  } finally {
    service.stop();
    f.c.dispose();
  }
});
