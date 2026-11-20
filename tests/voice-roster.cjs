'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/roster.ts');
const protocolPromise = import('../src/lib/voice/roster-protocol.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let reject;
  const promise = new Promise((_, no) => (reject = no));
  return { promise, reject };
};
const person = (id, extra = {}) => ({ id, name: id, ...extra });
async function setup(t, overrides = {}) {
  const { createVoiceRoster } = await modulePromise;
  const call = { joined: true, generation: 1 },
    state = { mode: 'p2p', changes: 0, sfuSyncs: 0, catalog: [] };
  const connections = new Map(),
    subscriptions = new Map(),
    gains = new Map(),
    listeners = new Set();
  const ensured = [],
    closed = [],
    negotiated = [],
    signals = [],
    sounds = [],
    notices = [],
    warnings = [],
    restored = [],
    closedSubscriptions = [];
  const roster = createVoiceRoster({
    localId: () => 'me',
    call: () => call,
    transport: () => state.mode,
    peers: {
      connections,
      ensure(id) {
        ensured.push(id);
        if (!connections.has(id)) connections.set(id, { connectionState: 'connected' });
        return connections.get(id);
      },
      negotiate: (...args) => negotiated.push(args),
      handleSignal: async (message) => {
        signals.push(message);
      },
    },
    closePeer(id) {
      closed.push(id);
      connections.delete(id);
    },
    sfu: {
      subscriptions,
      getPublications: () => state.catalog,
      setPublications(value) {
        state.catalog = value;
      },
      closeSubscription: async (key) => {
        closedSubscriptions.push(key);
        subscriptions.delete(key);
      },
      syncSubscriptions: async () => {
        state.sfuSyncs++;
      },
    },
    hasGain: (id) => gains.has(id),
    restoreGain(id, accountId) {
      restored.push([id, accountId]);
      gains.set(id, 150);
    },
    onSound: (...args) => sounds.push(args),
    onNotice: (notice) => notices.push(notice),
    onChange: () => state.changes++,
    warn: (error) => warnings.push(error),
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...overrides,
  });
  t.after(roster.dispose);
  roster.setRoom('room');
  roster.start();
  const emit = (message) => {
    for (const fn of listeners) fn(message);
  };
  const replace = (players) => emit({ type: 'voice-roster', roomId: 'room', players });
  return {
    roster,
    emit,
    replace,
    state,
    call,
    listeners,
    connections,
    subscriptions,
    gains,
    ensured,
    closed,
    negotiated,
    signals,
    sounds,
    notices,
    warnings,
    restored,
    closedSubscriptions,
  };
}

test('private membership is accepted only while joined and for the current room', async (t) => {
  const h = await setup(t);
  h.call.joined = false;
  h.replace([person('remote')]);
  assert.equal(h.roster.members.size, 0);
  h.call.joined = true;
  h.emit({ type: 'voice-roster', roomId: 'other', players: [person('other')] });
  assert.equal(h.roster.members.size, 0);
  h.replace([person('remote')]);
  assert.equal(h.roster.members.size, 1);
});
test('snapshot is sorted, copied and frozen without changing the backend list', async (t) => {
  const h = await setup(t),
    rows = [person('late', { seat: 4 }), person('first', { seat: 0 }), person('unknown')];
  h.replace(rows);
  const snapshot = h.roster.getSnapshot();
  assert.deepEqual(
    snapshot.participants.map((p) => p.id),
    ['first', 'late', 'unknown'],
  );
  assert.equal(snapshot, h.roster.getSnapshot());
  rows[0].name = 'mutated';
  assert.equal(h.roster.members.get('late').name, 'late');
  assert.throws(() => (snapshot.participants[0].camera = true), TypeError);
  assert.throws(() => snapshot.participants.push(person('extra')), TypeError);
  assert.deepEqual(
    rows.map((p) => p.id),
    ['late', 'first', 'unknown'],
  );
});
test('malformed and duplicate roster replacements cannot evict members or close healthy peers', async (t) => {
  const h = await setup(t);
  h.replace([person('healthy')]);
  const snapshot = h.roster.getSnapshot();
  for (const value of [
    undefined,
    null,
    {},
    [null],
    [person('')],
    [person('x'), person('x')],
    [person('x', { muted: 'false' })],
    [person('x', { transport: 'invalid' })],
    [person('x', { quality: '__proto__' })],
    [person('x', { seat: NaN })],
    [person('x', { accountId: {} })],
    [person('x', { avatar_file_id: [] })],
  ])
    h.replace(value);
  assert.equal(snapshot, h.roster.getSnapshot());
  assert.deepEqual(h.closed, []);
  assert(h.connections.has('healthy'));
});
test('empty roster is authoritative and closes removed peers', async (t) => {
  const h = await setup(t);
  h.replace([person('remote')]);
  h.replace([]);
  assert.equal(h.roster.members.size, 0);
  assert.deepEqual(h.closed, ['remote']);
  assert.deepEqual(h.sounds, [['leave', 'remote']]);
});
test('SDP waits for remote P2P readiness and excludes the local participant', async (t) => {
  const h = await setup(t);
  h.replace([
    person('me'),
    person('ready'),
    person('pending', { transport: 'sfu-pending' }),
    person('sfu', { transport: 'sfu' }),
  ]);
  assert.deepEqual(h.ensured, ['ready']);
  h.replace([person('me'), person('ready'), person('pending', { transport: 'p2p' })]);
  assert(h.connections.has('pending'));
  assert(!h.connections.has('me'));
});
test('a failed active P2P peer requests ICE recovery while absent peers are closed', async (t) => {
  const h = await setup(t);
  h.connections.set('failed', { connectionState: 'failed' });
  h.connections.set('stale', { connectionState: 'connected' });
  h.replace([person('failed')]);
  assert.deepEqual(h.negotiated, [['failed', true, true]]);
  assert.deepEqual(h.closed, ['stale']);
});
test('SFU, pending and stopping modes cannot create a competing P2P mesh', async (t) => {
  const h = await setup(t);
  h.replace([person('remote')]);
  for (const mode of ['sfu-pending', 'stopping', 'sfu']) {
    h.state.mode = mode;
    h.roster.sync();
  }
  assert.deepEqual(h.ensured, ['remote']);
  assert.equal(h.connections.size, 0);
  assert.equal(h.state.sfuSyncs, 1);
  h.state.mode = 'p2p';
  h.roster.sync();
  assert(h.connections.has('remote'));
});
test('initial legacy roster is silent; subsequent additions/removals emit each sound once', async (t) => {
  const h = await setup(t);
  h.replace([person('me'), person('one')]);
  assert.deepEqual(h.sounds, []);
  h.replace([person('me'), person('one'), person('two')]);
  h.replace([person('me'), person('one'), person('two')]);
  h.replace([person('me'), person('two')]);
  h.emit({ type: 'player-left', roomId: 'room', playerId: 'one' });
  assert.deepEqual(h.sounds, [
    ['join', 'two'],
    ['leave', 'one'],
  ]);
});
test('modern voice events own notices and sounds without duplicates from snapshots or legacy deltas', async (t) => {
  const h = await setup(t);
  h.emit({ type: 'welcome', features: { voiceEvents: true } });
  h.replace([person('me')]);
  h.emit({
    type: 'voice-event',
    roomId: 'room',
    playerId: 'remote',
    kind: 'joined',
    name: 'Remote',
  });
  h.replace([person('me'), person('remote')]);
  h.emit({ type: 'voice-state', playerId: 'remote', joined: false });
  h.emit({ type: 'player-left', roomId: 'room', playerId: 'remote' });
  assert.deepEqual(h.sounds, [['join', 'remote']]);
  assert.equal(h.notices.length, 1);
});
test('notice validation rejects unknown kinds, another room and self events; non-call observers retain notices', async (t) => {
  const h = await setup(t);
  h.call.joined = false;
  const event = { type: 'voice-event', roomId: 'room', playerId: 'remote', kind: 'disconnected' };
  for (const patch of [
    { roomId: 'other' },
    { playerId: 'me' },
    { kind: 'bad' },
    { name: {} },
    { at: Infinity },
  ])
    h.emit({ ...event, ...patch });
  assert.deepEqual(h.notices, []);
  h.emit(event);
  assert.deepEqual(h.sounds, [['disconnect', 'remote']]);
  assert.equal(h.roster.members.size, 0);
});
test('account gains restore only for an account change or a missing player gain', async (t) => {
  const h = await setup(t),
    row = person('remote', { accountId: 'account' });
  h.replace([row]);
  h.gains.set('remote', 200);
  h.replace([row]);
  assert.equal(h.gains.get('remote'), 200);
  assert.deepEqual(h.restored, [['remote', 'account']]);
  h.gains.clear();
  h.replace([row]);
  h.replace([{ ...row, accountId: 'another' }]);
  assert.deepEqual(h.restored, [
    ['remote', 'account'],
    ['remote', 'account'],
    ['remote', 'another'],
  ]);
});
test('legacy delta preserves profile metadata and quality while updating camera and mute', async (t) => {
  const h = await setup(t);
  h.replace([
    person('remote', {
      accountId: 'account',
      avatar_preset: 'moon',
      avatar_file_id: 'file',
      quality: 'high',
      transport: 'sfu',
      seat: 2,
    }),
  ]);
  h.emit({ type: 'voice-state', playerId: 'remote', joined: true, camera: true, muted: true });
  const row = h.roster.members.get('remote');
  assert.equal(row.accountId, 'account');
  assert.equal(row.avatar_file_id, 'file');
  assert.equal(row.avatar_preset, 'moon');
  assert.equal(row.quality, 'high');
  assert.equal(row.transport, 'sfu');
  assert.equal(row.seat, 2);
  assert.equal(row.camera, true);
  assert.equal(row.muted, true);
  assert.deepEqual(h.sounds, []);
});
test('legacy joined/left deltas emit only membership transitions; malformed and foreign deltas are ignored', async (t) => {
  const h = await setup(t);
  h.replace([]);
  for (const message of [
    { playerId: 'remote', joined: 'false' },
    { playerId: 'remote' },
    { playerId: 'remote', joined: true, roomId: 'other' },
    { playerId: 'remote', joined: true, camera: 'yes' },
  ])
    h.emit({ type: 'voice-state', ...message });
  assert.equal(h.roster.members.size, 0);
  h.emit({ type: 'voice-state', playerId: 'remote', joined: true });
  h.emit({ type: 'voice-state', playerId: 'remote', joined: true });
  h.emit({ type: 'voice-state', playerId: 'remote', joined: false });
  assert.deepEqual(h.sounds, [
    ['join', 'remote'],
    ['leave', 'remote'],
  ]);
});
test('signals without roomId remain compatible; explicit foreign rooms and non-P2P calls are blocked', async (t) => {
  const h = await setup(t),
    signal = {
      type: 'voice-signal',
      fromId: 'remote',
      signalType: 'stream-watch',
      data: { watching: true },
    };
  h.emit(signal);
  h.emit({ ...signal, roomId: 'room' });
  h.emit({ ...signal, roomId: 'other' });
  for (const mode of ['sfu', 'sfu-pending', 'stopping']) {
    h.state.mode = mode;
    h.emit(signal);
  }
  h.state.mode = 'p2p';
  h.call.joined = false;
  h.emit(signal);
  assert.deepEqual(h.signals, [signal, { ...signal, roomId: 'room' }]);
});
test('player departure cleans only that participant in SFU and retains other publications', async (t) => {
  const h = await setup(t);
  h.state.mode = 'sfu';
  h.replace([person('remote'), person('other')]);
  for (const kind of ['audio', 'camera', 'screen', 'screen-audio'])
    h.subscriptions.set('remote:' + kind, {});
  h.subscriptions.set('other:audio', {});
  h.state.catalog = [{ ownerId: 'remote' }, { ownerId: 'other' }];
  h.emit({ type: 'player-left', roomId: 'other-room', playerId: 'other' });
  assert(h.roster.members.has('other'));
  h.emit({ type: 'player-left', roomId: 'room', playerId: 'remote' });
  assert.equal(h.closedSubscriptions.length, 4);
  assert(h.subscriptions.has('other:audio'));
  assert.deepEqual(h.state.catalog, [{ ownerId: 'other' }]);
  assert.equal(h.roster.members.has('remote'), false);
});
test('SFU publication broadcasts delegate catalog validation to the existing session', async (t) => {
  const h = await setup(t);
  h.state.mode = 'sfu';
  const publications = [{ ownerId: 'remote' }];
  h.emit({ type: 'sfu-publications', roomId: 'other', publications });
  assert.deepEqual(h.state.catalog, []);
  h.emit({ type: 'sfu-publications', roomId: 'room', publications });
  assert.equal(h.state.catalog, publications);
  assert.equal(h.state.sfuSyncs, 1);
});
test('same room updates preserve members and peers; changing room clears private state and suppresses late lists', async (t) => {
  const h = await setup(t);
  h.replace([person('remote')]);
  const peer = h.connections.get('remote'),
    snapshot = h.roster.getSnapshot();
  h.roster.setRoom('room');
  assert.equal(h.roster.getSnapshot(), snapshot);
  assert.equal(h.connections.get('remote'), peer);
  h.roster.setRoom('new');
  assert.equal(h.roster.members.size, 0);
  assert.equal(h.connections.size, 0);
  h.replace([person('old')]);
  assert.equal(h.roster.members.size, 0);
  assert.equal(h.roster.getSnapshot().initialized, false);
});
test('reset starts a silent new roster without forgetting server event capability', async (t) => {
  const h = await setup(t);
  h.emit({ type: 'welcome', features: { voiceEvents: true } });
  h.replace([person('remote')]);
  h.roster.reset();
  assert.equal(h.roster.members.size, 0);
  assert.equal(h.roster.getSnapshot().eventsSupported, true);
  assert.equal(h.roster.getSnapshot().initialized, false);
  h.replace([person('new')]);
  assert.deepEqual(h.sounds, []);
});
test('disconnect clears private members and feature flags; invalid welcome cannot change a confirmed capability', async (t) => {
  const h = await setup(t);
  h.emit({ type: 'welcome', features: { voiceEvents: true } });
  h.emit({ type: 'welcome', features: { voiceEvents: 'false' } });
  assert.equal(h.roster.getSnapshot().eventsSupported, true);
  h.replace([person('remote')]);
  h.emit({ type: 'connection', connected: false });
  assert.equal(h.roster.members.size, 0);
  assert.equal(h.connections.size, 0);
  assert.equal(h.roster.getSnapshot().eventsSupported, false);
});
test('a rejected async signal is reported only while its call and room are current', async (t) => {
  const blocked = deferred();
  const h = await setup(t, {
    peers: {
      connections: new Map(),
      ensure() {},
      negotiate() {},
      handleSignal: () => blocked.promise,
    },
  });
  h.emit({ type: 'voice-signal' });
  h.call.generation++;
  h.roster.reset();
  blocked.reject(new Error('Old negotiation'));
  await tick();
  assert.deepEqual(h.warnings, []);
});
test('a synchronous peer allocation error is reported without escaping the socket listener', async (t) => {
  const error = new Error('Native peer allocation failed');
  const h = await setup(t, {
    peers: {
      connections: new Map(),
      ensure() {},
      negotiate() {},
      handleSignal() {
        throw error;
      },
    },
  });
  assert.doesNotThrow(() => h.emit({ type: 'voice-signal' }));
  assert.deepEqual(h.warnings, [error]);
});
test('start is idempotent; dispose detaches its listener and closes borrowed peers through their owner', async (t) => {
  const h = await setup(t);
  h.roster.start();
  assert.equal(h.listeners.size, 1);
  h.replace([person('remote')]);
  const oldListener = [...h.listeners][0];
  h.roster.dispose();
  h.roster.start();
  oldListener({ type: 'voice-roster', roomId: 'room', players: [person('late')] });
  assert.equal(h.listeners.size, 0);
  assert.equal(h.connections.size, 0);
  assert.equal(h.roster.members.size, 0);
});
test('protocol accepts legacy defaults and strips unrelated payload fields', async () => {
  const { parseVoiceParticipants } = await protocolPromise;
  const [row] = parseVoiceParticipants([
    person('remote', { token: 'secret', sdp: 'secret', screenFps: 60 }),
  ]);
  assert.equal(row.transport, 'p2p');
  assert.equal(row.quality, 'balanced');
  assert.equal(row.avatar_preset, 'crown');
  assert.equal(row.joined, true);
  assert.equal('token' in row, false);
  assert.equal('sdp' in row, false);
  assert.equal('screenFps' in row, false);
});

test('a reconnecting signaling channel retains the roster and established peers', async (t) => {
  const h = await setup(t);
  h.replace([person('me'), person('other')]);
  const peer = h.connections.get('other');
  h.emit({type:'connection',connected:false,recovering:true});
  assert.equal(h.roster.getSnapshot().participants.length,2);
  assert.equal(h.connections.get('other'),peer);
  assert.deepEqual(h.closed,[]);
  h.emit({type:'connection',connected:false,recoveryFailed:true});
  assert.equal(h.roster.getSnapshot().participants.length,0);
  assert.deepEqual(h.closed,['other']);
});
