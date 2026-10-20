'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReplaySession } = require('../src/lib/clips/session.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class Track extends EventTarget {
  constructor(kind, constraints) {
    super();
    this.kind = kind;
    this.readyState = 'live';
    this.constraints = constraints;
    this.applied = [];
  }
  clone() {
    return new Track(this.kind, this.constraints);
  }
  getSettings() {
    return this.kind === 'video' ? { width: 1920, height: 1080, frameRate: 60 } : {};
  }
  async applyConstraints(value) {
    this.applied.push(value);
    await this.constraints?.();
  }
  stop() {
    this.readyState = 'ended';
  }
}
const stream = (tracks) => ({
  getTracks: () => tracks,
  getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
  getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
});
function fixture(overrides = {}, environmentOverrides = {}) {
  const source = stream([new Track('video', overrides.constraints), new Track('audio')]);
  const worker = {
    messages: [],
    terminated: 0,
    postMessage(message, transfer) {
      assert.equal(this.terminated, 0, 'no posts after termination');
      this.messages.push(structuredClone(message, { transfer }));
    },
    terminate() {
      this.terminated++;
    },
    reply(reply) {
      this.onmessage?.({ data: reply });
    },
  };
  const recorder = {
    state: 'inactive',
    starts: 0,
    stops: 0,
    requests: 0,
    start(interval) {
      this.interval = interval;
      this.starts++;
      this.state = 'recording';
    },
    stop() {
      this.stops++;
      this.state = 'inactive';
      // MediaRecorder queues a final dataavailable before stop.
      queueMicrotask(() => {
        this.emit(new Blob([]));
        this.onstop?.();
      });
    },
    requestData() {
      this.requests++;
      if (this.requestError) throw this.requestError;
    },
    emit(data) {
      this.ondataavailable?.({ data });
    },
  };
  const errors = [],
    retained = [],
    configs = [],
    workers = [];
  const options = {
    source,
    owner: 'felipe',
    quality: { width: 1920, height: 1080, bitrate: 16000000, label: '1080p' },
    fps: 60,
    seconds: 30,
    isCurrent: () => true,
    onStatus() {},
    async onClip(session, clip) {
      retained.push({ session, clip });
    },
    onError: (message) => errors.push(message),
    onEnded() {},
    ...overrides,
  };
  const environment = {
    createStream: stream,
    createRecorder(_stream, config) {
      configs.push(config);
      return recorder;
    },
    createWorker() {
      workers.push(worker);
      return worker;
    },
    isTypeSupported: (mime) => mime === 'video/webm;codecs=vp8,opus',
    ...environmentOverrides,
  };
  const ready = () => worker.reply({ type: 'status', ready: true, seconds: 10, bytes: 100 });
  return {
    options,
    environment,
    source,
    worker,
    recorder,
    errors,
    retained,
    configs,
    workers,
    ready,
    create: () => createReplaySession(options, environment),
  };
}
test('cancelled preparation releases only clones before allocating recorder or worker', async () => {
  const constraints = deferred();
  let current = true,
    borrowed;
  const f = fixture(
    { constraints: () => constraints.promise, isCurrent: () => current },
    {
      createStream(tracks) {
        borrowed = stream(tracks);
        return borrowed;
      },
    },
  );
  const pending = f.create();
  current = false;
  constraints.resolve();
  assert.equal(await pending, null);
  assert.equal(f.configs.length, 0);
  assert.equal(f.workers.length, 0);
  assert(borrowed.getTracks().every((track) => track.readyState === 'ended'));
  assert(
    f.source
      .getTracks()
      .every((track) => track.readyState === 'live' && track.applied.length === 0),
  );
});
test('session keeps encoded chunks ordered, transfers buffers, and waits for persistence after stopping', async () => {
  const retained = deferred(),
    first = deferred();
  const f = fixture({ onClip: () => retained.promise });
  const s = await f.create();
  s.start();
  s.start();
  f.ready();
  assert.equal(f.recorder.starts, 1);
  assert.equal(s.quality, '1920×1080');
  assert.equal(s.fps, 60);
  assert(s.hasAudio);
  assert.equal(f.configs[0].videoBitsPerSecond, 24000000);
  assert.equal(f.configs[0].audioBitsPerSecond, 192000);
  assert.equal(f.configs[0].videoKeyFrameIntervalDuration, 2000);
  const bytes = new Uint8Array([1, 2]).buffer;
  f.recorder.emit({ size: 2, arrayBuffer: () => first.promise });
  await tick();
  s.requestClip('one');
  f.recorder.emit(new Blob([new Uint8Array([3])]));
  s.stop();
  s.stop();
  await tick();
  assert.equal(f.worker.terminated, 0);
  first.resolve(bytes);
  await tick();
  assert.equal(bytes.byteLength, 0);
  assert.deepEqual(
    f.worker.messages.map((message) => message.type),
    ['init', 'chunk', 'clip', 'chunk'],
  );
  assert.deepEqual([...new Uint8Array(f.worker.messages[1].data)], [1, 2]);
  assert.deepEqual([...new Uint8Array(f.worker.messages[3].data)], [3]);
  assert.equal(f.worker.messages[2].id, 'one');
  f.worker.reply({ type: 'clip', id: 'one', blob: new Blob(['clip']), duration: 1, bytes: 4 });
  await tick();
  assert.equal(s.pendingCount, 1);
  assert.equal(f.worker.terminated, 0);
  retained.resolve();
  await tick();
  assert.equal(s.pendingCount, 0);
  assert.equal(f.worker.terminated, 1);
  assert.equal(f.recorder.stops, 1);
  assert(s.stream.getTracks().every((track) => track.readyState === 'ended'));
  assert(
    f.source
      .getTracks()
      .every((track) => track.readyState === 'live' && track.applied.length === 0),
  );
});
test('pending clip limit and requestData errors release slots without stopping capture', async () => {
  const f = fixture(),
    s = await f.create();
  s.start();
  f.ready();
  f.recorder.requestError = Error('capture request failed');
  assert.throws(() => s.requestClip('retry'), /capture request failed/);
  assert.equal(s.pendingCount, 0);
  f.recorder.requestError = null;
  for (let i = 0; i < 4; i++) s.requestClip(String(i));
  assert.throws(() => s.requestClip('five'), /Aguarde/);
  f.recorder.emit(new Blob([]));
  await tick();
  f.worker.reply({ type: 'error', id: '0', message: 'Too early' });
  assert.equal(s.pendingCount, 3);
  assert.equal(s.stopping, false);
  s.requestClip('five');
  assert.equal(s.pendingCount, 4);
  assert.equal(f.errors.at(-1), 'Too early');
  // A fatal error discards outstanding requests, unlike a correlated clip error.
  f.worker.reply({ type: 'error', message: 'Invalid WebM' });
  await tick();
  assert.equal(s.pendingCount, 0);
  assert.equal(f.worker.terminated, 1);
});
test('worker crash during an asynchronous read stops replay once and prevents late posts', async () => {
  const chunk = deferred(),
    f = fixture(),
    s = await f.create();
  s.start();
  f.ready();
  s.requestClip('interrupted');
  f.recorder.emit({ size: 1, arrayBuffer: () => chunk.promise });
  await tick();
  f.worker.onerror();
  assert.equal(s.stopping, true);
  assert.equal(s.pendingCount, 0);
  assert.equal(f.worker.terminated, 1);
  chunk.resolve(new Uint8Array([8]).buffer);
  await tick();
  assert.equal(f.worker.messages.length, 1);
  assert.equal(f.worker.terminated, 1);
  assert.equal(f.recorder.stops, 1);
  assert.equal(f.errors.length, 1);
  assert(f.source.getTracks().every((track) => track.readyState === 'live'));
});
test('recorder fallback preserves bitrate and unsupported WebM releases clones', async () => {
  let attempts = 0;
  const f = fixture();
  const original = f.environment.createRecorder;
  f.environment.createRecorder = (stream, config) => {
    if (++attempts === 1) throw Error('keyframe hint unsupported');
    return original(stream, config);
  };
  const s = await f.create();
  assert.equal(attempts, 2);
  assert.equal(f.configs[0].videoKeyFrameIntervalDuration, undefined);
  assert.equal(f.configs[0].videoBitsPerSecond, 24000000);
  s.stop();
  assert.equal(f.worker.terminated, 1);
  let borrowed;
  const unsupported = fixture(
    {},
    {
      isTypeSupported: () => false,
      createStream(tracks) {
        borrowed = stream(tracks);
        return borrowed;
      },
    },
  );
  await assert.rejects(unsupported.create(), /Replay WebM indisponível/);
  assert(borrowed.getTracks().every((track) => track.readyState === 'ended'));
  assert(unsupported.source.getTracks().every((track) => track.readyState === 'live'));
});
test('clone ending stops session and rejected persistence cannot retain a worker forever', async () => {
  let ended = 0;
  const f = fixture({
    onEnded() {
      ended++;
    },
    async onClip() {
      throw Error('database unavailable');
    },
  });
  const s = await f.create();
  s.start();
  f.ready();
  s.requestClip('one');
  f.recorder.emit(new Blob(['packet']));
  await tick();
  f.worker.reply({ type: 'clip', id: 'one', blob: new Blob(['clip']), duration: 1, bytes: 4 });
  s.stream.getVideoTracks()[0].dispatchEvent(new Event('ended'));
  await tick();
  await tick();
  assert.equal(ended, 1);
  assert.equal(s.stopping, true);
  assert.equal(s.pendingCount, 0);
  assert.equal(f.worker.terminated, 1);
  assert.equal(f.errors.length, 1);
  assert(f.source.getTracks().every((track) => track.readyState === 'live'));
});
