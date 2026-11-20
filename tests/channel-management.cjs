'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ready = Promise.all([
  import('../src/lib/channels/management.ts'),
  import('../src/lib/channels/catalog.ts'),
]);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const row = (id = 'room', name = 'Canal') => ({ id, name, channel_type: 'text', description: '' });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const person = (id = 'target') => ({ id, name: id, role: 'member', guest: false });
async function setup(t) {
  const [{ createChannelManagement }, { createChannels }] = await ready;
  let account = {
      id: 'one',
      role: 'creator',
      permissions: { manageChannels: true, manageRoles: true },
    },
    token = async () => 'token';
  let fetcher = async () => response({ channels: [row()] });
  const identities = new Set(),
    messages = new Set(),
    requests = [],
    refreshes = [],
    presences = [];
  const network = {
    BACKEND_HTTP: 'https://backend.test',
    getSnapshot: () => ({ currentRoom: null }),
    subscribe: () => () => {},
    onMessage(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
    requestChatChannels: () => refreshes.push(1),
    requestPresence: () => presences.push(1),
  };
  const subscribeIdentity = (fn) => {
    identities.add(fn);
    return () => identities.delete(fn);
  };
  const catalog = createChannels({
    network,
    getAccountId: () => account?.id ?? null,
    getNotice: () => ({ unread: 0, muted: false }),
    subscribeIdentity,
    subscribeNotices: () => () => {},
  });
  const controller = createChannelManagement({
    channels: catalog,
    network,
    getAccount: () => account,
    getAccessToken: () => token(),
    subscribeIdentity,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return fetcher(url, options);
    },
  });
  t.after(() => {
    controller.dispose();
    catalog.dispose();
  });
  return {
    controller,
    catalog,
    requests,
    refreshes,
    presences,
    identities,
    messages,
    fetcher(fn) {
      fetcher = fn;
    },
    token(fn) {
      token = fn;
    },
    identity(value) {
      account = value;
      for (const fn of identities) fn();
    },
    emit(value) {
      for (const fn of messages) fn(value);
    },
  };
}
test('HTTP refreshes share a request and cannot undo newer socket catalogs or clear their participants', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.fetcher(() => pending.promise);
  const first = f.controller.refresh(),
    second = f.controller.refresh();
  assert.equal(first, second);
  await tick();
  assert.equal(f.requests.length, 1);
  f.emit({
    type: 'chat-channels',
    channels: [
      {
        id: 'fresh',
        name: 'Novo',
        type: 'voice',
        count: 1,
        players: [{ id: 'player', name: 'Pessoa', guest: false, inVoice: true }],
      },
    ],
  });
  pending.resolve(response({ channels: [row('stale')] }));
  await first;
  assert.deepEqual(
    f.controller.getSnapshot().channels.map((c) => c.id),
    ['fresh'],
  );
  f.fetcher(async () =>
    response({ channels: [{ ...row('fresh', 'Renomeado'), channel_type: 'voice' }] }),
  );
  await f.controller.refresh();
  assert.equal(f.catalog.get('fresh').players[0].id, 'player');
  assert.equal(f.catalog.get('fresh').count, 1);
});
test('malformed metadata is rejected atomically and unauthorized actions never fetch', async (t) => {
  const f = await setup(t);
  await f.controller.refresh();
  const before = f.catalog.getSnapshot();
  f.fetcher(async () => response({ channels: [row(), row()] }));
  await assert.rejects(f.controller.refresh(), /duplicado/);
  assert.equal(f.catalog.getSnapshot(), before);
  f.identity({ id: 'two', role: 'member', permissions: {} });
  const count = f.requests.length;
  await assert.rejects(f.controller.api('/channels', { method: 'POST', body: {} }), /permissão/);
  f.controller.editRole(person());
  await f.controller.openManager();
  assert.equal(f.controller.getSnapshot().manager.open, false);
  assert.equal(f.controller.getSnapshot().roleEditor.target, null);
  assert.equal(f.requests.length, count);
});
test('channel mutations serialize user submissions, preserve failed drafts and allow a retry', async (t) => {
  const f = await setup(t);
  await f.controller.openManager();
  f.controller.setDraft({ name: 'Novo canal', type: 'voice', description: 'Descrição' });
  const pending = deferred();
  f.fetcher(() => pending.promise);
  const creating = f.controller.createChannel();
  await f.controller.createChannel();
  await tick();
  assert.equal(f.requests.filter((r) => r.options.method === 'POST').length, 1);
  pending.resolve(response({ error: { message: 'Indisponível' } }, 503));
  await creating;
  assert.equal(f.controller.getSnapshot().manager.draft.name, 'Novo canal');
  assert.equal(f.controller.getSnapshot().manager.busy, false);
  assert.equal(f.controller.getSnapshot().manager.message, 'Indisponível');
  f.fetcher(async (_url, options) =>
    response(
      options.method === 'POST'
        ? { channel: { ...row('created', 'Novo canal'), channel_type: 'voice' } }
        : { channels: [row('created', 'Novo canal')] },
    ),
  );
  await f.controller.createChannel();
  assert.equal(f.controller.getSnapshot().manager.message, 'Canal criado.');
  assert.equal(f.controller.getSnapshot().manager.draft.name, '');
  f.fetcher(async (_url, options) =>
    response(options.method === 'DELETE' ? { ok: true } : { channels: [] }),
  );
  await f.controller.deleteChannel('created');
  assert.equal(f.controller.getSnapshot().manager.message, 'Canal excluído.');
  assert.deepEqual(f.controller.getSnapshot().channels, []);
});
test('closing and reopening cannot let an old channel mutation clear the new draft', async (t) => {
  const f = await setup(t);
  await f.controller.openManager();
  f.controller.setDraft({ name: 'Antigo' });
  const pending = deferred();
  f.fetcher(() => pending.promise);
  const creating = f.controller.createChannel();
  await tick();
  const request = f.requests.at(-1);
  f.controller.closeManager();
  assert.equal(request.options.signal.aborted, true);
  f.fetcher(async () => response({ channels: [row()] }));
  await f.controller.openManager();
  f.controller.setDraft({ name: 'Rascunho novo' });
  pending.resolve(response({ channel: row('late') }));
  await creating;
  assert.equal(f.controller.getSnapshot().manager.draft.name, 'Rascunho novo');
  assert.equal(f.controller.getSnapshot().manager.message, '');
});
test('identity ABA and revoked permissions cancel pending token work before it can write', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.token(() => pending.promise);
  const writing = f.controller.api('/roles', {
    method: 'POST',
    body: { userId: 'target', role: 'admin' },
  });
  const rejected = assert.rejects(writing, /conta|permissão/);
  f.identity(null);
  f.identity({
    id: 'one',
    role: 'creator',
    permissions: { manageChannels: true, manageRoles: true },
  });
  pending.resolve('stale-token');
  await rejected;
  assert.equal(f.requests.length, 0);
  await f.controller.openManager();
  f.controller.editRole(person());
  f.identity({ id: 'one', role: 'member', permissions: {} });
  assert.equal(f.controller.getSnapshot().manager.open, false);
  assert.equal(f.controller.getSnapshot().roleEditor.target, null);
});
test('late role responses cannot close or report success in another target; creator and guests stay protected', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.controller.editRole({ ...person(), role: 'creator' });
  assert.equal(f.controller.getSnapshot().roleEditor.target, null);
  f.controller.editRole({ ...person(), guest: true });
  assert.equal(f.controller.getSnapshot().roleEditor.target, null);
  f.controller.editRole(person('first'));
  f.controller.selectRole('admin');
  f.fetcher(() => pending.promise);
  const writing = f.controller.saveRole();
  await tick();
  f.controller.editRole(person('second'));
  pending.resolve(response({ ok: true, userId: 'first', role: 'admin' }));
  await writing;
  assert.equal(f.controller.getSnapshot().roleEditor.target.id, 'second');
  assert.equal(f.presences.length, 0);
  f.fetcher(async () => response({ ok: true, userId: 'second', role: 'member' }));
  await f.controller.saveRole();
  assert.equal(f.controller.getSnapshot().roleEditor.target, null);
  assert.equal(f.presences.length, 1);
});
test('disposal cancels requests and removes identity/catalog subscriptions', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.fetcher(() => pending.promise);
  const read = f.controller.refresh(),
    rejected = assert.rejects(read);
  await tick();
  f.controller.dispose();
  assert.equal(f.requests[0].options.signal.aborted, true);
  pending.resolve(response({ channels: [row('late')] }));
  await rejected;
  assert.equal(f.identities.size, 1); // Only the existing catalog remains subscribed.
});
