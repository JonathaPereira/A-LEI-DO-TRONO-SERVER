'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/media-focus.ts');
const visibilityPromise = import('../src/lib/voice/media-visibility.ts');
function gate() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function classes(...initial) {
  const values = new Set(initial);
  return {
    contains: (value) => values.has(value),
    add: (value) => values.add(value),
    remove: (value) => values.delete(value),
    toggle(value, active) {
      if (active) values.add(value);
      else values.delete(value);
    },
  };
}
class Tile extends EventTarget {
  constructor(kind = 'screen-share-tile') {
    super();
    this.classList = classes(kind);
    this.isConnected = true;
    this.dataset = { peer: 'peer' };
    this.video = new EventTarget();
    this.video.srcObject = { borrowed: true };
    this.video.pause = () => {
      this.video.paused = true;
    };
  }
  querySelector() {
    return this.video;
  }
  matches() {
    return this.classList.contains('camera-tile') || this.classList.contains('screen-share-tile');
  }
}
async function setup(t) {
  const { createMediaFocus } = await modulePromise;
  const doc = new EventTarget(),
    calls = [],
    warnings = [];
  doc.body = { classList: classes() };
  doc.fullscreenElement = null;
  doc.defaultView = { HTMLElement: Tile };
  doc.exitFullscreen = async () => {
    calls.push('exit');
    doc.fullscreenElement = null;
    doc.dispatchEvent(new Event('fullscreenchange'));
  };
  const call = { joined: true, generation: 1 },
    tile = new Tile();
  const client = createMediaFocus({
    document: doc,
    call: () => call,
    closeMosaic: () => calls.push('mosaic'),
    expandScreen: () => calls.push('expand'),
    setLayer: async (tile, high) => calls.push(['layer', tile, high]),
    restoreLayers: async () => calls.push('restore'),
    onChange: () => calls.push('refresh'),
    warn: (error) => warnings.push(error),
  });
  client.start();
  t.after(client.dispose);
  return { client, doc, tile, call, calls, warnings };
}
test('native fullscreen starts in the gesture; quality follows entry and exit', async (t) => {
  const { client, doc, tile, calls } = await setup(t),
    entry = gate();
  tile.requestFullscreen = () => {
    calls.push('request');
    return entry.promise;
  };
  const pending = client.toggle(tile);
  assert.deepEqual(calls, ['mosaic', 'expand', 'request']);
  doc.fullscreenElement = tile;
  doc.dispatchEvent(new Event('fullscreenchange'));
  entry.resolve();
  await pending;
  assert.equal(doc.body.classList.contains('native-fullscreen-media'), true);
  assert.deepEqual(calls.at(-1), ['layer', tile, true]);
  await client.toggle(tile);
  assert.equal(doc.fullscreenElement, null);
  assert.equal(doc.body.classList.contains('native-fullscreen-media'), false);
  assert(calls.includes('restore'));
  assert.deepEqual(calls.at(-2), ['layer', tile, false]);
  assert.deepEqual(tile.video.srcObject, { borrowed: true });
});
test('rejected native fullscreen uses the original tile; Escape clears focus and consumes only that event', async (t) => {
  const { client, doc, tile, warnings, calls } = await setup(t);
  tile.requestFullscreen = async () => {
    throw Error('denied');
  };
  await client.toggle(tile);
  assert.equal(tile.classList.contains('media-maximized'), true);
  assert.equal(doc.body.classList.contains('media-focus-open'), true);
  assert.equal(warnings.length, 1);
  const event = new Event('keydown', { cancelable: true });
  event.key = 'Escape';
  doc.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(tile.classList.contains('media-maximized'), false);
  assert.equal(doc.body.classList.contains('media-focus-open'), false);
  assert.deepEqual(calls.at(-2), ['layer', tile, false]);
  const next = new Event('keydown', { cancelable: true });
  next.key = 'Escape';
  doc.dispatchEvent(next);
  assert.equal(next.defaultPrevented, false);
});
test('hide invalidates a pending native request; rejection cannot restore viewport focus', async (t) => {
  const { client, tile, warnings } = await setup(t),
    entry = gate();
  tile.requestFullscreen = () => entry.promise;
  const pending = client.toggle(tile);
  await client.release(tile);
  entry.reject(Error('late rejection'));
  await pending;
  assert.equal(tile.classList.contains('media-maximized'), false);
  assert.deepEqual(warnings, []);
});
test('late native entry after leave or tile removal exits without requesting a high layer', async (t) => {
  for (const invalidate of [
    (s) => {
      s.call.generation++;
      s.call.joined = false;
    },
    (s) => {
      s.tile.isConnected = false;
    },
  ]) {
    const s = await setup(t),
      entry = gate();
    s.tile.requestFullscreen = () => entry.promise;
    const pending = s.client.toggle(s.tile);
    invalidate(s);
    s.doc.fullscreenElement = s.tile;
    s.doc.dispatchEvent(new Event('fullscreenchange'));
    entry.resolve();
    await pending;
    assert.equal(s.doc.fullscreenElement, null);
    assert.equal(
      s.calls.some((row) => Array.isArray(row) && row[0] === 'layer' && row[2]),
      false,
    );
    assert.deepEqual(s.tile.video.srcObject, { borrowed: true });
  }
});
test('an older native rejection cannot replace the newer fallback tile', async (t) => {
  const { client, tile, warnings } = await setup(t),
    entry = gate(),
    newer = new Tile('camera-tile');
  tile.requestFullscreen = () => entry.promise;
  const pending = client.toggle(tile);
  await client.toggle(newer);
  entry.reject(Error('superseded'));
  await pending;
  assert.equal(newer.classList.contains('media-maximized'), true);
  assert.equal(tile.classList.contains('media-maximized'), false);
  assert.deepEqual(warnings, []);
});
test('an old fullscreen completion cannot exit a newer request using the same tile', async (t) => {
  const { client, doc, tile, calls } = await setup(t),
    old = gate(),
    fresh = gate();
  tile.requestFullscreen = () => old.promise;
  const first = client.toggle(tile);
  await client.release(tile);
  tile.requestFullscreen = () => fresh.promise;
  const second = client.toggle(tile);
  doc.fullscreenElement = tile;
  doc.dispatchEvent(new Event('fullscreenchange'));
  fresh.resolve();
  await second;
  const count = calls.length;
  old.resolve();
  await first;
  assert.equal(doc.fullscreenElement, tile);
  assert.equal(calls.length, count);
});
test('video fullscreen fallback releases its end listener and restores quality without touching the stream', async (t) => {
  const { client, tile, calls } = await setup(t);
  tile.video.webkitEnterFullscreen = () => calls.push('webkit-enter');
  tile.video.webkitExitFullscreen = () => calls.push('webkit-exit');
  await client.toggle(tile);
  assert(calls.includes('webkit-enter'));
  assert.deepEqual(calls.at(-1), ['layer', tile, true]);
  tile.video.dispatchEvent(new Event('webkitendfullscreen'));
  assert.deepEqual(calls.at(-2), ['layer', tile, false]);
  const count = calls.length;
  tile.video.dispatchEvent(new Event('webkitendfullscreen'));
  assert.equal(calls.length, count);
  await client.toggle(tile);
  await client.release(tile);
  assert(calls.includes('webkit-exit'));
  assert.deepEqual(tile.video.srcObject, { borrowed: true });
});
test('visibility detaches a borrowed player immediately while awaiting native exit', async (t) => {
  const { createMediaVisibility } = await visibilityPromise;
  const { client, doc, tile } = await setup(t),
    exit = gate();
  doc.querySelectorAll = () => [tile];
  doc.fullscreenElement = tile;
  doc.exitFullscreen = () => exit.promise;
  const visibility = createMediaVisibility({ document: doc, releaseFocus: client.release });
  let finished = false;
  const pending = visibility.hide('peer', 'screen').then(() => (finished = true));
  assert.equal(tile.video.srcObject, null);
  assert.equal(tile.video.paused, true);
  assert.equal(finished, false);
  doc.fullscreenElement = null;
  exit.resolve();
  await pending;
  assert.equal(finished, true);
});
test('reset clears viewport focus, keeps unrelated fullscreen and disposal removes its keyboard listener', async (t) => {
  const { client, doc, tile, calls } = await setup(t);
  await client.toggle(tile);
  await client.reset();
  assert.equal(tile.classList.contains('media-maximized'), false);
  const game = new Tile('game');
  doc.fullscreenElement = game;
  await client.reset();
  assert.equal(doc.fullscreenElement, game);
  doc.fullscreenElement = null;
  await client.toggle(tile);
  client.dispose();
  const count = calls.length;
  const event = new Event('keydown', { cancelable: true });
  event.key = 'Escape';
  doc.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(calls.length, count);
  await client.toggle(tile);
  assert.equal(tile.classList.contains('media-maximized'), false);
});

test('Escape exits native media fullscreen without detaching its borrowed video', async (t) => {
  const { client, doc, tile, calls } = await setup(t);
  tile.requestFullscreen = async () => {
    doc.fullscreenElement = tile;
    doc.dispatchEvent(new Event('fullscreenchange'));
  };
  await client.toggle(tile);
  const event = new Event('keydown', { cancelable: true });
  event.key = 'Escape';
  doc.dispatchEvent(event);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(doc.fullscreenElement, null);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(tile.video.srcObject, { borrowed: true });
  assert(calls.includes('exit'));
});
