'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/stage.ts');
function gate() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function setup(t) {
  const { createCallStage } = await modulePromise;
  const events = new EventTarget(),
    calls = [],
    warnings = [],
    subscribers = new Set();
  const camera = { borrowed: 'camera' },
    screen = { borrowed: 'screen' };
  const person = {
    id: 'peer',
    accountId: 'account',
    name: 'Bruno',
    avatar_preset: 'crown',
    avatar_file_id: null,
    joined: true,
    muted: false,
    deafened: false,
    camera: true,
    screen: true,
    transport: 'p2p',
    quality: 'high',
    self: false,
    hiddenCamera: false,
    watching: true,
    speaking: false,
    volume: 100,
    screenVolume: 100,
    cameraStream: camera,
    screenStream: screen,
    cameraLive: true,
    screenLive: true,
    hasScreenAudio: true,
  };
  const state = {
    generation: 1,
    joined: true,
    community: true,
    hub: true,
    publicActive: true,
    roomName: 'Geral',
    previewPaused: false,
    previewCollapsed: false,
    participants: [person],
  };
  const options = {
    read: () => state,
    onMessage(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    authEvents: events,
    toggleScreen: async (id) => calls.push(['screen', id]),
    toggleCamera: async (id) => calls.push(['camera', id]),
    setVolume(id, value) {
      calls.push(['volume', id, value]);
      person.volume = Number(value);
    },
    setScreenVolume(id, value) {
      calls.push(['screen-volume', id, value]);
      person.screenVolume = Number(value);
    },
    togglePreview: () => {
      calls.push('preview');
      state.previewPaused = !state.previewPaused;
    },
    toggleCollapsed: () => {
      calls.push('collapse');
      state.previewCollapsed = !state.previewCollapsed;
    },
    switchSource: async () => calls.push('switch'),
    prune() {},
    recover: (...args) => calls.push(['recover', ...args]),
    fullscreen: async (tile) => calls.push(['full', tile]),
    beforeCollapse: async () => {},
    warn: (error) => warnings.push(error),
  };
  const client = createCallStage(options);
  t.after(client.dispose);
  const message = (value) => {
    for (const subscriber of subscribers) subscriber(value);
  };
  return {
    client,
    state,
    person,
    events,
    calls,
    warnings,
    subscribers,
    options,
    message,
    camera,
    screen,
  };
}
test('privacy and immutable projections keep the original streams borrowed; generations reset presentation only', async (t) => {
  const h = await setup(t),
    first = h.client.getSnapshot();
  assert.strictEqual(first, h.client.getSnapshot());
  assert.strictEqual(first.cameras[0].cameraStream, h.camera);
  assert.strictEqual(first.screens[0].screenStream, h.screen);
  h.client.setLayout('peer', 'screen');
  assert.equal(h.client.getSnapshot().participants[0].screenDock, true);
  h.state.generation++;
  h.client.refresh();
  assert.equal(h.client.getSnapshot().participants[0].mode, 'auto');
  h.state.joined = false;
  h.client.refresh();
  const hidden = h.client.getSnapshot();
  assert.equal(hidden.participants.length, 0);
  assert.equal(hidden.cameras.length, 0);
  assert.equal(hidden.screens.length, 0);
  assert.equal(hidden.publicActive, true);
  assert(Object.isFrozen(first.participants[0]));
  assert.deepEqual(h.camera, { borrowed: 'camera' });
});
test('docking and screen invitations reflect viewing intent without changing streams or call state', async (t) => {
  const { client, person, camera, screen } = await setup(t);
  client.setLayout('missing', 'screen');
  client.setLayout('peer', 'unsupported');
  assert.equal(client.getSnapshot().participants[0].mode, 'auto');
  client.dockCamera('peer');
  assert.equal(client.getSnapshot().participants[0].cameraDock, false);
  client.setLayout('peer', 'screen');
  assert.equal(client.getSnapshot().hasScreen, false);
  person.watching = false;
  person.hiddenCamera = true;
  client.refresh();
  assert.equal(client.getSnapshot().hasScreen, false);
  assert.equal(client.getSnapshot().hasCamera, false);
  assert.equal(client.getSnapshot().screens[0].watching, false);
  assert.strictEqual(client.getSnapshot().participants[0].cameraStream, camera);
  assert.strictEqual(client.getSnapshot().screens[0].screenStream, screen);
});
test('presence and auth listeners install once, validate activity labels and do not disclose other scopes', async (t) => {
  const h = await setup(t);
  h.client.start();
  h.client.start();
  assert.equal(h.subscribers.size, 1);
  h.message({
    type: 'presence',
    scope: 'community',
    members: [
      null,
      { online: true, id: 'account', activity: { name: 'Jogo <teste>' } },
      { online: true, id: 'other', activity: 3 },
    ],
  });
  assert.equal(h.client.getSnapshot().participants[0].activity, 'Jogo <teste>');
  h.message({
    type: 'presence',
    scope: 'room',
    members: [{ online: true, id: 'account', activity: { name: 'Privado' } }],
  });
  assert.equal(h.client.getSnapshot().participants[0].activity, '');
  h.message({
    type: 'presence',
    scope: 'community',
    members: [{ online: true, id: 'account', activity: { name: 'Jogo' } }],
  });
  h.events.dispatchEvent(new Event('trono-auth-change'));
  assert.equal(h.client.getSnapshot().participants[0].activity, '');
  h.client.dispose();
  assert.equal(h.subscribers.size, 0);
});
test('voice and stream gains delegate once per input/change pair and reject self or unrequested stream changes', async (t) => {
  const { client, person, calls } = await setup(t);
  await client.setVolume('peer', '215');
  await client.setVolume('peer', '215');
  await client.setScreenVolume('peer', '80');
  await client.setScreenVolume('peer', '80');
  person.watching = false;
  client.refresh();
  await client.setScreenVolume('peer', '70');
  person.self = true;
  client.refresh();
  await client.setVolume('peer', '50');
  await client.setVolume('missing', '40');
  assert.deepEqual(calls, [
    ['volume', 'peer', '215'],
    ['screen-volume', 'peer', '80'],
  ]);
});
test('recovery considers both visible media: a live camera must not cancel recovery of a missing watched screen', async (t) => {
  const { client, person, calls } = await setup(t);
  person.screenLive = false;
  client.refresh();
  client.recoverVisible();
  assert.deepEqual(calls.at(-1), ['recover', 'peer', false]);
  person.watching = false;
  client.refresh();
  client.recoverVisible();
  assert.deepEqual(calls.at(-1), ['recover', 'peer', true]);
  person.cameraLive = false;
  person.hiddenCamera = true;
  client.refresh();
  client.recoverVisible();
  assert.deepEqual(calls.at(-1), ['recover', 'peer', true]);
  person.hiddenCamera = false;
  client.refresh();
  client.recoverVisible();
  assert.deepEqual(calls.at(-1), ['recover', 'peer', false]);
});
test('switch source starts within the gesture, deduplicates pending clicks and cannot clear a newer operation', async (t) => {
  const { client, state, options, calls } = await setup(t),
    old = gate(),
    fresh = gate();
  options.switchSource = () => {
    calls.push('first');
    return old.promise;
  };
  const first = client.switchSource();
  assert.deepEqual(calls, ['first']);
  await client.switchSource();
  assert.deepEqual(calls, ['first']);
  state.generation++;
  client.refresh();
  options.switchSource = () => fresh.promise;
  const second = client.switchSource();
  old.resolve();
  await first;
  assert.equal(client.getSnapshot().switching, true);
  fresh.resolve();
  await second;
  assert.equal(client.getSnapshot().switching, false);
});
test('a delayed native fullscreen exit cannot collapse a replacement call; self preview uses the original owner', async (t) => {
  const { client, state, person, options, calls } = await setup(t),
    exit = gate();
  options.beforeCollapse = () => exit.promise;
  const pending = client.collapse('peer', {});
  state.generation++;
  client.refresh();
  exit.resolve();
  await pending;
  assert.equal(client.getSnapshot().screens[0].collapsed, false);
  person.self = true;
  options.beforeCollapse = async () => {};
  client.refresh();
  await client.collapse('peer', {});
  assert.equal(client.getSnapshot().screens[0].collapsed, true);
  assert.deepEqual(calls, ['collapse']);
  await client.togglePreview();
  assert.equal(client.getSnapshot().previewPaused, true);
});
test('disposing the projection removes subscriptions and ignores late completion without stopping borrowed media', async (t) => {
  const { client, options, calls, subscribers } = await setup(t),
    pending = gate();
  client.start();
  options.switchSource = () => pending.promise;
  const job = client.switchSource();
  let updates = 0;
  client.subscribe(() => updates++);
  const snapshot = client.getSnapshot();
  client.dispose();
  pending.resolve();
  await job;
  client.resetLayouts();
  client.recoverVisible();
  await client.toggleCamera('peer');
  await client.toggleScreen('peer');
  assert.equal(subscribers.size, 0);
  assert.equal(updates, 0);
  assert.strictEqual(client.getSnapshot(), snapshot);
  assert.deepEqual(calls, []);
});
test('floating resize uses its original saved bounds and cleans its pointer listeners on unmount', async (t) => {
  const { bindMediaResize } = await import('../src/lib/voice/media-resize.ts');
  Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 800 });
  t.after(() => {
    delete globalThis.innerWidth;
    delete globalThis.innerHeight;
  });
  const grip = new EventTarget(),
    classes = new Set(),
    saved = new Map();
  grip.setPointerCapture = () => {};
  const tile = {
    dataset: {},
    style: {},
    querySelector: () => grip,
    classList: { add: (key) => classes.add(key), remove: (key) => classes.delete(key) },
    getBoundingClientRect() {
      return {
        width: parseFloat(this.style.width) || 320,
        height: parseFloat(this.style.height) || 180,
      };
    },
  };
  const storage = {
    getItem: (key) => saved.get(key),
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  const dispose = bindMediaResize(tile, 'camera', { storage, inChatHub: () => false });
  function pointer(type, x, y) {
    const event = new Event(type);
    Object.assign(event, { clientX: x, clientY: y, pointerId: 1 });
    grip.dispatchEvent(event);
  }
  pointer('pointerdown', 0, 0);
  pointer('pointermove', 100, 50);
  pointer('pointerup', 100, 50);
  assert.deepEqual(JSON.parse(saved.get('tronoMediaTileSize:camera')), { w: 420, h: 230 });
  dispose();
  const before = tile.style.width;
  pointer('pointerdown', 0, 0);
  pointer('pointermove', 200, 100);
  assert.equal(tile.style.width, before);
  assert.equal(tile.dataset.mediaResizeBound, undefined);
});

test('hiding a docked screen detaches its player and exits fallback maximization without stopping the borrowed track', async () => {
  const { createMediaVisibility } = await import('../src/lib/voice/media-visibility.ts');
  const classes = new Set(['media-maximized']),
    bodyClasses = new Set(['media-focus-open']);
  const track = { stop: () => assert.fail('borrowed track stopped') };
  const video = {
    srcObject: { getTracks: () => [track] },
    pause() {
      this.paused = true;
    },
  };
  const tile = {
    dataset: { peer: 'peer' },
    classList: { contains: (key) => classes.has(key), remove: (key) => classes.delete(key) },
    querySelector: () => video,
  };
  let selector = '';
  const document = {
    fullscreenElement: null,
    querySelectorAll(value) {
      selector = value;
      return [tile];
    },
    querySelector: () => (classes.has('media-maximized') ? tile : null),
    body: { classList: { remove: (key) => bodyClasses.delete(key) } },
  };
  await createMediaVisibility({ document }).hide('peer', 'screen');
  assert.equal(selector, '#socialPanel .screen-share-tile');
  assert.equal(video.srcObject, null);
  assert.equal(video.paused, true);
  assert.equal(classes.size, 0);
  assert.equal(bodyClasses.size, 0);
});
