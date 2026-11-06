import type { PeerSignal } from '../../types/peer-signal';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Validate before allocating a peer or queuing browser operations. */
export function parsePeerSignal(value: unknown): ({ fromId: string } & PeerSignal) | null {
  if (!record(value) || typeof value.fromId !== 'string' || !value.fromId.trim()) return null;
  const { fromId, signalType, data } = value;
  if (!record(data)) return null;
  if (signalType === 'offer' || signalType === 'answer') {
    if (data.type !== signalType || typeof data.sdp !== 'string' || !data.sdp.trim()) return null;
    return { fromId, signalType, data: { type: signalType, sdp: data.sdp } };
  }
  if (signalType === 'stream-watch' && typeof data.watching === 'boolean')
    return { fromId, signalType, data: { watching: data.watching } };
  if (
    signalType === 'renegotiate-request' &&
    (data.iceRestart === undefined || typeof data.iceRestart === 'boolean')
  )
    return { fromId, signalType, data: { iceRestart: data.iceRestart === true } };
  if (signalType !== 'ice' || typeof data.candidate !== 'string') return null;
  if (data.sdpMid != null && typeof data.sdpMid !== 'string') return null;
  if (
    data.sdpMLineIndex != null &&
    (!Number.isInteger(data.sdpMLineIndex) || Number(data.sdpMLineIndex) < 0)
  )
    return null;
  if (data.usernameFragment != null && typeof data.usernameFragment !== 'string') return null;
  return {
    fromId,
    signalType,
    data: {
      candidate: data.candidate,
      sdpMid: data.sdpMid as string | null | undefined,
      sdpMLineIndex: data.sdpMLineIndex as number | null | undefined,
      usernameFragment: data.usernameFragment as string | null | undefined,
    },
  };
}
