'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const transportModule = import('../src/lib/socket/transport.ts');

class TestSocket {
  readyState = 0;
  sent = [];
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  message(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

async function setup(t, options = {}) {
  const { createSocketTransport } = await transportModule;
  const sockets = [];
  const warnings = [];
  const transport = createSocketTransport({
    url: 'wss://fixture.example/ws',
    createSocket(url) {
      assert.equal(url, 'wss://fixture.example/ws');
      const socket = new TestSocket();
      sockets.push(socket);
      return socket;
    },
    warn: (...message) => warnings.push(message),
    ...options,
  });
  t.after(() => transport.disconnect());
  return {
    transport,
    sockets,
    warnings,
    async open() {
      const opening = transport.connect();
      sockets.at(-1).open();
      assert.equal(await opening, true);
      return sockets.at(-1);
    },
  };
}

const sfu = {
  responseType: 'sfu-response',
  timeoutMs: 18000,
  timeoutMessage: 'SFU timeout',
  timeoutCode: 'SFU_TIMEOUT',
};

test('concurrent callers share one socket; connecting and connected calls share the result', async (t) => {
  const { transport, sockets } = await setup(t);
  const first = transport.connect();
  assert.equal(transport.connect(), first);
  assert.equal(transport.send('ping'), false);
  assert.equal(sockets.length, 1);
  sockets[0].open();
  assert.equal(await first, true);
  assert.equal(await transport.connect(), true);
  assert.equal(sockets.length, 1);
  assert.equal(transport.send('ping', { type: 'spoofed' }), true);
  assert.deepEqual(sockets[0].sent, [{ type: 'ping' }]);
});

test('correlation requires both response type and ID; out-of-order replies resolve the right request', async (t) => {
  const { transport, open } = await setup(t);
  const socket = await open();
  let firstSettled = false;
  const first = transport.request('sfu-request', { action: 'status' }, sfu);
  void first.then(() => {
    firstSettled = true;
  });
  const second = transport.request('sfu-request', { action: 'prepare' }, sfu);
  const [a, b] = socket.sent;
  assert.notEqual(a.requestId, b.requestId);
  socket.message({ type: 'auth-result', requestId: a.requestId, ok: true });
  socket.message({ type: 'sfu-response', requestId: b.requestId, data: 'second' });
  assert.equal((await second).data, 'second');
  assert.equal(firstSettled, false);
  socket.message({ type: 'sfu-response', requestId: a.requestId, data: 'first' });
  assert.equal((await first).data, 'first');
});

test('invalid envelopes and throwing listeners cannot interrupt later messages', async (t) => {
  const { transport, open, warnings } = await setup(t);
  const socket = await open();
  const seen = [];
  const unsubscribe = transport.onMessage(() => {
    throw Error('consumer failure');
  });
  transport.onMessage((message) => seen.push(message));
  for (const data of ['not json', 'null', '[]', '{"type":2}', '{"type":"ping","requestId":7}'])
    socket.onmessage({ data });
  socket.message({ type: 'pong' });
  unsubscribe();
  socket.message({ type: 'pong' });
  assert.deepEqual(seen, [{ type: 'pong' }, { type: 'pong' }]);
  assert.equal(warnings.length, 6);
});

test('a connection deadline closes the socket, and late callbacks cannot affect the replacement', async (t) => {
  const { transport, sockets } = await setup(t, { connectTimeoutMs: 100 });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const opening = transport.connect();
  const stale = {
    open: sockets[0].onopen,
    message: sockets[0].onmessage,
    close: sockets[0].onclose,
  };
  t.mock.timers.tick(100);
  assert.equal(await opening, false);
  assert.equal(sockets[0].readyState, 3);
  const replacement = transport.connect();
  stale.open({});
  stale.message({ data: '{"type":"welcome","clientId":"stale"}' });
  stale.close({ code: 1006 });
  assert.equal(transport.connected, false);
  sockets[1].open();
  assert.equal(await replacement, true);
  assert.equal(transport.connected, true);
});

test('disconnect during connection settles all callers immediately, without waiting for close', async (t) => {
  const { transport, sockets } = await setup(t);
  const opening = transport.connect();
  sockets[0].close = () => {};
  transport.disconnect();
  assert.equal(await opening, false);
  assert.equal(transport.connected, false);
  assert.equal(sockets[0].onopen, null);
});

test('request deadlines clean up the request and late replies do not settle a later request', async (t) => {
  const { transport, open } = await setup(t);
  const socket = await open();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired = transport.request('sfu-request', {}, { ...sfu, timeoutMs: 50 });
  const rejected = assert.rejects(expired, { code: 'SFU_TIMEOUT' });
  const oldId = socket.sent.at(-1).requestId;
  t.mock.timers.tick(50);
  await rejected;
  const next = transport.request('sfu-request', {}, sfu);
  const nextId = socket.sent.at(-1).requestId;
  assert.notEqual(oldId, nextId);
  socket.message({ type: 'sfu-response', requestId: oldId, data: 'stale' });
  socket.message({ type: 'sfu-response', requestId: nextId, data: 'current' });
  assert.equal((await next).data, 'current');
});

for (const closure of ['explicit', 'remote']) {
  test(`${closure} disconnect rejects every pending request and clears its deadline`, async (t) => {
    const { transport, open } = await setup(t);
    const socket = await open();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const results = Promise.allSettled([
      transport.request('sfu-request', {}, sfu),
      transport.request('check-name', {}, { ...sfu, responseType: 'name-check-result' }),
      transport.request('authenticate', {}, { ...sfu, responseType: 'auth-result' }),
      transport.request('guest-authenticate', {}, { ...sfu, responseType: 'guest-result' }),
    ]);
    if (closure === 'explicit') transport.disconnect();
    else socket.close(1006);
    for (const result of await results) {
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason.code, 'NETWORK_CLOSED');
    }
    t.mock.timers.tick(18000);
    assert.equal(transport.connected, false);
    await assert.rejects(transport.request('sfu-request', {}, sfu), { code: 'NETWORK_OFFLINE' });
  });
}

test('account and guest identity operations run serially, including after a failed operation', async (t) => {
  const { transport, open } = await setup(t);
  const socket = await open();
  const account = transport.serializeIdentity(() =>
    transport.request('authenticate', {}, { ...sfu, responseType: 'auth-result' }),
  );
  const guest = transport.serializeIdentity(() =>
    transport.request('guest-authenticate', {}, { ...sfu, responseType: 'guest-result' }),
  );
  await new Promise(setImmediate);
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].type, 'authenticate');
  socket.message({ type: 'auth-result', requestId: socket.sent[0].requestId, ok: true });
  await account;
  await new Promise(setImmediate);
  assert.equal(socket.sent.length, 2);
  assert.equal(socket.sent[1].type, 'guest-authenticate');
  socket.message({ type: 'guest-result', requestId: socket.sent[1].requestId, ok: true });
  await guest;
  await assert.rejects(
    transport.serializeIdentity(async () => {
      throw Error('identity failed');
    }),
    /identity failed/,
  );
  assert.equal(await transport.serializeIdentity(async () => 'recovered'), 'recovered');
});

test('logout cancels queued identity changes so they cannot reconnect the previous session', async (t) => {
  const { transport, open, sockets } = await setup(t);
  await open();
  let guestRan = false;
  const results = Promise.allSettled([
    transport.serializeIdentity(() =>
      transport.request('authenticate', {}, { ...sfu, responseType: 'auth-result' }),
    ),
    transport.serializeIdentity(async () => {
      guestRan = true;
      await transport.connect();
    }),
  ]);
  await new Promise(setImmediate);
  transport.disconnect();
  for (const result of await results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.code, 'NETWORK_CLOSED');
  }
  assert.equal(guestRan, false);
  assert.equal(sockets.length, 1);
  await open();
  assert.equal(await transport.serializeIdentity(async () => 'new session'), 'new session');
});

test('a socket send failure rejects requests immediately and releases the broken connection', async (t) => {
  const { transport, open } = await setup(t);
  const socket = await open();
  socket.send = () => {
    throw Error('send failed');
  };
  await assert.rejects(transport.request('sfu-request', {}, sfu), { code: 'NETWORK_CLOSED' });
  assert.equal(transport.connected, false);
  assert.equal(socket.readyState, 3);
});

test('an identity waiting for open cannot authenticate a replacement connection after logout', async (t) => {
  const { transport, sockets } = await setup(t);
  const login = transport.serializeIdentity(async (connection) => {
    await connection.connect();
    return connection.request(
      'authenticate',
      { access_token: 'old-session' },
      {
        ...sfu,
        responseType: 'auth-result',
      },
    );
  });
  const rejected = assert.rejects(login, { code: 'NETWORK_CLOSED' });
  await new Promise(setImmediate);
  // Resolve open, but log out and open another socket before the login can resume.
  sockets[0].open();
  transport.disconnect();
  const replacement = transport.connect();
  sockets[1].open();
  assert.equal(await replacement, true);
  await rejected;
  assert.deepEqual(sockets[1].sent, []);
  assert.equal(transport.connected, true);
});

test('logout between an identity reply and its continuation cannot expose a stale result', async (t) => {
  const { transport, open } = await setup(t);
  const socket = await open();
  let cachedIdentity = null;
  const login = transport.serializeIdentity(async (connection) => {
    const response = await connection.request(
      'authenticate',
      {},
      { ...sfu, responseType: 'auth-result' },
    );
    cachedIdentity = response.user;
  });
  const rejected = assert.rejects(login, { code: 'NETWORK_CLOSED' });
  await new Promise(setImmediate);
  transport.onMessage((message) => {
    if (message.type === 'auth-result') transport.disconnect();
  });
  socket.message({
    type: 'auth-result',
    requestId: socket.sent[0].requestId,
    ok: true,
    user: { id: 'stale' },
  });
  await rejected;
  assert.equal(cachedIdentity, null);
});
