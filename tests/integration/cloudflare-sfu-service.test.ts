import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudflareRealtimeSfuService,
  type CloudflareCallsProvider,
  type CloudflareProviderResponse,
  type SfuConnection,
  type SfuPlayer,
  type SfuRoom,
} from '../../apps/server/src/modules/sfu/index.ts';

const VALID_OFFER_SDP =
  'v=0\r\no=- 10001 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const VALID_ANSWER_SDP =
  'v=0\r\no=- 20002 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

interface FakeStoredTrack {
  mid: string;
  trackName: string;
  location: 'local' | 'remote';
  remoteSessionId?: string;
  preferredRid?: string;
  status: 'active' | 'inactive';
}

interface FakeSession {
  id: string;
  tracks: Map<string, FakeStoredTrack>;
  nextMid: number;
  pendingRenegotiation: boolean;
}

class FakeCloudflareCallsProvider implements CloudflareCallsProvider {
  readonly requests: Array<{ method: string; suffix: string; body: unknown }> = [];
  readonly sessions = new Map<string, FakeSession>();
  private sessionSeq = 0;
  private activeCalls = 0;
  maxConcurrentCalls = 0;
  delayMs = 0;

  async request(
    method: 'GET' | 'POST' | 'PUT',
    suffix: string,
    body?: unknown,
  ): Promise<CloudflareProviderResponse> {
    this.activeCalls += 1;
    this.maxConcurrentCalls = Math.max(this.maxConcurrentCalls, this.activeCalls);
    this.requests.push({ method, suffix, body });
    try {
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }

      if (method === 'POST' && suffix === '/sessions/new') {
        const id = `cf-session-${++this.sessionSeq}`;
        this.sessions.set(id, {
          id,
          tracks: new Map(),
          nextMid: 100,
          pendingRenegotiation: false,
        });
        return { sessionId: id };
      }

      const tracksNewMatch = /^\/sessions\/([^/]+)\/tracks\/new$/.exec(suffix);
      if (method === 'POST' && tracksNewMatch) {
        const sessionId = decodeURIComponent(tracksNewMatch[1]);
        const session = this.sessions.get(sessionId);
        if (!session) {
          throw Object.assign(new Error('Session not found'), { status: 404 });
        }
        const payload = (body || {}) as {
          sessionDescription?: { type: 'offer' | 'answer'; sdp: string };
          tracks?: Array<{
            location: 'local' | 'remote';
            mid?: string;
            trackName: string;
            sessionId?: string;
            simulcast?: { preferredRid?: string };
          }>;
        };
        const reqTracks = payload.tracks || [];
        const hasRemote = reqTracks.some((t) => t.location === 'remote');

        if (!hasRemote) {
          const outTracks = reqTracks.map((item) => {
            const mid = String(item.mid || session.nextMid++);
            const stored: FakeStoredTrack = {
              mid,
              trackName: item.trackName,
              location: 'local',
              status: 'active',
            };
            session.tracks.set(mid, stored);
            return {
              mid,
              trackName: item.trackName,
              location: 'local' as const,
              status: 'active' as const,
            };
          });
          return {
            sessionDescription: { type: 'answer', sdp: VALID_ANSWER_SDP },
            requiresImmediateRenegotiation: false,
            tracks: outTracks,
          };
        }

        const outTracks = reqTracks.map((item) => {
          const pubSession = item.sessionId ? this.sessions.get(item.sessionId) : undefined;
          const pubTrack = pubSession
            ? [...pubSession.tracks.values()].find(
                (t) => t.location === 'local' && t.trackName === item.trackName,
              )
            : undefined;
          if (!pubTrack) {
            return {
              trackName: item.trackName,
              sessionId: item.sessionId,
              errorCode: 'not_found_track_error',
              errorDescription: 'Track not found on publisher session',
            };
          }
          const mid = String(session.nextMid++);
          const stored: FakeStoredTrack = {
            mid,
            trackName: item.trackName,
            location: 'remote',
            remoteSessionId: item.sessionId,
            preferredRid: item.simulcast?.preferredRid,
            status: 'active',
          };
          session.tracks.set(mid, stored);
          return {
            mid,
            trackName: item.trackName,
            sessionId: item.sessionId,
            location: 'remote' as const,
          };
        });
        session.pendingRenegotiation = true;
        return {
          sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
          requiresImmediateRenegotiation: true,
          tracks: outTracks,
        };
      }

      const renegotiateMatch = /^\/sessions\/([^/]+)\/renegotiate$/.exec(suffix);
      if (method === 'PUT' && renegotiateMatch) {
        const sessionId = decodeURIComponent(renegotiateMatch[1]);
        const session = this.sessions.get(sessionId);
        if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
        session.pendingRenegotiation = false;
        return {};
      }

      const updateMatch = /^\/sessions\/([^/]+)\/tracks\/update$/.exec(suffix);
      if (method === 'PUT' && updateMatch) {
        const sessionId = decodeURIComponent(updateMatch[1]);
        const session = this.sessions.get(sessionId);
        if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
        const payload = (body || {}) as {
          tracks?: Array<{ mid: string; simulcast?: { preferredRid?: string } }>;
        };
        for (const item of payload.tracks || []) {
          const track = session.tracks.get(item.mid);
          if (track) track.preferredRid = item.simulcast?.preferredRid;
        }
        return {};
      }

      const closeMatch = /^\/sessions\/([^/]+)\/tracks\/close$/.exec(suffix);
      if (method === 'PUT' && closeMatch) {
        const sessionId = decodeURIComponent(closeMatch[1]);
        const session = this.sessions.get(sessionId);
        if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
        const payload = (body || {}) as { tracks?: Array<{ mid: string }> };
        for (const item of payload.tracks || []) {
          session.tracks.delete(item.mid);
        }
        return {
          tracks: (payload.tracks || []).map((t) => ({ mid: t.mid })),
        };
      }

      const getMatch = /^\/sessions\/([^/]+)$/.exec(suffix);
      if (method === 'GET' && getMatch) {
        const sessionId = decodeURIComponent(getMatch[1]);
        const session = this.sessions.get(sessionId);
        if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
        return {
          tracks: [...session.tracks.values()].map((t) => ({
            mid: t.mid,
            trackName: t.trackName,
            location: t.location,
            status: t.status,
          })),
        };
      }

      throw new Error(`Unhandled Cloudflare endpoint: ${method} ${suffix}`);
    } finally {
      this.activeCalls -= 1;
    }
  }
}

interface SentWireMessage {
  clientId: string;
  message: { type: string; [key: string]: unknown };
}

function createHarness(envOverrides: Record<string, string> = {}) {
  const provider = new FakeCloudflareCallsProvider();
  const rooms = new Map<string, SfuRoom>();
  const sent: SentWireMessage[] = [];
  const rosterBroadcasts: string[] = [];

  const room: SfuRoom = {
    id: 'chat-livre',
    kind: 'chat',
    channelType: 'voice',
    voiceMode: 'sfu',
    players: new Map(),
  };
  rooms.set(room.id, room);

  const addPlayer = (id: string, name: string): SfuPlayer => {
    const ws: SfuConnection = { clientId: id, roomId: room.id };
    const player: SfuPlayer = {
      id,
      name,
      ws,
      voiceJoined: true,
      serverMuted: false,
      mediaBlocked: false,
    };
    room.players.set(id, player);
    return player;
  };

  const service = new CloudflareRealtimeSfuService({
    rooms,
    provider,
    send(ws, message) {
      sent.push({ clientId: ws.clientId, message });
    },
    broadcastVoiceRoster(targetRoom) {
      rosterBroadcasts.push(targetRoom.id);
    },
    env: {
      CLOUDFLARE_REALTIME_ENABLED: 'true',
      CLOUDFLARE_REALTIME_APP_ID: 'app-test',
      CLOUDFLARE_REALTIME_API_TOKEN: 'token-test',
      ...envOverrides,
    },
    usageFile: `/tmp/trono-sfu-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  });

  const lastResponse = (clientId: string, requestId: string) => {
    const found = [...sent]
      .reverse()
      .find(
        (entry) =>
          entry.clientId === clientId &&
          entry.message.type === 'sfu-response' &&
          entry.message.requestId === requestId,
      );
    assert.ok(found, `Expected sfu-response for ${clientId}:${requestId}`);
    return found.message as {
      type: 'sfu-response';
      requestId: string;
      ok: boolean;
      data: Record<string, unknown> | null;
      error: { code: string; message: string } | null;
    };
  };

  return { provider, rooms, room, sent, rosterBroadcasts, addPlayer, service, lastResponse };
}

describe('CloudflareRealtimeSfuService — Sessões Assimétricas Persistentes', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('cria apenas 1 sessão publisher para mic + screen + screen-audio e publica tela + áudio atomicamente sem polling', async () => {
    const h = createHarness();
    cleanups.push(() => h.service.stop());

    const alice = h.addPlayer('alice', 'Alice');
    h.addPlayer('bob', 'Bob');

    await h.service.handleRequest(alice.ws, {
      requestId: 'req-mic',
      action: 'publish-tracks',
      payload: {
        quality: 'balanced',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [{ kind: 'audio', mid: '0', rids: [] }],
      },
    });

    const micResp = h.lastResponse('alice', 'req-mic');
    assert.equal(micResp.ok, true);
    const pubSessionId = String(micResp.data?.sessionId);
    assert.ok(pubSessionId.startsWith('cf-session-'));

    await h.service.handleRequest(alice.ws, {
      requestId: 'req-screen',
      action: 'publish-tracks',
      payload: {
        sessionId: pubSessionId,
        quality: 'high',
        screenBitrate: 10_000_000,
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [
          { kind: 'screen', mid: '1', rids: ['f', 'h'] },
          { kind: 'screen-audio', mid: '2', rids: [] },
        ],
      },
    });

    const screenResp = h.lastResponse('alice', 'req-screen');
    assert.equal(screenResp.ok, true);
    assert.equal(screenResp.data?.sessionId, pubSessionId);

    const newSessionCalls = h.provider.requests.filter((r) => r.suffix === '/sessions/new');
    assert.equal(newSessionCalls.length, 1, 'Deve criar exatamente 1 sessão publisher');

    const getSessionCalls = h.provider.requests.filter((r) => r.method === 'GET');
    assert.equal(getSessionCalls.length, 0, 'Não deve fazer polling GET /sessions/{id}');

    const tracksNewCalls = h.provider.requests.filter((r) => r.suffix.endsWith('/tracks/new'));
    assert.equal(tracksNewCalls.length, 2);
    const atomicBatch = tracksNewCalls[1].body as { tracks: Array<{ mid: string }> };
    assert.equal(atomicBatch.tracks.length, 2);

    const bobPubBroadcasts = h.sent.filter(
      (s) => s.clientId === 'bob' && s.message.type === 'sfu-publications',
    );
    assert.equal(bobPubBroadcasts.length, 2);
    const latestPubs = bobPubBroadcasts[1].message.publications as Array<{
      kind: string;
      sessionId: string;
      mid: string;
    }>;
    assert.equal(latestPubs.length, 3);
    assert.deepEqual(
      latestPubs.map((p) => p.kind),
      ['audio', 'screen', 'screen-audio'],
    );
    assert.ok(latestPubs.every((p) => p.sessionId === pubSessionId));
  });

  it('serializa mutações concorrentes em sessionQueues evitando múltiplas sessões publisher', async () => {
    const h = createHarness();
    cleanups.push(() => h.service.stop());
    h.provider.delayMs = 20;

    const alice = h.addPlayer('alice', 'Alice');

    await Promise.all([
      h.service.handleRequest(alice.ws, {
        requestId: 'req-1',
        action: 'ensure-session',
        payload: { purpose: 'publish' },
      }),
      h.service.handleRequest(alice.ws, {
        requestId: 'req-2',
        action: 'publish-tracks',
        payload: {
          quality: 'balanced',
          sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
          tracks: [{ kind: 'audio', mid: '0', rids: [] }],
        },
      }),
    ]);

    const r1 = h.lastResponse('alice', 'req-1');
    const r2 = h.lastResponse('alice', 'req-2');
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r1.data?.sessionId, r2.data?.sessionId);
    assert.equal(h.provider.maxConcurrentCalls, 1);
    assert.equal(h.provider.requests.filter((r) => r.suffix === '/sessions/new').length, 1);
  });

  it('reutiliza 1 sessão subscriber entre múltiplas tracks remotas, renegocia e atualiza RID simulcast', async () => {
    const h = createHarness();
    cleanups.push(() => h.service.stop());

    const alice = h.addPlayer('alice', 'Alice');
    const bob = h.addPlayer('bob', 'Bob');

    await h.service.handleRequest(alice.ws, {
      requestId: 'pub-all',
      action: 'publish-tracks',
      payload: {
        quality: 'high',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [
          { kind: 'audio', mid: '0', rids: [] },
          { kind: 'screen', mid: '1', rids: ['f', 'h'] },
          { kind: 'screen-audio', mid: '2', rids: [] },
        ],
      },
    });
    assert.equal(h.lastResponse('alice', 'pub-all').ok, true);

    await h.service.handleRequest(bob.ws, {
      requestId: 'sub-audio',
      action: 'subscribe-tracks',
      payload: {
        quality: 'balanced',
        tracks: [{ publisherId: 'alice', kind: 'audio', preferredRid: null }],
      },
    });

    const subAudioResp = h.lastResponse('bob', 'sub-audio');
    assert.equal(subAudioResp.ok, true);
    const subSessionId = String(subAudioResp.data?.sessionId);
    assert.equal((subAudioResp.data?.sessionDescription as { type: string })?.type, 'offer');

    await h.service.handleRequest(bob.ws, {
      requestId: 'reneg-1',
      action: 'renegotiate',
      payload: {
        sessionId: subSessionId,
        sessionDescription: { type: 'answer', sdp: VALID_ANSWER_SDP },
      },
    });
    assert.equal(h.lastResponse('bob', 'reneg-1').ok, true);

    await h.service.handleRequest(bob.ws, {
      requestId: 'sub-screen',
      action: 'subscribe-tracks',
      payload: {
        sessionId: subSessionId,
        quality: 'high',
        tracks: [
          { publisherId: 'alice', kind: 'screen', preferredRid: 'f' },
          { publisherId: 'alice', kind: 'screen-audio', preferredRid: null },
        ],
      },
    });
    const subScreenResp = h.lastResponse('bob', 'sub-screen');
    assert.equal(subScreenResp.ok, true);
    assert.equal(subScreenResp.data?.sessionId, subSessionId);
    const subscribedTracks = subScreenResp.data?.tracks as Array<{
      mid: string;
      kind: string;
      preferredRid: string | null;
    }>;
    assert.equal(subscribedTracks.length, 2);
    const screenMid = subscribedTracks.find((t) => t.kind === 'screen')?.mid;
    assert.ok(screenMid);

    await h.service.handleRequest(bob.ws, {
      requestId: 'reneg-2',
      action: 'renegotiate',
      payload: {
        sessionId: subSessionId,
        sessionDescription: { type: 'answer', sdp: VALID_ANSWER_SDP },
      },
    });
    assert.equal(h.lastResponse('bob', 'reneg-2').ok, true);

    await h.service.handleRequest(bob.ws, {
      requestId: 'upd-rid',
      action: 'update-subscription',
      payload: {
        sessionId: subSessionId,
        mid: screenMid,
        preferredRid: 'h',
      },
    });
    const updResp = h.lastResponse('bob', 'upd-rid');
    assert.equal(updResp.ok, true);
    assert.equal(updResp.data?.preferredRid, 'h');

    const newSessions = h.provider.requests.filter((r) => r.suffix === '/sessions/new');
    assert.equal(newSessions.length, 2, '1 publisher (Alice) + 1 subscriber (Bob)');
  });

  it('unpublish-tracks fecha apenas os mids solicitados, limpa assinaturas dependentes e preserva sessão publisher', async () => {
    const h = createHarness();
    cleanups.push(() => h.service.stop());

    const alice = h.addPlayer('alice', 'Alice');
    const bob = h.addPlayer('bob', 'Bob');

    await h.service.handleRequest(alice.ws, {
      requestId: 'pub-all',
      action: 'publish-tracks',
      payload: {
        quality: 'balanced',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [
          { kind: 'audio', mid: '0', rids: [] },
          { kind: 'screen', mid: '1', rids: ['f', 'h'] },
          { kind: 'screen-audio', mid: '2', rids: [] },
        ],
      },
    });
    const alicePubId = String(h.lastResponse('alice', 'pub-all').data?.sessionId);

    await h.service.handleRequest(bob.ws, {
      requestId: 'sub-all',
      action: 'subscribe-tracks',
      payload: {
        quality: 'balanced',
        tracks: [
          { publisherId: 'alice', kind: 'audio', preferredRid: null },
          { publisherId: 'alice', kind: 'screen', preferredRid: 'h' },
          { publisherId: 'alice', kind: 'screen-audio', preferredRid: null },
        ],
      },
    });
    const bobSubId = String(h.lastResponse('bob', 'sub-all').data?.sessionId);
    await h.service.handleRequest(bob.ws, {
      requestId: 'reneg',
      action: 'renegotiate',
      payload: {
        sessionId: bobSubId,
        sessionDescription: { type: 'answer', sdp: VALID_ANSWER_SDP },
      },
    });

    await h.service.handleRequest(alice.ws, {
      requestId: 'unpub-screen',
      action: 'unpublish-tracks',
      payload: {
        sessionId: alicePubId,
        mids: ['1', '2'],
      },
    });
    assert.equal(h.lastResponse('alice', 'unpub-screen').ok, true);

    const remainingPubs = h.service.roomPublications('chat-livre');
    assert.equal(remainingPubs.length, 1);
    assert.equal(remainingPubs[0].kind, 'audio');

    assert.equal(h.provider.sessions.get(alicePubId)?.tracks.size, 1);
    assert.equal(h.provider.sessions.get(bobSubId)?.tracks.size, 1);

    await h.service.handleRequest(alice.ws, {
      requestId: 'pub-cam',
      action: 'publish-tracks',
      payload: {
        quality: 'balanced',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [{ kind: 'camera', mid: '3', rids: ['f', 'h'] }],
      },
    });
    const camResp = h.lastResponse('alice', 'pub-cam');
    assert.equal(camResp.ok, true);
    assert.equal(camResp.data?.sessionId, alicePubId);
  });

  it('aplica moderação de sala (serverMuted e mediaBlocked) e limpa cliente em cleanupClient', async () => {
    const h = createHarness();
    cleanups.push(() => h.service.stop());

    const alice = h.addPlayer('alice', 'Alice');
    const bob = h.addPlayer('bob', 'Bob');

    alice.mediaBlocked = true;
    await h.service.handleRequest(alice.ws, {
      requestId: 'blocked-screen',
      action: 'publish-tracks',
      payload: {
        quality: 'balanced',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [{ kind: 'screen', mid: '1', rids: [] }],
      },
    });
    assert.equal(h.lastResponse('alice', 'blocked-screen').ok, false);
    assert.equal(h.lastResponse('alice', 'blocked-screen').error?.code, 'VOICE_MEDIA_BLOCKED');

    alice.mediaBlocked = false;
    alice.serverMuted = true;
    await h.service.handleRequest(alice.ws, {
      requestId: 'muted-audio',
      action: 'publish-tracks',
      payload: {
        quality: 'balanced',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [{ kind: 'audio', mid: '0', rids: [] }],
      },
    });
    assert.equal(h.lastResponse('alice', 'muted-audio').ok, false);
    assert.equal(h.lastResponse('alice', 'muted-audio').error?.code, 'VOICE_MODERATED');

    alice.serverMuted = false;
    await h.service.handleRequest(alice.ws, {
      requestId: 'pub-all',
      action: 'publish-tracks',
      payload: {
        quality: 'balanced',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [
          { kind: 'audio', mid: '0', rids: [] },
          { kind: 'screen', mid: '1', rids: [] },
        ],
      },
    });
    await h.service.handleRequest(bob.ws, {
      requestId: 'sub-all',
      action: 'subscribe-tracks',
      payload: {
        quality: 'balanced',
        tracks: [
          { publisherId: 'alice', kind: 'audio', preferredRid: null },
          { publisherId: 'alice', kind: 'screen', preferredRid: null },
        ],
      },
    });
    const bobSubId = String(h.lastResponse('bob', 'sub-all').data?.sessionId);

    alice.mediaBlocked = true;
    await h.service.enforceModeration(h.room, alice);
    assert.deepEqual(
      h.service.roomPublications('chat-livre').map((p) => p.kind),
      ['audio'],
    );
    assert.equal(h.provider.sessions.get(bobSubId)?.tracks.size, 1);

    await h.service.cleanupClient('alice', 'chat-livre');
    assert.equal(h.service.roomPublications('chat-livre').length, 0);
    assert.equal(h.provider.sessions.get(bobSubId)?.tracks.size, 0);
  });

  it('aplica política de orçamento mensal (UsagePolicy) e compatibilidade com ações legadas', async () => {
    const highBlocked = createHarness({
      REALTIME_MONTHLY_BASE_GB: '860',
      REALTIME_HIGH_DISABLE_GB: '850',
      REALTIME_SCREEN_DISABLE_GB: '900',
      REALTIME_MONTHLY_HARD_LIMIT_GB: '950',
    });
    cleanups.push(() => highBlocked.service.stop());

    const alice = highBlocked.addPlayer('alice', 'Alice');
    await highBlocked.service.handleRequest(alice.ws, {
      requestId: 'high-req',
      action: 'publish-tracks',
      payload: {
        quality: 'high',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [{ kind: 'screen', mid: '1', rids: ['f', 'h'] }],
      },
    });
    assert.equal(highBlocked.lastResponse('alice', 'high-req').ok, false);
    assert.equal(highBlocked.lastResponse('alice', 'high-req').error?.code, 'HIGH_BUDGET_BLOCKED');

    const screenBlocked = createHarness({
      REALTIME_MONTHLY_BASE_GB: '910',
      REALTIME_HIGH_DISABLE_GB: '850',
      REALTIME_SCREEN_DISABLE_GB: '900',
      REALTIME_MONTHLY_HARD_LIMIT_GB: '950',
    });
    cleanups.push(() => screenBlocked.service.stop());

    const carol = screenBlocked.addPlayer('carol', 'Carol');
    await screenBlocked.service.handleRequest(carol.ws, {
      requestId: 'screen-req',
      action: 'publish-tracks',
      payload: {
        quality: 'balanced',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
        tracks: [{ kind: 'screen', mid: '1', rids: [] }],
      },
    });
    assert.equal(screenBlocked.lastResponse('carol', 'screen-req').ok, false);
    assert.equal(
      screenBlocked.lastResponse('carol', 'screen-req').error?.code,
      'SCREEN_BUDGET_BLOCKED',
    );

    // Compatibilidade legada: publish-track + publication-ready sem polling + subscribe-track
    const legacy = createHarness();
    cleanups.push(() => legacy.service.stop());

    const pubUser = legacy.addPlayer('pub1', 'Pub');
    const subUser = legacy.addPlayer('sub1', 'Sub');

    await legacy.service.handleRequest(pubUser.ws, {
      requestId: 'leg-pub',
      action: 'publish-track',
      payload: {
        kind: 'audio',
        mid: '0',
        quality: 'balanced',
        sessionDescription: { type: 'offer', sdp: VALID_OFFER_SDP },
      },
    });
    const legPubResp = legacy.lastResponse('pub1', 'leg-pub');
    assert.equal(legPubResp.ok, true);
    const legSessionId = String(legPubResp.data?.sessionId);

    await legacy.service.handleRequest(pubUser.ws, {
      requestId: 'leg-ready',
      action: 'publication-ready',
      payload: { sessionId: legSessionId },
    });
    const legReadyResp = legacy.lastResponse('pub1', 'leg-ready');
    assert.equal(legReadyResp.ok, true);
    assert.equal(legReadyResp.data?.ready, true);
    assert.equal(legacy.provider.requests.filter((r) => r.method === 'GET').length, 0);

    await legacy.service.handleRequest(subUser.ws, {
      requestId: 'leg-sub',
      action: 'subscribe-track',
      payload: { publisherId: 'pub1', kind: 'audio', quality: 'balanced' },
    });
    const legSubResp = legacy.lastResponse('sub1', 'leg-sub');
    assert.equal(legSubResp.ok, true);
    assert.ok(legSubResp.data?.mid);
  });
});
