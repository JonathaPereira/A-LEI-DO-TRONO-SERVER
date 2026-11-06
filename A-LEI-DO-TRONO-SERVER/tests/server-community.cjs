'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createCommunity } = require('../server/community.ts');
const { readDirectory } = require('../server/community-protocol.ts');
const { createGuestSessions } = require('../server/sessions.ts');
const { validNickname } = require('../src/lib/auth/nickname.ts');
const row = (id = 'offline-a') => ({
  id,
  nickname: id,
  role: 'member',
  avatar_preset: 'crown',
  avatar_file_id: null,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
function fixture(fetchImpl, rooms = new Map()) {
  const account = {
    clientId: 'socket-a',
    readyState: 1,
    account: {
      id: 'account-a',
      nickname: 'Membro',
      role: 'member',
      expiresAt: Date.now() + 100000,
    },
  };
  const clients = new Set([account]),
    events = [];
  const service = createCommunity({
    wss: { clients },
    rooms,
    send: (connection, message) => events.push({ connection, message }),
    auth: { configured: true },
    env: {
      SUPABASE_URL: 'https://directory.invalid',
      SUPABASE_SECRET_KEY: 'sb_secret_directory_fixture',
    },
    fetchImpl,
  });
  return { service, account, clients, events };
}

test('directory validates an entire bounded page and strips provider fields before public projection', () => {
  for (const data of [
    null,
    {},
    [null],
    [[row()]],
    [{ ...row(), id: '' }],
    [{ ...row(), nickname: null }],
    [{ ...row(), role: ['admin'] }],
    [{ ...row(), avatar_file_id: 5 }],
    [row(), row()],
    Array.from({ length: 1001 }, (_, index) => row('id-' + index)),
  ])
    assert.throws(() => readDirectory(data), /invalid directory/);
  assert.deepEqual(
    readDirectory([{ id: 'a', nickname: 'Antes', email: 'private@example.test', expiresAt: 42 }]),
    [{ id: 'a', nickname: 'Antes', role: 'member', avatar_preset: 'crown', avatar_file_id: null }],
  );
});

test('malformed refresh cannot partially erase cached members or poison reserved names', async () => {
  let result = [row()],
    requests = [];
  const f = fixture(async (url, options) => {
    requests.push({ url, options });
    return Response.json(result);
  });
  try {
    await f.service.refreshDirectory();
    assert.equal(f.service.nameReserved('OFFLINE-A'), true);
    const before = f.service.snapshot(f.account).members;
    result = [row('new-member'), { ...row('broken'), nickname: null }];
    await f.service.refreshDirectory();
    assert.equal(f.service.health().directoryReady, false);
    assert.equal(f.service.nameReserved('offline-a'), true);
    assert.equal(f.service.nameReserved('new-member'), false);
    assert.deepEqual(
      f.service.snapshot(f.account).members.map((person) => person.id),
      before.map((person) => person.id),
    );
    result = [row('replacement')];
    await f.service.refreshDirectory();
    assert.equal(f.service.nameReserved('offline-a'), false);
    assert.equal(f.service.nameReserved('replacement'), true);
    assert.equal(f.service.health().directoryReady, true);
    assert.equal(requests[0].options.headers.Authorization, undefined);
    assert.equal(requests[0].options.body, '{}');
  } finally {
    f.service.stop();
  }
});

test('directory refresh deduplicates and stop aborts its HTTP while suppressing a late opaque response', async () => {
  const gate = deferred();
  let signal,
    requests = 0;
  const f = fixture((_url, options) => {
    requests++;
    signal = options.signal;
    return gate.promise;
  });
  const pending = f.service.refreshDirectory();
  assert.equal(f.service.refreshDirectory(), pending);
  assert.equal(requests, 1);
  f.service.stop();
  f.service.stop();
  assert.equal(signal.aborted, true);
  gate.resolve(Response.json([row('late-member')]));
  await pending;
  assert.equal(f.service.nameReserved('late-member'), false);
  assert.deepEqual(f.service.snapshot(f.account).members, []);
  assert.equal(f.events.length, 0);
  await f.service.refreshDirectory();
  assert.equal(requests, 1);
  assert.equal(
    f.service.updateActivity(f.account, { name: 'Late game' }).code,
    'COMMUNITY_UNAVAILABLE',
  );
  assert.throws(() => f.service.guest({ clientId: 'g' }, { name: 'Visitante' }), {
    code: 'COMMUNITY_UNAVAILABLE',
  });
});

test('presence chooses the active voice room independently from text while guest views expose only game participants', async () => {
  const rooms = new Map(),
    f = fixture(async () => Response.json([]), rooms);
  try {
    await f.service.refreshDirectory();
    const guest = {
      clientId: 'guest-socket',
      readyState: 1,
      guest: { id: 'guest-a', nickname: 'Visita', guest: true, expiresAt: Date.now() + 100000 },
      roomId: 'game',
    };
    rooms.set('voice', {
      id: 'voice',
      kind: 'chat',
      name: 'Voz',
      players: new Map([[f.account.clientId, { voiceJoined: true }]]),
    });
    rooms.set('text', { id: 'text', kind: 'chat', name: 'Texto', players: new Map() });
    rooms.set('game', {
      id: 'game',
      kind: 'game',
      name: 'Mesa',
      players: new Map([[guest.clientId, { voiceJoined: false }]]),
    });
    f.account.roomId = 'voice';
    f.account.textRoomId = 'text';
    f.clients.add(guest);
    f.service.updateActivity(f.account, { name: 'Jogo', pid: 42, path: 'private' });
    const member = f.service
      .snapshot(f.account)
      .members.find((person) => person.id === f.account.account.id);
    assert.equal(member.roomId, 'voice');
    assert.equal(member.inVoice, true);
    const view = f.service.snapshot(guest);
    assert.equal(view.scope, 'game');
    assert.deepEqual(
      view.members.map((person) => person.id),
      ['guest-a'],
    );
    assert.equal(view.members[0].activity, null);
    assert.equal(JSON.stringify(member).includes('private'), false);
  } finally {
    f.service.stop();
  }
});

test('clearing guest tickets discards prior credentials and shared nickname validation retains the existing contract', () => {
  const sessions = createGuestSessions({ validNickname, nameReserved: () => false });
  const guest = sessions.authenticate({}, { name: 'Visitante' });
  sessions.clear();
  assert.notEqual(
    sessions.authenticate({}, { name: 'Visitante', ticket: guest.ticket }).id,
    guest.id,
  );
  for (const name of ['Felipe', 'José 2', '名人', 'A.B-C_2'])
    assert.equal(validNickname(name), true);
  for (const name of [null, 1, {}, 'x', ' a', 'a ', 'nome\n', '<script>', 'x'.repeat(21)])
    assert.equal(validNickname(name), false);
});
