'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createCommunityNavigation } = require('../src/lib/navigation/community-navigation.ts');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture({ desktop = false, joined = false, gameRoom = null, list } = {}) {
  let account = 'account-a',
    screen = 'portalScreen',
    validation = async () => ({ ok: true, name: 'Alice' }),
    refresh = async () => {},
    leaving = async () => {},
    joiner = async () => {};
  const sources = new Set(),
    messages = new Set(),
    session = new Map(),
    storage = new Map(),
    sends = [],
    notices = [],
    warnings = [],
    calls = {
      joined: 0,
      left: 0,
      voiceRoomsLeft: 0,
      lobbyCleared: 0,
      chatCleared: 0,
      roomRequests: 0,
      channelRequests: 0,
      login: 0,
      validation: 0,
    },
    timers = new Set();
  let catalog = list ?? [
    { id: 'text', name: 'Texto', type: 'text' },
    { id: 'mixed', name: 'Geral', type: 'mixed' },
    { id: 'voice', name: 'Voz', type: 'voice' },
    { id: 'other', name: 'Outra voz', type: 'voice' },
  ];
  const navigation = { hub: false, textRoom: null };
  const publish = () => sources.forEach((fn) => fn());
  const network = {
    currentRoom: null,
    primaryRoom: gameRoom,
    gameRoom,
    connected: true,
    independentGameVoice: true,
    async joinTextChannel(id, name, current) {
      await joiner();
      if (!current()) return false;
      sends.push({ kind: 'text', id, name, current });
      return true;
    },
    async joinChatChannel(id, name, current) {
      await joiner();
      if (!current()) return false;
      sends.push({ kind: 'voice', id, name, current });
      return true;
    },
    leaveVoiceRoom() {
      calls.voiceRoomsLeft++;
    },
    requestRooms() {
      calls.roomRequests++;
    },
    requestChatChannels() {
      calls.channelRequests++;
    },
    onMessage(fn) {
      messages.add(fn);
      return () => messages.delete(fn);
    },
  };
  const voice = {
    get voiceJoined() {
      return joined;
    },
    async joinVoice() {
      calls.joined++;
      joined = true;
    },
    async leaveVoice() {
      calls.left++;
      await leaving();
      joined = false;
    },
    showForRoom() {
      publish();
    },
    setChatHubMode(value) {
      navigation.hub = value;
      publish();
    },
    consumeRoom() {},
    consumeChatRoom(value) {
      navigation.textRoom = value;
      publish();
    },
    clearChannelChat() {
      calls.chatCleared++;
    },
  };
  const controller = createCommunityNavigation({
    network,
    voice,
    navigation: { getSnapshot: () => navigation },
    channels: {
      get: (id) => catalog.find((c) => c.id === id),
      getSnapshot: () => ({ channels: catalog }),
    },
    desktop,
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    session: {
      getItem: (key) => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
      removeItem: (key) => session.delete(key),
    },
    accountId: () => account,
    screen: () => screen,
    name: () => 'Alice',
    openLogin() {
      calls.login++;
    },
    async validateIdentity() {
      calls.validation++;
      return validation();
    },
    refreshPermissions: () => refresh(),
    ensureAudio: async () => {},
    showCommunity() {
      screen = 'chatOnlyScreen';
      publish();
    },
    showPortal() {
      screen = 'portalScreen';
      publish();
    },
    focusIdentity() {},
    clearLobby() {
      calls.lobbyCleared++;
    },
    subscribeSource(fn) {
      sources.add(fn);
      return () => sources.delete(fn);
    },
    schedule(fn) {
      const job = { fn, active: true };
      timers.add(job);
      return () => {
        job.active = false;
        timers.delete(job);
      };
    },
    notify: (text, ms) => notices.push({ text, ms }),
    warn: (error) => warnings.push(error),
  });
  controller.start();
  return {
    controller,
    network,
    navigation,
    voice,
    calls,
    sends,
    notices,
    warnings,
    session,
    storage,
    sources,
    messages,
    timers,
    validate(fn) {
      validation = fn;
    },
    refresh(fn) {
      refresh = fn;
    },
    leaveVoice(fn) {
      leaving = fn;
    },
    join(fn) {
      joiner = fn;
    },
    identity(value) {
      account = value;
      publish();
    },
    screen(value) {
      screen = value;
      publish();
    },
    disconnect() {
      network.connected = false;
      publish();
    },
    get screenId() {
      return screen;
    },
    get joined() {
      return joined;
    },
    confirm(id, { count = 2, type } = {}) {
      const channel = catalog.find((c) => c.id === id);
      network.currentRoom = id;
      if (channel.type !== 'text') network.primaryRoom = id;
      navigation.textRoom = {
        id,
        kind: 'chat',
        name: channel.name,
        channelType: channel.type,
        count,
      };
      publish();
      this.emit({
        type: type ?? (channel.type === 'text' ? 'joined-text-channel' : 'joined-room'),
        room: navigation.textRoom,
      });
    },
    emit(msg) {
      messages.forEach((fn) => fn(msg));
    },
    fire() {
      for (const job of [...timers]) {
        timers.delete(job);
        if (job.active) job.fn();
      }
    },
  };
}
test('entry is deduplicated, projects confirmed metadata and never starts voice implicitly on web or desktop', async () => {
  for (const desktop of [false, true]) {
    const f = fixture({ desktop }),
      validation = deferred();
    f.validate(() => validation.promise);
    const first = f.controller.enter(),
      second = f.controller.enter();
    assert.equal(first, second);
    await flush();
    assert.equal(f.calls.validation, 1);
    validation.resolve({ ok: true, name: 'Alice' });
    assert.equal(await first, true);
    assert.equal(f.screenId, 'chatOnlyScreen');
    assert.equal(f.sends[0].id, desktop ? 'mixed' : 'text');
    assert.equal(f.calls.joined, 0);
    f.confirm(f.sends[0].id);
    const state = f.controller.getSnapshot();
    assert.equal(state.count, 2);
    assert.equal(state.roomName, desktop ? 'Geral' : 'Texto');
    assert(Object.isFrozen(state));
    assert(!('players' in state));
    assert.deepEqual(JSON.parse(f.session.get('mn-resume-chat')), {
      id: f.sends[0].id,
      userId: 'account-a',
    });
    f.controller.dispose();
    assert.equal(f.sources.size, 0);
    assert.equal(f.messages.size, 0);
  }
});
test('an independent game call survives community entry, restoration and text navigation without leaving its microphone', async () => {
  const f = fixture({ desktop: true, joined: true, gameRoom: 'sala-cetro' });
  await f.controller.enter();
  assert.equal(f.sends[0].kind, 'text');
  assert.equal(f.calls.left, 0);
  assert.equal(f.calls.lobbyCleared, 0);
  assert.equal(f.calls.joined, 0);
  assert.equal(f.joined, true);
  f.confirm('text');
  const count = f.sends.length;
  await f.controller.enter();
  assert.equal(f.sends.length, count);
  assert.equal(f.calls.left, 0);
  await f.controller.switchChannel('text');
  assert.equal(f.calls.left, 0);
  assert.equal(f.calls.joined, 0);
  f.controller.dispose();
});
test('validation, permissions and network waits cannot continue after navigation, identity ABA, disconnection or disposal', async () => {
  for (const stage of ['validation', 'permissions', 'network'])
    for (const change of ['screen', 'identity', 'disconnect', 'dispose']) {
      const f = fixture(),
        gate = deferred();
      if (stage === 'validation') f.validate(() => gate.promise);
      else if (stage === 'permissions') f.refresh(() => gate.promise);
      else f.join(() => gate.promise);
      const pending = f.controller.enter();
      await flush();
      if (change === 'screen') f.screen('setupScreen');
      else if (change === 'identity') {
        f.identity('b');
        f.identity('account-a');
      } else if (change === 'disconnect') f.disconnect();
      else f.controller.dispose();
      gate.resolve({ ok: true, name: 'Alice' });
      assert.equal(await pending, false, `${stage}/${change}`);
      assert.equal(f.sends.length, 0);
      assert.equal(f.calls.joined, 0);
      assert.deepEqual(f.notices, []);
      f.controller.dispose();
    }
});
test('explicit voice switching resumes only after its own current confirmation; text channels never stop or start voice', async () => {
  const f = fixture({ joined: true });
  await f.controller.enter({ channelId: 'voice' });
  f.confirm('voice');
  const left = f.calls.left;
  await f.controller.switchChannel('text');
  assert.equal(f.calls.left, left);
  assert.equal(f.calls.joined, 0);
  f.confirm('text');
  await f.controller.switchChannel('other', { connectVoice: true });
  assert.equal(f.calls.left, left + 1);
  assert.equal(f.calls.joined, 0);
  f.emit({ type: 'joined-room', room: { id: 'voice', kind: 'chat', name: 'Voz' } });
  assert.equal(f.calls.joined, 0);
  f.confirm('other');
  await flush();
  assert.equal(f.calls.joined, 1);
  assert.equal(f.joined, true);
  f.confirm('other');
  await flush();
  assert.equal(f.calls.joined, 1);
  f.controller.dispose();
});
test('leaving or changing identity invalidates delayed channel joins and voice resume confirmations', async () => {
  for (const change of ['leave', 'screen', 'identity', 'deleted']) {
    const f = fixture();
    await f.controller.enter({ channelId: 'voice' });
    f.confirm('voice');
    await f.controller.switchChannel('other', { connectVoice: true });
    if (change === 'leave') await f.controller.leave();
    else if (change === 'screen') f.screen('setupScreen');
    else if (change === 'identity') {
      f.identity('b');
      f.identity('account-a');
    } else f.emit({ type: 'channel-deleted', roomId: 'other' });
    f.confirm('other');
    await flush();
    assert.equal(f.calls.joined, 0, change);
    f.controller.dispose();
  }
  const f = fixture(),
    gate = deferred();
  await f.controller.enter();
  f.confirm('text');
  f.join(() => gate.promise);
  const pending = f.controller.switchChannel('voice', { connectVoice: true });
  await flush();
  await f.controller.leave();
  gate.resolve();
  await pending;
  assert.equal(f.sends.length, 1);
  assert.equal(f.screenId, 'portalScreen');
  assert.equal(f.calls.joined, 0);
  f.controller.dispose();
});
test('a late leave cannot hide or detach a newer community entry and disposal cancels the room-list timer', async () => {
  const f = fixture();
  await f.controller.enter();
  f.confirm('text');
  const gate = deferred();
  f.leaveVoice(() => gate.promise);
  const old = f.controller.leave();
  await flush();
  await f.controller.enter({ channelId: 'text' });
  gate.resolve();
  await old;
  assert.equal(f.screenId, 'chatOnlyScreen');
  assert.equal(f.calls.voiceRoomsLeft, 0);
  f.leaveVoice(async () => {});
  await f.controller.leave();
  assert.equal(f.screenId, 'portalScreen');
  assert.equal(f.calls.voiceRoomsLeft, 1);
  assert.equal(f.timers.size, 1);
  f.controller.dispose();
  f.fire();
  assert.equal(f.calls.roomRequests, 0);
});
test('deleted channels clear only their labels/return target; restoration is account-scoped and never starts capture', async () => {
  const f = fixture();
  await f.controller.enter();
  f.confirm('text');
  f.emit({ type: 'channel-deleted', roomId: 'elsewhere' });
  assert.equal(f.calls.chatCleared, 0);
  f.emit({ type: 'channel-deleted', roomId: 'text' });
  assert.match(f.controller.getSnapshot().status, /excluído/);
  assert.equal(f.session.has('mn-resume-chat'), false);
  assert.equal(f.calls.chatCleared, 1);
  assert.equal(f.calls.left, 0);
  f.controller.dispose();
  for (const saved of [
    'broken',
    JSON.stringify({ id: 'voice', userId: 'other' }),
    JSON.stringify({ id: 'voice', userId: 'account-a' }),
  ]) {
    const g = fixture();
    g.session.set('mn-resume-chat', saved);
    await g.controller.restore();
    assert.equal(g.sends.length, saved.includes('account-a') ? 1 : 0);
    assert.equal(g.calls.joined, 0);
    g.controller.dispose();
  }
  const guest = fixture();
  guest.identity(null);
  assert.equal(await guest.controller.enter(), false);
  assert.equal(guest.calls.login, 1);
  assert.equal(guest.sends.length, 0);
  guest.controller.dispose();
});

test('initial account hydration permits account-scoped restoration while explicit navigation suppresses it', async () => {
  const f = fixture();
  f.identity('hydrated');
  f.session.set('mn-resume-chat', JSON.stringify({ id: 'voice', userId: 'hydrated' }));
  await f.controller.restore();
  assert.equal(f.sends.length, 1);
  assert.equal(f.calls.joined, 0);
  f.controller.dispose();
  const g = fixture();
  await g.controller.enter({ channelId: 'text' });
  g.session.set('mn-resume-chat', JSON.stringify({ id: 'voice', userId: 'account-a' }));
  await g.controller.restore();
  assert.equal(g.sends.length, 1);
  assert.equal(g.sends[0].id, 'text');
  g.controller.dispose();
});
