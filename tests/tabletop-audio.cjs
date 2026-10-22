'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTabletopAudio } = require('../src/lib/games/tabletop-audio.ts');
function fixture() {
  const events = new EventTarget(),
    volumes = { throne: 80, azul: 80, splendor: 90, 'love-letter': 80 },
    played = [],
    warnings = [];
  let enabled = true,
    prepares = 0,
    writes = 0,
    ready = () => Promise.resolve();
  const audio = {
    get sfxEnabled() {
      return enabled;
    },
    gameVolume: (key) => volumes[key],
    setGameVolume(key, value) {
      writes++;
      volumes[key] = value;
      events.dispatchEvent(new Event('trono-game-volume'));
    },
    setSfxEnabled(value) {
      enabled = value;
      events.dispatchEvent(new Event('trono-audio-state'));
    },
    ensureAudio() {
      prepares++;
      return ready();
    },
    playSfx(kind, key) {
      played.push([kind, key]);
    },
  };
  const controller = createTabletopAudio({ audio, events, warn: (error) => warnings.push(error) });
  return {
    controller,
    audio,
    events,
    volumes,
    played,
    warnings,
    ready(fn) {
      ready = fn;
    },
    get prepares() {
      return prepares;
    },
    get writes() {
      return writes;
    },
  };
}
test('independent gains project the existing source, with immutable stable snapshots and one subscription per event', () => {
  const f = fixture(),
    counts = new Map();
  const add = f.events.addEventListener.bind(f.events),
    remove = f.events.removeEventListener.bind(f.events);
  f.events.addEventListener = (name, ...args) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
    add(name, ...args);
  };
  f.events.removeEventListener = (name, ...args) => {
    counts.set(name, counts.get(name) - 1);
    remove(name, ...args);
  };
  const initial = f.controller.getSnapshot();
  assert(Object.isFrozen(initial));
  assert(Object.isFrozen(initial.volumes));
  f.controller.start();
  f.controller.start();
  assert.equal(f.controller.getSnapshot(), initial);
  let changes = 0;
  f.controller.subscribe(() => changes++);
  f.audio.setGameVolume('splendor', 37);
  assert.deepEqual(f.controller.getSnapshot().volumes, {
    throne: 80,
    azul: 80,
    splendor: 37,
    'love-letter': 80,
  });
  assert.equal(changes, 1);
  f.events.dispatchEvent(new Event('trono-game-volume'));
  assert.equal(changes, 1);
  f.controller.setVolume('azul', 24);
  assert.equal(changes, 2);
  assert.deepEqual(initial.volumes, { throne: 80, azul: 80, splendor: 90, 'love-letter': 80 });
  assert.deepEqual([...counts.values()], [1, 1]);
  f.controller.dispose();
  f.controller.dispose();
  assert.deepEqual([...counts.values()], [0, 0]);
  f.audio.setGameVolume('throne', 18);
  assert.equal(changes, 2);
});
test('mute restores the last audible gain independently; global silence preserves individual gains', () => {
  const f = fixture();
  f.controller.start();
  f.controller.setVolume('throne', 17);
  f.controller.setVolume('azul', 29);
  f.controller.toggleMute('throne');
  f.controller.toggleMute('azul');
  assert.equal(f.volumes.throne, 0);
  assert.equal(f.volumes.azul, 0);
  f.controller.toggleMute('throne');
  f.controller.toggleMute('azul');
  assert.equal(f.volumes.throne, 17);
  assert.equal(f.volumes.azul, 29);
  f.audio.setSfxEnabled(false);
  assert.equal(f.controller.getSnapshot().enabled, false);
  f.controller.enableEffects();
  assert.equal(f.controller.getSnapshot().enabled, true);
  assert.equal(f.volumes.throne, 17);
  f.audio.setGameVolume('splendor', 0);
  f.controller.toggleMute('splendor');
  assert.equal(f.volumes.splendor, 80);
  f.audio.setGameVolume('splendor', 46);
  f.controller.toggleMute('splendor');
  f.controller.toggleMute('splendor');
  assert.equal(f.volumes.splendor, 46);
});
test('one panel opens at a time and gains remain within the source contract', () => {
  const f = fixture();
  f.controller.start();
  f.controller.setOpen('throne');
  f.controller.setOpen('azul');
  assert.equal(f.controller.getSnapshot().open, 'azul');
  f.controller.setOpen(null);
  assert.equal(f.controller.getSnapshot().open, null);
  f.controller.setVolume('throne', -2);
  assert.equal(f.volumes.throne, 0);
  f.controller.setVolume('azul', 120);
  assert.equal(f.volumes.azul, 100);
  f.controller.setVolume('splendor', NaN);
  assert.equal(f.volumes.splendor, 0);
});
test('samples prepare audio in the gesture and use the existing game bus', async () => {
  const f = fixture();
  for (const [key, kind] of [
    ['throne', 'card'],
    ['azul', 'azul-place'],
    ['splendor', 'splendor-card'],
    ['love-letter', 'love-letter-card'],
  ]) {
    const count = f.prepares,
      pending = f.controller.playSample(key);
    assert.equal(f.prepares, count + 1);
    await pending;
    assert.deepEqual(f.played.at(-1), [kind, key]);
  }
});
test('hidden or replaced panels and disposal invalidate delayed audio; failures are handled and retryable', async () => {
  const f = fixture();
  let resolve;
  f.ready(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  f.controller.setOpen('throne');
  const pending = f.controller.playSample('throne');
  f.controller.setOpen('azul');
  resolve();
  await pending;
  assert.deepEqual(f.played, []);
  const closing = f.controller.playSample('azul');
  f.controller.setOpen(null);
  resolve();
  await closing;
  assert.deepEqual(f.played, []);
  const failure = new Error('Audio unavailable');
  f.ready(() => Promise.reject(failure));
  await f.controller.playSample('azul');
  assert.deepEqual(f.warnings, [failure]);
  f.ready(() => Promise.resolve());
  await f.controller.playSample('azul');
  assert.deepEqual(f.played, [['azul-place', 'azul']]);
  f.ready(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const disposing = f.controller.playSample('azul');
  f.controller.dispose();
  resolve();
  await disposing;
  const prepares = f.prepares,
    writes = f.writes;
  f.controller.setVolume('throne', 10);
  f.controller.toggleMute('azul');
  f.controller.enableEffects();
  await f.controller.playSample('throne');
  f.controller.start();
  assert.equal(f.prepares, prepares);
  assert.equal(f.writes, writes);
  assert.equal(f.played.length, 1);
});
