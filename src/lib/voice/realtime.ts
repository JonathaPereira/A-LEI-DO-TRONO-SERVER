import type { RealtimeSnapshot, RealtimeStatus } from '../../types/realtime';
import type { SocketMessage } from '../../types/socket';
import { readIceConfiguration, readRealtimeStatus } from './realtime-protocol.ts';
import { abortable } from './peer-wait.ts';

interface RealtimeOptions {
  connected(): boolean;
  visible(): boolean;
  callGeneration(): number;
  baseIce?: RTCConfiguration;
  requestStatus(): Promise<unknown>;
  requestIce(): Promise<unknown>;
  onMessage(listener: (message: SocketMessage) => void): () => void;
  onChange(): void;
  onStatus(status: RealtimeStatus, current: () => boolean): Promise<void>;
  warn?(error: unknown): void;
}
interface Pending<T> {
  controller: AbortController;
  promise: Promise<T | null>;
}
const defaultIce = (): RTCConfiguration => ({
  iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
  iceTransportPolicy: 'all',
});
function copyIce(config: RTCConfiguration): RTCConfiguration {
  return {
    ...config,
    iceServers: config.iceServers?.map((server) => ({
      ...server,
      urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
    })),
  };
}

/** One owner for policy, refresh listeners/timer and temporary ICE credentials.
 * No captures, peers or socket are created here. Cancellation settles locally;
 * the shared network transport retains ownership of its request deadline.
 */
export function createRealtimeConfiguration(options: RealtimeOptions) {
  const baseIce = copyIce(
    options.baseIce ?? {
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
    },
  );
  let snapshot: RealtimeSnapshot = Object.freeze({ status: null, error: '', turn: false });
  let ice = defaultIce(),
    revision = 0,
    iceRevision = 0,
    policyRevision = 0;
  let statusPending: Pending<RealtimeStatus> | undefined;
  let icePending: (Pending<void> & { call: number }) | undefined;
  let policyController = new AbortController();
  let timer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  const warn = options.warn ?? ((error: unknown) => console.warn('[RealtimeConfiguration]', error));
  function update(patch: Partial<RealtimeSnapshot>) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    options.onChange();
  }
  function invalidateStatus() {
    revision++;
    policyRevision++;
    policyController.abort();
    policyController = new AbortController();
    statusPending?.controller.abort();
    statusPending = undefined;
  }
  async function accept(status: RealtimeStatus): Promise<RealtimeStatus | null> {
    policyController.abort();
    policyController = new AbortController();
    const version = ++policyRevision,
      epoch = revision,
      controller = policyController;
    const current = () => epoch === revision && version === policyRevision && options.connected();
    update({ status, error: '' });
    await abortable(
      Promise.resolve().then(() => {
        if (current()) return options.onStatus(status, current);
      }),
      controller.signal,
    );
    return current() ? status : null;
  }
  function sync(): Promise<RealtimeStatus | null> {
    if (!options.connected()) return Promise.resolve(null);
    if (statusPending) return statusPending.promise;
    const version = revision;
    const job: Pending<RealtimeStatus> = {
      controller: new AbortController(),
      promise: Promise.resolve(null),
    };
    statusPending = job;
    const current = () => version === revision && statusPending === job && options.connected();
    job.promise = (async () => {
      try {
        const value = await abortable(
          Promise.resolve().then(() => (current() ? options.requestStatus() : null)),
          job.controller.signal,
        );
        if (!current()) return null;
        return await accept(readRealtimeStatus(value));
      } catch (error) {
        if (current()) {
          warn(error);
          update({ error: 'Falha ao sincronizar com o backend' });
        }
        return null;
      } finally {
        if (statusPending === job) statusPending = undefined;
      }
    })();
    return job.promise;
  }
  function cancelIce() {
    iceRevision++;
    icePending?.controller.abort();
    icePending = undefined;
    ice = defaultIce();
    update({ turn: false });
  }
  function refreshIce(): Promise<void | null> {
    if (!options.connected()) return Promise.resolve(null);
    const call = options.callGeneration();
    if (icePending?.call === call) return icePending.promise;
    icePending?.controller.abort();
    const version = ++iceRevision;
    const job = {
      call,
      controller: new AbortController(),
      promise: Promise.resolve<void | null>(null),
    };
    icePending = job;
    const current = () =>
      icePending === job &&
      version === iceRevision &&
      call === options.callGeneration() &&
      options.connected();
    job.promise = (async () => {
      try {
        const value = await abortable(
          Promise.resolve().then(() => (current() ? options.requestIce() : null)),
          job.controller.signal,
        );
        if (!current()) return null;
        const parsed = readIceConfiguration(value);
        ice = parsed.configuration;
        update({ turn: parsed.turn });
      } catch (error) {
        if (current()) {
          warn(error);
          ice = defaultIce();
          update({ turn: false });
        }
      } finally {
        if (icePending === job) icePending = undefined;
      }
    })();
    return job.promise;
  }
  function message(message: SocketMessage) {
    if (message.type === 'connection' && message.connected === false) {
      invalidateStatus();
      cancelIce();
      update({ status: null, error: 'Servidor desconectado' });
    } else if (message.type === 'realtime-status' && options.connected()) {
      try {
        const status = readRealtimeStatus(message);
        invalidateStatus();
        const version = revision;
        void accept(status).catch((error) => {
          if (version === revision) warn(error);
        });
      } catch (error) {
        warn(error);
      }
    } else if (
      message.type === 'welcome' ||
      message.type === 'joined-room' ||
      (message.type === 'connection' && message.connected === true)
    ) {
      void sync();
    }
  }
  function start() {
    if (unsubscribe) return;
    unsubscribe = options.onMessage(message);
    timer = setInterval(() => {
      if (options.visible() && options.connected()) void sync();
    }, 15000);
    void sync();
  }
  function stop() {
    unsubscribe?.();
    unsubscribe = undefined;
    clearInterval(timer);
    timer = undefined;
    invalidateStatus();
    cancelIce();
    update({ status: null, error: '' });
  }
  return {
    getSnapshot: () => snapshot,
    configuration(transport: 'p2p' | 'sfu'): RTCConfiguration {
      const sfu = copyIce(ice);
      if (transport === 'sfu') return sfu;
      const p2p = copyIce(baseIce);
      return { ...p2p, iceServers: [...(p2p.iceServers ?? []), ...(sfu.iceServers ?? [])] };
    },
    sync,
    refreshIce,
    cancelIce,
    start,
    stop,
    restrictHighQuality() {
      if (!snapshot.status) return;
      invalidateStatus();
      update({
        status: Object.freeze({
          ...snapshot.status,
          highAllowed: false,
          maxQuality:
            snapshot.status.maxQuality === 'high' ? 'balanced' : snapshot.status.maxQuality,
        }),
      });
    },
  };
}
