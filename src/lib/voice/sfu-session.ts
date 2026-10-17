import { SfuPublicationRecovery, SfuSubscriptionQueue, globalSfuFailure } from './sfu-recovery.ts';
import type {
  SfuLocalPublication,
  SfuPublication,
  SfuRid,
  SfuSettings,
  SfuSubscription,
} from '../../types/sfu';
import type { VoiceMediaKind } from '../../types/voice';
import { abortable, waitForPeer } from './peer-wait.ts';
import { advertisedRids, cameraEncodings, screenStartupOffer } from './sfu-encoding.ts';
import {
  description,
  errorCode,
  readAccepted,
  readCatalogResponse,
  readLayer,
  readPublications,
  readPublish,
  readReady,
  readSubscribe,
  retrySingleLayer,
  screenKind,
  sessionIdOf,
  sfuCancelled,
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
interface Resource {
  readonly pc: RTCPeerConnection;
  readonly controller: AbortController;
  readonly purpose: 'publish' | 'subscribe';
  readonly key: string;
  closed: boolean;
  sessionId: string | null;
  cleanup: Promise<void> | null;
  cleanupTimeout: number;
  subscription: SfuSubscription | null;
  layerQueue: Promise<void>;
}
/** Owns SFU peers, pending requests, catalog, queues and retry timers.
 * Local capture and the single WebSocket remain borrowed dependencies.
 */
export function createSfuSession(options: SfuOptions) {
  const publications = new Map<VoiceMediaKind, SfuLocalPublication>();
  const subscriptions = new Map<string, SfuSubscription>();
  const publishTokens = new Map<VoiceMediaKind, Token>(),
    subscribeTokens = new Map<string, Token>();
  const resources = new Set<Resource>(),
    resourceOf = new WeakMap<RTCPeerConnection, Resource>();
  const retries = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; publication: SfuPublication }
  >();
  const retryCounts = new Map<string, number>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[SfuSession]', error));
  const retryVersions = new Map<string, string>();
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
  let generation = 0,
    catalogRevision = 0;
  let catalog: readonly SfuPublication[] = Object.freeze([]);
  const enabled = (token: Token) =>
    !token.cancelled && token.generation === generation && options.getSettings().enabled;
  function resource(purpose: Resource['purpose'], key: string): Resource {
    const pc = options.createConnection(options.getSettings().ice);
    const r: Resource = {
      pc,
      purpose,
      key,
      controller: new AbortController(),
      closed: false,
      sessionId: null,
      cleanup: null,
      cleanupTimeout: purpose === 'publish' ? 9000 : 8000,
      subscription: null,
      layerQueue: Promise.resolve(),
    };
    resources.add(r);
    resourceOf.set(pc, r);
    return r;
  }
  function closeRemote(r: Resource): Promise<void> {
    if (!r.sessionId) return Promise.resolve();
    return (r.cleanup ??= options
      .request(
        r.purpose === 'publish' ? 'close-publication' : 'close-subscription',
        { sessionId: r.sessionId },
        r.cleanupTimeout,
      )
      .then(() => {})
      .catch(warn));
  }
  function dispose(r: Resource): Promise<void> {
    if (!r.closed) {
      r.closed = true;
      r.controller.abort();
      resources.delete(r);
      r.pc.ontrack = null;
      r.pc.onconnectionstatechange = null;
      const pub = publications.get(r.key as VoiceMediaKind);
      if (r.purpose === 'publish' && pub?.pc === r.pc) publications.delete(pub.kind);
      if (r.subscription) {
        if (subscriptions.get(r.key) === r.subscription) subscriptions.delete(r.key);
        try {
          options.onSubscriptionClosed(r.subscription);
        } catch (error) {
          warn(error);
        }
      }
      try {
        r.pc.close();
      } catch (error) {
        warn(error);
      }
    }
    return closeRemote(r);
  }
  function request(
    r: Resource,
    action: string,
    payload: Record<string, unknown>,
    timeout?: number,
  ) {
    const result = options.request(action, payload, timeout).then((value) => {
      // Capture the remote id before validation, so malformed/late replies can be cleaned.
      if (action === 'publish-track' || action === 'subscribe-track') {
        r.sessionId = sessionIdOf(value);
        if (r.closed) void closeRemote(r);
      }
      return value;
    });
    return abortable(result, r.controller.signal);
  }
  function closePublication(kind: VoiceMediaKind, cancelRecovery = true): Promise<void> {
    if (cancelRecovery) publicationRecovery.cancel(kind);
    const token = publishTokens.get(kind);
    if (token) token.cancelled = true;
    publishTokens.delete(kind);
    const cleanup = [...resources]
      .filter((r) => r.purpose === 'publish' && r.key === kind)
      .map(dispose);
    return Promise.allSettled(cleanup).then(() => {});
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
    const cleanup = [...resources]
      .filter((r) => r.purpose === 'subscribe' && r.key === key)
      .map(dispose);
    return Promise.allSettled(cleanup).then(() => {});
  }
  async function publish(
    kind: VoiceMediaKind,
    track: MediaStreamTrack,
    recovery = false,
  ): Promise<SfuLocalPublication | null> {
    if (!options.getSettings().enabled || !track) return null;
    if (screenKind(kind) && !options.getSettings().screenAllowed)
      throw Object.assign(new Error('Compartilhamento bloqueado pelo freio de consumo.'), {
        code: 'SCREEN_BUDGET_BLOCKED',
      });
    void closePublication(kind, !recovery);
    const token: Token = { generation, cancelled: false };
    publishTokens.set(kind, token);
    const owned = () => enabled(token) && publishTokens.get(kind) === token;
    const current = () =>
      owned() && (publications.get(kind)?.sender.track || track).readyState !== 'ended';
    const ensure = () => {
      if (!current()) throw sfuCancelled();
    };
    for (const simulcast of kind === 'camera' ? [true, false] : [false]) {
      ensure();
      const r = resource('publish', kind),
        pc = r.pc;
      try {
        const settings = options.getSettings();
        const init: RTCRtpTransceiverInit = { direction: 'sendonly' };
        if (simulcast && kind === 'camera') init.sendEncodings = cameraEncodings(settings);
        const tr = pc.addTransceiver(track, init),
          offer = await abortable(pc.createOffer(), r.controller.signal);
        ensure();
        await abortable(
          pc.setLocalDescription(
            kind === 'screen' ? screenStartupOffer(offer, settings.screenBitrate) : offer,
          ),
          r.controller.signal,
        );
        ensure();
        await waitForPeer(pc, 'gather', 4200, r.controller.signal);
        ensure();
        const rids = simulcast ? advertisedRids(tr, pc) : [];
        const reply = readPublish(
          await request(
            r,
            'publish-track',
            {
              kind,
              screenBitrate: options.getSettings().screenBitrate,
              quality: options.getSettings().quality,
              mid: String(tr.mid),
              rids,
              sessionDescription: description(pc.localDescription, 'offer'),
            },
            recovery ? 9000 : 15000,
          ),
        );
        ensure();
        if (reply.description) {
          await abortable(pc.setRemoteDescription(reply.description), r.controller.signal);
          ensure();
        }
        const pub: SfuLocalPublication = {
          kind,
          pc,
          sessionId: reply.sessionId,
          mid: String(tr.mid),
          sender: tr.sender,
          trackName: reply.trackName,
          rids: reply.rids ?? rids,
          ready: false,
        };
        publications.set(kind, pub);
        await abortable(options.applyQuality(pub.sender, kind), r.controller.signal);
        ensure();
        await waitForPeer(pc, 'connect', recovery ? 7000 : 14000, r.controller.signal);
        ensure();
        const readyRids = readReady(
          await request(r, 'publication-ready', { sessionId: pub.sessionId }, 9000),
        );
        ensure();
        pub.ready = true;
        if (readyRids) pub.rids = readyRids;
        options.onReady(kind, false);
        pc.onconnectionstatechange = () => {
          if (
            owned() &&
            !r.closed &&
            publications.get(kind) === pub &&
            pc.connectionState === 'failed'
          )
            void publicationRecovery
              .recover(
                kind,
                Object.assign(new Error('Conexão SFU interrompida.'), {
                  code: 'SFU_CONNECTION_FAILED',
                }),
              )
              .catch(warn);
        };
        if (kind === 'audio') {
          const latest = options.getTrack?.('audio');
          if (latest?.readyState === 'live' && pub.sender.track !== latest) {
            await abortable(pub.sender.replaceTrack(latest), r.controller.signal);
            ensure();
            await abortable(options.applyQuality(pub.sender, kind), r.controller.signal);
            ensure();
          }
        }
        return pub;
      } catch (error) {
        r.cleanupTimeout = 6000;
        void dispose(r);
        if (!current()) throw sfuCancelled();
        if (simulcast && retrySingleLayer(error)) {
          warn(error);
          continue;
        }
        throw error;
      }
    }
    throw sfuCancelled();
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
    const key = sfuKey(pub.ownerId, pub.kind),
      existing = subscriptions.get(key);
    if (existing?.publisherSessionId === pub.sessionId) return existing;
    void closeSubscription(key, false, false);
    const token: Token = { generation, cancelled: false, publisherSessionId: pub.sessionId },
      watch = options.watchVersion(pub.ownerId);
    subscribeTokens.set(key, token);
    const r = resource('subscribe', key),
      pc = r.pc;
    const current = () =>
      enabled(token) &&
      !r.closed &&
      subscribeTokens.get(key) === token &&
      (r.subscription?.negotiating === false || currentJob()) &&
      options.wants(pub) &&
      catalogHas(pub) &&
      (!screenKind(pub.kind) || watch === options.watchVersion(pub.ownerId));
    const ensure = () => {
      if (!current()) throw sfuCancelled();
    };
    try {
      pc.ontrack = (event) => {
        const sub = r.subscription;
        if (sub && current() && subscriptions.get(key) === sub) {
          sub.track = event.track;
          options.onTrack(pub, event.track, sub, event.receiver, current);
        }
      };
      const rid =
        ['camera', 'screen'].includes(pub.kind) && pub.rids.length
          ? options.preferredRid(pub.kind)
          : null;
      const reply = readSubscribe(
        await request(r, 'subscribe-track', {
          publisherId: pub.ownerId,
          kind: pub.kind,
          quality: options.getSettings().quality,
          preferredRid: rid,
        }),
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
      r.subscription = sub;
      subscriptions.set(key, sub);
      await abortable(pc.setRemoteDescription(reply.description), r.controller.signal);
      ensure();
      const answer = await abortable(pc.createAnswer(), r.controller.signal);
      ensure();
      await abortable(pc.setLocalDescription(answer), r.controller.signal);
      ensure();
      await waitForPeer(pc, 'gather', 4200, r.controller.signal);
      ensure();
      readAccepted(
        await request(r, 'renegotiate', {
          sessionId: sub.sessionId,
          sessionDescription: description(pc.localDescription, 'answer'),
        }),
      );
      ensure();
      await waitForPeer(pc, 'connect', 18000, r.controller.signal);
      ensure();
      sub.negotiating = false;
      sub.readyAt = Date.now();
      options.onReady(pub.kind, true);
      pc.onconnectionstatechange = () => {
        if (current() && pc.connectionState === 'failed') {
          void closeSubscription(key, false);
          retry(
            pub,
            Object.assign(new Error('Conexão SFU interrompida.'), {
              code: 'SFU_CONNECTION_FAILED',
            }),
          );
        }
      };
      return sub;
    } catch (error) {
      const valid = current();
      r.cleanupTimeout = 6000;
      void dispose(r);
      throw valid ? error : sfuCancelled();
    }
  }
  function applyCatalog(next: readonly SfuPublication[]) {
    catalog = next;
    catalogRevision++;
    for (const [key, sessionId] of retryVersions)
      if (!next.some((pub) => sfuKey(pub.ownerId, pub.kind) === key && pub.sessionId === sessionId))
        clearRetry(key);
    for (const key of [...subscriptionQueue.keys()])
      if (!next.some((pub) => sfuKey(pub.ownerId, pub.kind) === key && options.wants(pub)))
        subscriptionQueue.cancel(key);
    for (const [key, token] of [...subscribeTokens]) {
      if (
        !next.some(
          (pub) =>
            sfuKey(pub.ownerId, pub.kind) === key && pub.sessionId === token.publisherSessionId,
        )
      )
        void closeSubscription(key);
    }
    for (const [key, retry] of [...retries]) if (!catalogHas(retry.publication)) clearRetry(key);
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
    const epoch = generation,
      revision = catalogRevision;
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
    )
      return;
    const attempt = (retryCounts.get(key) ?? 0) + 1;
    retryCounts.set(key, attempt);
    const stale = stalePublication(error),
      code = errorCode(error);
    options.onRetry({ publication: pub, code, attempt, stale });
    if (
      pub.kind === 'audio' &&
      !stale &&
      attempt >= 3 &&
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
    for (const key of [...subscriptionQueue.keys()])
      if (!desired.has(key)) subscriptionQueue.cancel(key);
    for (const key of [...subscriptions.keys()]) if (!desired.has(key)) void closeSubscription(key);
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
            if (!current() || !currentJob() || errorCode(error) === 'SFU_CANCELLED') return;
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
  function setLayer(key: string, rid: SfuRid): Promise<void> {
    const sub = subscriptions.get(key),
      r = sub && resourceOf.get(sub.pc);
    if (!sub || !r || r.closed) return Promise.resolve();
    if (!catalog.find((pub) => sfuKey(pub.ownerId, pub.kind) === key)?.rids.length)
      return Promise.resolve();
    const current = () =>
      !r.closed && options.getSettings().enabled && subscriptions.get(key) === sub;
    const next = r.layerQueue
      .catch(() => {})
      .then(async () => {
        if (!current() || sub.preferredRid === rid) return;
        const preferred = readLayer(
          await request(
            r,
            'update-subscription',
            { sessionId: sub.sessionId, preferredRid: rid },
            9000,
          ),
        );
        if (current()) sub.preferredRid = preferred;
      });
    r.layerQueue = next;
    return next;
  }
  function reset() {
    generation++;
    catalogRevision++;
    catalog = Object.freeze([]);
    publicationRecovery.clear();
    subscriptionQueue.clear();
    retryVersions.clear();
    for (const token of [...publishTokens.values(), ...subscribeTokens.values()])
      token.cancelled = true;
    publishTokens.clear();
    subscribeTokens.clear();
    for (const key of [...retries.keys()]) clearRetry(key);
    retryCounts.clear();
    for (const r of [...resources]) void dispose(r);
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
