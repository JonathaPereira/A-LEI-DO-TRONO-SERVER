import {
  isSfuMediaKind,
  isSfuQualityPreset,
  isSfuSimulcastRid,
  isValidSdpDescription,
  parseSfuRequestMessage,
  validatePublishTracksPayload,
  validateRenegotiatePayload,
  validateSubscribeTracksPayload,
  validateUnpublishTracksPayload,
  validateUpdateSubscriptionPayload,
  type PublishTracksPayload,
  type SdpDescription,
  type SfuClientAction,
  type SfuMediaKind,
  type SfuPublicationDescriptor,
  type SfuQualityPreset,
  type SfuSessionPurpose,
  type SfuSimulcastRid,
  type SubscribeTracksPayload,
  type UnpublishTracksPayload,
} from '@trono/protocol';
import {
  CloudflareCallsClient,
  isPlainObject,
  providerUnavailable,
  sfuFailure,
  type CloudflareCallsProvider,
  type CloudflareProviderResponse,
} from './CloudflareCallsClient.ts';
import { TurnIceService, type IceConfiguration } from './TurnIceService.ts';
import {
  PROFILE,
  assertSfuAvailable,
  clampRealtimeQuality,
  clampRealtimeRid,
  computeRealtimePolicy,
  createRealtimeUsage,
  readRealtimeSettings,
  subscriptionBitrate,
  type RealtimePolicy,
  type RealtimeSettings,
  type RealtimeUsage,
  type UsageMeter,
} from './UsagePolicy.ts';

export interface SfuConnection {
  clientId: string;
  roomId?: string | null;
}

export interface SfuPlayer {
  id: string;
  name: string;
  ws: SfuConnection;
  voiceJoined?: boolean;
  serverMuted?: boolean;
  mediaBlocked?: boolean;
  mediaTransport?: string;
  transmissionQuality?: SfuQualityPreset;
}

export interface SfuRoom {
  id: string;
  kind: 'chat' | 'game';
  channelType?: string;
  voiceMode?: string | null;
  players: ReadonlyMap<string, SfuPlayer>;
}

export interface SfuSessionRecord {
  sessionId: string;
  ownerId: string;
  roomId: string;
  purpose: SfuSessionPurpose;
  createdAt: number;
  pendingAnswer: boolean;
}

export interface SfuPublication extends SfuPublicationDescriptor {
  ready: boolean;
}

export interface SfuSubscription {
  sessionId: string;
  ownerId: string;
  roomId: string;
  publisherId: string;
  publisherSessionId: string;
  trackName: string;
  kind: SfuMediaKind;
  mid: string;
  preferredRid: SfuSimulcastRid | null;
  estimatedBps: number;
  createdAt: number;
}

interface ParticipantSessionState {
  roomId: string;
  ownerId: string;
  publisherSessionId: string | null;
  subscriberSessionId: string | null;
}

interface RequestContext {
  ws: SfuConnection;
  room: SfuRoom;
  player: SfuPlayer;
  signal: AbortSignal;
  ensureCurrent: () => void;
}

interface RemoteTrackRequest {
  location: 'remote';
  sessionId: string;
  trackName: string;
  simulcast?: {
    preferredRid: SfuSimulcastRid;
    priorityOrdering: 'asciibetical';
    ridNotAvailable: 'asciibetical';
  };
}

export interface CloudflareRealtimeSfuServiceOptions {
  rooms: ReadonlyMap<string, SfuRoom>;
  send(ws: SfuConnection, message: { type: string; [key: string]: unknown }): void;
  broadcastVoiceRoster(room: SfuRoom): void;
  version?: string;
  env?: NodeJS.ProcessEnv;
  usageFile?: string;
  fetchImpl?: typeof fetch;
  provider?: CloudflareCallsProvider;
  now?: () => number;
}

const DEFAULT_STUN_FALLBACK = {
  iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
  turn: false,
  warning: 'TURN indisponível; usando STUN.',
};

const ALLOWED_SCREEN_BITRATES = new Set([
  4_000_000, 6_000_000, 8_000_000, 10_000_000, 12_000_000, 15_000_000, 18_000_000,
]);

function contextKeyOf(roomId: string, clientId: string): string {
  return `${roomId}:${clientId}`;
}

function subscriptionKeyOf(sessionId: string, mid: string): string {
  return `${sessionId}:${mid}`;
}

function publicationKeyOf(ownerId: string, kind: SfuMediaKind): string {
  return `${ownerId}:${kind}`;
}

/**
 * Backend service for Cloudflare Realtime SFU using Asymmetric Persistent Sessions:
 * at most 1 publisherSessionId and 1 subscriberSessionId per participant per room call.
 */
export class CloudflareRealtimeSfuService {
  private readonly settings: RealtimeSettings;
  private readonly rooms: ReadonlyMap<string, SfuRoom>;
  private readonly send: CloudflareRealtimeSfuServiceOptions['send'];
  private readonly broadcastVoiceRoster: CloudflareRealtimeSfuServiceOptions['broadcastVoiceRoster'];
  private readonly version: string;
  private readonly now: () => number;
  private readonly ice: TurnIceService;
  private readonly calls: CloudflareCallsClient;
  private readonly usageMeter: UsageMeter;
  private readonly timer: NodeJS.Timeout;

  private readonly scope = new AbortController();
  private readonly clientScopes = new Map<string, AbortController>();
  private readonly participantSessions = new Map<string, ParticipantSessionState>();
  private readonly sessionQueues = new Map<string, Promise<void>>();
  private readonly publicationsByRoom = new Map<string, Map<string, SfuPublication>>();
  private readonly pendingPublishers = new Map<string, Map<string, Set<object>>>();

  readonly sessions = new Map<string, SfuSessionRecord>();
  readonly subscriptions = new Map<string, SfuSubscription>();

  private trackNameSeq = 0;
  private lastPolicySignature = '';
  private lastRestrictionSignature = '';
  private enforcementRunning = false;
  private closed = false;
  private stopPromise?: Promise<void>;

  constructor({
    rooms,
    send,
    broadcastVoiceRoster,
    version = '0.14.0-alpha',
    fetchImpl = fetch,
    env = process.env,
    usageFile = env.REALTIME_USAGE_FILE || '/tmp/a_lei_do_trono_realtime_usage.json',
    provider,
    now = Date.now,
  }: CloudflareRealtimeSfuServiceOptions) {
    this.rooms = rooms;
    this.send = send;
    this.broadcastVoiceRoster = broadcastVoiceRoster;
    this.version = version;
    this.now = now;
    this.settings = readRealtimeSettings(env);
    this.calls = new CloudflareCallsClient({
      appId: this.settings.appId,
      token: this.settings.token,
      fetchImpl,
      provider,
    });
    this.ice = new TurnIceService({
      enabled: this.settings.turnEnabled,
      keyId: this.settings.turnKeyId,
      token: this.settings.turnToken,
      ttl: this.settings.turnTtl,
      fetchImpl,
      now,
    });
    this.usageMeter = createRealtimeUsage({ file: usageFile, now });
    this.timer = setInterval(() => this._tick(), 5_000);
    this.timer.unref?.();
  }

  get usage(): RealtimeUsage {
    return this.usageMeter.state;
  }

  configured(): boolean {
    return !!(this.settings.appId && this.settings.token);
  }

  turnConfigured(): boolean {
    return this.ice.configured();
  }

  policy(): RealtimePolicy {
    return computeRealtimePolicy(this.settings, this.usage);
  }

  statusPayload(): RealtimePolicy & {
    type: 'realtime-status';
    version: string;
    mode: 'cloudflare-sfu';
    experimental: boolean;
    usagePersistence: string;
    [key: string]: unknown;
  } {
    const policy = this.policy();
    return {
      type: 'realtime-status',
      version: this.version,
      mode: 'cloudflare-sfu',
      experimental: true,
      ...policy,
      usagePersistence: 'ephemeral-with-local-checkpoint',
    };
  }

  publicHealth(): Record<string, unknown> {
    const policy = this.policy();
    return {
      configured: policy.configured,
      enabled: policy.enabled,
      hardBlocked: policy.hardBlocked,
      estimatedGb: policy.estimatedGb,
      maxQuality: policy.maxQuality,
      screenAllowed: policy.screenAllowed,
      thresholds: policy.thresholds,
      month: policy.month,
      maxParticipants: policy.maxParticipants,
      estimateSafetyFactor: policy.estimateSafetyFactor,
      turnConfigured: this.turnConfigured(),
      turnEnabled: this.settings.turnEnabled,
    };
  }

  clampQuality(q: unknown): SfuQualityPreset {
    return clampRealtimeQuality(q, this.policy());
  }

  notePlayerQuality(roomId: string, ownerId: string, q: unknown): SfuQualityPreset {
    const quality = this.clampQuality(q);
    const map = this.pubMap(roomId);
    for (const pub of map.values()) {
      if (pub.ownerId === ownerId) pub.quality = quality;
    }
    for (const sub of this.subscriptions.values()) {
      if (sub.roomId !== roomId || sub.publisherId !== ownerId) continue;
      const pub = map.get(publicationKeyOf(ownerId, sub.kind));
      if (pub) sub.estimatedBps = this.subscriptionBps(pub, sub.preferredRid);
    }
    return quality;
  }

  roomPublications(roomId: string): SfuPublicationDescriptor[] {
    const map = this.publicationsByRoom.get(roomId);
    if (!map) return [];
    return [...map.values()]
      .filter((pub) => pub.ready && !this.isModerated(roomId, pub.ownerId, pub.kind))
      .map((pub) => this.toDescriptor(pub));
  }

  broadcastPublications(room: SfuRoom | undefined): void {
    if (this.closed || !room) return;
    const publications = this.roomPublications(room.id);
    for (const player of room.players.values()) {
      if (player.voiceJoined) {
        this.send(player.ws, { type: 'sfu-publications', roomId: room.id, publications });
      }
    }
  }

  broadcastStatus(room: SfuRoom | undefined): void {
    if (this.closed || !room) return;
    const payload = this.statusPayload();
    for (const player of room.players.values()) {
      if (player.voiceJoined) this.send(player.ws, payload);
    }
  }

  turnIceServers(signal?: AbortSignal): Promise<IceConfiguration> {
    return this.ice.configuration(signal);
  }

  /** Legacy alias kept for compatibility with existing server wiring. */
  _turnIceServers(signal?: AbortSignal): Promise<IceConfiguration> {
    return this.turnIceServers(signal);
  }

  async enforceModeration(room: SfuRoom, player: SfuPlayer): Promise<void> {
    const moderatedSubs = [...this.subscriptions.values()].filter(
      (sub) =>
        sub.roomId === room.id &&
        sub.publisherId === player.id &&
        this.isModerated(room.id, player.id, sub.kind),
    );
    for (const sub of moderatedSubs) {
      this.subscriptions.delete(subscriptionKeyOf(sub.sessionId, sub.mid));
    }
    this.broadcastPublications(room);
    await this.closeTracksGrouped(
      moderatedSubs.map((sub) => ({ sessionId: sub.sessionId, mid: sub.mid })),
    );
  }

  async handleRequest(ws: SfuConnection, value: unknown): Promise<void> {
    if (this.closed) return;
    const parsed = parseSfuRequestMessage(value);
    if (!parsed) {
      if (
        isPlainObject(value) &&
        typeof value.requestId === 'string' &&
        value.requestId.length > 0 &&
        value.requestId.length <= 80
      ) {
        this.sendResponse(ws, value.requestId, false, null, {
          code: 'UNKNOWN_SFU_ACTION',
          message: 'Ação SFU desconhecida.',
        });
      }
      return;
    }

    if (parsed.action === 'status' || 'error' in this.allowedRoomPlayer(ws)) {
      await this.dispatchRequest(ws, parsed.requestId, parsed.action, parsed.payload);
      return;
    }

    const contextKey = contextKeyOf(ws.roomId || '', ws.clientId);
    const queueKey = this.resolveQueueKey(contextKey, parsed.action, parsed.payload);
    if (!queueKey) {
      await this.dispatchRequest(ws, parsed.requestId, parsed.action, parsed.payload);
      return;
    }

    const client = this.clientScope(contextKey);
    const queued = (this.sessionQueues.get(queueKey) || Promise.resolve())
      .catch(() => {})
      .then(() => {
        if (this.closed) return;
        if (client.signal.aborted || this.clientScopes.get(contextKey) !== client) {
          this.sendResponse(ws, parsed.requestId, false, null, {
            code: 'SFU_SESSION_STALE',
            message: 'A chamada mudou durante a operação SFU.',
          });
          return;
        }
        return this.dispatchRequest(ws, parsed.requestId, parsed.action, parsed.payload);
      });

    this.sessionQueues.set(queueKey, queued);
    try {
      await queued;
    } finally {
      if (this.sessionQueues.get(queueKey) === queued) {
        this.sessionQueues.delete(queueKey);
      }
    }
  }

  async cleanupClient(clientId: string, roomId: string): Promise<void> {
    if (this.closed) return;
    const contextKey = contextKeyOf(roomId, clientId);
    this.clientScopes.get(contextKey)?.abort();
    this.clientScopes.delete(contextKey);
    for (const queueKey of this.sessionQueues.keys()) {
      if (queueKey.startsWith(`${contextKey}:`)) {
        this.sessionQueues.delete(queueKey);
      }
    }
    this.pendingPublishers.get(roomId)?.delete(clientId);
    if (!this.pendingPublishers.get(roomId)?.size) {
      this.pendingPublishers.delete(roomId);
    }

    const roomPubs = this.pubMap(roomId);
    const clientPubs = [...roomPubs.values()].filter((pub) => pub.ownerId === clientId);
    const pubTrackSet = new Set(clientPubs.map((pub) => `${pub.sessionId}:${pub.trackName}`));

    const ownSubs = [...this.subscriptions.values()].filter(
      (sub) => sub.roomId === roomId && sub.ownerId === clientId,
    );
    const dependentSubs = [...this.subscriptions.values()].filter(
      (sub) =>
        sub.roomId === roomId &&
        sub.ownerId !== clientId &&
        pubTrackSet.has(`${sub.publisherSessionId}:${sub.trackName}`),
    );

    for (const pub of clientPubs) {
      const key = publicationKeyOf(clientId, pub.kind);
      if (roomPubs.get(key) === pub) roomPubs.delete(key);
    }
    for (const sub of ownSubs) {
      this.subscriptions.delete(subscriptionKeyOf(sub.sessionId, sub.mid));
    }
    for (const sub of dependentSubs) {
      this.subscriptions.delete(subscriptionKeyOf(sub.sessionId, sub.mid));
    }

    const participant = this.participantSessions.get(contextKey);
    this.participantSessions.delete(contextKey);
    if (participant?.publisherSessionId) this.sessions.delete(participant.publisherSessionId);
    if (participant?.subscriberSessionId) this.sessions.delete(participant.subscriberSessionId);

    for (const [sessionId, session] of this.sessions) {
      if (session.roomId === roomId && session.ownerId === clientId) {
        this.sessions.delete(sessionId);
      }
    }

    const toClose: Array<{ sessionId: string; mid: string }> = [
      ...clientPubs.map((pub) => ({ sessionId: pub.sessionId, mid: pub.mid })),
      ...ownSubs.map((sub) => ({ sessionId: sub.sessionId, mid: sub.mid })),
      ...dependentSubs.map((sub) => ({ sessionId: sub.sessionId, mid: sub.mid })),
    ];

    const room = this.rooms.get(roomId);
    if (room) this.broadcastPublications(room);

    await this.closeTracksGrouped(toClose);
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (this.closed) return Promise.resolve();
    this.closed = true;
    clearInterval(this.timer);
    this.usageMeter.advance(this.currentEgressBps(), this.now());
    this.usageMeter.save(this.now());

    const toClose: Array<{ sessionId: string; mid: string }> = [];
    for (const map of this.publicationsByRoom.values()) {
      for (const pub of map.values()) {
        toClose.push({ sessionId: pub.sessionId, mid: pub.mid });
      }
    }
    for (const sub of this.subscriptions.values()) {
      toClose.push({ sessionId: sub.sessionId, mid: sub.mid });
    }

    this.scope.abort();
    this.ice.stop();
    for (const client of this.clientScopes.values()) client.abort();
    this.clientScopes.clear();
    this.pendingPublishers.clear();
    this.participantSessions.clear();
    this.sessions.clear();
    this.subscriptions.clear();
    this.publicationsByRoom.clear();
    this.sessionQueues.clear();

    const deadline = AbortSignal.timeout(3_000);
    this.stopPromise = this.closeTracksGrouped(toClose, deadline);
    return this.stopPromise;
  }

  private resolveQueueKey(
    contextKey: string,
    action: SfuClientAction,
    payload: Record<string, unknown>,
  ): string {
    if (action === 'status' || action === 'ice-config' || action === 'list-publications') {
      return '';
    }
    if (
      action === 'publish-tracks' ||
      action === 'publish-track' ||
      action === 'unpublish-tracks' ||
      action === 'close-publication' ||
      action === 'publication-ready' ||
      action === 'set-screen-bitrate'
    ) {
      return `${contextKey}:publisher`;
    }
    if (
      action === 'subscribe-tracks' ||
      action === 'subscribe-track' ||
      action === 'renegotiate' ||
      action === 'update-subscription' ||
      action === 'close-subscription'
    ) {
      return `${contextKey}:subscriber`;
    }
    if (action === 'ensure-session') {
      if (payload.purpose === 'publish') return `${contextKey}:publisher`;
      if (payload.purpose === 'subscribe') return `${contextKey}:subscriber`;
      return '';
    }
    if (action === 'close-session') {
      const sid = typeof payload.sessionId === 'string' ? payload.sessionId : '';
      const purpose =
        payload.purpose === 'publish' || payload.purpose === 'subscribe'
          ? payload.purpose
          : this.sessions.get(sid)?.purpose;
      if (purpose === 'publish') return `${contextKey}:publisher`;
      if (purpose === 'subscribe') return `${contextKey}:subscriber`;
      return `${contextKey}:publisher`;
    }
    return '';
  }

  private async dispatchRequest(
    ws: SfuConnection,
    requestId: string,
    action: SfuClientAction,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (this.closed || !requestId) return;
    if (action === 'status') {
      this.sendResponse(ws, requestId, true, this.statusPayload());
      return;
    }

    const auth = this.allowedRoomPlayer(ws);
    if ('error' in auth) {
      this.sendResponse(ws, requestId, false, null, {
        code: auth.error,
        message: 'Operação SFU não autorizada neste contexto.',
      });
      return;
    }

    const { room, player } = auth;
    if (
      room.voiceMode === 'p2p' &&
      ![
        'ice-config',
        'unpublish-tracks',
        'close-session',
        'close-publication',
        'close-subscription',
      ].includes(action)
    ) {
      this.sendResponse(ws, requestId, false, null, {
        code: 'ROOM_P2P',
        message: 'A sala está sincronizada em P2P.',
      });
      return;
    }

    const contextKey = contextKeyOf(room.id, player.id);
    const client = this.clientScope(contextKey);
    const signal = AbortSignal.any([this.scope.signal, client.signal]);
    const ensureCurrent = () => {
      if (
        this.closed ||
        signal.aborted ||
        room.voiceMode === 'p2p' ||
        ws.roomId !== room.id ||
        room.players.get(player.id) !== player ||
        !player.voiceJoined ||
        this.clientScopes.get(contextKey) !== client
      ) {
        throw sfuFailure('SFU_SESSION_STALE', 'A chamada mudou durante a operação SFU.');
      }
    };
    const ctx: RequestContext = { ws, room, player, signal, ensureCurrent };

    try {
      const data = await this.executeAction(ctx, action, payload);
      this.sendResponse(ws, requestId, true, data);
    } catch (error) {
      this.sendResponse(
        ws,
        requestId,
        false,
        null,
        this.publicError(
          error,
          isPlainObject(error) && typeof error.code === 'string'
            ? error.code
            : 'SFU_REQUEST_FAILED',
        ),
      );
    }
  }

  private async executeAction(
    ctx: RequestContext,
    action: SfuClientAction,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    switch (action) {
      case 'ice-config':
        return this.handleIceConfig(ctx.signal);
      case 'list-publications':
        return { publications: this.roomPublications(ctx.room.id) };
      case 'ensure-session':
        return this.handleEnsureSession(ctx, payload);
      case 'publish-tracks':
        return this.handlePublishTracks(ctx, payload);
      case 'unpublish-tracks':
        return this.handleUnpublishTracks(ctx, payload);
      case 'subscribe-tracks':
        return this.handleSubscribeTracks(ctx, payload);
      case 'renegotiate':
        return this.handleRenegotiate(ctx, payload);
      case 'update-subscription':
        return this.handleUpdateSubscription(ctx, payload);
      case 'close-session':
        return this.handleCloseSession(ctx, payload);
      case 'set-screen-bitrate':
        return this.handleSetScreenBitrate(ctx, payload);
      case 'publish-track':
        return this.handleLegacyPublishTrack(ctx, payload);
      case 'publication-ready':
        return this.handleLegacyPublicationReady(ctx, payload);
      case 'subscribe-track':
        return this.handleLegacySubscribeTrack(ctx, payload);
      case 'close-publication':
        return this.handleLegacyClosePublication(ctx, payload);
      case 'close-subscription':
        return this.handleLegacyCloseSubscription(ctx, payload);
      default:
        throw sfuFailure('UNKNOWN_SFU_ACTION', 'Ação SFU desconhecida.');
    }
  }

  private async handleIceConfig(signal: AbortSignal): Promise<unknown> {
    try {
      return await this.turnIceServers(signal);
    } catch {
      return DEFAULT_STUN_FALLBACK;
    }
  }

  private async handleEnsureSession(
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): Promise<{ sessionId: string; purpose: SfuSessionPurpose; reused: boolean }> {
    const purpose = payload.purpose;
    if (purpose !== 'publish' && purpose !== 'subscribe') {
      throw sfuFailure('BAD_SFU_SESSION', 'Finalidade de sessão SFU inválida.');
    }
    this.assertGate('audio', 'balanced');
    const requestedSessionId =
      typeof payload.sessionId === 'string' && payload.sessionId ? payload.sessionId : undefined;
    const { sessionId, created } = await this.ensureParticipantSession(
      ctx,
      purpose,
      requestedSessionId,
    );
    return { sessionId, purpose, reused: !created };
  }

  private async handlePublishTracks(
    ctx: RequestContext,
    rawPayload: Record<string, unknown>,
  ): Promise<{
    sessionId: string;
    sessionDescription: SdpDescription;
    publications: SfuPublicationDescriptor[];
  }> {
    const validated = validatePublishTracksPayload(rawPayload);
    if (!validated.ok) throw sfuFailure(validated.code, validated.message);
    return this.executePublishTracks(ctx, validated.value);
  }

  private async handleLegacyPublishTrack(
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const batch = validatePublishTracksPayload({
      sessionId: payload.sessionId,
      quality: payload.quality,
      screenBitrate: payload.screenBitrate,
      sessionDescription: payload.sessionDescription,
      tracks: [
        {
          kind: payload.kind,
          mid: payload.mid,
          rids: Array.isArray(payload.rids) ? payload.rids : [],
        },
      ],
    });
    if (!batch.ok) throw sfuFailure(batch.code, batch.message);

    const result = await this.executePublishTracks(ctx, batch.value);
    const pub = result.publications[0];
    return {
      sessionId: result.sessionId,
      sessionDescription: result.sessionDescription,
      publication: {
        kind: pub.kind,
        trackName: pub.trackName,
        quality: pub.quality,
        rids: pub.rids,
      },
      publications: result.publications,
    };
  }

  private async executePublishTracks(
    ctx: RequestContext,
    payload: PublishTracksPayload,
  ): Promise<{
    sessionId: string;
    sessionDescription: SdpDescription;
    publications: SfuPublicationDescriptor[];
  }> {
    for (const item of payload.tracks) {
      if (item.kind !== 'audio' && ctx.player.mediaBlocked) {
        throw sfuFailure('VOICE_MEDIA_BLOCKED', 'Compartilhamento bloqueado pela moderação.');
      }
      if (item.kind === 'audio' && ctx.player.serverMuted) {
        throw sfuFailure('VOICE_MODERATED', 'Microfone silenciado pela moderação.');
      }
      this.assertGate(item.kind, payload.quality);
    }

    this.assertRoomParticipantLimit(ctx.room, ctx.player);

    const release = this.reservePublisher(ctx.room.id, ctx.player.id);
    try {
      const { sessionId, created } = await this.ensureParticipantSession(
        ctx,
        'publish',
        payload.sessionId,
      );

      // Close any previous publication of the same media kind before replacing it.
      const roomPubs = this.pubMap(ctx.room.id);
      const replacingMids: string[] = [];
      for (const item of payload.tracks) {
        const existing = roomPubs.get(publicationKeyOf(ctx.player.id, item.kind));
        if (existing) replacingMids.push(existing.mid);
      }
      if (replacingMids.length > 0) {
        await this.executeUnpublishTracks(
          ctx,
          { sessionId, mids: replacingMids },
          { silentClose: true, broadcast: false },
        );
      }

      const ownerPrefix = String(ctx.player.id)
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 8);
      const stamp = this.now().toString(36);
      const prepared = payload.tracks.map((item) => ({
        ...item,
        trackName: `${item.kind}-${ownerPrefix}-${stamp}-${++this.trackNameSeq}`,
      }));

      let result: CloudflareProviderResponse;
      try {
        result = await this.calls.addTracks(
          sessionId,
          {
            sessionDescription: payload.sessionDescription,
            tracks: prepared.map((item) => ({
              location: 'local' as const,
              mid: item.mid,
              trackName: item.trackName,
            })),
          },
          ctx.signal,
        );
      } catch (error) {
        if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'publish');
        throw error;
      }

      const returnedTracks = result.tracks || [];
      if (returnedTracks.length !== prepared.length) {
        if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'publish');
        throw sfuFailure('BAD_SFU_PUBLISH', 'O provedor não confirmou todas as tracks publicadas.');
      }

      for (const tr of returnedTracks) {
        if (tr.errorCode) {
          if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'publish');
          throw sfuFailure(tr.errorCode, tr.errorDescription || 'Falha ao publicar track.');
        }
      }

      if (!isValidSdpDescription(result.sessionDescription, 'answer')) {
        if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'publish');
        throw sfuFailure('SFU_RESPONSE_INVALID', 'O provedor não retornou Answer SDP válido.');
      }

      ctx.ensureCurrent();

      const policy = this.policy();
      const createdAt = this.now();
      const createdPubs: SfuPublication[] = [];

      for (let i = 0; i < prepared.length; i++) {
        const reqItem = prepared[i];
        const tr = returnedTracks.find((item) => item.mid === reqItem.mid) ?? returnedTracks[i];
        const trackName = tr.trackName || reqItem.trackName;
        const mid = tr.mid || reqItem.mid;
        const screenBitrate =
          reqItem.kind === 'screen'
            ? Math.min(
                policy.highAllowed ? 15_000_000 : 6_000_000,
                Math.max(
                  4_000_000,
                  typeof payload.screenBitrate === 'number' &&
                    Number.isFinite(payload.screenBitrate)
                    ? payload.screenBitrate
                    : PROFILE[payload.quality].screen,
                ),
              )
            : null;

        createdPubs.push({
          ownerId: ctx.player.id,
          ownerName: ctx.player.name,
          roomId: ctx.room.id,
          kind: reqItem.kind,
          sessionId,
          trackName,
          mid,
          quality: payload.quality,
          screenBitrate,
          rids: reqItem.kind === 'camera' || reqItem.kind === 'screen' ? [...reqItem.rids] : [],
          ready: true,
          createdAt,
        });
      }

      // Re-verify moderation after async Cloudflare call; close newly published tracks if moderated.
      const moderatedPost = createdPubs.find((pub) =>
        this.isModerated(ctx.room.id, ctx.player.id, pub.kind),
      );
      if (moderatedPost) {
        await this.calls
          .closeTracks(
            sessionId,
            createdPubs.map((pub) => pub.mid),
            true,
          )
          .catch(() => {});
        throw sfuFailure(
          moderatedPost.kind === 'audio' ? 'VOICE_MODERATED' : 'VOICE_MEDIA_BLOCKED',
          moderatedPost.kind === 'audio'
            ? 'Microfone silenciado pela moderação.'
            : 'Compartilhamento bloqueado pela moderação.',
        );
      }

      for (const pub of createdPubs) {
        roomPubs.set(publicationKeyOf(ctx.player.id, pub.kind), pub);
        if (pub.kind === 'audio') ctx.player.mediaTransport = 'sfu';
      }
      ctx.player.transmissionQuality = payload.quality;

      this.broadcastPublications(ctx.room);
      this.broadcastVoiceRoster(ctx.room);

      return {
        sessionId,
        sessionDescription: result.sessionDescription,
        publications: createdPubs.map((pub) => this.toDescriptor(pub)),
      };
    } finally {
      release();
    }
  }

  private async handleLegacyPublicationReady(
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const session = this.ownedSession(ctx.ws, sessionId);
    if (!session || session.purpose !== 'publish') {
      throw sfuFailure('BAD_SFU_READY', 'Publicação não encontrada.');
    }

    const roomPubs = this.pubMap(ctx.room.id);
    const kind = isSfuMediaKind(payload.kind) ? payload.kind : undefined;
    const pub = kind
      ? roomPubs.get(publicationKeyOf(ctx.player.id, kind))
      : [...roomPubs.values()].find(
          (item) => item.ownerId === ctx.player.id && item.sessionId === sessionId,
        );

    if (!pub || pub.sessionId !== sessionId) {
      throw sfuFailure('PUBLICATION_NOT_FOUND', 'Publicação não encontrada.');
    }

    pub.ready = true;
    if (pub.kind === 'audio') ctx.player.mediaTransport = 'sfu';
    return {
      ready: true,
      kind: pub.kind,
      trackName: pub.trackName,
      rids: pub.rids,
    };
  }

  private async handleUnpublishTracks(
    ctx: RequestContext,
    rawPayload: Record<string, unknown>,
  ): Promise<{ closed: true; sessionId: string; mids: string[] }> {
    const validated = validateUnpublishTracksPayload(rawPayload);
    if (!validated.ok) throw sfuFailure(validated.code, validated.message);
    return this.executeUnpublishTracks(ctx, validated.value);
  }

  private async handleLegacyClosePublication(
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): Promise<{ closed: true }> {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const session = this.ownedSession(ctx.ws, sessionId);
    if (!session || session.purpose !== 'publish') {
      throw sfuFailure('BAD_SFU_CLOSE', 'Publicação não encontrada.');
    }

    if (Array.isArray(payload.mids) && payload.mids.length > 0) {
      const validated = validateUnpublishTracksPayload({ sessionId, mids: payload.mids });
      if (!validated.ok) throw sfuFailure(validated.code, validated.message);
      await this.executeUnpublishTracks(ctx, validated.value);
      return { closed: true };
    }

    const roomPubs = this.pubMap(ctx.room.id);
    const kindFilter = isSfuMediaKind(payload.kind) ? payload.kind : undefined;
    const matching = [...roomPubs.values()].filter(
      (pub) =>
        pub.ownerId === ctx.player.id &&
        pub.sessionId === sessionId &&
        (!kindFilter || pub.kind === kindFilter),
    );
    if (matching.length > 0) {
      await this.executeUnpublishTracks(ctx, {
        sessionId,
        mids: matching.map((pub) => pub.mid),
      });
    } else {
      this.broadcastPublications(ctx.room);
    }
    return { closed: true };
  }

  private async executeUnpublishTracks(
    ctx: RequestContext,
    payload: UnpublishTracksPayload,
    options: { silentClose?: boolean; broadcast?: boolean } = {},
  ): Promise<{ closed: true; sessionId: string; mids: string[] }> {
    const session = this.ownedSession(ctx.ws, payload.sessionId);
    if (!session || session.purpose !== 'publish') {
      throw sfuFailure('BAD_SFU_CLOSE', 'Sessão de publicação não encontrada.');
    }

    const midSet = new Set(payload.mids);
    const roomPubs = this.pubMap(ctx.room.id);
    const removedPubs: SfuPublication[] = [];
    for (const [key, pub] of roomPubs) {
      if (
        pub.ownerId === ctx.player.id &&
        pub.sessionId === payload.sessionId &&
        midSet.has(pub.mid)
      ) {
        roomPubs.delete(key);
        removedPubs.push(pub);
      }
    }

    const removedTrackKeys = new Set(removedPubs.map((pub) => `${pub.sessionId}:${pub.trackName}`));
    const dependentSubs: SfuSubscription[] = [];
    for (const [subKey, sub] of this.subscriptions) {
      if (
        sub.roomId === ctx.room.id &&
        removedTrackKeys.has(`${sub.publisherSessionId}:${sub.trackName}`)
      ) {
        this.subscriptions.delete(subKey);
        dependentSubs.push(sub);
      }
    }

    try {
      if (this.configured() && payload.mids.length > 0) {
        await this.calls.closeTracks(payload.sessionId, payload.mids, true, ctx.signal);
      }
    } catch (error) {
      if (!options.silentClose) throw error;
    }

    await this.closeTracksGrouped(
      dependentSubs.map((sub) => ({ sessionId: sub.sessionId, mid: sub.mid })),
    );

    if (options.broadcast !== false) {
      this.broadcastPublications(ctx.room);
    }

    return { closed: true, sessionId: payload.sessionId, mids: payload.mids };
  }

  private async handleSubscribeTracks(
    ctx: RequestContext,
    rawPayload: Record<string, unknown>,
  ): Promise<unknown> {
    const validated = validateSubscribeTracksPayload(rawPayload);
    if (!validated.ok) throw sfuFailure(validated.code, validated.message);
    return this.executeSubscribeTracks(ctx, validated.value);
  }

  private async handleLegacySubscribeTrack(
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const validated = validateSubscribeTracksPayload({
      sessionId: payload.sessionId,
      quality: payload.quality,
      tracks: [
        {
          publisherId: payload.publisherId,
          kind: payload.kind,
          preferredRid: payload.preferredRid,
        },
      ],
    });
    if (!validated.ok) throw sfuFailure(validated.code, validated.message);
    const result = await this.executeSubscribeTracks(ctx, validated.value);
    const first = result.tracks[0];
    return {
      ...result,
      mid: first.mid,
      publisherId: first.publisherId,
      kind: first.kind,
      preferredRid: first.preferredRid,
    };
  }

  private async executeSubscribeTracks(
    ctx: RequestContext,
    payload: SubscribeTracksPayload,
  ): Promise<{
    sessionId: string;
    sessionDescription: SdpDescription;
    requiresImmediateRenegotiation: boolean;
    tracks: Array<{
      mid: string;
      publisherId: string;
      publisherSessionId: string;
      trackName: string;
      kind: SfuMediaKind;
      preferredRid: SfuSimulcastRid | null;
    }>;
  }> {
    const roomPubs = this.pubMap(ctx.room.id);
    const resolvedItems: Array<{
      pub: SfuPublication;
      preferredRid: SfuSimulcastRid | null;
      remoteRequest: RemoteTrackRequest;
    }> = [];

    for (const item of payload.tracks) {
      if (this.isModerated(ctx.room.id, item.publisherId, item.kind)) {
        throw sfuFailure('VOICE_MODERATED', 'Mídia silenciada pela moderação.');
      }
      if (item.publisherId === ctx.player.id) {
        throw sfuFailure('BAD_SFU_SUBSCRIBE', 'Assinatura da própria publicação não permitida.');
      }
      const pub = roomPubs.get(publicationKeyOf(item.publisherId, item.kind));
      if (!pub) {
        throw sfuFailure('PUBLICATION_NOT_FOUND', 'Publicação não está disponível.');
      }
      if (!pub.ready) {
        throw sfuFailure('PUBLICATION_NOT_READY', 'Publicação ainda está conectando ao SFU.');
      }
      this.assertGate(item.kind, payload.quality);

      const isVideo = item.kind === 'camera' || item.kind === 'screen';
      const preferredRid = isVideo
        ? clampRealtimeRid(pub, item.preferredRid, payload.quality, this.policy())
        : null;

      const remoteRequest: RemoteTrackRequest = {
        location: 'remote',
        sessionId: pub.sessionId,
        trackName: pub.trackName,
      };
      if (isVideo && preferredRid && pub.rids.length > 0) {
        remoteRequest.simulcast = {
          preferredRid,
          priorityOrdering: 'asciibetical',
          ridNotAvailable: 'asciibetical',
        };
      }
      resolvedItems.push({ pub, preferredRid, remoteRequest });
    }

    const { sessionId, created } = await this.ensureParticipantSession(
      ctx,
      'subscribe',
      payload.sessionId,
    );
    const sessionRecord = this.sessions.get(sessionId);

    // Close any pre-existing subscription on this subscriber session for the same (publisherId, kind).
    const replacingSubs: SfuSubscription[] = [];
    for (const { pub } of resolvedItems) {
      for (const [subKey, existing] of this.subscriptions) {
        if (
          existing.sessionId === sessionId &&
          existing.publisherId === pub.ownerId &&
          existing.kind === pub.kind
        ) {
          this.subscriptions.delete(subKey);
          replacingSubs.push(existing);
        }
      }
    }
    if (replacingSubs.length > 0) {
      await this.closeTracksGrouped(
        replacingSubs.map((sub) => ({ sessionId: sub.sessionId, mid: sub.mid })),
        ctx.signal,
      );
    }

    let result: CloudflareProviderResponse;
    try {
      result = await this.calls.addTracks(
        sessionId,
        { tracks: resolvedItems.map((entry) => entry.remoteRequest) },
        ctx.signal,
      );
    } catch (error) {
      if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'subscribe');
      throw error;
    }

    const returnedTracks = result.tracks || [];
    for (let i = 0; i < returnedTracks.length; i++) {
      const tr = returnedTracks[i];
      if (!tr.errorCode) continue;
      if (tr.errorCode === 'not_found_track_error') {
        const stalePub = resolvedItems[i]?.pub;
        if (stalePub) await this.pruneStalePublication(ctx.room, stalePub);
        if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'subscribe');
        throw sfuFailure(
          'PUBLICATION_STALE',
          'A fonte de mídia foi substituída antes da assinatura. Ressincronizando.',
        );
      }
      if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'subscribe');
      throw sfuFailure(tr.errorCode, tr.errorDescription || 'Falha ao assinar track.');
    }

    ctx.ensureCurrent();
    for (const { pub } of resolvedItems) {
      if (roomPubs.get(publicationKeyOf(pub.ownerId, pub.kind)) !== pub) {
        if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'subscribe');
        throw sfuFailure('PUBLICATION_STALE', 'A publicação foi substituída.');
      }
      if (this.isModerated(ctx.room.id, pub.ownerId, pub.kind)) {
        const mids = returnedTracks.flatMap((tr) => (tr.mid ? [tr.mid] : []));
        if (mids.length > 0) await this.calls.closeTracks(sessionId, mids, true).catch(() => {});
        throw sfuFailure('VOICE_MODERATED', 'Mídia silenciada pela moderação.');
      }
    }

    if (!isValidSdpDescription(result.sessionDescription, 'offer')) {
      if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'subscribe');
      throw sfuFailure('BAD_SFU_OFFER', 'SFU não forneceu uma oferta SDP válida.');
    }
    if (returnedTracks.length !== resolvedItems.length) {
      if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'subscribe');
      throw sfuFailure('BAD_SFU_OFFER', 'SFU não confirmou todas as tracks de recepção.');
    }

    const createdAt = this.now();
    const subscribedTracks: Array<{
      mid: string;
      publisherId: string;
      publisherSessionId: string;
      trackName: string;
      kind: SfuMediaKind;
      preferredRid: SfuSimulcastRid | null;
    }> = [];

    for (let i = 0; i < resolvedItems.length; i++) {
      const { pub, preferredRid } = resolvedItems[i];
      const tr = returnedTracks[i];
      if (!tr.mid) {
        if (created) await this.discardSessionIfEmpty(ctx, sessionId, 'subscribe');
        throw sfuFailure('BAD_SFU_OFFER', 'SFU retornou track de recepção sem MID.');
      }
      const sub: SfuSubscription = {
        sessionId,
        ownerId: ctx.player.id,
        roomId: ctx.room.id,
        publisherId: pub.ownerId,
        publisherSessionId: pub.sessionId,
        trackName: pub.trackName,
        kind: pub.kind,
        mid: tr.mid,
        preferredRid,
        estimatedBps: this.subscriptionBps(pub, preferredRid),
        createdAt,
      };
      this.subscriptions.set(subscriptionKeyOf(sessionId, tr.mid), sub);
      subscribedTracks.push({
        mid: sub.mid,
        publisherId: sub.publisherId,
        publisherSessionId: sub.publisherSessionId,
        trackName: sub.trackName,
        kind: sub.kind,
        preferredRid: sub.preferredRid,
      });
    }

    if (sessionRecord) sessionRecord.pendingAnswer = true;

    return {
      sessionId,
      sessionDescription: result.sessionDescription,
      requiresImmediateRenegotiation: result.requiresImmediateRenegotiation ?? true,
      tracks: subscribedTracks,
    };
  }

  private async handleRenegotiate(
    ctx: RequestContext,
    rawPayload: Record<string, unknown>,
  ): Promise<{ accepted: true; sessionId: string; result: CloudflareProviderResponse }> {
    const validated = validateRenegotiatePayload(rawPayload);
    if (!validated.ok) throw sfuFailure(validated.code, validated.message);

    const session = this.ownedSession(ctx.ws, validated.value.sessionId);
    if (!session || session.purpose !== 'subscribe') {
      throw sfuFailure(
        'SFU_SESSION_STALE',
        'Sessão de recepção encerrada ou substituída. Ressincronize a mídia.',
      );
    }

    const result = await this.calls.renegotiate(
      validated.value.sessionId,
      validated.value.sessionDescription,
      ctx.signal,
    );
    ctx.ensureCurrent();
    session.pendingAnswer = false;
    return { accepted: true, sessionId: validated.value.sessionId, result };
  }

  private async handleUpdateSubscription(
    ctx: RequestContext,
    rawPayload: Record<string, unknown>,
  ): Promise<unknown> {
    const validated = validateUpdateSubscriptionPayload(rawPayload);
    if (!validated.ok) throw sfuFailure(validated.code, validated.message);

    const { sessionId, mid, preferredRid: requestedRid } = validated.value;
    const session = this.ownedSession(ctx.ws, sessionId);
    if (!session || session.purpose !== 'subscribe') {
      throw sfuFailure('BAD_SFU_UPDATE', 'Sessão de assinatura não encontrada.');
    }
    if (session.pendingAnswer) {
      throw sfuFailure('SFU_NEGOTIATION_PENDING', 'A resposta da negociação ainda está pendente.');
    }

    const sub = this.findUpdatableSubscription(sessionId, mid);
    if (!sub || (sub.kind !== 'camera' && sub.kind !== 'screen')) {
      throw sfuFailure('BAD_SFU_UPDATE', 'Assinatura de vídeo não encontrada.');
    }

    const pub = this.pubMap(ctx.room.id).get(publicationKeyOf(sub.publisherId, sub.kind));
    if (!pub) throw sfuFailure('PUBLICATION_NOT_FOUND', 'Publicação de vídeo não encontrada.');

    const preferredRid = clampRealtimeRid(
      pub,
      requestedRid,
      ctx.player.transmissionQuality || 'balanced',
      this.policy(),
    );

    if (!preferredRid || pub.rids.length === 0) {
      sub.preferredRid = null;
      sub.estimatedBps = this.subscriptionBps(pub, null);
      return { preferredRid: null, mid: sub.mid, simulcast: false };
    }

    const result = await this.calls.updateTracks(
      sessionId,
      [
        {
          mid: sub.mid,
          simulcast: {
            preferredRid,
            priorityOrdering: 'asciibetical',
            ridNotAvailable: 'asciibetical',
          },
        },
      ],
      ctx.signal,
    );
    ctx.ensureCurrent();

    if (this.subscriptions.get(subscriptionKeyOf(sessionId, sub.mid)) !== sub) {
      throw sfuFailure('SFU_SESSION_STALE', 'A assinatura foi encerrada.');
    }

    sub.preferredRid = preferredRid;
    sub.estimatedBps = this.subscriptionBps(pub, preferredRid);
    return { preferredRid, mid: sub.mid, result, simulcast: true };
  }

  private async handleLegacyCloseSubscription(
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): Promise<{ closed: true }> {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const session = this.ownedSession(ctx.ws, sessionId);
    if (!session || session.purpose !== 'subscribe') {
      throw sfuFailure('BAD_SFU_CLOSE', 'Assinatura não encontrada.');
    }

    const mid = typeof payload.mid === 'string' && payload.mid ? payload.mid : undefined;
    const publisherId =
      typeof payload.publisherId === 'string' && payload.publisherId
        ? payload.publisherId
        : undefined;
    const kind = isSfuMediaKind(payload.kind) ? payload.kind : undefined;

    const matching = [...this.subscriptions.values()].filter(
      (sub) =>
        sub.sessionId === sessionId &&
        (!mid || sub.mid === mid) &&
        (!publisherId || sub.publisherId === publisherId) &&
        (!kind || sub.kind === kind),
    );
    if (matching.length === 0) {
      throw sfuFailure('BAD_SFU_CLOSE', 'Assinatura não encontrada.');
    }

    for (const sub of matching) {
      this.subscriptions.delete(subscriptionKeyOf(sub.sessionId, sub.mid));
    }
    await this.closeTracksGrouped(
      matching.map((sub) => ({ sessionId: sub.sessionId, mid: sub.mid })),
      ctx.signal,
    );
    return { closed: true };
  }

  private async handleCloseSession(
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): Promise<{ closed: true; sessionIds: string[] }> {
    const contextKey = contextKeyOf(ctx.room.id, ctx.player.id);
    const participant = this.participantSessions.get(contextKey);
    const requestedId =
      typeof payload.sessionId === 'string' && payload.sessionId ? payload.sessionId : undefined;
    const requestedPurpose =
      payload.purpose === 'publish' || payload.purpose === 'subscribe'
        ? payload.purpose
        : undefined;

    const targetIds: string[] = [];
    if (requestedId) {
      const owned = this.ownedSession(ctx.ws, requestedId);
      if (!owned) throw sfuFailure('SFU_SESSION_STALE', 'Sessão SFU não encontrada.');
      targetIds.push(requestedId);
    } else if (participant) {
      if (participant.publisherSessionId && (!requestedPurpose || requestedPurpose === 'publish')) {
        targetIds.push(participant.publisherSessionId);
      }
      if (
        participant.subscriberSessionId &&
        (!requestedPurpose || requestedPurpose === 'subscribe')
      ) {
        targetIds.push(participant.subscriberSessionId);
      }
    }

    const toClose: Array<{ sessionId: string; mid: string }> = [];
    let pubsRemoved = false;

    for (const sessionId of targetIds) {
      const session = this.sessions.get(sessionId);
      this.sessions.delete(sessionId);
      if (participant?.publisherSessionId === sessionId) participant.publisherSessionId = null;
      if (participant?.subscriberSessionId === sessionId) participant.subscriberSessionId = null;

      if (session?.purpose === 'publish') {
        const roomPubs = this.pubMap(ctx.room.id);
        const removedTrackKeys = new Set<string>();
        for (const [key, pub] of roomPubs) {
          if (pub.sessionId === sessionId) {
            roomPubs.delete(key);
            removedTrackKeys.add(`${pub.sessionId}:${pub.trackName}`);
            toClose.push({ sessionId: pub.sessionId, mid: pub.mid });
            pubsRemoved = true;
          }
        }
        for (const [subKey, sub] of this.subscriptions) {
          if (
            sub.roomId === ctx.room.id &&
            removedTrackKeys.has(`${sub.publisherSessionId}:${sub.trackName}`)
          ) {
            this.subscriptions.delete(subKey);
            toClose.push({ sessionId: sub.sessionId, mid: sub.mid });
          }
        }
      } else if (session?.purpose === 'subscribe') {
        for (const [subKey, sub] of this.subscriptions) {
          if (sub.sessionId === sessionId) {
            this.subscriptions.delete(subKey);
            toClose.push({ sessionId: sub.sessionId, mid: sub.mid });
          }
        }
      }
    }

    if (pubsRemoved) this.broadcastPublications(ctx.room);
    await this.closeTracksGrouped(toClose, ctx.signal);
    return { closed: true, sessionIds: targetIds };
  }

  private handleSetScreenBitrate(
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): { screenBitrate: number } {
    const requested = Number(payload.screenBitrate);
    if (!ALLOWED_SCREEN_BITRATES.has(requested)) {
      throw sfuFailure('BAD_SCREEN_BITRATE', 'Bitrate de tela inválido.');
    }
    const effective = Math.min(requested, this.policy().highAllowed ? 15_000_000 : 6_000_000);
    const pub = this.pubMap(ctx.room.id).get(publicationKeyOf(ctx.player.id, 'screen'));
    if (pub) {
      pub.screenBitrate = effective;
      for (const sub of this.subscriptions.values()) {
        if (
          sub.roomId === ctx.room.id &&
          sub.publisherId === ctx.player.id &&
          sub.kind === 'screen'
        ) {
          sub.estimatedBps = this.subscriptionBps(pub, sub.preferredRid);
        }
      }
      this.broadcastPublications(ctx.room);
    }
    return { screenBitrate: effective };
  }

  private async ensureParticipantSession(
    ctx: RequestContext,
    purpose: SfuSessionPurpose,
    requestedSessionId?: string,
  ): Promise<{ sessionId: string; created: boolean }> {
    const contextKey = contextKeyOf(ctx.room.id, ctx.player.id);
    let participant = this.participantSessions.get(contextKey);
    if (!participant) {
      participant = {
        roomId: ctx.room.id,
        ownerId: ctx.player.id,
        publisherSessionId: null,
        subscriberSessionId: null,
      };
      this.participantSessions.set(contextKey, participant);
    }

    const existingId =
      purpose === 'publish' ? participant.publisherSessionId : participant.subscriberSessionId;

    if (requestedSessionId) {
      if (existingId && existingId !== requestedSessionId) {
        throw sfuFailure(
          'SFU_SESSION_STALE',
          'A sessão informada não corresponde à sessão ativa do participante.',
        );
      }
      if (!existingId) {
        const owned = this.ownedSession(ctx.ws, requestedSessionId);
        if (!owned || owned.purpose !== purpose) {
          throw sfuFailure('SFU_SESSION_STALE', 'Sessão SFU inexistente ou expirada.');
        }
        if (purpose === 'publish') participant.publisherSessionId = requestedSessionId;
        else participant.subscriberSessionId = requestedSessionId;
        return { sessionId: requestedSessionId, created: false };
      }
    }

    if (existingId) {
      return { sessionId: existingId, created: false };
    }

    const sessionId = await this.calls.createSession(ctx.signal);
    ctx.ensureCurrent();
    if (this.sessions.has(sessionId)) {
      throw sfuFailure(
        'SFU_RESPONSE_INVALID',
        'O provedor retornou um identificador de sessão duplicado.',
      );
    }

    this.sessions.set(sessionId, {
      sessionId,
      ownerId: ctx.player.id,
      roomId: ctx.room.id,
      purpose,
      createdAt: this.now(),
      pendingAnswer: false,
    });
    if (purpose === 'publish') participant.publisherSessionId = sessionId;
    else participant.subscriberSessionId = sessionId;

    return { sessionId, created: true };
  }

  private async discardSessionIfEmpty(
    ctx: RequestContext,
    sessionId: string,
    purpose: SfuSessionPurpose,
  ): Promise<void> {
    const hasTracks =
      purpose === 'publish'
        ? [...this.pubMap(ctx.room.id).values()].some((pub) => pub.sessionId === sessionId)
        : [...this.subscriptions.values()].some((sub) => sub.sessionId === sessionId);
    if (hasTracks) return;

    this.sessions.delete(sessionId);
    const participant = this.participantSessions.get(contextKeyOf(ctx.room.id, ctx.player.id));
    if (participant) {
      if (purpose === 'publish' && participant.publisherSessionId === sessionId) {
        participant.publisherSessionId = null;
      }
      if (purpose === 'subscribe' && participant.subscriberSessionId === sessionId) {
        participant.subscriberSessionId = null;
      }
    }
  }

  private findUpdatableSubscription(
    sessionId: string,
    mid: string | undefined,
  ): SfuSubscription | undefined {
    if (mid) return this.subscriptions.get(subscriptionKeyOf(sessionId, mid));
    const videoSubs = [...this.subscriptions.values()].filter(
      (sub) => sub.sessionId === sessionId && (sub.kind === 'camera' || sub.kind === 'screen'),
    );
    return videoSubs.length === 1 ? videoSubs[0] : undefined;
  }

  private async pruneStalePublication(room: SfuRoom, pub: SfuPublication): Promise<void> {
    if (this.closed) return;
    const roomPubs = this.pubMap(pub.roomId);
    const key = publicationKeyOf(pub.ownerId, pub.kind);
    if (roomPubs.get(key) === pub) roomPubs.delete(key);

    const relatedSubs: SfuSubscription[] = [];
    for (const [subKey, sub] of this.subscriptions) {
      if (
        sub.roomId === pub.roomId &&
        sub.publisherSessionId === pub.sessionId &&
        sub.trackName === pub.trackName
      ) {
        this.subscriptions.delete(subKey);
        relatedSubs.push(sub);
      }
    }
    this.broadcastPublications(room);
    await this.closeTracksGrouped(
      relatedSubs.map((sub) => ({ sessionId: sub.sessionId, mid: sub.mid })),
    );
  }

  private async closeTracksGrouped(
    items: Array<{ sessionId: string; mid: string }>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!items.length || !this.configured()) return;
    const grouped = new Map<string, Set<string>>();
    for (const item of items) {
      if (!item.sessionId || !item.mid) continue;
      const mids = grouped.get(item.sessionId) ?? new Set<string>();
      mids.add(item.mid);
      grouped.set(item.sessionId, mids);
    }
    await Promise.allSettled(
      [...grouped].map(([sessionId, mids]) =>
        this.calls.closeTracks(sessionId, [...mids], true, signal),
      ),
    );
  }

  private assertGate(kind: SfuMediaKind, quality: SfuQualityPreset): void {
    const gate = assertSfuAvailable(this.settings, this.policy(), kind, quality);
    if (!gate.ok) throw sfuFailure(gate.code, gate.message);
  }

  private assertRoomParticipantLimit(room: SfuRoom, player: SfuPlayer): void {
    const publishing = new Set([...this.pubMap(room.id).values()].map((pub) => pub.ownerId));
    for (const owner of this.pendingPublishers.get(room.id)?.keys() || []) {
      publishing.add(owner);
    }
    const activeSfu = [...room.players.values()].filter(
      (p) => p.voiceJoined && (p.mediaTransport === 'sfu' || publishing.has(p.id)),
    );
    if (
      !activeSfu.some((p) => p.id === player.id) &&
      activeSfu.length >= this.settings.maxParticipants
    ) {
      throw sfuFailure(
        'SFU_ROOM_SAFETY_LIMIT',
        `Limite de segurança do SFU (${this.settings.maxParticipants} participantes simultâneos) atingido.`,
      );
    }
  }

  private allowedRoomPlayer(
    ws: SfuConnection,
  ): { error: 'SFU_CHAT_ONLY' | 'VOICE_REQUIRED' } | { room: SfuRoom; player: SfuPlayer } {
    const room = this.rooms.get(ws.roomId || '');
    const player = room?.players.get(ws.clientId);
    if (
      !room ||
      !player ||
      player.ws !== ws ||
      room.kind !== 'chat' ||
      room.channelType === 'text'
    ) {
      return { error: 'SFU_CHAT_ONLY' };
    }
    if (!player.voiceJoined) return { error: 'VOICE_REQUIRED' };
    return { room, player };
  }

  private ownedSession(ws: SfuConnection, sessionId: string): SfuSessionRecord | null {
    const session = this.sessions.get(sessionId);
    return session && session.ownerId === ws.clientId && session.roomId === ws.roomId
      ? session
      : null;
  }

  private isModerated(roomId: string, ownerId: string, kind: SfuMediaKind): boolean {
    const player = this.rooms.get(roomId)?.players.get(ownerId);
    return (
      !!player &&
      ((kind === 'audio' && !!player.serverMuted) || (kind !== 'audio' && !!player.mediaBlocked))
    );
  }

  private pubMap(roomId: string): Map<string, SfuPublication> {
    if (this.closed) {
      throw sfuFailure('SFU_SESSION_STALE', 'O serviço de mídia foi encerrado.');
    }
    let map = this.publicationsByRoom.get(roomId);
    if (!map) {
      map = new Map();
      this.publicationsByRoom.set(roomId, map);
    }
    return map;
  }

  private toDescriptor(pub: SfuPublication): SfuPublicationDescriptor {
    return {
      ownerId: pub.ownerId,
      ownerName: pub.ownerName,
      roomId: pub.roomId,
      kind: pub.kind,
      sessionId: pub.sessionId,
      trackName: pub.trackName,
      mid: pub.mid,
      quality: pub.quality,
      screenBitrate: pub.screenBitrate,
      rids: pub.rids,
      createdAt: pub.createdAt,
    };
  }

  private subscriptionBps(pub: SfuPublication, preferredRid: SfuSimulcastRid | null): number {
    return subscriptionBitrate(pub, preferredRid, this.settings.estimateSafetyFactor);
  }

  private clientScope(key: string): AbortController {
    let client = this.clientScopes.get(key);
    if (!client) {
      client = new AbortController();
      this.clientScopes.set(key, client);
    }
    return client;
  }

  private reservePublisher(roomId: string, ownerId: string): () => void {
    let owners = this.pendingPublishers.get(roomId);
    if (!owners) {
      owners = new Map();
      this.pendingPublishers.set(roomId, owners);
    }
    let slots = owners.get(ownerId);
    if (!slots) {
      slots = new Set();
      owners.set(ownerId, slots);
    }
    const ticket = {};
    slots.add(ticket);
    return () => {
      if (owners.get(ownerId) !== slots) return;
      slots.delete(ticket);
      if (!slots.size) owners.delete(ownerId);
      if (!owners.size && this.pendingPublishers.get(roomId) === owners) {
        this.pendingPublishers.delete(roomId);
      }
    };
  }

  private currentEgressBps(): number {
    let total = 0;
    for (const sub of this.subscriptions.values()) {
      total += Math.max(0, Number(sub.estimatedBps) || 0);
    }
    return total;
  }

  private _tick(force = false): void {
    if (this.closed) return;
    const now = this.now();
    this.usageMeter.advance(this.currentEgressBps(), now);
    if (force || now % 15_000 < 5_200) this.usageMeter.save(now);

    const currentPolicy = this.policy();
    const sig = JSON.stringify(currentPolicy);
    if (sig !== this.lastPolicySignature) {
      this.lastPolicySignature = sig;
      for (const room of this.rooms.values()) {
        if (room.kind === 'chat') this.broadcastStatus(room);
      }
    }

    const restrictionSig = JSON.stringify({
      enabled: currentPolicy.enabled,
      configured: currentPolicy.configured,
      hardBlocked: currentPolicy.hardBlocked,
      screenAllowed: currentPolicy.screenAllowed,
      highAllowed: currentPolicy.highAllowed,
      ultraAllowed: currentPolicy.ultraAllowed,
    });
    if (restrictionSig !== this.lastRestrictionSignature) {
      this.lastRestrictionSignature = restrictionSig;
      void this.enforcePolicy(currentPolicy);
    }
  }

  private async enforcePolicy(policy: RealtimePolicy): Promise<void> {
    if (this.closed || this.enforcementRunning || !policy.configured || !policy.enabled) return;
    this.enforcementRunning = true;
    try {
      if (policy.hardBlocked) {
        const toClose: Array<{ sessionId: string; mid: string }> = [];
        for (const [key, sub] of this.subscriptions) {
          this.subscriptions.delete(key);
          toClose.push({ sessionId: sub.sessionId, mid: sub.mid });
        }
        for (const map of this.publicationsByRoom.values()) {
          for (const [key, pub] of map) {
            map.delete(key);
            toClose.push({ sessionId: pub.sessionId, mid: pub.mid });
          }
        }
        await this.closeTracksGrouped(toClose);
      } else {
        if (!policy.screenAllowed) {
          const toClose: Array<{ sessionId: string; mid: string }> = [];
          const removedTracks = new Set<string>();
          for (const map of this.publicationsByRoom.values()) {
            for (const [key, pub] of map) {
              if (pub.kind === 'screen' || pub.kind === 'screen-audio') {
                map.delete(key);
                removedTracks.add(`${pub.sessionId}:${pub.trackName}`);
                toClose.push({ sessionId: pub.sessionId, mid: pub.mid });
              }
            }
          }
          for (const [subKey, sub] of this.subscriptions) {
            if (removedTracks.has(`${sub.publisherSessionId}:${sub.trackName}`)) {
              this.subscriptions.delete(subKey);
              toClose.push({ sessionId: sub.sessionId, mid: sub.mid });
            }
          }
          await this.closeTracksGrouped(toClose);
        }

        for (const sub of this.subscriptions.values()) {
          if (sub.kind !== 'camera' && sub.kind !== 'screen') continue;
          const pub = this.pubMap(sub.roomId).get(publicationKeyOf(sub.publisherId, sub.kind));
          if (!pub) continue;
          const desired = clampRealtimeRid(pub, sub.preferredRid, 'balanced', policy);
          if (desired === sub.preferredRid || !desired) continue;
          try {
            await this.calls.updateTracks(sub.sessionId, [
              {
                mid: sub.mid,
                simulcast: {
                  preferredRid: desired,
                  priorityOrdering: 'asciibetical',
                  ridNotAvailable: 'asciibetical',
                },
              },
            ]);
            if (
              this.closed ||
              this.subscriptions.get(subscriptionKeyOf(sub.sessionId, sub.mid)) !== sub
            ) {
              continue;
            }
            sub.preferredRid = desired;
            sub.estimatedBps = this.subscriptionBps(pub, desired);
          } catch {
            // Best-effort policy downgrade; will retry on next policy transition.
          }
        }
      }

      for (const room of this.rooms.values()) {
        if (room.kind === 'chat') {
          this.broadcastPublications(room);
          this.broadcastStatus(room);
        }
      }
    } finally {
      this.enforcementRunning = false;
    }
  }

  private sendResponse(
    ws: SfuConnection,
    requestId: string,
    ok: boolean,
    data: unknown = null,
    error: unknown = null,
  ): void {
    if (!this.closed) {
      this.send(ws, { type: 'sfu-response', requestId, ok, data, error });
    }
  }

  private publicError(
    error: unknown,
    code = 'SFU_REQUEST_FAILED',
  ): { code: string; message: string } {
    if (!isPlainObject(error) && !(error instanceof Error)) {
      return { code, message: 'Falha ao comunicar com Cloudflare Realtime.' };
    }
    const errObj = error as unknown as Record<string, unknown>;
    const detail =
      Array.isArray(errObj.publicErrors) && isPlainObject(errObj.publicErrors[0])
        ? errObj.publicErrors[0]
        : undefined;
    return {
      code: typeof detail?.errorCode === 'string' ? detail.errorCode : code,
      message: String(
        typeof detail?.errorDescription === 'string'
          ? detail.errorDescription
          : error instanceof Error
            ? error.message
            : 'Falha ao comunicar com Cloudflare Realtime.',
      ).slice(0, 260),
    };
  }
}

// Re-export helpers for direct unit/integration inspection without unused import warnings
export { isSfuQualityPreset, isSfuSimulcastRid, providerUnavailable };
