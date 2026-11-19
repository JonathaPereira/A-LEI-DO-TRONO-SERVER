import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudflareSfuExecutionAdapter,
  type PeerConnectionLike,
  type RtpTransceiverLike,
  type SignalingTransportLike,
} from '../../packages/voice-engine/src/adapters/cloudflare-sfu/CloudflareSfuExecutionAdapter.ts';
import { VoiceEngineController } from '../../packages/voice-engine/src/runtime/VoiceEngineController.ts';
import { SourceLifecycleRegistry } from '../../packages/voice-engine/src/source-isolation/SourceLifecycleRegistry.ts';
import {
  SCREEN_SHARE_KEEPALIVE_ATTR,
  SCREEN_SHARE_KEEPALIVE_VALUE,
  type KeepAliveDocumentLike,
  type KeepAliveVideoElementLike,
  type ScreenCodecCapability,
} from '../../packages/voice-engine/src/adapters/screen-share/ScreenShareTrackPlumbing.ts';
import type { DisplayMediaDevicesLike } from '../../packages/voice-engine/src/adapters/screen-share/DisplayMediaCapture.ts';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeMediaTrack {
  readonly id: string;
  readonly kind: 'audio' | 'video';
  readyState: 'live' | 'ended' = 'live';
  contentHint = '';
  enabled = true;
  stopped = false;

  constructor(id: string, kind: 'audio' | 'video') {
    this.id = id;
    this.kind = kind;
  }

  stop() {
    this.stopped = true;
    this.readyState = 'ended';
  }
}

class FakeKeepAliveDocument implements KeepAliveDocumentLike {
  readonly children: FakeKeepAliveVideo[] = [];
  readonly body = {
    appendChild: (node: KeepAliveVideoElementLike) => {
      const video = node as FakeKeepAliveVideo;
      video.parentNode = this.body;
      this.children.push(video);
      return video;
    },
    removeChild: (node: KeepAliveVideoElementLike) => {
      const idx = this.children.indexOf(node as FakeKeepAliveVideo);
      if (idx >= 0) this.children.splice(idx, 1);
      (node as FakeKeepAliveVideo).parentNode = null;
      return node;
    },
  };

  createElement(tagName: string): KeepAliveVideoElementLike {
    return new FakeKeepAliveVideo(tagName, this.body);
  }

  querySelector(selector: string): KeepAliveVideoElementLike | null {
    if (selector.includes(SCREEN_SHARE_KEEPALIVE_VALUE)) {
      return (
        this.children.find(
          (el) => el.attributes.get(SCREEN_SHARE_KEEPALIVE_ATTR) === SCREEN_SHARE_KEEPALIVE_VALUE,
        ) ?? null
      );
    }
    return null;
  }
}

class FakeKeepAliveVideo implements KeepAliveVideoElementLike {
  readonly tagName: string;
  readonly style: Record<string, string | undefined> = {};
  readonly attributes = new Map<string, string>();
  muted = false;
  playsInline = false;
  autoplay = false;
  srcObject: unknown = null;
  parentNode: { removeChild?: (node: KeepAliveVideoElementLike) => unknown } | null;

  constructor(
    tagName: string,
    parentNode: { removeChild?: (node: KeepAliveVideoElementLike) => unknown } | null,
  ) {
    this.tagName = tagName.toUpperCase();
    this.parentNode = parentNode;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  play() {}
  pause() {}
  remove() {
    this.parentNode?.removeChild?.(this);
  }
}

class FakeRTCPeerConnection implements PeerConnectionLike {
  readonly iceServers: unknown;
  signalingState: 'stable' | 'have-local-offer' | 'have-remote-offer' | 'closed' = 'stable';
  localDescription: { type: 'offer' | 'answer'; sdp: string } | null = null;
  remoteDescription: { type: 'offer' | 'answer'; sdp: string } | null = null;
  ontrack:
    | ((event: {
        track: FakeMediaTrack;
        transceiver: RtpTransceiverLike;
        streams: unknown[];
      }) => void)
    | null = null;
  closed = false;

  readonly transceivers: Array<
    RtpTransceiverLike & {
      kind: 'audio' | 'video';
      codecPreferences?: ScreenCodecCapability[];
      setParametersCalls: unknown[];
      replaceTrackCalls: unknown[];
    }
  > = [];

  private nextMid = 0;
  private pendingTransceivers: typeof this.transceivers = [];

  constructor(config: RTCConfiguration = {}) {
    this.iceServers = config.iceServers;
  }

  addTransceiver(
    trackOrKind: FakeMediaTrack | 'audio' | 'video',
    init?: { direction?: string; sendEncodings?: Array<Record<string, unknown>> },
  ): RtpTransceiverLike {
    const kind = typeof trackOrKind === 'string' ? trackOrKind : trackOrKind.kind;
    let currentTrack: FakeMediaTrack | null = typeof trackOrKind === 'string' ? null : trackOrKind;
    let currentParams: {
      encodings: Array<Record<string, unknown>>;
      degradationPreference?: string;
    } = {
      encodings: init?.sendEncodings?.length ? init.sendEncodings.map((e) => ({ ...e })) : [{}],
    };

    const setParametersCalls: unknown[] = [];
    const replaceTrackCalls: unknown[] = [];

    const sender = {
      get track() {
        return currentTrack;
      },
      getParameters() {
        return {
          ...currentParams,
          encodings: currentParams.encodings.map((e) => ({ ...e })),
        };
      },
      async setParameters(next: {
        encodings?: Array<Record<string, unknown>>;
        degradationPreference?: string;
      }) {
        setParametersCalls.push(next);
        currentParams = {
          ...next,
          encodings: (next.encodings ?? [{}]).map((e) => ({ ...e })),
        };
      },
      async replaceTrack(nextTrack: FakeMediaTrack | null) {
        replaceTrackCalls.push(nextTrack);
        currentTrack = nextTrack;
      },
    };

    const transceiver: (typeof this.transceivers)[number] = {
      kind,
      mid: null,
      direction:
        (init?.direction as 'sendonly' | 'recvonly' | 'sendrecv' | 'inactive') ?? 'sendonly',
      sender,
      receiver: { track: new FakeMediaTrack(`recv-${this.nextMid}`, kind) },
      setParametersCalls,
      replaceTrackCalls,
      setCodecPreferences(codecs: ScreenCodecCapability[]) {
        transceiver.codecPreferences = codecs;
      },
    };

    this.transceivers.push(transceiver);
    this.pendingTransceivers.push(transceiver);
    return transceiver;
  }

  async createOffer() {
    assert.equal(
      this.signalingState,
      'stable',
      `createOffer called with invalid signalingState=${this.signalingState}`,
    );
    return {
      type: 'offer' as const,
      sdp: `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n`,
    };
  }

  async createAnswer() {
    assert.equal(
      this.signalingState,
      'have-remote-offer',
      `createAnswer called with invalid signalingState=${this.signalingState}`,
    );
    return {
      type: 'answer' as const,
      sdp: `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n`,
    };
  }

  async setLocalDescription(
    desc: { type: 'offer' | 'answer'; sdp: string } | { type: 'rollback' },
  ) {
    if (desc.type === 'rollback') {
      assert.equal(this.signalingState, 'have-local-offer');
      this.signalingState = 'stable';
      this.localDescription = null;
      return;
    }
    if (desc.type === 'offer') {
      assert.equal(this.signalingState, 'stable');
      for (const tr of this.pendingTransceivers) {
        tr.mid = String(this.nextMid++);
      }
      this.pendingTransceivers = [];
      this.signalingState = 'have-local-offer';
    } else {
      assert.equal(this.signalingState, 'have-remote-offer');
      this.signalingState = 'stable';
    }
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: { type: 'offer' | 'answer'; sdp: string }) {
    if (desc.type === 'answer') {
      assert.equal(
        this.signalingState,
        'have-local-offer',
        `setRemoteDescription(answer) invalid signalingState=${this.signalingState}`,
      );
      this.signalingState = 'stable';
      this.remoteDescription = desc;
      return;
    }

    assert.equal(
      this.signalingState,
      'stable',
      `setRemoteDescription(offer) invalid signalingState=${this.signalingState}`,
    );
    this.signalingState = 'have-remote-offer';
    this.remoteDescription = desc;

    // Simula disparo de ontrack para cada m-line do offer de assinatura
    const midMatches = [...desc.sdp.matchAll(/a=mid:([^\r\n]+)/g)];
    for (const match of midMatches) {
      const mid = match[1];
      const kind: 'audio' | 'video' = desc.sdp.includes(`mid:${mid}:audio`) ? 'audio' : 'video';
      const track = new FakeMediaTrack(`remote-${mid}`, kind);
      const transceiver = this.addTransceiver(kind, { direction: 'recvonly' });
      transceiver.mid = mid;
      this.pendingTransceivers = this.pendingTransceivers.filter((item) => item !== transceiver);
      this.ontrack?.({
        track,
        transceiver,
        streams: [{ id: `stream-${mid}` }],
      });
    }
  }

  close() {
    this.closed = true;
    this.signalingState = 'closed';
  }
}

const SAMPLE_CAPABILITIES: ScreenCodecCapability[] = [
  { mimeType: 'video/VP8', clockRate: 90000 },
  { mimeType: 'video/rtx', clockRate: 90000 },
  { mimeType: 'video/H264', clockRate: 90000, sdpFmtpLine: 'profile-level-id=640032' },
  { mimeType: 'video/rtx', clockRate: 90000 },
  { mimeType: 'video/H264', clockRate: 90000, sdpFmtpLine: 'profile-level-id=42e01f' },
  { mimeType: 'video/rtx', clockRate: 90000 },
  { mimeType: 'video/VP9', clockRate: 90000, sdpFmtpLine: 'profile-id=0' },
  { mimeType: 'video/rtx', clockRate: 90000 },
];

function createFakeSignaling(
  options: {
    onRequest?: (action: string, payload: Record<string, unknown>) => Promise<void> | void;
  } = {},
): {
  signaling: SignalingTransportLike;
  requests: Array<{ action: string; payload: Record<string, unknown> }>;
} {
  const requests: Array<{ action: string; payload: Record<string, unknown> }> = [];
  let subMidSeq = 10;

  const signaling: SignalingTransportLike = {
    async request(action, payload) {
      requests.push({ action, payload });
      await options.onRequest?.(action, payload);

      switch (action) {
        case 'ice-config':
          return { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] } as never;
        case 'ensure-session': {
          const purpose = payload.purpose as 'publish' | 'subscribe';
          return {
            sessionId: purpose === 'publish' ? 'cf-pub-session-1' : 'cf-sub-session-1',
            purpose,
            reused: false,
          } as never;
        }
        case 'publish-tracks': {
          const tracks = payload.tracks as Array<{ kind: string; mid: string; rids: string[] }>;
          return {
            sessionId: (payload.sessionId as string) || 'cf-pub-session-1',
            sessionDescription: {
              type: 'answer',
              sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
            },
            publications: tracks.map((tr) => ({
              ownerId: 'user-1',
              ownerName: 'User 1',
              roomId: 'room-1',
              kind: tr.kind,
              sessionId: 'cf-pub-session-1',
              trackName: `${tr.kind}-track-${tr.mid}`,
              mid: tr.mid,
              quality: 'high',
              screenBitrate: null,
              rids: tr.rids,
              createdAt: Date.now(),
            })),
          } as never;
        }
        case 'unpublish-tracks':
          return {
            closed: true,
            sessionId: payload.sessionId,
            mids: payload.mids,
          } as never;
        case 'subscribe-tracks': {
          const tracks = payload.tracks as Array<{
            publisherId: string;
            kind: string;
            preferredRid: string | null;
          }>;
          const mapped = tracks.map((tr) => {
            const mid = String(subMidSeq++);
            return {
              mid,
              publisherId: tr.publisherId,
              publisherSessionId: 'cf-pub-remote-1',
              trackName: `${tr.publisherId}-${tr.kind}`,
              kind: tr.kind,
              preferredRid: tr.preferredRid,
            };
          });
          const midLines = mapped
            .map((m) => {
              const mediaType = m.kind === 'audio' || m.kind === 'screen-audio' ? 'audio' : 'video';
              return `a=mid:${m.mid}\r\na=x-kind:mid:${m.mid}:${mediaType}`;
            })
            .join('\r\n');
          return {
            sessionId: (payload.sessionId as string) || 'cf-sub-session-1',
            sessionDescription: {
              type: 'offer',
              sdp: `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n${midLines}\r\n`,
            },
            requiresImmediateRenegotiation: true,
            tracks: mapped,
          } as never;
        }
        case 'renegotiate':
          return { accepted: true, sessionId: payload.sessionId, result: {} } as never;
        case 'update-subscription':
          return {
            preferredRid: payload.preferredRid,
            mid: payload.mid,
            simulcast: true,
          } as never;
        case 'close-subscription':
        case 'close-session':
          return { closed: true } as never;
        default:
          throw new Error(`Unexpected signaling action: ${action}`);
      }
    },
  };

  return { signaling, requests };
}

describe('@trono/voice-engine — CloudflareSfuExecutionAdapter (Integração)', () => {
  it('cria no máximo 2 RTCPeerConnections (1 Publisher + 1 Subscriber) e publica screen + screen-audio juntos', async () => {
    const createdPcs: FakeRTCPeerConnection[] = [];
    const keepAliveDoc = new FakeKeepAliveDocument();
    const captureRegistry = new SourceLifecycleRegistry();
    const { signaling, requests } = createFakeSignaling();
    const screenVideo = new FakeMediaTrack('scr-vid-1', 'video');
    const screenAudio = new FakeMediaTrack('scr-aud-1', 'audio');
    const remoteEvents: Array<{ participantId: string; kind: string; mid: string }> = [];

    const mediaDevices: DisplayMediaDevicesLike & {
      getUserMedia: (c: { audio?: unknown; video?: unknown }) => Promise<{
        getTracks: () => FakeMediaTrack[];
        getAudioTracks: () => FakeMediaTrack[];
        getVideoTracks: () => FakeMediaTrack[];
      }>;
    } = {
      async getDisplayMedia() {
        return {
          getTracks: () => [screenVideo, screenAudio],
          getVideoTracks: () => [screenVideo],
          getAudioTracks: () => [screenAudio],
        };
      },
      async getUserMedia(constraints) {
        const tracks = constraints.audio
          ? [new FakeMediaTrack('mic-1', 'audio')]
          : [new FakeMediaTrack('cam-1', 'video')];
        return {
          getTracks: () => tracks,
          getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
          getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
        };
      },
    };

    const adapter = new CloudflareSfuExecutionAdapter({
      signaling,
      createPeerConnection: (config) => {
        const pc = new FakeRTCPeerConnection(config);
        createdPcs.push(pc);
        return pc;
      },
      mediaDevices,
      captureRegistry,
      keepAliveDoc,
      getCodecCapabilities: () => SAMPLE_CAPABILITIES,
      onRemoteTrack: (info) => {
        remoteEvents.push({
          participantId: info.participantId,
          kind: info.kind,
          mid: info.mid,
        });
      },
    });

    const startTime = Date.now();
    const conn = await adapter.connect({
      roomId: 'room-1',
      participantId: 'user-1',
      quality: 'high',
    });
    assert.equal(conn.publisherSessionId, 'cf-pub-session-1');
    assert.equal(conn.subscriberSessionId, 'cf-sub-session-1');
    assert.equal(createdPcs.length, 2);

    await adapter.startMicrophone({ options: { echoCancellation: true } });
    await adapter.startCamera({ options: { width: 1280, height: 720, frameRate: 30 } });

    const screenPub = await adapter.startScreenShare({
      captureId: 'cap-1',
      options: {
        width: 1920,
        height: 1080,
        frameRate: 60,
        maxBitrateBps: 8_000_000,
        codec: 'h264',
        contentHint: 'motion',
        captureAudio: true,
      },
    });
    assert.ok(Date.now() - startTime < 500, 'Publicação não deve esperar 1400ms de ICE gather');
    assert.equal(screenPub.trackId, 'scr-vid-1');

    // Publicação atômica de screen + screen-audio em 1 único publish-tracks
    const screenPublishReq = requests.find(
      (req) =>
        req.action === 'publish-tracks' &&
        Array.isArray(req.payload.tracks) &&
        (req.payload.tracks as Array<{ kind: string }>).some((t) => t.kind === 'screen'),
    );
    assert.ok(screenPublishReq);
    const pubTracks = screenPublishReq.payload.tracks as Array<{ kind: string; mid: string }>;
    assert.deepEqual(
      pubTracks.map((t) => t.kind),
      ['screen', 'screen-audio'],
    );
    const sdp = (screenPublishReq.payload.sessionDescription as { sdp: string }).sdp;
    assert.equal(sdp.includes('x-google-'), false);

    // startScreenAudio subsequente para o mesmo captureId reaproveita a publicação atômica
    const publishCountBefore = requests.filter((r) => r.action === 'publish-tracks').length;
    const saPub = await adapter.startScreenAudio({
      captureId: 'cap-1',
      options: {},
    });
    assert.equal(saPub.trackId, 'scr-aud-1');
    assert.equal(requests.filter((r) => r.action === 'publish-tracks').length, publishCountBefore);

    // Keep-alive <video 2x2> presente no DOM
    assert.equal(keepAliveDoc.children.length, 1);
    assert.equal(keepAliveDoc.children[0].style.width, '2px');
    assert.equal(keepAliveDoc.children[0].style.height, '2px');
    assert.equal(keepAliveDoc.children[0].muted, true);

    // Codec H264 42e0 priorizado mantendo video/rtx adjacente
    const screenTransceiver = createdPcs[0].transceivers.find(
      (t) => t.sender.track?.id === 'scr-vid-1',
    );
    assert.ok(screenTransceiver?.codecPreferences);
    assert.equal(screenTransceiver.codecPreferences[0].sdpFmtpLine, 'profile-level-id=42e01f');
    assert.equal(screenTransceiver.codecPreferences[1].mimeType, 'video/rtx');
    assert.ok(screenTransceiver.setParametersCalls.length >= 1);

    // Assinatura de 2 tracks remotas reutilizando o mesmo subscriberPc
    await adapter.subscribeTrack({ participantId: 'user-2', kind: 'audio', preferredRid: null });
    await adapter.subscribeTrack({ participantId: 'user-3', kind: 'screen', preferredRid: 'f' });

    assert.equal(createdPcs.length, 2, 'Nunca deve criar mais que 2 RTCPeerConnections');
    assert.deepEqual(
      remoteEvents.map((e) => `${e.participantId}:${e.kind}`),
      ['user-2:audio', 'user-3:screen'],
    );

    await adapter.disconnect({ roomId: 'room-1' });
    assert.equal(keepAliveDoc.children.length, 0);
    assert.equal(createdPcs[0].closed, true);
    assert.equal(createdPcs[1].closed, true);
    assert.equal(screenVideo.stopped, true);
    assert.equal(screenAudio.stopped, true);
  });

  it('atualiza encoding dinamicamente, republica ao trocar codec e limpa recursos ao parar tela', async () => {
    const createdPcs: FakeRTCPeerConnection[] = [];
    const keepAliveDoc = new FakeKeepAliveDocument();
    const captureRegistry = new SourceLifecycleRegistry();
    const { signaling, requests } = createFakeSignaling();
    const screenVideo = new FakeMediaTrack('scr-vid-2', 'video');

    const screenAudio = new FakeMediaTrack('game-audio', 'audio');
    const adapter = new CloudflareSfuExecutionAdapter({
      signaling,
      createPeerConnection: (config) => {
        const pc = new FakeRTCPeerConnection(config);
        createdPcs.push(pc);
        return pc;
      },
      mediaDevices: {
        async getDisplayMedia() {
          return {
            getTracks: () => [screenVideo, screenAudio],
            getVideoTracks: () => [screenVideo],
            getAudioTracks: () => [screenAudio],
          };
        },
      },
      captureRegistry,
      keepAliveDoc,
      getCodecCapabilities: () => SAMPLE_CAPABILITIES,
    });

    await adapter.connect({ roomId: 'room-2', participantId: 'user-1', quality: 'high' });
    await adapter.startScreenShare({
      captureId: 'cap-2',
      options: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        maxBitrateBps: 4_000_000,
        codec: 'h264',
        contentHint: 'motion',
        captureAudio: true,
      },
    });

    const audioPublication = adapter.getLocalPublication('screen-audio');
    assert.ok(audioPublication);
    const pubCountAfterStart = requests.filter((r) => r.action === 'publish-tracks').length;

    // Update dinâmico de FPS/bitrate/contentHint sem republicar
    await adapter.updateScreenEncoding({
      captureId: 'cap-2',
      options: {
        width: 1280,
        height: 720,
        frameRate: 60,
        maxBitrateBps: 6_000_000,
        contentHint: 'detail',
      },
    });
    assert.equal(requests.filter((r) => r.action === 'publish-tracks').length, pubCountAfterStart);
    assert.equal(screenVideo.contentHint, 'detail');

    const firstTransceiver = createdPcs[0].transceivers[0];
    assert.ok(firstTransceiver.setParametersCalls.length >= 2);
    const lastParams = firstTransceiver.setParametersCalls.at(-1) as {
      degradationPreference: string;
      encodings: Array<{ maxBitrate?: number; maxFramerate?: number }>;
    };
    assert.equal(lastParams.degradationPreference, 'maintain-resolution');
    assert.equal(lastParams.encodings[0].maxBitrate, 6_000_000);
    assert.equal(lastParams.encodings[0].maxFramerate, 60);

    // Republicação por troca de codec preserva track viva e unpublica mid anterior
    await adapter.republishScreenShare({
      captureId: 'cap-2',
      previousOptions: { codec: 'h264' },
      options: {
        width: 1280,
        height: 720,
        frameRate: 60,
        maxBitrateBps: 6_000_000,
        codec: 'vp9',
      },
    });

    assert.equal(screenVideo.stopped, false);
    assert.equal(requests.filter((r) => r.action === 'unpublish-tracks').length, 1);
    assert.equal(
      requests.filter((r) => r.action === 'publish-tracks').length,
      pubCountAfterStart + 1,
    );
    assert.equal(adapter.getLocalPublication('screen-audio'), audioPublication);
    assert.equal(screenAudio.readyState, 'live');
    const secondTransceiver = createdPcs[0].transceivers.at(-1);
    assert.equal(secondTransceiver?.codecPreferences?.[0]?.mimeType, 'video/VP9');

    // Parar compartilhamento limpa keep-alive, track e publica unpublish-tracks
    await adapter.stopScreenShare({ captureId: 'cap-2' });
    assert.equal(keepAliveDoc.children.length, 0);
    assert.equal(screenVideo.stopped, true);
    assert.equal(screenAudio.stopped, true);
    assert.equal(requests.filter((r) => r.action === 'unpublish-tracks').length, 2);
    assert.equal(createdPcs.length, 2);
  });

  it('serializa mutações SDP concorrentes no publisherPc e subscriberPc sem colisão de signalingState', async () => {
    const pubGate = deferred<void>();
    const subGate = deferred<void>();
    let firstPubBlocked = false;
    let firstSubBlocked = false;

    const { signaling } = createFakeSignaling({
      async onRequest(action) {
        if (action === 'publish-tracks' && !firstPubBlocked) {
          firstPubBlocked = true;
          await pubGate.promise;
        }
        if (action === 'subscribe-tracks' && !firstSubBlocked) {
          firstSubBlocked = true;
          await subGate.promise;
        }
      },
    });

    const adapter = new CloudflareSfuExecutionAdapter({
      signaling,
      createPeerConnection: (config) => new FakeRTCPeerConnection(config),
      mediaDevices: {
        async getDisplayMedia() {
          return { getTracks: () => [], getVideoTracks: () => [], getAudioTracks: () => [] };
        },
        async getUserMedia(constraints) {
          const tracks = constraints.audio
            ? [new FakeMediaTrack('mic-conc', 'audio')]
            : [new FakeMediaTrack('cam-conc', 'video')];
          return {
            getTracks: () => tracks,
            getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
            getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
          };
        },
      },
    });

    await adapter.connect({ roomId: 'room-3', participantId: 'user-1', quality: 'balanced' });

    const pMic = adapter.startMicrophone({ options: {} });
    const pCam = adapter.startCamera({ options: {} });
    const pSub1 = adapter.subscribeTrack({
      participantId: 'user-2',
      kind: 'audio',
      preferredRid: null,
    });
    const pSub2 = adapter.subscribeTrack({
      participantId: 'user-2',
      kind: 'camera',
      preferredRid: 'h',
    });

    await Promise.resolve();
    pubGate.resolve();
    subGate.resolve();

    await Promise.all([pMic, pCam, pSub1, pSub2]);
  });

  it('recupera uma publicação recusada e conserva a captura emprestada ao desligar o SFU', async () => {
    let first = true;
    const { signaling, requests } = createFakeSignaling({
      onRequest(action) {
        if (action === 'publish-tracks' && first) {
          first = false;
          throw new Error('Publicação recusada');
        }
      },
    });
    const video = Object.assign(new FakeMediaTrack('jogo', 'video'), {
      getSettings: () => ({ width: 1920, height: 1080, frameRate: 60 }),
    });
    const peers: FakeRTCPeerConnection[] = [];
    const adapter = new CloudflareSfuExecutionAdapter({
      signaling,
      borrowInputTracks: true,
      createPeerConnection(config) {
        const peer = new FakeRTCPeerConnection(config);
        peers.push(peer);
        return peer;
      },
    });
    await adapter.connect({ roomId: 'room-3', participantId: 'user-1', quality: 'balanced' });
    const screen = {
      captureId: 'game',
      videoTrack: video,
      options: { width: 1280, height: 720, frameRate: 60, maxBitrateBps: 4_000_000 },
    };
    await assert.rejects(adapter.startScreenShare(screen), /Publicação recusada/);
    assert.equal(peers[0].transceivers[0].sender.track, null);
    assert.equal(video.readyState, 'live');
    await adapter.startScreenShare(screen);
    const [encoding] = peers[0].transceivers.at(-1)!.sender.getParameters().encodings;
    assert.equal(encoding.scaleResolutionDownBy, 1.5);
    assert.equal(encoding.maxFramerate, 60);
    assert.equal(encoding.maxBitrate, 4_000_000);
    const publish = requests.filter((call) => call.action === 'publish-tracks').at(-1);
    assert.deepEqual(publish?.payload.tracks, [
      { kind: 'screen', mid: adapter.getLocalPublication('screen')?.mid, rids: [] },
    ]);
    await adapter.disconnect({ roomId: 'room-3' });
    assert.equal(video.readyState, 'live');
    assert.equal(peers.length, 2);
  });

  it('atualiza layer simulcast sem renegociar SDP e encerra assinatura via close-subscription', async () => {
    const { signaling, requests } = createFakeSignaling();
    const ended: Array<{ participantId: string; kind: string }> = [];

    const adapter = new CloudflareSfuExecutionAdapter({
      signaling,
      createPeerConnection: (config) => new FakeRTCPeerConnection(config),
      onRemoteTrackEnded: (info) => {
        ended.push({ participantId: info.participantId, kind: info.kind });
      },
    });

    const controller = new VoiceEngineController(adapter.hostPorts);
    await controller.connect({ roomId: 'room-4', participantId: 'user-1', quality: 'high' });

    await controller.setRemoteTrackSubscription({
      participantId: 'user-2',
      kind: 'screen',
      subscribed: true,
      preferredRid: 'f',
    });
    assert.equal(requests.filter((r) => r.action === 'subscribe-tracks').length, 1);

    // Troca apenas preferredRid -> usa update-subscription sem novo subscribe-tracks
    await controller.setRemoteTrackSubscription({
      participantId: 'user-2',
      kind: 'screen',
      subscribed: true,
      preferredRid: 'h',
    });
    assert.equal(requests.filter((r) => r.action === 'subscribe-tracks').length, 1);
    assert.equal(requests.filter((r) => r.action === 'update-subscription').length, 1);

    await controller.setRemoteTrackSubscription({
      participantId: 'user-2',
      kind: 'screen',
      subscribed: false,
    });
    assert.equal(requests.filter((r) => r.action === 'close-subscription').length, 1);
    assert.deepEqual(ended, [{ participantId: 'user-2', kind: 'screen' }]);
  });
});
