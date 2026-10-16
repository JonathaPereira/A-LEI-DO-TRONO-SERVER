'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/socket/client.ts'),
  import('../src/lib/socket/browser.ts'),
]);

async function setup(options = {}) {
  const [{ createNetworkClient }] = await modules;
  const sent = [],
    warnings = [],
    listeners = new Set();
  const transport = {
    connected: true,
    connect: async () => true,
    send(type, payload = {}) {
      sent.push({ type, ...payload });
      return transport.connected;
    },
    request: async (type) => {
      throw Error('Unexpected request: ' + type);
    },
    serializeIdentity: (operation) => Promise.resolve().then(() => operation(transport)),
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    disconnect() {
      receive({ type: 'connection', connected: false });
    },
  };
  function receive(message) {
    if (message.type === 'connection') transport.connected = message.connected;
    for (const listener of listeners) listener(message);
  }
  const client = createNetworkClient({
    backendHttp: 'https://fixture.example',
    transport,
    warn: (error) => warnings.push(error),
    ...options,
  });
  receive({ type: 'connection', connected: true });
  return { client, sent, warnings, transport, receive };
}

const room = (id, kind = 'chat') => ({ id, kind });
const membership = (client) => {
  const { currentRoom, primaryRoom, gameRoom } = client.getSnapshot();
  return { currentRoom, primaryRoom, gameRoom };
};
const welcome = {
  type: 'welcome',
  clientId: 'peer-1',
  serverVersion: '0.13.0-alpha',
  features: {
    independentGameVoice: true,
    independentTextChannels: true,
    azul: true,
    splendor: true,
    loveLetter: true,
    gameActivity: true,
    soundboard: true,
  },
};

test('typed state keeps text, voice and game memberships independent throughout navigation', async () => {
  const { client, receive } = await setup();
  receive(welcome);
  receive({ type: 'joined-room', room: room('voice') });
  receive({ type: 'joined-text-channel', room: room('text'), primaryRoomId: 'voice' });
  receive({
    type: 'joined-game-room',
    room: room('sala-cetro', 'game'),
    primaryRoomId: 'voice',
    chatRoomId: 'text',
  });
  assert.deepEqual(membership(client), {
    currentRoom: 'text',
    primaryRoom: 'voice',
    gameRoom: 'sala-cetro',
  });
  receive({ type: 'channel-deleted', roomId: 'text' });
  assert.deepEqual(membership(client), {
    currentRoom: null,
    primaryRoom: 'voice',
    gameRoom: 'sala-cetro',
  });
  receive({ type: 'left-voice-room', chatRoomId: 'another-text' });
  assert.deepEqual(membership(client), {
    currentRoom: 'another-text',
    primaryRoom: null,
    gameRoom: 'sala-cetro',
  });
  receive({ type: 'voice-room-attached', room: room('sala-cetro', 'game') });
  assert.equal(client.currentRoom, 'another-text');
  assert.equal(client.primaryRoom, 'sala-cetro');
  receive({ type: 'left-game-room', primaryRoomId: 'voice-2', chatRoomId: 'another-text' });
  assert.deepEqual(membership(client), {
    currentRoom: 'another-text',
    primaryRoom: 'voice-2',
    gameRoom: null,
  });
  receive({ type: 'channel-deleted', roomId: 'voice-2' });
  assert.equal(client.currentRoom, 'another-text');
  assert.equal(client.primaryRoom, null);
  client.leaveRoom();
  assert.deepEqual(membership(client), { currentRoom: null, primaryRoom: null, gameRoom: null });
});

test('state subscriptions observe immutable stable snapshots before message consumers run', async () => {
  const { client, receive, warnings } = await setup();
  let updates = 0;
  const unsubscribe = client.subscribe(() => updates++);
  const throwing = client.subscribe(() => {
    throw Error('observer failed');
  });
  const before = client.getSnapshot();
  receive({ type: 'pong' });
  assert.equal(client.getSnapshot(), before);
  assert.equal(updates, 0);
  client.onMessage((message) => {
    if (message.type === 'welcome') {
      assert.equal(client.clientId, message.clientId);
      assert.equal(
        message.features.soundboard,
        true,
        'other domains keep the complete welcome payload',
      );
    }
  });
  receive(welcome);
  assert.equal(updates, 1);
  assert.equal(warnings.length, 1);
  throwing();
  const snapshot = client.getSnapshot();
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.features));
  assert.throws(() => {
    snapshot.currentRoom = 'tampered';
  }, TypeError);
  assert.throws(() => {
    snapshot.features.azul = false;
  }, TypeError);
  unsubscribe();
  receive({ type: 'joined-room', room: room('voice') });
  assert.equal(updates, 1);
  assert.equal(snapshot.currentRoom, null, 'older snapshots remain unchanged');
});

test('malformed membership events cannot corrupt state or reach unconverted consumers', async () => {
  const { client, receive, warnings } = await setup();
  receive(welcome);
  const snapshot = client.getSnapshot();
  const seen = [];
  client.onMessage((message) => seen.push(message));
  for (const message of [
    { type: 'welcome', clientId: 7 },
    { ...welcome, features: { ...welcome.features, independentGameVoice: 'true' } },
    { type: 'joined-room', room: null },
    { type: 'joined-game-room', room: room('game', 'game'), primaryRoomId: [] },
    { type: 'joined-text-channel', room: room('text'), primaryRoomId: 8 },
    { type: 'left-game-room', chatRoomId: {} },
    { type: 'voice-room-attached', room: room('voice', 'unknown') },
    { type: 'channel-deleted', roomId: null },
  ])
    receive(message);
  assert.equal(client.getSnapshot(), snapshot);
  assert.equal(seen.length, 0);
  assert.equal(warnings.length, 8);
  receive({ type: 'chat-message', message: { text: 'still delivered' } });
  assert.equal(seen.length, 1);
});

test('new commands route to negotiated capabilities, while older servers retain room fallback', async () => {
  const { client, receive, sent } = await setup();
  receive(welcome);
  assert.equal(await client.joinRoom('sala-cetro', 'Guest'), true);
  assert.deepEqual(sent.at(-1), { type: 'join-game-room', roomId: 'sala-cetro', name: 'Guest' });
  await client.joinTextChannel('text');
  assert.equal(sent.at(-1).type, 'join-text-channel');
  assert.equal(client.azul('list'), true);
  assert.equal(client.splendor('list'), true);
  assert.equal(client.loveLetter('list'), true);
  assert.equal(client.setActivity({ name: 'Game' }), true);
  client.leaveVoiceRoom();
  assert.equal(sent.at(-1).type, 'leave-voice-room');
  receive({ type: 'welcome', clientId: 'older' });
  assert.equal(client.azul('list'), false);
  assert.equal(client.setActivity({ name: 'Game' }), false);
  await assert.rejects(client.ensureAzul(), /Atualize/);
  await assert.rejects(client.joinTextChannel('text'), /Atualize/);
  await client.joinRoom('sala-cetro');
  assert.equal(sent.at(-1).type, 'join-room');
  receive({ type: 'joined-room', room: room('sala-cetro', 'game') });
  client.leaveGameRoom();
  assert.equal(sent.at(-1).type, 'leave-room');
  assert.equal(client.gameRoom, null);
});

test('remote close retains last-known membership for cleanup, while explicit logout clears it', async () => {
  const { client, receive } = await setup();
  receive(welcome);
  receive({ type: 'joined-room', room: room('voice') });
  receive({ type: 'connection', connected: false });
  assert.equal(client.getSnapshot().connected, false);
  assert.equal(client.currentRoom, 'voice');
  assert.equal(client.gameActivitySupported, false);
  client.disconnect();
  assert.deepEqual(membership(client), { currentRoom: null, primaryRoom: null, gameRoom: null });
});

test('account, guest, name and voice responses are validated before their values are exposed', async () => {
  const { client, transport } = await setup();
  const account = {
    id: 'a',
    nickname: 'Account',
    role: 'member',
    permissions: { manageRoles: false },
  };
  let requests = 0;
  transport.request = async () => {
    requests++;
    return { type: 'auth-result', ok: true, user: account };
  };
  assert.deepEqual(await client.authenticate('token'), account);
  assert.deepEqual(await client.authenticate('token'), account);
  assert.equal(requests, 1);
  transport.request = async () => ({
    type: 'auth-result',
    ok: true,
    user: { ...account, permissions: { manageRoles: 'true' } },
  });
  await assert.rejects(client.authenticate('other-token'), { code: 'INVALID_RESPONSE' });
  transport.request = async () => ({
    type: 'guest-result',
    ok: true,
    guest: { id: 'g', nickname: 'Guest', ticket: 'ticket', expiresAt: 'tomorrow' },
  });
  await assert.rejects(client.authenticateGuest('Guest'), { code: 'INVALID_RESPONSE' });
  transport.request = async () => ({ type: 'name-check-result', available: 'yes' });
  await assert.rejects(client.checkName('Guest'), { code: 'INVALID_RESPONSE' });
  transport.request = async () => ({
    type: 'sfu-response',
    ok: true,
    data: { mode: 'invalid', revision: 1 },
  });
  await assert.rejects(client.prepareVoice(), { code: 'INVALID_RESPONSE' });
  transport.request = async () => ({
    type: 'sfu-response',
    ok: true,
    data: { mode: 'p2p', revision: 2 },
  });
  assert.deepEqual(await client.prepareVoice(), { mode: 'p2p', revision: 2 });
});

test('browser initialization is idempotent and resolves local, IPv6 and installed origins', async () => {
  const [, { initializeNetwork, resolveBackendHttp }] = await modules;
  assert.equal(resolveBackendHttp('127.0.0.1'), 'http://127.0.0.1:10000');
  assert.equal(resolveBackendHttp('localhost'), 'http://localhost:10000');
  assert.equal(resolveBackendHttp('::1'), 'http://[::1]:10000');
  assert.equal(resolveBackendHttp('[::1]'), 'http://[::1]:10000');
  assert.equal(
    resolveBackendHttp('a-lei-do-trono.surge.sh'),
    'https://a-lei-do-trono-server.onrender.com',
  );
  assert.equal(
    resolveBackendHttp('localhost', 'https://fixture.example/api/'),
    'https://fixture.example/api',
  );
  for (const address of [
    'file:///tmp',
    'https://user:secret@example.test',
    'https://example.test/?token=secret',
    'https://example.test/#hash',
  ])
    assert.throws(() => resolveBackendHttp('localhost', address));
  const runtime = { location: { hostname: 'localhost' } };
  const first = initializeNetwork(runtime);
  assert.equal(initializeNetwork(runtime), first);
  assert.equal(runtime.TronoNetwork, first);
  assert.equal(first.connected, false);
  assert.equal(first.BACKEND_WS, 'ws://localhost:10000/ws');
});
