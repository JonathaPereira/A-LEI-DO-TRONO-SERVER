'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http'),
  express = require('express'),
  WebSocket = require('ws');
const {
  assertProductionConfig,
  createApplication,
  resolveTrustProxyHops,
} = require('../server/app.ts');
const { createAuth } = require('../server/auth.ts');
const { BackendSocket, createSocketGateway, sendSocket } = require('../server/socket-gateway.ts');
const { createChannelRooms, createChannelService } = require('../server/channel-service.ts');
const { createCommunity } = require('../server/community.ts');
const { isForbiddenUpload, sanitizeFileName } = require('../server/file-upload.ts');

const fullProdEnv = () => ({
  NODE_ENV: 'production',
  AUTH_REQUIRED: 'true',
  SUPABASE_URL: 'https://provider.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'pub-key',
  SUPABASE_SECRET_KEY: 'sec-key',
  APP_URL: 'https://app.example.test',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
});

test('resolveTrustProxyHops strictly accepts 0..10 and defaults invalid values to 0', () => {
  assert.equal(resolveTrustProxyHops(undefined), 0);
  assert.equal(resolveTrustProxyHops(''), 0);
  assert.equal(resolveTrustProxyHops('true'), 0);
  assert.equal(resolveTrustProxyHops('-1'), 0);
  assert.equal(resolveTrustProxyHops('11'), 0);
  assert.equal(resolveTrustProxyHops('abc'), 0);
  assert.equal(resolveTrustProxyHops('0'), 0);
  assert.equal(resolveTrustProxyHops('1'), 1);
  assert.equal(resolveTrustProxyHops('2'), 2);
});

test('assertProductionConfig fails fast when AUTH_REQUIRED or secrets are missing in production', () => {
  assert.doesNotThrow(() => assertProductionConfig({ NODE_ENV: 'development' }));
  assert.doesNotThrow(() => assertProductionConfig(fullProdEnv()));
  assert.throws(
    () => assertProductionConfig({ ...fullProdEnv(), AUTH_REQUIRED: 'false' }),
    /AUTH_REQUIRED/,
  );
  assert.throws(
    () => assertProductionConfig({ ...fullProdEnv(), TURNSTILE_SECRET_KEY: '' }),
    /TURNSTILE_SECRET_KEY/,
  );
  assert.throws(
    () => assertProductionConfig({ ...fullProdEnv(), SUPABASE_SECRET_KEY: '   ' }),
    /SUPABASE_SECRET_KEY/,
  );
});

test('createApplication sets global security headers on /health', async () => {
  const appInstance = createApplication();
  const port = await new Promise((resolve) => {
    const s = appInstance.server.listen(0, '127.0.0.1', () => resolve(s.address().port));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(
      res.headers.get('permissions-policy'),
      'camera=(self), microphone=(self), display-capture=(self)',
    );
    assert.equal(res.headers.get('x-powered-by'), null);
  } finally {
    await appInstance.close();
  }
});

test('auth Turnstile verification blocks missing/invalid token and allows valid token', async () => {
  const env = {
    SUPABASE_URL: 'https://provider.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'pub',
    APP_URL: 'https://app.example.test',
    TURNSTILE_SECRET_KEY: 'ts-secret',
  };
  let siteverifyOutcome = true;
  const service = createAuth({
    env,
    fetchImpl: async (url) => {
      if (String(url).includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
        return Response.json({ success: siteverifyOutcome });
      }
      if (String(url).includes('/token?')) {
        const jwtPayload = Buffer.from(
          JSON.stringify({
            sub: '10000000-0000-4000-8000-000000000001',
            exp: Math.floor(Date.now() / 1000) + 3600,
            session_id: '20000000-0000-4000-8000-000000000001',
          }),
        ).toString('base64url');
        return Response.json({ access_token: `h.${jwtPayload}.s`, refresh_token: 'r' });
      }
      if (String(url).endsWith('/auth/v1/user')) {
        return Response.json({
          id: '10000000-0000-4000-8000-000000000001',
          email: 'user@example.test',
          email_confirmed_at: '2026-10-21T00:00:00Z',
        });
      }
      if (String(url).includes('/rest/v1/profiles?')) {
        return Response.json([
          {
            id: '10000000-0000-4000-8000-000000000001',
            nickname: 'User',
            community_role: 'member',
            avatar_preset: 'crown',
            avatar_file_id: null,
          },
        ]);
      }
      return Response.json({});
    },
  });
  const app = express();
  service.install(app, express);
  const server = await new Promise((resolve) => {
    const l = app.listen(0, '127.0.0.1', () => resolve(l));
  });
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  try {
    const missing = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
      body: JSON.stringify({ email: 'user@example.test', password: 'secret' }),
    });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error?.code, 'CAPTCHA_REQUIRED');

    siteverifyOutcome = false;
    const invalid = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
      body: JSON.stringify({
        email: 'user@example.test',
        password: 'secret',
        turnstile_token: 'bad-token',
      }),
    });
    assert.equal(invalid.status, 403);
    assert.equal((await invalid.json()).error?.code, 'CAPTCHA_FAILED');

    siteverifyOutcome = true;
    const valid = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
      body: JSON.stringify({
        email: 'user@example.test',
        password: 'secret',
        turnstile_token: 'good-token',
      }),
    });
    assert.equal(valid.status, 200);
  } finally {
    service.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('auth progressive lockout locks account after 5 consecutive failed logins', async () => {
  const env = {
    SUPABASE_URL: 'https://provider.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'pub',
    APP_URL: 'https://app.example.test',
  };
  const service = createAuth({
    env,
    fetchImpl: async () =>
      Response.json({ error: 'invalid_grant', error_description: 'Invalid' }, { status: 400 }),
  });
  const app = express();
  service.install(app, express);
  const server = await new Promise((resolve) => {
    const l = app.listen(0, '127.0.0.1', () => resolve(l));
  });
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
        body: JSON.stringify({ email: 'victim@example.test', password: 'wrong' }),
      });
      assert.equal(res.status, 401);
    }
    const locked = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: env.APP_URL },
      body: JSON.stringify({ email: 'victim@example.test', password: 'wrong' }),
    });
    assert.equal(locked.status, 429);
    const body = await locked.json();
    assert.equal(body.error?.code, 'ACCOUNT_LOCKED');
  } finally {
    service.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('socket gateway enforces auth timeout and per-connection rate limit', async () => {
  const server = http.createServer();
  const wss = new WebSocket.WebSocketServer({ server, WebSocket: BackendSocket });
  const rooms = createChannelRooms();
  const auth = {
    required: true,
    configured: false,
    health: () => ({ required: true }),
    identity: async () => ({
      id: 'u1',
      nickname: 'U1',
      role: 'member',
      expiresAt: Date.now() + 60000,
      sessionId: 's1',
    }),
  };
  const noop = { handle: () => {}, disconnect: () => {}, updateAccount: () => {} };
  const channels = createChannelService({
    rooms,
    wss,
    send: sendSocket,
    sfu: { cleanupClient: async () => {}, broadcastStatus: () => {}, broadcastPublications: () => {} },
    soundboard: { clearRoom: () => {} },
    throne: { disconnect: () => {}, broadcastState: () => {}, privateState: () => null },
    azul: noop,
    splendor: noop,
    loveLetter: noop,
    ticketToRide: noop,
    similo: noop,
  });
  const gateway = createSocketGateway({
    wss,
    auth,
    rooms,
    channels,
    throne: { disconnect: () => {}, privateState: () => null, rename: () => {}, broadcastState: () => {}, setReady: () => {}, start: () => {}, handle: () => {} },
    azul: noop,
    splendor: noop,
    loveLetter: noop,
    similo: noop,
    ticketToRide: noop,
    remotePc: { handle: async () => {}, disconnect: () => {} },
    community: createCommunity({ wss, rooms, send: sendSocket, auth, env: {} }),
    communityManagement: { handle: async () => {} },
    chat: { handleJoinText: () => {}, handleHistoryRequest: async () => {}, handleDelete: async () => {}, handleClear: async () => {} },
    soundboard: { clearRoom: () => {}, handlePlay: async () => {} },
    sfu: {
      cleanupClient: async () => {},
      statusPayload: () => ({ enabled: false }),
      publicHealth: () => ({ enabled: false }),
      handleRequest: () => {},
    },
    version: '1.0.0',
    authTimeoutMs: 80,
    rateLimitCapacity: 3,
    rateLimitPerSec: 0,
  });
  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  try {
    // 1. Auth timeout closes unauthenticated socket with 4001
    const unauthWs = new WebSocket(`ws://127.0.0.1:${port}`);
    const timeoutClose = await new Promise((resolve) => {
      unauthWs.on('close', (code) => resolve(code));
    });
    assert.equal(timeoutClose, 4001);

    // 2. Rate limit closes flooding socket with 1008
    const floodWs = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve) => floodWs.on('open', resolve));
    const floodClose = new Promise((resolve) => {
      floodWs.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    for (let i = 0; i < 6; i++) {
      floodWs.send(JSON.stringify({ type: 'ping' }));
    }
    const closed = await floodClose;
    assert.equal(closed.code, 1008);
    assert.equal(closed.reason, 'RATE_LIMIT_EXCEEDED');
  } finally {
    gateway.stop();
    wss.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('file upload sanitization blocks path traversal and SVG/HTML Stored XSS', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), '____etc_passwd');
  assert.equal(sanitizeFileName('..'), '_');
  assert.equal(sanitizeFileName(''), 'arquivo');
  assert.equal(isForbiddenUpload('evil.svg', Buffer.from('<svg></svg>'), 'application/octet-stream'), true);
  assert.equal(isForbiddenUpload('page.html', Buffer.from('<html></html>'), 'application/octet-stream'), true);
  assert.equal(
    isForbiddenUpload('disguised.txt', Buffer.from('<svg onload=alert(1)>'), 'application/octet-stream'),
    true,
  );
  assert.equal(isForbiddenUpload('photo.png', Buffer.from([137, 80, 78, 71]), 'image/png'), false);
});

test('WebRTC handleVoiceSignal rejects cross-room signaling', () => {
  const rooms = createChannelRooms();
  const [roomA, roomB] = [...rooms.values()];
  const sent = [];
  const channels = createChannelService({
    rooms,
    wss: { clients: new Set() },
    send: (_ws, payload) => sent.push(payload),
    sfu: { cleanupClient: async () => {}, broadcastStatus: () => {}, broadcastPublications: () => {} },
    soundboard: { clearRoom: () => {} },
    throne: { disconnect: () => {}, broadcastState: () => {}, privateState: () => null },
    azul: { disconnect: () => {} },
    splendor: { disconnect: () => {} },
    loveLetter: { disconnect: () => {} },
    ticketToRide: { disconnect: () => {} },
    similo: { disconnect: () => {} },
  });
  const wsA = { clientId: 'a', roomId: roomA.id, account: { id: 'ua', nickname: 'A' } };
  const wsB = { clientId: 'b', roomId: roomB.id, account: { id: 'ub', nickname: 'B' } };
  roomA.players.set('a', { ws: wsA, nickname: 'A', voiceJoined: true, muted: false, deafened: false, screenSharing: false, cameraSharing: false });
  roomB.players.set('b', { ws: wsB, nickname: 'B', voiceJoined: true, muted: false, deafened: false, screenSharing: false, cameraSharing: false });

  channels.handleVoiceSignal(wsA, {
    type: 'voice-signal',
    targetId: 'b',
    signal: { type: 'offer', sdp: 'v=0...' },
  });
  assert.equal(sent.length, 0);
});
