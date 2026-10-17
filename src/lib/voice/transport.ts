import type { MediaTransport } from '../../types/domain';
import type { VoiceCallOperation, VoiceCallSnapshot } from '../../types/voice-call';
import type { VoiceTransportSnapshot } from '../../types/voice-transport';
import type { VoiceMediaKind } from '../../types/voice';
import type { SocketMessage } from '../../types/socket';
import type { createRealtimeConfiguration } from './realtime';
import type { SfuSession } from './sfu-session';
import { abortable } from './peer-wait.ts';
import { errorCode, sfuCancelled } from './sfu-protocol.ts';

interface TransportOptions {
  call(): VoiceCallSnapshot;
  community(): boolean;
  realtime: Pick<ReturnType<typeof createRealtimeConfiguration>, 'refreshIce' | 'sync'>;
  sfu: Pick<
    SfuSession,
    | 'getGeneration'
    | 'publications'
    | 'publish'
    | 'recoverPublication'
    | 'syncSubscriptions'
    | 'reset'
  >;
  tracks(): Partial<Record<VoiceMediaKind, MediaStreamTrack | null | undefined>>;
  closePeers(): void;
  clearReceived(): void;
  syncPeers(): void;
  announce(mode: MediaTransport): void;
  fallbackRoom(): void;
  onMessage(listener: (message: SocketMessage) => void): () => void;
  onChange(): void;
  onStatus(text: string, kind: 'ok' | 'warn'): void;
  onError(error: unknown | null): void;
  warn?(error: unknown): void;
}
interface Connection {
  generation: number;
  controller: AbortController;
  promise: Promise<void>;
}
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

/** Selects a room transport; existing owners retain all captures and peer resources. */
export function createVoiceTransport(options: TransportOptions) {
  let snapshot: VoiceTransportSnapshot = Object.freeze({ mode: 'p2p', roomMode: null });
  let roomId: string | null = null,
    revision = 0;
  let connection: Connection | undefined;
  let fallbackGeneration: number | undefined;
  let unsubscribe: (() => void) | undefined;
  let disposed = false;
  const warn = options.warn ?? ((error: unknown) => console.warn('[VoiceTransport]', error));
  function notify() {
    options.onChange();
  }
  function update(patch: Partial<VoiceTransportSnapshot>) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    notify();
  }
  function cancel() {
    revision++;
    connection?.controller.abort();
    connection = undefined;
  }
  function clear() {
    // Local cleanup is synchronous; remote close requests belong to the SFU owner.
    snapshot = Object.freeze({ ...snapshot, mode: 'stopping' });
    try {
      options.sfu.reset();
    } catch (error) {
      warn(error);
    }
    try {
      options.clearReceived();
    } catch (error) {
      warn(error);
    }
    update({ mode: 'p2p' });
  }
  function reset() {
    cancel();
    clear();
  }
  function fallback(reason = 'SFU indisponível; retornando ao P2P.'): Promise<void> {
    const call = options.call();
    if (disposed || !call.joined) return Promise.resolve();
    // Latch before asking the backend: it may synchronously deliver voice-mode.
    if (fallbackGeneration !== call.generation) {
      fallbackGeneration = call.generation;
      options.fallbackRoom();
    }
    const previous = snapshot.mode;
    snapshot = Object.freeze({ ...snapshot, roomMode: 'p2p' });
    cancel();
    if (previous !== 'p2p') {
      clear();
      if (options.call().joined && options.call().generation === call.generation) {
        options.announce('p2p');
        options.onStatus(reason, 'warn');
        options.syncPeers();
      }
    }
    return Promise.resolve();
  }
  function begin() {
    update({ mode: options.community() && snapshot.roomMode === 'sfu' ? 'sfu-pending' : 'p2p' });
  }
  function connect(operation: VoiceCallOperation): Promise<void> {
    if (disposed || !operation.isCurrent() || !options.call().joined) return Promise.resolve();
    if (connection?.generation === operation.generation) return connection.promise;
    if (!options.community() || snapshot.roomMode !== 'sfu') {
      update({ mode: 'p2p' });
      options.syncPeers();
      return Promise.resolve();
    }
    cancel();
    const job: Connection = {
      generation: operation.generation,
      controller: new AbortController(),
      promise: Promise.resolve(),
    };
    connection = job;
    const epoch = revision,
      room = roomId,
      sfuGeneration = options.sfu.getGeneration();
    const abort = () => job.controller.abort();
    operation.signal.addEventListener('abort', abort, { once: true });
    if (operation.signal.aborted) abort();
    const current = () =>
      !disposed &&
      epoch === revision &&
      roomId === room &&
      operation.isCurrent() &&
      !job.controller.signal.aborted &&
      options.call().joined &&
      options.sfu.getGeneration() === sfuGeneration &&
      snapshot.roomMode !== 'p2p';
    const ensure = () => {
      if (!current()) throw sfuCancelled();
    };
    const wait = <T>(promise: Promise<T>) => abortable(promise, job.controller.signal);
    update({ mode: 'sfu-pending' });
    job.promise = (async () => {
      try {
        ensure();
        await wait(options.realtime.refreshIce());
        ensure();
        let status = await wait(options.realtime.sync());
        ensure();
        if (!status) {
          options.onStatus('Conferindo o servidor de mídia novamente…', 'warn');
          await delay(500, job.controller.signal);
          ensure();
          status = await wait(options.realtime.sync());
          ensure();
        }
        if (!status?.enabled || !status.configured || status.hardBlocked) {
          await fallback();
          return;
        }
        update({ mode: 'sfu' });
        ensure();
        options.onError(null);
        options.closePeers();
        ensure();
        const audio = options.tracks().audio;
        if (audio) {
          try {
            await wait(options.sfu.publish('audio', audio));
          } catch (error) {
            ensure();
            if (!(await wait(options.sfu.recoverPublication('audio', error)))) {
              ensure();
              await fallback();
              return;
            }
          }
        }
        ensure();
        // Optional publications must never delay incoming voice or one another.
        const tracks = options.tracks();
        for (const kind of ['camera', 'screen', 'screen-audio'] as const) {
          ensure();
          const track = tracks[kind];
          if (!track || (kind !== 'camera' && !status.screenAllowed)) continue;
          void options.sfu
            .publish(kind, track)
            .catch((error) => {
              if (current()) return options.sfu.recoverPublication(kind, error);
            })
            .catch(warn);
        }
        ensure();
        options.announce('sfu');
        await wait(options.sfu.syncSubscriptions());
        ensure();
        options.syncPeers();
        options.onStatus('Voz conectada pelo Cloudflare SFU.', 'ok');
      } catch (error) {
        if (!current() || errorCode(error) === 'SFU_CANCELLED') return;
        warn(error);
        options.onError(error);
        await fallback(`SFU não conectou (${errorCode(error)}). Tentando áudio por P2P…`);
      } finally {
        operation.signal.removeEventListener('abort', abort);
        if (connection === job) connection = undefined;
      }
    })();
    return job.promise;
  }
  return {
    getSnapshot: () => snapshot,
    announced(): MediaTransport {
      if (snapshot.mode === 'sfu')
        return options.sfu.publications.get('audio')?.ready ? 'sfu' : 'sfu-pending';
      return snapshot.mode === 'sfu-pending' || snapshot.mode === 'stopping'
        ? 'sfu-pending'
        : 'p2p';
    },
    prepare(mode: MediaTransport) {
      update({ roomMode: mode === 'sfu' ? 'sfu' : 'p2p' });
    },
    begin,
    connect,
    fallback,
    reset,
    setRoom(id: string | null) {
      if (id === roomId) return;
      cancel();
      if (snapshot.mode !== 'p2p') clear();
      roomId = id;
      update({ roomMode: null });
    },
    start() {
      if (disposed || unsubscribe) return;
      unsubscribe = options.onMessage((message) => {
        if (
          message.type !== 'voice-mode' ||
          typeof message.roomId !== 'string' ||
          message.roomId !== roomId ||
          (message.mode !== 'p2p' && message.mode !== 'sfu')
        )
          return;
        update({ roomMode: message.mode as 'p2p' | 'sfu' });
        if (options.call().joined && message.mode === 'p2p' && snapshot.mode !== 'p2p')
          void fallback(
            typeof message.reason === 'string' && message.reason
              ? message.reason
              : 'Chamada sincronizada em P2P.',
          );
      });
    },
    dispose() {
      if (disposed) return;
      unsubscribe?.();
      unsubscribe = undefined;
      disposed = true;
      reset();
    },
  };
}
