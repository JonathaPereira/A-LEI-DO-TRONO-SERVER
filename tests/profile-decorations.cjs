'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const moduleReady = import('../src/lib/profiles/decorations.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup(t) {
  const { createProfileDecorations } = await moduleReady;
  let source = { accountId: 'alice', epoch: 1, revision: 0, profileId: null },
    time = 0;
  let read = async (id) => ({ id, nickname: id, personalization: {} });
  const requests = [],
    listeners = new Set();
  const client = createProfileDecorations({
    profiles: {
      readProfile(id, options) {
        requests.push({ id, ...options });
        return read(id, options);
      },
      getSnapshot: () => source,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    now: () => time,
  });
  t.after(() => client.dispose());
  return {
    client,
    requests,
    listeners,
    read(value) {
      read = value;
    },
    time(value) {
      time = value;
    },
    source(patch) {
      source = { ...source, ...patch };
      for (const listener of listeners) listener();
    },
  };
}

test('one presentation cache shares concurrent reads and successful profiles for sixty seconds', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.read(() => pending.promise);
  const offFirst = f.client.subscribe('bob', () => {}),
    offSecond = f.client.subscribe('bob', () => {});
  const first = f.client.load('bob'),
    second = f.client.load('bob');
  await tick();
  assert.equal(f.requests.length, 1);
  assert.equal(first, second);
  const profile = { id: 'bob', nickname: 'Bob', personalization: {} };
  pending.resolve(profile);
  await first;
  assert.equal(f.client.getSnapshot('bob'), profile);
  f.time(59999);
  await f.client.load('bob');
  assert.equal(f.requests.length, 1);
  f.read(async () => ({ ...profile, nickname: 'Updated' }));
  f.time(60000);
  await f.client.load('bob');
  assert.equal(f.requests.length, 2);
  assert.equal(f.client.getSnapshot('bob').nickname, 'Updated');
  offFirst();
  offSecond();
  await f.client.load('bob');
  assert.equal(f.requests.length, 2);
});

test('failed optional decorations stay empty without a hot retry loop and retry after expiry', async (t) => {
  const f = await setup(t);
  f.read(async () => {
    throw Error('Unavailable');
  });
  await f.client.load('bob');
  await f.client.load('bob');
  assert.equal(f.requests.length, 1);
  assert.equal(f.client.getSnapshot('bob'), null);
  f.time(60000);
  f.read(async (id) => ({ id, nickname: 'Recovered' }));
  await f.client.load('bob');
  assert.equal(f.client.getSnapshot('bob').nickname, 'Recovered');
});

test('profile updates refresh only the affected mounted member and invalidate inactive cached members', async (t) => {
  const f = await setup(t);
  f.client.subscribe('bob', () => {});
  f.client.subscribe('carol', () => {});
  await Promise.all(['bob', 'carol', 'dave'].map(f.client.load));
  const pending = deferred();
  f.read(() => pending.promise);
  f.source({ revision: 1, profileId: 'bob' });
  await tick();
  assert.deepEqual(
    f.requests.map((request) => request.id),
    ['bob', 'carol', 'dave', 'bob'],
  );
  assert.equal(f.client.getSnapshot('bob'), null);
  assert.equal(f.client.getSnapshot('carol').id, 'carol');
  pending.resolve({ id: 'bob', nickname: 'New bio' });
  await tick();
  assert.equal(f.client.getSnapshot('bob').nickname, 'New bio');
  f.source({ revision: 2, profileId: 'dave' });
  await tick();
  assert.equal(f.requests.length, 4);
  assert.equal(f.client.getSnapshot('dave'), null);
});

test('a late response cannot overwrite a newer revision of the same profile', async (t) => {
  const f = await setup(t),
    old = deferred();
  f.read(() => old.promise);
  f.client.subscribe('bob', () => {});
  const loading = f.client.load('bob');
  await tick();
  f.read(async () => ({ id: 'bob', nickname: 'Latest' }));
  f.source({ revision: 1, profileId: 'bob' });
  await tick();
  assert.equal(f.requests[0].signal.aborted, true);
  old.resolve({ id: 'bob', nickname: 'Stale' });
  await loading;
  assert.equal(f.client.getSnapshot('bob').nickname, 'Latest');
});

test('logout clears every surface and account ABA changes reject earlier results', async (t) => {
  const f = await setup(t),
    old = deferred();
  f.read(() => old.promise);
  f.client.subscribe('bob', () => {});
  const loading = f.client.load('bob');
  await tick();
  f.source({ accountId: null, epoch: 2 });
  assert.equal(f.client.getSnapshot('bob'), null);
  assert.equal(f.requests[0].signal.aborted, true);
  f.read(async () => ({ id: 'bob', nickname: 'New session' }));
  f.source({ accountId: 'carol', epoch: 3 });
  f.source({ accountId: 'alice', epoch: 4 });
  await tick();
  old.resolve({ id: 'bob', nickname: 'Old session' });
  await loading;
  assert.equal(f.client.getSnapshot('bob').nickname, 'New session');
});

test('role or permission epochs discard cached profiles even when the account ID is unchanged', async (t) => {
  const f = await setup(t);
  f.client.subscribe('bob', () => {});
  await f.client.load('bob');
  f.read(async () => {
    throw Error('Access revoked');
  });
  f.source({ epoch: 2 });
  await tick();
  assert.equal(f.client.getSnapshot('bob'), null);
  assert.equal(f.requests.length, 2);
});

test('the final unmount cancels pending work; another subscriber keeps it alive', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.read(() => pending.promise);
  const offFirst = f.client.subscribe('bob', () => {}),
    offSecond = f.client.subscribe('bob', () => {});
  const first = f.client.load('bob');
  await tick();
  offFirst();
  assert.equal(f.requests[0].signal.aborted, false);
  offSecond();
  assert.equal(f.requests[0].signal.aborted, true);
  f.read(async () => ({ id: 'bob', nickname: 'Remounted' }));
  f.client.subscribe('bob', () => {});
  await f.client.load('bob');
  pending.resolve({ id: 'bob', nickname: 'Unmounted' });
  await first;
  assert.equal(f.client.getSnapshot('bob').nickname, 'Remounted');
});

test('guests and missing member IDs never start a profile request', async (t) => {
  const f = await setup(t);
  await f.client.load('');
  f.source({ accountId: null, epoch: 2 });
  await f.client.load('bob');
  assert.equal(f.requests.length, 0);
  assert.equal(f.client.getSnapshot('bob'), null);
});

test('disposal cancels reads, clears snapshots and releases only its own source subscription', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.read(() => pending.promise);
  let notified = 0;
  f.client.subscribe('bob', () => notified++);
  const loading = f.client.load('bob');
  await tick();
  f.client.dispose();
  const atDisposal = notified;
  assert.equal(f.listeners.size, 0);
  assert.equal(f.requests[0].signal.aborted, true);
  pending.resolve({ id: 'bob', nickname: 'Disposed' });
  await loading;
  assert.equal(f.client.getSnapshot('bob'), null);
  assert.equal(notified, atDisposal);
  await f.client.load('bob');
  assert.equal(f.requests.length, 1);
});
