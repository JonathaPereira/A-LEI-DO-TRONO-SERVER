'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express');
const { createSocialService } = require('../server/social-service.ts');
const {
  readSocial,
  readConversation,
  readCommittedMessage,
} = require('../server/social-protocol.ts');
const actor = '10000000-0000-4000-8000-000000000001',
  peer = '10000000-0000-4000-8000-000000000002',
  other = '10000000-0000-4000-8000-000000000003';
const messageId = (n) => '30000000-0000-4000-8000-' + String(n).padStart(12, '0');
const message = (n = 1, owner = actor) => ({
  id: messageId(n),
  senderId: owner,
  text: 'Mensagem',
  ts: '2026-10-21T10:00:00Z',
  roomId: null,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
function fixture(ports = {}) {
  let stamp = 1000000,
    identities = 0;
  const account = (id) => ({
    id,
    nickname: id === actor ? 'Alice' : 'Bob',
    role: 'member',
    expiresAt: stamp + 100000,
  });
  const owner = account(actor),
    friend = account(peer),
    expired = { ...friend, expiresAt: stamp - 1 },
    outsider = account(other);
  const clients = new Set([owner, friend, expired, outsider].map((account) => ({ account }))),
    events = [],
    calls = [],
    attachments = [];
  const auth = {
    configured: true,
    allowedOrigins: new Set(['https://app.example.test']),
    tokenFrom(req) {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token)
        throw Object.assign(Error('Entre na conta.'), { code: 'AUTH_REQUIRED', status: 401 });
      return token;
    },
    async identity(token) {
      identities++;
      return account(token);
    },
    async request(...args) {
      calls.push(args);
      if (ports.request) return ports.request(...args);
      const [token, path, , body] = args;
      if (path.endsWith('social_snapshot'))
        return { friends: [], threads: [], secret: 'not public' };
      if (path.endsWith('social_read')) return [];
      if (path.endsWith('social_send'))
        return {
          ...message(),
          id: body.p_id,
          senderId: token,
          text: body.p_text,
          roomId: body.p_room,
        };
      return null;
    },
  };
  const service = createSocialService({
    auth,
    wss: { clients },
    send: (connection, event) => events.push({ connection, event }),
    rooms: new Map([
      ['chat-livre', { id: 'chat-livre', kind: 'chat' }],
      ['game', { id: 'game', kind: 'game' }],
    ]),
    files: {
      directAttachment: async (...args) => {
        attachments.push(args);
        return ports.attachment?.(...args);
      },
    },
    now: () => stamp,
  });
  return {
    service,
    owner,
    friend,
    events,
    calls,
    attachments,
    advance(ms) {
      stamp += ms;
    },
    run(action, body, account = owner, signal) {
      return service.operation(account.id, account, action, body, signal);
    },
    get identities() {
      return identities;
    },
    async listen() {
      const app = express();
      service.install(app, express);
      service.install(app, express);
      const server = await new Promise((resolve) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      });
      return {
        base: 'http://127.0.0.1:' + server.address().port,
        async close() {
          service.stop();
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        },
      };
    },
  };
}

test('social protocol validates every history row, participant and commit identity before trimming or publishing', () => {
  const rows = Array.from({ length: 51 }, (_, n) => message(n + 1));
  const page = readConversation(rows, actor, peer);
  assert.equal(page.messages.length, 50);
  assert.equal(page.hasMore, true);
  assert.equal(page.messages[0].id, messageId(2));
  for (const input of [
    null,
    {},
    [...rows, message(52)],
    [message(), message()],
    [{ ...message(), senderId: other }],
    [{ ...message(), ts: 'invalid' }],
  ])
    assert.throws(() => readConversation(input, actor, peer), { code: 'SOCIAL_UNAVAILABLE' });
  assert.throws(
    () => readConversation([{ ...rows[0], senderId: other }, ...rows.slice(1)], actor, peer),
    { code: 'SOCIAL_UNAVAILABLE' },
  );
  assert.deepEqual(readSocial({ friends: [], threads: [], email: 'private' }, actor), {
    friends: [],
    threads: [],
  });
  assert.throws(
    () =>
      readSocial(
        { friends: [{ id: actor, name: 'Self', state: 'accepted', incoming: false }], threads: [] },
        actor,
      ),
    { code: 'SOCIAL_UNAVAILABLE' },
  );
  const expected = { id: messageId(1), roomId: null, attachmentId: null };
  for (const invalid of [
    { ...message(), id: messageId(2) },
    { ...message(), senderId: peer },
    { ...message(), roomId: 'chat-livre' },
  ])
    assert.throws(() => readCommittedMessage(invalid, actor, peer, expected), {
      code: 'SOCIAL_UNAVAILABLE',
    });
  assert.deepEqual(
    readCommittedMessage({ ...message(), providerToken: 'private' }, actor, peer, expected),
    message(),
  );
  assert.throws(
    () =>
      readConversation(
        [
          {
            ...message(),
            attachment: {
              id: messageId(9),
              name: 'Arquivo.pdf',
              mime: 'application/pdf',
              bytes: 10,
              kind: 'direct',
              ownerId: actor,
              peerId: other,
            },
          },
        ],
        actor,
        peer,
      ),
    { code: 'SOCIAL_UNAVAILABLE' },
  );
});

test('a confirmed send publishes only to its two active accounts and carries server identity rather than supplied claims', async () => {
  const gate = deferred(),
    f = fixture({ request: () => gate.promise });
  try {
    const pending = f.run('send', {
      id: messageId(1),
      peerId: peer,
      text: 'Mensagem',
      accountId: other,
      senderName: 'Forged',
    });
    assert.equal(f.events.length, 0);
    assert.equal(f.service.health().ready, false);
    gate.resolve(message());
    const result = await pending;
    assert.equal(result.id, messageId(1));
    assert.deepEqual(
      f.events.map((row) => row.connection.account.id),
      [actor, peer],
    );
    assert(f.events.every((row) => row.event.senderName === 'Alice'));
    assert.equal(f.service.health().ready, true);
  } finally {
    gate.resolve(message());
    f.service.stop();
  }
});

test('malformed provider confirmation cannot acknowledge a different message or publish a partial payload', async () => {
  const f = fixture({ request: async () => message(2) });
  try {
    await assert.rejects(f.run('send', { id: messageId(1), peerId: peer, text: 'Mensagem' }), {
      code: 'SOCIAL_UNAVAILABLE',
    });
    assert.equal(f.events.length, 0);
    assert.equal(f.service.health().ready, false);
  } finally {
    f.service.stop();
  }
});

test('send rates remain per account/action with the same minute boundary and expire independently', async () => {
  const f = fixture();
  try {
    for (let n = 1; n <= 60; n++)
      await f.run('send', { id: messageId(n), peerId: peer, text: 'Mensagem' });
    await assert.rejects(f.run('send', { id: messageId(61), peerId: peer, text: 'Mensagem' }), {
      code: 'SOCIAL_RATE_LIMIT',
      status: 429,
    });
    await f.run('snapshot', {});
    await f.run('send', { id: messageId(62), peerId: actor, text: 'Outro remetente' }, f.friend);
    f.advance(60000);
    await assert.rejects(f.run('send', { id: messageId(63), peerId: peer, text: 'Mensagem' }), {
      code: 'SOCIAL_RATE_LIMIT',
    });
    f.advance(1);
    await f.run('send', { id: messageId(64), peerId: peer, text: 'Mensagem' });
  } finally {
    f.service.stop();
  }
});

test('cancelling a read preserves service health while stop suppresses late writes and broadcasts', async () => {
  const gate = deferred(),
    controller = new AbortController();
  let holding = false,
    signal;
  const f = fixture({
    request: (_token, _path, _method, _body, current) => {
      if (!holding) return Promise.resolve({ friends: [], threads: [] });
      signal = current;
      return gate.promise;
    },
  });
  try {
    await f.run('snapshot', {});
    holding = true;
    const read = f.run('read', { peerId: peer }, f.owner, controller.signal),
      rejected = assert.rejects(read, { name: 'AbortError' });
    controller.abort();
    assert.equal(signal.aborted, true);
    gate.resolve([]);
    await rejected;
    assert.equal(f.service.health().ready, true);
  } finally {
    f.service.stop();
  }
  const pending = deferred(),
    write = fixture({ request: () => pending.promise });
  const work = write.run('send', { id: messageId(1), peerId: peer, text: 'Mensagem' }),
    failure = assert.rejects(work, { code: 'SOCIAL_UNAVAILABLE' });
  write.service.stop();
  pending.resolve(message());
  await failure;
  assert.equal(write.events.length, 0);
  assert.equal(write.service.health().ready, false);
  await assert.rejects(write.run('snapshot', {}), { code: 'SOCIAL_UNAVAILABLE' });
});

test('client cancellation before attachment validation completes prevents starting a send', async () => {
  const gate = deferred(),
    controller = new AbortController(),
    f = fixture({ attachment: () => gate.promise });
  try {
    const pending = f.run(
        'send',
        { id: messageId(1), peerId: peer, text: '', attachmentId: messageId(9) },
        f.owner,
        controller.signal,
      ),
      rejected = assert.rejects(pending, { name: 'AbortError' });
    controller.abort();
    assert.equal(f.attachments[0][3].aborted, true);
    gate.resolve();
    await rejected;
    assert.equal(f.calls.length, 0);
    assert.equal(f.events.length, 0);
  } finally {
    gate.resolve();
    f.service.stop();
  }
});

test('an accepted write completes for the participants after its HTTP caller cancels', async () => {
  const gate = deferred(),
    controller = new AbortController();
  let signal;
  const f = fixture({
    request: (_token, _path, _method, _body, current) => {
      signal = current;
      return gate.promise;
    },
  });
  try {
    const work = f.run('friend', { peerId: peer, action: 'accept' }, f.owner, controller.signal);
    controller.abort();
    assert.equal(signal.aborted, false);
    gate.resolve(null);
    assert.deepEqual(await work, { ok: true });
    assert.deepEqual(
      f.events.map((row) => row.connection.account.id),
      [actor, peer],
    );
  } finally {
    gate.resolve(null);
    f.service.stop();
  }
});

test('social HTTP preserves preflight and 12 KB parsing before authentication while malformed bodies return JSON', async () => {
  const f = fixture(),
    server = await f.listen();
  const headers = {
    Origin: 'https://app.example.test',
    Authorization: 'Bearer ' + actor,
    'Content-Type': 'application/json',
  };
  try {
    const preflight = await fetch(server.base + '/social/snapshot', {
      method: 'OPTIONS',
      headers: { Origin: headers.Origin },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    assert.equal(f.identities, 0);
    const invalid = await fetch(server.base + '/social/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_REQUEST');
    assert.equal(f.identities, 0);
    const response = await fetch(server.base + '/social/snapshot', {
      method: 'POST',
      headers,
      body: JSON.stringify({ padding: 'x'.repeat(9000) }),
    });
    assert.equal(response.status, 200);
    assert.equal(f.identities, 1);
    assert.deepEqual(await response.json(), { friends: [], threads: [] });
    const oversized = await fetch(server.base + '/social/snapshot', {
      method: 'POST',
      headers,
      body: JSON.stringify({ padding: 'x'.repeat(13000) }),
    });
    assert.equal(oversized.status, 400);
    assert.equal(
      (
        await fetch(server.base + '/social/snapshot', {
          method: 'POST',
          headers: { ...headers, Origin: 'https://foreign.test' },
          body: '{}',
        })
      ).status,
      403,
    );
  } finally {
    await server.close();
  }
});
