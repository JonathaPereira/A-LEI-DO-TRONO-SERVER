import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { createApplication, type BackendApplication } from '../../apps/server/src/app.ts';

const VALID_OFFER_SDP =
  'v=0\r\no=- 10001 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
const VALID_ANSWER_SDP =
  'v=0\r\no=- 20002 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';

interface FakeTrack {
  mid: string;
  trackName: string;
  location: 'local' | 'remote';
  sessionId?: string;
}

interface CfCallLog {
  method: string;
  suffix: string;
  body: unknown;
}

function createFakeCloudflareFetch() {
  const calls: CfCallLog[] = [];
  const sessions = new Map<string, { nextMid: number; tracks: Map<string, FakeTrack> }>();
  let sessionSeq = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || 'GET').toUpperCase();
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : undefined;

    const match = /\/v1\/apps\/[^/]+(\/.*)$/.exec(url);
    const suffix = match ? match[1] : url;
    calls.push({ method, suffix, body });

    const jsonResponse = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    if (method === 'POST' && suffix === '/sessions/new') {
      const sessionId = `cf-ws-session-${++sessionSeq}`;
      sessions.set(sessionId, { nextMid: 100, tracks: new Map() });
      return jsonResponse({ sessionId });
    }

    const tracksNewMatch = /^\/sessions\/([^/]+)\/tracks\/new$/.exec(suffix);
    if (method === 'POST' && tracksNewMatch) {
      const sessionId = decodeURIComponent(tracksNewMatch[1]);
      const session = sessions.get(sessionId);
      if (!session)
        return jsonResponse({ errorCode: 'not_found', errorDescription: 'Missing' }, 404);

      const reqTracks =
        (body?.tracks as Array<{
          location: 'local' | 'remote';
          mid?: string;
          trackName: string;
          sessionId?: string;
        }>) || [];
      const isRemote = reqTracks.some((t) => t.location === 'remote');

      if (!isRemote) {
        const outTracks = reqTracks.map((t) => {
          const mid = String(t.mid || session.nextMid++);
          session.tracks.set(mid, { mid, trackName: t.trackName, location: 'local' });
          return { mid, trackName: t.trackName, location: 'local', status: 'active' };
        });
        return jsonResponse({
          sessionDescription: { type: 'answer', sdp: VALID_ANSWER_SDP },
          requiresImmediateRenegotiation: false,
          tracks: outTracks,
        });
      }

      const outTracks = reqTracks.map((t) => {
        const pubSession = t.sessionId ? sessions.get(t.sessionId) : undefined;
        const pubTrack = pubSession
          ? [...pubSession.tracks.values()].find(
              (item) => item.location === 'local' && item.trackName === t.trackName,
            )
          : undefined;
        if (!pubTrack) {
          return {
            trackName: t.trackName,
            sessionId: t.sessionId,
            errorCode: 'not_found_track_error',
            errorDescription: 'Track not found',
          };
        }
        const mid = String(session.nextMid++);
        session.tracks.set(mid, {
          mid,
          trackName: t.trackName,
          location: 'remote',
          sessionId: t.sessionId,
        });
        return { mid, trackName: t.trackName, sessionId: t.sessionId, location: 'remote' };
      });
      return jsonResponse({
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        requiresImmediateRenegotiation: true,
        tracks: outTracks,
      });
    }

    const renegotiateMatch = /^\/sessions\/([^/]+)\/renegotiate$/.exec(suffix);
    if (method === 'PUT' && renegotiateMatch) {
      return jsonResponse({});
    }

    const closeMatch = /^\/sessions\/([^/]+)\/tracks\/close$/.exec(suffix);
    if (method === 'PUT' && closeMatch) {
      const sessionId = decodeURIComponent(closeMatch[1]);
      const session = sessions.get(sessionId);
      if (session) {
        const mids = (body?.tracks as Array<{ mid: string }>) || [];
        for (const item of mids) session.tracks.delete(item.mid);
      }
      return jsonResponse({ tracks: body?.tracks || [] });
    }

    return jsonResponse({ errorCode: 'unhandled', errorDescription: `${method} ${suffix}` }, 404);
  };

  return { fetchImpl, calls, sessions };
}

class TestWsClient {
  readonly ws: WebSocket;
  readonly messages: Array<Record<string, unknown>> = [];
  private readonly waiters: Array<{
    predicate: (msg: Record<string, unknown>) => boolean;
    resolve: (msg: Record<string, unknown>) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
      this.messages.push(parsed);
      for (let i = 0; i < this.waiters.length; i++) {
        const waiter = this.waiters[i];
        if (waiter.predicate(parsed)) {
          this.waiters.splice(i, 1);
          clearTimeout(waiter.timer);
          waiter.resolve(parsed);
          return;
        }
      }
    });
  }

  static async connect(url: string): Promise<TestWsClient> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });
    return new TestWsClient(ws);
  }

  sendJson(payload: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(payload));
  }

  waitFor(
    predicate: (msg: Record<string, unknown>) => boolean,
    label: string,
    timeoutMs = 3_000,
  ): Promise<Record<string, unknown>> {
    const existingIdx = this.messages.findIndex(predicate);
    if (existingIdx !== -1) {
      return Promise.resolve(this.messages[existingIdx]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for ${label}`));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  waitForNext(
    predicate: (msg: Record<string, unknown>) => boolean,
    label: string,
    startIndex: number,
    timeoutMs = 3_000,
  ): Promise<Record<string, unknown>> {
    const slice = this.messages.slice(startIndex);
    const match = slice.find(predicate);
    if (match) return Promise.resolve(match);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for next ${label}`));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  async sfuRequest(
    requestId: string,
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    this.sendJson({ type: 'sfu-request', requestId, action, payload });
    return this.waitFor(
      (m) => m.type === 'sfu-response' && m.requestId === requestId,
      `sfu-response:${requestId}`,
    );
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}

describe('Render Backend WebSocket + Cloudflare SFU Integration', () => {
  let app: BackendApplication | undefined;
  const clients: TestWsClient[] = [];

  afterEach(async () => {
    while (clients.length) {
      const client = clients.pop();
      if (client) await client.close();
    }
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('executa fluxo completo WebSocket de sessões assimétricas (ensure-session, publish-tracks, subscribe-tracks, renegotiate e unpublish-tracks)', async () => {
    const fakeCf = createFakeCloudflareFetch();
    app = createApplication({
      authEnv: { ...process.env, AUTH_REQUIRED: 'false' },
      sfuEnv: {
        CLOUDFLARE_REALTIME_ENABLED: 'true',
        CLOUDFLARE_REALTIME_APP_ID: 'app-ws-test',
        CLOUDFLARE_REALTIME_API_TOKEN: 'token-ws-test',
      },
      sfuFetchImpl: fakeCf.fetchImpl,
      sfuUsageFile: `/tmp/trono-ws-sfu-test-${Date.now()}.json`,
    });

    await new Promise<void>((resolve) => {
      app!.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = app.server.address() as AddressInfo;
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const alice = await TestWsClient.connect(wsUrl);
    const bob = await TestWsClient.connect(wsUrl);
    clients.push(alice, bob);

    alice.sendJson({ type: 'join-room', roomId: 'chat-livre', name: 'Alice' });
    const aliceJoined = await alice.waitFor((m) => m.type === 'joined-room', 'alice joined-room');
    const alicePlayerId = String((aliceJoined.me as { id: string }).id);

    bob.sendJson({ type: 'join-room', roomId: 'chat-livre', name: 'Bob' });
    await bob.waitFor((m) => m.type === 'joined-room', 'bob joined-room');

    alice.sendJson({
      type: 'voice-state',
      joined: true,
      muted: false,
      deafened: false,
      camera: false,
      screen: true,
      transport: 'sfu',
      quality: 'high',
    });
    const aliceMode = await alice.waitFor((m) => m.type === 'voice-mode', 'alice voice-mode');
    assert.equal(aliceMode.mode, 'sfu');

    bob.sendJson({
      type: 'voice-state',
      joined: true,
      muted: false,
      deafened: false,
      camera: false,
      screen: false,
      transport: 'sfu',
      quality: 'balanced',
    });
    const bobMode = await bob.waitFor((m) => m.type === 'voice-mode', 'bob voice-mode');
    assert.equal(bobMode.mode, 'sfu');

    // 1. Alice garante sessão publisher e publica screen + screen-audio em lote
    const ensurePubResp = await alice.sfuRequest('req-ensure-pub', 'ensure-session', {
      purpose: 'publish',
    });
    assert.equal(ensurePubResp.ok, true);
    const alicePubSessionId = String((ensurePubResp.data as { sessionId: string }).sessionId);

    const aliceCursorBeforePub = alice.messages.length;
    const bobCursorBeforePub = bob.messages.length;

    const pubResp = await alice.sfuRequest('req-pub-screen', 'publish-tracks', {
      sessionId: alicePubSessionId,
      quality: 'high',
      screenBitrate: 10_000_000,
      sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
      tracks: [
        { kind: 'screen', mid: '1', rids: ['f', 'h'] },
        { kind: 'screen-audio', mid: '2', rids: [] },
      ],
    });
    assert.equal(pubResp.ok, true);
    assert.equal((pubResp.data as { sessionId: string }).sessionId, alicePubSessionId);

    // Ambos recebem sfu-publications imediatamente sem polling GET /sessions/{id}
    const alicePubCast = await alice.waitForNext(
      (m) =>
        m.type === 'sfu-publications' &&
        Array.isArray(m.publications) &&
        m.publications.length === 2,
      'alice sfu-publications',
      aliceCursorBeforePub,
    );
    const bobPubCast = await bob.waitForNext(
      (m) =>
        m.type === 'sfu-publications' &&
        Array.isArray(m.publications) &&
        m.publications.length === 2,
      'bob sfu-publications',
      bobCursorBeforePub,
    );
    assert.deepEqual(
      (alicePubCast.publications as Array<{ kind: string }>).map((p) => p.kind),
      ['screen', 'screen-audio'],
    );
    assert.deepEqual(
      (bobPubCast.publications as Array<{ kind: string }>).map((p) => p.kind),
      ['screen', 'screen-audio'],
    );
    assert.equal(fakeCf.calls.filter((c) => c.method === 'GET').length, 0);

    // 2. Bob garante sessão subscriber, assina ambas as tracks e renegocia
    const ensureSubResp = await bob.sfuRequest('req-ensure-sub', 'ensure-session', {
      purpose: 'subscribe',
    });
    assert.equal(ensureSubResp.ok, true);
    const bobSubSessionId = String((ensureSubResp.data as { sessionId: string }).sessionId);

    const subResp = await bob.sfuRequest('req-sub-screen', 'subscribe-tracks', {
      sessionId: bobSubSessionId,
      quality: 'high',
      tracks: [
        { publisherId: alicePlayerId, kind: 'screen', preferredRid: 'f' },
        { publisherId: alicePlayerId, kind: 'screen-audio', preferredRid: null },
      ],
    });
    assert.equal(subResp.ok, true);
    const subData = subResp.data as {
      sessionId: string;
      sessionDescription: { type: string };
      tracks: Array<{ kind: string; mid: string }>;
    };
    assert.equal(subData.sessionId, bobSubSessionId);
    assert.equal(subData.sessionDescription.type, 'offer');
    assert.equal(subData.tracks.length, 2);

    const renegResp = await bob.sfuRequest('req-reneg', 'renegotiate', {
      sessionId: bobSubSessionId,
      sessionDescription: { type: 'answer', sdp: VALID_ANSWER_SDP },
    });
    assert.equal(renegResp.ok, true);

    const newSessionCalls = fakeCf.calls.filter((c) => c.suffix === '/sessions/new');
    assert.equal(newSessionCalls.length, 2, 'Apenas 1 publisher (Alice) e 1 subscriber (Bob)');

    // 3. Alice encerra ambos os mids e o catálogo esvazia imediatamente
    const bobCursorBeforeUnpub = bob.messages.length;
    const unpubResp = await alice.sfuRequest('req-unpub', 'unpublish-tracks', {
      sessionId: alicePubSessionId,
      mids: ['1', '2'],
    });
    assert.equal(unpubResp.ok, true);

    const bobClearedCast = await bob.waitForNext(
      (m) =>
        m.type === 'sfu-publications' &&
        Array.isArray(m.publications) &&
        m.publications.length === 0,
      'bob cleared sfu-publications',
      bobCursorBeforeUnpub,
    );
    assert.deepEqual(bobClearedCast.publications, []);

    const closeCalls = fakeCf.calls.filter((c) => c.suffix.endsWith('/tracks/close'));
    assert.equal(
      closeCalls.length,
      2,
      'Fecha tracks na sessão publisher e na sessão subscriber dependente',
    );
    assert.equal(fakeCf.sessions.get(alicePubSessionId)?.tracks.size, 0);
    assert.equal(fakeCf.sessions.get(bobSubSessionId)?.tracks.size, 0);
  });
});
