'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createAuth } = require('../server/auth');
const { createFiles } = require('../server/files');
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const authEnv = {
  SUPABASE_URL: 'https://provider.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'fixture_public_key',
  APP_URL: 'https://app.example.test',
};
function pendingFetch(started, seen) {
  return (_url, options) => {
    seen.push(options.signal);
    started.resolve();
    return new Promise((_resolve, reject) => {
      const abort = () => reject(options.signal.reason);
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
    });
  };
}
test('account RPC forwards the caller cancellation without leaking provider errors', async (t) => {
  t.mock.method(global, 'setInterval', () => ({ unref() {} }));
  const started = deferred(),
    seen = [],
    controller = new AbortController();
  const auth = createAuth({ env: authEnv, fetchImpl: pendingFetch(started, seen) });
  const work = auth.request(
      'fixture-session',
      '/rest/v1/rpc/community_channels',
      'POST',
      {},
      controller.signal,
    ),
    rejected = assert.rejects(work, { code: 'AUTH_UNAVAILABLE' });
  await started.promise;
  controller.abort();
  await rejected;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].aborted, true);
});
test('identity forwards cancellation to the profile lookup after provider token verification', async (t) => {
  t.mock.method(global, 'setInterval', () => ({ unref() {} }));
  const started = deferred(),
    seen = [],
    controller = new AbortController(),
    pending = pendingFetch(started, seen);
  const account = '10000000-0000-4000-8000-000000000001';
  const auth = createAuth({
    env: authEnv,
    fetchImpl: (url, options) =>
      url.endsWith('/auth/v1/user')
        ? Promise.resolve(
            Response.json({
              id: account,
              email: 'member@example.test',
              email_confirmed_at: '2026-10-21T00:00:00Z',
            }),
          )
        : pending(url, options),
  });
  const token =
    'header.' +
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
      'base64url',
    ) +
    '.fixture';
  const work = auth.identity(token, controller.signal),
    rejected = assert.rejects(work, { code: 'AUTH_UNAVAILABLE' });
  await started.promise;
  controller.abort();
  await rejected;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].aborted, true);
});
test('direct attachment preflight forwards cancellation to its private file lookup', async (t) => {
  t.mock.method(global, 'setInterval', () => ({ unref() {} }));
  const started = deferred(),
    seen = [],
    controller = new AbortController();
  const files = createFiles({
    auth: { configured: false },
    env: { SUPABASE_URL: 'https://provider.invalid', SUPABASE_SECRET_KEY: 'sb_secret_fixture' },
    fetchImpl: pendingFetch(started, seen),
    adapter: {},
  });
  const work = files.directAttachment(
      '20000000-0000-4000-8000-000000000001',
      'owner',
      'peer',
      controller.signal,
    ),
    rejected = assert.rejects(work, { code: 'STORAGE_UNAVAILABLE' });
  await started.promise;
  controller.abort();
  await rejected;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].aborted, true);
});

test('privileged storage RPC forwards the caller cancellation through its existing adapter', async (t) => {
  t.mock.method(global, 'setInterval', () => ({ unref() {} }));
  const started = deferred(),
    seen = [],
    controller = new AbortController();
  const files = createFiles({
    auth: { configured: false },
    env: { SUPABASE_URL: 'https://provider.invalid', SUPABASE_SECRET_KEY: 'sb_secret_fixture' },
    fetchImpl: pendingFetch(started, seen),
    adapter: {},
  });
  const work = files.db('rpc/community_channels', 'POST', {}, controller.signal),
    rejected = assert.rejects(work, { code: 'STORAGE_UNAVAILABLE' });
  await started.promise;
  controller.abort();
  await rejected;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].aborted, true);
});
