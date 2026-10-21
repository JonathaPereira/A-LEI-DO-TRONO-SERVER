'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express');
const { createCommunityManagement } = require('../server/community-management.ts');
const {
  readManagedChannels,
  readCreatedChannel,
  readPublicProfile,
  readRegisteredAccounts,
} = require('../server/management-protocol.ts');
const id = '10000000-0000-4000-8000-000000000001';
const row = (channel = 'chat-livre', name = 'Geral') => ({
  id: channel,
  name,
  channel_type: 'mixed',
  description: 'Canal',
});
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(ports = {}) {
  const rooms = ports.rooms ?? new Map(),
    deleted = [],
    created = [],
    roles = [],
    calls = [];
  let changes = 0;
  const auth = {
    configured: false,
    allowedOrigins: new Set(['https://app.example.test']),
    tokenFrom(req) {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token)
        throw Object.assign(Error('Entre na conta.'), { code: 'AUTH_REQUIRED', status: 401 });
      return token;
    },
    async identity(token, signal) {
      if (ports.identity) return ports.identity(token, signal);
      return {
        id,
        nickname: 'Conta',
        role: token === 'creator' ? 'creator' : 'member',
        expiresAt: Date.now() + 60000,
      };
    },
    async request(...args) {
      calls.push(args);
      return ports.request ? ports.request(...args) : [row()];
    },
  };
  const service = createCommunityManagement({
    auth,
    rooms,
    createRoom(channel) {
      const room = { id: channel.id, kind: 'chat', players: new Map(), marker: {} };
      created.push(room);
      return room;
    },
    onDeleted: (room) => deleted.push(room),
    onChanged: () => changes++,
    onRoleChanged: (...args) => roles.push(args),
    env: {},
  });
  return {
    auth,
    service,
    rooms,
    created,
    deleted,
    roles,
    calls,
    get changes() {
      return changes;
    },
    async listen() {
      const app = express();
      service.install(app, express);
      service.install(app, express);
      const server = await new Promise((resolve) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      });
      const base = 'http://127.0.0.1:' + server.address().port;
      return {
        base,
        call: async (
          path,
          {
            token = 'creator',
            method = 'GET',
            body,
            origin = 'https://app.example.test',
            signal,
          } = {},
        ) =>
          fetch(base + '/community' + path, {
            method,
            headers: {
              ...(token ? { Authorization: 'Bearer ' + token } : {}),
              ...(origin ? { Origin: origin } : {}),
              'Content-Type': 'application/json',
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
          }),
        async close() {
          service.stop();
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        },
      };
    },
  };
}

test('management protocol validates whole pages and projects only known public/private fields', () => {
  for (const input of [
    null,
    {},
    [null],
    [[row()]],
    [{ ...row(), id: 5 }],
    [{ ...row(), description: [] }],
    [row(), row()],
  ])
    assert.throws(() => readManagedChannels(input), { code: 'COMMUNITY_UNAVAILABLE' });
  assert.deepEqual(readManagedChannels([{ ...row(), secret: 'not public' }]), [row()]);
  for (const input of [[], [row(), row()], null])
    assert.throws(() => readCreatedChannel(input), { code: 'COMMUNITY_UNAVAILABLE' });
  assert.deepEqual(readCreatedChannel([row()]), row());
  assert.deepEqual(
    readPublicProfile({ id, nickname: 'Conta', email: 'private', extra: 'private' }, id),
    { id, nickname: 'Conta' },
  );
  assert.throws(() => readPublicProfile({ id: 'wrong', nickname: 'Conta' }, id), {
    code: 'COMMUNITY_UNAVAILABLE',
  });
  const account = { id, nickname: 'Conta', email: 'owner@example.test', confirmed: true };
  assert.deepEqual(readRegisteredAccounts([{ ...account, providerToken: 'private' }]), [account]);
  for (const input of [
    null,
    [account, account],
    [{ ...account, confirmed: 'yes' }],
    Array.from({ length: 51 }, () => account),
  ])
    assert.throws(() => readRegisteredAccounts(input), { code: 'COMMUNITY_UNAVAILABLE' });
});

test('refresh preserves room/player ownership and malformed metadata changes no rooms', async () => {
  let rows = [row()];
  const game = { id: 'sala-cetro', kind: 'game', name: 'Jogo' };
  const f = fixture({ rooms: new Map([[game.id, game]]), request: async () => rows });
  try {
    await f.service.refreshFor('creator');
    const room = f.rooms.get('chat-livre'),
      players = room.players;
    rows = [row('chat-livre', 'Novo nome')];
    await f.service.refreshFor('creator');
    assert.equal(f.rooms.get('chat-livre'), room);
    assert.equal(room.players, players);
    assert.equal(room.name, 'Novo nome');
    assert.equal(f.created.length, 1);
    rows = [row('chat-jogos'), { ...row(), name: null }];
    await assert.rejects(f.service.refreshFor('creator'), { code: 'COMMUNITY_UNAVAILABLE' });
    assert.equal(f.rooms.get('chat-livre'), room);
    assert.equal(f.rooms.has('chat-jogos'), false);
    assert.equal(f.deleted.length, 0);
    assert.equal(f.rooms.get(game.id), game);
    assert.equal(f.service.health().channelsReady, false);
    rows = [];
    await f.service.refreshFor('creator');
    assert.deepEqual(f.deleted, [room]);
    assert.equal(f.rooms.get(game.id), game);
  } finally {
    f.service.stop();
  }
});

test('an older channel refresh finishes before queued deletion and cannot resurrect that room', async () => {
  const gate = deferred(),
    authenticated = deferred();
  let held = false,
    rows = [row()];
  const f = fixture({
    identity: async () => {
      authenticated.resolve();
      return { id, role: 'creator' };
    },
    request: async (_token, path) => {
      if (path.endsWith('community_delete_channel')) {
        rows = [];
        return null;
      }
      if (held) {
        held = false;
        return gate.promise;
      }
      return rows;
    },
  });
  const server = await f.listen();
  try {
    await f.service.refreshFor('creator');
    held = true;
    const refresh = f.service.refreshFor('creator');
    await tick();
    const deletion = server.call('/channels/chat-livre', { method: 'DELETE' });
    await authenticated.promise;
    await tick();
    assert.equal(f.calls.filter((call) => call[1].endsWith('community_delete_channel')).length, 0);
    gate.resolve([row()]);
    await refresh;
    assert.equal((await deletion).status, 200);
    assert.equal(f.rooms.has('chat-livre'), false);
    assert.equal(f.deleted.length, 1);
    await f.service.refreshFor('creator');
    assert.equal(f.rooms.has('chat-livre'), false);
  } finally {
    gate.resolve([]);
    await server.close();
  }
});

test('stop aborts a pending refresh and refuses queued work and late map updates', async () => {
  const gate = deferred();
  let signal;
  const f = fixture({
    request: (_token, _path, _method, _body, current) => {
      signal = current;
      return gate.promise;
    },
  });
  const first = f.service.refreshFor('creator'),
    failure = assert.rejects(first, { code: 'COMMUNITY_UNAVAILABLE' });
  const second = f.service.refreshFor('creator'),
    queued = assert.rejects(second, { code: 'COMMUNITY_UNAVAILABLE' });
  await tick();
  f.service.stop();
  f.service.stop();
  assert.equal(signal.aborted, true);
  gate.resolve([row()]);
  await Promise.all([failure, queued]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.rooms.size, 0);
  assert.equal(f.changes, 0);
});

test('HTTP boundary retains CORS, status codes and role checks and hides unexpected provider details', async () => {
  let response = [row()];
  const f = fixture({
      request: async () => {
        if (response instanceof Error) throw response;
        return response;
      },
    }),
    server = await f.listen();
  try {
    const preflight = await server.call('/channels', { token: '', method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('cache-control'), 'no-store');
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.example.test');
    assert.equal((await server.call('/channels', { origin: 'https://foreign.test' })).status, 403);
    assert.equal((await server.call('/channels', { token: '' })).status, 401);
    assert.equal((await server.call('/registered-accounts', { token: 'member' })).status, 403);
    assert.equal(f.calls.length, 0);
    const bad = await fetch(server.base + '/community/channels', {
      method: 'POST',
      headers: { Authorization: 'Bearer creator', 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, 'INVALID_REQUEST');
    response = Error('private upstream credential');
    const failed = await server.call('/channels');
    assert.equal(failed.status, 503);
    assert(!(await failed.text()).includes('credential'));
    response = [
      {
        id,
        nickname: 'Conta',
        email: 'private@example.test',
        confirmed: true,
        secret: 'do not send',
      },
    ];
    const accounts = await (await server.call('/registered-accounts?offset=50')).json();
    assert.equal(accounts.nextOffset, 51);
    assert.equal(accounts.accounts[0].secret, undefined);
    response = { id: 'wrong', nickname: 'Conta' };
    assert.equal((await server.call('/profiles/' + id)).status, 503);
  } finally {
    await server.close();
  }
});

test('closing one HTTP client cancels only its read request and leaves the service available', async () => {
  const entered = deferred(),
    aborted = deferred();
  let signal,
    primed = false;
  const f = fixture({
    request: (_token, _path, _method, _body, current) => {
      if (!primed) {
        primed = true;
        return Promise.resolve([row()]);
      }
      signal = current;
      entered.resolve();
      return new Promise((_resolve, reject) =>
        current.addEventListener(
          'abort',
          () => {
            aborted.resolve();
            reject(current.reason);
          },
          { once: true },
        ),
      );
    },
  });
  const server = await f.listen(),
    controller = new AbortController();
  try {
    await f.service.refreshFor('creator');
    const request = server.call('/channels', {
        signal: controller.signal,
      }),
      rejected = assert.rejects(request);
    await entered.promise;
    controller.abort();
    await Promise.all([rejected, aborted.promise]);
    await tick();
    assert.equal(signal.aborted, true);
    assert.equal(f.service.health().channelsReady, true);
    assert.equal(f.rooms.has('chat-livre'), true);
    assert.equal(f.roles.length, 0);
    assert.equal((await server.call('/permissions')).status, 200);
    f.service.stop();
    assert.equal((await server.call('/permissions')).status, 503);
  } finally {
    controller.abort();
    await server.close();
  }
});

test('an accepted role mutation completes its notification after the HTTP client closes', async () => {
  const entered = deferred(),
    gate = deferred();
  let signal;
  const f = fixture({
    request: (_token, path, _method, _body, current) => {
      if (path.endsWith('community_channels')) return Promise.resolve([]);
      signal = current;
      entered.resolve();
      return gate.promise;
    },
  });
  const server = await f.listen(),
    controller = new AbortController();
  try {
    const work = server.call('/roles', {
        method: 'POST',
        body: { userId: id, role: 'admin' },
        signal: controller.signal,
      }),
      rejected = assert.rejects(work);
    await entered.promise;
    controller.abort();
    await rejected;
    assert.equal(signal.aborted, false);
    gate.resolve(null);
    // A second queued refresh observes the completion fence of the mutation.
    await f.service.refreshFor('creator');
    assert.deepEqual(f.roles, [[id, 'admin']]);
    assert.equal((await server.call('/permissions')).status, 200);
  } finally {
    gate.resolve(null);
    controller.abort();
    await server.close();
  }
});

test('an accepted channel deletion still synchronizes borrowed rooms after its HTTP client closes', async () => {
  const entered = deferred(),
    gate = deferred();
  let rows = [row()],
    signal;
  const f = fixture({
    request: async (_token, path, _method, _body, current) => {
      if (path.endsWith('community_delete_channel')) {
        signal = current;
        entered.resolve();
        await gate.promise;
        rows = [];
        return null;
      }
      return rows;
    },
  });
  const server = await f.listen(),
    controller = new AbortController();
  try {
    await f.service.refreshFor('creator');
    const room = f.rooms.get('chat-livre');
    const request = server.call('/channels/chat-livre', {
        method: 'DELETE',
        signal: controller.signal,
      }),
      rejected = assert.rejects(request);
    await entered.promise;
    controller.abort();
    await rejected;
    assert.equal(signal.aborted, false);
    gate.resolve();
    await f.service.refreshFor('creator');
    assert.equal(f.rooms.has('chat-livre'), false);
    assert.deepEqual(f.deleted, [room]);
  } finally {
    gate.resolve();
    controller.abort();
    await server.close();
  }
});
