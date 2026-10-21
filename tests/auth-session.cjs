'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createAccountSession } = require('../src/lib/auth/session.ts');
const { createAuthApi, AuthError } = require('../src/lib/auth/api.ts');
const { readSessionData } = require('../src/lib/auth/protocol.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const now = 1000000;
const user = (id = 'account-a') => ({
  id,
  nickname: id,
  email: id + '@example.test',
  role: 'member',
  permissions: { moderateFiles: false },
  avatar_preset: 'crown',
  avatar_file_id: null,
});
const data = (id = 'account-a', token = id, expires = now / 1000 + 3600) => ({
  user: user(id),
  session: {
    access_token: 'access-' + token,
    refresh_token: 'refresh-' + token,
    expires_at: expires,
  },
});
function fixture(ports = {}) {
  const values = new Map(Object.entries(ports.stored ?? {})),
    preferences = new Map(),
    timers = new Map(),
    calls = [],
    auth = [],
    saves = [],
    events = [],
    notices = [];
  let timerId = 0,
    leaves = 0,
    disconnected = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const owner = createAccountSession({
    api: async (...args) => {
      calls.push(args);
      if (ports.api) return ports.api(...args);
      const [path, body] = args;
      if (path === 'login') return data(body.email === 'b' ? 'account-b' : 'account-a');
      if (path === 'refresh') return data('account-a', 'renewed');
      if (path === 'me' || path === 'profile') return { user: user() };
      return {};
    },
    storage,
    preferences: {
      getItem: (key) => preferences.get(key) ?? null,
      setItem: (key, value) => preferences.set(key, value),
      removeItem: (key) => preferences.delete(key),
    },
    native: ports.native
      ? {
          readSession: () => ports.native.readSession?.() ?? Promise.resolve(null),
          saveSession: async (value) => {
            saves.push(value);
            return ports.native.saveSession?.(value) ?? { saved: true };
          },
        }
      : undefined,
    authenticate: async (token) => {
      auth.push(token);
      return ports.authenticate?.(token);
    },
    authenticateGuest:
      ports.guest ??
      (async (name) => ({
        id: 'guest-a',
        nickname: name,
        ticket: 'ticket-a',
        expiresAt: now + 100000,
      })),
    disconnect: () => disconnected++,
    leaveIdentity: async () => {
      leaves++;
      await ports.leave?.();
    },
    showPortal: () => notices.push('portal'),
    needLogin: (message) => notices.push(message ?? 'login'),
    needGuest: () => notices.push('guest'),
    offline: () => notices.push('offline'),
    changed: (snapshot, roleOnly) => events.push({ snapshot, roleOnly }),
    now: () => now,
    setTimer: (fn, delay) => {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  return {
    owner,
    values,
    preferences,
    timers,
    calls,
    auth,
    saves,
    events,
    notices,
    storage,
    get leaves() {
      return leaves;
    },
    get disconnected() {
      return disconnected;
    },
    async login() {
      await owner.start();
      return owner.login('a', 'not-logged', true);
    },
    delay() {
      return [...timers.values()].at(-1)?.delay;
    },
  };
}
test('HTTP auth transport omits cookies/referrers, retains server error codes and rejects malformed success bodies', async () => {
  let seen;
  const request = createAuthApi({
    base: 'https://api.test',
    fetch: async (url, options) => {
      seen = { url, options };
      return Response.json({ ok: true });
    },
  });
  await request('login', { email: 'fixture' });
  assert.equal(seen.options.credentials, 'omit');
  assert.equal(seen.options.referrerPolicy, 'no-referrer');
  assert.equal(seen.options.cache, 'no-store');
  assert.equal(seen.url, 'https://api.test/auth/login');
  const denied = createAuthApi({
    base: 'https://api.test',
    fetch: async () =>
      Response.json({ error: { code: 'DENIED', message: 'fixture denial' } }, { status: 403 }),
  });
  await assert.rejects(denied('me'), (error) => error.code === 'DENIED' && error.status === 403);
  const malformed = createAuthApi({
    base: 'https://api.test',
    fetch: async () => Response.json([]),
  });
  await assert.rejects(malformed('me'), (error) => error.code === 'AUTH_RESPONSE');
});
test('auth transport propagates identity abort and bounds an unresponsive request', async () => {
  const fetch = (_, { signal }) =>
    new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  const controller = new AbortController(),
    request = createAuthApi({ base: 'https://api.test', fetch, timeoutMs: 5 });
  const pending = request('me', null, null, 'GET', controller.signal),
    rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejected;
  await assert.rejects(request('me'), (error) => error.code === 'NETWORK_ERROR');
});
test('session protocol freezes only validated credentials and account fields', () => {
  const raw = data(),
    result = readSessionData(raw);
  raw.user.permissions.moderateFiles = true;
  assert.equal(result.user.permissions.moderateFiles, false);
  assert(Object.isFrozen(result.session));
  for (const value of [
    {},
    { ...data(), session: { ...data().session, expires_at: NaN } },
    { ...data(), user: { ...user(), permissions: { admin: 'yes' } } },
  ])
    assert.throws(() => readSessionData(value));
});
test('restored accounts are checked against /me and tokens never enter observable snapshots', async () => {
  const f = fixture({ stored: { 'mn-auth-session-v1': JSON.stringify(data()) } });
  await f.owner.start();
  assert.equal(f.owner.getSnapshot().user.id, 'account-a');
  assert.equal(await f.owner.getAccessToken(), 'access-account-a');
  assert.equal(JSON.stringify(f.owner.getSnapshot()).includes('access-'), false);
  assert.equal(f.delay(), 3540000);
  f.owner.dispose();
  assert.equal(f.timers.size, 0);
});
test('concurrent refresh and token requests rotate once and share one server result', async () => {
  const response = deferred(),
    f = fixture({
      api: async (path) => (path === 'login' ? data() : path === 'refresh' ? response.promise : {}),
    });
  await f.login();
  const first = f.owner.refresh(),
    second = f.owner.refresh(),
    token = f.owner.getAccessToken();
  assert.strictEqual(first, second);
  response.resolve(data('account-a', 'renewed'));
  assert.equal(await first, 'access-renewed');
  assert.equal(await token, 'access-renewed');
  assert.equal(f.calls.filter(([path]) => path === 'refresh').length, 1);
  assert.equal(f.auth.at(-1), 'access-renewed');
  f.owner.dispose();
});
test('logout invalidates a pending refresh and cannot resurrect its account', async () => {
  const response = deferred(),
    f = fixture({
      api: async (path) => (path === 'login' ? data() : path === 'refresh' ? response.promise : {}),
    });
  await f.login();
  const renewal = f.owner.refresh(),
    signal = f.calls.at(-1)[4];
  await f.owner.logout();
  assert.equal(signal.aborted, true);
  response.resolve(data('account-a', 'late'));
  assert.equal(await renewal, null);
  assert.equal(f.owner.getSnapshot().user, null);
  assert.equal(f.values.has('mn-auth-session-v1'), false);
  f.owner.dispose();
});
test('logout prevents a delayed login response from overwriting the cleared identity', async () => {
  const response = deferred(),
    f = fixture({ api: async (path) => (path === 'login' ? response.promise : {}) });
  await f.owner.start();
  const login = f.owner.login('a', 'fixture', true),
    rejected = assert.rejects(login, { name: 'AbortError' });
  await f.owner.logout();
  response.resolve(data());
  await rejected;
  assert.equal(f.owner.getSnapshot().user, null);
  assert.equal(f.auth.length, 0);
  f.owner.dispose();
});
test('profile cancellation after an identity change reports the account boundary rather than the transport abort', async () => {
  const f = fixture({
    api: (path, _body, _token, _method, signal) =>
      path === 'login'
        ? data()
        : path === 'profile'
          ? new Promise((_resolve, reject) =>
              signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
            )
          : {},
  });
  try {
    await f.login();
    const saving = f.owner.updateProfile({ nickname: 'old draft' });
    const cancelled = assert.rejects(saving, /A conta foi alterada durante o salvamento/);
    await tick();
    await f.owner.logout();
    await cancelled;
    assert.equal(f.owner.getSnapshot().user, null);
  } finally {
    f.owner.dispose();
  }
});

test('a profile result cannot cross logout and a later login to the same account', async () => {
  const profile = deferred(),
    f = fixture({
      api: async (path) => (path === 'login' ? data() : path === 'profile' ? profile.promise : {}),
    });
  await f.login();
  const updating = f.owner.updateProfile({ nickname: 'old draft' }),
    rejected = assert.rejects(updating, /alterada/);
  await tick();
  await f.owner.logout();
  await f.owner.login('a', 'fixture', false);
  profile.resolve({ user: { ...user(), nickname: 'old draft' } });
  await rejected;
  assert.equal(f.owner.getSnapshot().user.nickname, 'account-a');
  f.owner.dispose();
});
test('offline boot preserves cached identity and the refresh backoff instead of retrying every second', async () => {
  const f = fixture({
    stored: { 'mn-auth-session-v1': JSON.stringify(data('account-a', 'old', now / 1000 + 30)) },
    api: async () => {
      throw new AuthError('offline', 'NETWORK_ERROR');
    },
  });
  await f.owner.start();
  assert.equal(f.owner.getSnapshot().user.id, 'account-a');
  assert.equal(f.delay(), 30000);
  assert(f.notices.includes('offline'));
  await assert.rejects(f.owner.refresh());
  assert.equal(f.delay(), 60000);
  f.owner.dispose();
});
test('authorization failure and a mismatched account from /me expire the cached session', async () => {
  for (const api of [
    async () => {
      throw new AuthError('expired', 'AUTH_ERROR', 401);
    },
    async () => ({ user: user('account-b') }),
  ]) {
    const f = fixture({ stored: { 'mn-auth-session-v1': JSON.stringify(data()) }, api });
    await f.owner.start();
    assert.equal(f.owner.getSnapshot().user, null);
    assert.equal(f.values.has('mn-auth-session-v1'), false);
    assert.equal(f.leaves, 1);
    assert(f.notices.some((value) => value.includes('expirou')));
    f.owner.dispose();
  }
});
test('an old native restore cannot replace a login submitted while persistence was still loading', async () => {
  const restored = deferred(),
    f = fixture({ native: { readSession: () => restored.promise } });
  const start = f.owner.start();
  await f.owner.login('b', 'fixture', true);
  restored.resolve(data());
  await start;
  assert.equal(f.owner.getSnapshot().user.id, 'account-b');
  f.owner.dispose();
});
test('native persistence serializes snapshots and finishes clearing after an older save', async () => {
  const first = deferred();
  let calls = 0;
  const f = fixture({
    native: {
      saveSession: () => (++calls === 1 ? first.promise : Promise.resolve({ saved: true })),
    },
  });
  await f.owner.start();
  const login = f.owner.login('a', 'fixture', true),
    rejected = assert.rejects(login, { name: 'AbortError' });
  await tick();
  const logout = f.owner.logout();
  assert.equal(f.saves.length, 1);
  first.resolve({ saved: true });
  await rejected;
  await logout;
  assert.equal(f.saves.length, 2);
  assert.equal(f.saves[1], null);
  assert.equal(f.owner.getSnapshot().user, null);
  f.owner.dispose();
});
test('a stale native save failure cannot override a newer remember preference', async () => {
  const first = deferred();
  let calls = 0;
  const f = fixture({
    native: {
      saveSession: () => (++calls === 1 ? first.promise : Promise.resolve({ saved: true })),
    },
  });
  await f.owner.start();
  const login = f.owner.login('a', 'fixture', true);
  await tick();
  const cleared = f.owner.setRemember(false);
  first.reject(Error('old save failure'));
  await login;
  await cleared;
  assert.equal(f.owner.getSnapshot().remembered, false);
  assert.equal(f.owner.getSnapshot().rememberError, '');
  assert.equal(f.saves.at(-1), null);
  f.owner.dispose();
});
test('guest restoration retains the ticket and a late guest response cannot replace member login', async () => {
  const restored = {
    id: 'guest-a',
    nickname: 'Visitor',
    ticket: 'ticket-a',
    expiresAt: now + 100000,
  };
  const guest = deferred(),
    f = fixture({
      stored: { 'mn-guest-v1': JSON.stringify(restored) },
      guest: () => guest.promise,
    });
  const start = f.owner.start();
  await f.owner.login('a', 'fixture', false);
  guest.resolve(restored);
  await start;
  assert.equal(f.owner.getSnapshot().user.id, 'account-a');
  assert.equal(f.owner.getSnapshot().guest, null);
  f.owner.dispose();
});
test('role updates are validated and disposed session methods cannot erase a replacement tab session', async () => {
  const f = fixture();
  await f.login();
  f.owner.applyRole('admin', { moderateFiles: true });
  assert.equal(f.owner.getSnapshot().user.role, 'admin');
  assert.equal(f.events.at(-1).roleOnly, true);
  f.owner.applyRole('creator', { moderateFiles: 'true' });
  assert.equal(f.owner.getSnapshot().user.role, 'admin');
  f.owner.dispose();
  f.values.set('mn-auth-session-v1', 'replacement');
  f.owner.clear();
  await f.owner.logout();
  assert.equal(f.values.get('mn-auth-session-v1'), 'replacement');
});

test('a failed account switch retains renewal of the still-active session', async () => {
  let first = true;
  const f = fixture({
    api: async () => {
      if (first) {
        first = false;
        return data();
      }
      throw new AuthError('invalid', 'INVALID_CREDENTIALS', 401);
    },
  });
  await f.login();
  const delay = f.delay(),
    epoch = f.owner.getSnapshot().epoch;
  await assert.rejects(f.owner.login('b', 'invalid', false));
  assert.equal(f.owner.getSnapshot().user.id, 'account-a');
  assert.equal(f.owner.getSnapshot().epoch, epoch);
  assert.equal(f.delay(), delay);
  f.owner.dispose();
});

test('the current account can renew while another login waits without losing either operation', async () => {
  const login = deferred();
  let first = true;
  const f = fixture({
    api: async (path) =>
      path === 'refresh'
        ? data('account-a', 'renewed')
        : first
          ? ((first = false), data())
          : login.promise,
  });
  await f.login();
  const switching = f.owner.login('b', 'fixture', false);
  await f.owner.refresh();
  assert.equal(await f.owner.getAccessToken(), 'access-renewed');
  login.resolve(data('account-b'));
  await switching;
  assert.equal(f.owner.getSnapshot().user.id, 'account-b');
  f.owner.dispose();
});

test('a superseded native restore releases ready without waiting for the old opaque IPC promise', async () => {
  const native = deferred(),
    f = fixture({ native: { readSession: () => native.promise } });
  const start = f.owner.start();
  await f.owner.login('b', 'fixture', true);
  await f.owner.ready;
  await start;
  assert.equal(f.owner.getSnapshot().user.id, 'account-b');
  native.resolve(data());
  await tick();
  assert.equal(f.owner.getSnapshot().user.id, 'account-b');
  f.owner.dispose();
});

test('guest renewal cannot cancel an explicit member login', async () => {
  const guest = { id: 'guest-a', nickname: 'Visitor', ticket: 'ticket-a', expiresAt: now + 100000 };
  const renewed = deferred(),
    login = deferred();
  let calls = 0;
  const f = fixture({
    stored: { 'mn-guest-v1': JSON.stringify(guest) },
    guest: () => (++calls === 1 ? Promise.resolve(guest) : renewed.promise),
    api: () => login.promise,
  });
  await f.owner.start();
  const switching = f.owner.login('a', 'fixture', false),
    renewal = f.owner.ensureGuest();
  renewed.resolve(guest);
  assert.equal(await renewal, true);
  login.resolve(data());
  await switching;
  assert.equal(f.owner.getSnapshot().user.id, 'account-a');
  assert.equal(f.owner.getSnapshot().guest, null);
  f.owner.dispose();
});

test('a profile HTTP response cannot undo a newer permission revocation received by the session', async () => {
  const response = deferred(),
    f = fixture({ api: async (path) => (path === 'login' ? data() : response.promise) });
  await f.login();
  f.owner.applyRole('admin', { moderateFiles: true });
  const saving = f.owner.updateProfile({ nickname: 'edited' });
  await tick();
  f.owner.applyRole('member', { moderateFiles: false });
  response.resolve({
    user: { ...user(), nickname: 'edited', role: 'admin', permissions: { moderateFiles: true } },
  });
  const result = await saving;
  assert.equal(result.nickname, 'edited');
  assert.equal(result.role, 'member');
  assert.equal(f.owner.getSnapshot().user.permissions.moderateFiles, false);
  f.owner.dispose();
});

test('a new login waits for the prior identity media release before publishing its account', async () => {
  const left = deferred(),
    f = fixture({ leave: () => left.promise });
  await f.login();
  const logout = f.owner.logout(),
    login = f.owner.login('b', 'fixture', false);
  await tick();
  assert.equal(f.owner.getSnapshot().user, null);
  assert.equal(f.auth.length, 1);
  left.resolve();
  await logout;
  await login;
  assert.equal(f.owner.getSnapshot().user.id, 'account-b');
  assert.equal(f.leaves, 1);
  f.owner.dispose();
});
