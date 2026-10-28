import type { PreparedVoice } from '../../types/network';
import type { SocketMessage } from '../../types/socket';
import type {
  VoiceCallOperation,
  VoiceCallSnapshot,
  VoiceLeaveReason,
} from '../../types/voice-call';
import type { Microphone } from './microphone';
import { voiceCancelled } from './microphone.ts';
import { abortable } from './peer-wait.ts';

interface CallOptions {
  prepare(): Promise<PreparedVoice>;
  microphone: Pick<Microphone, 'acquire' | 'stop'>;
  roomId(): string | null | undefined;
  onMessage(listener: (message: SocketMessage) => void): () => void;
  /** Synchronous: audio unlock must stay inside the original user gesture. */
  onPreparing(): void;
  onPrepared(choice: PreparedVoice): void;
  onJoined(operation: VoiceCallOperation): Promise<void>;
  connect(operation: VoiceCallOperation): Promise<void>;
  onLeaving(): void;
  /** Synchronous local release only; each resource retains its existing owner. */
  release: readonly (() => void)[];
  onLeft(reason: VoiceLeaveReason, wasJoined: boolean): void;
  onError(error: unknown): void;
  onChange(): void;
  warn?(error: unknown): void;
}
interface Joining {
  readonly controller: AbortController;
  readonly promise: Promise<boolean>;
  resolve(value: boolean): void;
}

/** Owns call entry/exit and generation, never tracks, peers or a second socket. */
export function createVoiceCall(options: CallOptions) {
  let snapshot: VoiceCallSnapshot = Object.freeze({
    generation: 0,
    phase: 'idle',
    joined: false,
    joining: false,
  });
  let joining: Joining | null = null;
  let activeRoomId: string | null = null;
  let activeController: AbortController | undefined;
  let unsubscribe: (() => void) | undefined;
  let disposed = false;
  const warn = options.warn ?? ((error: unknown) => console.warn('[VoiceCall]', error));
  function safely(action: () => unknown) {
    try {
      action();
    } catch (error) {
      warn(error);
    }
  }
  function update(patch: Partial<VoiceCallSnapshot>) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    safely(options.onChange);
  }
  function end(reason: VoiceLeaveReason) {
    const wasJoined = snapshot.joined;
    joining = null;
    activeRoomId = null;
    // Invalidate before any release callback can dispatch track/network events.
    snapshot = Object.freeze({
      generation: snapshot.generation + 1,
      phase: 'idle',
      joined: false,
      joining: false,
    });
    activeController?.abort();
    activeController = undefined;
    safely(options.onLeaving);
    safely(options.microphone.stop);
    for (const release of options.release) safely(release);
    safely(() => options.onLeft(reason, wasJoined));
    safely(options.onChange);
  }
  function leave(reason: VoiceLeaveReason = 'leave'): Promise<void> {
    if (!disposed) end(reason);
    return Promise.resolve();
  }
  function toggle(): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (snapshot.joined) return leave().then(() => false);
    if (joining) return joining.promise;
    let resolve!: Joining['resolve'];
    const job: Joining = {
      controller: new AbortController(),
      promise: new Promise((yes) => {
        resolve = yes;
      }),
      resolve: (value) => resolve(value),
    };
    joining = job;
    // Navigation consumes the same departure event before this owner does.
    // Bind identity to the call attempt instead of consulting cleared metadata.
    activeRoomId = options.roomId() ?? null;
    activeController = job.controller;
    const generation = snapshot.generation + 1;
    const current = () =>
      !disposed && snapshot.generation === generation && !job.controller.signal.aborted;
    const operation: VoiceCallOperation = {
      generation,
      signal: job.controller.signal,
      isCurrent: current,
    };
    const ensure = () => {
      if (!current()) throw voiceCancelled();
    };
    update({ generation, phase: 'preparing', joining: true });
    // This hook cannot be deferred: browsers require resume/play in the gesture.
    let preparationError: unknown;
    try {
      if (current()) options.onPreparing();
    } catch (error) {
      preparationError = error;
    }
    const run = async () => {
      try {
        ensure();
        if (preparationError !== undefined) throw preparationError;
        const choice = await abortable(
          Promise.resolve().then(() => {
            ensure();
            return options.prepare();
          }),
          job.controller.signal,
        );
        ensure();
        update({ phase: 'microphone' });
        ensure();
        options.onPrepared(choice);
        ensure();
        // Preparation may attach a game room before capture starts.
        activeRoomId = options.roomId() ?? activeRoomId;
        await abortable(options.microphone.acquire({ generation }), job.controller.signal);
        ensure();
        update({ joined: true, phase: 'connecting' });
        ensure();
        await abortable(options.onJoined(operation), job.controller.signal);
        ensure();
        await abortable(options.connect(operation), job.controller.signal);
        ensure();
        update({ phase: 'joined' });
        ensure();
        return true;
      } catch (error) {
        if (!current() || (error as { code?: unknown } | null)?.code === 'VOICE_CANCELLED')
          return false;
        end('leave');
        // A cleanup callback may start a new call; its UI must not receive this error.
        if (snapshot.generation === generation + 1 && !joining)
          safely(() => options.onError(error));
        return false;
      } finally {
        if (joining === job) {
          joining = null;
          update({ joining: false });
        }
      }
    };
    void run().then(job.resolve, (error) => {
      warn(error);
      job.resolve(false);
    });
    return job.promise;
  }
  return {
    getSnapshot: () => snapshot,
    toggle,
    leave,
    start() {
      if (disposed || unsubscribe) return;
      unsubscribe = options.onMessage((message) => {
        if (message.type === 'connection') {
          if (message.connected === false) {
            if (message.recovering === true && snapshot.joined) update({ phase: 'reconnecting' });
            else end('disconnect');
          } else if (message.resumed === true && snapshot.phase === 'reconnecting')
            update({ phase: 'joined' });
        } else if (
          ['left-game-room', 'left-voice-room', 'channel-deleted'].includes(message.type) &&
          typeof message.roomId === 'string' &&
          message.roomId === activeRoomId
        )
          end('leave');
      });
    },
    dispose() {
      if (disposed) return;
      unsubscribe?.();
      unsubscribe = undefined;
      disposed = true;
      end('leave');
    },
  };
}
