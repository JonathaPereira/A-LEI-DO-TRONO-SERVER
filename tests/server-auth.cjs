'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express');
const { createAuth } = require('../server/auth.ts');
const { CREATOR_EMAIL } = require('../server/roles.ts');
const id = '10000000-0000-4000-8000-000000000001';
const sid = '20000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://provider.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'fixture_public_key',
  APP_URL: 'https://app.example.test',
};
const user = () => ({
  id,
  email: 'member@example.test',
  email_confirmed_at: '2026-10-21T00:00:00Z',
});
const profile = () => ({
  id,
  nickname: 'Conta',
  community_role: 'member',
  avatar_preset: 'crown',
  avatar_file_id: null,
});
const token = (claims = {}) =>
  'header.' +
  Buffer.from(
    JSON.stringify({
      sub: id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      session_id: sid,
      ...claims,
    }),
  ).toString('base64url') +
  '.fixture';
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
function fixture(ports = {}) {
  const calls = [],
    revocations = [],
    changes = [];
  const service = createAuth({
    env,
    onRevoke: (value) => {
      revocations.push(value);
      ports.onRevoke?.(value);
    },
    onProfileChange: (value) => {
      changes.push(value);
      ports.onProfileChange?.(value);
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      if (ports.fetch) {
        const answer = await ports.fetch(url, options);
        if (answer !== undefined) return answer;
      }
      if (url.endsWith('/auth/v1/user')) return Response.json(user());
      if (url.includes('/rest/v1/profiles?')) return Response.json([profile()]);
      if (url.includes('/token?'))
        return Response.json({
          access_token: token(),
          refresh_token: 'refresh-fixture',
          secret: 'must-be-dropped',
        });
      return Response.json({});
    },
  });
  return {
    service,
    calls,
    revocations,
    changes,
    async listen() {
      const app = express();
      service.install(app, express);
      service.install(app, express);
      const server = await new Promise((resolve) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      });
      return {
        call: (
          path,
          { method = 'POST', body = {}, access = token(), origin = env.APP_URL, signal, raw } = {},
        ) =>
          fetch('http://127.0.0.1:' + server.address().port + '/auth/' + path, {
            method,
            signal,
            headers: {
              'Content-Type': 'application/json',
              ...(access ? { Authorization: 'Bearer ' + access } : {}),
              ...(origin ? { Origin: origin } : {}),
            },
            body:
              method === 'GET' || method === 'OPTIONS' ? undefined : (raw ?? JSON.stringify(body)),
          }),
        close: async () => {
          service.stop();
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        },
      };
    },
  };
}

test('identity verifies the provider before claims and only persisted roles authorize accounts', async () => {
  let currentUser = { ...user(), user_metadata: { role: 'creator', nickname: 'Forjado' } },
    currentProfile = profile();
  const f = fixture({
    fetch: async (url) =>
      url.endsWith('/auth/v1/user')
        ? Response.json(currentUser)
        : url.includes('/profiles?')
          ? Response.json([currentProfile])
          : undefined,
  });
  try {
    const member = await f.service.identity(token());
    assert.equal(member.nickname, 'Conta');
    assert.equal(member.role, 'member');
    assert.equal(member.sessionId, sid);
    assert.deepEqual(
      Object.keys(member).sort(),
      [
        'id',
        'nickname',
        'email',
        'role',
        'avatar_preset',
        'avatar_file_id',
        'expiresAt',
        'sessionId',
      ].sort(),
    );
    currentProfile.community_role = 'admin';
    assert.equal((await f.service.identity(token())).role, 'admin');
    currentUser.email = CREATOR_EMAIL;
    assert.equal((await f.service.identity(token())).role, 'creator');
    assert(
      f.calls.every(
        (call) =>
          call.headers.apikey === env.SUPABASE_PUBLISHABLE_KEY &&
          call.headers.Authorization === 'Bearer ' + token(),
      ),
    );
    const denied = fixture({
      fetch: async () => Response.json({ error_code: 'bad_jwt' }, { status: 401 }),
    });
    try {
      await assert.rejects(denied.service.identity('not-a-jwt'), { code: 'INVALID_CREDENTIALS' });
      assert.equal(
        denied.calls.length,
        1,
        'no local claims or profile lookup bypass provider denial',
      );
    } finally {
      denied.service.stop();
    }
  } finally {
    f.service.stop();
  }
});

test('malformed users and complete profile pages fail closed instead of selecting a partial account', async () => {
  let payload = user(),
    profiles = [profile()];
  const f = fixture({
    fetch: async (url) => Response.json(url.endsWith('/auth/v1/user') ? payload : profiles),
  });
  try {
    for (const bad of [
      null,
      [],
      { ...user(), id: 42 },
      { ...user(), email: {} },
      { ...user(), email_confirmed_at: 'invalid-date' },
      { ...user(), is_anonymous: 'false' },
    ]) {
      payload = bad;
      await assert.rejects(f.service.identity(token()), { code: 'AUTH_UNAVAILABLE' });
    }
    for (const bad of [
      { ...user(), is_anonymous: true, email: null },
      { ...user(), email_confirmed_at: null },
    ]) {
      payload = bad;
      await assert.rejects(f.service.identity(token()), { code: 'EMAIL_NOT_CONFIRMED' });
    }
    payload = user();
    for (const bad of [
      null,
      {},
      [],
      [null],
      [profile(), profile()],
      [{ ...profile(), id: sid }],
      [{ ...profile(), nickname: [] }],
      [{ ...profile(), community_role: 'creator' }],
      [{ ...profile(), avatar_file_id: {} }],
      [{ ...profile(), avatar_preset: 2 }],
    ]) {
      profiles = bad;
      await assert.rejects(f.service.identity(token()), { code: 'PROFILE_UNAVAILABLE' });
    }
    profiles = [{ id, nickname: 'Conta' }];
    assert.equal((await f.service.identity(token())).avatar_preset, 'crown');
  } finally {
    f.service.stop();
  }
});

test('session expiry and ID are bounded after verification, with absent legacy session ID preserved', async () => {
  const f = fixture();
  try {
    for (const claims of [
      { exp: 1 },
      { exp: '9999999999' },
      { exp: Number.MAX_VALUE },
      { exp: 2.5 },
      { sub: sid },
      { session_id: {} },
      { session_id: 'arbitrary' },
    ])
      await assert.rejects(f.service.identity(token(claims)), { code: 'AUTH_EXPIRED' });
    await assert.rejects(
      f.service.identity('header.' + Buffer.from('null').toString('base64url') + '.fixture'),
      { code: 'AUTH_EXPIRED' },
    );
    assert.equal((await f.service.identity(token({ session_id: undefined }))).sessionId, undefined);
  } finally {
    f.service.stop();
  }
});

test('provider errors are localized even with hostile non-string codes and messages', async () => {
  let payload,
    status = 400;
  const f = fixture({ fetch: async () => Response.json(payload, { status }) });
  try {
    for (const bad of [
      null,
      [],
      { error_code: {}, message: { private: 'secret' } },
      { code: 42, message: 'private credential' },
    ]) {
      payload = bad;
      await assert.rejects(
        f.service.request('fixture', '/auth/v1/token'),
        (error) => error.code === 'INVALID_CREDENTIALS' && !error.message.includes('private'),
      );
    }
    for (const [path, data, expectedCode, expectedStatus] of [
      ['/auth/v1/token', { error_code: 'email_not_confirmed' }, 'EMAIL_NOT_CONFIRMED', 403],
      [
        '/auth/v1/signup',
        { error_code: 'email_exists', message: 'private mail' },
        'SIGNUP_FAILED',
        400,
      ],
      [
        '/rest/v1/rpc/community_set_role',
        { message: 'database: CREATOR_PROTECTED secret' },
        'CREATOR_PROTECTED',
        403,
      ],
      [
        '/rest/v1/rpc/social_send_message',
        { message: 'FRIEND_REQUIRED secret' },
        'FRIEND_REQUIRED',
        403,
      ],
      [
        '/rest/v1/rpc/update_chat_profile',
        { message: 'NICKNAME_TAKEN secret' },
        'NICKNAME_TAKEN',
        409,
      ],
      ['/rest/v1/rpc/read_member_profile', { message: 'FORBIDDEN secret' }, 'FORBIDDEN', 403],
      ['/auth/v1/verify', { message: 'internal token' }, 'RECOVERY_INVALID', 401],
    ]) {
      payload = data;
      await assert.rejects(
        f.service.request('fixture', path),
        (error) =>
          error.code === expectedCode &&
          error.status === expectedStatus &&
          !/secret|private|internal/.test(error.message),
      );
    }
    status = 429;
    payload = null;
    await assert.rejects(f.service.request('fixture', '/auth/v1/token'), {
      code: 'AUTH_RATE_LIMIT',
      status: 429,
    });
  } finally {
    f.service.stop();
  }
});

test('broken JSON and response-body failures cannot become successful provider operations; empty logout is valid', async () => {
  let response;
  const f = fixture({ fetch: async () => response });
  try {
    for (const bad of ['not-json', '']) {
      response = new Response(bad);
      await assert.rejects(f.service.request('fixture', '/rpc/fixture'), {
        code: 'AUTH_UNAVAILABLE',
      });
    }
    response = {
      ok: true,
      text: async () => {
        throw Error('private body failure');
      },
    };
    await assert.rejects(f.service.request('fixture', '/rpc/fixture'), {
      code: 'AUTH_UNAVAILABLE',
    });
    response = new Response(null, { status: 204 });
    assert.equal(await f.service.request('fixture', '/auth/v1/logout', 'POST'), null);
  } finally {
    f.service.stop();
  }
});

test('login rejects malformed credentials and exposes only the public account and normalized session', async () => {
  let credentials = { access_token: token(), refresh_token: 'refresh-fixture', private: 'secret' };
  const f = fixture({
    fetch: async (url) => (url.includes('/token?') ? Response.json(credentials) : undefined),
  });
  const http = await f.listen();
  try {
    for (const bad of [
      null,
      [],
      {},
      { access_token: {}, refresh_token: 'ok' },
      { access_token: token(), refresh_token: '' },
      { access_token: token(), refresh_token: 'x '.repeat(20) },
    ]) {
      credentials = bad;
      const res = await http.call('login', {
        body: { email: 'member@example.test', password: 'Senha12!' },
      });
      assert.equal(res.status, 503);
    }
    credentials = { access_token: token(), refresh_token: 'refresh-fixture', private: 'secret' };
    const res = await http.call('login', {
        body: { email: 'member@example.test', password: 'Senha12!' },
      }),
      value = await res.json();
    assert.equal(res.status, 200);
    assert.equal(value.user.nickname, 'Conta');
    assert.equal(value.user.permissions.manageRoles, false);
    assert.deepEqual(Object.keys(value.session).sort(), [
      'access_token',
      'expires_at',
      'refresh_token',
    ]);
    assert(!JSON.stringify(value).includes('secret'));
    assert(!('sessionId' in value.user));
  } finally {
    await http.close();
  }
});

test('public HTTP boundary preserves origin, no-referrer, body limit, rates and one installation', async () => {
  const f = fixture(),
    http = await f.listen();
  try {
    let res = await http.call('login', { method: 'OPTIONS', access: null });
    assert.equal(res.status, 204);
    assert.equal(f.calls.length, 0);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('access-control-allow-origin'), env.APP_URL);
    res = await http.call('login', {
      origin: 'https://outsider.invalid',
      body: { email: 'member@example.test', password: 'Senha12!' },
    });
    assert.equal(res.status, 403);
    for (const raw of ['{broken', '[]', JSON.stringify({ padding: 'x'.repeat(17000) })]) {
      res = await http.call('login', { raw });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error.code, 'INVALID_REQUEST');
    }
    for (let n = 0; n < 11; n++) {
      res = await http.call('login', {
        body: { email: 'member@example.test', password: 'Senha12!' },
      });
      assert.equal(res.status, n < 10 ? 200 : 429);
    }
    assert.equal(f.calls.length, 30, 'exactly one provider sequence per login');
    f.service.stop();
    res = await http.call('me', { method: 'GET' });
    assert.equal(res.status, 503);
  } finally {
    await http.close();
  }
});

test('stop clears its timer once, cancels active provider IO and rejects all later work', async (t) => {
  const originalSet = global.setInterval,
    originalClear = global.clearInterval;
  const intervals = [],
    cleared = [];
  t.mock.method(global, 'setInterval', (...args) => {
    const timer = originalSet(...args);
    intervals.push(timer);
    return timer;
  });
  t.mock.method(global, 'clearInterval', (timer) => {
    cleared.push(timer);
    originalClear(timer);
  });
  const entered = deferred();
  let seen;
  const f = fixture({
    fetch: (_url, options) =>
      new Promise((_resolve, reject) => {
        seen = options.signal;
        seen.addEventListener('abort', () => reject(Error('private aborted provider')), {
          once: true,
        });
        entered.resolve();
      }),
  });
  const work = f.service.request('fixture', '/rpc/pending'),
    rejection = assert.rejects(work, { code: 'AUTH_UNAVAILABLE' });
  await entered.promise;
  f.service.stop();
  f.service.stop();
  await rejection;
  assert.equal(seen.aborted, true);
  assert.deepEqual(cleared, intervals);
  await assert.rejects(f.service.identity(token()), { code: 'AUTH_UNAVAILABLE' });
  assert.equal(f.calls.length, 1);
});

test('a delayed provider ignoring abort cannot trigger callbacks after service shutdown', async () => {
  const entered = deferred(),
    answer = deferred();
  const f = fixture({
    fetch: async (url, options) => {
      if (url.endsWith('/auth/v1/user') && options.method === 'PUT') {
        entered.resolve();
        return answer.promise;
      }
    },
  });
  const http = await f.listen();
  try {
    const request = http.call('reset', { body: { password: 'NovaSenha12!' } });
    await entered.promise;
    f.service.stop();
    answer.resolve(Response.json({ id }));
    assert.equal((await request).status, 503);
    assert.equal(f.revocations.length, 0);
    assert.equal(f.calls.length, 3);
  } finally {
    await http.close();
  }
});

test('disconnecting a read aborts provider IO without saving a profile', async () => {
  const entered = deferred(),
    aborted = deferred(),
    client = new AbortController();
  const f = fixture({
    fetch: (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => {
            aborted.resolve();
            reject(Error('closed client'));
          },
          { once: true },
        );
        entered.resolve();
      }),
  });
  const http = await f.listen();
  try {
    const request = http.call('profile', {
        body: { nickname: 'Conta nova' },
        signal: client.signal,
      }),
      rejection = assert.rejects(request);
    await entered.promise;
    client.abort();
    await rejection;
    await aborted.promise;
    assert.equal(f.calls.length, 1);
    assert.equal(f.changes.length, 0);
  } finally {
    await http.close();
  }
});

test('accepted profile writes and logout retain notifications after caller disconnect', async () => {
  for (const path of ['profile', 'logout']) {
    const entered = deferred(),
      answer = deferred(),
      notified = deferred(),
      client = new AbortController();
    let writeSignal;
    const f = fixture({
      onProfileChange: notified.resolve,
      onRevoke: notified.resolve,
      fetch: async (url, options) => {
        if (url.includes('/rpc/update_chat_profile') || url.includes('/logout?')) {
          writeSignal = options.signal;
          entered.resolve();
          return answer.promise;
        }
      },
    });
    const http = await f.listen();
    try {
      const request = http.call(path, { body: { nickname: 'Conta nova' }, signal: client.signal }),
        rejection = assert.rejects(request);
      await entered.promise;
      client.abort();
      await rejection;
      assert.equal(writeSignal.aborted, false);
      answer.resolve(new Response(null, { status: 204 }));
      await notified.promise;
      assert.equal(path === 'profile' ? f.changes.length : f.revocations.length, 1);
      if (path === 'logout')
        assert.deepEqual(f.revocations[0], { userId: id, sessionId: sid, all: false });
    } finally {
      await http.close();
    }
  }
});
