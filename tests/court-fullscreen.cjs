'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createCourtFullscreen } = require('../src/lib/games/court-fullscreen.ts');
const { createDesktopShell } = require('../src/lib/desktop/shell.ts');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  let playing = true,
    element = null,
    request = async () => {
      element = 'root';
      emit();
    },
    exit = async () => {
      element = null;
      emit();
    },
    requests = 0,
    exits = 0;
  const sources = new Set();
  const emit = () => sources.forEach((fn) => fn());
  const controller = createCourtFullscreen({
    read: () => ({ playing, rootFullscreen: element === 'root', hasFullscreen: element !== null }),
    subscribeSource(fn) {
      sources.add(fn);
      return () => sources.delete(fn);
    },
    requestDocument() {
      requests++;
      return request();
    },
    exitDocument() {
      exits++;
      return exit();
    },
  });
  controller.start();
  return {
    controller,
    sources,
    request(fn) {
      request = fn;
    },
    exit(fn) {
      exit = fn;
    },
    element(value) {
      element = value;
      emit();
    },
    playing(value) {
      playing = value;
      emit();
    },
    get requests() {
      return requests;
    },
    get exits() {
      return exits;
    },
    get current() {
      return element;
    },
  };
}
test('web entry is invoked synchronously, deduplicated and released only for the court when it is hidden', async () => {
  const f = fixture(),
    gate = deferred();
  let invoked = false;
  f.request(() => {
    invoked = true;
    f.element('root');
    return gate.promise;
  });
  const first = f.controller.toggle(),
    second = f.controller.toggle();
  assert(invoked);
  assert.equal(first, second);
  assert.equal(f.requests, 1);
  assert.equal(f.controller.getSnapshot().pending, true);
  assert.equal(f.controller.getSnapshot().active, true);
  f.playing(false);
  await flush();
  assert.equal(f.exits, 1);
  assert.equal(f.current, null);
  assert.equal(f.controller.getSnapshot().active, false);
  gate.resolve();
  await first;
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.equal(f.current, null);
  f.controller.dispose();
  assert.equal(f.sources.size, 0);
});
test('a document request completed after hide/show or disposal is released without affecting a subsequent screen', async () => {
  for (const change of ['hide-show', 'dispose']) {
    const f = fixture(),
      gate = deferred();
    let updates = 0;
    f.controller.subscribe(() => updates++);
    f.request(() => gate.promise);
    const pending = f.controller.toggle();
    if (change === 'hide-show') {
      f.playing(false);
      f.playing(true);
    } else f.controller.dispose();
    const before = updates;
    f.element('root');
    gate.resolve();
    await pending;
    assert.equal(f.current, null);
    assert.equal(f.exits, 1);
    if (change === 'dispose') assert.equal(updates, before);
    f.controller.dispose();
  }
});
test('unrelated root or player fullscreen is never released automatically; replacing a court claim transfers control to the player', async () => {
  for (const element of ['root', 'player']) {
    const f = fixture();
    f.element(element);
    f.playing(false);
    assert.equal(f.exits, 0);
    f.controller.dispose();
    assert.equal(f.exits, 0);
  }
  const f = fixture();
  await f.controller.toggle();
  assert.equal(f.current, 'root');
  f.element('player');
  f.playing(false);
  assert.equal(f.exits, 0);
  assert.equal(f.current, 'player');
  f.controller.dispose();
  assert.equal(f.exits, 0);
});
test('Escape and external fullscreen changes refresh the pressed state; denied requests offer a retry without becoming pending forever', async () => {
  const f = fixture();
  f.request(() => Promise.reject(new Error('permission')));
  await f.controller.toggle();
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.equal(f.controller.getSnapshot().fullscreen, false);
  assert.match(f.controller.getSnapshot().title, /F11/);
  f.request(async () => f.element('root'));
  await f.controller.toggle();
  assert.equal(f.controller.getSnapshot().title, 'Tela cheia nativa');
  assert.equal(f.controller.getSnapshot().fullscreen, true);
  f.element(null);
  assert.equal(f.controller.getSnapshot().fullscreen, false);
  f.playing(false);
  assert.equal(f.exits, 0);
  await f.controller.toggle();
  assert.equal(f.requests, 2);
  f.controller.dispose();
});
test('automatic exit rejection is contained and a reentrant disposal cannot issue a fresh document request', async () => {
  const f = fixture();
  await f.controller.toggle();
  f.exit(() => Promise.reject(new Error('exit denied')));
  f.playing(false);
  await flush();
  assert.equal(f.exits, 1);
  assert.equal(f.controller.getSnapshot().active, false);
  f.controller.dispose();
  const g = fixture();
  g.controller.subscribe(() => {
    if (g.controller.getSnapshot().pending) g.controller.dispose();
  });
  await g.controller.toggle();
  assert.equal(g.requests, 0);
  assert.equal(g.sources.size, 0);
});
test('native court and shell controls share one IPC, authoritative window events and pending state, preserving native fullscreen off the board', async () => {
  const windows = new Set(),
    initial = deferred(),
    toggle = deferred(),
    source = new Set();
  let requests = 0,
    playing = true;
  const shell = createDesktopShell({
    read: () => ({
      visibleScreen: 'gameScreen',
      gameRoom: 'sala-cetro',
      currentRoom: null,
      independentGameVoice: true,
      hasIdentity: true,
      joined: true,
      status: 'Conectado',
    }),
    subscribeSource: () => () => {},
    events: new EventTarget(),
    hasChannel: () => true,
    showScreen() {},
    showCommunity() {},
    openLibrary() {},
    openGame() {},
    openVoice: async () => true,
    requestRooms() {},
    openSettings() {},
    confirmLeave: () => true,
    native: {
      getWindowState: () => initial.promise,
      onWindowState(fn) {
        windows.add(fn);
        return () => windows.delete(fn);
      },
      toggleFullscreen() {
        requests++;
        return toggle.promise;
      },
    },
  });
  shell.start();
  const court = createCourtFullscreen({
    read: () => ({ playing, rootFullscreen: false, hasFullscreen: false }),
    subscribeSource(fn) {
      source.add(fn);
      return () => source.delete(fn);
    },
    requestDocument() {
      throw Error('Native must never request a DOM fullscreen');
    },
    exitDocument() {
      throw Error('Native must never exit a DOM fullscreen');
    },
    native: shell,
  });
  court.start();
  const pending = court.toggle();
  void shell.toggleFullscreen();
  assert.equal(requests, 1);
  assert.equal(court.getSnapshot().pending, true);
  for (const fn of windows) fn({ fullscreen: true });
  initial.resolve({ fullscreen: false });
  toggle.resolve({ fullscreen: false });
  await pending;
  await flush();
  assert.equal(court.getSnapshot().fullscreen, true);
  assert.equal(court.getSnapshot().pending, false);
  assert.equal(court.getSnapshot().active, true);
  playing = false;
  source.forEach((fn) => fn());
  assert.equal(court.getSnapshot().active, false);
  assert.equal(shell.getSnapshot().fullscreen, true);
  assert.equal(requests, 1);
  court.dispose();
  const snapshot = court.getSnapshot();
  for (const fn of windows) fn({ fullscreen: false });
  assert.equal(court.getSnapshot(), snapshot);
  assert.equal(source.size, 0);
  shell.dispose();
  assert.equal(windows.size, 0);
});
