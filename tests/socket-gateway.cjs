'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http');
const WebSocket = require('ws');
const { BackendSocket, createSocketGateway, sendSocket } = require('../server/socket-gateway.ts');
const { createChannelRooms, createChannelService } = require('../server/channel-service.ts');
const { createCommunity } = require('../server/community.ts');
const {
  readSocketEnvelope,
  readSocketGuest,
  socketFailure,
} = require('../server/socket-protocol.ts');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = () => new Promise((r) => setImmediate(r));
const account = (token) => ({
  id: token,
  nickname: token,
  role: 'member',
  expiresAt: Date.now() + 60000,
  sessionId: 'session-' + token,
});
async function fixture({ identity = async (token) => account(token), required = true } = {}) {
  const server = http.createServer(),
    wss = new WebSocket.WebSocketServer({ server, WebSocket: BackendSocket }),
    rooms = createChannelRooms(),
    calls = [],
    requests = [],
    clients = [],
    sfuCleanups = [];
  const games = Object.fromEntries(
    ['azul', 'splendor', 'loveLetter', 'ticketToRide', 'similo'].map((name) => [
      name,
      {
        handle: (ws, message) => calls.push([name, 'handle', ws.clientId, message]),
        disconnect: (ws) => calls.push([name, 'disconnect', ws.clientId]),
        updateAccount: (value) => calls.push([name, 'profile', value.id]),
      },
    ]),
  );
  const auth = {
    required,
    configured: false,
    health: () => ({ required }),
    identity: async (token, signal) => {
      requests.push({ token, signal });
      return identity(token, signal);
    },
  };
  const remotePc = {
    handle: async (ws, message) => calls.push(['remotePc', 'handle', ws.clientId, message]),
    disconnect: (ws) => calls.push(['remotePc', 'disconnect', ws.clientId]),
  };
  const community = createCommunity({ wss, rooms, send: sendSocket, auth, env: {} });
  const throne = {
    disconnect: () => {},
    privateState: () => null,
    rename: () => {},
    broadcastState: () => {},
    setReady: (ws) => calls.push(['throne', 'ready', ws.clientId]),
    start: () => {},
    handle: () => {},
  };
  const sfu = {
    cleanupClient: async (...args) => { sfuCleanups.push(args); },
    statusPayload: () => ({
      enabled: false,
      configured: false,
      hardBlocked: false,
      maxParticipants: 6,
    }),
    publicHealth: () => ({ enabled: false }),
    notePlayerQuality: (_r, _p, q) => q,
    broadcastStatus: () => {},
    broadcastPublications: () => {},
    handleRequest: (ws, msg) => {
      calls.push(['sfu', msg.action, ws.clientId]);
      sendSocket(ws, { type: 'sfu-response', requestId: msg.requestId, ok: true, data: {} });
    },
  };
  const channels = createChannelService({
    rooms,
    wss,
    send: sendSocket,
    auth,
    sfu,
    remotePc,
    throne,
    presenceChanged: () => community.broadcast(),
    nameReserved: (name) => community.nameReserved(name),
    sendHistory: async () => {},
  });
  const gateway = createSocketGateway({
    wss,
    auth,
    rooms,
    channels,
    throne,
    ...games,
    remotePc,
    community,
    communityManagement: { refreshFor: async () => {} },
    chat: {
      requestHistory: () => {},
      moderate: async () => {},
      message: async (ws) => calls.push(['chat', 'message', ws.clientId]),
    },
    soundboard: { play: async () => {} },
    sfu,
    version: 'fixture',
    gameRulesVersion: 'fixture',
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`),
      messages = [],
      waiters = [];
    ws.on('message', (data) => {
      const value = JSON.parse(data);
      messages.push(value);
      for (const waiter of [...waiters])
        if (waiter.p(value)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          clearTimeout(waiter.timer);
          waiter.resolve(value);
        }
    });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const c = {
      ws,
      messages,
      send: (value) => ws.send(JSON.stringify(value)),
      wait(p) {
        const old = messages.find(p);
        if (old) return Promise.resolve(old);
        return new Promise((resolve, reject) => {
          const waiter = {
            p,
            resolve,
            timer: setTimeout(() => reject(Error('Missing packet: ' + p)), 2000),
          };
          waiters.push(waiter);
        });
      },
    };
    clients.push(c);
    const welcome = await c.wait((m) => m.type === 'welcome');
    c.server = [...wss.clients].find((s) => s.clientId === welcome.clientId);
    return c;
  }
  return {
    server,
    wss,
    rooms,
    calls,
    requests,
    sfuCleanups,
    gateway,
    channels,
    client,
    async close() {
      gateway.stop();
      community.stop();
      channels.stop();
      for (const c of clients) c.ws.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
    },
  };
}

test('socket envelope and guest payload validate bounded scalar fields and never expose unclassified transport errors', () => {
  for (const input of [
    null,
    [],
    {},
    { type: 1 },
    { type: 'ping', requestId: {} },
    { type: 'x'.repeat(81) },
    { type: 'ping', requestId: 'x'.repeat(81) },
  ])
    assert.equal(readSocketEnvelope(input), null);
  for (const input of [
    { name: ['Casa'] },
    { ticket: {} },
    { name: 'x'.repeat(161) },
    { ticket: 'x'.repeat(257) },
  ])
    assert.equal(readSocketGuest(input), null);
  assert.deepEqual(readSocketGuest({ name: 'Casa', account: 'spoof' }), {
    name: 'Casa',
    ticket: undefined,
  });
  assert(!socketFailure(Error('private token')).message.includes('token'));
});

test('real socket rejects malformed envelopes and protects domain dispatch while public catalog/status remain available', async () => {
  const f = await fixture();
  try {
    const c = await f.client();
    c.ws.send('[');
    await c.wait((m) => m.code === 'BAD_JSON');
    c.send({ type: 'azul', action: 'rooms' });
    await c.wait((m) => m.code === 'AUTH_REQUIRED');
    assert.equal(f.calls.length, 0);
    c.send({ type: 'list-rooms' });
    await c.wait((m) => m.type === 'rooms');
    c.send({ type: 'sfu-request', action: 'status', requestId: 'status' });
    await c.wait((m) => m.requestId === 'status');
    assert.equal(f.calls.at(-1)[0], 'sfu');
    assert.equal(f.requests.length, 0);
  } finally {
    await f.close();
  }
});

test('account and guest identities share FIFO order even when account verification is delayed', async () => {
  const gate = deferred(),
    entered = deferred(),
    f = await fixture({
      identity: async (token) => {
        entered.resolve();
        await gate.promise;
        return account(token);
      },
    });
  try {
    const c = await f.client();
    c.send({ type: 'authenticate', access_token: 'Alice', requestId: 'account' });
    await entered.promise;
    c.send({ type: 'guest-authenticate', name: 'Visitante', requestId: 'guest' });
    c.send({ type: 'ping' });
    await c.wait((m) => m.type === 'pong');
    assert(!c.messages.some((m) => m.type === 'guest-result'));
    gate.resolve();
    await c.wait((m) => m.requestId === 'guest');
    assert.deepEqual(
      c.messages
        .filter((m) => m.type === 'auth-result' || m.type === 'guest-result')
        .map((m) => m.requestId),
      ['account', 'guest'],
    );
    assert.equal(c.server.account.id, 'Alice');
    assert.equal(c.server.guest, null);
    assert.equal(
      c.messages.find((m) => m.requestId === 'guest').error.code,
      'ALREADY_AUTHENTICATED',
    );
  } finally {
    gate.resolve();
    await f.close();
  }
});

test('two account verifications are serialized and the last confirmed identity becomes authoritative', async () => {
  const gate = deferred(),
    entered = deferred(),
    f = await fixture({
      identity: async (token) => {
        if (token === 'Alice') {
          entered.resolve();
          await gate.promise;
        }
        return account(token);
      },
    });
  try {
    const c = await f.client();
    c.send({ type: 'authenticate', access_token: 'Alice', requestId: 'first' });
    await entered.promise;
    c.send({ type: 'authenticate', access_token: 'Bob', requestId: 'second' });
    await flush();
    assert.equal(f.requests.length, 1);
    gate.resolve();
    await c.wait((m) => m.requestId === 'second');
    assert.deepEqual(
      f.requests.map((r) => r.token),
      ['Alice', 'Bob'],
    );
    assert.equal(c.server.account.id, 'Bob');
  } finally {
    gate.resolve();
    await f.close();
  }
});

test('invalid guest input does not disconnect games or replace an authenticated account', async () => {
  const f = await fixture();
  try {
    const c = await f.client();
    c.send({ type: 'authenticate', access_token: 'Alice', requestId: 'login' });
    await c.wait((m) => m.requestId === 'login');
    const before = f.calls.length;
    c.send({ type: 'guest-authenticate', name: ['Visitante'], requestId: 'bad-guest' });
    const reply = await c.wait((m) => m.requestId === 'bad-guest');
    assert.equal(reply.error.code, 'INVALID_NICKNAME');
    assert.equal(c.server.account.id, 'Alice');
    assert.equal(f.calls.length, before);
  } finally {
    await f.close();
  }
});

test('guest scope can join a game and ready there while community chat and other games remain protected', async () => {
  const f = await fixture();
  try {
    const c = await f.client();
    c.send({ type: 'guest-authenticate', name: 'Visitante', requestId: 'guest' });
    await c.wait((m) => m.requestId === 'guest');
    c.send({ type: 'join-room', roomId: 'chat-livre' });
    await c.wait((m) => m.code === 'LOGIN_REQUIRED_CHAT');
    assert.equal(c.server.roomId, null);
    c.send({ type: 'join-game-room', roomId: 'sala-cetro' });
    await c.wait((m) => m.type === 'joined-game-room');
    c.send({ type: 'ready', ready: true });
    c.send({ type: 'ping' });
    await c.wait((m) => m.type === 'pong');
    assert(f.calls.some((c) => c[0] === 'throne' && c[1] === 'ready'));
    c.send({ type: 'azul', action: 'rooms' });
    await flush();
    assert(!f.calls.some((c) => c[0] === 'azul' && c[1] === 'handle'));
  } finally {
    await f.close();
  }
});

test('failed verification permits retry, and profile changes update the current member without replacing the socket', async () => {
  const f = await fixture({
    identity: async (token) => {
      if (token === 'bad')
        throw Object.assign(Error('Entre novamente.'), { code: 'AUTH_REQUIRED', status: 401 });
      return account(token);
    },
  });
  try {
    const c = await f.client();
    c.send({ type: 'authenticate', access_token: 'bad', requestId: 'bad' });
    assert.equal((await c.wait((m) => m.requestId === 'bad')).ok, false);
    c.send({ type: 'authenticate', access_token: 'Alice', requestId: 'good' });
    assert.equal((await c.wait((m) => m.requestId === 'good')).ok, true);
    assert.equal(c.server.identityScope.signal.aborted, false);
    c.send({ type: 'join-room', roomId: 'chat-livre' });
    await c.wait((m) => m.type === 'joined-room');
    const member = f.rooms.get('chat-livre').players.get(c.server.clientId);
    f.gateway.profileChanged({ ...c.server.account, nickname: 'Nova Alice' });
    await c.wait((m) => m.type === 'member-profile-updated');
    assert.equal(member.ws, c.server);
    assert.equal(member.name, 'Nova Alice');
    assert.equal(c.server.authAttempts, 0);
  } finally {
    await f.close();
  }
});

test('session revocation closes only the matching session and aborts its remaining identity work', async () => {
  const f = await fixture({
    identity: async (token) => ({ ...account('same'), sessionId: token }),
  });
  try {
    const a = await f.client(),
      b = await f.client();
    for (const [c, token] of [
      [a, 'a'],
      [b, 'b'],
    ]) {
      c.send({ type: 'authenticate', access_token: token, requestId: token });
      await c.wait((m) => m.requestId === token);
    }
    const closed = new Promise((resolve) => a.ws.once('close', (code) => resolve(code)));
    f.gateway.revoke({ userId: 'same', sessionId: 'a', all: false });
    assert.equal(await closed, 4001);
    assert.equal(a.server.identityScope.signal.aborted, true);
    assert.equal(b.ws.readyState, WebSocket.OPEN);
    assert.equal(b.server.account.id, 'same');
  } finally {
    await f.close();
  }
});

test('reconnecting an account session closes its older socket and preserves the replacement identity', async () => {
  const f = await fixture({ identity: async () => account('same') });
  try {
    const a = await f.client();
    a.send({ type: 'authenticate', access_token: 'same', requestId: 'a' });
    await a.wait((m) => m.requestId === 'a');
    const closed = new Promise((resolve) => a.ws.once('close', (code) => resolve(code)));
    const b = await f.client();
    b.send({ type: 'authenticate', access_token: 'same', requestId: 'b' });
    await b.wait((m) => m.requestId === 'b');
    assert.equal(await closed, 4002);
    assert.equal(a.server.account, null);
    assert.equal(b.server.account.id, 'same');
    for (const game of ['azul', 'splendor', 'loveLetter', 'ticketToRide', 'similo'])
      assert(
        f.calls.some(
          ([name, action, id]) =>
            name === game && action === 'disconnect' && id === a.server.clientId,
        ),
      );
  } finally {
    await f.close();
  }
});

test('disconnect and stop cancel pending verification and queued guest work even if the provider ignores abort', async () => {
  for (const stop of [false, true]) {
    const gate = deferred(),
      entered = deferred(),
      f = await fixture({
        identity: async (token) => {
          entered.resolve();
          await gate.promise;
          return account(token);
        },
      });
    try {
      const c = await f.client();
      c.send({ type: 'authenticate', access_token: 'Alice', requestId: 'pending' });
      await entered.promise;
      c.send({ type: 'guest-authenticate', name: 'Visitante', requestId: 'queued' });
      await flush();
      const closed = new Promise((r) => c.ws.once('close', r));
      const serverClosed = new Promise((r) => c.server.once('close', r));
      if (stop) f.gateway.stop();
      else c.ws.close();
      await Promise.all([closed, serverClosed]);
      await flush();
      assert.equal(f.requests[0].signal.aborted, true);
      assert.equal(c.server.account, null);
      assert.equal(c.server.guest, null);
      assert.equal(c.server.authQueue, undefined);
      gate.resolve();
      await flush();
      assert(!c.messages.some((m) => m.type === 'auth-result' || m.type === 'guest-result'));
      if (stop) assert.equal(f.wss.listenerCount('connection'), 0);
    } finally {
      gate.resolve();
      await f.close();
    }
  }
});

test('heartbeat expires an account and terminates a dead peer without leaving its identity scope running', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = await fixture();
  try {
    const a = await f.client(),
      b = await f.client();
    a.send({ type: 'authenticate', access_token: 'Alice', requestId: 'login' });
    await a.wait((m) => m.requestId === 'login');
    a.server.account.expiresAt = 0;
    b.server.isAlive = false;
    const closedA = new Promise((r) => a.ws.once('close', (code) => r(code))),
      closedB = new Promise((r) => b.ws.once('close', r)),
      serverClosedA = new Promise((r) => a.server.once('close', r)),
      serverClosedB = new Promise((r) => b.server.once('close', r));
    t.mock.timers.tick(30000);
    assert.equal(await closedA, 4001);
    await Promise.all([closedB, serverClosedA, serverClosedB]);
    assert.equal(a.server.identityScope.signal.aborted, true);
    assert.equal(b.server.identityScope.signal.aborted, true);
  } finally {
    await f.close();
  }
});

async function voiceClient(f, token = 'recovery-user') {
  const c = await f.client();
  c.send({ type: 'authenticate', access_token: token, requestId: 'auth' });
  const auth = await c.wait(m => m.type === 'auth-result');
  c.send({ type: 'join-room', roomId: 'chat-livre' });
  await c.wait(m => m.type === 'joined-room');
  c.send({ type: 'voice-state', joined: true, muted: true, camera: false, screen: false });
  await c.wait(m => m.type === 'voice-roster' && m.players.some(p => p.id === c.server.clientId));
  return { c, auth };
}
test('a brief broken socket reserves voice and authenticated resume transfers the same seat without leave/join events', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const { c, auth } = await voiceClient(f);
  const observer = (await voiceClient(f, 'observer')).c;
  const id = c.server.clientId;
  const player = f.rooms.get('chat-livre').players.get(id);
  const before = observer.messages.length;
  const cleanups = f.sfuCleanups.length;
  player.mediaTransport = 'sfu'; f.rooms.get('chat-livre').voiceMode = 'sfu';
  const closed = new Promise(r => c.server.once('close', r));
  c.ws.terminate(); await closed;
  assert.equal(f.rooms.get('chat-livre').players.get(id), player, 'a short outage must not remove the participant');
  assert.equal(player.voiceJoined, true);
  assert.equal(typeof auth.resumeToken, 'string');
  const next = await f.client();
  next.send({ type: 'authenticate', access_token: 'recovery-user', resumeToken: auth.resumeToken, requestId: 'resume' });
  const result = await next.wait(m => m.type === 'auth-result');
  assert.equal(result.resumed, true);
  assert.equal(result.clientId, id);
  assert.notEqual(result.resumeToken, auth.resumeToken, 'resume capability rotates');
  assert.equal(player.ws, next.server);
  assert.equal(player.voiceMuted, true);
  assert.equal(player.mediaTransport, 'sfu');
  assert.equal(f.sfuCleanups.length, cleanups, 'established SFU media must not be cleaned up for a signaling outage');
  assert.equal(next.server.clientId, id);
  assert.equal(f.rooms.get('chat-livre').players.size, 2);
  assert(!observer.messages.slice(before).some(m => m.type === 'voice-event' && m.playerId === id));
});
test('resume credentials cannot transfer a different account and revocation removes suspended voice immediately', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const { c, auth } = await voiceClient(f);
  const id = c.server.clientId;
  const closed = new Promise(r => c.server.once('close', r)); c.ws.terminate(); await closed;
  const attacker = await f.client();
  attacker.send({ type: 'authenticate', access_token: 'other-account', resumeToken: auth.resumeToken, requestId: 'steal' });
  const result = await attacker.wait(m => m.type === 'auth-result');
  assert.equal(result.resumed, false);
  assert.notEqual(attacker.server.clientId, id);
  assert.equal(f.rooms.get('chat-livre').players.get(id).ws, c.server);
  f.gateway.revoke({ userId: 'recovery-user', all: true });
  assert.equal(f.rooms.get('chat-livre').players.has(id), false);
});

test('the real network client reconnects one socket and resumes voice automatically with its original identity', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const { createSocketTransport } = await import('../src/lib/socket/transport.ts');
  const { createNetworkClient } = await import('../src/lib/socket/client.ts');
  const sockets = [], events = [];
  let queuedSfu;
  const transport = createSocketTransport({
    url: `ws://127.0.0.1:${f.server.address().port}`,
    createSocket(url) { const socket = new WebSocket(url); sockets.push(socket); return socket; },
  });
  const user = { id: 'automatic', nickname: 'automatic', role: 'member', permissions: {} };
  const network = createNetworkClient({ backendHttp: '', transport, getIdentity: () => ({user, getAccessToken: async () => 'automatic'}) });
  t.after(() => network.disconnect());
  network.onMessage(m => { events.push(m); if(m.recovering && !queuedSfu) { queuedSfu = network.requestSfu('status'); queuedSfu.catch(() => {}); } });
  await network.connect(); await network.authenticate('automatic');
  await network.joinRoom('chat-livre');
  const until = async (predicate) => {
    const deadline = Date.now() + 5000;
    while (!predicate()) { if (Date.now() > deadline) assert.fail('Recovery did not complete'); await new Promise(r => setTimeout(r, 10)); }
  };
  await until(() => network.primaryRoom === 'chat-livre');
  await network.prepareVoice(); network.setVoiceState(true, true);
  const id = network.clientId;
  await until(() => f.rooms.get('chat-livre').players.get(id)?.voiceJoined);
  const old = [...f.wss.clients].find(s => s.clientId === id);
  old.terminate();
  await until(() => events.some(m => m.type === 'connection' && m.resumed));
  assert.deepEqual(await queuedSfu, {}, 'SFU requests wait for authentication to recover');
  assert.equal(network.clientId, id);
  assert.equal(network.primaryRoom, 'chat-livre');
  assert.equal(sockets.length, 2);
  assert.equal([...f.wss.clients].length, 1);
  assert(events.some(m => m.type === 'connection' && m.recovering));
  assert.equal(f.rooms.get('chat-livre').players.get(id).voiceJoined, true);
  assert.equal(f.rooms.get('chat-livre').players.get(id).voiceMuted, true);
});

test('suspended voice expires after the grace deadline and explicit close never reserves a ghost', async (t) => {
  const f = await fixture();
  try {
    const {c} = await voiceClient(f);
    const id = c.server.clientId;
    t.mock.timers.enable({apis:['setTimeout']});
    const closed = new Promise(r => c.server.once('close',r)); c.ws.terminate(); await closed;
    assert(f.rooms.get('chat-livre').players.has(id));
    t.mock.timers.tick(44999); assert(f.rooms.get('chat-livre').players.has(id));
    t.mock.timers.tick(1); assert.equal(f.rooms.get('chat-livre').players.has(id),false);
    t.mock.timers.reset();
    const other = (await voiceClient(f,'normal')).c;
    const closedOther = new Promise(r => other.server.once('close',r)); other.ws.close(1000); await closedOther;
    assert.equal(f.rooms.get('chat-livre').players.has(other.server.clientId),false);
  } finally { t.mock.timers.reset(); await f.close(); }
});

test('lost resume replies can be retried on the same socket or its replacement without losing the reserved voice', async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const {c,auth} = await voiceClient(f);
  const id = c.server.clientId;
  const closed = new Promise(r => c.server.once('close',r)); c.ws.terminate(); await closed;
  const next = await f.client();
  next.send({type:'authenticate',access_token:'recovery-user',resumeToken:auth.resumeToken,requestId:'first'});
  assert.equal((await next.wait(m => m.requestId === 'first')).resumed,true);
  next.send({type:'authenticate',access_token:'recovery-user',resumeToken:auth.resumeToken,requestId:'retry'});
  assert.equal((await next.wait(m => m.requestId === 'retry')).resumed,true);
  const secondClose = new Promise(r => next.server.once('close',r)); next.ws.terminate(); await secondClose;
  const last = await f.client();
  last.send({type:'authenticate',access_token:'recovery-user',resumeToken:auth.resumeToken,requestId:'lost-reply'});
  assert.equal((await last.wait(m => m.requestId === 'lost-reply')).resumed,true);
  assert.equal(last.server.clientId,id);
  assert.equal(f.rooms.get('chat-livre').players.get(id).ws,last.server);
});

test('a different login session cannot claim a reserved call even with its resume capability', async (t) => {
  const f = await fixture({identity:async token=>({...account('same-user'),sessionId:token})}); t.after(()=>f.close());
  const {c,auth} = await voiceClient(f,'session-one');
  const id=c.server.clientId;
  const closed=new Promise(r=>c.server.once('close',r)); c.ws.terminate();await closed;
  const next=await f.client();next.send({type:'authenticate',access_token:'session-two',resumeToken:auth.resumeToken,requestId:'wrong-session'});
  assert.equal((await next.wait(m=>m.requestId==='wrong-session')).resumed,false);
  assert.equal(f.rooms.get('chat-livre').players.get(id).ws,c.server);
});
test('moderation can remove a suspended participant and resume cannot undo the removal', async (t) => {
  const f=await fixture();t.after(()=>f.close());
  const {c,auth}=await voiceClient(f), operator=(await voiceClient(f,'operator')).c;
  operator.server.account.role='creator';
  const id=c.server.clientId,closed=new Promise(r=>c.server.once('close',r));c.ws.terminate();await closed;
  f.channels.moderateVoice(operator.server,{action:'kick',targetId:id,requestId:'kick-offline'});
  assert.equal(f.rooms.get('chat-livre').players.get(id).voiceJoined,false);
  const next=await f.client();next.send({type:'authenticate',access_token:'recovery-user',resumeToken:auth.resumeToken,requestId:'blocked'});
  assert.equal((await next.wait(m=>m.requestId==='blocked')).resumed,false);
  assert.equal(f.rooms.get('chat-livre').players.get(id).voiceJoined,false);
});
