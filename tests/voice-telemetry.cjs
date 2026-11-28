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
test('video diagnostics expose interval freezes, dropped frames and encode/decode delays without changing media', async (t) => {
  const h = await setup(t),
    pc = h.attach();
  const video = (n) =>
    new Map([
      [
        'tx',
        {
          id: 'tx',
          type: 'outbound-rtp',
          kind: 'video',
          timestamp: n * 1000,
          framesEncoded: n * 60,
          totalEncodeTime: n * 0.3,
          framesSent: n * 60,
          packetsSent: n * 120,
          totalPacketSendDelay: n * 0.24,
          frameWidth: 1920,
          frameHeight: 1080,
        },
      ],
      [
        'rx',
        {
          id: 'rx',
          type: 'inbound-rtp',
          kind: 'video',
          timestamp: n * 1000,
          framesDecoded: n * 60,
          totalDecodeTime: n * 0.12,
          framesDropped: n * 2,
          freezeCount: n,
          totalFreezesDuration: n * 0.25,
          jitterBufferDelay: n * 3,
          jitterBufferEmittedCount: n * 60,
          frameWidth: 1920,
          frameHeight: 1080,
        },
      ],
    ]);
  pc.report = video(1);
  await h.telemetry.collect();
  assert.equal(
    h.telemetry.getSnapshot().telemetry.video[0].encodeMs,
    null,
    'first report establishes a baseline',
  );
  pc.report = video(2);
  await h.telemetry.collect();
  const rows = h.telemetry.getSnapshot().telemetry.video;
  assert.equal(rows[0].fps, 60);
  assert.equal(rows[0].encodeMs, 5);
  assert.equal(rows[0].sendDelayMs, 2);
  assert.equal(rows[1].decodeMs, 2);
  assert.equal(rows[1].bufferMs, 50);
  assert.equal(rows[1].freezeCount, 1);
  assert.equal(rows[1].freezeMs, 250);
  assert.equal(rows[1].droppedFrames, 2);
  assert.equal(rows[0].width, 1920);
  assert.equal(rows[0].height, 1080);
  assert(Object.isFrozen(rows));
  assert(Object.isFrozen(rows[0]));
  assert(!JSON.stringify(rows).includes('tx'));
  assert.equal(pc.connectionState, 'connected');
  pc.report = video(0);
  await h.telemetry.collect();
  assert.equal(
    h.telemetry.getSnapshot().telemetry.video.length,
    0,
    'stale reports must not masquerade as healthy intervals',
  );
  h.telemetry.reset();
  pc.report = video(3);
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.video[0].encodeMs, null);
});
test('copied video diagnostics whitelist anonymous numbers, stream codec/implementation, and preserve unavailable values', () => {
  const { diagnosticReport } = require('../src/lib/voice/diagnostic-report.ts');
  const report = JSON.parse(
    diagnosticReport({
      call: {},
      telemetry: {
        video: [
          {
            direction: 'inbound',
            freezeCount: 2,
            decodeMs: null,
            width: 1920,
            height: 1080,
            ip: 'private',
            trackIdentifier: 'secret',
            freezeMs: Infinity,
          },
          { direction: 'injected identity', decodeMs: 5 },
        ],
        streams: [
          {
            direction: 'outbound',
            codec: 'video/H264',
            implementation: 'OpenH264',
            hardwareAccelerated: false,
            width: 1280,
            height: 720,
            fps: 60,
            bitrateBps: 4500000,
            encodeMs: 18.5,
            stalled: true,
            stallMs: 1200,
            cause: 'encoder-stalled',
            trackId: 'secret-track',
            pcKey: 'sfu:secret-peer',
          },
        ],
      },
    }),
  );
  assert.equal(report.video[0].freezeCount, 2);
  assert.equal(report.video[0].decodeMs, null);
  assert.equal(report.video[0].freezeMs, null);
  assert.equal(report.video.length, 1);
  assert.equal(report.streams.length, 1);
  assert.equal(report.streams[0].codec, 'video/H264');
  assert.equal(report.streams[0].implementation, 'OpenH264');
  assert.equal(report.streams[0].hardwareAccelerated, false);
  assert.equal(report.streams[0].cause, 'encoder-stalled');
  assert(!JSON.stringify(report).includes('secret'));
  assert(!JSON.stringify(report).includes('private'));
});
test('a measured zero video FPS is never replaced by the configured capture FPS', async (t) => {
  const h = await setup(t, {
      getLocalVideo: () => ({ getSettings: () => ({ frameRate: 60, width: 1920, height: 1080 }) }),
    }),
    pc = h.attach();
  pc.report = report(1);
  pc.report.get('video').framesPerSecond = 0;
  await h.telemetry.collect();
  assert.equal(
    h.telemetry.getSnapshot().telemetry.outFps,
    0,
    'a stalled encoder must not be reported as 60 FPS',
  );
});

test('classifies all 8 video freeze causes without confusing static images or guessing without evidence', async (t) => {
  let screenTrack = {
    id: 'tx-track',
    kind: 'video',
    readyState: 'live',
    muted: false,
    enabled: true,
  };
  let rxTrack = { id: 'rx-track', kind: 'video', readyState: 'live', muted: false, enabled: true };
  const h = await setup(t, { getLocalVideo: () => screenTrack });

  const makeVideoPc = (
    dir,
    overrides = () => ({}),
    trackRef = () => (dir === 'outbound' ? screenTrack : rxTrack),
  ) => {
    const p = peer();
    p.getTransceivers = () => [
      {
        mid: '0',
        receiver: p.voice,
        sender: { track: null },
      },
      {
        mid: '1',
        sender: dir === 'outbound' ? { track: trackRef() } : { track: null },
        receiver:
          dir === 'inbound'
            ? { track: trackRef(), playoutDelayHint: undefined, jitterBufferTarget: null }
            : p.screen,
      },
    ];
    let step = 0;
    p.next = () => {
      step++;
      const m = report(step);
      m.delete('video');
      const base =
        dir === 'outbound'
          ? {
              id: 'vid',
              type: 'outbound-rtp',
              kind: 'video',
              mid: '1',
              trackIdentifier: trackRef()?.id,
              timestamp: step * 2000,
              framesEncoded: step * 60,
              framesSent: step * 60,
              packetsSent: step * 120,
              bytesSent: step * 100000,
              retransmittedPacketsSent: 0,
              pliCount: 0,
              totalEncodeTime: step * 0.2,
              totalPacketSendDelay: step * 0.1,
              frameWidth: 1920,
              frameHeight: 1080,
              qualityLimitationReason: 'none',
            }
          : {
              id: 'vid',
              type: 'inbound-rtp',
              kind: 'video',
              mid: '1',
              trackIdentifier: trackRef()?.id,
              timestamp: step * 2000,
              packetsReceived: step * 120,
              packetsLost: 0,
              bytesReceived: step * 100000,
              framesReceived: step * 60,
              framesDecoded: step * 60,
              framesDropped: 0,
              freezeCount: 0,
              totalFreezesDuration: 0,
              pliCount: 0,
              totalDecodeTime: step * 0.1,
              jitterBufferDelay: step * 1,
              jitterBufferEmittedCount: step * 60,
              frameWidth: 1920,
              frameHeight: 1080,
            };
      m.set('vid', { ...base, ...overrides(step) });
      p.report = m;
    };
    return p;
  };

  // Static desktop: 0 encoded frames, track live/unmuted, 0 PLI, 0 drops, 0 freezes -> NOT a freeze.
  const staticPc = makeVideoPc('outbound', (s) => ({
    framesEncoded: 60,
    framesSent: 60,
    packetsSent: 120 + s,
    bytesSent: 100000 + s * 60,
  }));
  h.connections.set('sfu:screen', staticPc);
  staticPc.next();
  await h.telemetry.collect();
  staticPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.freezes.length, 0);
  h.connections.clear();
  h.telemetry.reset();

  // 1. capture-interrupted, 2. encoder-stalled, 3. send-stalled, 4. transport-congestion (outbound)
  let outMode = 'healthy';
  let frozenOut = { encoded: 60, sent: 60, packets: 120, bytes: 100000 };
  const outPc = makeVideoPc('outbound', (s) => {
    if (outMode === 'healthy') {
      frozenOut = { encoded: s * 60, sent: s * 60, packets: s * 120, bytes: s * 100000 };
      return {};
    }
    if (outMode === 'capture')
      return {
        framesEncoded: frozenOut.encoded,
        framesSent: frozenOut.sent,
        packetsSent: frozenOut.packets,
        bytesSent: frozenOut.bytes,
      };
    if (outMode === 'encoder')
      return {
        framesEncoded: frozenOut.encoded,
        framesSent: frozenOut.sent,
        packetsSent: frozenOut.packets,
        bytesSent: frozenOut.bytes,
        pliCount: s,
      };
    if (outMode === 'send') {
      frozenOut.encoded += 60;
      return {
        framesEncoded: frozenOut.encoded,
        framesSent: frozenOut.sent,
        packetsSent: frozenOut.packets,
        bytesSent: frozenOut.bytes,
      };
    }
    if (outMode === 'congestion') {
      frozenOut.encoded += 60;
      frozenOut.packets += 10;
      return {
        framesEncoded: frozenOut.encoded,
        framesSent: frozenOut.sent,
        packetsSent: frozenOut.packets,
        bytesSent: frozenOut.bytes,
        retransmittedPacketsSent: s * 25,
        qualityLimitationReason: 'bandwidth',
      };
    }
    return {};
  });
  h.connections.set('sfu:screen', outPc);
  outPc.next();
  await h.telemetry.collect();

  screenTrack = { ...screenTrack, muted: true };
  outMode = 'capture';
  outPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, 'capture-interrupted');

  screenTrack = { ...screenTrack, muted: false };
  outMode = 'healthy';
  outPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.freezes.at(-1).recovered, true);

  outMode = 'encoder';
  outPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, 'encoder-stalled');

  outMode = 'send';
  outPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, 'send-stalled');

  outMode = 'congestion';
  outPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, 'transport-congestion');

  h.connections.clear();
  h.telemetry.reset();

  // 5. sfu-forwarding-stalled, 6. subscription-interrupted, 7. receiver-not-decoding, 8. presentation-frozen, and null on insufficient evidence
  let inMode = 'healthy';
  let frozenIn = { packets: 120, bytes: 100000, received: 60, decoded: 60 };
  const inPc = makeVideoPc('inbound', (s) => {
    if (inMode === 'no-decode') {
      frozenIn.packets += 120;
      frozenIn.bytes += 100000;
      frozenIn.received += 10;
      return {
        packetsReceived: frozenIn.packets,
        bytesReceived: frozenIn.bytes,
        framesDecoded: frozenIn.decoded,
        framesReceived: frozenIn.received,
        pliCount: s,
      };
    }
    if (inMode === 'sfu-stall')
      return {
        packetsReceived: frozenIn.packets,
        bytesReceived: frozenIn.bytes,
        framesReceived: frozenIn.received,
        framesDecoded: frozenIn.decoded,
        pliCount: s,
      };
    if (inMode === 'sub-drop')
      return {
        packetsReceived: frozenIn.packets,
        bytesReceived: frozenIn.bytes,
        framesReceived: frozenIn.received,
        framesDecoded: frozenIn.decoded,
      };
    if (inMode === 'presentation') {
      frozenIn.packets += 120;
      frozenIn.bytes += 100000;
      frozenIn.received += 60;
      frozenIn.decoded += 60;
      return {
        packetsReceived: frozenIn.packets,
        bytesReceived: frozenIn.bytes,
        framesReceived: frozenIn.received,
        framesDecoded: frozenIn.decoded,
        freezeCount: s,
        totalFreezesDuration: s * 0.4,
      };
    }
    if (inMode === 'ambiguous') {
      return {
        packetsReceived: undefined,
        bytesReceived: undefined,
        framesReceived: undefined,
        framesDecoded: undefined,
        freezeCount: s,
        totalFreezesDuration: s * 0.4,
      };
    }
    frozenIn = { packets: s * 120, bytes: s * 100000, received: s * 60, decoded: s * 60 };
    return {};
  });
  h.connections.set('sfu:peer-1:screen', inPc);
  inPc.next();
  await h.telemetry.collect();

  inMode = 'no-decode';
  inPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, 'receiver-not-decoding');

  inMode = 'sfu-stall';
  rxTrack = { ...rxTrack, muted: true };
  inPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, 'sfu-forwarding-stalled');

  rxTrack = { ...rxTrack, muted: false, readyState: 'ended' };
  inMode = 'sub-drop';
  inPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, 'subscription-interrupted');

  rxTrack = { ...rxTrack, readyState: 'live' };
  inMode = 'presentation';
  inPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, 'presentation-frozen');

  inMode = 'ambiguous';
  inPc.next();
  await h.telemetry.collect();
  assert.equal(h.telemetry.getSnapshot().telemetry.streams[0].cause, null);
});

test('telemetry collects specialized per-layer screen share metrics (rid, codecProfile, targetBitrate, avgQp, limitation durations, pauses and jitter)', async (t) => {
  const h = await setup(t);
  const pubPc = peer();
  const subPc = peer();
  h.connections.set('sfu-pub:screen', pubPc);
  h.connections.set('sfu-sub:peer-1:screen', subPc);

  const pubReport = (n) =>
    new Map([
      [
        'codec-vp9',
        {
          id: 'codec-vp9',
          type: 'codec',
          mimeType: 'video/VP9',
          sdpFmtpLine: 'profile-id=0;x-google-start-bitrate=2000;secret-param=ignore',
        },
      ],
      [
        'pair',
        {
          id: 'pair',
          type: 'candidate-pair',
          state: 'succeeded',
          nominated: true,
          currentRoundTripTime: 0.054,
          availableOutgoingBitrate: 11_500_000,
        },
      ],
      [
        'tx-f',
        {
          id: 'tx-f',
          type: 'outbound-rtp',
          kind: 'video',
          mid: '0',
          rid: 'f',
          codecId: 'codec-vp9',
          active: true,
          scalabilityMode: 'L1T2',
          encoderImplementation: 'libvpx',
          powerEfficientEncoder: false,
          timestamp: n * 2000,
          frameWidth: 1920,
          frameHeight: 1080,
          framesPerSecond: 60,
          framesEncoded: n * 120,
          framesSent: n * 120,
          packetsSent: n * 1600,
          bytesSent: n * 2_000_000,
          retransmittedPacketsSent: n * 2,
          totalEncodeTime: n * 0.96,
          totalPacketSendDelay: n * 0.8,
          qpSum: n * 2400,
          targetBitrate: 8_000_000,
          qualityLimitationReason: 'none',
          qualityLimitationResolutionChanges: 1,
          qualityLimitationDurations: { none: 18.5, cpu: 0.5, bandwidth: 1.0, other: 0 },
          nackCount: n,
          pliCount: 0,
          firCount: 0,
          keyFramesEncoded: n,
        },
      ],
      [
        'tx-h',
        {
          id: 'tx-h',
          type: 'outbound-rtp',
          kind: 'video',
          mid: '0',
          rid: 'h',
          codecId: 'codec-vp9',
          active: true,
          encoderImplementation: 'libvpx',
          powerEfficientEncoder: false,
          timestamp: n * 2000,
          frameWidth: 1280,
          frameHeight: 720,
          framesPerSecond: 30,
          framesEncoded: n * 60,
          framesSent: n * 60,
          packetsSent: n * 500,
          bytesSent: n * 600_000,
          retransmittedPacketsSent: 0,
          totalEncodeTime: n * 0.24,
          totalPacketSendDelay: 0,
          qpSum: n * 1320,
          targetBitrate: 2_800_000,
          qualityLimitationReason: 'bandwidth',
          qualityLimitationResolutionChanges: 0,
          qualityLimitationDurations: { none: 15, cpu: 0, bandwidth: 5, other: 0 },
          nackCount: 0,
          pliCount: 0,
          firCount: 0,
          keyFramesEncoded: n,
        },
      ],
    ]);

  const subReport = (n) =>
    new Map([
      [
        'codec-h264',
        {
          id: 'codec-h264',
          type: 'codec',
          mimeType: 'video/H264',
          sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640032',
        },
      ],
      [
        'rx-screen',
        {
          id: 'rx-screen',
          type: 'inbound-rtp',
          kind: 'video',
          mid: '0',
          codecId: 'codec-h264',
          decoderImplementation: 'MediaCodecVideoDecoder',
          powerEfficientDecoder: true,
          timestamp: n * 2000,
          frameWidth: 1280,
          frameHeight: 720,
          framesPerSecond: 30,
          framesReceived: n * 60,
          framesDecoded: n * 60,
          framesDropped: n,
          packetsReceived: n * 480,
          packetsLost: n * 2,
          bytesReceived: n * 550_000,
          totalDecodeTime: n * 0.36,
          jitterBufferDelay: n * 1.8,
          jitterBufferMinimumDelay: n * 0.9,
          jitterBufferEmittedCount: n * 60,
          jitter: 0.014,
          qpSum: n * 1500,
          freezeCount: n,
          totalFreezesDuration: n * 0.3,
          pauseCount: n,
          totalPausesDuration: n * 0.5,
          nackCount: n * 2,
          pliCount: n,
          firCount: 0,
          keyFramesDecoded: n,
        },
      ],
    ]);

  pubPc.report = pubReport(1);
  subPc.report = subReport(1);
  await h.telemetry.collect();
  pubPc.report = pubReport(2);
  subPc.report = subReport(2);
  await h.telemetry.collect();

  const snap = h.telemetry.getSnapshot().telemetry;
  assert.equal(snap.availableOutgoingBitrate, 11_500_000);
  const fLayer = snap.streams.find((s) => s.direction === 'outbound' && s.rid === 'f');
  const hLayer = snap.streams.find((s) => s.direction === 'outbound' && s.rid === 'h');
  const rxLayer = snap.streams.find((s) => s.direction === 'inbound');

  assert.ok(fLayer && hLayer && rxLayer);
  assert.equal(fLayer.codecProfile, 'profile-id=0');
  assert.equal(fLayer.active, true);
  assert.equal(fLayer.scalabilityMode, 'L1T2');
  assert.equal(fLayer.targetBitrateBps, 8_000_000);
  assert.equal(fLayer.avgQp, 20);
  assert.equal(fLayer.limiter, 'none');
  assert.equal(fLayer.resolutionChanges, 1);
  assert.deepEqual(fLayer.limitationDurationsMs, {
    none: 18500,
    cpu: 500,
    bandwidth: 1000,
    other: 0,
  });
  assert.equal(fLayer.framesEncoded, 120);
  assert.equal(fLayer.framesSent, 120);

  assert.equal(hLayer.targetBitrateBps, 2_800_000);
  assert.equal(hLayer.avgQp, 22);
  assert.equal(hLayer.limiter, 'bandwidth');

  assert.equal(rxLayer.codecProfile, 'packetization-mode=1;profile-level-id=640032');
  assert.equal(rxLayer.avgQp, 25);
  assert.equal(rxLayer.jitterMs, 14);
  assert.equal(rxLayer.droppedFrames, 1);
  assert.equal(rxLayer.freezeMs, 300);
  assert.equal(rxLayer.pauseCount, 1);
  assert.equal(rxLayer.pauseMs, 500);
});

test('diagnosticReport adds specialized screenShare telemetry without removing call telemetry and strips private identifiers', async () => {
  const { diagnosticReport } = await import('../src/lib/voice/diagnostic-report.ts');
  const report = JSON.parse(
    diagnosticReport({
      version: '2.3.3',
      platform: 'Windows',
      call: {
        joined: true,
        muted: false,
        deafened: false,
        camera: true,
        screen: true,
        transport: 'sfu',
        playback: 'Reproduzindo direto',
      },
      processing: 'rnnoise',
      adaptation: 'qualidade escolhida',
      telemetry: {
        rttMs: 54,
        uploadBps: 10_400_000,
        downloadBps: 2_200_000,
        availableOutgoingBitrate: 12_000_000,
        retransmittedPct: 0.12,
        audioLossPct: 0,
        audioJitterMs: 8,
        concealedPct: 0,
        jitterBufferMs: 60,
        eventLoopLagMs: 0.4,
        lossPct: 0.1,
        jitterMs: 10,
        outFps: 60,
        inFps: 30,
        outW: 1920,
        outH: 1080,
        inW: 1280,
        inH: 720,
        pcState: 'connected',
        iceRoute: 'STUN / srflx',
        limiter: 'none',
        streams: [
          {
            streamKey: 'sfu-pub:camera:cam1',
            pcKey: 'sfu-pub:camera',
            direction: 'outbound',
            mid: '0',
            rid: 'f',
            trackId: 'cam-secret-track',
            pcState: 'connected',
            iceState: 'connected',
            width: 1280,
            height: 720,
            fps: 30,
            bitrateBps: 1_500_000,
            codec: 'video/VP8',
            implementation: 'libvpx',
            hardwareAccelerated: false,
            stalled: false,
            stallMs: 0,
            cause: null,
          },
          {
            streamKey: 'sfu-pub:screen:scr-f',
            pcKey: 'sfu-pub:screen',
            direction: 'outbound',
            mid: '0',
            rid: 'f',
            trackId: 'screen-secret-track',
            pcState: 'connected',
            iceState: 'connected',
            width: 1920,
            height: 1080,
            fps: 60,
            bitrateBps: 8_000_000,
            targetBitrateBps: 8_000_000,
            encodeMs: 7.5,
            sendDelayMs: 0.5,
            avgQp: 19,
            limiter: 'none',
            resolutionChanges: 0,
            limitationDurationsMs: { none: 20000, cpu: 0, bandwidth: 0, other: 0 },
            active: true,
            scalabilityMode: null,
            codec: 'video/VP9',
            codecProfile: 'profile-id=0',
            implementation: 'libvpx',
            hardwareAccelerated: false,
            framesEncoded: 120,
            framesSent: 120,
            packetsDelta: 1500,
            retransmittedPackets: 1,
            nackCount: 0,
            pliCount: 0,
            firCount: 0,
            keyFrames: 1,
            stalled: false,
            stallMs: 0,
            cause: null,
          },
          {
            streamKey: 'sfu-sub:secret-peer-id:screen:rx1',
            pcKey: 'sfu-sub:secret-peer-id:screen',
            direction: 'inbound',
            mid: '0',
            rid: null,
            trackId: 'rx-secret-track',
            pcState: 'connected',
            iceState: 'connected',
            width: 1280,
            height: 720,
            fps: 30,
            bitrateBps: 2_400_000,
            decodeMs: 4.2,
            bufferMs: 38,
            minBufferMs: 18,
            jitterMs: 11,
            lossPct: 0,
            avgQp: 24,
            framesReceived: 60,
            framesDecoded: 60,
            droppedFrames: 0,
            freezeCount: 0,
            freezeMs: 0,
            pauseCount: 0,
            pauseMs: 0,
            packetsDelta: 480,
            packetsLost: 0,
            nackCount: 0,
            pliCount: 0,
            firCount: 0,
            keyFrames: 1,
            codec: 'video/VP9',
            codecProfile: 'profile-id=0',
            implementation: 'MediaCodecVideoDecoder',
            hardwareAccelerated: true,
            stalled: false,
            stallMs: 0,
            cause: null,
          },
        ],
        freezes: [
          {
            streamKey: 'sfu-pub:camera:cam1',
            pcKey: 'sfu-pub:camera',
            direction: 'outbound',
            mid: '0',
            rid: 'f',
            trackId: 'cam-secret-track',
            startedAt: 1000,
            endedAt: 2000,
            durationMs: 1000,
            recovered: true,
            cause: 'encoder-stalled',
          },
          {
            streamKey: 'sfu-sub:secret-peer-id:screen:rx1',
            pcKey: 'sfu-sub:secret-peer-id:screen',
            direction: 'inbound',
            mid: '0',
            rid: 'h',
            trackId: 'rx-secret-track',
            startedAt: 3000,
            endedAt: 4200,
            durationMs: 1200,
            recovered: true,
            cause: 'presentation-frozen',
          },
        ],
      },
      screenShare: {
        config: {
          format: '1080-60',
          targetWidth: 1920,
          targetHeight: 1080,
          targetFps: 60,
          targetBitrateBps: 8_000_000,
          contentHint: 'motion',
          requestedCodec: 'auto',
          autoDetectedCodec: 'vp9',
          autoHardwareConfirmed: false,
          adaptiveEnabled: true,
          adaptationLevel: 0,
          adaptationReason: null,
          mobileViewer: false,
        },
        capture: {
          width: 1920,
          height: 1080,
          fps: 60,
          displaySurface: 'monitor',
          contentHint: 'motion',
          degradationPreference: 'balanced',
          publishedRids: ['f', 'h'],
          encodings: [
            {
              rid: 'f',
              active: true,
              scaleResolutionDownBy: 1,
              maxBitrate: 8_000_000,
              maxFramerate: 60,
            },
            {
              rid: 'h',
              active: true,
              scaleResolutionDownBy: 1.5,
              maxBitrate: 2_800_000,
              maxFramerate: 30,
            },
          ],
          windowTitle: 'Private Secret Window Title',
        },
        localTrackId: 'screen-secret-track',
        subscriptions: [
          {
            pcKey: 'sfu-sub:secret-peer-id:screen',
            requestedRid: 'h',
            negotiatedRid: 'h',
            availableRids: ['f', 'h'],
            peerName: 'Secret User Name',
          },
        ],
      },
    }),
  );

  // Existing call telemetry stays intact
  assert.equal(report.call.joined, true);
  assert.equal(report.metrics.rttMs, 54);
  assert.equal(report.streams.length, 3);
  assert.equal(report.freezes.length, 2);

  // Specialized screenShare section includes only screen streams/freezes and full tuning metrics
  assert.ok(report.screenShare);
  assert.equal(report.screenShare.config.format, '1080-60');
  assert.equal(report.screenShare.config.requestedCodec, 'auto');
  assert.equal(report.screenShare.config.autoDetectedCodec, 'vp9');
  assert.equal(report.screenShare.bwe.availableOutgoingBps, 12_000_000);
  assert.equal(report.screenShare.bwe.retransmittedPct, 0.12);
  assert.equal(report.screenShare.capture.degradationPreference, 'balanced');
  assert.deepEqual(report.screenShare.capture.publishedRids, ['f', 'h']);
  assert.equal(report.screenShare.capture.encodings.length, 2);

  // Camera stream must be excluded from screenShare.outbound and screenShare.freezes
  assert.equal(report.screenShare.outbound.length, 1);
  assert.equal(report.screenShare.outbound[0].rid, 'f');
  assert.equal(report.screenShare.outbound[0].evenDimensions, true);
  assert.equal(report.screenShare.outbound[0].codecProfile, 'profile-id=0');
  assert.equal(report.screenShare.outbound[0].avgQp, 19);
  assert.equal(report.screenShare.outbound[0].targetBitrateBps, 8_000_000);

  assert.equal(report.screenShare.inbound.length, 1);
  assert.equal(report.screenShare.inbound[0].viewerIndex, 1);
  assert.equal(report.screenShare.inbound[0].requestedRid, 'h');
  assert.equal(report.screenShare.inbound[0].negotiatedRid, 'h');
  assert.deepEqual(report.screenShare.inbound[0].availableRids, ['f', 'h']);
  assert.equal(report.screenShare.inbound[0].jitterMs, 11);

  assert.equal(report.screenShare.freezes.length, 1);
  assert.equal(report.screenShare.freezes[0].rid, 'h');
  assert.equal(report.screenShare.freezes[0].cause, 'presentation-frozen');

  // Strict privacy: zero private identifiers in serialized output
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('Secret'), false);
  assert.equal(serialized.includes('Private'), false);
});
