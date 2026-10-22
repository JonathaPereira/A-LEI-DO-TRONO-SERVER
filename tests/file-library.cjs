'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/files/client.ts'),
  import('../src/lib/files/library.ts'),
]);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const file = (id = 'document', extra = {}) => ({
  id,
  name: `${id}.pdf`,
  mime: 'application/pdf',
  bytes: 100,
  ownerId: 'alice',
  kind: 'chat',
  ...extra,
});
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const listing = (files = [file()], extra = {}) => ({ files, hasMore: false, ...extra });

async function setup(t, options = {}) {
  const [{ createFiles }, { createFileLibrary }] = await modules;
  let account = 'alice',
    protectedIds = options.protectedIds || [],
    request = async (path, init) => {
      if (init.method === 'DELETE') return response({ ok: true });
      if (path === '/status') return response({ configured: true, used: 1024 });
      if (path === '/mine') return response(listing());
      if (path.endsWith('/url?download=1'))
        return response({ url: 'https://files.test/download', expiresAt: Date.now() + 100000 });
      throw new Error(`Unexpected request: ${path}`);
    };
  const identities = new Set(),
    messages = new Set(),
    profiles = new Set(),
    requests = [],
    opened = [],
    warnings = [],
    changes = [];
  const subscribe = (set) => (listener) => {
    set.add(listener);
    return () => set.delete(listener);
  };
  const client = createFiles({
    backendHttp: 'https://backend.test',
    getAccount: () => account && { id: account, permissions: { moderateFiles: false } },
    getAccessToken: async () => 'token',
    fetch: (url, init) => {
      const path = url.slice('https://backend.test/files'.length);
      requests.push({ path, method: init.method });
      return request(path, init);
    },
    createUpload: () => assert.fail('The library must reuse the file transport without uploading'),
    subscribeIdentity: subscribe(identities),
    subscribeMessages: subscribe(messages),
    warn: (error) => warnings.push(error),
  });
  let openCalls = 0;
  const library = createFileLibrary({
    client,
    getProtectedIds: () => protectedIds,
    subscribeProfile: subscribe(profiles),
    openFile: async (resolveURL, onError, isCurrent) => {
      openCalls++;
      try {
        const url = await resolveURL();
        if (isCurrent()) opened.push(url);
      } catch (error) {
        onError(error.message);
      }
    },
    warn: (error) => warnings.push(error),
  });
  const off = library.subscribe(() => changes.push(library.getSnapshot()));
  t.after(() => {
    off();
    library.dispose();
    client.dispose();
  });
  return {
    client,
    library,
    requests,
    opened,
    warnings,
    changes,
    openCalls: () => openCalls,
    request(fn) {
      request = fn;
    },
    identity(value) {
      account = value;
      [...identities].forEach((listener) => listener());
    },
    protect(ids) {
      protectedIds = ids;
      [...profiles].forEach((listener) => listener());
    },
    deleted(id) {
      [...messages].forEach((listener) => listener({ type: 'attachment-deleted', id }));
    },
    listeners: () => ({
      identities: identities.size,
      messages: messages.size,
      profiles: profiles.size,
    }),
  };
}

test('library publishes validated immutable rows and storage together using the existing client', async (t) => {
  const h = await setup(t),
    status = deferred(),
    mine = deferred();
  h.request((path) => (path === '/status' ? status.promise : mine.promise));
  const pending = h.library.refresh();
  await tick();
  assert.deepEqual(h.requests.map((request) => request.path).sort(), ['/mine', '/status']);
  assert.equal(h.library.getSnapshot().loading, true);
  mine.resolve(response(listing([file('one'), file('two')], { hasMore: true })));
  await tick();
  assert.deepEqual(h.library.getSnapshot().files, [], 'partial responses do not become visible');
  status.resolve(response({ used: 999 }));
  await pending;
  const state = h.library.getSnapshot();
  assert.equal(state.accountId, 'alice');
  assert.equal(state.status, 'ready');
  assert.equal(state.loading, false);
  assert.equal(state.used, 999);
  assert.equal(state.hasMore, true);
  assert.deepEqual(
    state.files.map((row) => row.id),
    ['one', 'two'],
  );
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.files));
  assert.ok(state.files.every(Object.isFrozen));
  assert.deepEqual(h.listeners(), { identities: 1, messages: 1, profiles: 1 });
});

test('a slower refresh cannot replace the most recent list or its usage', async (t) => {
  const h = await setup(t),
    old = deferred();
  h.request(() => old.promise);
  const first = h.library.refresh();
  await tick();
  h.request(async (path) => response(path === '/status' ? { used: 20 } : listing([file('new')])));
  await h.library.refresh();
  old.resolve(response({ used: 1, ...listing([file('old')]) }));
  await first;
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['new'],
  );
  assert.equal(h.library.getSnapshot().used, 20);
  assert.equal(h.library.getSnapshot().message, '');
});

test('a failed refresh retains the last complete snapshot without mixing new usage and old files', async (t) => {
  const h = await setup(t);
  await h.library.refresh();
  const previous = h.library.getSnapshot();
  h.request(async (path) =>
    response(path === '/status' ? { used: 9000 } : listing([file('invalid', { bytes: -1 })])),
  );
  await h.library.refresh();
  const next = h.library.getSnapshot();
  assert.equal(next.status, 'error');
  assert.equal(next.loading, false);
  assert.equal(next.used, previous.used);
  assert.deepEqual(next.files, previous.files);
  assert.ok(next.message);
});

test('an obsolete refresh failure cannot clear the ready status of a newer refresh', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.request(() => held.promise);
  const stale = h.library.refresh();
  await tick();
  h.request(async (path) =>
    response(path === '/status' ? { used: 42 } : listing([file('current')])),
  );
  await h.library.refresh();
  held.reject(new Error('Servidor antigo indisponível.'));
  await stale;
  assert.equal(h.library.getSnapshot().status, 'ready');
  assert.equal(h.library.getSnapshot().message, '');
  assert.equal(h.library.getSnapshot().used, 42);
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['current'],
  );
});

test('account A to B to A invalidates pending data and never exposes another account list', async (t) => {
  const h = await setup(t),
    old = deferred();
  await h.library.refresh();
  h.request(() => old.promise);
  const first = h.library.refresh();
  await tick();
  h.identity('bob');
  assert.deepEqual(h.library.getSnapshot().files, []);
  assert.equal(h.library.getSnapshot().used, null);
  h.identity('alice');
  old.resolve(response({ used: 1, ...listing([file('private-old')]) }));
  await first;
  assert.deepEqual(h.library.getSnapshot().files, []);
  assert.notEqual(h.library.getSnapshot().status, 'ready');
  h.request(async (path) => response(path === '/status' ? { used: 12 } : listing([file('fresh')])));
  await h.library.refresh();
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['fresh'],
  );
});

for (const [name, status, mine] of [
  ['negative usage', { used: -1 }, listing()],
  ['fractional usage', { used: 1.5 }, listing()],
  ['unsafe usage', { used: Number.MAX_SAFE_INTEGER + 1 }, listing()],
  ['missing usage', {}, listing()],
  [
    'invalid row after a valid row',
    { used: 100 },
    listing([file('valid'), file('bad', { bytes: '12' })]),
  ],
  ['non-boolean pagination', { used: 100 }, listing([], { hasMore: 'yes' })],
  ['duplicate rows', { used: 100 }, listing([file(), file()])],
  [
    'oversized page',
    { used: 100 },
    listing(Array.from({ length: 201 }, (_, i) => file(`file-${i}`))),
  ],
]) {
  test(`invalid library response (${name}) never publishes partial data`, async (t) => {
    const h = await setup(t);
    h.request(async (path) => response(path === '/status' ? status : mine));
    await h.library.refresh();
    const state = h.library.getSnapshot();
    assert.equal(state.status, 'error');
    assert.equal(state.loading, false);
    assert.ok(state.message.length > 0);
    assert.deepEqual(state.files, []);
    assert.equal(state.used, null);
    assert.ok(h.changes.every((snapshot) => snapshot.files.length === 0));
  });
}

test('profile avatar, cover and background remain protected at action time', async (t) => {
  const h = await setup(t, { protectedIds: ['avatar', 'cover', 'background'] });
  h.request(async (path) =>
    response(
      path === '/status'
        ? { used: 300 }
        : listing([file('avatar'), file('cover'), file('background'), file('other')]),
    ),
  );
  await h.library.refresh();
  for (const id of ['avatar', 'cover', 'background']) await h.library.remove(id);
  assert.equal(h.requests.filter((entry) => entry.method === 'DELETE').length, 0);
  assert.equal(h.library.getSnapshot().files.length, 4);
  h.protect(['other']);
  assert.deepEqual(h.library.getSnapshot().protectedIds, ['other']);
  await h.library.remove('other');
  assert.equal(h.requests.filter((entry) => entry.method === 'DELETE').length, 0);
  h.request(async () => response({ ok: true }));
  await h.library.remove('avatar');
  assert.equal(h.requests.filter((entry) => entry.method === 'DELETE').length, 1);
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['cover', 'background', 'other'],
  );
});

test('duplicate delete clicks share one operation and an unrelated row is retained', async (t) => {
  const h = await setup(t),
    deletion = deferred();
  h.request(async (path) =>
    response(path === '/status' ? { used: 200 } : listing([file(), file('keep')])),
  );
  await h.library.refresh();
  h.request(() => deletion.promise);
  const first = h.library.remove('document'),
    second = h.library.remove('document');
  await tick();
  assert.deepEqual(h.library.getSnapshot().deletingIds, ['document']);
  assert.equal(h.requests.filter((entry) => entry.method === 'DELETE').length, 1);
  deletion.resolve(response({ ok: true }));
  await Promise.all([first, second]);
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['keep'],
  );
  assert.deepEqual(h.library.getSnapshot().deletingIds, []);
  assert.equal(h.client.getSnapshot().deleted.document, true);
});

test('a failed delete retains the row and allows a subsequent retry', async (t) => {
  const h = await setup(t);
  await h.library.refresh();
  h.request(async () => response({ error: { message: 'Sem permissão.' } }, 403));
  await h.library.remove('document');
  assert.match(h.library.getSnapshot().message, /Sem permissão/);
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['document'],
  );
  assert.deepEqual(h.library.getSnapshot().deletingIds, []);
  h.request(async () => response({ ok: true }));
  await h.library.remove('document');
  assert.deepEqual(h.library.getSnapshot().files, []);
});

test('a stale delete failure cannot overwrite the message of a newer refresh', async (t) => {
  const h = await setup(t),
    deletion = deferred();
  await h.library.refresh();
  h.request(() => deletion.promise);
  const removing = h.library.remove('document');
  await tick();
  h.request(async (path) =>
    response(path === '/status' ? { used: 10 } : listing([file('current')])),
  );
  await h.library.refresh();
  deletion.resolve(response({ error: { message: 'Falha antiga.' } }, 500));
  await removing;
  assert.equal(h.library.getSnapshot().message, '');
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['current'],
  );
  assert.deepEqual(h.library.getSnapshot().deletingIds, []);
});

test('a stale account delete cannot remove the same ID from a newer account', async (t) => {
  const h = await setup(t),
    deletion = deferred();
  await h.library.refresh();
  h.request(() => deletion.promise);
  const removing = h.library.remove('document');
  await tick();
  h.identity('bob');
  h.request(async (path) =>
    response(path === '/status' ? { used: 20 } : listing([file('document', { ownerId: 'bob' })])),
  );
  await h.library.refresh();
  deletion.resolve(response({ ok: true }));
  await removing;
  assert.equal(h.library.getSnapshot().files[0].ownerId, 'bob');
  assert.equal(h.library.getSnapshot().message, '');
  assert.deepEqual(h.library.getSnapshot().deletingIds, []);
});

test('a deletion broadcast removes a visible row and a raced list cannot resurrect its tombstone', async (t) => {
  const h = await setup(t),
    held = deferred();
  await h.library.refresh();
  h.deleted('document');
  assert.deepEqual(h.library.getSnapshot().files, []);
  h.request(() =>
    held.promise.then(() =>
      response({
        used: 100,
        ...listing([file('document'), file('raced'), file('keep')]),
      }),
    ),
  );
  const refresh = h.library.refresh();
  await tick();
  h.deleted('raced');
  held.resolve();
  await refresh;
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['keep'],
  );
});

test('download preserves the gesture, deduplicates clicks and requests an attachment link', async (t) => {
  const h = await setup(t),
    held = deferred();
  await h.library.refresh();
  h.request(() => held.promise);
  const first = h.library.download('document'),
    second = h.library.download('document');
  assert.equal(h.openCalls(), 1, 'the popup adapter is invoked during the click');
  await tick();
  assert.equal(h.requests.filter((entry) => entry.path === '/document/url?download=1').length, 1);
  held.resolve(response({ url: 'https://files.test/download', expiresAt: Date.now() + 100000 }));
  await Promise.all([first, second]);
  assert.deepEqual(h.opened, ['https://files.test/download']);
});

test('an explicitly requested download survives a list refresh that removes its row from the first page', async (t) => {
  const h = await setup(t),
    held = deferred();
  await h.library.refresh();
  h.request(() => held.promise);
  const downloading = h.library.download('document');
  await tick();
  h.request(async (path) =>
    response(path === '/status' ? { used: 20 } : listing([file('newest')])),
  );
  await h.library.refresh();
  held.resolve(response({ url: 'https://files.test/download', expiresAt: Date.now() + 100000 }));
  await downloading;
  assert.deepEqual(h.opened, ['https://files.test/download']);
  assert.deepEqual(
    h.library.getSnapshot().files.map((row) => row.id),
    ['newest'],
  );
  assert.equal(h.library.getSnapshot().message, '');
});

for (const action of ['account', 'delete']) {
  test(`a pending download cannot open after ${action} invalidates its row`, async (t) => {
    const h = await setup(t),
      held = deferred();
    await h.library.refresh();
    h.request(() => held.promise);
    const downloading = h.library.download('document');
    await tick();
    if (action === 'account') {
      h.identity('bob');
      h.identity('alice');
    } else h.deleted('document');
    held.resolve(response({ url: 'https://files.test/stale', expiresAt: Date.now() + 100000 }));
    await downloading;
    assert.deepEqual(h.opened, []);
    if (action === 'delete') assert.match(h.library.getSnapshot().message, /excluído|indisponível/);
    else assert.equal(h.library.getSnapshot().message, '');
  });
}

test('download errors are shown only while the same refresh still owns the row', async (t) => {
  const h = await setup(t),
    stale = deferred();
  await h.library.refresh();
  h.request(async () => response({ error: { message: 'Link indisponível.' } }, 503));
  await h.library.download('document');
  assert.match(h.library.getSnapshot().message, /Link indisponível/);
  h.request(() => stale.promise);
  const downloading = h.library.download('document');
  await tick();
  h.request(async (path) => response(path === '/status' ? { used: 10 } : listing([file('new')])));
  await h.library.refresh();
  stale.resolve(response({ error: { message: 'Falha antiga.' } }, 500));
  await downloading;
  assert.equal(h.library.getSnapshot().message, '');
  assert.deepEqual(h.opened, []);
});

test('logout and disposal cancel publication and release only the library subscriptions', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.request(() => held.promise);
  const refresh = h.library.refresh();
  await tick();
  h.identity(null);
  assert.deepEqual(h.library.getSnapshot().files, []);
  assert.equal(h.library.getSnapshot().used, null);
  assert.equal(h.library.getSnapshot().accountId, null);
  h.library.dispose();
  h.library.dispose();
  const snapshot = h.library.getSnapshot(),
    publications = h.changes.length;
  assert.deepEqual(h.listeners(), { identities: 1, messages: 1, profiles: 0 });
  held.resolve(response({ used: 100, ...listing() }));
  await refresh;
  h.identity('bob');
  h.protect(['document']);
  h.deleted('document');
  await h.library.refresh();
  await h.library.remove('document');
  await h.library.download('document');
  assert.equal(h.library.getSnapshot(), snapshot);
  assert.equal(h.changes.length, publications);
  assert.equal(h.openCalls(), 0);
  assert.equal(h.requests.length, 2);
  assert.equal(h.client.getSnapshot().accountId, 'bob', 'the shared client remains alive');
});

test('a signed-out library requests neither lists nor attachment actions', async (t) => {
  const h = await setup(t);
  h.identity(null);
  await h.library.refresh();
  await h.library.download('document');
  await h.library.remove('document');
  assert.match(h.library.getSnapshot().message, /Entre na sua conta/);
  assert.equal(h.library.getSnapshot().loading, false);
  assert.deepEqual(h.requests, []);
  assert.equal(h.openCalls(), 0);
});
