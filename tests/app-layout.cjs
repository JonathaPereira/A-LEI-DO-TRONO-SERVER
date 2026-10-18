'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/navigation/app-layout.ts');
function deferred() {
  let resolve;
  const promise = new Promise(done => resolve = done);
  return { promise, resolve };
}
async function setup(t) {
  const { createAppLayout } = await modulePromise;
  const events = new EventTarget(), sources = new Set(), calls = [], preferences = new Map(), ready = deferred();
  let account = 'a', desktop, navigation;
  const source = {
    user: { nickname: 'Felipe', avatar_preset: 'crown', avatar_file_id: null }, guestNickname: null,
    connected: true, currentRoom: 'text-a', gameRoom: null, callGeneration: 1,
    joined: false, joining: false, deafened: false, microphoneEnabled: false,
    voiceRoom: null, voiceStatus: { text: 'Fora do chat de voz.', kind: '' },
    communityVisible: false, homeVisible: true, visibleGame: null,
  };
  const client = createAppLayout({
    read: () => source, events, authReady: ready.promise,
    readPreference: () => preferences.get(account),
    subscribeSource: listener => { sources.add(listener); return () => sources.delete(listener); },
    writeLayout(layout, save) { calls.push(['layout', layout, save]); if (save) preferences.set(account, layout); },
    layoutChanged: layout => calls.push(['changed', layout]),
    desktopNavigate: () => desktop,
    showScreen: id => calls.push(['screen', id]),
    openLibrary: () => calls.push(['library']),
    openGame: required => calls.push(['game', required]),
    requestRooms: () => calls.push(['rooms']),
    hasChannel: id => id === 'text-a',
    showCommunity: () => calls.push(['community']),
    openVoice: () => { calls.push(['voice']); return navigation?.promise ?? Promise.resolve(); },
    switchChannel: id => { calls.push(['channel', id]); return Promise.resolve(); },
    openProfile: () => calls.push(['profile']),
  });
  t.after(client.dispose);
  const refresh = () => { for (const listener of sources) listener(); };
  return { client, source, events, sources, calls, preferences, ready, refresh,
    event: (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail })),
    account: id => account = id, desktop: fn => desktop = fn, pendingNavigation: value => navigation = value,
  };
}
const voice = { id: 'voice-a', name: 'Geral', kind: 'chat', channelType: 'voice' };

test('layout normalizes values, writes only after start and persists only explicit changes', async t => {
  const { client, calls, preferences } = await setup(t);
  client.apply('discord', { save: true });
  assert.equal(client.current, 'original'); assert.deepEqual(calls, []);
  client.start(); client.start();
  assert.deepEqual(calls, [['layout', 'original', false], ['changed', 'original']]);
  client.apply('discord', { save: true });
  assert.equal(client.current, 'discord'); assert.equal(preferences.get('a'), 'discord');
  assert.equal(client.getSnapshot().layoutStatus, 'Layout Discord aplicado.');
  client.apply({ layout: 'discord' });
  assert.equal(client.current, 'original');
  assert.equal(preferences.get('a'), 'discord');
});

test('layout follows the current account and reads late auth preference without restoring an old account', async t => {
  const { client, preferences, account, event, ready } = await setup(t);
  preferences.set('a', 'discord'); client.start();
  assert.equal(client.current, 'discord');
  account('b'); preferences.set('b', 'original'); event('trono-auth-change');
  assert.equal(client.current, 'original');
  preferences.set('b', 'discord'); ready.resolve(); await Promise.resolve();
  assert.equal(client.current, 'discord');
  preferences.set('b', 'original'); event('trono-personal-change', null);
  event('trono-personal-change', { key: 'other' }); assert.equal(client.current, 'discord');
  event('trono-personal-change', { key: 'appLayout' }); assert.equal(client.current, 'original');
});

test('identity is an immutable projection and connection messages follow borrowed call status', async t => {
  const { client, source, refresh } = await setup(t); client.start();
  let state = client.getSnapshot();
  assert.equal(state.name, 'Felipe'); assert.equal(state.online, true); assert.equal(state.userStatus, 'Disponível');
  source.user.nickname = 'Outro'; source.user.avatar_preset = 'mask';
  assert.equal(state.name, 'Felipe'); assert.equal(state.profile.avatar_preset, 'crown');
  assert(Object.isFrozen(state)); assert(Object.isFrozen(state.profile));
  source.voiceRoom = voice; source.joining = true; refresh();
  assert.equal(client.getSnapshot().voiceLabel, 'Conectando…');
  assert.equal(client.getSnapshot().connectionState, 'connecting');
  assert.equal(client.getSnapshot().canOpenVoice, false);
  source.joined = true; source.joining = false; source.microphoneEnabled = true; refresh();
  state = client.getSnapshot();
  assert.equal(state.voiceChannel, 'Geral / Comunidade M&N'); assert.equal(state.userStatus, 'Em voz');
  assert.equal(state.canOpenVoice, true); assert.equal(state.voiceLocationTitle, 'Abrir canal de voz: Geral');
  source.microphoneEnabled = false; refresh(); assert.equal(client.getSnapshot().userStatus, 'Microfone mutado');
  source.deafened = true; refresh(); assert.equal(client.getSnapshot().userStatus, 'Áudio silenciado');
  source.joined = false; source.voiceStatus = { kind: 'error', text: 'Não foi possível conectar.' }; refresh();
  assert.equal(client.getSnapshot().voiceLabel, 'Falha ao conectar');
  assert.equal(client.getSnapshot().voiceChannel, 'Não foi possível conectar.');
  source.user = null; source.guestNickname = 'Convidado'; source.deafened = false; source.connected = false; refresh();
  assert.equal(client.getSnapshot().name, 'Convidado'); assert.equal(client.getSnapshot().online, false);
  assert.equal(client.getSnapshot().userStatus, 'Reconectando…');
});

test('text channels never appear as a connected voice location and game rooms keep their label', async t => {
  const { client, source, calls, refresh } = await setup(t); client.start(); calls.length = 0;
  source.joined = true; source.voiceRoom = { ...voice, channelType: 'text' }; refresh();
  assert.equal(client.getSnapshot().connectionState, 'disconnected');
  assert.equal(client.getSnapshot().canOpenVoice, false);
  await client.openVoiceChannel(); assert.deepEqual(calls, []);
  source.voiceRoom = { ...voice, kind: 'game' }; refresh();
  assert.equal(client.getSnapshot().voiceChannel, 'Geral / A Lei do Trono');
});

test('web routes reuse the portal, channel catalog and game library without rejoining a known channel', async t => {
  const { client, source, calls } = await setup(t); client.start(); calls.length = 0;
  await client.navigate('home'); await client.navigate('game'); await client.navigate('community');
  assert.deepEqual(calls, [['screen', 'portalScreen'], ['library'], ['screen', 'chatOnlyScreen'], ['community']]);
  source.currentRoom = 'unknown'; await client.navigate('community');
  assert.deepEqual(calls.at(-1), ['voice']);
  const count = calls.length; await client.navigate('nonsense'); await client.navigate({ to: 'home' });
  assert.equal(calls.length, count);
});

test('throne remembers only game screens and resets a departed game before navigation', async t => {
  const { client, source, calls, refresh } = await setup(t); client.start(); calls.length = 0;
  source.gameRoom = 'sala-1'; source.visibleGame = 'gameScreen'; source.homeVisible = false; refresh();
  assert.equal(client.getSnapshot().area, 'game');
  source.visibleGame = null; source.homeVisible = true; refresh();
  await client.navigate('throne'); assert.deepEqual(calls.slice(-2), [['screen', 'gameScreen'], ['rooms']]);
  source.gameRoom = null; await client.navigate('throne');
  assert.deepEqual(calls.slice(-2), [['screen', 'setupScreen'], ['rooms']]);
  source.user = null; await client.navigate('throne'); assert.deepEqual(calls.at(-1), ['game', true]);
  source.guestNickname = 'Convidado'; await client.navigate('throne');
  assert.deepEqual(calls.slice(-2), [['screen', 'setupScreen'], ['rooms']]);
});

test('desktop routing delegates to the existing shell and profile action uses its owner', async t => {
  const { client, calls, desktop } = await setup(t); client.start(); calls.length = 0;
  desktop(async route => calls.push(['desktop', route]));
  for (const route of ['home', 'game', 'throne', 'community', 'profile', 'settings', 'clips'])
    await client.navigate(route);
  assert.equal(calls.length, 7); assert(calls.every(call => call[0] === 'desktop'));
  client.openProfile(); assert.deepEqual(calls.at(-1), ['profile']);
});

test('voice location opens its borrowed voice room and avoids duplicate selection in the visible channel', async t => {
  const { client, source, calls } = await setup(t); client.start(); calls.length = 0;
  source.joined = true; source.voiceRoom = voice;
  await client.openVoiceChannel();
  assert.deepEqual(calls, [['screen', 'chatOnlyScreen'], ['community'], ['channel', 'voice-a']]);
  source.currentRoom = 'voice-a'; source.communityVisible = true; calls.length = 0;
  await client.openVoiceChannel(); assert.deepEqual(calls, []);
  source.communityVisible = false; source.voiceRoom = { ...voice, kind: 'game' };
  await client.openVoiceChannel(); assert.deepEqual(calls, [['screen', 'setupScreen'], ['rooms']]);
});

test('a pending voice location cannot select a room after another route, call generation, account change or disposal', async t => {
  for (const change of ['route', 'generation', 'room', 'account', 'dispose']) {
    const { client, source, calls, event, pendingNavigation } = await setup(t);
    client.start(); calls.length = 0;
    source.joined = true; source.voiceRoom = voice; source.currentRoom = null;
    const pending = deferred(); pendingNavigation(pending);
    const opening = client.openVoiceChannel();
    if (change === 'route') await client.navigate('home');
    if (change === 'generation') source.callGeneration++;
    if (change === 'room') source.voiceRoom = { ...voice, id: 'voice-b' };
    if (change === 'account') event('trono-auth-change');
    if (change === 'dispose') client.dispose();
    pending.resolve(); await opening;
    assert(!calls.some(call => call[0] === 'channel'), change);
  }
});

test('unchanged source refreshes do not reemit layout projections or request control placement', async t => {
  const { client, source, calls, refresh, event } = await setup(t);
  client.start(); calls.length = 0;
  let changes = 0;
  const off = client.subscribe(() => changes++);
  const initial = client.getSnapshot();
  refresh(); refresh(); event('trono-call-change');
  assert.equal(changes, 0); assert.equal(client.getSnapshot(), initial);
  source.connected = false; refresh(); refresh(); event('trono-call-change');
  assert.equal(changes, 1); assert.notEqual(client.getSnapshot(), initial);
  assert.deepEqual(calls, []); off();
});

test('disposal releases subscriptions and cancels auth continuations, events and later actions', async t => {
  const { client, calls, sources, ready, event, preferences } = await setup(t);
  client.start(); assert.equal(sources.size, 1); calls.length = 0;
  client.dispose(); client.dispose(); assert.equal(sources.size, 0);
  preferences.set('a', 'discord'); ready.resolve(); await Promise.resolve();
  event('trono-auth-change'); event('trono-personal-change', { key: 'appLayout' });
  client.start(); client.apply('discord', { save: true }); client.openProfile();
  await client.navigate('home'); await client.openVoiceChannel();
  assert.deepEqual(calls, []);
});
