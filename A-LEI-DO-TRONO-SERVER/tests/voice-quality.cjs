'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/quality.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const gate = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function fixture(stored = {}, overrides = {}) {
  const { createCallQuality } = await modulePromise;
  const values = new Map(Object.entries(stored)),
    writes = [],
    warnings = [],
    layers = [],
    senders = [],
    subscriptions = [];
  const call = { joined: true, generation: 1 },
    policy = { sfu: false };
  const quality = createCallQuality({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        writes.push([key, value]);
        values.set(key, value);
      },
    },
    call: () => call,
    policy: () => policy,
    refreshCamera: async () => {},
    refreshScreenHint() {},
    senders: () => senders,
    subscriptions: () => subscriptions,
    setLayer: async (...args) => {
      layers.push(args);
    },
    warn: (error) => warnings.push(error),
    ...overrides,
  });
  return { quality, values, writes, warnings, layers, senders, subscriptions, call, policy };
}
function sender(encodings = [{}], source = { width: 1920, height: 1080 }) {
  const applied = [];
  return {
    track: { getSettings: () => source },
    getParameters: () => ({ encodings: structuredClone(encodings) }),
    setParameters: async (parameters) => {
      applied.push(parameters);
    },
    applied,
  };
}
function reduce(quality) {
  quality.sample({ limiter: 'cpu' }, 0);
  assert.equal(quality.sample({ limiter: 'cpu' }, 12000), true);
}

test('invalid persisted preferences fall back; snapshots and nested profiles are immutable and stable', async () => {
  const { quality } = await fixture({
    tronoTransmissionQuality: '__proto__',
    mnScreenFormat: 'constructor',
    mnScreenBitrate: 'NaN',
  });
  const snapshot = quality.getSnapshot();
  assert.equal(snapshot.preferences.transmissionQuality, 'balanced');
  assert.equal(snapshot.preferences.screenFormat, '720-30');
  assert.equal(snapshot.screenBitrate, 8000000);
  assert.equal(snapshot, quality.getSnapshot());
  assert.throws(() => (snapshot.profile.screen.fps = 5), TypeError);
  assert.throws(() => (snapshot.preferences.adaptiveEnabled = false), TypeError);
});
test('selected 1080p60 survives adaptation and recovery; audio and stored preferences stay unchanged', async () => {
  const { quality, writes } = await fixture({
    mnScreenFormat: '1080-60',
    mnScreenBitrate: '10',
    tronoTransmissionQuality: 'high',
  });
  reduce(quality);
  assert.equal(quality.getSnapshot().profile.screen.fps, 30);
  assert.equal(quality.getSnapshot().profile.audioBitrate, 128000);
  assert.equal(quality.getSnapshot().profile.screenBitrate, 4000000);
  assert.equal(quality.getSnapshot().screenBitrate, 10000000);
  assert.equal(quality.getSnapshot().preferences.screenFormat, '1080-60');
  assert.equal(quality.sample({ limiter: 'cpu' }, 32000), true);
  assert.equal(quality.getSnapshot().profile.screen.fps, 15);
  quality.sample({}, 33000);
  assert.equal(quality.sample({}, 93000), true);
  assert.equal(quality.sample({}, 153000), true);
  assert.equal(quality.getSnapshot().profile.screen.fps, 60);
  assert.deepEqual(writes, []);
});
test('SFU budget caps effective profiles while P2P retains selected quality and bitrate', async () => {
  const { quality, policy } = await fixture({
    tronoTransmissionQuality: 'high',
    mnScreenBitrate: '15',
  });
  Object.assign(policy, { maxQuality: 'economy', highAllowed: false });
  assert.equal(quality.getSnapshot().effectiveQuality, 'high');
  assert.equal(quality.getSnapshot().screenBitrate, 15000000);
  policy.sfu = true;
  assert.equal(quality.getSnapshot().effectiveQuality, 'economy');
  assert.equal(quality.getSnapshot().screenBitrate, 6000000);
  assert.equal(quality.getSnapshot().preferences.transmissionQuality, 'high');
  assert.equal(quality.selectQuality('high'), true);
  assert.equal(quality.getSnapshot().preferences.transmissionQuality, 'economy');
});
test('only valid preferences are persisted and disabling adaptation restores the chosen format', async () => {
  const { quality, values, writes } = await fixture({ mnScreenFormat: '1080-60' });
  quality.configure({
    screenFormat: '__proto__',
    screenBitrateMbps: 999,
    transmissionQuality: 'invalid',
    screenContent: 'invalid',
  });
  assert.deepEqual(writes, []);
  reduce(quality);
  quality.configure({ adaptiveEnabled: false, screenContent: 'motion', screenBitrateMbps: 12 });
  assert.equal(values.get('mnAdaptiveQuality'), '0');
  assert.equal(values.get('mnScreenContent'), 'motion');
  assert.equal(values.get('mnScreenBitrate'), '12');
  assert.equal(quality.getSnapshot().profile.screen.fps, 60);
  quality.sample({ limiter: 'cpu' }, 15000);
  quality.sample({ limiter: 'cpu' }, 50000);
  assert.equal(quality.getSnapshot().adaptation.level, 0);
});
test('screen encoders preserve 60 FPS at full RID, resolution priority and the original source', async () => {
  const { quality } = await fixture({
    mnScreenFormat: '1080-60',
    mnScreenBitrate: '10',
    mnScreenContent: 'motion',
  });
  const s = sender([{ rid: 'f' }, { rid: 'h' }, { rid: 'q' }], { width: 3840, height: 2160 });
  s.track.applyConstraints = () => {
    throw new Error('Screen source must not be recaptured or constrained');
  };
  await quality.applySender(s, 'screen');
  assert.equal(s.track.contentHint, 'motion');
  assert.equal(s.applied[0].degradationPreference, 'maintain-resolution');
  assert.deepEqual(s.applied[0].encodings, [
    { rid: 'f', scaleResolutionDownBy: 2, maxBitrate: 10000000, maxFramerate: 60 },
    { rid: 'h', scaleResolutionDownBy: 4, maxBitrate: 4200000, maxFramerate: 30 },
    { rid: 'q', scaleResolutionDownBy: 8, maxBitrate: 1800000, maxFramerate: 20 },
  ]);
});
test('microphone and application audio budgets survive both adaptation levels', async () => {
  const { quality } = await fixture();
  const mic = sender(),
    screenAudio = sender();
  reduce(quality);
  quality.sample({ limiter: 'cpu' }, 32000);
  await quality.applySender(mic, 'audio');
  await quality.applySender(screenAudio, 'screen-audio');
  assert.equal(mic.applied[0].encodings[0].maxBitrate, 96000);
  assert.equal(screenAudio.applied[0].encodings[0].maxBitrate, 192000);
});
test('camera retains existing simulcast bitrate floors and adapted FPS for all RIDs', async () => {
  const { quality } = await fixture();
  reduce(quality);
  quality.sample({ limiter: 'cpu' }, 32000);
  const s = sender([{ rid: 'f' }, { rid: 'h' }, { rid: 'q' }]);
  await quality.applySender(s, 'camera');
  assert.deepEqual(s.applied[0].encodings, [
    { rid: 'f', maxBitrate: 450000, maxFramerate: 15 },
    { rid: 'h', maxBitrate: 189000, maxFramerate: 15 },
    { rid: 'q', maxBitrate: 90000, maxFramerate: 15 },
  ]);
});
test('native parameter transactions serialize per sender and read the latest profile on execution', async () => {
  const { quality, warnings } = await fixture();
  const blocked = gate(),
    s = sender();
  let reads = 0;
  s.getParameters = () => {
    reads++;
    return { encodings: [{}] };
  };
  s.setParameters = async (p) => {
    s.applied.push(p);
    if (s.applied.length === 1) {
      await blocked.promise;
      throw new Error('Native transaction failed');
    }
  };
  const first = quality.applySender(s, 'camera');
  await tick();
  const second = quality.applySender(s, 'camera');
  quality.configure({ transmissionQuality: 'high' });
  await tick();
  assert.equal(reads, 1);
  blocked.resolve();
  await Promise.all([first, second]);
  assert.equal(s.applied[1].encodings[0].maxBitrate, 3500000);
  assert.equal(warnings.length, 1);
});
test('different senders can progress independently', async () => {
  const { quality } = await fixture();
  const blocked = gate(),
    a = sender(),
    b = sender();
  a.setParameters = () => blocked.promise;
  const job = quality.applySender(a, 'audio');
  await quality.applySender(b, 'audio');
  assert.equal(b.applied.length, 1);
  blocked.resolve();
  await job;
});
test('queued parameters from a departed call cannot enter a later generation', async () => {
  const { quality, call, warnings } = await fixture();
  const blocked = gate(),
    s = sender();
  s.setParameters = async (p) => {
    s.applied.push(p);
    await blocked.promise;
    throw new Error('Old call');
  };
  const first = quality.applySender(s, 'audio');
  await tick();
  const queued = quality.applySender(s, 'audio');
  call.generation++;
  quality.reset();
  blocked.resolve();
  await Promise.all([first, queued]);
  assert.equal(s.applied.length, 1);
  assert.deepEqual(warnings, []);
});
test('leaving during camera refresh skips parameters, screen hints and layers', async () => {
  const blocked = gate();
  let hints = 0;
  const { quality, call, policy, senders, subscriptions, layers } = await fixture(
    {},
    { refreshCamera: () => blocked.promise, refreshScreenHint: () => hints++ },
  );
  policy.sfu = true;
  const s = sender();
  senders.push({ sender: s, kind: 'screen' });
  subscriptions.push({ key: 'remote', kind: 'screen' });
  const job = quality.applyAll();
  call.generation++;
  blocked.resolve();
  await job;
  assert.equal(hints, 0);
  assert.deepEqual(s.applied, []);
  assert.deepEqual(layers, []);
});
test('one media failure does not block other senders or subscription layers', async () => {
  const { quality, policy, senders, subscriptions, layers, warnings } = await fixture(
    {},
    {
      refreshCamera: async () => {
        throw new Error('Camera unavailable');
      },
    },
  );
  policy.sfu = true;
  const mic = sender();
  senders.push({ sender: mic, kind: 'audio' });
  subscriptions.push(
    { key: 'camera', kind: 'camera' },
    { key: 'screen', kind: 'screen' },
    { key: 'audio', kind: 'audio' },
  );
  await quality.applyAll();
  assert.equal(mic.applied.length, 1);
  assert.equal(warnings.length, 1);
  assert.deepEqual(layers, [
    ['camera', 'f'],
    ['screen', 'f'],
  ]);
});
test('preferred layers honor economy, maximization and sustained adaptation; P2P does not request SFU layers', async () => {
  const { quality, subscriptions, layers } = await fixture({ tronoTransmissionQuality: 'economy' });
  subscriptions.push({ key: 'screen', kind: 'screen' });
  await quality.applyLayers();
  assert.deepEqual(layers, []);
  assert.equal(quality.preferredRid('screen'), 'q');
  assert.equal(quality.preferredRid('screen', true), 'f');
  reduce(quality);
  assert.equal(quality.preferredRid('screen', true), 'h');
  quality.sample({ limiter: 'cpu' }, 32000);
  assert.equal(quality.preferredRid('camera', true), 'q');
});
