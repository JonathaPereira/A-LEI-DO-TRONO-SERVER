'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./channel-service-fixture.cjs');
const { readVoiceState, readVoiceSignal } = require('../server/channel-protocol.ts');

test('channel voice inputs project known fields and share the client WebRTC parser without importing DOM resources', () => {
  for (const value of [
    null,
    [],
    {},
    { joined: 1 },
    { joined: true, muted: 'false' },
    { joined: true, screenFps: 120 },
    { joined: true, quality: 'ultra' },
    { joined: true, transport: 'udp' },
    { joined: true, camera: {} },
  ])
    assert.equal(readVoiceState(value), null);
  assert.deepEqual(
    readVoiceState({ joined: true, screenFps: 60, quality: 'high', influence: 99 }),
    { joined: true, screenFps: 60, quality: 'high' },
  );
  for (const value of [
    { targetId: 'b', signalType: 'offer', data: { sdp: 'v=0' } },
    { targetId: 'b', signalType: 'ice', data: { candidate: 'x', sdpMLineIndex: -1 } },
    { targetId: 'b', signalType: 'stream-watch', data: { watching: 1 } },
    { targetId: 'b', signalType: 'renegotiate-request', data: { iceRestart: 'true' } },
  ])
    assert.equal(readVoiceSignal(value, 'a'), null);
  assert.deepEqual(
    readVoiceSignal(
      {
        targetId: 'b',
        fromId: 'spoof',
        signalType: 'offer',
        data: { type: 'offer', sdp: 'v=0', secret: 'drop' },
      },
      'a',
    ),
    { targetId: 'b', signalType: 'offer', data: { type: 'offer', sdp: 'v=0' } },
  );
});

test('independent text and game membership preserve the original voice member, flags, socket and mode', () => {
  const f = fixture(),
    a = f.connection('alice'),
    b = f.connection('bob');
  try {
    for (const ws of [a, b]) {
      f.service.joinRoom(ws, 'voice-only');
      f.service.handleVoiceState(ws, {
        joined: true,
        muted: true,
        deafened: true,
        camera: true,
        screen: true,
        screenFps: 60,
      });
    }
    const member = f.rooms.get('voice-only').players.get(a.clientId),
      before = { ...member };
    f.service.joinTextRoom(a, 'text-only');
    f.service.joinGameRoom(a, 'sala-cetro');
    assert.equal(a.roomId, 'voice-only');
    assert.equal(a.textRoomId, 'text-only');
    assert.equal(a.gameRoomId, 'sala-cetro');
    assert.equal(f.rooms.get('voice-only').players.get(a.clientId), member);
    assert.deepEqual(member, before);
    f.service.leaveGameRoom(a);
    assert.equal(a.roomId, 'voice-only');
    assert.equal(a.textRoomId, 'text-only');
    f.service.leaveTextRoom(a);
    assert.equal(a.roomId, 'voice-only');
    assert.deepEqual(member, before);
    f.service.handleVoiceSignal(a, {
      targetId: b.clientId,
      signalType: 'offer',
      data: { type: 'offer', sdp: 'v=0' },
    });
    assert.equal(f.messages.at(-1).type, 'voice-signal');
    assert.equal(f.messages.at(-1).to, b.clientId);
  } finally {
    f.service.stop();
  }
});

test('full, malformed, active and text-only destinations preserve the call; guests stay in game rooms', () => {
  const f = fixture(),
    a = f.connection('alice');
  try {
    f.service.joinRoom(a, 'voice-only');
    f.service.handleVoiceState(a, { joined: true, camera: true });
    const before = JSON.stringify(a);
    for (let i = 0; i < 4; i++) f.service.joinGameRoom(f.connection('peer-' + i), 'sala-cetro');
    f.service.joinGameRoom(a, 'sala-cetro');
    assert.equal(f.messages.at(-1).code, 'ROOM_FULL');
    assert.equal(JSON.stringify(a), before);
    f.service.joinRoom(a, { toString: () => 'text-only' });
    assert.equal(JSON.stringify(a), before);
    f.rooms.get('sala-chave').game = { phase: 'starting' };
    f.service.joinGameRoom(a, 'sala-chave');
    assert.equal(f.messages.at(-1).code, 'GAME_IN_PROGRESS');
    assert.equal(JSON.stringify(a), before);
    const guest = f.connection('guest', 'Visitante', true);
    f.service.joinTextRoom(guest, 'text-only');
    assert.equal(f.messages.at(-1).code, 'LOGIN_REQUIRED_CHAT');
    assert.equal(guest.textRoomId, null);
    f.service.joinRoom(guest, 'voice-only');
    assert.equal(guest.roomId, null);
    f.service.joinGameRoom(guest, 'sala-mascara');
    assert.equal(guest.gameRoomId, 'sala-mascara');
  } finally {
    f.service.stop();
  }
});

test('private rosters and signaling require current socket, voice participation, destination and P2P mode', () => {
  const f = fixture(),
    a = f.connection('alice'),
    b = f.connection('bob'),
    observer = f.connection('reader');
  try {
    for (const ws of [a, b, observer]) f.service.joinRoom(ws, 'chat-jogos');
    for (const ws of [a, b]) f.service.handleVoiceState(ws, { joined: true, camera: true });
    f.messages.length = 0;
    f.service.broadcastVoiceRoster(f.rooms.get('chat-jogos'));
    assert.equal(f.messages.length, 2);
    assert(!f.messages.some((message) => message.to === observer.clientId));
    for (const room of f.service.safeRooms())
      assert(room.players.every((player) => !('camera' in player) && !('muted' in player)));
    const signal = {
      targetId: b.clientId,
      signalType: 'offer',
      data: { type: 'offer', sdp: 'v=0' },
    };
    const before = f.messages.length;
    f.service.handleVoiceSignal({ ...a }, signal);
    f.service.handleVoiceState({ ...a }, { joined: false });
    f.service.handleVoiceSignal(observer, signal);
    f.service.handleVoiceSignal(a, { ...signal, targetId: a.clientId });
    f.service.handleVoiceSignal(a, { ...signal, data: { sdp: 'v=0' } });
    assert.equal(f.messages.length, before);
    assert.equal(f.rooms.get('chat-jogos').players.get('alice').voiceJoined, true);
    f.rooms.get('chat-jogos').players.get('bob').mediaTransport = 'sfu';
    f.service.handleVoiceSignal(a, signal);
    assert.equal(f.messages.length, before);
    f.rooms.get('chat-jogos').players.get('bob').mediaTransport = 'p2p';
    f.service.handleVoiceSignal(a, signal);
    assert.equal(f.messages.at(-1).fromId, a.clientId);
  } finally {
    f.service.stop();
  }
});

test('SFU mode is shared by the room, admission falls back together and leaving the last caller resets it', () => {
  const f = fixture({ enabled: true, maxParticipants: 1 }),
    a = f.connection('alice'),
    b = f.connection('bob');
  try {
    for (const ws of [a, b]) f.service.joinRoom(ws, 'chat-jogos');
    f.service.prepareVoice(a, { requestId: 'prepare' });
    assert.equal(f.messages.find((m) => m.requestId === 'prepare').data.mode, 'sfu');
    f.service.handleVoiceState(a, { joined: true, transport: 'sfu' });
    assert.equal(f.rooms.get('chat-jogos').players.get('alice').mediaTransport, 'sfu');
    f.service.handleVoiceState(b, { joined: true, transport: 'sfu' });
    const room = f.rooms.get('chat-jogos');
    assert.equal(room.voiceMode, 'p2p');
    assert([...room.players.values()].every((p) => p.mediaTransport === 'p2p'));
    assert(f.effects.some((effect) => effect.cleanup?.[0] === 'alice'));
    for (const ws of [a, b]) f.service.handleVoiceState(ws, { joined: false });
    assert.equal(room.voiceMode, null);
    f.service.prepareVoice(a, { requestId: 'fresh' });
    assert.equal(f.messages.find((m) => m.requestId === 'fresh').data.mode, 'sfu');
  } finally {
    f.service.stop();
  }
});

test('deleting selected text keeps voice, deleting voice keeps selected text, and a game can reattach its call', () => {
  const f = fixture(),
    a = f.connection('alice');
  try {
    f.service.joinRoom(a, 'voice-only');
    f.service.handleVoiceState(a, { joined: true });
    f.service.joinTextRoom(a, 'text-only');
    f.service.deleteRoom(f.rooms.get('text-only'));
    assert.equal(a.textRoomId, null);
    assert.equal(a.roomId, 'voice-only');
    f.service.joinTextRoom(a, 'text-only');
    f.service.deleteRoom(f.rooms.get('voice-only'));
    assert.equal(a.roomId, null);
    assert.equal(a.textRoomId, 'text-only');
    f.service.joinGameRoom(a, 'sala-cetro');
    f.service.leaveVoiceRoom(a);
    assert.equal(a.gameRoomId, 'sala-cetro');
    assert.equal(a.roomId, null);
    f.service.prepareVoice(a, { requestId: 'game-call' });
    assert.equal(a.roomId, 'sala-cetro');
    assert.equal(f.messages.find((m) => m.requestId === 'game-call').data.mode, 'p2p');
  } finally {
    f.service.stop();
  }
});

test('channel names reject reserved guest identities and stop releases memberships without late broadcasts', () => {
  const f = fixture(),
    a = f.connection('alice'),
    guest = f.connection('guest', 'Reserved', true);
  f.service.joinGameRoom(guest, 'sala-cetro');
  assert.equal(f.messages.at(-1).code, 'NAME_TAKEN');
  f.service.joinRoom(a, 'chat-jogos');
  f.service.handleVoiceState(a, { joined: true });
  const room = f.rooms.get('chat-jogos');
  f.service.stop();
  f.service.stop();
  const count = f.messages.length,
    effects = f.effects.length;
  f.service.leaveRoom(a);
  f.service.joinRoom(a, 'chat-livre');
  f.service.prepareVoice(a, { requestId: 'late' });
  f.service.handleVoiceState(a, { joined: true });
  f.service.broadcastVoiceRoster(room);
  f.service.broadcastRooms();
  f.service.fallbackVoice(a);
  f.service.deleteRoom(room);
  assert.equal(f.rooms.size, 0);
  assert.equal(room.players.size, 0);
  assert.equal(f.messages.length, count);
  assert.equal(f.effects.length, effects);
});
