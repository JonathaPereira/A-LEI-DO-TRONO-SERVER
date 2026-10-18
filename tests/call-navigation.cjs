'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/navigation.ts');
async function setup(t) {
  const { createCallNavigation } = await modulePromise;
  const membership = {
      currentRoom: 'text',
      primaryRoom: 'voice',
      gameRoom: 'game',
      clientId: 'local',
    },
    callbacks = new Set(),
    calls = [],
    saved = new Map();
  let joined = true;
  const client = createCallNavigation({
    network: {
      getSnapshot: () => membership,
      onMessage(listener) {
        callbacks.add(listener);
        return () => callbacks.delete(listener);
      },
    },
    storage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
    },
    joined: () => joined,
    accountId: () => 'account',
    onVoiceRoom: (room) => calls.push(['voice', room?.id ?? null]),
    onChange: () => calls.push('change'),
    closeSettings: () => calls.push('settings'),
    focusComposer: () => calls.push('focus'),
    playTextSound: () => calls.push('sound'),
    onDisconnected: () => calls.push('offline'),
  });
  t.after(client.dispose);
  client.start();
  return {
    client,
    membership,
    callbacks,
    calls,
    saved,
    setJoined: (value) => (joined = value),
    message: (msg) => {
      for (const listener of callbacks) listener(msg);
    },
  };
}
const room = (id, type = 'mixed') => ({
  id,
  kind: 'chat',
  name: id,
  channelType: type,
  voiceActive: true,
});
const activity = (overrides = {}) => ({
  type: 'message',
  message: { senderId: 'remote', accountId: 'other', ...overrides },
});
test('navigation projects text/voice channel rules without changing membership', async (t) => {
  const { client, membership, calls } = await setup(t);
  const before = { ...membership };
  client.setHub(true);
  client.consumeTextRoom(room('text', 'text'));
  client.toggleTextChat(false);
  assert.equal(client.getSnapshot().drawerOpen, true);
  client.consumeTextRoom(room('voice', 'voice'));
  client.toggleTextChat(true);
  assert.equal(client.getSnapshot().drawerOpen, false);
  client.consumeTextRoom(room('mixed'));
  client.toggleTextChat(true);
  assert.equal(client.getSnapshot().drawerOpen, true);
  client.setHub(false);
  client.toggleTextChat(false);
  assert.equal(client.getSnapshot().panelOpen, false);
  assert.deepEqual(membership, before);
  assert.equal(
    calls.some((call) => Array.isArray(call) && call[0] === 'voice'),
    false,
  );
});
test('voice metadata updates its owners before notifying views; independent text survives leaving game or voice', async (t) => {
  const { client, membership, calls, message } = await setup(t);
  client.consumeTextRoom(room('text', 'text'));
  client.consumeVoiceRoom(room('voice', 'voice'));
  const voiceIndex = calls.findLastIndex((row) => Array.isArray(row) && row[0] === 'voice');
  assert.equal(calls[voiceIndex + 1], 'change');
  message({ type: 'joined-game-room', room: { id: 'game', kind: 'game' }, primaryRoomId: 'voice' });
  assert.equal(client.getSnapshot().voiceRoom.id, 'voice');
  message({ type: 'left-game-room', roomId: 'game' });
  assert.equal(client.getSnapshot().voiceRoom.id, 'voice');
  membership.primaryRoom = null;
  message({ type: 'left-voice-room', roomId: 'voice' });
  assert.equal(client.getSnapshot().voiceRoom, null);
  assert.equal(client.getSnapshot().textRoom.id, 'text');
  assert.equal(membership.currentRoom, 'text');
  assert.equal(membership.gameRoom, 'game');
});
test('room-state follows only active memberships and malformed metadata cannot replace valid rooms', async (t) => {
  const { client, message } = await setup(t);
  client.consumeVoiceRoom(room('voice'));
  client.consumeTextRoom(room('text', 'text'));
  message({ type: 'room-state', room: room('other') });
  assert.equal(client.getSnapshot().voiceRoom.id, 'voice');
  for (const value of [
    [],
    { id: 'voice', kind: 'other' },
    { id: 'voice', kind: 'chat', voiceActive: 'yes' },
    { ...room('voice'), name: [] },
    { ...room('voice'), channelType: { toString: () => 'text' } },
  ])
    message({ type: 'room-state', room: value });
  assert.equal(client.getSnapshot().voiceRoom.channelType, 'mixed');
  message({ type: 'room-state', room: { ...room('voice', 'voice'), name: 'Updated' } });
  assert.equal(client.getSnapshot().voiceRoom.name, 'Updated');
  assert.equal(Object.isFrozen(client.getSnapshot().voiceRoom), true);
});
test('a game becomes the voice context only when primary; attachment keeps independent text metadata', async (t) => {
  const { client, message, membership } = await setup(t);
  client.consumeTextRoom(room('text', 'text'));
  message({
    type: 'joined-game-room',
    room: { id: 'game', kind: 'game', name: 'Mesa' },
    primaryRoomId: 'game',
  });
  assert.equal(client.getSnapshot().voiceRoom.kind, 'game');
  assert.equal(client.getSnapshot().textRoom.id, 'text');
  membership.primaryRoom = 'voice';
  message({ type: 'voice-room-attached', room: room('voice', 'voice') });
  assert.equal(client.getSnapshot().voiceRoom.id, 'voice');
  assert.equal(client.getSnapshot().textRoom.id, 'text');
});
test('unread and mute use the current chat activity; account and guest messages are recognized as self', async (t) => {
  const { client, calls, saved } = await setup(t);
  client.showForRoom(true);
  client.minimize();
  client.onChatActivity(activity());
  assert.equal(client.getSnapshot().unread, 1);
  assert.equal(calls.filter((x) => x === 'sound').length, 1);
  client.onChatActivity(activity({ accountId: 'account' }));
  client.onChatActivity(activity({ accountId: null, senderId: 'local' }));
  assert.equal(client.getSnapshot().unread, 1);
  client.showPanel(true);
  assert.equal(client.getSnapshot().unread, 0);
  client.minimize();
  client.toggleMute();
  client.onChatActivity(activity());
  assert.equal(client.getSnapshot().unread, 0);
  assert.equal(saved.get('tronoChatMuted'), '1');
  assert.equal(calls.filter((x) => x === 'sound').length, 1);
  client.toggleMute();
  client.onChatActivity(activity());
  client.onChatActivity({ type: 'read' });
  assert.equal(client.getSnapshot().unread, 0);
});
test('current text deletion clears only that metadata; disconnect does not silently join or move rooms', async (t) => {
  const { client, message, membership, calls } = await setup(t);
  client.consumeVoiceRoom(room('voice'));
  client.consumeTextRoom(room('text', 'text'));
  membership.currentRoom = null;
  message({ type: 'channel-deleted', roomId: 'text' });
  assert.equal(client.getSnapshot().textRoom, null);
  assert.equal(client.getSnapshot().voiceRoom.id, 'voice');
  const before = { ...membership };
  message({ type: 'connection', connected: false });
  assert(calls.includes('offline'));
  assert.deepEqual(membership, before);
});
test('desktop communication opens explicitly, minimization and restoration preserve room metadata', async (t) => {
  const { client, calls } = await setup(t);
  client.consumeVoiceRoom(room('voice'));
  client.openFromGame(true);
  client.openFromGame(true);
  assert.equal(client.getSnapshot().panelOpen, true);
  assert.equal(client.getSnapshot().gameCommunicationOpen, true);
  client.minimize();
  assert.equal(client.getSnapshot().gameCommunicationOpen, false);
  client.showPanel(true);
  assert.equal(client.getSnapshot().voiceRoom.id, 'voice');
  client.showForRoom(false);
  assert(calls.includes('settings'));
  assert.equal(client.getSnapshot().panelAvailable, false);
});
test('subscription installs once; disposal ignores messages and delayed commands without side effects', async (t) => {
  const { client, callbacks, calls, saved, message } = await setup(t);
  client.start();
  assert.equal(callbacks.size, 1);
  const delayedMessage = [...callbacks][0];
  client.dispose();
  assert.equal(callbacks.size, 0);
  const before = client.getSnapshot(),
    count = calls.length;
  client.consumeVoiceRoom(room('voice'));
  client.consumeTextRoom(room('text'));
  client.toggleTextChat(true);
  client.toggleMute();
  client.showForRoom(false);
  client.onChatActivity(activity());
  message({ type: 'connection', connected: false });
  delayedMessage({ type: 'connection', connected: false });
  assert.equal(client.getSnapshot(), before);
  assert.equal(calls.length, count);
  assert.equal(saved.size, 0);
});
