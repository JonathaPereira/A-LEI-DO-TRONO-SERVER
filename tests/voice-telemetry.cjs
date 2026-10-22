'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/telemetry.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function receiver(id, kind = 'audio', target = null) {
  return { track: { id, kind, readyState: 'live' }, jitterBufferTarget: target };
}
function peer() {
  const voice = receiver('voice'),
    screen = receiver('screen-audio'),
    camera = receiver('camera', 'video');
  const transceivers = [voice, camera, screen].map((receiver, i) => ({ receiver, mid: String(i) }));
  return {
    voice,
    screen,
    camera,
    transceivers,
    connectionState: 'connected',
    reads: 0,
    _tronoScreenAudioTransceiver: transceivers[2],
    report: new Map(),
    getReceivers() {
      return this.transceivers.map((tr) => tr.receiver);
    },
    getTransceivers() {
      return this.transceivers;
    },
    getStats() {
      this.reads++;
      return Promise.resolve(this.report);
    },
  };
}
function report(n, extra = {}) {
  const stats = [
    {
      id: 'voice',
      type: 'inbound-rtp',
      kind: 'audio',
      mid: '0',
      trackIdentifier: 'voice',
      timestamp: n * 5000,
      bytesReceived: n * 16000,
      packetsReceived: n * 100,
      packetsLost: n * 2,
      totalSamplesReceived: n * 48000,
      concealedSamples: n * 480,
      jitterBufferDelay: n * 60,
      jitterBufferEmittedCount: n * 1000,
      jitter: 0.005,
      ...extra,
    },
    {
      id: 'video',
      type: 'outbound-rtp',
      kind: 'video',
      timestamp: n * 5000,
      bytesSent: n * 50000,
      framesPerSecond: 60,
      frameWidth: 1920,
      frameHeight: 1080,
      qualityLimitationReason: 'none',
    },
    { id: 'local', type: 'local-candidate', candidateType: 'host' },
    {
      id: 'pair',
      type: 'candidate-pair',
      state: 'succeeded',
      nominated: true,
      currentRoundTripTime: 0.025,
      localCandidateId: 'local',
    },
  ];
  return new Map(stats.map((stat) => [stat.id, stat]));
}
async function setup(t, options = {}) {
  const { createVoiceTelemetry } = await modulePromise;
  const settings = {
    joined: true,
    transport: 'p2p',
    detailsOpen: false,
    foreground: true,
    visible: true,
    desktop: false,
  };
  const connections = new Map(),
    samples = [],
    warnings = [];
  let time = 1000,
    changes = 0;
  const telemetry = createVoiceTelemetry({
    protection: true,
    getSettings: () => settings,
    getConnections: () => [...connections],
    getLocalVideo: () => undefined,
    now: () => time,
    onSample: async (value) => samples.push(value),
    onChange: () => {
      changes++;
    },
    warn: (e) => warnings.push(e),
    ...options,
  });
  t.after(() => {
    telemetry.stop();
    telemetry.reset();
  });
  function attach(key = 'p2p:p', id = 'private-peer') {
    const pc = peer();
    connections.set(key, pc);
    telemetry.registerReceiver(id, pc.voice);
    return pc;
  }
  async function sample(pc, n, extra) {
    pc.report = report(n, extra);
    await telemetry.collect();
  }
  return {
    telemetry,
    settings,
    connections,
    samples,
    warnings,
    attach,
    sample,
    get changes() {
      return changes;
    },
    time(value) {
      time = value;
    },
    async advance(ms) {
      time += ms;
      t.mock.timers.tick(ms);
      await tick();
    },
  };
}

test('collects interval voice, traffic, video and ICE metrics without touching peers or tracks', async (t) => {
  const h = await setup(t),
    pc = h.attach();
  assert.equal(pc.voice.jitterBufferTarget, 60);
  await h.sample(pc, 1);
  assert.equal(h.telemetry.getSnapshot().rows.length, 0);
  await h.sample(pc, 2);
  const snapshot = h.telemetry.getSnapshot(),
    metrics = snapshot.telemetry;
  assert.equal(metrics.audioLossPct, (2 / 102) * 100);
  assert.equal(metrics.audioJitterMs, 5);
  assert.equal(metrics.concealedPct, 1);
  assert.equal(metrics.jitterBufferMs, 60);
  assert.equal(metrics.uploadBps, 80000);
  assert.equal(metrics.downloadBps, 25600);
  assert.equal(metrics.rttMs, 25);
  assert.equal(metrics.iceRoute, 'host');
  assert.equal(metrics.outFps, 60);
  assert.equal(metrics.outW, 1920);
  assert.equal(snapshot.rows[0].voice, 1);
  assert.equal(snapshot.owners[0], 'private-peer');
  assert(!JSON.stringify(snapshot.rows).includes('private'));
  for (const value of [
    snapshot,
    metrics,
    snapshot.rows,
    snapshot.rows[0],
    snapshot.history,
    snapshot.history[0],
  ])
    assert(Object.isFrozen(value));
  h.telemetry.reset();
  assert.equal(pc.voice.jitterBufferTarget, null);
  assert.equal(pc.voice.track.readyState, 'live');
  assert.equal(pc.connectionState, 'connected');
});

test('screen/game audio never changes voice targets or contaminates voice diagnostics', async (t) => {
  const h = await setup(t),
    pc = h.attach();
  for (const n of [1, 2]) {
    pc.report = report(n);
    pc.report.set('screen', {
      id: 'screen',
      type: 'inbound-rtp',
      kind: 'audio',
      mid: '2',
      trackIdentifier: 'screen-audio',
      timestamp: n * 5000,
      packetsReceived: n * 100,
      jitter: 0.9,
      concealedSamples: n * 48000,
      totalSamplesReceived: n * 48000,
      playoutId: 'screen-playout',
    });
    pc.report.set('screen-playout', {
      id: 'screen-playout',
      type: 'media-playout',
      synthesizedSamplesEvents: n * 20,
      synthesizedSamplesDuration: n,
    });
    await h.telemetry.collect();
  }
  assert.equal(h.telemetry.getSnapshot().telemetry.audioJitterMs, 5);
  assert.equal(h.telemetry.getSnapshot().rows.length, 1);
  assert.equal(h.telemetry.getSnapshot().playout, null);
  assert.equal(pc.voice.jitterBufferTarget, 60);
  assert.equal(pc.screen.jitterBufferTarget, null);
  assert.equal(pc.camera.jitterBufferTarget, null);
});

test('SFU voice is sampled while a separate screen-audio peer is excluded', async (t) => {
  const h = await setup(t),
    voice = h.attach('sfu-sub:p:audio');
  const screen = peer();
  h.connections.set('sfu-sub:p:screen-audio', screen);
  for (const n of [1, 2]) {
    voice.report = report(n);
    screen.report = report(n, { jitter: 0.9 });
    await h.telemetry.collect();
  }
  assert.equal(h.telemetry.getSnapshot().rows.length, 1);
  assert.equal(h.telemetry.getSnapshot().telemetry.audioJitterMs, 5);
  assert.equal(screen.voice.jitterBufferTarget, null);
});

test('unregistering a voice during getStats prevents late sampling from recreating its receive policy', async (t) => {
  const h = await setup(t),
    pc = h.attach(),
    pending = deferred();
  pc.getStats = () => pending.promise;
  const collecting = h.telemetry.collect();
  h.telemetry.removeReceiver(pc.voice);
  pending.resolve(report(2, { jitter: 0.9 }));
  await collecting;
  assert.equal(h.telemetry.getSnapshot().rows.length, 0);
  assert.equal(h.telemetry.getSnapshot().telemetry.audioJitterMs, 0);
  assert.equal(pc.voice.jitterBufferTarget, null);
});

test('replacing a peer under the same key ignores its old report and starts independent baselines', async (t) => {
  const h = await setup(t),
    old = h.attach(),
    pending = deferred();
  await h.sample(old, 1);
  old.getStats = () => pending.promise;
  const collecting = h.telemetry.collect();
  h.telemetry.removeReceiver(old.voice);
  old.connectionState = 'closed';
  const next = h.attach('p2p:p', 'next-peer');
  pending.resolve(report(50, { jitter: 0.9 }));
  await collecting;
  assert.equal(next.voice.jitterBufferTarget, 60, 'new registration survives old batch pruning');
  await h.sample(next, 2);
  assert.equal(h.telemetry.getSnapshot().rows.length, 0);
  assert.equal(h.telemetry.getSnapshot().telemetry.downloadBps, 0);
  await h.sample(next, 3);
  assert.equal(h.telemetry.getSnapshot().telemetry.downloadBps, 25600);
  assert.equal(h.telemetry.getSnapshot().owners[0], 'next-peer');
});

test('reset invalidates old getStats and releases the sampling lock before its promise settles', async (t) => {
  const h = await setup(t),
    old = h.attach(),
    pending = deferred();
  old.getStats = () => pending.promise;
  const previous = h.telemetry.collect();
  assert.equal(h.telemetry.collect(), previous);
  h.telemetry.reset();
  h.connections.clear();
  const next = h.attach('p2p:p', 'new-call');
  await h.sample(next, 1);
  await h.sample(next, 2);
  const snapshot = h.telemetry.getSnapshot(),
    changes = h.changes,
    samples = h.samples.length;
  pending.resolve(report(100, { jitter: 0.9 }));
  await previous;
  assert.equal(h.telemetry.getSnapshot().telemetry, snapshot.telemetry);
  assert.equal(h.changes, changes);
  assert.equal(h.samples.length, samples);
  assert.equal(old.voice.jitterBufferTarget, null);
  assert.equal(next.voice.jitterBufferTarget, 60);
});

test('a failed stats read keeps the native target but clears stale measured intervals', async (t) => {
  const h = await setup(t),
    pc = h.attach();
  await h.sample(pc, 1);
  await h.sample(pc, 2, { jitter: 0.04 });
  assert.equal(pc.voice.jitterBufferTarget, 100);
  const history = h.telemetry.getSnapshot().history.length;
  const samples = h.samples.length;
  pc.getStats = async () => {
    throw new Error('peer busy');
  };
  await h.telemetry.collect();
  assert.equal(pc.voice.jitterBufferTarget, 100);
  assert.equal(h.telemetry.getSnapshot().rows.length, 0);
  assert.equal(h.telemetry.getSnapshot().history.length, history);
  assert.equal(h.samples.length, samples, 'missing reports must not restore adaptive quality');
});

test('receiver and statistics removal release ownership and retired counter baselines', async (t) => {
  const h = await setup(t),
    pc = h.attach();
  await h.sample(pc, 1);
  await h.sample(pc, 2);
  pc.report = new Map();
  await h.telemetry.collect();
  await h.sample(pc, 50);
  assert.equal(h.telemetry.getSnapshot().telemetry.downloadBps, 0);
  pc.voice.track.readyState = 'ended';
  await h.telemetry.collect();
  assert.equal(pc.voice.jitterBufferTarget, null);
  assert.equal(h.telemetry.getSnapshot().rows.length, 0);
  h.connections.clear();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry, null);
  assert.deepEqual(h.telemetry.getSnapshot().owners, []);
});

test('playout diagnostics include only voice-linked reports and their interval deltas', async (t) => {
  const h = await setup(t),
    pc = h.attach();
  for (const n of [1, 2]) {
    pc.report = report(n, { playoutId: 'playout' });
    pc.report.set('playout', {
      id: 'playout',
      type: 'media-playout',
      synthesizedSamplesEvents: n * 2,
      synthesizedSamplesDuration: n * 0.02,
    });
    pc.report.set('unrelated', {
      id: 'unrelated',
      type: 'media-playout',
      synthesizedSamplesEvents: 900,
      synthesizedSamplesDuration: 800,
    });
    await h.telemetry.collect();
  }
  const { playout, assessment } = h.telemetry.getSnapshot();
  assert.deepEqual(playout, { gapEvents: 2, gapMs: 20 });
  assert.equal(assessment.kind, 'output');
  assert(Object.isFrozen(playout));
  await h.sample(pc, 3);
  assert.equal(h.telemetry.getSnapshot().playout, null);
});

test('history is bounded and immutable; missing and restarted counters do not grow a buffer', async (t) => {
  const h = await setup(t),
    pc = h.attach();
  for (let n = 1; n <= 16; n++) await h.sample(pc, n);
  assert.equal(h.telemetry.getSnapshot().history.length, 12);
  await h.sample(pc, 17, { totalSamplesReceived: undefined, concealedSamples: undefined });
  assert.equal(h.telemetry.getSnapshot().rows[0].concealedPct, null);
  await h.sample(pc, 1);
  assert.equal(h.telemetry.getSnapshot().rows.length, 0);
  assert.equal(pc.voice.jitterBufferTarget, 60);
  assert.equal(h.telemetry.getSnapshot().telemetry.downloadBps, 0);
});

test('scheduler uses 2/5/15 second intervals and skips hidden web pages while preserving desktop collection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await setup(t),
    pc = h.attach();
  pc.report = report(1);
  h.settings.detailsOpen = true;
  h.telemetry.start();
  await tick();
  assert.equal(pc.reads, 1);
  await h.advance(1999);
  assert.equal(pc.reads, 1);
  await h.advance(1);
  assert.equal(pc.reads, 2);
  h.settings.foreground = false;
  await h.advance(2000);
  assert.equal(pc.reads, 3);
  await h.advance(4999);
  assert.equal(pc.reads, 3);
  await h.advance(1);
  assert.equal(pc.reads, 4);
  h.settings.visible = false;
  await h.advance(5000);
  assert.equal(pc.reads, 4);
  h.settings.desktop = true;
  await h.advance(5000);
  assert.equal(pc.reads, 5);
  h.settings.joined = false;
  await h.advance(5000);
  const changes = h.changes;
  await h.advance(14999);
  assert.equal(h.changes, changes);
  await h.advance(1);
  assert(h.changes > changes);
});

test('restarting the scheduler shares the pending read and stop prevents another timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await setup(t),
    pc = h.attach(),
    pending = deferred();
  pc.getStats = () => {
    pc.reads++;
    return pending.promise;
  };
  h.telemetry.start();
  h.telemetry.start();
  assert.equal(pc.reads, 1);
  h.telemetry.stop();
  pending.resolve(report(1));
  await tick();
  await h.advance(60000);
  assert.equal(pc.reads, 1);
});

test('priority side effects serialize, coalesce obsolete requests and ignore old call responses', async (t) => {
  const calls = [],
    pending = deferred();
  const h = await setup(t, {
    setVoiceProtection: (active) => {
      calls.push(active);
      return active ? pending.promise : Promise.resolve({ active: false, status: 'idle' });
    },
  });
  const old = h.telemetry.syncPriority();
  await tick();
  assert.deepEqual(calls, [true]);
  h.telemetry.configureProtection(false);
  h.telemetry.reset();
  h.settings.joined = false;
  const latest = h.telemetry.syncPriority();
  pending.resolve({ active: true, status: 'managed' });
  await old;
  await latest;
  assert.deepEqual(calls, [true, false]);
  assert.equal(h.telemetry.getSnapshot().priority.status, 'idle');
  assert(Object.isFrozen(h.telemetry.getSnapshot().priority));
});

test('native resources and priority are validated and late IPC cannot overwrite a new call', async (t) => {
  const pending = deferred();
  let resource = pending.promise;
  const h = await setup(t, { getResources: () => resource });
  h.settings.detailsOpen = true;
  const old = h.telemetry.collect();
  h.telemetry.reset();
  resource = Promise.resolve({
    appCpuPercent: 3,
    appMemoryMB: 200,
    freeMemoryMB: 5000,
    voicePriority: { active: false, status: ['managed'] },
  });
  const pc = h.attach();
  await h.sample(pc, 1);
  pending.resolve({
    appCpuPercent: 90,
    appMemoryMB: 9000,
    freeMemoryMB: 1,
    voicePriority: { active: true, status: 'managed' },
  });
  await old;
  const snapshot = h.telemetry.getSnapshot();
  assert.equal(snapshot.resources.appCpuPercent, 3);
  assert(Object.isFrozen(snapshot.resources));
  assert.equal(snapshot.priority, null);
  resource = Promise.resolve({ appCpuPercent: '3', appMemoryMB: 200, freeMemoryMB: 5000 });
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().resources, null);
});

test('a pending resource read cannot replace a newer priority decision', async (t) => {
  const pending = deferred();
  const h = await setup(t, {
    getResources: () => pending.promise,
    setVoiceProtection: async (active) => ({ active, status: active ? 'managed' : 'idle' }),
  });
  h.settings.detailsOpen = true;
  const reading = h.telemetry.collect();
  h.settings.joined = false;
  await h.telemetry.syncPriority();
  pending.resolve({
    appCpuPercent: 1,
    appMemoryMB: 200,
    freeMemoryMB: 3000,
    voicePriority: { active: true, status: 'managed' },
  });
  await reading;
  assert.equal(h.telemetry.getSnapshot().priority.status, 'idle');
});

test('reset releases native priority even when the caller does not issue another priority request', async (t) => {
  const calls = [];
  const h = await setup(t, {
    setVoiceProtection: async (active) => {
      calls.push(active);
      return { active, status: active ? 'managed' : 'idle' };
    },
  });
  await h.telemetry.syncPriority();
  h.telemetry.reset();
  await tick();
  assert.deepEqual(calls, [true, false]);
  assert.equal(h.telemetry.getSnapshot().priority.active, false);
});
