'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAudioPlayer } = require('../src/lib/audio/player.ts');
const { createGameEffects } = require('../src/lib/audio/effects.ts');
const { createPreferenceStorage } = require('../src/lib/storage/preferences.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function fakeContext() {
  const nodes = [],
    sources = [];
  const node = (kind) => {
    const value = new EventTarget();
    Object.assign(value, {
      kind,
      connections: [],
      disconnects: 0,
      connect(next) {
        this.connections.push(next);
      },
      disconnect() {
        this.disconnects++;
      },
    });
    nodes.push(value);
    return value;
  };
  const parameter = () => ({
    value: 0,
    calls: [],
    setValueAtTime(...args) {
      this.calls.push(['set', ...args]);
    },
    exponentialRampToValueAtTime(...args) {
      this.calls.push(['ramp', ...args]);
    },
    setTargetAtTime(...args) {
      this.calls.push(['target', ...args]);
    },
  });
  const source = (kind) => {
    const value = node(kind);
    Object.assign(value, {
      starts: [],
      stops: [],
      frequency: parameter(),
      start(...args) {
        this.starts.push(args);
      },
      stop(...args) {
        this.stops.push(args);
      },
    });
    sources.push(value);
    return value;
  };
  return {
    nodes,
    sources,
    state: 'running',
    currentTime: 0,
    sampleRate: 48000,
    closes: 0,
    destination: node('destination'),
    createGain() {
      const value = node('gain');
      value.gain = parameter();
      return value;
    },
    createOscillator: () => source('oscillator'),
    createBufferSource: () => source('buffer'),
    createBiquadFilter() {
      const value = node('filter');
      value.frequency = parameter();
      return value;
    },
    createBuffer(channels, length) {
      const data = new Float32Array(length);
      return { data, getChannelData: () => data };
    },
    async resume() {
      this.state = 'running';
    },
    async close() {
      this.closes++;
      this.state = 'closed';
    },
  };
}
function fixture({ stored = {}, desktop = true, play, createContext } = {}) {
  const values = new Map(Object.entries(stored)),
    contexts = [],
    events = [],
    warnings = [];
  const storage = createPreferenceStorage(() => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }));
  let url = '';
  const media = {
    paused: true,
    muted: false,
    volume: 1,
    dataset: {},
    loads: 0,
    plays: 0,
    pauses: 0,
    get src() {
      return url;
    },
    set src(value) {
      url = new URL(value, 'https://app.test/').href;
    },
    load() {
      this.loads++;
    },
    pause() {
      this.pauses++;
      this.paused = true;
    },
    async play() {
      this.plays++;
      if (play) await play();
      this.paused = false;
    },
  };
  const owner = createAudioPlayer({
    storage,
    desktop,
    href: 'https://app.test/',
    player: () => media,
    createContext: () => {
      const context = createContext ? createContext() : fakeContext();
      if (context) contexts.push(context);
      return context;
    },
    events: {
      dispatchEvent(event) {
        events.push(event);
        return true;
      },
    },
    warn: (error) => warnings.push(error),
  });
  return { owner, storage, values, media, contexts, events, warnings };
}
module.exports = { fakeContext };
test('preference storage survives denied getters, full storage and failed removal without resurrecting old values', () => {
  for (const getter of [
    () => {
      throw Error('denied');
    },
    () => ({
      getItem: () => 'old',
      setItem() {
        throw Error('full');
      },
      removeItem() {
        throw Error('denied');
      },
    }),
  ]) {
    const storage = createPreferenceStorage(getter);
    storage.setItem('key', 'new');
    assert.equal(storage.getItem('key'), 'new');
    storage.removeItem('key');
    assert.equal(storage.getItem('key'), null);
  }
});
test('desktop music is opt-in, web defaults are preserved and old track IDs migrate without opening audio', () => {
  assert.equal(fixture().owner.musicEnabled, false);
  assert.equal(fixture({ desktop: false }).owner.musicEnabled, true);
  for (const id of ['tavern', 'classical', '__proto__', 'missing']) {
    const f = fixture({ stored: { tronoMusicTrack: id } });
    assert.equal(f.owner.currentTrack, 'lofi');
    assert.equal(f.contexts.length, 0);
    assert.equal(f.owner.gameVolume('splendor'), 90);
    assert.equal(f.owner.gameVolume('azul'), 80);
  }
});
test('audio creation is lazy and repeated gestures reuse one context and effects bus', async () => {
  const f = fixture();
  f.owner.start();
  assert.equal(f.contexts.length, 0);
  await f.owner.ensureAudio();
  await f.owner.ensureAudio();
  assert.equal(f.contexts.length, 1);
  assert.equal(f.media.plays, 0);
  f.owner.playSfx('click');
  assert.equal(f.contexts[0].sources.length, 2);
  await f.owner.dispose();
  assert.equal(f.contexts[0].closes, 1);
});
test('game mute prevents synthesis; per-game gains and saved values remain independent', async () => {
  const f = fixture();
  await f.owner.ensureAudio();
  const context = f.contexts[0];
  f.owner.setGameVolume('splendor', 0);
  f.owner.playSfx('splendor-card');
  assert.equal(context.sources.length, 0);
  f.owner.setGameVolume('azul', 20);
  f.owner.playSfx('azul-place');
  assert.equal(context.sources.length, 2);
  f.owner.setGameVolume('azul', 50);
  const bus = context.nodes.find((node) => node.gain?.calls.some((call) => call[0] === 'target'));
  assert.deepEqual(bus.gain.calls.at(-1), ['target', 0.5, 0, 0.02]);
  assert.equal(f.owner.gameVolume('splendor'), 0);
  assert.equal(f.values.get('mnGameVolume:azul'), '50');
  f.owner.setSfxEnabled(false);
  f.owner.playSfx('crown');
  assert.equal(context.sources.length, 2);
  await f.owner.dispose();
});
test('volume and track updates publish immutable state, matching compatibility events and saved keys', async () => {
  const f = fixture();
  let updates = 0;
  const unsubscribe = f.owner.subscribe(() => updates++);
  f.owner.setMusicVolume(123);
  f.owner.setMusicTrack('rock', { play: false });
  f.owner.setSfxEnabled(false);
  assert.equal(f.owner.musicVolume, 100);
  assert.equal(f.values.get('tronoMusicTrack'), 'rock');
  assert(Object.isFrozen(f.owner.getSnapshot().volumes));
  assert.equal(updates, 3);
  assert.deepEqual(
    f.events.map((event) => event.type),
    ['trono-music-volume', 'trono-music-track', 'trono-audio-state'],
  );
  f.owner.setMusicTrack('__proto__');
  f.owner.setGameVolume('invalid', 2);
  assert.equal(updates, 3);
  unsubscribe();
  await f.owner.dispose();
});
test('a rejected old play request cannot overwrite a newer track status', async () => {
  const first = deferred(),
    second = deferred(),
    requests = [first, second];
  const f = fixture({ play: () => requests.shift().promise });
  await f.owner.setMusicEnabled(true);
  f.owner.setMusicTrack('rock');
  first.reject(Error('old failure'));
  await tick();
  assert.equal(f.owner.musicStatus, 'Carregando música…');
  second.resolve();
  await tick();
  assert.equal(f.owner.musicStatus, '');
  assert.equal(f.warnings.length, 0);
  await f.owner.dispose();
});
test('muting while playback waits keeps the player paused after a late fulfillment', async () => {
  const playing = deferred(),
    f = fixture({ play: () => playing.promise });
  await f.owner.setMusicEnabled(true);
  await f.owner.setMusicEnabled(false);
  playing.resolve();
  await tick();
  assert.equal(f.media.paused, true);
  assert.equal(f.owner.musicStatus, 'Música silenciada.');
  assert.equal(f.values.get('tronoMusicEnabled'), '0');
  await f.owner.dispose();
});
test('music errors switch once to the distributed fallback and choosing another track resets it', async () => {
  const f = fixture();
  f.owner.start();
  assert.match(f.media.src, /opengameart/);
  f.owner.handleMusicError();
  assert.match(f.media.src, /classical_piano_nocturne.mp3$/);
  const loads = f.media.loads;
  f.owner.handleMusicError();
  assert.equal(f.media.loads, loads);
  f.owner.setMusicTrack('edm', { play: false });
  assert.equal(f.media.dataset.musicFallback, '0');
  assert.match(f.media.src, /joyfully/);
  await f.owner.dispose();
});
test('missing Web Audio does not disable HTML music playback', async () => {
  const f = fixture({ createContext: () => null });
  await f.owner.setMusicEnabled(true);
  await tick();
  assert.equal(f.media.paused, false);
  assert.equal(f.contexts.length, 0);
  await f.owner.dispose();
});
test('partial graph failure closes its context and a later user gesture can retry', async () => {
  let calls = 0;
  const context = fakeContext();
  context.createGain = () => {
    throw Error('graph failure');
  };
  const f = fixture({ createContext: () => (calls++ ? fakeContext() : context) });
  await f.owner.ensureAudio();
  await tick();
  assert.equal(context.closes, 1);
  await f.owner.ensureAudio();
  assert.equal(f.contexts.length, 2);
  await f.owner.dispose();
});
test('disposal releases only the owned context, sources and player and invalidates pending playback', async () => {
  const playing = deferred(),
    f = fixture({ play: () => playing.promise });
  await f.owner.setMusicEnabled(true);
  f.owner.playSfx('crown');
  const context = f.contexts[0];
  await f.owner.dispose();
  await f.owner.dispose();
  assert.equal(context.closes, 1);
  assert(context.sources.every((source) => source.disconnects === 1));
  playing.resolve();
  await tick();
  assert.equal(f.media.paused, true);
  const snapshot = f.owner.getSnapshot();
  f.owner.setMusicTrack('rock');
  f.owner.setMusicVolume(2);
  assert.strictEqual(f.owner.getSnapshot(), snapshot);
  assert.equal(await f.owner.ensureAudio(), false);
});
test('finished effects disconnect their graph and are not stopped or disconnected again on disposal', () => {
  const context = fakeContext(),
    effects = createGameEffects();
  effects.play(context, context.destination, 'azul-place');
  const source = context.sources[0];
  source.dispatchEvent(new Event('ended'));
  assert.equal(source.disconnects, 1);
  const stops = source.stops.length;
  effects.dispose();
  effects.dispose();
  assert.equal(source.stops.length, stops);
  assert.equal(source.disconnects, 1);
});
