'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDesktopCapture } = require('../src/lib/desktop/capture.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function track(kind = 'video') {
  const value = new EventTarget(),
    listeners = new Set();
  const add = value.addEventListener.bind(value),
    remove = value.removeEventListener.bind(value);
  Object.assign(value, {
    kind,
    stops: 0,
    stop() {
      this.stops++;
    },
    addEventListener(type, fn, options) {
      listeners.add(fn);
      add(type, fn, options);
    },
    removeEventListener(type, fn) {
      listeners.delete(fn);
      remove(type, fn);
    },
    listeners,
  });
  return value;
}
function stream(...tracks) {
  return {
    getTracks: () => [...tracks],
    getVideoTracks: () => tracks.filter((item) => item.kind === 'video'),
    addTrack(value) {
      tracks.push(value);
    },
  };
}
const info = { id: 'audio-one', sampleRate: 48000, channels: 2 };
const request = (patch = {}) => ({
  id: 'capture-one',
  audio: true,
  windows: true,
  applicationAudio: true,
  sources: [
    { id: 'screen:1:0', name: 'Tela', thumbnail: '' },
    { id: 'window:2:0', name: '<Jogo>', thumbnail: '' },
  ],
  ...patch,
});
function fixture(options = {}) {
  let received,
    cancelled,
    subscriptions = 0,
    releases = 0,
    closes = 0;
  const video = track(),
    audio = track('audio'),
    media = stream(video),
    pending = deferred();
  const choices = [],
    stops = [],
    warnings = [],
    constraints = [],
    created = [];
  let closed = false;
  const pipe = {
    track: audio,
    async close() {
      if (!closed) {
        closed = true;
        closes++;
      }
    },
  };
  const owner = createDesktopCapture({
    native: {
      onCapture(fn) {
        received = fn;
        subscriptions++;
        return () => {
          releases++;
          received = null;
        };
      },
      onCaptureCancel(fn) {
        cancelled = fn;
        subscriptions++;
        return () => {
          releases++;
          cancelled = null;
        };
      },
      async selectCapture(choice) {
        choices.push(choice);
        return options.select ? options.select(choice) : { selected: !!choice.source };
      },
      async stopApplicationAudio(id) {
        stops.push(id);
      },
    },
    getDisplayMedia(value) {
      constraints.push(value);
      return pending.promise;
    },
    async createAudio(value) {
      created.push(value);
      return options.createAudio ? options.createAudio(value) : pipe;
    },
    cancelAudio: options.cancelAudio ?? (() => false),
    warn: (error) => warnings.push(error),
  });
  return {
    owner,
    video,
    audio,
    media,
    pending,
    choices,
    stops,
    warnings,
    constraints,
    created,
    pipe,
    emit: (value) => received?.(value),
    cancel: (id) => cancelled?.({ id }),
    get closes() {
      return closes;
    },
    get subscriptions() {
      return subscriptions;
    },
    get releases() {
      return releases;
    },
    begin(value = request()) {
      const result = owner.capture();
      received(value);
      return result;
    },
  };
}
test('native requests are copied and frozen; remote thumbnails and duplicate IDs are rejected', async () => {
  const f = fixture(),
    input = request();
  input.sources[0].thumbnail = 'https://remote.invalid/preview';
  const result = f.begin(input);
  input.sources[0].name = 'changed';
  input.sources.length = 0;
  const state = f.owner.getSnapshot();
  assert.equal(state.request.sources[0].name, 'Tela');
  assert.equal(state.request.sources[0].thumbnail, '');
  assert(Object.isFrozen(state) && Object.isFrozen(state.request.sources[0]));
  f.emit(request({ id: 'other', sources: [request().sources[0], request().sources[0]] }));
  await tick();
  assert.deepEqual(f.choices, [{ id: 'other', source: null, audioMode: 'none', audioSource: '' }]);
  assert.equal(f.owner.getSnapshot().request.id, 'capture-one');
  f.owner.cancel();
  f.pending.resolve(f.media);
  await assert.rejects(result, { name: 'AbortError' });
  f.owner.dispose();
});
test('capture forwards the exact options once and rejects another pending capture', async () => {
  const f = fixture(),
    options = { video: { frameRate: 60 }, audio: true };
  const first = f.owner.capture(options);
  await assert.rejects(f.owner.capture(), { name: 'InvalidStateError' });
  f.pending.resolve(f.media);
  assert.strictEqual(await first, f.media);
  assert.strictEqual(f.constraints[0], options);
  assert.equal(f.constraints.length, 1);
  f.owner.dispose();
  assert.equal(f.video.stops, 0);
  await assert.rejects(f.owner.capture(), { name: 'AbortError' });
});
test('screen audio requires an explicit application; window audio uses the selected window', async () => {
  for (const source of ['screen:1:0', 'window:2:0']) {
    const f = fixture(),
      result = f.begin();
    assert.equal(f.owner.confirm(), false);
    f.owner.selectSource(source);
    if (source.startsWith('screen:')) {
      assert.equal(f.owner.confirm(), false);
      assert.match(f.owner.getSnapshot().message, /Escolha o aplicativo/);
      f.owner.setAudioSource('screen:1:0');
      assert.equal(f.owner.getSnapshot().audioSource, '');
      f.owner.setAudioSource('window:2:0');
    }
    assert.equal(f.owner.confirm(), true);
    f.pending.resolve(f.media);
    assert.strictEqual(await result, f.media);
    assert.deepEqual(f.choices[0], {
      id: 'capture-one',
      source,
      audioMode: 'application',
      audioSource: source.startsWith('screen:') ? 'window:2:0' : '',
    });
    f.owner.dispose();
  }
});
test('unsupported audio modes cannot be enabled and video-only requests never select audio', async () => {
  for (const audio of [true, false]) {
    const f = fixture(),
      result = f.begin(request({ audio, windows: false, applicationAudio: false }));
    for (const mode of ['application', 'system', 'invalid']) f.owner.setAudioMode(mode);
    assert.equal(f.owner.getSnapshot().audioMode, 'none');
    f.owner.selectSource('window:2:0');
    f.owner.confirm();
    f.pending.resolve(f.media);
    await result;
    assert.equal(f.choices[0].audioMode, 'none');
    f.owner.dispose();
  }
});
test('duplicates preserve the current selection and stale native cancellation cannot hide it', async () => {
  const f = fixture(),
    result = f.begin();
  f.owner.selectSource('window:2:0');
  f.emit(request());
  f.cancel('stale');
  assert.equal(f.owner.getSnapshot().source, 'window:2:0');
  f.cancel('capture-one');
  assert.equal(f.owner.getSnapshot().request, null);
  f.pending.reject(new DOMException('cancelled', 'NotAllowedError'));
  await assert.rejects(result, { name: 'NotAllowedError' });
  f.owner.dispose();
});
test('cancel sends one native cancellation and releases any stream returned by a late native response', async () => {
  const f = fixture(),
    result = f.begin();
  assert.equal(f.owner.cancel(), true);
  assert.equal(f.owner.cancel(), false);
  f.pending.resolve(f.media);
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(f.choices[0].source, null);
  assert.equal(f.video.stops, 1);
  f.owner.dispose();
  assert.equal(f.releases, 2);
});
test('video stop, native ended and page disposal close application audio once without stopping returned video', async () => {
  for (const end of ['stop', 'ended', 'dispose']) {
    const f = fixture({ select: () => ({ selected: true, audio: info }) });
    const original = f.video.stop,
      result = f.begin();
    f.owner.selectSource('window:2:0');
    f.owner.confirm();
    f.pending.resolve(f.media);
    assert.strictEqual(await result, f.media);
    assert.deepEqual(f.created, [info]);
    assert.equal(f.media.getTracks().length, 2);
    if (end === 'stop') f.video.stop();
    if (end === 'ended') f.video.dispatchEvent(new Event('ended'));
    f.owner.dispose();
    await tick();
    assert.equal(f.closes, 1, end);
    assert.equal(f.video.listeners.size, 0, end);
    assert.strictEqual(f.video.stop, original);
    assert.equal(f.video.stops, end === 'stop' ? 1 : 0, end);
  }
});
test('malformed audio replies release their native job and video without starting an audio graph', async () => {
  const f = fixture({ select: () => ({ selected: true, audio: { ...info, channels: 1 } }) });
  const result = f.begin();
  f.owner.selectSource('window:2:0');
  f.owner.confirm();
  f.pending.resolve(f.media);
  await assert.rejects(result, /áudio inválida/);
  assert.deepEqual(f.stops, [info.id]);
  assert.equal(f.created.length, 0);
  assert.equal(f.video.stops, 1);
  f.owner.dispose();
});
test('native errors take precedence and selection rejection is observed before media resolves', async () => {
  for (const selection of [
    () => ({ selected: false, error: 'native error' }),
    () => {
      throw Error('IPC error');
    },
  ]) {
    const f = fixture({ select: selection }),
      result = f.begin();
    f.owner.selectSource('window:2:0');
    f.owner.confirm();
    await tick();
    f.pending.resolve(f.media);
    await assert.rejects(result, /native error|IPC error/);
    assert.equal(f.video.stops, 1);
    f.owner.dispose();
  }
});
test('disposal cancels the current picker, releases subscriptions and stops a late stream exactly once', async () => {
  const f = fixture(),
    result = f.begin();
  f.owner.dispose();
  f.owner.dispose();
  f.pending.resolve(f.media);
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(f.choices.length, 1);
  assert.equal(f.choices[0].source, null);
  assert.equal(f.video.stops, 1);
  assert.equal(f.releases, f.subscriptions);
});
test('disposal aborts only the pending audio ID and leaves unrelated native jobs alone', async () => {
  const audio = deferred(),
    cancelled = [];
  const f = fixture({
    select: () => ({ selected: true, audio: info }),
    createAudio: () => audio.promise,
    cancelAudio(id) {
      cancelled.push(id);
      audio.reject(new DOMException('cancelled', 'AbortError'));
      return true;
    },
  });
  const result = f.begin();
  f.owner.selectSource('window:2:0');
  f.owner.confirm();
  f.pending.resolve(f.media);
  await tick();
  const rejected = assert.rejects(result, { name: 'AbortError' });
  f.owner.dispose();
  await rejected;
  assert.deepEqual(cancelled, [info.id]);
  assert.deepEqual(f.stops, []);
  assert.equal(f.video.stops, 1);
});
test('an audio pipe returned after disposal is closed even if its provider cannot cancel preparation', async () => {
  const audio = deferred();
  const f = fixture({
    select: () => ({ selected: true, audio: info }),
    createAudio: () => audio.promise,
  });
  const result = f.begin();
  f.owner.selectSource('window:2:0');
  f.owner.confirm();
  f.pending.resolve(f.media);
  await tick();
  f.owner.dispose();
  audio.resolve(f.pipe);
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(f.closes, 1);
  assert.deepEqual(f.stops, [info.id]);
});

test('a native audio reply arriving after disposal releases its job without preparing a graph', async () => {
  const selection = deferred(),
    f = fixture({ select: () => selection.promise });
  const result = f.begin();
  f.owner.selectSource('window:2:0');
  f.owner.confirm();
  f.pending.resolve(f.media);
  await tick();
  f.owner.dispose();
  selection.resolve({ selected: true, audio: info });
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(f.created.length, 0);
  assert.equal(f.video.stops, 1);
  assert.deepEqual(f.stops, [info.id]);
});

test(
  'a failed video capture rejects without awaiting an audio context that is still closing',
  { timeout: 1000 },
  async () => {
    const closing = deferred(),
      f = fixture({
        select: () => ({ selected: true, audio: info }),
        createAudio: async () => ({ track: track('audio'), close: () => closing.promise }),
      });
    const result = f.begin();
    f.owner.selectSource('window:2:0');
    f.owner.confirm();
    f.pending.resolve(stream());
    await assert.rejects(result, /trilha de vídeo/);
    closing.resolve();
    f.owner.dispose();
  },
);
