import { SfuPublicationRecovery, SfuSubscriptionQueue, globalSfuFailure } from './sfu-recovery.ts';
import type {
  SfuLocalPublication,
  SfuPublication,
  SfuRid,
  SfuSettings,
  SfuSubscription,
} from '../../types/sfu';
import type { VoiceMediaKind } from '../../types/voice';
import { abortable } from './peer-wait.ts';
import {
  advertisedRids,
  cameraEncodings,
  prioritizeScreenCodec,
  screenEncodings,
} from './sfu-encoding.ts';
import {
  description,
  errorCode,
  readAccepted,
  readCatalogResponse,
  readLayer,
  readPublications,
  retrySingleLayer,
  screenKind,
  sessionIdOf,
  sfuCancelled,
  sfuError,
  sfuKey,
  stalePublication,
} from './sfu-protocol.ts';

interface SfuOptions {
  getSettings(): SfuSettings;
  createConnection(config: RTCConfiguration): RTCPeerConnection;
  request(action: string, payload: Record<string, unknown>, timeout?: number): Promise<unknown>;
  wants(publication: SfuPublication): boolean;
  getTrack?(kind: VoiceMediaKind): MediaStreamTrack | null | undefined;
  onPublicationRetry?(kind: VoiceMediaKind, error: unknown, attempt: number, done: boolean): void;
  watchVersion(id: string): number;
  preferredRid(kind: VoiceMediaKind): SfuRid;
  applyQuality(sender: RTCRtpSender, kind: VoiceMediaKind): Promise<void>;
  onTrack(
    publication: SfuPublication,
    track: MediaStreamTrack,
    subscription: SfuSubscription,
    receiver: RTCRtpReceiver,
    isCurrent: () => boolean,
  ): void;
  onSubscriptionClosed(subscription: SfuSubscription): void;
  onReady(kind: VoiceMediaKind, receiving: boolean): void;
  onRetry(info: {
    publication: SfuPublication;
    code: string;
    attempt: number;
    stale: boolean;
  }): void;
  onFallback(reason: 'publisher' | 'subscription'): Promise<void>;
  onChange(): void;
  warn?: (error: unknown) => void;
}

interface Token {
  readonly generation: number;
  cancelled: boolean;
  publisherSessionId?: string;
}

interface PersistentPeer {
  readonly pc: RTCPeerConnection;
  readonly controller: AbortController;
  readonly purpose: 'publish' | 'subscribe';
  closed: boolean;
  sessionId: string | null;
  queue: Promise<void>;
  layerQueue: Promise<void>;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface MidSubscriptionBinding {
  pub: SfuPublication;
  sub: SfuSubscription;
  current: () => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBatchPublish(value: unknown) {
  if (!isRecord(value) || !sessionIdOf(value) || !Array.isArray(value.publications)) {
    throw sfuError('BAD_SFU_PUBLISH');
  }
  const first = value.publications[0];
  if (!isRecord(first) || typeof first.trackName !== 'string' || !first.trackName) {
    throw sfuError('BAD_SFU_PUBLISH');
  }
  const rids = Array.isArray(first.rids)
    ? (first.rids.filter(
        (r): r is SfuRid => r === 'f' || r === 'h' || r === 'q',
      ) as readonly SfuRid[])
    : undefined;
  return {
    sessionId: value.sessionId as string,
    trackName: first.trackName,
    rids,
    description:
      value.sessionDescription == null ? null : description(value.sessionDescription, 'answer'),
  };
}

function readBatchSubscribe(value: unknown) {
  if (!isRecord(value) || !sessionIdOf(value) || !Array.isArray(value.tracks)) {
    throw sfuError('BAD_SFU_OFFER');
  }
  const first = value.tracks[0];
  if (!isRecord(first) || typeof first.mid !== 'string') {
    throw sfuError('BAD_SFU_OFFER');
  }
  const preferredRid =
    first.preferredRid === 'f' || first.preferredRid === 'h' || first.preferredRid === 'q'
      ? (first.preferredRid as SfuRid)
      : null;
  return {
    sessionId: value.sessionId as string,
    mid: first.mid,
    preferredRid,
    description: description(value.sessionDescription, 'offer'),
  };
}

/**
 * Owns asymmetric persistent SFU peers (at most 1 Publisher + 1 Subscriber per call),
 * serialized SDP mutation queues, pending requests, catalog, and retry timers.
 * Local capture and the single WebSocket remain borrowed dependencies.
 */
export function createSfuSession(options: SfuOptions) {
  const publications = new Map<VoiceMediaKind, SfuLocalPublication>();
  const subscriptions = new Map<string, SfuSubscription>();
  const subscriptionsByMid = new Map<string, MidSubscriptionBinding>();
  const publishTokens = new Map<VoiceMediaKind, Token>();
  const subscribeTokens = new Map<string, Token>();
  const retries = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; publication: SfuPublication }
  >();
  const retryCounts = new Map<string, number>();
  const retryVersions = new Map<string, string>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[SfuSession]', error));
  const subscriptionQueue = new SfuSubscriptionQueue();
  const publicationRecovery = new SfuPublicationRecovery({
    active: () => options.getSettings().enabled,
    track: (kind) =>
      options.getTrack ? options.getTrack(kind) : publications.get(kind)?.sender.track,
    publish: (kind, track) => publish(kind, track, true),
    report: (kind, error, attempt, done) =>
      options.onPublicationRetry?.(kind, error, attempt, done),
    exhausted: async (kind, error) => {
      if (kind === 'audio' || globalSfuFailure(error)) await options.onFallback('publisher');
    },
  });

  let publisherPeer: PersistentPeer | null = null;
  let subscriberPeer: PersistentPeer | null = null;
  let generation = 0;
  let catalogRevision = 0;
  let catalog: readonly SfuPublication[] = Object.freeze([]);

  const enabled = (token: Token) =>
    !token.cancelled && token.generation === generation && options.getSettings().enabled;

  function clearDisconnectTimer(peer: PersistentPeer) {
    if (peer.disconnectTimer) {
      clearTimeout(peer.disconnectTimer);
      peer.disconnectTimer = null;
    }
  }

  function createPersistentPeer(purpose: 'publish' | 'subscribe'): PersistentPeer {
    const pc = options.createConnection(options.getSettings().ice);
    return {
      pc,
      controller: new AbortController(),
      purpose,
      closed: false,
      sessionId: null,
      queue: Promise.resolve(),
      layerQueue: Promise.resolve(),
      disconnectTimer: null,
    };
  }

  function enqueueOnPeer<T>(peer: PersistentPeer, fn: () => Promise<T>): Promise<T> {
    const run = peer.queue.then(fn, fn);
    peer.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function ensurePublisherPeer(): PersistentPeer {
    if (publisherPeer && !publisherPeer.closed) return publisherPeer;
    const peer = createPersistentPeer('publish');
    const pc = peer.pc;
    const epoch = generation;

    pc.onconnectionstatechange = () => {
      if (peer.closed || epoch !== generation || !options.getSettings().enabled) {
        clearDisconnectTimer(peer);
        return;
      }
      if (pc.connectionState === 'connected') {
        clearDisconnectTimer(peer);
        return;
      }
      if (pc.connectionState === 'failed') {
        clearDisconnectTimer(peer);
        for (const kind of [...publications.keys()]) {
          void publicationRecovery
            .recover(
              kind,
              Object.assign(new Error('Conexão SFU interrompida.'), {
                code: 'SFU_CONNECTION_FAILED',
              }),
            )
            .catch(warn);
        }
        return;
      }
      if (pc.connectionState === 'disconnected' && !peer.disconnectTimer) {
        peer.disconnectTimer = setTimeout(() => {
          peer.disconnectTimer = null;
          if (
            !peer.closed &&
            epoch === generation &&
            options.getSettings().enabled &&
            pc.connectionState === 'disconnected'
          ) {
            for (const kind of [...publications.keys()]) {
              void publicationRecovery
                .recover(
                  kind,
                  Object.assign(new Error('Conexão SFU estagnada em disconnected.'), {
                    code: 'SFU_CONNECTION_STALLED',
                  }),
                )
                .catch(warn);
            }
          }
        }, 4500);
      }
    };

    publisherPeer = peer;
    return peer;
  }

  function ensureSubscriberPeer(): PersistentPeer {
    if (subscriberPeer && !subscriberPeer.closed) return subscriberPeer;
    const peer = createPersistentPeer('subscribe');
    const pc = peer.pc;
    const epoch = generation;

    pc.ontrack = (event) => {
      const mid = event.transceiver?.mid;
      if (!mid) return;
      const binding = subscriptionsByMid.get(mid);
      if (!binding || !binding.current() || subscriptions.get(binding.sub.key) !== binding.sub) {
        return;
      }
      binding.sub.track = event.track;
      options.onTrack(binding.pub, event.track, binding.sub, event.receiver, binding.current);
    };

    pc.onconnectionstatechange = () => {
      if (peer.closed || epoch !== generation || !options.getSettings().enabled) {
        clearDisconnectTimer(peer);
        return;
      }
      if (pc.connectionState === 'connected') {
        clearDisconnectTimer(peer);
        return;
      }
      if (pc.connectionState === 'failed') {
        clearDisconnectTimer(peer);
        recoverSubscriberFailures(
          Object.assign(new Error('Conexão SFU interrompida.'), {
            code: 'SFU_CONNECTION_FAILED',
          }),
        );
        return;
      }
      if (pc.connectionState === 'disconnected' && !peer.disconnectTimer) {
        peer.disconnectTimer = setTimeout(() => {
          peer.disconnectTimer = null;
          if (
            !peer.closed &&
            epoch === generation &&
            options.getSettings().enabled &&
            pc.connectionState === 'disconnected'
          ) {
            recoverSubscriberFailures(
              Object.assign(new Error('Assinatura SFU estagnada em disconnected.'), {
                code: 'SFU_CONNECTION_STALLED',
              }),
            );
          }
        }, 4500);
      }
    };

    subscriberPeer = peer;
    return peer;
  }

  function recoverSubscriberFailures(error: Error) {
    const bindings = [...subscriptionsByMid.values()];
    for (const binding of bindings) {
      void closeSubscription(binding.sub.key, false);
      retry(binding.pub, error);
    }
  }

  function disposePeer(peer: PersistentPeer | null, notifyServer: boolean) {
    if (!peer || peer.closed) return;
    peer.closed = true;
    clearDisconnectTimer(peer);
    peer.controller.abort();
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch (error) {
      warn(error);
    }
    if (notifyServer && peer.sessionId) {
      void options
        .request(
          'close-session',
          { sessionId: peer.sessionId, purpose: peer.purpose },
          peer.purpose === 'publish' ? 9000 : 8000,
        )
        .catch(warn);
    }
  }

  function peerRequest(
    peer: PersistentPeer,
    action: string,
    payload: Record<string, unknown>,
    timeout?: number,
  ) {
    const result = options.request(action, payload, timeout).then((value) => {
      if (
        action === 'ensure-session' ||
        action === 'publish-tracks' ||
        action === 'subscribe-tracks'
      ) {
        const sid = sessionIdOf(value);
        if (sid) peer.sessionId = sid;
      }
      return value;
    });
    return abortable(result, peer.controller.signal);
  }

  async function ensureSessionId(peer: PersistentPeer): Promise<string> {
    if (peer.sessionId) return peer.sessionId;
    const reply = await peerRequest(
      peer,
      'ensure-session',
      { purpose: peer.purpose },
      peer.purpose === 'publish' ? 9000 : 8000,
    );
    const sid = sessionIdOf(reply);
    if (!sid) throw sfuError('BAD_SFU_SESSION');
    peer.sessionId = sid;
    return sid;
  }

  async function closePublication(kind: VoiceMediaKind, cancelRecovery = true): Promise<void> {
    if (cancelRecovery) publicationRecovery.cancel(kind);
    const token = publishTokens.get(kind);
    if (token) token.cancelled = true;
    publishTokens.delete(kind);

    const pub = publications.get(kind);
    if (!pub) return;
    publications.delete(kind);

    const peer = publisherPeer;
    try {
      await pub.sender.replaceTrack(null);
    } catch {
      // Ignore replaceTrack failures when track/sender is already closed.
    }
    const transceiver = peer?.pc
      .getTransceivers?.()
      .find((tr) => tr.sender === pub.sender || tr.mid === pub.mid);
    if (transceiver) transceiver.direction = 'inactive';

    if (peer && !peer.closed && peer.sessionId) {
      await enqueueOnPeer(peer, async () => {
        if (peer.closed || !peer.sessionId) return;
        await peerRequest(
          peer,
          'unpublish-tracks',
          { sessionId: peer.sessionId, mids: [pub.mid] },
          9000,
        ).catch(warn);
      });
    }
  }

  function clearRetry(key: string) {
    clearTimeout(retries.get(key)?.timer);
    retries.delete(key);
    retryCounts.delete(key);
    retryVersions.delete(key);
  }

  function closeSubscription(key: string, clearRetries = true, cancelQueued = true): Promise<void> {
    if (cancelQueued) subscriptionQueue.cancel(key);
    const token = subscribeTokens.get(key);
    if (token) token.cancelled = true;
    subscribeTokens.delete(key);
    if (clearRetries) clearRetry(key);

    const sub = subscriptions.get(key);
    if (!sub) return Promise.resolve();
    subscriptions.delete(key);
    subscriptionsByMid.delete(sub.mid);

    try {
      options.onSubscriptionClosed(sub);
    } catch (error) {
      warn(error);
    }

    const peer = subscriberPeer;
    if (!peer || peer.closed) return Promise.resolve();

    const transceiver = peer.pc.getTransceivers?.().find((tr) => tr.mid === sub.mid);
    if (transceiver) transceiver.direction = 'inactive';

    return enqueueOnPeer(peer, async () => {
      if (peer.closed || !peer.sessionId) return;
      await peerRequest(
        peer,
        'close-subscription',
        {
          sessionId: peer.sessionId,
          mid: sub.mid,
          publisherId: sub.publisherId,
          kind: sub.kind,
        },
        8000,
      ).catch(warn);
    });
  }

  async function publish(
    kind: VoiceMediaKind,
    track: MediaStreamTrack,
    recovery = false,
  ): Promise<SfuLocalPublication | null> {
    if (!options.getSettings().enabled || !track) return null;
    if (screenKind(kind) && !options.getSettings().screenAllowed) {
      throw Object.assign(new Error('Compartilhamento bloqueado pelo freio de consumo.'), {
        code: 'SCREEN_BUDGET_BLOCKED',
      });
    }

    if (recovery) {
      const prevToken = publishTokens.get(kind);
      if (prevToken) prevToken.cancelled = true;
    } else {
      publicationRecovery.cancel(kind);
    }

    const token: Token = { generation, cancelled: false };
    publishTokens.set(kind, token);
    const owned = () => enabled(token) && publishTokens.get(kind) === token;
    const current = () =>
      owned() && (publications.get(kind)?.sender.track || track).readyState !== 'ended';
    const ensure = () => {
      if (!current()) throw sfuCancelled();
    };

    const peer = ensurePublisherPeer();

    return enqueueOnPeer(peer, async () => {
      const pc = peer.pc;
      for (const simulcast of kind === 'camera' ? [true, false] : [false]) {
        ensure();
        let tr: RTCRtpTransceiver | null = null;
        try {
          const sessionId = await ensureSessionId(peer);
          ensure();

          // Unpublish any active track of the same kind before adding the new transceiver.
          const previousPub = publications.get(kind);
          if (previousPub) {
            publications.delete(kind);
            try {
              await previousPub.sender.replaceTrack(null);
            } catch {
              // Ignore replaceTrack error on previous sender.
            }
            const prevTr = pc
              .getTransceivers?.()
              .find((item) => item.sender === previousPub.sender || item.mid === previousPub.mid);
            if (prevTr) prevTr.direction = 'inactive';
            await peerRequest(
              peer,
              'unpublish-tracks',
              { sessionId, mids: [previousPub.mid] },
              9000,
            ).catch(warn);
            ensure();
          }

          const settings = options.getSettings();
          const init: RTCRtpTransceiverInit = { direction: 'sendonly' };
          const screenCodec = settings.screenCodec ?? 'auto';
          if (simulcast && kind === 'camera') {
            init.sendEncodings = cameraEncodings(settings);
          } else if (kind === 'screen') {
            init.sendEncodings = screenEncodings(settings)
              .slice(0, 1)
              .map((enc) => ({
                ...enc,
                rid: undefined,
                ...(screenCodec === 'vp9' || screenCodec === 'av1'
                  ? { scalabilityMode: 'L1T2' }
                  : {}),
              })) as RTCRtpEncodingParameters[];
          }

          try {
            tr = pc.addTransceiver(track, init);
          } catch (error) {
            if (kind === 'screen' && init.sendEncodings?.[0]) {
              const fallbackEnc = { ...init.sendEncodings[0] } as RTCRtpEncodingParameters & {
                scalabilityMode?: string;
              };
              delete fallbackEnc.scalabilityMode;
              tr = pc.addTransceiver(track, { ...init, sendEncodings: [fallbackEnc] });
            } else {
              throw error;
            }
          }

          if (kind === 'screen') prioritizeScreenCodec(tr, screenCodec);

          const offer = await abortable(pc.createOffer(), peer.controller.signal);
          ensure();
          await abortable(pc.setLocalDescription(offer), peer.controller.signal);
          ensure();

          const rids = simulcast ? advertisedRids(tr, pc) : [];
          const mid = String(tr.mid);
          const reply = readBatchPublish(
            await peerRequest(
              peer,
              'publish-tracks',
              {
                sessionId,
                quality: options.getSettings().quality,
                screenBitrate: options.getSettings().screenBitrate,
                sessionDescription: description(pc.localDescription, 'offer'),
                tracks: [{ kind, mid, rids }],
              },
              recovery ? 9000 : 15000,
            ),
          );
          ensure();

          if (reply.description) {
            await abortable(pc.setRemoteDescription(reply.description), peer.controller.signal);
            ensure();
          }

          const pub: SfuLocalPublication = {
            kind,
            pc,
            sessionId: reply.sessionId,
            mid,
            sender: tr.sender,
            trackName: reply.trackName,
            rids: reply.rids ?? rids,
            ready: true,
          };
          publications.set(kind, pub);
          await abortable(options.applyQuality(pub.sender, kind), peer.controller.signal);
          ensure();
          options.onReady(kind, false);

          if (kind === 'audio') {
            const latest = options.getTrack?.('audio');
            if (latest?.readyState === 'live' && pub.sender.track !== latest) {
              await abortable(pub.sender.replaceTrack(latest), peer.controller.signal);
              ensure();
              await abortable(options.applyQuality(pub.sender, kind), peer.controller.signal);
              ensure();
            }
          }
          return pub;
        } catch (error) {
          if (tr) {
            tr.direction = 'inactive';
            void tr.sender.replaceTrack(null).catch(() => {});
          }
          if (!current()) throw sfuCancelled();
          if (simulcast && retrySingleLayer(error)) {
            warn(error);
            continue;
          }
          throw error;
        }
      }
      throw sfuCancelled();
    });
  }

  const catalogHas = (pub: SfuPublication) =>
    catalog.some(
      (p) =>
        sfuKey(p.ownerId, p.kind) === sfuKey(pub.ownerId, pub.kind) &&
        p.sessionId === pub.sessionId,
    );

  async function subscribe(
    pub: SfuPublication,
    currentJob: () => boolean,
  ): Promise<SfuSubscription | null> {
    if (!options.getSettings().enabled || !options.wants(pub) || !catalogHas(pub)) return null;
    const key = sfuKey(pub.ownerId, pub.kind);
    const existing = subscriptions.get(key);
    if (existing?.publisherSessionId === pub.sessionId) return existing;

    await closeSubscription(key, false, false);

    const token: Token = { generation, cancelled: false, publisherSessionId: pub.sessionId };
    const watch = options.watchVersion(pub.ownerId);
    subscribeTokens.set(key, token);

    const peer = ensureSubscriberPeer();
    let activeSub: SfuSubscription | null = null;
    const current = () =>
      enabled(token) &&
      !peer.closed &&
      subscribeTokens.get(key) === token &&
      (activeSub?.negotiating === false || currentJob()) &&
      options.wants(pub) &&
      catalogHas(pub) &&
      (!screenKind(pub.kind) || watch === options.watchVersion(pub.ownerId));
    const ensure = () => {
      if (!current()) throw sfuCancelled();
    };

    return enqueueOnPeer(peer, async () => {
      const pc = peer.pc;
      try {
        ensure();
        const sessionId = await ensureSessionId(peer);
        ensure();

        const rid =
          ['camera', 'screen'].includes(pub.kind) && pub.rids.length
            ? options.preferredRid(pub.kind)
            : null;

        const reply = readBatchSubscribe(
          await peerRequest(
            peer,
            'subscribe-tracks',
            {
              sessionId,
              quality: options.getSettings().quality,
              tracks: [
                {
                  publisherId: pub.ownerId,
                  kind: pub.kind,
                  preferredRid: rid,
                },
              ],
            },
            12000,
          ),
        );
        ensure();

        const sub: SfuSubscription = {
          key,
          pc,
          sessionId: reply.sessionId,
          mid: reply.mid,
          publisherSessionId: pub.sessionId,
          publisherId: pub.ownerId,
          kind: pub.kind,
          preferredRid: reply.preferredRid,
          track: null,
          negotiating: true,
          readyAt: 0,
        };
        activeSub = sub;
        subscriptions.set(key, sub);
        subscriptionsByMid.set(sub.mid, { pub, sub, current });

        await abortable(pc.setRemoteDescription(reply.description), peer.controller.signal);
        ensure();
        const answer = await abortable(pc.createAnswer(), peer.controller.signal);
        ensure();
        await abortable(pc.setLocalDescription(answer), peer.controller.signal);
        ensure();

        readAccepted(
          await peerRequest(
            peer,
            'renegotiate',
            {
              sessionId: sub.sessionId,
              sessionDescription: description(pc.localDescription, 'answer'),
            },
            10000,
          ),
        );
        ensure();

        sub.negotiating = false;
        sub.readyAt = Date.now();
        options.onReady(pub.kind, true);
        return sub;
      } catch (error) {
        if (activeSub) {
          if (subscriptions.get(key) === activeSub) subscriptions.delete(key);
          if (subscriptionsByMid.get(activeSub.mid)?.sub === activeSub) {
            subscriptionsByMid.delete(activeSub.mid);
          }
        }
        throw current() ? error : sfuCancelled();
      }
    });
  }

  function applyCatalog(next: readonly SfuPublication[]) {
    catalog = next;
    catalogRevision++;
    for (const [key, sessionId] of retryVersions) {
      if (
        !next.some((pub) => sfuKey(pub.ownerId, pub.kind) === key && pub.sessionId === sessionId)
      ) {
        clearRetry(key);
      }
    }
    for (const key of [...subscriptionQueue.keys()]) {
      if (!next.some((pub) => sfuKey(pub.ownerId, pub.kind) === key && options.wants(pub))) {
        subscriptionQueue.cancel(key);
      }
    }
    for (const [key, token] of [...subscribeTokens]) {
      if (
        !next.some(
          (pub) =>
            sfuKey(pub.ownerId, pub.kind) === key && pub.sessionId === token.publisherSessionId,
        )
      ) {
        void closeSubscription(key);
      }
    }
    for (const [key, entry] of [...retries]) {
      if (!catalogHas(entry.publication)) clearRetry(key);
    }
  }

  function setPublications(value: unknown): boolean {
    try {
      const next = readPublications(value);
      applyCatalog(next);
      return true;
    } catch (error) {
      warn(error);
      return false;
    }
  }

  async function refreshPublications(): Promise<readonly SfuPublication[]> {
    if (!options.getSettings().enabled) return catalog;
    const epoch = generation;
    const revision = catalogRevision;
    try {
      const reply = readCatalogResponse(await options.request('list-publications', {}, 8000));
      if (epoch === generation && revision === catalogRevision && options.getSettings().enabled) {
        applyCatalog(reply);
      }
    } catch (error) {
      if (epoch === generation && options.getSettings().enabled) warn(error);
    }
    return catalog;
  }

  function scheduleTimer(key: string, pub: SfuPublication, delay: number, refresh: boolean) {
    const epoch = generation;
    clearTimeout(retries.get(key)?.timer);
    const timer = setTimeout(() => {
      retries.delete(key);
      const current = () =>
        epoch === generation &&
        options.getSettings().enabled &&
        catalogHas(pub) &&
        options.wants(pub);
      if (!current()) return;
      void (async () => {
        if (refresh) await refreshPublications();
        if (epoch === generation && options.getSettings().enabled) await syncSubscriptions();
      })().catch(warn);
    }, delay);
    retries.set(key, { timer, publication: pub });
  }

  function retry(pub: SfuPublication, error: unknown) {
    const key = sfuKey(pub.ownerId, pub.kind);
    if (
      retries.has(key) ||
      !options.getSettings().enabled ||
      !catalogHas(pub) ||
      !options.wants(pub)
    ) {
      return;
    }
    const attempt = (retryCounts.get(key) ?? 0) + 1;
    retryCounts.set(key, attempt);
    const stale = stalePublication(error);
    const code = errorCode(error);
    options.onRetry({ publication: pub, code, attempt, stale });

    if (
      pub.kind === 'audio' &&
      !stale &&
      attempt >= 3 &&
      !publications.get('audio')?.ready &&
      [
        'BAD_SFU_ANSWER',
        'BAD_SFU_OFFER',
        'BAD_SFU_RENEGOTIATE',
        'SFU_ANSWER_REJECTED',
        'SFU_CONNECT_TIMEOUT',
      ].includes(code)
    ) {
      void options.onFallback('subscription').catch(warn);
      return;
    }

    retryVersions.set(key, pub.sessionId);
    if (pub.kind !== 'audio' && attempt >= 4) return;
    const delay = stale
      ? Math.min(5000, 500 * 1.7 ** Math.min(attempt - 1, 4))
      : Math.min(12000, 900 * 2 ** Math.min(attempt - 1, 4));
    scheduleTimer(key, pub, delay, stale);
  }

  function syncSubscriptions(): Promise<void> {
    const epoch = generation;
    if (!options.getSettings().enabled) return Promise.resolve();
    const current = () => epoch === generation && options.getSettings().enabled;
    const desired = new Map(
      catalog.filter(options.wants).map((pub) => [sfuKey(pub.ownerId, pub.kind), pub]),
    );
    for (const key of [...subscriptionQueue.keys()]) {
      if (!desired.has(key)) subscriptionQueue.cancel(key);
    }
    for (const key of [...subscriptions.keys()]) {
      if (!desired.has(key)) void closeSubscription(key);
    }

    const jobs: Promise<unknown>[] = [];
    for (const [key, pub] of desired) {
      if (retryVersions.has(key) && retryVersions.get(key) !== pub.sessionId) clearRetry(key);
      if (retries.has(key) || (pub.kind !== 'audio' && (retryCounts.get(key) ?? 0) >= 4)) continue;
      if (subscriptions.get(key)?.publisherSessionId === pub.sessionId) continue;

      jobs.push(
        subscriptionQueue.schedule(key, pub.kind, pub.sessionId, async (currentJob) => {
          try {
            await subscribe(pub, currentJob);
            if (current() && currentJob()) clearRetry(key);
          } catch (error) {
            if (
              !current() ||
              !currentJob() ||
              ['SFU_CANCELLED', 'VOICE_MODERATED'].includes(errorCode(error))
            ) {
              return;
            }
            warn(error);
            if (stalePublication(error)) {
              await refreshPublications();
              if (current() && !catalogHas(pub)) {
                void syncSubscriptions();
                return;
              }
            }
            if (current() && currentJob()) retry(pub, error);
          } finally {
            if (current()) options.onChange();
          }
        }),
      );
    }

    return Promise.allSettled(jobs).then(() => {});
  }

  function setLayer(key: string, rid: SfuRid, force = false): Promise<void> {
    const sub = subscriptions.get(key);
    const peer = subscriberPeer;
    if (!sub || !peer || peer.closed) return Promise.resolve();
    if (!catalog.find((pub) => sfuKey(pub.ownerId, pub.kind) === key)?.rids.length) {
      return Promise.resolve();
    }

    const current = () =>
      !peer.closed && options.getSettings().enabled && subscriptions.get(key) === sub;

    const next = peer.layerQueue
      .catch(() => {})
      .then(async () => {
        if (!current() || (!force && sub.preferredRid === rid)) return;
        const preferred = readLayer(
          await peerRequest(
            peer,
            'update-subscription',
            { sessionId: sub.sessionId, mid: sub.mid, preferredRid: rid },
            9000,
          ),
        );
        if (current()) sub.preferredRid = preferred;
      });
    peer.layerQueue = next;
    return next;
  }

  function reset() {
    generation++;
    catalogRevision++;
    catalog = Object.freeze([]);
    publicationRecovery.clear();
    subscriptionQueue.clear();
    retryVersions.clear();
    for (const token of [...publishTokens.values(), ...subscribeTokens.values()]) {
      token.cancelled = true;
    }
    publishTokens.clear();
    subscribeTokens.clear();
    for (const key of [...retries.keys()]) clearRetry(key);
    retryCounts.clear();

    for (const sub of [...subscriptions.values()]) {
      try {
        options.onSubscriptionClosed(sub);
      } catch (error) {
        warn(error);
      }
    }
    publications.clear();
    subscriptions.clear();
    subscriptionsByMid.clear();

    disposePeer(publisherPeer, true);
    disposePeer(subscriberPeer, true);
    publisherPeer = null;
    subscriberPeer = null;
  }

  return {
    publications: publications as ReadonlyMap<VoiceMediaKind, SfuLocalPublication>,
    subscriptions: subscriptions as ReadonlyMap<string, SfuSubscription>,
    getGeneration: () => generation,
    getPublications: () => catalog,
    setPublications,
    refreshPublications,
    publish,
    recoverPublication: (kind: VoiceMediaKind, error: unknown) =>
      publicationRecovery.recover(kind, error),
    closePublication,
    closeSubscription: (key: string) => closeSubscription(key),
    syncSubscriptions,
    clearRetry,
    setLayer,
    reset,
  };
}

export type SfuSession = ReturnType<typeof createSfuSession>;
