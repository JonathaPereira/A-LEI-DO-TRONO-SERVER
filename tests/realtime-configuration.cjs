'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/voice/realtime.ts'),
  import('../src/lib/voice/realtime-protocol.ts'),
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
const policy = (patch = {}) => ({
  enabled: true,
  configured: true,
  hardBlocked: false,
  softWarning: false,
  screenAllowed: true,
  highAllowed: true,
  maxQuality: 'high',
  estimatedGb: 25,
  thresholds: { hard: 950 },
  estimateSafetyFactor: 1.3,
  ...patch,
});
const turn = () => ({
  iceServers: [
    { urls: 'stun:example.test:3478' },
    {
      urls: ['turn:example.test:3478?transport=udp', 'turns:example.test:5349'],
      username: 'temporary',
      credential: 'secret',
    },
  ],
  turn: true,
});
async function setup(t, overrides = {}) {
  const [{ createRealtimeConfiguration }] = await modules;
  t.mock.timers.enable({ apis: ['setInterval'] });
  const listeners = new Set(),
    warnings = [],
    accepted = [];
  const state = {
    connected: true,
    visible: true,
    call: 1,
    statusRequests: 0,
    iceRequests: 0,
    changes: 0,
  };
  let statusRequest = async () => policy(),
    iceRequest = async () => turn();
  const realtime = createRealtimeConfiguration({
    connected: () => state.connected,
    visible: () => state.visible,
    callGeneration: () => state.call,
    requestStatus: () => {
      state.statusRequests++;
      return statusRequest();
    },
    requestIce: () => {
      state.iceRequests++;
      return iceRequest();
    },
    onMessage: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onChange: () => state.changes++,
    onStatus: async (status, current) => {
      accepted.push({ status, current });
    },
    warn: (error) => warnings.push(error),
    ...overrides,
  });
  t.after(realtime.stop);
  return {
    realtime,
    state,
    listeners,
    accepted,
    warnings,
    statusRequest(fn) {
      statusRequest = fn;
    },
    iceRequest(fn) {
      iceRequest = fn;
    },
    emit(message) {
      for (const fn of listeners) fn(message);
    },
    async advance(ms) {
      t.mock.timers.tick(ms);
      await tick();
    },
  };
}

test('policy snapshots copy and freeze known data without exposing credentials or server metadata', async (t) => {
  const h = await setup(t),
    input = policy({ credentials: 'private', thresholds: { hard: 900 } });
  h.statusRequest(async () => input);
  const result = await h.realtime.sync();
  input.thresholds.hard = 1;
  assert.equal(result.thresholds.hard, 900);
  assert.equal(result.credentials, undefined);
  assert(Object.isFrozen(result) && Object.isFrozen(result.thresholds));
  assert(Object.isFrozen(h.realtime.getSnapshot()));
  assert.equal(h.accepted.length, 1);
  assert(h.accepted[0].current());
});

test('invalid policies are atomic and never turn an unconfirmed server into an available SFU', async (t) => {
  const h = await setup(t);
  for (const input of [
    null,
    {},
    policy({ enabled: 'yes' }),
    policy({ screenAllowed: undefined }),
    policy({ maxQuality: 'ultra' }),
    policy({ thresholds: { hard: 0 } }),
    policy({ estimatedGb: NaN }),
    policy({ estimateSafetyFactor: -1 }),
  ]) {
    h.statusRequest(async () => input);
    assert.equal(await h.realtime.sync(), null);
    assert.equal(h.realtime.getSnapshot().status, null);
  }
  assert.equal(h.accepted.length, 0);
  h.statusRequest(async () => policy());
  const previous = await h.realtime.sync();
  h.statusRequest(async () => policy({ hardBlocked: 'false' }));
  assert.equal(await h.realtime.sync(), null);
  assert.equal(h.realtime.getSnapshot().status, previous);
  assert(h.realtime.getSnapshot().error);
});

test('status requests share one pending operation and transport errors recover on the next refresh', async (t) => {
  const h = await setup(t),
    gate = deferred();
  h.statusRequest(() => gate.promise);
  const first = h.realtime.sync();
  assert.equal(h.realtime.sync(), first);
  await tick();
  assert.equal(h.state.statusRequests, 1);
  gate.reject(Error('offline'));
  assert.equal(await first, null);
  h.statusRequest(async () => policy());
  assert(await h.realtime.sync());
  assert.equal(h.realtime.getSnapshot().error, '');
});

test('a broadcast supersedes an outstanding status response without waiting for the network', async (t) => {
  const h = await setup(t),
    gate = deferred();
  h.statusRequest(() => gate.promise);
  h.realtime.start();
  const pending = h.realtime.sync();
  await tick();
  h.emit({ type: 'realtime-status', ...policy({ hardBlocked: true, screenAllowed: false }) });
  assert.equal(await pending, null);
  await tick();
  assert(h.realtime.getSnapshot().status.hardBlocked);
  gate.resolve(policy());
  await tick();
  assert(h.realtime.getSnapshot().status.hardBlocked);
  assert.equal(h.accepted.length, 1);
});

test('disconnect clears credentials and status; a prior connection cannot restore state after reconnect', async (t) => {
  const h = await setup(t),
    gate = deferred();
  await h.realtime.refreshIce();
  h.statusRequest(() => gate.promise);
  h.realtime.start();
  const pending = h.realtime.sync();
  await tick();
  h.state.connected = false;
  h.emit({ type: 'connection', connected: false });
  assert.equal(await pending, null);
  assert.deepEqual(h.realtime.getSnapshot(), {
    status: null,
    turn: false,
    error: 'Servidor desconectado',
  });
  assert(!JSON.stringify(h.realtime.configuration('p2p')).includes('secret'));
  h.state.connected = true;
  h.statusRequest(async () => policy({ estimatedGb: 50 }));
  h.emit({ type: 'connection', connected: true });
  await tick();
  gate.resolve(policy({ estimatedGb: 1 }));
  await tick();
  assert.equal(h.realtime.getSnapshot().status.estimatedGb, 50);
});

test('a superseded policy continuation becomes invalid while the new policy can apply immediately', async (t) => {
  const gate = deferred(),
    callbacks = [];
  const h = await setup(t, {
    onStatus: async (status, current) => {
      callbacks.push({ status, current });
      if (status.highAllowed) await gate.promise;
    },
  });
  h.realtime.start();
  const pending = h.realtime.sync();
  await tick();
  h.emit({ type: 'realtime-status', ...policy({ highAllowed: false, maxQuality: 'balanced' }) });
  assert.equal(await pending, null);
  await tick();
  assert.equal(callbacks[0].current(), false);
  assert.equal(callbacks[1].current(), true);
  gate.resolve();
  await tick();
  assert.equal(h.realtime.getSnapshot().status.maxQuality, 'balanced');
});

test('one listener and one 15-second timer refresh only while visible and connected; stop permits a clean restart', async (t) => {
  const h = await setup(t);
  h.realtime.start();
  h.realtime.start();
  await tick();
  assert.equal(h.listeners.size, 1);
  assert.equal(h.state.statusRequests, 1);
  await h.advance(15000);
  assert.equal(h.state.statusRequests, 2);
  h.state.visible = false;
  await h.advance(15000);
  assert.equal(h.state.statusRequests, 2);
  h.state.visible = true;
  h.state.connected = false;
  await h.advance(15000);
  assert.equal(h.state.statusRequests, 2);
  h.realtime.stop();
  assert.equal(h.listeners.size, 0);
  await h.advance(60000);
  assert.equal(h.state.statusRequests, 2);
  h.state.connected = true;
  h.realtime.start();
  await tick();
  assert.equal(h.listeners.size, 1);
  assert.equal(h.state.statusRequests, 3);
});

test('welcome and room joins share refreshes, while malformed broadcasts cannot invalidate confirmed policy', async (t) => {
  const h = await setup(t);
  h.realtime.start();
  await tick();
  const previous = h.realtime.getSnapshot().status;
  h.emit({ type: 'realtime-status', enabled: true });
  assert.equal(h.realtime.getSnapshot().status, previous);
  h.emit({ type: 'welcome' });
  h.emit({ type: 'joined-room' });
  await tick();
  assert.equal(h.state.statusRequests, 2);
});

test('a quality budget rejection invalidates stale requests and never raises an economy restriction', async (t) => {
  const h = await setup(t);
  await h.realtime.sync();
  const gate = deferred();
  h.statusRequest(() => gate.promise);
  const pending = h.realtime.sync();
  await tick();
  h.realtime.restrictHighQuality();
  assert.equal(await pending, null);
  assert.equal(h.realtime.getSnapshot().status.maxQuality, 'balanced');
  gate.resolve(policy());
  await tick();
  assert.equal(h.realtime.getSnapshot().status.highAllowed, false);
  h.statusRequest(async () => policy({ maxQuality: 'economy' }));
  await h.realtime.sync();
  h.realtime.restrictHighQuality();
  assert.equal(h.realtime.getSnapshot().status.maxQuality, 'economy');
});

test('ICE accepts string and array URLs, copies credentials and preserves P2P configuration options', async (t) => {
  const base = { iceServers: [{ urls: ['stun:base.test'] }], iceCandidatePoolSize: 0 };
  const h = await setup(t, { baseIce: base }),
    input = turn();
  h.iceRequest(async () => input);
  await h.realtime.refreshIce();
  input.iceServers[1].credential = 'changed';
  base.iceServers[0].urls[0] = 'stun:changed.test';
  const config = h.realtime.configuration('p2p');
  assert.equal(config.iceCandidatePoolSize, 0);
  assert.equal(config.iceServers[0].urls[0], 'stun:base.test');
  assert.equal(config.iceServers.at(-1).credential, 'secret');
  config.iceServers.at(-1).urls.push('turn:changed.test');
  assert.equal(h.realtime.configuration('sfu').iceServers.at(-1).urls.length, 2);
  assert(h.realtime.getSnapshot().turn);
  assert(!JSON.stringify(h.realtime.getSnapshot()).includes('secret'));
});

test('invalid ICE replies restore default STUN atomically and never retain old TURN credentials', async (t) => {
  const h = await setup(t);
  for (const value of [
    null,
    {},
    { turn: true, iceServers: [] },
    { turn: 'true', iceServers: [{ urls: 'stun:a' }] },
    { turn: false, iceServers: [{ urls: ['stun:valid', 'https://invalid'] }] },
    { turn: true, iceServers: [{ urls: ['turn:a'], credential: {} }] },
  ]) {
    h.iceRequest(async () => turn());
    await h.realtime.refreshIce();
    h.iceRequest(async () => value);
    await h.realtime.refreshIce();
    assert.equal(h.realtime.getSnapshot().turn, false);
    assert.deepEqual(h.realtime.configuration('sfu').iceServers, [
      { urls: ['stun:stun.cloudflare.com:3478'] },
    ]);
  }
});

test('ICE refreshes deduplicate per call; replacement invalidates and settles the old request immediately', async (t) => {
  const h = await setup(t),
    gate = deferred();
  h.iceRequest(() => gate.promise);
  const old = h.realtime.refreshIce();
  assert.equal(h.realtime.refreshIce(), old);
  await tick();
  h.state.call++;
  h.iceRequest(async () => ({ iceServers: [{ urls: 'stun:new.test' }], turn: false }));
  await h.realtime.refreshIce();
  await old;
  gate.resolve(turn());
  await tick();
  assert.equal(h.state.iceRequests, 2);
  assert.deepEqual(h.realtime.configuration('sfu').iceServers, [{ urls: ['stun:new.test'] }]);
});

test('leave and stop cancel pending work without waiting for ICE or policy responses', async (t) => {
  const h = await setup(t),
    iceGate = deferred(),
    statusGate = deferred();
  h.iceRequest(() => iceGate.promise);
  h.statusRequest(() => statusGate.promise);
  const icePending = h.realtime.refreshIce(),
    statusPending = h.realtime.sync();
  await tick();
  h.realtime.cancelIce();
  h.realtime.stop();
  await Promise.all([icePending, statusPending]);
  iceGate.resolve(turn());
  statusGate.reject(Error('late error'));
  await tick();
  assert.deepEqual(h.realtime.getSnapshot(), { status: null, turn: false, error: '' });
  assert.equal(h.warnings.length, 0);
});

test('disconnected and synchronously cancelled requests do not issue network work', async (t) => {
  const h = await setup(t);
  h.state.connected = false;
  await h.realtime.sync();
  await h.realtime.refreshIce();
  h.state.connected = true;
  const pending = h.realtime.sync(),
    icePending = h.realtime.refreshIce();
  h.realtime.stop();
  await Promise.all([pending, icePending]);
  assert.equal(h.state.statusRequests, 0);
  assert.equal(h.state.iceRequests, 0);
});

test('policy protocol keeps defaults for optional usage data and rejects invalid ICE shapes', async () => {
  const [, { readRealtimeStatus, readIceConfiguration }] = await modules;
  const value = readRealtimeStatus(
    policy({ estimatedGb: undefined, thresholds: undefined, estimateSafetyFactor: undefined }),
  );
  assert.equal(value.estimatedGb, 0);
  assert.equal(value.thresholds.hard, 950);
  assert.equal(value.estimateSafetyFactor, 1);
  for (const iceServers of [
    [{ urls: '' }],
    [{ urls: [1] }],
    [{ urls: 'turn:example.test', username: [] }],
    [null],
  ])
    assert.throws(() => readIceConfiguration({ iceServers, turn: false }), { code: 'BAD_SFU_ICE' });
});

test('a later successful refresh invalidates the previous policy guard, including after its callback finished', async (t) => {
  const h = await setup(t);
  await h.realtime.sync();
  assert(h.accepted[0].current());
  h.statusRequest(async () => policy({ highAllowed: false, maxQuality: 'balanced' }));
  await h.realtime.sync();
  assert.equal(h.accepted[0].current(), false);
  assert(h.accepted[1].current());
});
