'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/controls.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup(t, stored = {}, overrides = {}) {
  const { createCallControls } = await modulePromise;
  const values = new Map(Object.entries(stored)),
    changes = [],
    statuses = [],
    muted = [],
    deafened = [],
    gains = [],
    warnings = [];
  const call = { joined: true, generation: 1 },
    mic = { capture: null, loading: false },
    camera = { capture: null, loading: false };
  const count = {
    acquire: 0,
    watch: 0,
    refresh: 0,
    camera: 0,
    stops: 0,
    joins: 0,
    unlocks: 0,
    announcements: 0,
    telemetry: 0,
  };
  let acquire = async () => {
      count.acquire++;
    },
    acquireCamera = async () => {
      count.camera++;
    },
    watch = async () => {
      count.watch++;
    },
    join = async () => {
      count.joins++;
      call.joined = true;
      return true;
    };
  const controls = createCallControls({
    desktop: true,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    call: () => call,
    join: () => join(),
    microphone: {
      getSnapshot: () => mic,
      acquire: () => acquire(),
      refresh: async () => {
        count.refresh++;
      },
      setMuted: (value) => muted.push(value),
      setGain: (value) => gains.push(value),
    },
    camera: {
      getSnapshot: () => camera,
      acquire: () => acquireCamera(),
      stop: () => {
        count.stops++;
        camera.capture = null;
      },
    },
    watchMicrophone: () => watch(),
    setDeafened: (value) => deafened.push(value),
    unlockAudio: () => count.unlocks++,
    announce: () => count.announcements++,
    restartTelemetry: () => count.telemetry++,
    isSfu: () => false,
    onChange: (change) => changes.push(change),
    onStatus: (...args) => statuses.push(args),
    warn: (error) => warnings.push(error),
    ...overrides,
  });
  t.after(controls.dispose);
  return {
    controls,
    values,
    changes,
    statuses,
    muted,
    deafened,
    gains,
    warnings,
    call,
    mic,
    camera,
    count,
    setAcquire(fn) {
      acquire = fn;
    },
    setCamera(fn) {
      acquireCamera = fn;
    },
    setWatch(fn) {
      watch = fn;
    },
    setJoin(fn) {
      join = fn;
    },
  };
}

test('desktop defaults and saved preferences are immutable; web retains RNNoise selection', async (t) => {
  const h = await setup(t, {
    mnDesktopNoiseMode: 'off',
    mnMicrophoneGain: '118',
    tronoVoiceInput: 'mic',
    tronoCameraInput: 'cam',
  });
  assert.equal(h.controls.getSnapshot().noiseSuppression, false);
  assert.equal(h.controls.getSnapshot().microphoneVolume, 120);
  assert.equal(h.controls.getSnapshot().selectedInput, 'mic');
  assert.equal(h.controls.getSnapshot(), h.controls.getSnapshot());
  assert.throws(() => (h.controls.getSnapshot().deafened = true), TypeError);
  const web = await setup(t, { mnDesktopNoiseMode: 'native' }, { desktop: false });
  assert.equal(web.controls.getSnapshot().noiseEngine, 'rnnoise');
  assert.equal(await web.controls.setNoiseMode('off'), false);
  const invalid = await setup(t, { mnDesktopNoiseMode: 'garbage', mnMicrophoneGain: 'bad' });
  assert.equal(invalid.controls.getSnapshot().noiseEngine, 'native');
  assert.equal(invalid.controls.getSnapshot().microphoneVolume, 0);
});
test('mute/deafen do not open devices and restore both previously open and muted microphone states', async (t) => {
  const h = await setup(t);
  h.controls.toggleDeafen();
  assert.equal(h.controls.getSnapshot().micMuted, true);
  assert.equal(h.controls.toggleMute(), false);
  h.controls.toggleDeafen();
  assert.equal(h.controls.getSnapshot().micMuted, false);
  h.controls.toggleMute();
  h.controls.toggleDeafen();
  h.controls.toggleDeafen();
  assert.equal(h.controls.getSnapshot().micMuted, true);
  assert.deepEqual(h.deafened, [true, false, true, false]);
  assert.equal(h.count.unlocks, 2);
  assert.equal(h.count.acquire, 0);
  assert.equal(h.count.announcements, 5);
});
test('call entry clears mute flags without cancelling an auto-join camera intent or touching borrowed tracks', async (t) => {
  const h = await setup(t);
  h.controls.toggleMute();
  h.controls.toggleDeafen();
  h.call.joined = false;
  const blocked = deferred();
  h.setJoin(() => blocked.promise);
  const job = h.controls.toggleCamera();
  h.controls.resetParticipation();
  assert.equal(h.controls.getSnapshot().deafened, false);
  assert.equal(h.controls.getSnapshot().micMuted, false);
  assert.equal(h.controls.getSnapshot().cameraTogglePending, true);
  h.call.joined = true;
  blocked.resolve(true);
  assert.equal(await job, true);
  assert.equal(h.count.camera, 1);
});
test('outside a call mute and deafen are ignored', async (t) => {
  const h = await setup(t);
  h.call.joined = false;
  assert.equal(h.controls.toggleMute(), false);
  assert.equal(h.controls.toggleDeafen(), false);
  assert.deepEqual(h.muted, []);
  assert.equal(h.count.announcements, 0);
});
test('microphone gain preserves five-point steps and refreshes the existing pipeline without recapture', async (t) => {
  const h = await setup(t);
  await h.controls.setMicrophoneGain(177);
  await h.controls.setMicrophoneGain(900);
  await h.controls.setMicrophoneGain(-4);
  assert.deepEqual(h.gains, [175, 300, 0]);
  assert.equal(h.values.get('mnMicrophoneGain'), '0');
  assert.equal(h.count.refresh, 3);
  assert.equal(h.count.acquire, 0);
});
test('RNNoise disables light mode and persists all processing preferences before capture', async (t) => {
  const h = await setup(t, { tronoVoiceLightMode: '1' });
  h.setAcquire(async () => {
    assert.equal(h.controls.getSnapshot().noiseEngine, 'rnnoise');
    assert.equal(h.values.get('tronoVoiceLightMode'), '0');
  });
  assert.equal(await h.controls.setNoiseMode('rnnoise'), true);
  assert.equal(h.controls.getSnapshot().voiceLightMode, false);
  assert.equal(h.count.watch, 1);
  assert.equal(h.count.telemetry, 1);
});
test('failed processing restores only its own fields and keeps unrelated mute/gain changes', async (t) => {
  const h = await setup(t),
    blocked = deferred();
  h.setAcquire(() => blocked.promise);
  const job = h.controls.setNoiseMode('off');
  h.controls.toggleMute();
  await h.controls.setMicrophoneGain(180);
  blocked.reject(new Error('Unavailable'));
  assert.equal(await job, false);
  assert.equal(h.controls.getSnapshot().noiseEngine, 'native');
  assert.equal(h.controls.getSnapshot().noiseSuppression, true);
  assert.equal(h.controls.getSnapshot().micMuted, true);
  assert.equal(h.controls.getSnapshot().microphoneVolume, 180);
  assert.equal(h.count.telemetry, 2);
  assert.equal(h.statuses.at(-1)[1], 'error');
});
test('old failed processing cannot roll back the preferences or status of a newer call', async (t) => {
  const h = await setup(t),
    blocked = deferred();
  h.setAcquire(() => blocked.promise);
  const old = h.controls.setNoiseMode('off');
  h.call.generation++;
  h.controls.cancelPending();
  h.setAcquire(async () => {});
  await h.controls.setNoiseMode('rnnoise');
  const status = h.statuses.at(-1);
  blocked.reject(new Error('Old call'));
  assert.equal(await old, false);
  assert.equal(h.controls.getSnapshot().noiseEngine, 'rnnoise');
  assert.equal(h.values.get('mnDesktopNoiseMode'), 'rnnoise');
  assert.equal(h.statuses.at(-1), status);
});
test('a newer microphone selection supersedes a pending processing rollback', async (t) => {
  const h = await setup(t),
    blocked = deferred();
  h.setAcquire(() => blocked.promise);
  const old = h.controls.setNoiseMode('off');
  h.setAcquire(async () => {});
  await h.controls.selectInput('new');
  blocked.reject(new Error('Obsolete'));
  await old;
  assert.equal(h.controls.getSnapshot().selectedInput, 'new');
  assert.equal(h.controls.getSnapshot().noiseSuppression, false);
  assert.equal(h.statuses.at(-1)[0], 'Microfone alterado.');
});
test('cancellation during meter initialization cannot announce an old processing result', async (t) => {
  const h = await setup(t),
    blocked = deferred();
  h.setWatch(() => blocked.promise);
  const job = h.controls.setNoiseMode('off');
  await tick();
  h.call.generation++;
  h.controls.cancelPending();
  blocked.resolve();
  await job;
  assert.deepEqual(h.statuses, []);
});
test('processing controls respect capture loading and validate desktop engine values', async (t) => {
  const h = await setup(t);
  h.mic.loading = true;
  for (const job of [
    h.controls.toggleNoiseSuppression(),
    h.controls.toggleVoiceLightMode(),
    h.controls.setNoiseMode('rnnoise'),
    h.controls.setNoiseMode('__proto__'),
  ])
    assert.equal(await job, false);
  assert.equal(h.count.acquire, 0);
  assert.equal(h.values.size, 0);
});
test('light mode selects native suppression only when enabled and rolls back on current-call failure', async (t) => {
  const h = await setup(t, { mnDesktopNoiseMode: 'rnnoise' });
  assert.equal(await h.controls.toggleVoiceLightMode(), true);
  assert.equal(h.controls.getSnapshot().noiseEngine, 'native');
  h.setAcquire(async () => {
    throw new Error('Device busy');
  });
  assert.equal(await h.controls.toggleVoiceLightMode(), false);
  assert.equal(h.controls.getSnapshot().voiceLightMode, true);
  const off = await setup(t, { mnDesktopNoiseMode: 'off' });
  await off.controls.toggleVoiceLightMode();
  assert.equal(off.controls.getSnapshot().noiseEngine, 'off');
  assert.equal(off.controls.getSnapshot().noiseSuppression, false);
});
test('processing outside a call persists preferences without opening devices', async (t) => {
  const h = await setup(t);
  h.call.joined = false;
  await h.controls.toggleNoiseSuppression();
  await h.controls.setNoiseMode('rnnoise');
  await h.controls.toggleVoiceLightMode();
  assert.equal(h.count.acquire, 0);
  assert.equal(h.controls.getSnapshot().voiceLightMode, true);
  assert.equal(h.controls.getSnapshot().noiseEngine, 'native');
  assert.equal(h.statuses.length, 1);
});
test('input selection persists even when capture fails; an obsolete failure cannot paint a new call', async (t) => {
  const h = await setup(t);
  h.setAcquire(async () => {
    throw new Error('Device absent');
  });
  assert.equal(await h.controls.selectInput('absent'), false);
  assert.equal(h.values.get('tronoVoiceInput'), 'absent');
  const blocked = deferred();
  h.setAcquire(() => blocked.promise);
  const old = h.controls.selectInput('old');
  h.call.generation++;
  h.controls.cancelPending();
  const status = h.statuses.at(-1);
  blocked.reject(new Error('Late'));
  await old;
  assert.equal(h.statuses.at(-1), status);
});
test('enumeration does not erase newer selections and preserves unavailable camera preference when no devices are exposed', async (t) => {
  const h = await setup(t, { tronoVoiceInput: 'old', tronoCameraInput: 'cam' });
  h.call.joined = false;
  const observed = h.controls.getSnapshot();
  await h.controls.selectInput('new');
  h.controls.reconcileDevices(['old'], [], observed);
  assert.equal(h.controls.getSnapshot().selectedInput, 'new');
  assert.equal(h.controls.getSnapshot().selectedCamera, 'cam');
  h.controls.reconcileDevices([], ['other'], h.controls.getSnapshot());
  assert.equal(h.controls.getSnapshot().selectedInput, '');
  assert.equal(h.values.get('tronoVoiceInput'), 'new');
  assert.equal(h.controls.getSnapshot().selectedCamera, '');
  assert.equal(h.values.has('tronoCameraInput'), false);
});
test('camera fallback can clear only the preference that actually failed', async (t) => {
  const h = await setup(t, { tronoCameraInput: 'cam' });
  h.controls.forgetCamera('old');
  assert.equal(h.controls.getSnapshot().selectedCamera, 'cam');
  h.controls.forgetCamera('cam');
  assert.equal(h.values.has('tronoCameraInput'), false);
});
test('camera selection only captures while a camera is active and preserves friendly errors', async (t) => {
  const h = await setup(t);
  await h.controls.selectCamera('cam');
  assert.equal(h.count.camera, 0);
  h.camera.capture = {};
  h.setCamera(async () => {
    throw Object.assign(new Error('permission'), { name: 'NotAllowedError' });
  });
  assert.equal(await h.controls.selectCamera('other'), false);
  assert(h.statuses.at(-1)[0].startsWith('Permita'));
  assert.equal(h.values.get('tronoCameraInput'), 'other');
  h.camera.loading = true;
  assert.equal(await h.controls.selectCamera('busy'), false);
  assert.equal(h.controls.getSnapshot().selectedCamera, 'other');
});
test('camera toggle deduplicates intent while auto-joining and can switch an active camera off', async (t) => {
  const h = await setup(t),
    blocked = deferred();
  h.call.joined = false;
  h.setJoin(() => blocked.promise);
  const job = h.controls.toggleCamera();
  assert.equal(await h.controls.toggleCamera(), false);
  assert.equal(h.controls.getSnapshot().cameraTogglePending, true);
  h.call.joined = true;
  blocked.resolve(true);
  assert.equal(await job, true);
  assert.equal(h.count.camera, 1);
  h.camera.capture = {};
  await h.controls.toggleCamera();
  assert.equal(h.count.stops, 1);
});
test('camera intent cancelled during join never requests permission or overwrites the next intent', async (t) => {
  const h = await setup(t),
    blocked = deferred();
  h.call.joined = false;
  h.setJoin(() => blocked.promise);
  const old = h.controls.toggleCamera();
  h.controls.cancelPending();
  h.call.joined = true;
  await h.controls.toggleCamera();
  const status = h.statuses.at(-1);
  blocked.resolve(true);
  assert.equal(await old, false);
  assert.equal(h.count.camera, 1);
  assert.equal(h.statuses.at(-1), status);
});
test('late camera failures and successful permission results cannot announce after cancellation', async (t) => {
  const h = await setup(t),
    blocked = deferred();
  h.setCamera(() => blocked.promise);
  const job = h.controls.toggleCamera();
  assert.equal(h.controls.getSnapshot().cameraTogglePending, true);
  h.call.generation++;
  h.controls.cancelPending();
  const statuses = [...h.statuses];
  blocked.reject(new Error('Old camera'));
  assert.equal(await job, false);
  assert.deepEqual(h.statuses, statuses);
  assert.equal(h.controls.getSnapshot().cameraTogglePending, false);
});
test('noise diagnostics distinguish paused processed audio from native raw passthrough', async (t) => {
  const h = await setup(t),
    raw = { getSettings: () => ({ noiseSuppression: true, sampleRate: 48000 }) },
    processed = {};
  h.mic.capture = {
    rawStream: { getAudioTracks: () => [raw] },
    outgoingTrack: processed,
    processor: {
      mode: 'rnnoise',
      track: processed,
      ctx: { state: 'suspended', sampleRate: 48000 },
    },
  };
  assert.equal(h.controls.noiseState().mode, 'paused');
  h.mic.capture.outgoingTrack = raw;
  assert.equal(h.controls.noiseState().mode, 'rnnoise');
  h.mic.capture.processor.mode = 'gain-only';
  assert.equal(h.controls.noiseState().mode, 'native');
  h.mic.loading = true;
  assert.equal(h.controls.noiseState().mode, 'loading');
  h.mic.loading = false;
  h.call.joined = false;
  assert.equal(h.controls.noiseState().mode, 'idle');
});
test('dispose invalidates pending actions and never closes borrowed devices or playback', async (t) => {
  const h = await setup(t),
    blocked = deferred();
  h.setAcquire(() => blocked.promise);
  const job = h.controls.setNoiseMode('off');
  h.controls.dispose();
  blocked.reject(new Error('Late'));
  await job;
  assert.equal(h.count.stops, 0);
  assert.deepEqual(h.statuses, []);
  assert.equal(h.controls.toggleMute(), false);
  assert.equal(await h.controls.toggleCamera(), false);
});

async function bindingSetup(t, overrides = {}) {
  const { createCallControlBindings } = await import('../src/lib/voice/control-bindings.ts');
  const rows = [
    ['muteMicBtn', 'click', 'toggleMute'],
    ['deafenVoiceBtn', 'click', 'toggleDeafen'],
    ['cameraBtn', 'click', 'toggleCamera'],
    ['noiseSuppressionBtn', 'click', 'toggleNoiseSuppression'],
    ['voiceLightModeBtn', 'click', 'toggleVoiceLightMode'],
    ['voiceInputSelect', 'change', 'selectInput'],
    ['cameraInputSelect', 'change', 'selectCamera'],
    ['noiseModeSelect', 'change', 'setNoiseMode'],
    ['micGainSlider', 'input', 'setMicrophoneGain'],
  ];
  const elements = new Map(),
    calls = [],
    warnings = [],
    controls = {};
  for (const [id, , action] of rows) {
    const element = new EventTarget();
    element.value = id;
    elements.set(id, element);
    controls[action] = (...args) => calls.push([action, ...args]);
  }
  Object.assign(controls, overrides);
  const bindings = createCallControlBindings({
    controls,
    root: { getElementById: (id) => elements.get(id) ?? null },
    warn: (error) => warnings.push(error),
  });
  t.after(bindings.dispose);
  return { bindings, elements, calls, warnings, rows };
}
test('typed DOM bindings install once and invoke every control synchronously with its current value', async (t) => {
  const h = await bindingSetup(t);
  h.bindings.start();
  h.bindings.start();
  for (const [id, event, action] of h.rows) {
    h.elements.get(id).dispatchEvent(new Event(event));
    assert.deepEqual(h.calls.at(-1), event === 'click' ? [action] : [action, id]);
  }
  assert.equal(h.calls.length, 9);
});
test('moving control nodes preserves handlers and disposal removes them from those same nodes', async (t) => {
  const h = await bindingSetup(t);
  h.bindings.start();
  const button = h.elements.get('cameraBtn');
  h.elements.clear();
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(h.calls, [['toggleCamera']]);
  h.bindings.dispose();
  h.bindings.start();
  button.dispatchEvent(new Event('click'));
  assert.equal(h.calls.length, 1);
});
test('control binding errors are contained for synchronous and asynchronous actions', async (t) => {
  const sync = new Error('Sync'),
    asyncError = new Error('Async');
  const h = await bindingSetup(t, {
    toggleMute() {
      throw sync;
    },
    toggleCamera: () => Promise.reject(asyncError),
  });
  h.bindings.start();
  h.elements.get('muteMicBtn').dispatchEvent(new Event('click'));
  h.elements.get('cameraBtn').dispatchEvent(new Event('click'));
  await tick();
  assert.deepEqual(h.warnings, [sync, asyncError]);
});
