'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createApplicationAudio,
  decodeApplicationAudio,
} = require('../src/lib/voice/application-audio.ts');
const { initializeApplicationAudio } = require('../src/lib/voice/application-audio-runtime.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const info = (id = 'capture-a') => ({ id, sampleRate: 44100, channels: 2 });
const pcm = () => {
  const bytes = new Uint8Array(8),
    view = new DataView(bytes.buffer);
  [-32768, -16384, 16384, 32767].forEach((value, i) => view.setInt16(i * 2, value, true));
  return bytes;
};
function fixture(options = {}) {
  let listener,
    releases = 0,
    subscriptions = 0,
    endings = 0;
  const contexts = [],
    nodes = [],
    stopped = [],
    acknowledgements = [],
    warnings = [];
  const owner = createApplicationAudio({
    subscribe(fn) {
      listener = fn;
      subscriptions++;
      return () => {
        listener = null;
        releases++;
      };
    },
    ack: (id) => acknowledgements.push(id),
    stop: async (id) => {
      stopped.push(id);
    },
    ended: () => endings++,
    warn: (error) => warnings.push(error),
    createContext(sampleRate) {
      const track = {
        stops: 0,
        stop() {
          this.stops++;
        },
      };
      const context = {
        sampleRate,
        track,
        closes: 0,
        resumes: 0,
        state: 'suspended',
        createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [track] } }),
        async resume() {
          this.resumes++;
          this.state = 'running';
        },
        async close() {
          this.closes++;
          this.state = 'closed';
        },
      };
      contexts.push(context);
      return context;
    },
    loadModule: async () => {},
    createNode(context) {
      const node = new EventTarget();
      Object.assign(node, {
        context,
        disconnects: 0,
        connects: 0,
        messages: [],
        portCloses: 0,
        connect() {
          this.connects++;
        },
        disconnect() {
          this.disconnects++;
        },
        port: {
          postMessage(value, transfer) {
            node.messages.push({ value, transfer });
          },
          close() {
            node.portCloses++;
          },
        },
      });
      nodes.push(node);
      return node;
    },
    ...options,
  });
  return {
    owner,
    contexts,
    nodes,
    stopped,
    acknowledgements,
    warnings,
    emit: (value) => listener?.(value),
    get subscriptions() {
      return subscriptions;
    },
    get releases() {
      return releases;
    },
    get endings() {
      return endings;
    },
  };
}

test('native PCM decoder preserves signed little-endian samples and byte offsets', () => {
  const bytes = pcm();
  assert.deepEqual([...decodeApplicationAudio(bytes)], [-1, -0.5, 0.5, 32767 / 32768]);
  const padded = new Uint8Array(16);
  padded.set(bytes, 4);
  assert.deepEqual(
    [...decodeApplicationAudio(padded.subarray(4, 12))],
    [...decodeApplicationAudio(bytes.buffer)],
  );
  const detached = new ArrayBuffer(8);
  structuredClone(detached, { transfer: [detached] });
  for (const value of [
    null,
    [],
    {},
    new Uint8Array(3),
    new Uint8Array(),
    new Uint8Array(1024 * 1024 + 4),
    detached,
  ])
    assert.equal(decodeApplicationAudio(value), null);
});

test('one native subscription and one graph per ID; acknowledgements also release missing and malformed packets', async () => {
  const f = fixture();
  assert.equal(f.contexts.length, 0);
  const first = f.owner.create(info()),
    second = f.owner.create(info());
  assert.strictEqual(first, second);
  await first;
  assert.equal(f.subscriptions, 1);
  assert.equal(f.contexts.length, 1);
  await assert.rejects(f.owner.create({ ...info(), sampleRate: 48000 }));
  f.emit({ type: 'chunk', id: 'capture-a', bytes: pcm() });
  f.emit({ type: 'chunk', id: 'capture-a', bytes: new Uint8Array(3) });
  f.emit({ type: 'chunk', id: 'not-ready', bytes: pcm() });
  f.emit(null);
  f.emit({ type: 'chunk' });
  assert.deepEqual(f.acknowledgements, ['capture-a', 'capture-a', 'not-ready']);
  assert.equal(f.nodes[0].messages.length, 1);
  assert.strictEqual(f.nodes[0].messages[0].transfer[0], f.nodes[0].messages[0].value.buffer);
  await f.owner.dispose();
  assert.equal(f.releases, 1);
});

test('stop, native end and processor failure release owned track, port, context and helper exactly once', async () => {
  for (const event of ['stop', 'ended', 'processorerror']) {
    const f = fixture(),
      pipe = await f.owner.create(info());
    if (event === 'stop') pipe.track.stop();
    if (event === 'ended') f.emit({ type: 'ended', id: 'capture-a' });
    if (event === 'processorerror') f.nodes[0].dispatchEvent(new Event('processorerror'));
    await pipe.close();
    await pipe.close();
    f.emit({ type: 'ended', id: 'capture-a' });
    f.nodes[0].dispatchEvent(new Event('processorerror'));
    assert.equal(f.contexts[0].track.stops, 1, event);
    assert.equal(f.contexts[0].closes, 1, event);
    assert.equal(f.nodes[0].disconnects, 1, event);
    assert.equal(f.nodes[0].portCloses, 1, event);
    assert.deepEqual(f.stopped, ['capture-a'], event);
    assert.equal(f.endings, event === 'stop' ? 0 : 1, event);
    await f.owner.dispose();
  }
});

test('disposal cancels a pending worklet and observes its late rejection without creating nodes', async () => {
  const module = deferred(),
    f = fixture({ loadModule: () => module.promise });
  const pending = f.owner.create(info());
  await tick();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await f.owner.dispose();
  await rejected;
  module.reject(Error('late module failure'));
  await tick();
  assert.equal(f.contexts[0].closes, 1);
  assert.equal(f.nodes.length, 0);
  assert.deepEqual(f.stopped, ['capture-a']);
});

test('cancelling one pending ID preserves another active application audio graph', async () => {
  const module = deferred(),
    f = fixture({
      loadModule: (context) => (context.sampleRate === 48000 ? module.promise : Promise.resolve()),
    });
  const active = await f.owner.create(info('active'));
  const pending = f.owner.create({ ...info('pending'), sampleRate: 48000 });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await tick();
  assert.equal(f.owner.cancel('pending'), true);
  assert.equal(f.owner.cancel('pending'), false);
  assert.equal(f.owner.cancel('unknown'), false);
  await rejected;
  assert.deepEqual(f.stopped, ['pending']);
  assert.equal(f.contexts[0].closes, 0);
  module.resolve();
  await tick();
  await active.close();
  await f.owner.dispose();
});

test('native termination cancels a pending resume and stops the helper before context close resolves', async () => {
  const resumed = deferred(),
    closed = deferred();
  const g = fixture({
    createContext() {
      const track = { stop() {} };
      return {
        createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [track] } }),
        resume: () => resumed.promise,
        close: () => closed.promise,
      };
    },
  });
  const pending = g.owner.create(info());
  await tick();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  g.emit({ type: 'ended', id: 'capture-a' });
  await rejected;
  assert.deepEqual(g.stopped, ['capture-a']);
  assert.equal(g.endings, 1);
  resumed.resolve();
  closed.resolve();
  await tick();
  await g.owner.dispose();
});

test('invalid metadata and a native end before preparation never allocate a context', async () => {
  const f = fixture();
  for (const value of [
    null,
    {},
    { ...info(), id: '' },
    { ...info(), sampleRate: NaN },
    { ...info(), channels: 1 },
  ])
    await assert.rejects(f.owner.create(value));
  assert.equal(f.contexts.length, 0);
  assert.equal(f.stopped.length, 0);
  const pending = f.owner.create(info());
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  f.emit({ type: 'ended', id: 'capture-a' });
  await rejected;
  assert.equal(f.contexts.length, 0);
  assert.deepEqual(f.stopped, ['capture-a']);
  await f.owner.dispose();
});

test('failed setup and disposed owners do not retain native jobs or create replacement graphs', async () => {
  const f = fixture({
    loadModule: async () => {
      throw Error('module unavailable');
    },
  });
  await assert.rejects(f.owner.create(info()), /module unavailable/);
  await tick();
  assert.deepEqual(f.stopped, ['capture-a']);
  assert.equal(f.contexts[0].closes, 1);
  await f.owner.dispose();
  await assert.rejects(f.owner.create(info('other')), { name: 'AbortError' });
  assert.equal(f.contexts.length, 1);
});

test('runtime disposal removes the native and page listeners and cannot remove a later installation', async () => {
  const target = new EventTarget();
  let subscriptions = 0,
    releases = 0;
  target.TronoDesktop = {
    onApplicationAudio() {
      subscriptions++;
      return () => {
        releases++;
      };
    },
    ackApplicationAudio() {},
    async stopApplicationAudio() {},
  };
  const dispose = initializeApplicationAudio(target);
  assert.strictEqual(initializeApplicationAudio(target), dispose);
  assert.equal(subscriptions, 1);
  await dispose();
  assert.equal(target.TronoApplicationAudio, undefined);
  const second = initializeApplicationAudio(target),
    facade = target.TronoApplicationAudio;
  await dispose();
  assert.strictEqual(target.TronoApplicationAudio, facade);
  assert.strictEqual(initializeApplicationAudio(target), second);
  target.dispatchEvent(new Event('pagehide'));
  await second();
  assert.equal(target.TronoApplicationAudio, undefined);
  assert.equal(subscriptions, 2);
  assert.equal(releases, 2);
});
