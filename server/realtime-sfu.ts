import { setTimeout as delay } from 'node:timers/promises';
import { createIceProvider } from './ice.ts';
import {
  PROFILE,
  readRealtimeSettings,
  realtimePolicy,
  clampRealtimeQuality,
  clampRealtimeRid,
  subscriptionBitrate,
  isRealtimeKind,
  isRealtimeQuality,
  isRealtimeRid,
  type RealtimeSettings,
  type RealtimePolicy,
  type RealtimeKind,
  type RealtimeQuality,
  type RealtimeRid,
} from './realtime-policy.ts';
import { createRealtimeUsage } from './realtime-usage.ts';
import {
  createRealtimeProvider,
  realtimeFailure,
  providerUnavailable,
  sdpOk,
} from './realtime-provider.ts';
import type {
  RealtimeConnection,
  RealtimePlayer,
  RealtimeRoom,
  RealtimeSession,
  RealtimePublication,
  RealtimeSubscription,
  RealtimeProviderResponse,
} from './realtime-contract';
import { object } from './http-api.ts';
export { PROFILE };
interface Options {
  rooms: ReadonlyMap<string, RealtimeRoom>;
  send(ws: RealtimeConnection, message: { type: string; [key: string]: unknown }): void;
  broadcastVoiceRoster(room: RealtimeRoom): void;
  version: string;
  env?: NodeJS.ProcessEnv;
  usageFile?: string;
  fetchImpl?: typeof fetch;
}
interface RemoteTrackRequest {
  location: 'remote';
  sessionId: string;
  trackName: string;
  simulcast?: {
    preferredRid: RealtimeRid;
    priorityOrdering: 'asciibetical';
    ridNotAvailable: 'asciibetical';
  };
}
interface SfuMessage {
  requestId: string;
  action: string;
  payload: Record<string, unknown>;
}
const stringValue = (value: unknown) => (typeof value === 'string' ? value : '');
function readSfuMessage(value: unknown): SfuMessage | null {
  if (!object(value) || typeof value.requestId !== 'string' || !value.requestId) return null;
  return {
    requestId: value.requestId.slice(0, 80),
    action: stringValue(value.action),
    payload: object(value.payload) ? value.payload : {},
  };
}
export class RealtimeSfuManager {
  private readonly settings: RealtimeSettings;
  private readonly rooms: ReadonlyMap<string, RealtimeRoom>;
  private readonly send: Options['send'];
  private readonly broadcastVoiceRoster: Options['broadcastVoiceRoster'];
  private readonly version: string;
  private readonly ice: ReturnType<typeof createIceProvider>;
  private readonly provider: ReturnType<typeof createRealtimeProvider>;
  private readonly scope = new AbortController();
  private readonly clientScopes = new Map<string, AbortController>();
  private readonly sessions = new Map<string, RealtimeSession>();
  private readonly sessionQueues = new Map<string, Promise<void>>();
  private readonly publicationsByRoom = new Map<string, Map<string, RealtimePublication>>();
  private readonly subscriptions = new Map<string, RealtimeSubscription>();
  private readonly pendingPublishers = new Map<string, Map<string, Set<object>>>();
  private readonly usageMeter: ReturnType<typeof createRealtimeUsage>;
  private readonly timer: NodeJS.Timeout;
  private lastPolicySignature = '';
  private lastRestrictionSignature = '';
  private enforcementRunning = false;
  private closed = false;
  private stopPromise?: Promise<void>;
  constructor({
    rooms,
    send,
    broadcastVoiceRoster,
    version,
    fetchImpl = fetch,
    env = process.env,
    usageFile = env.REALTIME_USAGE_FILE || '/tmp/a_lei_do_trono_realtime_usage.json',
  }: Options) {
    this.rooms = rooms;
    this.send = send;
    this.broadcastVoiceRoster = broadcastVoiceRoster;
    this.version = version;
    this.settings = readRealtimeSettings(env);
    this.provider = createRealtimeProvider({
      appId: this.settings.appId,
      token: this.settings.token,
      fetchImpl,
    });
    this.ice = createIceProvider({
      enabled: this.settings.turnEnabled,
      keyId: this.settings.turnKeyId,
      token: this.settings.turnToken,
      ttl: this.settings.turnTtl,
      fetchImpl,
    });
    this.usageMeter = createRealtimeUsage({ file: usageFile });
    this.timer = setInterval(() => this._tick(), 5000);
    this.timer.unref?.();
  }

  get usage() {
    return this.usageMeter.state;
  }
  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (this.closed) return Promise.resolve();
    this.closed = true;
    clearInterval(this.timer);
    this.usageMeter.advance(this._currentEgressBps());
    this.usageMeter.save();
    const closing = new Map<string, Set<string>>();
    const remember = (sessionId: string, mid: string | undefined) => {
      if (!mid) return;
      const mids = closing.get(sessionId) ?? new Set<string>();
      mids.add(mid);
      closing.set(sessionId, mids);
    };
    for (const [sessionId, session] of this.sessions) remember(sessionId, session.mid);
    for (const map of this.publicationsByRoom.values())
      for (const pub of map.values()) remember(pub.sessionId, pub.mid);
    for (const sub of this.subscriptions.values()) remember(sub.sessionId, sub.mid);
    this.scope.abort();
    this.ice.stop();
    for (const client of this.clientScopes.values()) client.abort();
    this.clientScopes.clear();
    this.pendingPublishers.clear();
    this.sessions.clear();
    this.subscriptions.clear();
    this.publicationsByRoom.clear();
    this.sessionQueues.clear();
    // Closing already-known tracks has its own bounded scope; no state or events can be restored.
    const deadline = AbortSignal.timeout(3000);
    this.stopPromise = Promise.allSettled(
      this.configured()
        ? [...closing].map(([sessionId, mids]) =>
            this.provider.request(
              'PUT',
              `/sessions/${encodeURIComponent(sessionId)}/tracks/close`,
              { tracks: [...mids].map((mid) => ({ mid })), force: true },
              deadline,
            ),
          )
        : [],
    ).then(() => undefined);
    return this.stopPromise;
  }
  configured() {
    return !!(this.settings.appId && this.settings.token);
  }
  turnConfigured() {
    return !!(this.settings.turnKeyId && this.settings.turnToken);
  }
  policy() {
    return realtimePolicy(this.settings, this.usage);
  }
  statusPayload() {
    const p = this.policy();
    return {
      type: 'realtime-status',
      version: this.version,
      mode: 'cloudflare-sfu',
      experimental: true,
      ...p,
      usagePersistence: 'ephemeral-with-local-checkpoint',
    };
  }
  publicHealth() {
    const p = this.policy();
    return {
      configured: p.configured,
      enabled: p.enabled,
      hardBlocked: p.hardBlocked,
      estimatedGb: p.estimatedGb,
      maxQuality: p.maxQuality,
      screenAllowed: p.screenAllowed,
      thresholds: p.thresholds,
      month: p.month,
      maxParticipants: p.maxParticipants,
      estimateSafetyFactor: p.estimateSafetyFactor,
      turnConfigured: this.turnConfigured(),
      turnEnabled: this.settings.turnEnabled,
    };
  }
  roomPublications(roomId: string) {
    const map = this.publicationsByRoom.get(roomId);
    if (!map) return [];
    return [...map.values()]
      .filter((p) => p.ready)
      .map((p) => ({
        ownerId: p.ownerId,
        ownerName: p.ownerName,
        kind: p.kind,
        sessionId: p.sessionId,
        trackName: p.trackName,
        quality: p.quality,
        screenBitrate: p.screenBitrate,
        rids: p.rids || [],
        createdAt: p.createdAt,
      }));
  }
  broadcastPublications(room: RealtimeRoom | undefined) {
    if (this.closed || !room) return;
    const publications = this.roomPublications(room.id);
    for (const p of room.players.values())
      if (p.voiceJoined)
        this.send(p.ws, { type: 'sfu-publications', roomId: room.id, publications });
  }
  broadcastStatus(room: RealtimeRoom | undefined) {
    if (!room) return;
    const payload = this.statusPayload();
    for (const p of room.players.values()) if (p.voiceJoined) this.send(p.ws, payload);
  }

  _currentEgressBps() {
    let total = 0;
    for (const sub of this.subscriptions.values())
      total += Math.max(0, Number(sub.estimatedBps) || 0);
    return total;
  }
  _tick(force = false) {
    if (this.closed) return;
    const now = Date.now();
    this.usageMeter.advance(this._currentEgressBps(), now);
    if (force || now % 15000 < 5200) this.usageMeter.save(now);
    const currentPolicy = this.policy(),
      sig = JSON.stringify(currentPolicy);
    if (sig !== this.lastPolicySignature) {
      this.lastPolicySignature = sig;
      for (const room of this.rooms.values()) if (room.kind === 'chat') this.broadcastStatus(room);
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
      void this._enforcePolicy(currentPolicy);
    }
  }
  async _enforcePolicy(policy: RealtimePolicy) {
    if (this.closed || this.enforcementRunning || !policy?.configured || !policy?.enabled) return;
    this.enforcementRunning = true;
    try {
      if (policy.hardBlocked) {
        for (const sub of [...this.subscriptions.values()])
          await this._closeSubscription(sub, true).catch(() => {});
        for (const roomMap of this.publicationsByRoom.values())
          for (const pub of [...roomMap.values()])
            await this._closePublication(pub, true).catch(() => {});
      } else {
        if (!policy.screenAllowed) {
          for (const roomMap of this.publicationsByRoom.values())
            for (const pub of [...roomMap.values()].filter(
              (p) => p.kind === 'screen' || p.kind === 'screen-audio',
            ))
              await this._closePublication(pub, true).catch(() => {});
        }
        for (const sub of this.subscriptions.values()) {
          if (!['camera', 'screen'].includes(sub.kind)) continue;
          const pub = this._pubMap(sub.roomId).get(this._pubKey(sub.publisherId, sub.kind));
          if (!pub) continue;
          const desired = this._clampRid(pub, sub.preferredRid, 'balanced');
          if (desired === sub.preferredRid) continue;
          try {
            await this._cf('PUT', `/sessions/${encodeURIComponent(sub.sessionId)}/tracks/update`, {
              tracks: [
                {
                  mid: sub.mid,
                  simulcast: {
                    preferredRid: desired,
                    priorityOrdering: 'asciibetical',
                    ridNotAvailable: 'asciibetical',
                  },
                },
              ],
            });
            if (this.closed || this.subscriptions.get(sub.sessionId) !== sub) continue;
            sub.preferredRid = desired;
            sub.estimatedBps = this._subscriptionBps(pub, desired);
          } catch {}
        }
      }
      for (const room of this.rooms.values())
        if (room.kind === 'chat') {
          this.broadcastPublications(room);
          this.broadcastStatus(room);
        }
    } finally {
      this.enforcementRunning = false;
    }
  }

  _allowedRoomPlayer(
    ws: RealtimeConnection,
    requireVoice = true,
  ):
    { error: 'SFU_CHAT_ONLY' | 'VOICE_REQUIRED' } | { room: RealtimeRoom; player: RealtimePlayer } {
    const room = this.rooms.get(ws.roomId || ''),
      player = room?.players.get(ws.clientId);
    if (!room || !player || player.ws !== ws || room.kind !== 'chat' || room.channelType === 'text')
      return { error: 'SFU_CHAT_ONLY' };
    if (requireVoice && !player.voiceJoined) return { error: 'VOICE_REQUIRED' };
    return { room, player };
  }
  _assertAvailable(
    kind: RealtimeKind = 'audio',
    quality: RealtimeQuality = 'balanced',
  ): { ok: true; policy: RealtimePolicy } | { ok: false; code: string; message: string } {
    const p = this.policy();
    if (!this.settings.enabled)
      return {
        ok: false,
        code: 'REALTIME_DISABLED',
        message: 'Cloudflare Realtime está desligado pelo kill switch.',
      };
    if (!this.configured())
      return {
        ok: false,
        code: 'REALTIME_NOT_CONFIGURED',
        message: 'Cloudflare Realtime não está configurado no backend.',
      };
    if (p.hardBlocked)
      return {
        ok: false,
        code: 'REALTIME_HARD_LIMIT',
        message: 'Limite operacional mensal do Realtime atingido.',
      };
    if ((kind === 'screen' || kind === 'screen-audio') && !p.screenAllowed)
      return {
        ok: false,
        code: 'SCREEN_BUDGET_BLOCKED',
        message: 'Compartilhamento bloqueado pelo freio de consumo.',
      };
    if (quality === 'high' && !p.highAllowed)
      return {
        ok: false,
        code: 'HIGH_BUDGET_BLOCKED',
        message: 'Qualidade Alta foi bloqueada pelo freio de consumo.',
      };
    return { ok: true, policy: p };
  }
  _sessionOwned(ws: RealtimeConnection, sessionId: string) {
    const s = this.sessions.get(String(sessionId || ''));
    return s && s.ownerId === ws.clientId && s.roomId === ws.roomId ? s : null;
  }
  _pubMap(roomId: string) {
    if (this.closed)
      throw realtimeFailure('SFU_SESSION_STALE', 'O serviço de mídia foi encerrado.');
    if (!this.publicationsByRoom.has(roomId)) this.publicationsByRoom.set(roomId, new Map());
    return this.publicationsByRoom.get(roomId)!;
  }
  _pubKey(ownerId: string, kind: RealtimeKind) {
    return `${ownerId}:${kind}`;
  }
  _clampQuality(q: unknown) {
    return clampRealtimeQuality(q, this.policy());
  }
  clampQuality(q: unknown) {
    return this._clampQuality(q);
  }
  notePlayerQuality(roomId: string, ownerId: string, q: unknown) {
    const quality = this._clampQuality(q),
      map = this._pubMap(roomId);
    for (const pub of map.values()) if (pub.ownerId === ownerId) pub.quality = quality;
    for (const sub of this.subscriptions.values()) {
      if (sub.roomId !== roomId || sub.publisherId !== ownerId) continue;
      const pub = map.get(this._pubKey(ownerId, sub.kind));
      if (pub) sub.estimatedBps = this._subscriptionBps(pub, sub.preferredRid);
    }
    return quality;
  }
  _clampRid(pub: RealtimePublication, requestedRid: unknown, desiredQuality: unknown = 'balanced') {
    return clampRealtimeRid(pub, requestedRid, desiredQuality, this.policy());
  }
  _subscriptionBps(pub: RealtimePublication, preferredRid: RealtimeRid | null) {
    return subscriptionBitrate(pub, preferredRid, this.settings.estimateSafetyFactor);
  }
  async _publicationActive(
    pub: RealtimePublication,
    { maxAge = 1200, signal }: { maxAge?: number; signal?: AbortSignal } = {},
  ) {
    if (!pub?.sessionId || !pub?.trackName) return false;
    if (pub.lastVerifiedAt && Date.now() - pub.lastVerifiedAt < maxAge) return true;
    let info;
    try {
      info = await this._cf(
        'GET',
        `/sessions/${encodeURIComponent(pub.sessionId)}`,
        undefined,
        signal,
      );
    } catch (err) {
      if (object(err) && (err.status === 404 || err.status === 410)) return false;
      throw err;
    }
    const track = (info?.tracks || []).find(
      (t) => t && t.location === 'local' && String(t.trackName || '') === String(pub.trackName),
    );
    const active = !!track && track.status !== 'inactive';
    if (active) {
      pub.lastVerifiedAt = Date.now();
      pub.remoteStatus = track.status || 'active';
    }
    return active;
  }
  async _waitPublicationActive(pub: RealtimePublication, timeoutMs = 4200, signal?: AbortSignal) {
    const end = Date.now() + timeoutMs;
    let lastError = null;
    do {
      try {
        if (await this._publicationActive(pub, { maxAge: 0, signal })) return true;
      } catch (err) {
        lastError = err;
      }
      await delay(260, undefined, {
        signal: AbortSignal.any([this.scope.signal, ...(signal ? [signal] : [])]),
      });
    } while (Date.now() < end);
    if (lastError) throw lastError;
    return false;
  }
  async _pruneStalePublication(room: RealtimeRoom, pub: RealtimePublication) {
    if (this.closed || !pub) return;
    const map = this._pubMap(pub.roomId),
      key = this._pubKey(pub.ownerId, pub.kind);
    if (map.get(key)?.sessionId === pub.sessionId) map.delete(key);
    const related = [...this.subscriptions.values()].filter(
      (s) => s.roomId === pub.roomId && s.publisherSessionId === pub.sessionId,
    );
    for (const sub of related) await this._closeSubscription(sub, true).catch(() => {});
    this.sessions.delete(pub.sessionId);
    if (room) this.broadcastPublications(room);
  }

  async _turnIceServers(signal?: AbortSignal) {
    return this.ice.configuration(signal);
  }

  async _cf(
    method: 'GET' | 'POST' | 'PUT',
    suffix: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<RealtimeProviderResponse> {
    if (this.closed) throw providerUnavailable();
    return this.provider.request(
      method,
      suffix,
      body,
      AbortSignal.any([this.scope.signal, ...(signal ? [signal] : [])]),
    );
  }
  _sendResponse(
    ws: RealtimeConnection,
    requestId: string,
    ok: boolean,
    data: unknown = null,
    error: unknown = null,
  ) {
    if (!this.closed) this.send(ws, { type: 'sfu-response', requestId, ok, data, error });
  }
  _publicError(error: unknown, code = 'SFU_REQUEST_FAILED') {
    const detail =
      object(error) && Array.isArray(error.publicErrors) && object(error.publicErrors[0])
        ? error.publicErrors[0]
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
  async handleRequest(ws: RealtimeConnection, value: unknown) {
    if (this.closed) return;
    const message = readSfuMessage(value);
    if (!message) return;
    if (message.action === 'status' || 'error' in this._allowedRoomPlayer(ws, true))
      return this._handleRequest(ws, message);
    const sid = stringValue(message.payload.sessionId);
    const contextKey = `${ws.roomId || ''}:${ws.clientId}`;
    const key = sid
      ? `${contextKey}:session:${sid}`
      : message.action === 'publish-track'
        ? `${contextKey}:publish:${stringValue(message.payload.kind)}`
        : '';
    if (!key) return this._handleRequest(ws, message);
    const client = this._clientScope(contextKey);
    const queued = (this.sessionQueues.get(key) || Promise.resolve())
      .catch(() => {})
      .then(() => {
        if (this.closed) return;
        if (client.signal.aborted || this.clientScopes.get(contextKey) !== client) {
          this._sendResponse(ws, message.requestId, false, null, {
            code: 'SFU_SESSION_STALE',
            message: 'A chamada mudou durante a operação SFU.',
          });
          return;
        }
        return this._handleRequest(ws, message);
      });
    this.sessionQueues.set(key, queued);
    try {
      await queued;
    } finally {
      if (this.sessionQueues.get(key) === queued) this.sessionQueues.delete(key);
    }
  }
  private _clientScope(key: string) {
    let client = this.clientScopes.get(key);
    if (!client) {
      client = new AbortController();
      this.clientScopes.set(key, client);
    }
    return client;
  }
  private _reservePublisher(roomId: string, ownerId: string) {
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
      if (!owners.size && this.pendingPublishers.get(roomId) === owners)
        this.pendingPublishers.delete(roomId);
    };
  }
  async _handleRequest(ws: RealtimeConnection, message: SfuMessage) {
    if (this.closed) return;
    const { requestId, action, payload } = message;
    if (!requestId) return;
    if (action === 'status') {
      this._sendResponse(ws, requestId, true, this.statusPayload());
      return;
    }
    const auth = this._allowedRoomPlayer(ws, true);
    if ('error' in auth) {
      this._sendResponse(ws, requestId, false, null, {
        code: auth.error,
        message: 'Operação SFU não autorizada neste contexto.',
      });
      return;
    }
    const { room, player } = auth;
    if (
      room.voiceMode === 'p2p' &&
      !['ice-config', 'close-publication', 'close-subscription', 'close-tracks'].includes(action)
    ) {
      this._sendResponse(ws, requestId, false, null, {
        code: 'ROOM_P2P',
        message: 'A sala está sincronizada em P2P.',
      });
      return;
    }
    const contextKey = `${room.id}:${player.id}`;
    const client = this._clientScope(contextKey);
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
      )
        throw Object.assign(new Error('A chamada mudou durante a operação SFU.'), {
          code: 'SFU_SESSION_STALE',
        });
    };
    try {
      if (action === 'ice-config') {
        try {
          this._sendResponse(ws, requestId, true, await this._turnIceServers(signal));
        } catch (err) {
          this._sendResponse(ws, requestId, true, {
            iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
            turn: false,
            warning: 'TURN indisponível; usando STUN.',
          });
        }
        return;
      }
      if (action === 'list-publications') {
        this._sendResponse(ws, requestId, true, { publications: this.roomPublications(room.id) });
        return;
      }
      if (action === 'publication-ready') {
        const sessionId = stringValue(payload.sessionId),
          session = this._sessionOwned(ws, sessionId);
        if (!session || session.purpose !== 'publish')
          throw Object.assign(new Error('Publicação não encontrada.'), { code: 'BAD_SFU_READY' });
        const pub = this._pubMap(room.id).get(this._pubKey(player.id, session.kind));
        if (!pub || pub.sessionId !== sessionId)
          throw Object.assign(new Error('Publicação não encontrada.'), {
            code: 'PUBLICATION_NOT_FOUND',
          });
        const active = await this._waitPublicationActive(pub, 4200, signal);
        ensureCurrent();
        if (this._pubMap(room.id).get(this._pubKey(player.id, pub.kind)) !== pub)
          throw Object.assign(new Error('A publicação foi substituída.'), {
            code: 'PUBLICATION_STALE',
          });
        if (!active)
          throw Object.assign(
            new Error('A track foi negociada, mas ainda não ficou ativa no SFU.'),
            { code: 'PUBLICATION_NOT_ACTIVE' },
          );
        pub.ready = true;
        pub.readyAt = Date.now();
        if (pub.kind === 'audio') player.mediaTransport = 'sfu';
        this.broadcastPublications(room);
        this.broadcastVoiceRoster(room);
        this._sendResponse(ws, requestId, true, {
          ready: true,
          kind: pub.kind,
          trackName: pub.trackName,
          rids: pub.rids,
        });
        return;
      }
      if (action === 'publish-track') {
        const kind = stringValue(payload.kind),
          quality = isRealtimeQuality(payload.quality) ? payload.quality : 'balanced';
        if (
          !isRealtimeKind(kind) ||
          !sdpOk(payload.sessionDescription, 'offer') ||
          typeof payload.mid !== 'string' ||
          !payload.mid ||
          payload.mid.length > 128
        )
          throw Object.assign(new Error('Publicação inválida.'), { code: 'BAD_SFU_PUBLISH' });
        const gate = this._assertAvailable(kind, quality);
        if (!gate.ok) {
          this._sendResponse(ws, requestId, false, null, gate);
          return;
        }
        const publishing = new Set([...this._pubMap(room.id).values()].map((p) => p.ownerId));
        for (const owner of this.pendingPublishers.get(room.id)?.keys() || [])
          publishing.add(owner);
        const activeSfu = [...room.players.values()].filter(
          (p) => p.voiceJoined && (p.mediaTransport === 'sfu' || publishing.has(p.id)),
        );
        if (
          !activeSfu.some((p) => p.id === player.id) &&
          activeSfu.length >= this.settings.maxParticipants
        ) {
          this._sendResponse(ws, requestId, false, null, {
            code: 'SFU_ROOM_SAFETY_LIMIT',
            message: `Limite de segurança do SFU (${this.settings.maxParticipants} participantes simultâneos) atingido.`,
          });
          return;
        }
        const release = this._reservePublisher(room.id, player.id);
        try {
          const existing = this._pubMap(room.id).get(this._pubKey(player.id, kind));
          if (existing) {
            await this._closePublication(existing, true).catch(() => {});
            this.broadcastPublications(room);
          }
          const sessionId = await this._openSession(signal);
          ensureCurrent();
          this.sessions.set(sessionId, {
            ownerId: player.id,
            roomId: room.id,
            purpose: 'publish',
            kind,
            mid: payload.mid as string,
            createdAt: Date.now(),
          });
          const trackName = `${kind}-${String(player.id)
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 8)}-${Date.now().toString(36)}`;
          const requestedRids = Array.isArray(payload.rids)
            ? [...new Set(payload.rids.filter(isRealtimeRid))]
            : [];
          try {
            const body = {
              sessionDescription: { type: 'offer', sdp: payload.sessionDescription.sdp },
              tracks: [{ location: 'local', mid: String(payload.mid), trackName }],
            };
            const result = await this._cf(
              'POST',
              `/sessions/${encodeURIComponent(sessionId)}/tracks/new`,
              body,
              signal,
            );
            const trackResult = (result.tracks || [])[0] || {};
            if (result.tracks?.length !== 1)
              throw realtimeFailure('BAD_SFU_PUBLISH', 'O provedor não confirmou a publicação.');
            if (trackResult.errorCode)
              throw Object.assign(
                new Error(trackResult.errorDescription || 'Falha ao publicar track.'),
                { code: trackResult.errorCode },
              );
            ensureCurrent();
            const actualTrackName = String(trackResult.trackName || trackName);
            const requestedBitrate = Number(payload.screenBitrate);
            const screenBitrate =
              kind === 'screen'
                ? Math.min(
                    this.policy().highAllowed ? 15000000 : 6000000,
                    Math.max(
                      4000000,
                      Number.isFinite(requestedBitrate)
                        ? requestedBitrate
                        : PROFILE[quality].screen,
                    ),
                  )
                : null;
            const pub: RealtimePublication = {
              ownerId: player.id,
              ownerName: player.name,
              roomId: room.id,
              kind,
              quality,
              sessionId,
              trackName: actualTrackName,
              mid: String(payload.mid),
              screenBitrate,
              rids: ['camera', 'screen'].includes(kind) ? requestedRids : [],
              ready: false,
              createdAt: Date.now(),
              lastVerifiedAt: 0,
            };
            this._pubMap(room.id).set(this._pubKey(player.id, kind), pub);
            if (kind === 'audio') player.mediaTransport = 'sfu-pending';
            player.transmissionQuality = quality;
            this.broadcastVoiceRoster(room);
            this._sendResponse(ws, requestId, true, {
              sessionId,
              sessionDescription: result.sessionDescription || null,
              publication: { kind, trackName: actualTrackName, quality, rids: pub.rids },
            });
            return;
          } catch (error) {
            await this._discardSession(sessionId, payload.mid);
            throw error;
          }
        } finally {
          release();
        }
      }
      if (action === 'subscribe-track') {
        const publisherId = stringValue(payload.publisherId),
          kind = stringValue(payload.kind),
          quality = isRealtimeQuality(payload.quality) ? payload.quality : 'balanced';
        if (!isRealtimeKind(kind) || publisherId === player.id)
          throw Object.assign(new Error('Assinatura inválida.'), { code: 'BAD_SFU_SUBSCRIBE' });
        const pub = this._pubMap(room.id).get(this._pubKey(publisherId, kind));
        if (!pub)
          throw Object.assign(new Error('Publicação não está disponível.'), {
            code: 'PUBLICATION_NOT_FOUND',
          });
        if (!pub.ready)
          throw Object.assign(new Error('Publicação ainda está conectando ao SFU.'), {
            code: 'PUBLICATION_NOT_READY',
          });
        const ensurePublicationCurrent = () => {
          ensureCurrent();
          if (this._pubMap(room.id).get(this._pubKey(publisherId, kind)) !== pub)
            throw realtimeFailure('PUBLICATION_STALE', 'A publicação foi substituída.');
        };
        if (!(await this._publicationActive(pub, { maxAge: 1200, signal }))) {
          await this._pruneStalePublication(room, pub);
          throw Object.assign(
            new Error('A publicação mudou ou foi encerrada; atualizando a lista de mídia.'),
            { code: 'PUBLICATION_STALE' },
          );
        }
        const gate = this._assertAvailable(kind, quality);
        if (!gate.ok) {
          this._sendResponse(ws, requestId, false, null, gate);
          return;
        }
        const sessionId = await this._openSession(signal);
        ensurePublicationCurrent();
        this.sessions.set(sessionId, {
          ownerId: player.id,
          roomId: room.id,
          purpose: 'subscribe',
          pendingAnswer: true,
          kind,
          publisherId,
          createdAt: Date.now(),
        });
        try {
          const preferredRid = ['camera', 'screen'].includes(kind)
            ? this._clampRid(pub, stringValue(payload.preferredRid), quality)
            : null;
          const remote: RemoteTrackRequest = {
            location: 'remote',
            sessionId: pub.sessionId,
            trackName: pub.trackName,
          };
          if (['camera', 'screen'].includes(kind) && preferredRid && pub.rids?.length)
            remote.simulcast = {
              preferredRid,
              priorityOrdering: 'asciibetical',
              ridNotAvailable: 'asciibetical',
            };
          const result = await this._cf(
            'POST',
            `/sessions/${encodeURIComponent(sessionId)}/tracks/new`,
            { tracks: [remote] },
            signal,
          );
          const tr = (result.tracks || [])[0] || {};
          if (tr.errorCode) {
            if (tr.errorCode === 'not_found_track_error') {
              await this._pruneStalePublication(room, pub);
              throw Object.assign(
                new Error(
                  'A fonte de mídia foi substituída antes da assinatura. Ressincronizando.',
                ),
                { code: 'PUBLICATION_STALE' },
              );
            }
            throw Object.assign(new Error(tr.errorDescription || 'Falha ao assinar track.'), {
              code: tr.errorCode,
            });
          }
          ensurePublicationCurrent();
          if (!sdpOk(result.sessionDescription, 'offer'))
            throw Object.assign(new Error('SFU não forneceu uma oferta SDP válida.'), {
              code: 'BAD_SFU_OFFER',
            });
          if (result.tracks?.length !== 1 || !tr.mid)
            throw realtimeFailure('BAD_SFU_OFFER', 'SFU não confirmou a track de recepção.');
          const receivingMid = tr.mid;
          this.sessions.set(sessionId, {
            ownerId: player.id,
            roomId: room.id,
            purpose: 'subscribe',
            pendingAnswer: true,
            kind,
            publisherId,
            mid: receivingMid,
            createdAt: Date.now(),
          });
          this.subscriptions.set(sessionId, {
            sessionId,
            ownerId: player.id,
            roomId: room.id,
            publisherId,
            publisherSessionId: pub.sessionId,
            kind,
            mid: receivingMid,
            preferredRid: preferredRid || null,
            estimatedBps: this._subscriptionBps(pub, preferredRid),
            createdAt: Date.now(),
          });
          this._sendResponse(ws, requestId, true, {
            sessionId,
            sessionDescription: result.sessionDescription || null,
            mid: receivingMid,
            publisherId,
            kind,
            preferredRid,
          });
          return;
        } catch (error) {
          await this._discardSession(sessionId);
          throw error;
        }
      }
      if (action === 'renegotiate') {
        const sessionId = stringValue(payload.sessionId),
          session = this._sessionOwned(ws, sessionId);
        if (!session || session.purpose !== 'subscribe')
          throw Object.assign(
            new Error('Sessão de recepção encerrada ou substituída. Ressincronize a mídia.'),
            { code: 'SFU_SESSION_STALE' },
          );
        if (!sdpOk(payload.sessionDescription, 'answer'))
          throw Object.assign(new Error('A resposta SDP da recepção está ausente ou é inválida.'), {
            code: 'BAD_SFU_ANSWER',
          });
        const answer = { type: 'answer', sdp: payload.sessionDescription.sdp };
        const result = await this._cf(
          'PUT',
          `/sessions/${encodeURIComponent(sessionId)}/renegotiate`,
          { sessionDescription: answer },
          signal,
        );
        ensureCurrent();
        session.pendingAnswer = false;
        this._sendResponse(ws, requestId, true, { accepted: true, result: result || {} });
        return;
      }
      if (action === 'set-screen-bitrate') {
        const requested = Number(payload.screenBitrate);
        if (![4000000, 6000000, 8000000, 10000000, 12000000, 15000000].includes(requested))
          throw Object.assign(new Error('Bitrate de tela inválido.'), {
            code: 'BAD_SCREEN_BITRATE',
          });
        const pub = this._pubMap(room.id).get(this._pubKey(player.id, 'screen'));
        const effective = Math.min(requested, this.policy().highAllowed ? 15000000 : 6000000);
        if (pub) {
          pub.screenBitrate = effective;
          for (const sub of this.subscriptions.values())
            if (sub.roomId === room.id && sub.publisherId === player.id && sub.kind === 'screen')
              sub.estimatedBps = this._subscriptionBps(pub, sub.preferredRid);
          this.broadcastPublications(room);
        }
        this._sendResponse(ws, requestId, true, { screenBitrate: effective });
        return;
      }
      if (action === 'update-subscription') {
        const sessionId = stringValue(payload.sessionId),
          session = this._sessionOwned(ws, sessionId),
          sub = this.subscriptions.get(sessionId);
        if (!session || !sub || !['camera', 'screen'].includes(sub.kind))
          throw Object.assign(new Error('Assinatura de vídeo não encontrada.'), {
            code: 'BAD_SFU_UPDATE',
          });
        if (session.pendingAnswer)
          throw Object.assign(new Error('A resposta da negociação ainda está pendente.'), {
            code: 'SFU_NEGOTIATION_PENDING',
          });
        const pub = this._pubMap(room.id).get(this._pubKey(sub.publisherId, sub.kind));
        if (!pub)
          throw Object.assign(new Error('Publicação de vídeo não encontrada.'), {
            code: 'PUBLICATION_NOT_FOUND',
          });
        const preferredRid = this._clampRid(
          pub,
          stringValue(payload.preferredRid),
          player.transmissionQuality || 'balanced',
        );
        if (!preferredRid || !pub.rids?.length) {
          sub.preferredRid = null;
          sub.estimatedBps = this._subscriptionBps(pub, null);
          this._sendResponse(ws, requestId, true, { preferredRid: null, simulcast: false });
          return;
        }
        const result = await this._cf(
          'PUT',
          `/sessions/${encodeURIComponent(sessionId)}/tracks/update`,
          {
            tracks: [
              {
                mid: sub.mid,
                simulcast: {
                  preferredRid,
                  priorityOrdering: 'asciibetical',
                  ridNotAvailable: 'asciibetical',
                },
              },
            ],
          },
          signal,
        );
        ensureCurrent();
        if (this.subscriptions.get(sessionId) !== sub)
          throw realtimeFailure('SFU_SESSION_STALE', 'A assinatura foi encerrada.');
        sub.preferredRid = preferredRid;
        sub.estimatedBps = this._subscriptionBps(pub, preferredRid);
        this._sendResponse(ws, requestId, true, { preferredRid, result, simulcast: true });
        return;
      }
      if (action === 'close-publication') {
        const sessionId = stringValue(payload.sessionId),
          session = this._sessionOwned(ws, sessionId);
        if (!session || session.purpose !== 'publish')
          throw Object.assign(new Error('Publicação não encontrada.'), { code: 'BAD_SFU_CLOSE' });
        const pub = this._pubMap(room.id).get(this._pubKey(player.id, session.kind));
        if (pub && pub.sessionId === sessionId) await this._closePublication(pub, false);
        else this.sessions.delete(sessionId);
        this.broadcastPublications(room);
        this._sendResponse(ws, requestId, true, { closed: true });
        return;
      }
      if (action === 'close-subscription') {
        const sessionId = stringValue(payload.sessionId),
          session = this._sessionOwned(ws, sessionId),
          sub = this.subscriptions.get(sessionId);
        if (!session || !sub)
          throw Object.assign(new Error('Assinatura não encontrada.'), { code: 'BAD_SFU_CLOSE' });
        await this._closeSubscription(sub, false);
        this._sendResponse(ws, requestId, true, { closed: true });
        return;
      }
      this._sendResponse(ws, requestId, false, null, {
        code: 'UNKNOWN_SFU_ACTION',
        message: 'Ação SFU desconhecida.',
      });
    } catch (err) {
      this._sendResponse(ws, requestId, false, null, {
        ...this._publicError(
          err,
          object(err) && typeof err.code === 'string' ? err.code : 'SFU_REQUEST_FAILED',
        ),
      });
    }
  }

  async _closePublication(pub: RealtimePublication | undefined, silent = false) {
    if (this.closed || !pub) return;
    const related = [...this.subscriptions.values()].filter(
      (s) => s.roomId === pub.roomId && s.publisherSessionId === pub.sessionId,
    );
    this.sessions.delete(pub.sessionId);
    const map = this._pubMap(pub.roomId);
    if (map.get(this._pubKey(pub.ownerId, pub.kind)) === pub)
      map.delete(this._pubKey(pub.ownerId, pub.kind));
    for (const sub of related) {
      this.subscriptions.delete(sub.sessionId);
      this.sessions.delete(sub.sessionId);
    }
    try {
      if (this.configured())
        await this._cf('PUT', `/sessions/${encodeURIComponent(pub.sessionId)}/tracks/close`, {
          tracks: [{ mid: pub.mid }],
          force: true,
        });
    } catch (err) {
      if (!silent) throw err;
    }
    for (const sub of related) await this._closeSubscription(sub, true).catch(() => {});
  }
  async _closeSubscription(sub: RealtimeSubscription | undefined, silent = false) {
    if (this.closed || !sub) return;
    try {
      if (this.configured())
        await this._cf('PUT', `/sessions/${encodeURIComponent(sub.sessionId)}/tracks/close`, {
          tracks: [{ mid: sub.mid }],
          force: true,
        });
    } catch (err) {
      if (!silent) throw err;
    }
    this.subscriptions.delete(sub.sessionId);
    this.sessions.delete(sub.sessionId);
  }
  private async _openSession(signal: AbortSignal) {
    const response = await this._cf('POST', '/sessions/new', undefined, signal);
    if (!response.sessionId || this.sessions.has(response.sessionId))
      throw realtimeFailure(
        'SFU_RESPONSE_INVALID',
        'O provedor não retornou uma nova sessão de mídia.',
      );
    return response.sessionId;
  }
  private async _discardSession(sessionId: string, mid?: string) {
    this.sessions.delete(sessionId);
    if (this.closed || !this.configured()) return;
    const deadline = AbortSignal.timeout(3000);
    try {
      const mids = mid
        ? [mid]
        : (
            await this._cf('GET', `/sessions/${encodeURIComponent(sessionId)}`, undefined, deadline)
          ).tracks?.flatMap((track) => (track.mid ? [track.mid] : [])) || [];
      if (mids.length)
        await this._cf(
          'PUT',
          `/sessions/${encodeURIComponent(sessionId)}/tracks/close`,
          {
            tracks: mids.map((mid) => ({ mid })),
            force: true,
          },
          deadline,
        );
    } catch {}
  }
  async cleanupClient(clientId: string, roomId: string) {
    if (this.closed) return;
    const key = `${roomId}:${clientId}`;
    this.clientScopes.get(key)?.abort();
    this.clientScopes.delete(key);
    for (const queueKey of this.sessionQueues.keys())
      if (queueKey.startsWith(key + ':')) this.sessionQueues.delete(queueKey);
    this.pendingPublishers.get(roomId)?.delete(clientId);
    if (!this.pendingPublishers.get(roomId)?.size) this.pendingPublishers.delete(roomId);
    // Capture and detach everything before yielding. A late teardown must never select
    // subscriptions created by the next join to this same room.
    const pubs = [...this._pubMap(roomId).values()].filter((p) => p.ownerId === clientId);
    const subs = [...this.subscriptions.values()].filter(
      (s) => s.roomId === roomId && s.ownerId === clientId,
    );
    const detached = new Set([
      ...pubs.map((pub) => pub.sessionId),
      ...subs.map((sub) => sub.sessionId),
    ]);
    const pending = [...this.sessions].filter(
      ([sessionId, session]) =>
        session.roomId === roomId && session.ownerId === clientId && !detached.has(sessionId),
    );
    for (const [sessionId] of pending) this.sessions.delete(sessionId);
    for (const pub of pubs) {
      this.sessions.delete(pub.sessionId);
      const map = this._pubMap(roomId);
      if (map.get(this._pubKey(clientId, pub.kind)) === pub)
        map.delete(this._pubKey(clientId, pub.kind));
    }
    for (const sub of subs) {
      this.sessions.delete(sub.sessionId);
      this.subscriptions.delete(sub.sessionId);
    }
    for (const pub of pubs) await this._closePublication(pub, true).catch(() => {});
    for (const sub of subs) await this._closeSubscription(sub, true).catch(() => {});
    for (const [sessionId, session] of pending) await this._discardSession(sessionId, session.mid);
    const room = this.rooms.get(roomId);
    if (room) this.broadcastPublications(room);
  }
}
