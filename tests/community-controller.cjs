'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ready = import('../src/lib/community/controller.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const person = (id, extra = {}) => ({
  id,
  name: id,
  guest: false,
  role: 'member',
  inVoice: false,
  online: true,
  roomName: null,
  activity: null,
  ...extra,
});
const presence = (members, scope = 'community') => ({
  type: 'presence',
  scope,
  directoryReady: true,
  members,
});
const account = (id) => ({ key: 'account:' + id, accountId: id, manageRoles: false });
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function setup(t, initial = account('one')) {
  const { createCommunity } = await ready;
  let identity = initial,
    connected = true,
    auth = async () => true;
  const messages = new Set(),
    connections = new Set(),
    identities = new Set(),
    requests = [],
    jobs = [],
    warnings = [];
  const controller = createCommunity({
    network: {
      getSnapshot: () => ({ connected }),
      subscribe(fn) {
        connections.add(fn);
        return () => connections.delete(fn);
      },
      onMessage(fn) {
        messages.add(fn);
        return () => messages.delete(fn);
      },
      requestPresence() {
        requests.push(identity?.key);
      },
    },
    getIdentity: () => identity,
    subscribeIdentity(fn) {
      identities.add(fn);
      return () => identities.delete(fn);
    },
    authenticate: (...args) => auth(...args),
    now: () => 1000,
    schedule(callback, delay) {
      const job = { callback, delay, canceled: false };
      jobs.push(job);
      return () => {
        job.canceled = true;
      };
    },
    warn: (error) => warnings.push(error),
  });
  t.after(() => controller.dispose());
  return {
    controller,
    requests,
    jobs,
    warnings,
    messages,
    connections,
    identities,
    async start() {
      controller.start();
      await tick();
    },
    auth(fn) {
      auth = fn;
    },
    identity(value) {
      identity = value;
      for (const fn of identities) fn();
    },
    connection(value) {
      connected = value;
      for (const fn of connections) fn();
    },
    message(value) {
      for (const fn of messages) fn(value);
    },
  };
}
test('presence is immutable, validates whole pages and does not overwrite public game data with private voice assumptions', async (t) => {
  const f = await setup(t);
  await f.start();
  f.message(presence([person('two')]));
  const snapshot = f.controller.getSnapshot();
  assert.ok(Object.isFrozen(snapshot.presence.members[0]));
  f.message(presence([person('two'), person('two')]));
  f.message(presence([person('bad', { activity: { name: 12 } })]));
  assert.equal(f.controller.getSnapshot(), snapshot);
  assert.equal(f.warnings.length, 2);
  f.message({
    type: 'rooms',
    rooms: [{ id: 'game', players: [{ id: 'p', name: 'Player', guest: true }] }],
  });
  assert.equal(f.controller.getSnapshot().rooms[0].players[0].inVoice, false);
  const rooms = f.controller.getSnapshot().rooms;
  f.message({
    type: 'rooms',
    rooms: [{ id: 'bad', players: [{ id: 'p', name: 'Player', guest: true, inVoice: 'yes' }] }],
  });
  assert.equal(f.controller.getSnapshot().rooms, rooms);
});
test('account switches and ABA invalidate delayed authentication; only the latest owner requests presence', async (t) => {
  const f = await setup(t),
    pending = deferred();
  const calls = [];
  f.auth(async (identity, current) => {
    calls.push({ identity, current });
    return calls.length === 1 ? pending.promise : true;
  });
  f.controller.start();
  f.identity(account('two'));
  f.identity(account('one'));
  f.message(presence([person('stale')]));
  assert.equal(f.controller.getSnapshot().presence, null);
  pending.resolve(true);
  await tick();
  assert.equal(calls[0].current(), false);
  assert.deepEqual(f.requests, ['account:one']);
  f.message(presence([person('fresh')]));
  f.controller.toggle(true);
  f.controller.voiceNotice({ id: 'event', kind: 'joined', name: 'Someone' });
  f.identity(null);
  const state = f.controller.getSnapshot();
  assert.equal(state.presence, null);
  assert.equal(state.open, false);
  assert.deepEqual(state.activities, []);
  assert.deepEqual(state.notices, []);
  assert.equal(f.jobs[0].canceled, true);
  f.message(presence([person('stale')]));
  assert.equal(f.controller.getSnapshot().presence, null);
});
test('guests only accept game-scoped presence and permission changes preserve the roster while revoking role controls', async (t) => {
  const f = await setup(t, { key: 'guest:g', accountId: null, manageRoles: false });
  await f.start();
  f.message(presence([person('private')]));
  assert.equal(f.controller.getSnapshot().presence, null);
  f.message(presence([person('visible')], 'game'));
  assert.equal(f.controller.getSnapshot().presence.scope, 'game');
  f.identity({ ...account('two'), manageRoles: true });
  await tick();
  f.message(presence([person('member')]));
  const roster = f.controller.getSnapshot().presence;
  f.identity(account('two'));
  await tick();
  assert.equal(f.controller.getSnapshot().presence, roster);
  assert.equal(f.controller.getSnapshot().identity.manageRoles, false);
});
test('disconnect retains the last roster and reconnect authenticates once before accepting fresh data', async (t) => {
  const f = await setup(t);
  await f.start();
  f.controller.start();
  f.message(presence([person('one')]));
  const roster = f.controller.getSnapshot().presence;
  f.connection(false);
  f.message(presence([person('old')]));
  assert.equal(f.controller.getSnapshot().presence, roster);
  assert.equal(f.controller.getSnapshot().connected, false);
  const pending = deferred();
  f.auth(() => pending.promise);
  f.connection(true);
  f.connection(true);
  f.message(presence([person('old')]));
  assert.equal(f.controller.getSnapshot().presence, roster);
  pending.resolve(true);
  await tick();
  f.message(presence([person('fresh')]));
  assert.equal(f.controller.getSnapshot().presence.members[0].id, 'fresh');
  assert.equal(f.requests.length, 2);
});
test('notices deduplicate, cap live timers/history, expire independently and clean up on dispose', async (t) => {
  const f = await setup(t);
  await f.start();
  for (let i = 0; i < 10; i++)
    f.controller.voiceNotice({ id: String(i), kind: 'joined', name: 'P' + i });
  f.controller.voiceNotice({ id: '9', kind: 'joined', name: 'Duplicate' });
  assert.equal(f.controller.getSnapshot().activities.length, 8);
  assert.equal(f.controller.getSnapshot().notices.length, 3);
  assert.equal(f.jobs.filter((job) => !job.canceled).length, 3);
  assert.equal(f.jobs[9].delay, 8000);
  f.jobs[8].callback();
  assert.deepEqual(
    f.controller.getSnapshot().notices.map((item) => item.text),
    ['P7 entrou na chamada.', 'P9 entrou na chamada.'],
  );
  f.controller.dispose();
  assert.equal(f.messages.size + f.connections.size + f.identities.size, 0);
  assert.equal(f.jobs[9].canceled, true);
  const snapshot = f.controller.getSnapshot();
  f.jobs[9].callback();
  f.controller.voiceNotice({ kind: 'left' });
  f.controller.toggle();
  assert.equal(f.controller.getSnapshot(), snapshot);
});
test('disposing during authentication prevents a late presence request', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.auth(() => pending.promise);
  f.controller.start();
  f.controller.dispose();
  pending.resolve(true);
  await tick();
  assert.deepEqual(f.requests, []);
});
