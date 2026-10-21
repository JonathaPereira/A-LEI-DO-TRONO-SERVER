'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express');
const { createFiles } = require('../server/files.ts');
const { readStoredFile, readFilePage, readStorageUsage } = require('../server/files-protocol.ts');
const { createStorageDatabase } = require('../server/storage-database.ts');
const id = '10000000-0000-4000-8000-000000000001';
const peer = '10000000-0000-4000-8000-000000000002';
const fileId = '20000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://provider.invalid',
  SUPABASE_SECRET_KEY: 'sb_secret_fixture',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_BUCKET: 'fixture',
  R2_ACCESS_KEY_ID: 'fixture-access',
  R2_SECRET_ACCESS_KEY: 'fixture-secret',
};
const row = (patch = {}) => ({
  id: fileId,
  owner_id: id,
  object_key: 'chat/object',
  name: 'arquivo.pdf',
  bytes: 8,
  mime: 'application/pdf',
  kind: 'chat',
  room_id: 'text',
  direct_peer_id: null,
  state: 'ready',
  created_at: new Date().toISOString(),
  ...patch,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
function fixture(ports = {}) {
  const rows = new Map(),
    objects = new Map(),
    calls = [],
    notices = [];
  const service = createFiles({
    env,
    auth: {
      configured: true,
      allowedOrigins: new Set(['https://app.example.test']),
      tokenFrom: () => 'fixture-session',
      identity: async () => ({
        id,
        role: 'member',
        nickname: 'Conta',
        expiresAt: Date.now() + 60000,
      }),
      request: async () => null,
    },
    membership: ports.membership ?? (() => true),
    canAttach: ports.canAttach ?? (() => true),
    onDeleted: (value) => {
      notices.push(value);
      ports.onDeleted?.(value);
    },
    adapter: {
      async put(key, body, size, mime, name, signal) {
        const chunks = [];
        for await (const chunk of body) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        assert.equal(buffer.length, size);
        objects.set(key, buffer);
        if (ports.put) await ports.put({ key, size, mime, name, signal });
      },
      async remove(key, signal) {
        calls.push({ operation: 'object-delete', key, signal });
        if (ports.remove) await ports.remove(key, signal);
        objects.delete(key);
      },
      url: () => 'https://objects.example.test/signed-fixture',
    },
    async fetchImpl(input, options) {
      const url = new URL(input),
        body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({
        operation: url.pathname.split('/').at(-1),
        method: options.method,
        body,
        signal: options.signal,
      });
      if (ports.fetch) {
        const value = await ports.fetch(url, options, body);
        if (value !== undefined) return value;
      }
      const reply = (value) => Response.json(value);
      const selected = url.searchParams.get('id')?.slice(3);
      if (url.pathname.includes('/rpc/reserve_')) {
        const reserved = row({
          id: body.p_id,
          owner_id: body.p_owner,
          object_key: body.p_key,
          name: body.p_name,
          bytes: body.p_bytes,
          mime: body.p_mime,
          kind: body.p_kind ?? 'direct',
          room_id: body.p_room ?? null,
          direct_peer_id: body.p_peer ?? null,
          state: 'pending',
        });
        rows.set(reserved.id, reserved);
        return reply(reserved);
      }
      if (url.pathname.endsWith('/mark_chat_file_deleting')) {
        const current = rows.get(body.p_id);
        if (!current) return reply(null);
        current.state = 'deleting';
        return reply(current);
      }
      if (url.pathname.endsWith('/chat_storage_usage'))
        return reply([...rows.values()].reduce((n, r) => n + r.bytes, 0));
      if (url.pathname.endsWith('/direct_file_access')) return reply(ports.access ?? true);
      if (options.method === 'PATCH') {
        const current = rows.get(selected);
        if (!current) return reply([]);
        Object.assign(current, body);
        return reply([current]);
      }
      if (options.method === 'DELETE') {
        rows.delete(selected);
        return reply(null);
      }
      let page = selected ? [rows.get(selected)].filter(Boolean) : [...rows.values()];
      for (const key of ['kind', 'owner_id', 'state', 'room_id']) {
        const value = url.searchParams.get(key);
        if (value?.startsWith('eq.')) page = page.filter((r) => r[key] === value.slice(3));
      }
      if (url.searchParams.has('or'))
        page = page.filter(
          (r) =>
            r.state === 'deleting' ||
            (r.state === 'pending' && Date.parse(r.created_at) < Date.now() - 20 * 60000),
        );
      return reply(
        page.slice(
          Number(url.searchParams.get('offset') || 0),
          Number(url.searchParams.get('offset') || 0) +
            Number(url.searchParams.get('limit') || 200),
        ),
      );
    },
  });
  return {
    service,
    rows,
    objects,
    calls,
    notices,
    async listen() {
      const app = express();
      service.install(app);
      service.install(app);
      const server = await new Promise((resolve) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      });
      return {
        call: (path, { method = 'GET', body, signal, headers = {} } = {}) =>
          fetch('http://127.0.0.1:' + server.address().port + '/files' + path, {
            method,
            body,
            signal,
            headers: {
              Authorization: 'Bearer fixture',
              Origin: 'https://app.example.test',
              ...headers,
            },
          }),
        async close() {
          service.stop();
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        },
      };
    },
  };
}
const upload = (http, options = {}) =>
  http.call('/upload', {
    method: 'POST',
    body: Buffer.from('%PDF-1.7'),
    headers: { 'X-File-Kind': 'chat', 'X-Room-Id': 'text', 'X-File-Name': 'arquivo.pdf' },
    ...options,
  });

test('stored file pages reject malformed, duplicate, oversized or cross-scope records before projection', () => {
  assert.equal(readStoredFile(row({ bytes: '8', private: 'secret' })).bytes, 8);
  assert(!('private' in readStoredFile(row({ private: 'secret' }))));
  for (const bad of [
    null,
    {},
    [null],
    [row(), row()],
    Array.from({ length: 201 }, () => row()),
    [row({ id: 4 })],
    [row({ bytes: '1e9' })],
    [row({ owner_id: 'other' })],
    [row({ object_key: '' })],
    [row({ kind: 'unknown' })],
    [row({ created_at: 'bad' })],
    [row({ kind: 'direct' })],
    [row({ duration_ms: 16000 })],
  ])
    assert.throws(() => readFilePage(bad), { code: 'STORAGE_UNAVAILABLE' });
  assert.throws(() => readFilePage([row({ owner_id: peer })], 200, (r) => r.owner_id === id), {
    code: 'STORAGE_UNAVAILABLE',
  });
  for (const bad of [null, {}, [], true, '8x', -1, Infinity])
    assert.throws(() => readStorageUsage(bad), { code: 'STORAGE_UNAVAILABLE' });
  assert.equal(readStorageUsage('8000000000'), 8000000000);
});

test('private URL access requires a literal boolean and refuses another lookup identity', async () => {
  for (const access of [{ allowed: true }, 'true', 1, false, true]) {
    const f = fixture({ access }),
      http = await f.listen();
    f.rows.set(fileId, row({ kind: 'direct', room_id: null, direct_peer_id: peer }));
    try {
      const res = await http.call('/' + fileId + '/url');
      assert.equal(res.status, access === true ? 200 : access === false ? 403 : 503);
    } finally {
      await http.close();
    }
  }
  const f = fixture({
    fetch: async (url) =>
      url.pathname.endsWith('/chat_files') ? Response.json([row({ id: peer })]) : undefined,
  });
  try {
    await assert.rejects(f.service.attachment(fileId, id, 'text'), { code: 'STORAGE_UNAVAILABLE' });
  } finally {
    f.service.stop();
  }
});

test('HTTP lists validate the full provider page and remove storage keys from public metadata', async () => {
  let page = [row()];
  const f = fixture({
      fetch: async (url) =>
        url.pathname.endsWith('/chat_files') ? Response.json(page) : undefined,
    }),
    http = await f.listen();
  try {
    let res = await http.call('/mine'),
      value = await res.json();
    assert.equal(res.status, 200);
    assert.equal(value.files.length, 1);
    assert(!JSON.stringify(value).includes('object_key'));
    assert(!JSON.stringify(value).includes('chat/object'));
    for (const bad of [
      [row({ owner_id: peer })],
      [row({ state: 'pending' })],
      [row(), row()],
      null,
    ]) {
      page = bad;
      res = await http.call('/mine');
      assert.equal(res.status, 503);
      assert(!('files' in (await res.json())));
    }
    page = [row({ room_id: 'another-channel' })];
    assert.equal((await http.call('/channel/text')).status, 503);
    page = [row()];
    assert.equal((await http.call('/soundboard')).status, 503);
  } finally {
    await http.close();
  }
});

test('object deletion confirms before quota release and its notification survives caller disconnect', async () => {
  const entered = deferred(),
    answer = deferred(),
    notified = deferred(),
    client = new AbortController();
  const f = fixture({
      remove: async () => {
        entered.resolve();
        await answer.promise;
      },
      onDeleted: notified.resolve,
    }),
    http = await f.listen();
  f.rows.set(fileId, row());
  f.objects.set('chat/object', Buffer.from('%PDF-1.7'));
  try {
    const work = http.call('/' + fileId, { method: 'DELETE', signal: client.signal }),
      rejected = assert.rejects(work);
    await entered.promise;
    client.abort();
    await rejected;
    assert.equal(f.rows.size, 1);
    assert.equal(f.rows.get(fileId).state, 'deleting');
    assert.equal(f.notices.length, 0);
    assert(!f.calls.some((call) => call.method === 'DELETE'));
    answer.resolve();
    await notified.promise;
    assert.equal(f.rows.size, 0);
    assert.equal(f.notices.length, 1);
    assert(
      f.calls.findIndex((c) => c.operation === 'object-delete') <
        f.calls.findIndex((c) => c.method === 'DELETE'),
    );
  } finally {
    await http.close();
  }
});

test('failed object removal keeps deletion reservations and cleanup retries before freeing quota', async () => {
  let fail = true;
  const f = fixture({
      remove: async () => {
        if (fail) throw Error('private provider failure');
      },
    }),
    http = await f.listen();
  f.rows.set(fileId, row());
  try {
    const res = await http.call('/' + fileId, { method: 'DELETE' });
    assert.equal(res.status, 503);
    assert(!JSON.stringify(await res.json()).includes('private'));
    assert.equal(f.rows.size, 1);
    assert.equal(f.notices.length, 0);
    fail = false;
    await f.service.cleanup();
    assert.equal(f.rows.size, 0);
    assert.equal(f.notices.length, 1);
  } finally {
    await http.close();
  }
});

test('uncertain PUT retains quota until delayed cleanup; confirmed PUT failure removes its reservation', async () => {
  for (const uncertain of [true, false]) {
    let allowed = true;
    const f = fixture({
        put: async () => {
          if (uncertain) throw Error('PUT response lost');
          allowed = false;
        },
        canAttach: () => allowed,
      }),
      http = await f.listen();
    try {
      assert.equal((await upload(http)).status, uncertain ? 503 : 409);
      assert.equal(f.rows.size, uncertain ? 1 : 0);
      assert.equal(f.notices.length, uncertain ? 0 : 1);
      if (uncertain) {
        assert.equal([...f.rows.values()][0].state, 'pending');
        await f.service.cleanup();
        assert.equal(f.rows.size, 1, 'fresh reservations cannot be released by cleanup');
        [...f.rows.values()][0].created_at = new Date(Date.now() - 21 * 60000).toISOString();
        await f.service.cleanup();
        assert.equal(f.rows.size, 0);
        assert.equal(f.notices.length, 1);
      }
    } finally {
      await http.close();
    }
  }
});

test('mismatched reservation cannot upload or delete an unrelated object', async () => {
  const f = fixture({
      fetch: async (url) =>
        url.pathname.includes('/reserve_chat_file')
          ? Response.json(row({ state: 'pending', object_key: 'other/private-object' }))
          : undefined,
    }),
    http = await f.listen();
  try {
    assert.equal((await upload(http)).status, 503);
    assert.equal(f.objects.size, 0);
    assert(!f.calls.some((c) => c.operation === 'object-delete'));
  } finally {
    await http.close();
  }
});

test('mismatched ready acknowledgement cannot expose another file and rolls back the known upload', async () => {
  const f = fixture({
      fetch: async (_url, options) =>
        options.method === 'PATCH' ? Response.json([row({ id: peer })]) : undefined,
    }),
    http = await f.listen();
  try {
    const res = await upload(http);
    assert.equal(res.status, 503);
    assert(!('file' in (await res.json())));
    assert.equal(f.rows.size, 0);
    assert.equal(f.objects.size, 0);
  } finally {
    await http.close();
  }
});

test('shutdown cancels pending object IO and late success cannot release quota or broadcast', async () => {
  const entered = deferred(),
    answer = deferred();
  let signal;
  const f = fixture({
      remove: async (_key, current) => {
        signal = current;
        entered.resolve();
        await answer.promise;
      },
    }),
    http = await f.listen();
  f.rows.set(fileId, row());
  try {
    const work = http.call('/' + fileId, { method: 'DELETE' });
    await entered.promise;
    f.service.stop();
    f.service.stop();
    assert.equal(signal.aborted, true);
    answer.resolve();
    assert.equal((await work).status, 503);
    assert.equal(f.rows.size, 1);
    assert.equal(f.notices.length, 0);
    assert.equal((await http.call('/status')).status, 503);
    await assert.rejects(f.service.db('chat_files'), { code: 'STORAGE_UNAVAILABLE' });
  } finally {
    await http.close();
  }
});

test('shutdown aborts an active upload and leaves uncertain reservations for the next service cleanup', async () => {
  const entered = deferred(),
    answer = deferred(),
    finished = deferred();
  let signal;
  const f = fixture({
      put: async (current) => {
        signal = current.signal;
        entered.resolve();
        await answer.promise;
      },
      remove: async () => finished.resolve(),
    }),
    http = await f.listen();
  try {
    const work = upload(http).then(
      (response) => response.status,
      () => 'closed',
    );
    await entered.promise;
    f.service.stop();
    assert.equal(signal.aborted, true);
    answer.resolve();
    assert([503, 'closed'].includes(await work));
    await finished.promise;
    assert.equal(f.rows.size, 1);
    assert.equal([...f.rows.values()][0].state, 'pending');
    assert.equal(f.notices.length, 0);
    assert(!f.calls.some((c) => c.method === 'PATCH' || c.method === 'DELETE'));
  } finally {
    await http.close();
  }
});

test('closing a file read cancels only that request and leaves the storage service usable', async () => {
  const entered = deferred(),
    aborted = deferred(),
    client = new AbortController();
  let pending = true;
  const f = fixture({
      fetch: async (url, options) => {
        if (pending && url.pathname.endsWith('/chat_files'))
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => {
                aborted.resolve();
                reject(Error('closed reader'));
              },
              { once: true },
            );
            entered.resolve();
          });
      },
    }),
    http = await f.listen();
  try {
    const work = http.call('/mine', { signal: client.signal }),
      rejected = assert.rejects(work);
    await entered.promise;
    client.abort();
    await rejected;
    await aborted.promise;
    pending = false;
    assert.equal(await f.service.db('rpc/chat_storage_usage', 'POST', {}), 0);
  } finally {
    await http.close();
  }
});

test('storage owns and releases its cleanup timer exactly once', (t) => {
  const originalSet = global.setInterval,
    originalClear = global.clearInterval,
    owned = [],
    cleared = [];
  t.mock.method(global, 'setInterval', (...args) => {
    const timer = originalSet(...args);
    owned.push(timer);
    return timer;
  });
  t.mock.method(global, 'clearInterval', (timer) => {
    cleared.push(timer);
    originalClear(timer);
  });
  const first = fixture(),
    second = fixture();
  first.service.stop();
  first.service.stop();
  assert.equal(owned.length, 2);
  assert.deepEqual(cleared, [owned[0]]);
  second.service.stop();
  assert.deepEqual(cleared, owned);
});

test('storage DB masks malformed provider failures and keeps secret/legacy key headers distinct', async () => {
  for (const key of ['sb_secret_fixture', 'legacy-service-fixture']) {
    let options,
      body = null,
      status = 200;
    const controller = new AbortController(),
      db = createStorageDatabase({
        url: env.SUPABASE_URL,
        key,
        signal: controller.signal,
        fetchImpl: async (_url, value) => {
          options = value;
          return Response.json(body, { status });
        },
      });
    assert.equal(await db('rpc/fixture', 'POST', {}), null);
    assert.equal(options.headers.apikey, key);
    assert.equal(
      options.headers.Authorization,
      key.startsWith('sb_secret_') ? undefined : 'Bearer ' + key,
    );
    status = 403;
    body = { message: { private: 'secret' } };
    await assert.rejects(db('rpc/fixture'), { code: 'STORAGE_UNAVAILABLE' });
    body = { message: 'FRIEND_REQUIRED private table' };
    await assert.rejects(
      db('rpc/fixture'),
      (error) =>
        error.status === 403 &&
        error.code === 'FRIEND_REQUIRED' &&
        !error.message.includes('private'),
    );
    controller.abort();
    await assert.rejects(db('rpc/fixture'), { code: 'STORAGE_UNAVAILABLE' });
  }
});
