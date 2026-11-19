import type { SfuClientAction } from '@trono/protocol';
import {
  CloudflareSfuExecutionAdapter,
  VoiceEngineController,
  type RemoteTrackDelivery,
  type ScreenShareOptions,
} from '@trono/voice-engine';
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
  errorCode,
  readCatalogResponse,
  readPublications,
  screenKind,
  sfuCancelled,
  sfuError,
  sfuKey,
  stalePublication,
} from './sfu-protocol.ts';

interface SfuOptions {
  getSettings(): SfuSettings;
  roomId(): string | undefined;
  participantId(): string | null | undefined;
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
  onScreenEncodingError(error: unknown): void;
  warn?: (error: unknown) => void;
}

/** Bridges the call UI, track owners and catalog to the shared SFU engine. */
export function createSfuSession(options: SfuOptions) {
  const publications = new Map<VoiceMediaKind, SfuLocalPublication>();
  const subscriptions = new Map<string, SfuSubscription>();
  const retries = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; publication: SfuPublication }
  >();
  const retryCounts = new Map<string, number>();
  const retryVersions = new Map<string, string>();
  const publicationVersion = (pub: SfuPublication) =>
    JSON.stringify([pub.sessionId, pub.trackName]);
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

  let generation = 0;
  let catalogRevision = 0;
  let catalog: readonly SfuPublication[] = Object.freeze([]);
  let teardown = Promise.resolve();
  let engine = createEngine();
  let reconnecting = false;
  let lastReconnect = -Infinity;

  function createEngine() {
    const epoch = generation;
    const lifetime = new AbortController();
    const peers = new Map<'publish' | 'subscribe', RTCPeerConnection>();
    const timers = new Map<'publish' | 'subscribe', ReturnType<typeof setTimeout>>();
    const local = new Map<VoiceMediaKind, MediaStreamTrack>();
    const screenInputs = new Map<
      string,
      { video: MediaStreamTrack; audio: MediaStreamTrack | null }
    >();
    const pendingDeliveries = new Map<string, RemoteTrackDelivery>();
    let connecting: Promise<void> | undefined;
    let captureNumber = 0;
    let screenQueue = Promise.resolve();
    const subscriptionTasks = new Map<string, Promise<void>>();

    const adapter = new CloudflareSfuExecutionAdapter({
      mediaDevices: null,
      getIceConfiguration: () => options.getSettings().ice,
      onSubscriberNegotiationError() {
        if (epoch === generation) void recoverConnection('subscription').catch(warn);
      },
      getQuality: qualityPreset,
      borrowInputTracks: true,
      manageKeepAlive: false,
      onScreenEncodingError: (error) => options.onScreenEncodingError(error),
      signaling: {
        async request<T>(
          action: SfuClientAction,
          payload: Record<string, unknown>,
          signal?: AbortSignal,
        ) {
          if (action === 'close-session' || action === 'ensure-session') {
            return (await options.request(action, payload, 8000)) as T;
          }
          if (epoch !== generation || lifetime.signal.aborted || signal?.aborted)
            throw sfuCancelled();
          const scope = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
          const timeout = action === 'publish-tracks' ? 15000 : 12000;
          return (await abortable(options.request(action, payload, timeout), scope)) as T;
        },
      },
      onPeerConnectionCreated(role, peer) {
        if (!(peer instanceof RTCPeerConnection)) return;
        peers.set(role, peer);
        peer.addEventListener('connectionstatechange', () => {
          clearTimeout(timers.get(role));
          timers.delete(role);
          const fallback = () => {
            if (!lifetime.signal.aborted && options.getSettings().enabled) {
              void recoverConnection(role === 'publish' ? 'publisher' : 'subscription').catch(warn);
            }
          };
          if (peer.connectionState === 'failed') fallback();
          else if (peer.connectionState === 'disconnected')
            timers.set(role, setTimeout(fallback, 4500));
        });
      },
      onRemoteTrack(delivery) {
        if (epoch !== generation) return;
        const key = sfuKey(delivery.participantId, delivery.kind);
        const sub = subscriptions.get(key);
        if (sub) deliver(sub, delivery);
        else pendingDeliveries.set(key, delivery);
      },
    });

    const controller = new VoiceEngineController({
      ...adapter.hostPorts,
      propagateCommandErrors: true,
      media: {
        connect: (input) => adapter.connect(input),
        disconnect: (input) => adapter.disconnect(input),
        startMicrophone: ({ options: requested, signal }) => {
          const track = local.get('audio');
          if (!track) throw sfuCancelled();
          return adapter.startMicrophone({ options: { ...requested, track }, signal });
        },
        stopMicrophone: () => adapter.stopMicrophone(),
        setMicrophoneMuted: (muted) => adapter.setMicrophoneMuted(muted),
        startCamera: ({ options: requested, signal }) => {
          const track = local.get('camera');
          if (!track) throw sfuCancelled();
          return adapter.startCamera({ options: { ...requested, track }, signal });
        },
        stopCamera: () => adapter.stopCamera(),
        startScreenShare: (input) => {
          const tracks = screenInputs.get(input.captureId);
          if (!tracks) throw sfuCancelled();
          return adapter.startScreenShare({
            ...input,
            videoTrack: tracks.video,
            audioTrack: tracks.audio,
          });
        },
        updateScreenEncoding: (input) => adapter.updateScreenEncoding(input),
        republishScreenShare: (input) => adapter.republishScreenShare(input),
        stopScreenShare: (input) => adapter.stopScreenShare(input),
        startScreenAudio: (input) => {
          const track = local.get('screen-audio');
          if (!track) throw sfuCancelled();
          return adapter.startScreenAudio({ ...input, options: { ...input.options, track } });
        },
        stopScreenAudio: (input) => adapter.stopScreenAudio(input),
      },
    });

    function ensure(): Promise<void> {
      if (connecting) return connecting;
      const roomId = options.roomId();
      const participantId = options.participantId();
      if (!roomId || !participantId || lifetime.signal.aborted)
        return Promise.reject(sfuCancelled());
      connecting = teardown
        .then(() => {
          if (lifetime.signal.aborted) throw sfuCancelled();
          return controller.connect({ roomId, participantId, quality: qualityPreset() });
        })
        .catch((error) => {
          connecting = undefined;
          throw error;
        });
      return connecting;
    }

    function deliver(sub: SfuSubscription, delivery: RemoteTrackDelivery) {
      if (!(delivery.track instanceof MediaStreamTrack)) return;
      const receiver = sub.pc.getTransceivers().find((tr) => tr.mid === sub.mid)?.receiver;
      const pub = catalog.find((entry) => matchesSubscription(entry, sub));
      const current = () =>
        epoch === generation &&
        subscriptions.get(sub.key) === sub &&
        !!pub &&
        options.wants(pub) &&
        catalogHas(pub);
      if (receiver && pub && delivery.mid === sub.mid && current()) {
        sub.track = delivery.track;
        options.onTrack(pub, delivery.track, sub, receiver, current);
      }
    }

    function retire() {
      lifetime.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      for (const peer of peers.values()) peer.close();
      controller.dispose();
      const closed = adapter.disconnect({ roomId: null }).catch(warn);
      return Promise.allSettled([connecting, closed]).then(() => undefined);
    }

    return {
      adapter,
      controller,
      ensure,
      local,
      peers,
      screenInputs,
      pendingDeliveries,
      deliver,
      retire,
      subscriptionTasks,
      runScreen<T>(task: () => Promise<T>): Promise<T> {
        const next = screenQueue.then(task);
        screenQueue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      },
      nextCapture: () => `screen-${++captureNumber}`,
    };
  }

  function qualityPreset() {
    const quality = options.getSettings().quality;
    return quality === 'high' || quality === 'economy' ? quality : 'balanced';
  }

  function screenTarget(): ScreenShareOptions {
    const settings = options.getSettings();
    return {
      width: settings.screen.width,
      height: settings.screen.height,
      frameRate: settings.screen.fps,
      maxBitrateBps: settings.screenBitrate,
      codec: settings.screenCodec,
      contentHint: settings.screenContent,
      quality: qualityPreset(),
      simulcast: false,
    };
  }

  function syncLocal(kind: VoiceMediaKind) {
    const descriptor = engine.adapter.getLocalPublication(kind);
    const pc = engine.peers.get('publish');
    const sender = pc?.getTransceivers().find((tr) => tr.mid === descriptor?.mid)?.sender;
    if (!descriptor || !pc || !sender) {
      publications.delete(kind);
      return;
    }
    const publication: SfuLocalPublication = { ...descriptor, pc, sender, ready: true };
    publications.set(kind, publication);
    return publication;
  }

  async function closePublication(kind: VoiceMediaKind, cancelRecovery = true): Promise<void> {
    if (cancelRecovery) publicationRecovery.cancel(kind);
    publications.delete(kind);
    if (kind === 'screen') {
      publicationRecovery.cancel('screen-audio');
      publications.delete('screen-audio');
    }
    const { controller } = engine;
    if (kind === 'audio') await controller.stopMicrophone();
    else if (kind === 'camera') await controller.stopCamera();
    else if (kind === 'screen') await controller.stopScreenShare();
    else if (controller.getSnapshot().screenAudio.status !== 'stopped') {
      await controller.stopScreenAudio();
    } else {
      await engine.adapter.stopScreenAudio({ captureId: null });
    }
  }

  function clearRetry(key: string) {
    clearTimeout(retries.get(key)?.timer);
    retries.delete(key);
    retryCounts.delete(key);
    retryVersions.delete(key);
  }

  async function closeSubscription(
    key: string,
    clearRetries = true,
    cancelQueued = true,
  ): Promise<void> {
    if (cancelQueued) subscriptionQueue.cancel(key);
    if (clearRetries) clearRetry(key);
    engine.pendingDeliveries.delete(key);
    const sub = subscriptions.get(key);
    if (!sub) return;
    subscriptions.delete(key);
    options.onSubscriptionClosed(sub);
    try {
      await engine.controller.setRemoteTrackSubscription({
        participantId: sub.publisherId,
        kind: sub.kind,
        subscribed: false,
      });
    } catch (error) {
      warn(error);
    }
  }

  async function publishScreen(
    video: MediaStreamTrack,
    audio: MediaStreamTrack | null,
    recovery = false,
  ) {
    if (!options.getSettings().enabled) return null;
    if (!options.getSettings().screenAllowed) throw sfuError('SCREEN_BUDGET_BLOCKED');
    if (!recovery) {
      publicationRecovery.cancel('screen');
      publicationRecovery.cancel('screen-audio');
    }
    const active = engine;
    await active.ensure();
    if (active !== engine || video.readyState === 'ended') throw sfuCancelled();
    return active.runScreen(async () => {
      if (active !== engine || video.readyState !== 'live') throw sfuCancelled();
      const captureId = active.nextCapture();
      active.screenInputs.set(captureId, {
        video,
        audio: audio?.readyState === 'live' ? audio : null,
      });
      try {
        await active.controller.startScreenShare({ ...screenTarget(), captureId });
        if (active !== engine || active.controller.getSnapshot().screen.captureId !== captureId) {
          throw sfuCancelled();
        }
        const screen = syncLocal('screen');
        const sound = syncLocal('screen-audio');
        if (sound) await options.applyQuality(sound.sender, 'screen-audio');
        if (active === engine) options.onReady('screen', false);
        return screen ?? null;
      } finally {
        if (active === engine) {
          syncLocal('screen');
          syncLocal('screen-audio');
        }
        active.screenInputs.delete(captureId);
      }
    });
  }

  async function updateScreenEncoding(force = false) {
    const active = engine;
    return active.runScreen(async () => {
      if (
        active !== engine ||
        !publications.has('screen') ||
        active.controller.getSnapshot().screen.status !== 'published'
      )
        return;
      try {
        await active.controller.updateScreenEncoding({ options: screenTarget(), force });
      } catch (error) {
        if (active === engine && !active.adapter.getLocalPublication('screen')) {
          void publicationRecovery.recover('screen', error).catch(warn);
        }
        throw error;
      } finally {
        if (active === engine) syncLocal('screen');
      }
    });
  }

  async function publish(kind: VoiceMediaKind, track: MediaStreamTrack, recovery = false) {
    if (!options.getSettings().enabled) return null;
    if (kind === 'screen')
      return publishScreen(track, options.getTrack?.('screen-audio') ?? null, recovery);
    if (!recovery) publicationRecovery.cancel(kind);
    const active = engine;
    await active.ensure();
    if (engine !== active || track.readyState === 'ended') throw sfuCancelled();
    active.local.set(kind, track);
    const previous = publications.get(kind);
    if (kind !== 'screen-audio' && (recovery || (previous && previous.sender.track !== track))) {
      await closePublication(kind, false);
    }
    if (active !== engine || track.readyState !== 'live') throw sfuCancelled();
    if (kind === 'audio') await active.controller.startMicrophone();
    else if (kind === 'camera') {
      const settings = options.getSettings();
      await active.controller.startCamera({
        frameRate: settings.camera.fps,
        maxBitrateBps: settings.videoBitrate,
        simulcast: true,
      });
    } else {
      await active.controller.startScreenAudio({
        captureId: active.controller.getSnapshot().screen.captureId ?? undefined,
      });
    }
    if (active !== engine) throw sfuCancelled();
    const publication = syncLocal(kind);
    if (!publication) throw sfuCancelled();
    await options.applyQuality(publication.sender, kind);
    if (active === engine) options.onReady(kind, false);
    return publication;
  }

  const matchesSubscription = (pub: SfuPublication, sub: SfuSubscription) =>
    sfuKey(pub.ownerId, pub.kind) === sub.key &&
    pub.sessionId === sub.publisherSessionId &&
    pub.trackName === sub.trackName;

  const catalogHas = (entry: SfuPublication) =>
    catalog.some(
      (pub) =>
        sfuKey(pub.ownerId, pub.kind) === sfuKey(entry.ownerId, entry.kind) &&
        pub.sessionId === entry.sessionId &&
        pub.trackName === entry.trackName,
    );

  async function subscribe(pub: SfuPublication, currentJob: () => boolean): Promise<void> {
    const active = engine;
    const key = sfuKey(pub.ownerId, pub.kind);
    const task = (active.subscriptionTasks.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const watch = options.watchVersion(pub.ownerId);
        const current = () =>
          engine === active &&
          currentJob() &&
          options.getSettings().enabled &&
          options.wants(pub) &&
          catalogHas(pub) &&
          (!screenKind(pub.kind) || options.watchVersion(pub.ownerId) === watch);
        if (!current()) return;
        await closeSubscription(key, false, false);
        await active.ensure();
        if (!current()) return;
        const subscribed = { participantId: pub.ownerId, kind: pub.kind };
        await active.controller.setRemoteTrackSubscription({
          ...subscribed,
          subscribed: true,
          preferredRid: pub.rids.length ? options.preferredRid(pub.kind) : null,
        });
        if (!current()) {
          active.pendingDeliveries.delete(key);
          if (active === engine)
            await active.controller.setRemoteTrackSubscription({
              ...subscribed,
              subscribed: false,
            });
          return;
        }
        const metadata = active.adapter.getRemoteSubscription(pub.ownerId, pub.kind);
        const pc = active.peers.get('subscribe');
        if (!metadata || !pc) throw sfuError('BAD_SFU_OFFER');
        const sub: SfuSubscription = {
          ...metadata,
          key,
          pc,
          publisherSessionId: pub.sessionId,
          publisherId: pub.ownerId,
          trackName: pub.trackName,
          kind: pub.kind,
          track: null,
          negotiating: false,
          readyAt: Date.now(),
        };
        subscriptions.set(key, sub);
        const delivery = active.pendingDeliveries.get(key);
        active.pendingDeliveries.delete(key);
        if (delivery) active.deliver(sub, delivery);
        options.onReady(pub.kind, true);
      });
    active.subscriptionTasks.set(key, task);
    try {
      await task;
    } finally {
      if (active.subscriptionTasks.get(key) === task) active.subscriptionTasks.delete(key);
    }
  }

  function applyCatalog(next: readonly SfuPublication[]) {
    catalog = next;
    catalogRevision++;
    for (const [key, version] of retryVersions) {
      if (
        !next.some(
          (pub) => sfuKey(pub.ownerId, pub.kind) === key && publicationVersion(pub) === version,
        )
      ) {
        clearRetry(key);
      }
    }
    for (const key of [...subscriptionQueue.keys()]) {
      if (!next.some((pub) => sfuKey(pub.ownerId, pub.kind) === key && options.wants(pub))) {
        subscriptionQueue.cancel(key);
      }
    }
    for (const [key, sub] of subscriptions) {
      if (!next.some((pub) => matchesSubscription(pub, sub))) void closeSubscription(key);
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

    retryVersions.set(key, publicationVersion(pub));
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
      if (retryVersions.has(key) && retryVersions.get(key) !== publicationVersion(pub))
        clearRetry(key);
      if (retries.has(key) || (pub.kind !== 'audio' && (retryCounts.get(key) ?? 0) >= 4)) continue;
      const existing = subscriptions.get(key);
      if (existing && matchesSubscription(pub, existing)) continue;

      jobs.push(
        subscriptionQueue.schedule(key, pub.kind, publicationVersion(pub), async (currentJob) => {
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

  async function setLayer(key: string, rid: SfuRid, force = false): Promise<void> {
    const sub = subscriptions.get(key);
    if (
      !sub ||
      (!force && sub.preferredRid === rid) ||
      !catalog.find((pub) => matchesSubscription(pub, sub))?.rids.length
    )
      return;
    const active = engine;
    if (force) await active.adapter.setSubscriptionLayer(sub.publisherId, sub.kind, rid);
    else
      await active.controller.setRemoteTrackSubscription({
        participantId: sub.publisherId,
        kind: sub.kind,
        subscribed: true,
        preferredRid: rid,
      });
    if (engine === active && subscriptions.get(key) === sub) {
      sub.preferredRid =
        active.adapter.getRemoteSubscription(sub.publisherId, sub.kind)?.preferredRid ?? null;
    }
  }

  async function recoverConnection(reason: 'publisher' | 'subscription') {
    if (reconnecting || !options.getSettings().enabled) return;
    if (performance.now() - lastReconnect < 20_000) {
      await options.onFallback(reason);
      return;
    }
    reconnecting = true;
    lastReconnect = performance.now();
    reset(true);
    const active = engine;
    try {
      await active.ensure();
      for (const kind of ['audio', 'camera', 'screen'] as const) {
        if (active !== engine || !options.getSettings().enabled) return;
        const track = options.getTrack?.(kind);
        if (track?.readyState !== 'live') continue;
        try {
          await publish(kind, track);
        } catch (error) {
          if (kind === 'audio') throw error;
          if (active === engine) void publicationRecovery.recover(kind, error).catch(warn);
        }
      }
      if (active === engine) await refreshPublications();
      if (active === engine) await syncSubscriptions();
    } catch (error) {
      if (active === engine && options.getSettings().enabled) {
        warn(error);
        await options.onFallback(reason);
      }
    } finally {
      reconnecting = false;
    }
  }

  function reset(reconnectingSfu = false) {
    if (!reconnectingSfu) lastReconnect = -Infinity;
    generation++;
    catalogRevision++;
    catalog = Object.freeze([]);
    publicationRecovery.clear();
    subscriptionQueue.clear();
    for (const key of retries.keys()) clearRetry(key);
    retryCounts.clear();
    retryVersions.clear();
    for (const sub of subscriptions.values()) options.onSubscriptionClosed(sub);
    publications.clear();
    subscriptions.clear();
    teardown = engine.retire();
    engine = createEngine();
  }

  return {
    publications: publications as ReadonlyMap<VoiceMediaKind, SfuLocalPublication>,
    subscriptions: subscriptions as ReadonlyMap<string, SfuSubscription>,
    getGeneration: () => generation,
    getPublications: () => catalog,
    setPublications,
    refreshPublications,
    publish,
    publishScreen,
    updateScreenEncoding,
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
