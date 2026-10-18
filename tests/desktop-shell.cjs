'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/desktop/shell.ts');
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function setup(t) {
  const { createDesktopShell } = await modulePromise;
  const source = {
    visibleScreen: 'portalScreen',
    gameRoom: null,
    currentRoom: null,
    independentGameVoice: true,
    hasIdentity: true,
    joined: false,
    status: 'Fora do chat de voz.',
  };
  const events = new EventTarget(),
    sources = new Set(),
    calls = [],
    initial = deferred();
  const windows = new Set();
  let leaveAllowed = true,
    opening,
    toggling;
  const client = createDesktopShell({
    read: () => source,
    events,
    subscribeSource: (listener) => {
      sources.add(listener);
      return () => sources.delete(listener);
    },
    hasChannel: (id) => id === 'voice-a' || id === 'text-a',
    showScreen: (id) => {
      calls.push(['screen', id]);
      source.visibleScreen = id;
    },
    showCommunity: () => calls.push(['community']),
    openLibrary: () => calls.push(['library']),
    openGame: (required) => calls.push(['game', required]),
    openVoice: () => {
      calls.push(['voice']);
      return opening?.promise ?? Promise.resolve();
    },
    requestRooms: () => calls.push(['rooms']),
    openSettings: (section) => calls.push(['settings', section]),
    confirmLeave: () => {
      calls.push(['confirm']);
      return leaveAllowed;
    },
    native: {
      getWindowState: () => {
        calls.push(['window']);
        return initial.promise;
      },
      onWindowState: (listener) => {
        windows.add(listener);
        return () => windows.delete(listener);
      },
      toggleFullscreen: () => {
        calls.push(['fullscreen']);
        return toggling?.promise ?? Promise.resolve({ fullscreen: true });
      },
    },
  });
  t.after(client.dispose);
  return {
    client,
    source,
    events,
    sources,
    calls,
    initial,
    windows,
    refresh: () => {
      for (const listener of sources) listener();
    },
    window: (value) => {
      for (const listener of windows) listener(value);
    },
    auth: () => events.dispatchEvent(new Event('trono-auth-change')),
    allowLeave: (value) => (leaveAllowed = value),
    pendingVoice: (value) => (opening = value),
    pendingFullscreen: (value) => (toggling = value),
  };
}

test('desktop projects borrowed call status and screen with stable immutable snapshots', async (t) => {
  const { client, source, refresh, sources, windows, calls } = await setup(t);
  client.start();
  client.start();
  assert.equal(sources.size, 1);
  assert.equal(windows.size, 1);
  assert.equal(calls.filter((call) => call[0] === 'window').length, 1);
  const initial = client.getSnapshot();
  assert(Object.isFrozen(initial));
  assert.equal(initial.view, 'home');
  assert.equal(initial.callName, 'M&N · pronto para conectar');
  assert.equal(initial.callStatus, 'Fora do chat de voz.');
  let updates = 0;
  client.subscribe(() => updates++);
  refresh();
  assert.equal(client.getSnapshot(), initial);
  assert.equal(updates, 0);
  source.visibleScreen = 'chatOnlyScreen';
  source.joined = true;
  source.status = 'Voz pronta.';
  refresh();
  assert.equal(client.getSnapshot().view, 'community');
  assert.equal(client.getSnapshot().callName, 'Chamada conectada');
  assert.equal(client.getSnapshot().callStatus, 'Voz pronta.');
  assert.equal(initial.callStatus, 'Fora do chat de voz.');
  assert.equal(updates, 1);
  source.visibleScreen = 'azulScreen';
  refresh();
  assert.equal(client.getSnapshot().view, 'game');
});

test('home changes only the screen, games delegate to the library and known channels are reused', async (t) => {
  const { client, source, calls } = await setup(t);
  client.start();
  calls.length = 0;
  client.toggleChannels();
  await client.navigate('home');
  assert.equal(client.getSnapshot().channelsOpen, false);
  assert.deepEqual(calls, [['screen', 'portalScreen']]);
  await client.navigate('game');
  assert.deepEqual(calls.at(-1), ['library']);
  for (const room of ['voice-a', 'text-a']) {
    source.currentRoom = room;
    client.toggleChannels();
    await client.navigate('community');
    assert.equal(client.getSnapshot().channelsOpen, false);
    assert.deepEqual(calls.slice(-2), [['screen', 'chatOnlyScreen'], ['community']]);
  }
  assert(!calls.some((call) => call[0] === 'voice' || call[0] === 'confirm'));
});

test('profile, settings and unavailable clips do not switch areas or close channels', async (t) => {
  const { client, calls } = await setup(t);
  client.start();
  calls.length = 0;
  client.toggleChannels();
  await client.navigate('profile');
  await client.navigate('settings');
  await client.navigate('clips');
  assert.deepEqual(calls, [
    ['settings', 'account'],
    ['settings', undefined],
  ]);
  assert.equal(client.getSnapshot().view, 'home');
  assert.equal(client.getSnapshot().channelsOpen, true);
  for (const value of [null, undefined, 'unknown', { view: 'home' }, ['home'], 1])
    await client.navigate(value);
  assert.equal(calls.length, 2);
});

test('throne remembers only supported screens and resets a departed game before restoration', async (t) => {
  const { client, source, calls, refresh, auth } = await setup(t);
  client.start();
  calls.length = 0;
  source.gameRoom = 'mesa-a';
  source.visibleScreen = 'gameScreen';
  refresh();
  source.visibleScreen = 'azulScreen';
  refresh();
  await client.navigate('throne');
  assert.deepEqual(calls.slice(-2), [['screen', 'gameScreen'], ['rooms']]);
  source.gameRoom = null;
  await client.navigate('throne');
  assert.deepEqual(calls.slice(-2), [['screen', 'setupScreen'], ['rooms']]);
  source.hasIdentity = false;
  await client.navigate('throne');
  assert.deepEqual(calls.at(-1), ['game', true]);
  source.hasIdentity = true;
  source.gameRoom = 'mesa-b';
  source.visibleScreen = 'roomScreen';
  refresh();
  auth();
  await client.navigate('throne');
  assert.deepEqual(calls.slice(-2), [['screen', 'setupScreen'], ['rooms']]);
});

test('community confirms leaving only on older backends with an existing unknown room', async (t) => {
  const { client, source, calls, allowLeave } = await setup(t);
  client.start();
  calls.length = 0;
  source.currentRoom = 'mesa-a';
  source.independentGameVoice = false;
  allowLeave(false);
  await client.navigate('community');
  assert.deepEqual(calls, [['confirm']]);
  allowLeave(true);
  await client.navigate('community');
  assert.deepEqual(calls.slice(-2), [['confirm'], ['voice']]);
  calls.length = 0;
  source.independentGameVoice = true;
  await client.navigate('community');
  assert.deepEqual(calls, [['voice']]);
  calls.length = 0;
  source.currentRoom = null;
  source.independentGameVoice = false;
  await client.navigate('community');
  assert.deepEqual(calls, [['voice']]);
});

test('late community completion cannot project a stale area after route, auth or disposal', async (t) => {
  for (const change of ['route', 'auth', 'dispose']) {
    const { client, source, calls, pendingVoice, auth } = await setup(t);
    client.start();
    calls.length = 0;
    const pending = deferred();
    pendingVoice(pending);
    const navigation = client.navigate('community');
    if (change === 'route') await client.navigate('home');
    if (change === 'auth') auth();
    if (change === 'dispose') client.dispose();
    let changes = 0;
    client.subscribe(() => changes++);
    source.visibleScreen = 'chatOnlyScreen';
    pending.resolve();
    await navigation;
    assert.equal(client.getSnapshot().view, 'home', change);
    assert.equal(changes, 0, change);
    assert.equal(calls.filter((call) => call[0] === 'voice').length, 1);
  }
});

test('window events validate payloads and supersede a delayed initial fullscreen read', async (t) => {
  const { client, initial, window } = await setup(t);
  client.start();
  for (const value of [null, [], true, {}, { fullscreen: 'true' }, { fullscreen: 1 }])
    window(value);
  assert.equal(client.getSnapshot().fullscreen, false);
  window({ fullscreen: true, maximized: false });
  initial.resolve({ fullscreen: false });
  await Promise.resolve();
  assert.equal(client.getSnapshot().fullscreen, true);
  window({ fullscreen: false });
  assert.equal(client.getSnapshot().fullscreen, false);
});

test('fullscreen toggles are serialized and invalidate the initial window read', async (t) => {
  const { client, initial, calls, pendingFullscreen } = await setup(t);
  client.start();
  const pending = deferred();
  pendingFullscreen(pending);
  const toggling = client.toggleFullscreen();
  await client.toggleFullscreen();
  assert.equal(client.getSnapshot().fullscreenPending, true);
  assert.equal(calls.filter((call) => call[0] === 'fullscreen').length, 1);
  pending.resolve({ fullscreen: true });
  await toggling;
  initial.resolve({ fullscreen: false });
  await Promise.resolve();
  assert.equal(client.getSnapshot().fullscreen, true);
  assert.equal(client.getSnapshot().fullscreenPending, false);
});

test('newer native events win over pending toggle responses and errors', async (t) => {
  for (const outcome of ['resolve', 'reject']) {
    const { client, window, pendingFullscreen } = await setup(t);
    client.start();
    const pending = deferred();
    pendingFullscreen(pending);
    const toggling = client.toggleFullscreen();
    window({ fullscreen: true });
    if (outcome === 'resolve') pending.resolve({ fullscreen: false });
    else pending.reject(new Error('late IPC failure'));
    await toggling;
    assert.equal(client.getSnapshot().fullscreen, true);
    assert.equal(client.getSnapshot().fullscreenError, null);
    assert.equal(client.getSnapshot().fullscreenPending, false);
  }
});

test('fullscreen failures preserve known state, offer F11 and recover on a valid update', async (t) => {
  const { client, window, pendingFullscreen } = await setup(t);
  client.start();
  window({ fullscreen: true });
  for (const outcome of ['reject', 'malformed']) {
    const pending = deferred();
    pendingFullscreen(pending);
    const toggling = client.toggleFullscreen();
    if (outcome === 'reject') pending.reject(new Error('IPC failed'));
    else pending.resolve({ fullscreen: 'false' });
    await toggling;
    assert.equal(client.getSnapshot().fullscreen, true);
    assert.match(client.getSnapshot().fullscreenError, /Tente F11/);
    assert.equal(client.getSnapshot().fullscreenTitle, client.getSnapshot().fullscreenError);
  }
  window({ fullscreen: false });
  assert.equal(client.getSnapshot().fullscreenError, null);
  assert.equal(client.getSnapshot().fullscreenTitle, 'Tela cheia · F11');
});

test('channels close explicitly and on account changes without touching the borrowed call', async (t) => {
  const { client, source, calls, auth } = await setup(t);
  client.start();
  calls.length = 0;
  source.joined = true;
  client.toggleChannels();
  assert.equal(client.getSnapshot().channelsOpen, true);
  client.closeChannels();
  client.closeChannels();
  assert.equal(client.getSnapshot().channelsOpen, false);
  client.toggleChannels();
  auth();
  assert.equal(client.getSnapshot().channelsOpen, false);
  assert.equal(client.getSnapshot().callName, 'Chamada conectada');
  assert.deepEqual(calls, []);
});

test('disposal releases source/native/auth subscriptions and ignores delayed completions', async (t) => {
  const { client, calls, sources, windows, initial, pendingFullscreen, auth } = await setup(t);
  await client.navigate('home');
  await client.toggleFullscreen();
  client.toggleChannels();
  assert.deepEqual(calls, []);
  client.start();
  const pending = deferred();
  pendingFullscreen(pending);
  const toggling = client.toggleFullscreen();
  const snapshot = client.getSnapshot();
  let changes = 0;
  client.subscribe(() => changes++);
  client.dispose();
  client.dispose();
  assert.equal(sources.size, 0);
  assert.equal(windows.size, 0);
  initial.resolve({ fullscreen: true });
  pending.resolve({ fullscreen: true });
  await toggling;
  auth();
  client.start();
  client.refresh();
  client.toggleChannels();
  client.closeChannels();
  const before = calls.length;
  await client.navigate('game');
  await client.toggleFullscreen();
  assert.equal(calls.length, before);
  assert.equal(client.getSnapshot(), snapshot);
  assert.equal(changes, 0);
});
