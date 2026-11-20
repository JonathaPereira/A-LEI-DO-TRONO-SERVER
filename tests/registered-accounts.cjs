'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const moduleReady = import('../src/lib/profiles/registered-accounts.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const account = (id) => ({
  id,
  nickname: 'Conta ' + id,
  email: id + '@example.test',
  confirmed: true,
  created_at: null,
});
async function setup(t, role = 'creator') {
  const { createRegisteredAccounts } = await moduleReady;
  let identity = { id: 'alice', role, permissions: {} },
    epoch = 1;
  let read = async () => ({ accounts: [account('one')], hasMore: false, nextOffset: 1 });
  const listeners = new Set(),
    requests = [];
  const controller = createRegisteredAccounts({
    getAccount: () => identity,
    profiles: {
      getSnapshot: () => ({ accountId: identity?.id ?? null, epoch }),
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      readAccounts(offset, options) {
        requests.push({ offset, ...options });
        return read(offset, options);
      },
    },
  });
  t.after(() => controller.dispose());
  return {
    controller,
    requests,
    listeners,
    read(value) {
      read = value;
    },
    identity(id, role = 'creator', permissions = {}) {
      identity = id ? { id, role, permissions } : null;
      epoch++;
      for (const listener of listeners) listener();
    },
    revise() {
      for (const listener of listeners) listener();
    },
  };
}

test('private directory launchers and reads require the creator and the email permission', async (t) => {
  for (const role of ['member', 'admin']) {
    const f = await setup(t, role);
    await f.controller.open();
    assert.equal(f.controller.getSnapshot().allowed, false);
    assert.equal(f.requests.length, 0);
    f.identity('alice', 'creator', { viewEmails: false });
    await f.controller.open();
    assert.equal(f.requests.length, 0);
    f.identity('alice', 'creator');
    await f.controller.open();
    assert.equal(f.controller.getSnapshot().accounts.length, 1);
  }
});

test('pagination appends accounts, follows the server cursor and prevents duplicate page requests', async (t) => {
  const f = await setup(t),
    page = deferred();
  f.read(async () => ({ accounts: [account('one')], hasMore: true, nextOffset: 50 }));
  await f.controller.open();
  f.read(() => page.promise);
  const pending = f.controller.more();
  await f.controller.more();
  assert.deepEqual(
    f.requests.map((request) => request.offset),
    [0, 50],
  );
  page.resolve({ accounts: [account('one'), account('two')], hasMore: false, nextOffset: 52 });
  await pending;
  assert.deepEqual(
    f.controller.getSnapshot().accounts.map((row) => row.id),
    ['one', 'two'],
  );
  assert.equal(f.controller.getSnapshot().message, '2 contas carregadas.');
  await f.controller.more();
  assert.equal(f.requests.length, 2);
});

test('closing clears private data and aborts requests; an old response cannot reopen the dialog', async (t) => {
  const f = await setup(t),
    old = deferred();
  f.read(() => old.promise);
  const pending = f.controller.open();
  f.controller.close();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.controller.getSnapshot().open, false);
  old.resolve({ accounts: [account('private')], hasMore: false, nextOffset: 1 });
  await pending;
  assert.deepEqual(f.controller.getSnapshot().accounts, []);
  assert.equal(f.controller.getSnapshot().message, '');
});

test('account ABA changes and permission revocation erase private rows and suppress old results', async (t) => {
  const f = await setup(t);
  await f.controller.open();
  f.identity('alice', 'creator', { viewEmails: false });
  assert.equal(f.controller.getSnapshot().allowed, false);
  assert.equal(f.controller.getSnapshot().open, false);
  assert.deepEqual(f.controller.getSnapshot().accounts, []);
  f.identity('alice');
  const old = deferred();
  f.read(() => old.promise);
  const pending = f.controller.open();
  f.identity('bob');
  f.identity('alice');
  old.resolve({ accounts: [account('stale')], hasMore: false, nextOffset: 1 });
  await pending;
  assert.equal(f.controller.getSnapshot().open, false);
  assert.deepEqual(f.controller.getSnapshot().accounts, []);
});

test('a superseded request cannot clear the busy state or error message of a new opening', async (t) => {
  const f = await setup(t),
    first = deferred(),
    second = deferred();
  f.read(() => first.promise);
  const old = f.controller.open();
  f.read(() => second.promise);
  const fresh = f.controller.open();
  first.reject(Error('Old failure'));
  await old;
  assert.equal(f.controller.getSnapshot().loading, true);
  assert.equal(f.controller.getSnapshot().message, 'Carregando contas…');
  second.resolve({ accounts: [account('new')], hasMore: false, nextOffset: 1 });
  await fresh;
  assert.equal(f.controller.getSnapshot().accounts[0].id, 'new');
});

test('pagination failures retain rows and retry the same cursor; unrelated profile updates do not close the directory', async (t) => {
  const f = await setup(t);
  f.read(async () => ({ accounts: [account('one')], hasMore: true, nextOffset: 50 }));
  await f.controller.open();
  f.read(async () => {
    throw Error('Page failed');
  });
  await f.controller.more();
  assert.equal(f.controller.getSnapshot().loading, false);
  assert.equal(f.controller.getSnapshot().accounts.length, 1);
  assert.equal(f.controller.getSnapshot().message, 'Page failed');
  f.revise();
  assert.equal(f.controller.getSnapshot().open, true);
  f.read(async () => ({ accounts: [account('two')], hasMore: false, nextOffset: 51 }));
  await f.controller.more();
  assert.deepEqual(
    f.requests.map((request) => request.offset),
    [0, 50, 50],
  );
  assert.equal(f.controller.getSnapshot().accounts.length, 2);
});

test('disposal aborts work, clears private state and releases only its own profile subscription', async (t) => {
  const f = await setup(t),
    old = deferred();
  f.read(() => old.promise);
  const pending = f.controller.open();
  f.controller.dispose();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.requests[0].signal.aborted, true);
  old.resolve({ accounts: [account('late')], hasMore: false, nextOffset: 1 });
  await pending;
  await tick();
  assert.deepEqual(f.controller.getSnapshot().accounts, []);
  await f.controller.open();
  assert.equal(f.requests.length, 1);
});
