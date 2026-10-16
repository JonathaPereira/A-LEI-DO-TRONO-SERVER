'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/microphone-processor.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((a) => {
    resolve = a;
  });
  return { promise, resolve };
};
function node(name) {
  return {
    name,
    outputs: [],
    disconnects: 0,
    connect(target) {
      this.outputs.push(target);
    },
    disconnect() {
      this.outputs = [];
      this.disconnects++;
    },
  };
}
function parameter() {
  return {
    value: 0,
    values: [],
    setTargetAtTime(value) {
      this.values.push(value);
    },
  };
}
async function setup(t) {
  const { createMicrophoneProcessor } = await modulePromise;
  const source = node('source'),
    gain = { ...node('gain'), gain: parameter() },
    limiter = {
      ...node('limiter'),
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter(),
    };
  const output = {
      stops: 0,
      stop() {
        this.stops++;
      },
    },
    destination = { ...node('destination'), stream: { getAudioTracks: () => [output] } };
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 48000,
    resumes: 0,
    createMediaStreamSource: () => source,
    createGain: () => gain,
    createDynamicsCompressor: () => limiter,
    createMediaStreamDestination: () => destination,
    async resume() {
      this.resumes++;
    },
  };
  const settings = { noiseSuppression: false },
    rawTrack = {
      applied: 0,
      getSettings: () => settings,
      async applyConstraints(value) {
        this.applied++;
        Object.assign(settings, value);
      },
    },
    raw = { getAudioTracks: () => [rawTrack] };
  const controller = new AbortController(),
    filters = [],
    warnings = [];
  let failure,
    modeChanges = 0,
    unavailable = 0;
  let factory = async () => {
    const filter = {
      node: node('filter'),
      input: node('highpass'),
      destroys: 0,
      destroy() {
        this.destroys++;
      },
    };
    filters.push(filter);
    return filter;
  };
  let native = true;
  const dependencies = {
    getContext: () => ctx,
    nativeSuppressionSupported: () => native,
    createNoise: (_ctx, onFailure) => {
      failure = onFailure;
      return factory();
    },
    createLightNoise: (_ctx, onFailure) => {
      failure = onFailure;
      return factory();
    },
    onModeChange: () => modeChanges++,
    onNativeUnavailable: () => unavailable++,
    warn: (error) => warnings.push(error),
  };
  const options = { enabled: true, nativeOnly: false, gain: 100, signal: controller.signal };
  t.after(() => controller.abort());
  return {
    ctx,
    source,
    gain,
    limiter,
    destination,
    output,
    rawTrack,
    settings,
    filters,
    controller,
    options,
    warnings,
    dependencies,
    create: () => createMicrophoneProcessor(raw, options, dependencies),
    factory(fn) {
      factory = fn;
    },
    native(value) {
      native = value;
    },
    fail() {
      failure();
    },
    counts: () => ({ modeChanges, unavailable }),
  };
}

test('gain-only processing keeps a live output and borrowed context; stop disconnects once', async (t) => {
  const h = await setup(t);
  h.options.enabled = false;
  h.options.gain = 160;
  const processor = await h.create();
  assert.equal(processor.mode, 'gain-only');
  assert.equal(h.gain.gain.value, 1.6);
  assert.deepEqual(h.source.outputs, [h.gain]);
  processor.setGain(220);
  assert.equal(h.gain.gain.values.at(-1), 2.2);
  processor.stop();
  processor.stop();
  h.controller.abort();
  assert.equal(h.output.stops, 1);
  for (const n of [h.source, h.gain, h.limiter, h.destination]) assert.equal(n.disconnects, 1);
  assert.equal(h.ctx.state, 'running');
  processor.setGain(50);
  assert.equal(h.gain.gain.values.length, 1);
});

test('suspended or unavailable contexts never provide a silent processed destination', async (t) => {
  const h = await setup(t);
  h.ctx.state = 'suspended';
  assert.equal(await h.create(), null);
  assert.equal(h.ctx.resumes, 1);
  assert.equal(h.output.stops, 0);
  h.dependencies.getContext = () => null;
  assert.equal(await h.create(), null);
  assert.equal(h.filters.length, 0);
});

test('abort during worklet startup closes the graph immediately and destroys a late filter', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.factory(() => held.promise);
  const pending = h.create();
  await tick();
  h.controller.abort();
  assert.equal(h.output.stops, 1);
  const filter = {
    node: node('late'),
    destroys: 0,
    destroy() {
      this.destroys++;
    },
  };
  held.resolve(filter);
  assert.equal(await pending, null);
  assert.equal(filter.destroys, 1);
  assert.deepEqual(filter.node.outputs, []);
  assert.equal(h.ctx.state, 'running');
});

test('RNNoise failure destroys the worklet and selects applied native suppression once', async (t) => {
  const h = await setup(t),
    processor = await h.create();
  assert.equal(processor.mode, 'rnnoise');
  h.fail();
  h.fail();
  await tick();
  assert.equal(processor.mode, 'native');
  assert.equal(h.rawTrack.applied, 1);
  assert.equal(h.filters[0].destroys, 1);
  assert.equal(h.counts().unavailable, 0);
  processor.stop();
  h.fail();
  await tick();
  assert.equal(h.rawTrack.applied, 1);
  assert.equal(h.filters[0].destroys, 1);
});

test('unavailable native suppression requests reacquisition without creating another graph', async (t) => {
  const h = await setup(t);
  h.native(false);
  h.factory(async () => {
    throw Error('worklet unavailable');
  });
  const processor = await h.create();
  assert.equal(processor.mode, 'unavailable');
  assert.equal(h.counts().unavailable, 1);
  assert.equal(h.warnings.length, 1);
  assert.deepEqual(h.source.outputs, [h.gain]);
});

test('native processing preserves quiet audio without loading an expander or RNNoise', async (t) => {
  const h = await setup(t);
  h.options.nativeOnly = true;
  h.settings.noiseSuppression = true;
  const processor = await h.create();
  assert.equal(processor.mode, 'native');
  assert.equal(processor.nativeSuppression, true);
  assert.deepEqual(h.source.outputs, [h.gain]);
  assert.equal(h.filters.length, 0);
  processor.stop();
  assert.equal(h.output.stops, 1);
  assert.equal(h.output.stops, 1);
});

test('a filter failing before its initialization resolves cannot overwrite the native fallback', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.factory(() => held.promise);
  const pending = h.create();
  await tick();
  h.fail();
  await tick();
  const filter = {
    node: node('failed-before-ready'),
    destroys: 0,
    destroy() {
      this.destroys++;
    },
  };
  held.resolve(filter);
  const processor = await pending;
  assert.equal(processor.mode, 'native');
  assert.equal(filter.destroys, 1);
  assert.equal(h.rawTrack.applied, 1);
});

test('graph connection failures release the destination and disconnect constructed nodes', async (t) => {
  const h = await setup(t);
  h.gain.connect = () => {
    throw Error('graph connection failed');
  };
  await assert.rejects(h.create(), /graph connection failed/);
  assert.equal(h.output.stops, 1);
  assert.equal(h.source.disconnects, 1);
  assert.equal(h.ctx.state, 'running');
});
