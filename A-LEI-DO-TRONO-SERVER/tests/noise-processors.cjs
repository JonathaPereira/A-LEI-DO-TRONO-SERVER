'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNoiseProcessors } = require('../src/lib/voice/noise-processors.ts');
const { initializeNoiseProcessors } = require('../src/lib/voice/noise-runtime.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function context(sampleRate = 48000) {
  return {
    sampleRate,
    audioWorklet: {},
    closes: 0,
    highpasses: [],
    close() {
      this.closes++;
    },
    createBiquadFilter() {
      if (this.failHighpass) throw Error('highpass failed');
      const filter = {
        type: '',
        frequency: { value: 0 },
        Q: { value: 0 },
        disconnects: 0,
        connect(node) {
          this.destination = node;
        },
        disconnect() {
          this.disconnects++;
        },
      };
      this.highpasses.push(filter);
      return filter;
    },
  };
}
function fixture() {
  const controls = {
    worklet: true,
    wasm: true,
    valid: true,
    autoReady: true,
    synchronousError: false,
    binary: null,
    module: null,
  };
  const binaries = [],
    modules = [],
    nodes = [],
    timers = new Map();
  let nextTimer = 0;
  const owner = createNoiseProcessors({
    workletAvailable: () => controls.worklet,
    wasmAvailable: () => controls.wasm,
    loadBinary(signal) {
      binaries.push(signal);
      return controls.binary || Promise.resolve(new ArrayBuffer(8));
    },
    validateBinary: () => controls.valid,
    loadModule(ctx, engine) {
      modules.push({ context: ctx, engine });
      return controls.module || Promise.resolve();
    },
    schedule(callback, milliseconds) {
      const id = ++nextTimer;
      timers.set(id, { callback, milliseconds });
      return () => timers.delete(id);
    },
    createNode(ctx, engine, binary) {
      const node = new EventTarget();
      Object.assign(node, {
        context: ctx,
        engine,
        binary,
        disconnects: 0,
        messages: [],
        portCloses: 0,
        disconnect() {
          this.disconnects++;
        },
        port: {
          onmessage: null,
          postMessage: (value) => node.messages.push(value),
          close: () => node.portCloses++,
          start() {
            if (controls.synchronousError) {
              this.onmessage?.({ data: { type: 'ready' } });
              this.onmessage?.({ data: { type: 'error', message: 'failed before publication' } });
            } else if (controls.autoReady)
              queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
          },
        },
      });
      nodes.push(node);
      return node;
    },
  });
  return {
    owner,
    controls,
    binaries,
    modules,
    nodes,
    timers,
    fire(milliseconds) {
      for (const [id, timer] of [...timers])
        if (timer.milliseconds === milliseconds) {
          timers.delete(id);
          timer.callback();
        }
    },
  };
}

test('RNNoise requires 48 kHz/WASM but the independent light filter needs only a worklet', async () => {
  const f = fixture(),
    ctx = context(44100);
  assert.equal(f.owner.supported(ctx), false);
  await assert.rejects(f.owner.create(ctx), /48 kHz/);
  f.controls.wasm = false;
  const light = await f.owner.createLight(ctx);
  assert.strictEqual(light.input.destination, light.node);
  assert.equal(light.input.frequency.value, 75);
  assert.equal(light.input.Q.value, 0.707);
  assert.equal(f.binaries.length, 0);
  assert.equal(f.modules[0].engine, 'light');
  f.owner.dispose();
  assert.equal(ctx.closes, 0);
});

test('model is shared and registration is cached per context while every filter owns its own node', async () => {
  const f = fixture(),
    ctx = context(),
    other = context();
  const [a, b, c] = await Promise.all([
    f.owner.create(ctx),
    f.owner.create(ctx),
    f.owner.create(other),
  ]);
  assert.equal(f.binaries.length, 1);
  assert.equal(f.modules.length, 2);
  assert.equal(f.nodes.length, 3);
  assert.strictEqual(f.nodes[0].binary, f.nodes[1].binary);
  assert.notStrictEqual(a.node, b.node);
  assert.equal(f.timers.size, 0);
  a.destroy();
  a.destroy();
  f.owner.dispose();
  b.destroy();
  c.destroy();
  for (const node of f.nodes) {
    assert.equal(node.disconnects, 1);
    assert.equal(node.portCloses, 1);
    assert.deepEqual(node.messages, ['destroy']);
  }
  assert.equal(ctx.closes, 0);
  assert.equal(other.closes, 0);
});

test('a failed registration retries without redownloading an already valid model', async () => {
  const f = fixture(),
    ctx = context();
  f.controls.module = Promise.reject(Error('registration failed'));
  await assert.rejects(f.owner.create(ctx), /registration failed/);
  f.controls.module = null;
  const filter = await f.owner.create(ctx);
  assert.equal(f.binaries.length, 1);
  assert.equal(f.modules.length, 2);
  filter.destroy();
  f.owner.dispose();
});

test('a replacement loader reuses registrations in a context that outlived the previous owner', async () => {
  const ctx = context(),
    first = fixture();
  await first.owner.create(ctx);
  first.owner.dispose();
  const second = fixture(),
    filter = await second.owner.create(ctx);
  assert.equal(first.modules.length, 1);
  assert.equal(second.modules.length, 0);
  assert.equal(ctx.closes, 0);
  assert.equal(second.nodes.length, 1);
  filter.destroy();
  second.owner.dispose();
});

test('registration completing after a timeout is reused without registering the processor twice', async () => {
  const f = fixture(),
    ctx = context(),
    gate = deferred();
  f.controls.module = gate.promise;
  const first = f.owner.create(ctx),
    failed = assert.rejects(first, /a tempo/);
  await tick();
  f.fire(15000);
  await failed;
  assert.equal(f.nodes.length, 0);
  const second = f.owner.create(ctx);
  gate.resolve();
  const filter = await second;
  assert.equal(f.modules.length, 1);
  assert.equal(f.nodes.length, 1);
  assert.equal(f.timers.size, 0);
  filter.destroy();
  f.owner.dispose();
});

test('binary timeout aborts its fetch, permits retry and observes the abandoned response', async () => {
  const f = fixture(),
    ctx = context(),
    gate = deferred();
  f.controls.binary = gate.promise;
  const first = f.owner.create(ctx),
    failed = assert.rejects(first, /a tempo/);
  await tick();
  f.fire(15000);
  await failed;
  assert.equal(f.binaries[0].aborted, true);
  f.controls.binary = null;
  const filter = await f.owner.create(ctx);
  gate.reject(Error('late fetch rejection'));
  await tick();
  assert.equal(f.binaries.length, 2);
  filter.destroy();
  f.owner.dispose();
});

test('invalid model bytes are never cached and a later valid request can recover', async () => {
  const f = fixture(),
    ctx = context();
  f.controls.valid = false;
  await assert.rejects(f.owner.create(ctx), /Modelo RNNoise inválido/);
  assert.equal(f.nodes.length, 0);
  f.controls.valid = true;
  const filter = await f.owner.create(ctx);
  assert.equal(f.binaries.length, 2);
  filter.destroy();
  f.owner.dispose();
});

test('startup timeout destroys its node and late ready/error messages cannot publish a dead filter', async () => {
  const f = fixture(),
    ctx = context();
  f.controls.autoReady = false;
  let failures = 0;
  const first = f.owner.create(ctx, { onFailure: () => failures++ }),
    failed = assert.rejects(first, /demorou/);
  await tick();
  f.fire(8000);
  await failed;
  assert.equal(f.nodes[0].portCloses, 1);
  assert.equal(f.nodes[0].port.onmessage, null);
  f.nodes[0].dispatchEvent(new Event('processorerror'));
  assert.equal(failures, 0);
  f.controls.autoReady = true;
  const filter = await f.owner.create(ctx);
  assert.equal(f.modules.length, 1);
  assert.equal(f.timers.size, 0);
  filter.destroy();
  f.owner.dispose();
  assert.equal(ctx.closes, 0);
});

test('ready followed by failure before publication rejects setup instead of returning a destroyed node', async () => {
  const f = fixture();
  f.controls.synchronousError = true;
  let failures = 0;
  await assert.rejects(
    f.owner.create(context(), { onFailure: () => failures++ }),
    /failed before publication/,
  );
  assert.equal(failures, 0);
  assert.equal(f.nodes[0].portCloses, 1);
  assert.equal(f.timers.size, 0);
  f.owner.dispose();
});

test('a published filter failure notifies once and does not close the caller context or other filters', async () => {
  const f = fixture(),
    ctx = context();
  let failures = 0;
  const first = await f.owner.create(ctx, { onFailure: () => failures++ });
  const second = await f.owner.createLight(ctx);
  first.node.dispatchEvent(new Event('processorerror'));
  first.node.dispatchEvent(new Event('processorerror'));
  assert.equal(failures, 1);
  assert.equal(second.node.portCloses, 0);
  assert.equal(ctx.closes, 0);
  f.owner.dispose();
  assert.equal(second.node.portCloses, 1);
});

test('partial light graph failure releases the worklet and never closes the borrowed context', async () => {
  const f = fixture(),
    ctx = context();
  ctx.failHighpass = true;
  await assert.rejects(f.owner.createLight(ctx), /highpass failed/);
  assert.equal(f.nodes[0].portCloses, 1);
  assert.equal(ctx.closes, 0);
  f.owner.dispose();
});

test('disposal aborts pending model preparation, releases existing nodes and removes timers', async () => {
  const f = fixture(),
    ctx = context(),
    gate = deferred();
  const light = await f.owner.createLight(ctx);
  f.controls.binary = gate.promise;
  const pending = f.owner.create(ctx),
    failed = assert.rejects(pending, { name: 'AbortError' });
  await tick();
  f.owner.dispose();
  f.owner.dispose();
  await failed;
  assert.equal(f.binaries[0].aborted, true);
  assert.equal(light.node.portCloses, 1);
  assert.equal(ctx.closes, 0);
  gate.resolve(new ArrayBuffer(8));
  await tick();
  assert.equal(f.nodes.length, 1);
  assert.equal(f.timers.size, 0);
  await assert.rejects(f.owner.create(ctx), { name: 'AbortError' });
});

test('runtime cleanup removes only its own facades and an old disposer cannot remove a new installation', async () => {
  const target = new EventTarget(),
    dispose = initializeNoiseProcessors(target);
  assert.strictEqual(initializeNoiseProcessors(target), dispose);
  const old = target.TronoNoise;
  dispose();
  assert.equal(target.TronoNoise, undefined);
  assert.equal(target.TronoLightNoise, undefined);
  const second = initializeNoiseProcessors(target),
    current = target.TronoNoise;
  dispose();
  assert.strictEqual(target.TronoNoise, current);
  assert.strictEqual(initializeNoiseProcessors(target), second);
  target.dispatchEvent(new Event('pagehide'));
  assert.equal(target.TronoNoise, undefined);
  assert.equal(old.supported(context()), false);
  await assert.rejects(old.create(context()), { name: 'AbortError' });
});
