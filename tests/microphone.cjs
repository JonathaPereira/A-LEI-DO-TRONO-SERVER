'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/microphone.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function track(kind = 'audio', settings = {}) {
  return {
    kind,
    enabled: true,
    readyState: 'live',
    stops: 0,
    settings,
    stop() {
      this.stops++;
      this.readyState = 'ended';
    },
    getSettings() {
      return this.settings;
    },
    async applyConstraints(value) {
      Object.assign(this.settings, value);
    },
  };
}
function stream(...tracks) {
  return {
    getTracks: () => [...tracks],
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    addTrack(t) {
      if (!tracks.includes(t)) tracks.push(t);
    },
    removeTrack(t) {
      tracks = tracks.filter((old) => old !== t);
    },
  };
}
function processor(mode = 'rnnoise') {
  return {
    ctx: { state: 'running' },
    track: track(),
    mode,
    stops: 0,
    gains: [],
    stop() {
      this.stops++;
      this.track.stop();
    },
    setGain(value) {
      this.gains.push(value);
    },
  };
}
async function setup(t) {
  const { createMicrophone } = await modulePromise;
  const camera = track('video'),
    output = stream(camera),
    requests = [],
    changes = [],
    processors = [],
    warnings = [];
  const settings = {
    generation: 1,
    enabled: false,
    nativeOnly: false,
    deviceId: 'selected',
    gain: 100,
    muted: false,
  };
  let open = async () => stream(track()),
    process = async () => null,
    publish = async (change) => changes.push(change);
  const mic = createMicrophone({
    mediaDevices: {
      getSupportedConstraints: () => ({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: true,
        sampleRate: true,
      }),
      getUserMedia: (options) => {
        requests.push(options);
        return open(options);
      },
    },
    getSettings: () => ({ ...settings }),
    getStream: () => output,
    customSuppressionSupported: () => true,
    createProcessor: async (raw, options) => {
      const result = await process(raw, options);
      if (result) processors.push(result);
      return result;
    },
    onTrackChanged: (change) => publish(change),
    warn: (error) => warnings.push(error),
  });
  t.after(() => mic.dispose());
  return {
    mic,
    settings,
    camera,
    output,
    requests,
    changes,
    processors,
    warnings,
    open(fn) {
      open = fn;
    },
    process(fn) {
      process = fn;
    },
    publish(fn) {
      publish = fn;
    },
  };
}

test('desktop native unity bypasses the graph; custom gain and mute reuse the same capture', async (t) => {
  const h = await setup(t), raw = track(), processed = processor('native');
  processed.rawAtUnity = true;
  h.open(async () => stream(raw));
  h.process(async () => processed);
  await h.mic.acquire();
  assert.equal(h.mic.getSnapshot().capture.outgoingTrack, raw);
  h.settings.gain = 180; h.mic.setGain(180); await h.mic.refresh();
  assert.equal(h.mic.getSnapshot().capture.outgoingTrack, processed.track);
  h.settings.gain = 0; h.mic.setGain(0);
  assert.equal(raw.enabled, false); assert.equal(processed.track.enabled, false);
  h.settings.muted = true; h.mic.setMuted(true);
  h.settings.gain = 100; h.mic.setGain(100); await h.mic.refresh();
  assert.equal(h.mic.getSnapshot().capture.outgoingTrack, raw);
  assert.equal(raw.enabled, false);
  h.settings.muted = false; h.mic.setMuted(false);
  assert.equal(raw.enabled, true);
  assert.equal(h.requests.length, 1);
  assert.equal(processed.stops, 0); assert.equal(h.camera.stops, 0);
});

test('a gain refresh invalidates publication of a superseded microphone track', async (t) => {
  const h = await setup(t), raw = track(), processed = processor('native'), gate = deferred();
  processed.rawAtUnity = true;
  h.open(async () => stream(raw)); h.process(async () => processed);
  await h.mic.acquire();
  let pending;
  h.publish(async change => { pending = change; await gate.promise; });
  h.settings.gain = 180; h.mic.setGain(180);
  const first = h.mic.refresh();
  assert.equal(pending.isCurrent(), true);
  h.publish(async () => {});
  h.settings.gain = 100; h.mic.setGain(100); await h.mic.refresh();
  assert.equal(pending.isCurrent(), false);
  gate.resolve(); await first;
  assert.equal(h.output.getAudioTracks()[0], raw);
  assert.equal(h.requests.length, 1);
});

test('capture owns raw and processed tracks, preserving the camera, selected input, mute and gain', async (t) => {
  const h = await setup(t),
    raw = track(),
    processed = processor();
  h.open(async () => stream(raw));
  h.process(async () => processed);
  await h.mic.acquire();
  assert.deepEqual(h.output.getVideoTracks(), [h.camera]);
  assert.deepEqual(h.output.getAudioTracks(), [processed.track]);
  assert.equal(h.requests[0].audio.deviceId.exact, 'selected');
  assert.equal(h.requests[0].video, false);
  h.settings.muted = true;
  h.mic.setMuted(true);
  assert.equal(raw.enabled, false);
  assert.equal(processed.track.enabled, false);
  h.mic.setGain(180);
  assert.equal(processed.gains.at(-1), 180);
  h.mic.stop();
  assert.equal(raw.stops, 1);
  assert.equal(processed.stops, 1);
  assert.equal(h.camera.stops, 0);
  assert.deepEqual(h.output.getAudioTracks(), []);
});

test('failed custom suppression reopens native capture on the same input and releases the rejected graph', async (t) => {
  const h = await setup(t),
    raw1 = track(),
    raw2 = track('audio', { noiseSuppression: true }),
    p1 = processor('unavailable'),
    p2 = processor('light');
  h.settings.enabled = true;
  let opens = 0;
  h.open(async () => stream(++opens === 1 ? raw1 : raw2));
  let graphs = 0;
  h.process(async () => (++graphs === 1 ? p1 : p2));
  await h.mic.acquire();
  assert.equal(opens, 2);
  assert.equal(p1.stops, 1);
  assert.equal(raw1.stops, 1);
  assert.equal(h.requests[0].audio.noiseSuppression, false);
  assert.equal(h.requests[1].audio.noiseSuppression, true);
  assert.equal(h.requests[1].audio.deviceId.exact, 'selected');
  assert.equal(h.mic.getSnapshot().capture.processor, p2);
});

test('leaving while permission is pending closes the late device without publishing or changing a newer call', async (t) => {
  const h = await setup(t),
    held = deferred(),
    late = track(),
    next = track();
  h.open(() => held.promise);
  const first = h.mic.acquire(),
    failure = assert.rejects(first, { code: 'VOICE_CANCELLED' });
  h.settings.generation++;
  h.mic.stop();
  h.open(async () => stream(next));
  await h.mic.acquire();
  held.resolve(stream(late));
  await failure;
  assert.equal(late.stops, 1);
  assert.equal(next.stops, 0);
  assert.equal(h.changes.length, 1);
  assert.equal(h.mic.getSnapshot().capture.outgoingTrack, next);
});

test('leaving during processor startup aborts it and closes a processor that resolves late', async (t) => {
  const h = await setup(t),
    held = deferred(),
    raw = track(),
    late = processor();
  let signal;
  h.open(async () => stream(raw));
  h.process((_raw, options) => {
    signal = options.signal;
    return held.promise;
  });
  const pending = h.mic.acquire(),
    failure = assert.rejects(pending, { code: 'VOICE_CANCELLED' });
  await tick();
  h.mic.stop();
  assert.equal(signal.aborted, true);
  assert.equal(raw.stops, 1);
  held.resolve(late);
  await failure;
  assert.equal(late.stops, 1);
  assert.equal(h.changes.length, 0);
});

test('a failed replacement preserves the active capture and closes the new stream', async (t) => {
  const h = await setup(t),
    original = track();
  h.open(async () => stream(original));
  await h.mic.acquire();
  h.open(async () => stream());
  await assert.rejects(h.mic.acquire(), /Nenhuma trilha/);
  assert.equal(h.mic.getSnapshot().capture.outgoingTrack, original);
  assert.equal(original.stops, 0);
  assert.deepEqual(h.output.getAudioTracks(), [original]);
});

test('native retry errors release the first raw stream and processor', async (t) => {
  const h = await setup(t),
    raw = track(),
    graph = processor('unavailable');
  h.settings.enabled = true;
  let count = 0;
  h.open(async () => {
    if (++count === 1) return stream(raw);
    throw Error('device busy');
  });
  h.process(async () => graph);
  await assert.rejects(h.mic.acquire(), /device busy/);
  assert.equal(raw.stops, 1);
  assert.equal(graph.stops, 1);
  assert.equal(h.mic.getSnapshot().loading, false);
});

test('an obsolete request cannot clear the loading flag or steal tracks from a newer request', async (t) => {
  const h = await setup(t),
    first = deferred(),
    second = deferred(),
    a = track(),
    b = track();
  let count = 0;
  h.open(() => (++count === 1 ? first.promise : second.promise));
  const old = h.mic.acquire(),
    oldFailure = assert.rejects(old, { code: 'VOICE_CANCELLED' }),
    current = h.mic.acquire();
  first.resolve(stream(a));
  await oldFailure;
  assert.equal(h.mic.getSnapshot().loading, true);
  assert.equal(a.stops, 1);
  second.resolve(stream(b));
  await current;
  assert.equal(h.mic.getSnapshot().capture.outgoingTrack, b);
  assert.equal(h.mic.getSnapshot().loading, false);
});

test('mute and gain changes during permission apply to the arriving capture', async (t) => {
  const h = await setup(t),
    held = deferred(),
    raw = track(),
    graph = processor();
  h.open(() => held.promise);
  h.process(async () => graph);
  const pending = h.mic.acquire();
  h.settings.muted = true;
  h.settings.gain = 215;
  h.mic.setMuted(true);
  held.resolve(stream(raw));
  await pending;
  assert.equal(raw.enabled, false);
  assert.equal(graph.track.enabled, false);
  assert.equal(graph.gains.at(-1), 215);
});

test('suspended processing uses raw audio and resumes the same graph without capturing again or touching video', async (t) => {
  const h = await setup(t),
    raw = track(),
    graph = processor();
  h.open(async () => stream(raw));
  h.process(async () => graph);
  await h.mic.acquire();
  graph.ctx.state = 'suspended';
  await h.mic.refresh();
  assert.equal(h.mic.getSnapshot().capture.outgoingTrack, raw);
  h.settings.muted = true;
  h.mic.setMuted(true);
  graph.ctx.state = 'running';
  await h.mic.refresh();
  assert.equal(h.mic.getSnapshot().capture.outgoingTrack, graph.track);
  assert.equal(graph.track.enabled, false);
  assert.equal(raw.enabled, false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.camera.stops, 0);
  assert.deepEqual(
    h.changes.map((c) => c.reason),
    ['acquire', 'resume', 'resume'],
  );
  await h.mic.refresh();
  assert.equal(h.changes.length, 3);
});

test('stop releases current and retiring captures while a sender replacement is still pending', async (t) => {
  const h = await setup(t),
    a = track(),
    b = track(),
    held = deferred();
  h.open(async () => stream(a));
  await h.mic.acquire();
  let change;
  h.publish((value) => {
    change = value;
    return held.promise;
  });
  h.open(async () => stream(b));
  const pending = h.mic.acquire(),
    failure = assert.rejects(pending, { code: 'VOICE_CANCELLED' });
  await tick();
  assert.equal(a.stops, 0);
  h.mic.stop();
  assert.equal(a.stops, 1);
  assert.equal(b.stops, 1);
  assert.equal(change.isCurrent(), false);
  held.resolve();
  await failure;
  assert.equal(a.stops, 1);
  assert.equal(b.stops, 1);
});

test('a publication failure still releases the retiring capture; the installed capture remains owned until stop', async (t) => {
  const h = await setup(t),
    a = track(),
    b = track();
  h.open(async () => stream(a));
  await h.mic.acquire();
  h.open(async () => stream(b));
  h.publish(async () => {
    throw Error('sender failed');
  });
  await assert.rejects(h.mic.acquire(), /sender failed/);
  assert.equal(a.stops, 1);
  assert.equal(b.stops, 0);
  h.mic.stop();
  assert.equal(b.stops, 1);
});

test('observer failures and repeated disposal cannot leak resources or reopen devices', async (t) => {
  const h = await setup(t),
    raw = track(),
    graph = processor();
  h.mic.subscribe(() => {
    throw Error('observer');
  });
  h.open(async () => stream(raw));
  h.process(async () => graph);
  await h.mic.acquire();
  assert(Object.isFrozen(h.mic.getSnapshot()));
  assert(Object.isFrozen(h.mic.getSnapshot().capture));
  assert(h.warnings.length > 0);
  h.mic.dispose();
  h.mic.dispose();
  assert.equal(raw.stops, 1);
  assert.equal(graph.stops, 1);
  assert.equal(h.camera.stops, 0);
  await assert.rejects(h.mic.acquire(), { code: 'VOICE_CANCELLED' });
  assert.equal(h.requests.length, 1);
});
