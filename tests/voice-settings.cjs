'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/settings.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function gate() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function setup(t) {
  const { createVoiceSettings } = await modulePromise;
  const { createCallQuality } = await import('../src/lib/voice/quality.ts');
  const data = {
    selectedInput: '',
    selectedCamera: '',
    microphoneVolume: 100,
    noiseSuppression: true,
    noiseEngine: 'native',
  };
  const state = {
    generation: 1,
    output: '',
    volume: 100,
    audio: true,
    sfu: false,
    highAllowed: true,
  };
  const events = [],
    devices = new EventTarget(),
    storage = new Map();
  devices.enumerateDevices = async () => [];
  const quality = createCallQuality({
    storage: { getItem: () => null, setItem: (key, value) => storage.set(key, value) },
    policy: () => ({
      sfu: state.sfu,
      highAllowed: state.highAllowed,
      maxQuality: state.highAllowed ? 'high' : 'balanced',
    }),
    call: () => ({ joined: true, generation: state.generation }),
    refreshCamera: async () => {},
    refreshScreenHint() {},
    senders: () => [],
    subscriptions: () => [],
    setLayer: async () => {},
  });
  const options = {
    controls: {
      getSnapshot: () => ({ ...data }),
      noiseState: () => ({ requested: true, mode: 'idle', sampleRate: null }),
      selectInput: async (id) => {
        data.selectedInput = id;
        events.push(['input', id]);
      },
      selectCamera: async (id) => {
        data.selectedCamera = id;
        events.push(['camera', id]);
      },
      setNoiseMode: async (mode) => {
        data.noiseEngine = mode;
        events.push(['noise', mode]);
      },
      toggleNoiseSuppression: async () => {
        data.noiseSuppression = !data.noiseSuppression;
      },
      toggleVoiceLightMode: async () => {},
      setMicrophoneGain: async (value) => {
        data.microphoneVolume = Number(value);
        events.push(['gain', value]);
      },
      reconcileDevices: (inputs, cameras, observed) =>
        events.push(['reconcile', inputs, cameras, observed]),
    },
    microphone: { getSnapshot: () => ({ loading: false }) },
    camera: { getSnapshot: () => ({ loading: false }) },
    playback: {
      getSnapshot: () => ({ output: state.output, volume: state.volume }),
      setVolume: (value) => {
        state.volume = Number(value);
        events.push(['volume', value]);
      },
      setOutput: async (value) => {
        state.output = value;
        events.push(['output', value]);
        return true;
      },
    },
    sharing: {
      getSnapshot: () => ({ audio: state.audio }),
      setAudio: (value) => {
        state.audio = value;
      },
    },
    quality,
    storage: { setItem: (key, value) => storage.set(key, value) },
    mediaDevices: devices,
    outputSupported: true,
    call: () => state,
    policy: () => state,
    unlockAudio: () => events.push(['unlock']),
    announce: () => events.push(['announce']),
    onOutputChanged: () => events.push(['output-changed']),
    setScreenBitrate: async (value) => events.push(['bitrate', value]),
    onStatus: (...args) => events.push(['status', ...args]),
    warn: (error) => events.push(['warn', error]),
  };
  const client = createVoiceSettings(options);
  t.after(client.dispose);
  return { client, options, data, state, devices, quality, storage, events };
}
test('React receives a stable frozen snapshot until existing owners refresh it', async (t) => {
  const h = await setup(t),
    initial = h.client.getSnapshot(),
    seen = [];
  assert(Object.isFrozen(initial));
  assert.strictEqual(h.client.getSnapshot(), initial);
  const remove = h.client.subscribe(() => seen.push(h.client.getSnapshot()));
  h.data.selectedInput = 'new';
  h.client.refresh();
  assert.equal(seen.at(-1).controls.selectedInput, 'new');
  assert.equal(initial.controls.selectedInput, '');
  remove();
  h.client.refresh();
  assert.equal(seen.length, 1);
});
test('only the latest enumeration replaces the catalog; labels remain plain data', async (t) => {
  const h = await setup(t),
    first = gate(),
    second = gate();
  let requests = 0;
  h.devices.enumerateDevices = () => (++requests === 1 ? first.promise : second.promise);
  const old = h.client.enumerate(),
    current = h.client.enumerate();
  second.resolve([{ kind: 'audioinput', deviceId: 'latest', label: '<b>Microfone</b>' }]);
  await current;
  first.resolve([{ kind: 'audioinput', deviceId: 'old', label: 'Old' }]);
  await old;
  assert.deepEqual(h.client.getSnapshot().devices.input, [
    { id: 'latest', label: '<b>Microfone</b>' },
  ]);
  assert.equal(h.events.filter((e) => e[0] === 'reconcile').length, 1);
});
test('enumeration passes the observed preferences to the reconciliation owner', async (t) => {
  const h = await setup(t),
    pending = gate();
  h.devices.enumerateDevices = () => pending.promise;
  h.data.selectedInput = 'before';
  const job = h.client.enumerate();
  h.data.selectedInput = 'after';
  pending.resolve([]);
  await job;
  assert.equal(h.events.find((e) => e[0] === 'reconcile')[3].selectedInput, 'before');
  assert.equal(h.client.getSnapshot().controls.selectedInput, 'after');
});
test('missing output falls back through playback, but an older enumeration cannot reset a new choice', async (t) => {
  const h = await setup(t);
  h.state.output = 'gone';
  await h.client.enumerate();
  assert.equal(h.state.output, '');
  assert.equal(h.storage.get('tronoVoiceOutput'), '');
  const pending = gate();
  h.devices.enumerateDevices = () => pending.promise;
  const job = h.client.enumerate();
  h.state.output = 'chosen-later';
  pending.resolve([]);
  await job;
  assert.equal(h.state.output, 'chosen-later');
});
test('devicechange has one listener; disposal ignores late catalogs and closes no borrowed media', async (t) => {
  const h = await setup(t);
  let calls = 0;
  h.devices.enumerateDevices = async () => {
    calls++;
    return [];
  };
  h.client.start();
  h.client.start();
  await tick();
  assert.equal(calls, 1);
  h.devices.dispatchEvent(new Event('devicechange'));
  await tick();
  assert.equal(calls, 2);
  const pending = gate();
  h.devices.enumerateDevices = () => pending.promise;
  const job = h.client.enumerate();
  const before = h.client.getSnapshot();
  h.client.dispose();
  pending.resolve([{ kind: 'videoinput', deviceId: 'late', label: 'Late' }]);
  await job;
  h.devices.dispatchEvent(new Event('devicechange'));
  assert.strictEqual(h.client.getSnapshot(), before);
});
test('input actions begin synchronously and update the projection before awaiting capture', async (t) => {
  const h = await setup(t),
    pending = gate();
  h.options.controls.selectInput = (id) => {
    h.data.selectedInput = id;
    return pending.promise;
  };
  const work = h.client.selectInput('new');
  assert.equal(h.client.getSnapshot().controls.selectedInput, 'new');
  pending.resolve();
  await work;
});
test('native input/change pairs do not apply microphone or output gain twice', async (t) => {
  const h = await setup(t);
  const work = h.client.setMicrophoneGain('180');
  await h.client.setMicrophoneGain('180');
  await work;
  await h.client.setOutputGain('150');
  await h.client.setOutputGain('150');
  assert.equal(h.events.filter((e) => e[0] === 'gain').length, 1);
  assert.equal(h.events.filter((e) => e[0] === 'volume').length, 1);
  assert.equal(h.events.filter((e) => e[0] === 'unlock').length, 1);
  assert.equal(h.storage.get('mnOutputGain'), '150');
});
test('format, content and shared audio preferences use existing owners without starting capture', async (t) => {
  const h = await setup(t);
  await h.client.selectFormat('1080-60');
  await h.client.selectContent('motion');
  h.client.setShareAudio(false);
  assert.equal(h.client.getSnapshot().quality.preferences.screenFormat, '1080-60');
  assert.equal(h.client.getSnapshot().quality.preferences.screenContent, 'motion');
  assert.equal(h.client.getSnapshot().shareAudio, false);
  await h.client.selectFormat('4k-120');
  assert.equal(h.quality.getSnapshot().preferences.screenFormat, '1080-60');
});
test('SFU restrictions are reflected and the backend receives the capped bitrate', async (t) => {
  const h = await setup(t);
  h.state.sfu = true;
  h.state.highAllowed = false;
  await h.client.selectQuality('high');
  await h.client.selectBitrate('10');
  assert.equal(h.client.getSnapshot().highLimited, true);
  assert.equal(h.quality.getSnapshot().preferences.transmissionQuality, 'balanced');
  assert.deepEqual(
    h.events.find((e) => e[0] === 'bitrate'),
    ['bitrate', 6000000],
  );
});
test('leaving during quality application prevents stale announcements', async (t) => {
  const h = await setup(t),
    pending = gate();
  h.options.quality.applyAll = () => pending.promise;
  const job = h.client.selectQuality('high');
  h.state.generation++;
  pending.resolve();
  await job;
  assert(!h.events.some((e) => e[0] === 'announce' || e[0] === 'status'));
});
test('a delayed bitrate response cannot overwrite status in the next call', async (t) => {
  const h = await setup(t),
    pending = gate();
  h.state.sfu = true;
  h.options.setScreenBitrate = () => pending.promise;
  const job = h.client.selectBitrate('8');
  await tick();
  h.state.generation++;
  pending.reject(new Error('Old error'));
  await job;
  assert(!h.events.some((e) => e[0] === 'status'));
});
