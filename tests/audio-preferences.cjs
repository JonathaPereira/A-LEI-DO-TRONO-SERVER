'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/audio-preferences.ts');

async function setup(t) {
  const { createAudioPreferences } = await modulePromise;
  const events = new EventTarget(),
    calls = [],
    storage = new Map(),
    warnings = [];
  const state = {
    sfxEnabled: true,
    musicEnabled: false,
    musicVolume: 32,
    currentTrack: 'lofi',
    musicStatus: '',
    alertVolume: 85,
    protection: true,
  };
  const audio = {
    get sfxEnabled() {
      return state.sfxEnabled;
    },
    get musicEnabled() {
      return state.musicEnabled;
    },
    get musicVolume() {
      return state.musicVolume;
    },
    get currentTrack() {
      return state.currentTrack;
    },
    get musicStatus() {
      return state.musicStatus;
    },
    toggleSfx() {
      calls.push('sfx');
      return (state.sfxEnabled = !state.sfxEnabled);
    },
    async toggleMusic() {
      calls.push('music');
      return (state.musicEnabled = !state.musicEnabled);
    },
    setMusicTrack(id) {
      calls.push(['track', id]);
      state.currentTrack = id;
    },
    setMusicVolume(value) {
      calls.push(['volume', value]);
      state.musicVolume = value;
    },
  };
  const options = {
    audio: () => audio,
    tracks: () => ({ lofi: { label: 'Lo-fi', artist: 'A' }, rock: { label: 'Rock', artist: 'B' } }),
    events,
    storage: { setItem: (key, value) => storage.set(key, value) },
    alerts: {
      getSnapshot: () => ({ volume: state.alertVolume }),
      setVolume(value) {
        calls.push(['alert-volume', value]);
        state.alertVolume = value;
      },
      prime() {
        calls.push('prime');
      },
      play(...args) {
        calls.push(['play', ...args]);
      },
    },
    protection: {
      getSnapshot: () => ({ enabled: state.protection }),
      configureProtection(value) {
        calls.push(['protection', value]);
        state.protection = value;
      },
    },
    warn: (error) => warnings.push(error),
  };
  const client = createAudioPreferences(options);
  t.after(client.dispose);
  return { client, state, audio, events, calls, storage, warnings, options };
}

test('projection is stable and external player events update every preference without polling', async (t) => {
  const { client, state, events } = await setup(t);
  const initial = client.getSnapshot();
  let updates = 0;
  const unsubscribe = client.subscribe(() => updates++);
  client.start();
  client.start();
  assert.equal(updates, 0);
  assert.strictEqual(client.getSnapshot(), initial);
  state.sfxEnabled = false;
  state.musicEnabled = true;
  events.dispatchEvent(new Event('trono-audio-state'));
  state.currentTrack = 'rock';
  events.dispatchEvent(new Event('trono-music-track'));
  state.musicVolume = 61;
  events.dispatchEvent(new Event('trono-music-volume'));
  state.musicStatus = 'Bloqueada';
  events.dispatchEvent(new Event('trono-music-playback'));
  assert.equal(updates, 4);
  const next = client.getSnapshot();
  assert.deepEqual(
    [next.sfxEnabled, next.musicEnabled, next.currentTrack, next.musicVolume, next.musicStatus],
    [false, true, 'rock', 61, 'Bloqueada'],
  );
  assert.strictEqual(initial.tracks, next.tracks);
  assert(Object.isFrozen(next));
  assert(Object.isFrozen(next.tracks[0]));
  events.dispatchEvent(new Event('trono-music-playback'));
  assert.equal(updates, 4);
  unsubscribe();
  state.musicVolume = 62;
  events.dispatchEvent(new Event('trono-music-volume'));
  assert.equal(updates, 4);
  assert.equal(client.getSnapshot().musicVolume, 62);
});

test('music starts in the original gesture and pending completion reads the current owner', async (t) => {
  const { client, audio, state, calls } = await setup(t);
  let finish;
  audio.toggleMusic = () => {
    calls.push('gesture');
    state.musicEnabled = true;
    return new Promise((resolve) => (finish = resolve));
  };
  const pending = client.toggleMusic();
  assert.deepEqual(calls, ['gesture']);
  assert.equal(client.getSnapshot().musicEnabled, true);
  state.musicEnabled = false;
  finish(true);
  await pending;
  assert.equal(client.getSnapshot().musicEnabled, false);
  await client.toggleSfx();
  assert.equal(client.getSnapshot().sfxEnabled, false);
});

test('music volume is clamped and duplicate input/change is applied once; tracks require the catalog', async (t) => {
  const { client, calls } = await setup(t);
  const input = client.setMusicVolume('72'),
    change = client.setMusicVolume('72');
  await Promise.all([input, change]);
  await client.setMusicVolume(500);
  await client.setMusicVolume('invalid');
  await client.selectTrack('rock');
  await client.selectTrack('__proto__');
  assert.deepEqual(calls, [
    ['volume', 72],
    ['volume', 100],
    ['volume', 0],
    ['track', 'rock'],
  ]);
  assert.equal(client.getSnapshot().currentTrack, 'rock');
});

test('alert warmup and preview stay synchronous and retain the original alert owner', async (t) => {
  const { client, calls } = await setup(t);
  const pending = client.setAlertVolume(45);
  assert.deepEqual(calls, [['alert-volume', 45], 'prime']);
  await pending;
  await client.setAlertVolume('45');
  const preview = client.testAlert();
  assert.deepEqual(calls, [['alert-volume', 45], 'prime', 'prime', ['play', 'join', 'test']]);
  await preview;
  assert.equal(client.getSnapshot().alertVolume, 45);
});

test('protection delegates once, persists and reflects external telemetry updates', async (t) => {
  const { client, state, calls, storage } = await setup(t);
  await client.setProtection(false);
  await client.setProtection(false);
  assert.deepEqual(calls, [['protection', false]]);
  assert.equal(storage.get('mnVoiceProtection'), '0');
  assert.equal(client.getSnapshot().protection, false);
  state.protection = true;
  client.refresh();
  assert.equal(client.getSnapshot().protection, true);
});

test('player failures are reported while playback status remains owned by the player', async (t) => {
  const { client, audio, state, warnings } = await setup(t);
  const failure = new Error('blocked');
  audio.toggleMusic = async () => {
    state.musicStatus = 'Clique para liberar';
    throw failure;
  };
  await client.toggleMusic();
  assert.deepEqual(warnings, [failure]);
  assert.equal(client.getSnapshot().musicStatus, 'Clique para liberar');
});

test('dispose removes the exact subscriptions and invalidates pending UI updates without disposing borrowed media', async (t) => {
  const { client, events, state, audio, calls, options } = await setup(t);
  let added = 0,
    removed = 0,
    updates = 0,
    finish;
  const add = events.addEventListener.bind(events),
    remove = events.removeEventListener.bind(events);
  events.addEventListener = (...args) => {
    added++;
    add(...args);
  };
  events.removeEventListener = (...args) => {
    removed++;
    remove(...args);
  };
  audio.dispose =
    options.alerts.dispose =
    options.protection.dispose =
      () => assert.fail('borrowed media disposed');
  client.getSnapshot();
  client.start();
  client.start();
  assert.equal(added, 4);
  client.subscribe(() => updates++);
  audio.toggleMusic = () => new Promise((resolve) => (finish = resolve));
  const pending = client.toggleMusic(),
    before = client.getSnapshot();
  client.dispose();
  client.dispose();
  assert.equal(removed, 4);
  state.musicVolume = 99;
  state.musicEnabled = true;
  finish(true);
  await pending;
  events.dispatchEvent(new Event('trono-music-volume'));
  await client.toggleSfx();
  await client.setAlertVolume(30);
  await client.setProtection(false);
  client.start();
  assert.equal(updates, 0);
  assert.equal(added, 4);
  assert.strictEqual(client.getSnapshot(), before);
  assert.deepEqual(calls, []);
});
