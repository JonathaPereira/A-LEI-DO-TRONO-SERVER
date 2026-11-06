'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeAndroidPush } = require('../src/lib/mobile/push.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => resolve = yes); return { promise, resolve }; };
function fixture() {
  const state = { account: 'alice', mode: 'mentions' }, requests = [], native = [], hold = deferred();
  const target = new EventTarget();
  target.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  target.TronoAndroid = {
    setAccount: async (...value) => native.push(value), getPermission: () => 'granted',
    pushRegistration: async () => ({ configured: true, token: 'device-token', deviceId: 'one-device' }),
  };
  target.TronoAuth = { getSnapshot: () => ({ user: { id: state.account } }), getAccessToken: async () => state.account, ready: Promise.resolve() };
  target.TronoNetwork = { BACKEND_HTTP: 'https://backend.invalid' };
  target.TronoPersonal = { get: () => state.mode, mutedTargets: () => ['muted-peer'] };
  target.fetch = async (_url, options) => { requests.push(options); if (requests.length === 1) await hold.promise; return Response.json({ ok: true }); };
  initializeAndroidPush(target);
  return { state, target, native, requests, hold };
}

test('push account replacement waits for an older registration and updates the native identity immediately', async () => {
  const f = fixture();
  f.target.dispatchEvent(new Event('trono:ready')); await tick();
  assert.equal(f.requests.length, 1);
  f.state.account = 'bob'; f.target.dispatchEvent(new Event('trono-auth-change')); await tick();
  const before = f.requests.length;
  const lastNative = f.native.at(-1);
  f.hold.resolve(); await tick(); await tick();
  assert.equal(before, 1, 'older account registration must complete before the replacement writes');
  assert.equal(lastNative[0], 'bob');
  assert.equal(f.requests.at(-1).headers.Authorization, 'Bearer bob');
});

test('audio preference changes do not flood push registration, and disabling notices takes effect in native policy immediately', async () => {
  const f = fixture(); f.hold.resolve();
  f.target.dispatchEvent(new Event('trono:ready')); await tick();
  const count = f.requests.length;
  f.target.dispatchEvent(new CustomEvent('trono-personal-change', { detail: { key: 'volume:peer' } })); await tick();
  assert.equal(f.requests.length, count);
  f.state.mode = 'off';
  f.target.dispatchEvent(new CustomEvent('trono-personal-change', { detail: { key: 'notifications' } })); await tick();
  assert.equal(f.native.at(-1)[1], false);
  assert.deepEqual(f.native.at(-1)[2], ['muted-peer']);
  assert.equal(JSON.parse(f.requests.at(-1).body).enabled, false);
});

test('restoring a remembered account cannot clear native identity before authentication is ready', async () => {
  const ready = deferred(), f = fixture();
  f.target.TronoAuth.ready = ready.promise;
  f.state.account = null;
  f.target.dispatchEvent(new Event('trono:ready'));
  f.target.dispatchEvent(new Event('trono-android-permission'));
  await tick();
  const nativeBeforeReady = f.native.length;
  f.state.account = 'alice'; f.hold.resolve(); ready.resolve();
  await tick(); await tick();
  assert.equal(nativeBeforeReady, 0);
  assert.equal(f.native.at(-1)[0], 'alice');
});
