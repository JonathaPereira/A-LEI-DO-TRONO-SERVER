import type { VoiceMediaKind } from '../../types/voice';
import type {
  MediaTelemetry,
  VideoFreezeCause,
  VideoStreamHealth,
} from '../../types/voice-diagnostics';

export interface VideoFreezeRecoveryOptions {
  active(): boolean;
  generation(): number;
  isSfu(): boolean;
  cooldownMs?: number;
  windowMs?: number;
  maxAttempts?: number;
  minStallMs?: number;
  hardRecoverStallMs?: number;
  healthyResetMs?: number;
  getBufferMs?: () => number;
  now?: () => number;
  nudgePublisher(
    kind: Extract<VoiceMediaKind, 'screen' | 'camera'>,
    cause: VideoFreezeCause | null,
  ): Promise<boolean>;
  recoverPublisher(
    kind: Extract<VoiceMediaKind, 'screen' | 'camera'>,
    cause: VideoFreezeCause | null,
  ): Promise<boolean>;
  refreshSfuSubscription(
    peerId: string,
    kind: Extract<VoiceMediaKind, 'screen' | 'camera'>,
  ): Promise<boolean>;
  recoverSfuSubscription(
    peerId: string,
    kind: Extract<VoiceMediaKind, 'screen' | 'camera'>,
  ): Promise<boolean>;
  recoverP2pMedia(peerId: string, iceRestart: boolean): Promise<boolean>;
  warn?: (error: unknown) => void;
}

interface TargetHistory {
  attempts: number[];
  lastActionAt: number;
  lastHealthyAt: number | null;
  inFlight: boolean;
}

function parseOutboundKind(pcKey: string): Extract<VoiceMediaKind, 'screen' | 'camera'> {
  const suffix = pcKey.startsWith('sfu-pub:')
    ? pcKey.slice(8)
    : pcKey.startsWith('sfu:')
      ? pcKey.slice(4)
      : '';
  return suffix === 'camera' ? 'camera' : 'screen';
}

function parsePeerTarget(
  pcKey: string,
  stream: VideoStreamHealth,
  isSfu: boolean,
): {
  transport: 'sfu' | 'p2p';
  peerId: string;
  kind: Extract<VoiceMediaKind, 'screen' | 'camera'>;
} | null {
  if (pcKey.startsWith('sfu-sub:') || pcKey.startsWith('sfu:')) {
    const rest = pcKey.startsWith('sfu-sub:') ? pcKey.slice(8) : pcKey.slice(4);
    const sep = rest.lastIndexOf(':');
    if (sep <= 0) return null;
    const peerId = rest.slice(0, sep);
    const rawKind = rest.slice(sep + 1);
    if (rawKind !== 'screen' && rawKind !== 'camera') return null;
    return { transport: 'sfu', peerId, kind: rawKind };
  }
  if (pcKey.startsWith('p2p:')) {
    const peerId = pcKey.slice(4);
    if (!peerId) return null;
    // Outbound screen or camera in P2P shares the peer connection; prefer screen recovery only on the stream itself.
    const kind: Extract<VoiceMediaKind, 'screen' | 'camera'> =
      stream.height >= 720 || !isSfu ? 'screen' : 'camera';
    return { transport: 'p2p', peerId, kind };
  }
  return null;
}

/**
 * Coordinates targeted, bounded per-stream recovery when telemetry proves a video freeze.
 * Never restarts the socket, leaves the call, or tears down healthy audio/camera streams.
 */
export function createVideoFreezeRecovery(options: VideoFreezeRecoveryOptions) {
  const now = options.now ?? (() => performance.now());
  const cooldownMs = options.cooldownMs ?? 6000;
  const windowMs = options.windowMs ?? 45000;
  const maxAttempts = options.maxAttempts ?? 3;
  const minStallMs = options.minStallMs ?? 1500;
  const hardRecoverStallMs = options.hardRecoverStallMs ?? Math.max(minStallMs * 2, 3800);
  const healthyResetMs = options.healthyResetMs ?? 15000;
  const warn = options.warn ?? ((error: unknown) => console.warn('[VideoRecovery]', error));
  const targets = new Map<string, TargetHistory>();

  function stateFor(key: string): TargetHistory {
    let entry = targets.get(key);
    if (!entry) {
      entry = { attempts: [], lastActionAt: -Infinity, lastHealthyAt: null, inFlight: false };
      targets.set(key, entry);
    }
    return entry;
  }

  function pruneWindow(entry: TargetHistory, stamp: number) {
    entry.attempts = entry.attempts.filter((at) => stamp - at <= windowMs);
  }

  async function runAction(
    targetKey: string,
    callGen: number,
    task: () => Promise<boolean>,
  ): Promise<boolean> {
    const entry = stateFor(targetKey);
    const stamp = now();
    pruneWindow(entry, stamp);
    if (entry.inFlight) return false;
    if (stamp - entry.lastActionAt < cooldownMs) return false;
    if (entry.attempts.length >= maxAttempts) return false;
    if (!options.active() || options.generation() !== callGen) return false;

    entry.inFlight = true;
    entry.lastActionAt = stamp;
    entry.attempts.push(stamp);
    try {
      const result = await task();
      if (!options.active() || options.generation() !== callGen) return false;
      return result;
    } catch (error) {
      if (options.active() && options.generation() === callGen) warn(error);
      return false;
    } finally {
      entry.inFlight = false;
    }
  }

  async function inspect(telemetry: Readonly<MediaTelemetry>): Promise<boolean> {
    if (!options.active()) return false;
    const streams = telemetry.streams;
    if (!streams?.length) return false;

    const stamp = now();
    const callGen = options.generation();
    const sfu = options.isSfu();
    const configuredBufferMs = options.getBufferMs?.() ?? 80;
    const extraBufferMs = Math.max(0, configuredBufferMs - 80);
    let triggered = false;

    for (const stream of streams) {
      const pubKind = parseOutboundKind(stream.pcKey);
      const targetKey =
        stream.direction === 'outbound'
          ? `pub:${pubKind}`
          : `sub:${stream.pcKey}:${stream.mid ?? stream.trackId ?? 'video'}`;

      const entry = stateFor(targetKey);
      if (!stream.stalled) {
        if (entry.lastHealthyAt === null) entry.lastHealthyAt = stamp;
        if (stamp - entry.lastHealthyAt >= healthyResetMs) entry.attempts = [];
        continue;
      }

      entry.lastHealthyAt = null;
      // Never loop SFU publish retries if the local capture source itself stopped producing frames.
      if (stream.cause === 'capture-interrupted') continue;

      const transportBroken =
        stream.cause === 'subscription-interrupted' ||
        stream.pcState === 'failed' ||
        stream.pcState === 'disconnected' ||
        stream.pcState === 'closed';
      const inboundBufferGrace =
        stream.direction === 'inbound' && !transportBroken ? extraBufferMs : 0;
      const immediate = stream.cause === 'subscription-interrupted';
      const effectiveMinStall = immediate
        ? Math.min(minStallMs, 800)
        : minStallMs + inboundBufferGrace;
      if (stream.stallMs < effectiveMinStall) continue;

      const canHardRecover =
        transportBroken || stream.stallMs >= hardRecoverStallMs + inboundBufferGrace;

      pruneWindow(entry, stamp);
      const attemptIndex = entry.attempts.length;

      if (stream.direction === 'outbound') {
        if (attemptIndex === 0) {
          const ran = await runAction(targetKey, callGen, () =>
            options.nudgePublisher(pubKind, stream.cause),
          );
          triggered ||= ran;
        } else if (canHardRecover) {
          // Do not tear down a connected publisher PeerConnection on uplink congestion;
          // GCC and CallStability adapt bitrate cleanly without a keyframe-burst reconnect loop.
          if (stream.cause === 'transport-congestion' && !transportBroken) continue;
          if (!transportBroken && stream.stallMs < Math.max(hardRecoverStallMs, 8000)) continue;
          const ran = await runAction(targetKey, callGen, () =>
            options.recoverPublisher(pubKind, stream.cause),
          );
          triggered ||= ran;
        }
        continue;
      }

      const parsed = parsePeerTarget(stream.pcKey, stream, sfu);
      if (!parsed) continue;
      if (parsed.transport === 'sfu') {
        // Connected SFU screen subscriptions recover from congestion/presentation freezes via
        // RTCP NACK/RTX/PLI; tearing down a connected PeerConnection causes a ~2s reconnect freeze.
        if (
          parsed.kind === 'screen' &&
          !transportBroken &&
          (stream.cause === 'presentation-frozen' || stream.cause === 'transport-congestion')
        )
          continue;
        if (attemptIndex === 0) {
          if (!canHardRecover && parsed.kind === 'screen') continue;
          const ran = await runAction(targetKey, callGen, async () => {
            const refreshed = await options.refreshSfuSubscription(parsed.peerId, parsed.kind);
            if (refreshed) return true;
            return canHardRecover
              ? options.recoverSfuSubscription(parsed.peerId, parsed.kind)
              : false;
          });
          triggered ||= ran;
        } else if (canHardRecover) {
          const ran = await runAction(targetKey, callGen, () =>
            options.recoverSfuSubscription(parsed.peerId, parsed.kind),
          );
          triggered ||= ran;
        }
      } else {
        const iceRestart = attemptIndex >= 1 || stream.pcState === 'disconnected';
        const ran = await runAction(targetKey, callGen, () =>
          options.recoverP2pMedia(parsed.peerId, iceRestart),
        );
        triggered ||= ran;
      }
    }

    return triggered;
  }

  function reset() {
    targets.clear();
  }

  return {
    inspect,
    reset,
    attemptsFor(key: string) {
      return targets.get(key)?.attempts.length ?? 0;
    },
  };
}
