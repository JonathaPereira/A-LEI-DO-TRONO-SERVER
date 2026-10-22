import { object } from './http-api.ts';
import { parsePeerSignal } from '../src/lib/voice/peer-protocol.ts';
import { isRealtimeQuality } from './realtime-policy.ts';
import type { MediaTransport } from '../src/types/domain';
import type { RealtimeQuality } from './realtime-policy';

export interface VoiceStateInput {
  joined: boolean;
  muted?: boolean;
  deafened?: boolean;
  camera?: boolean;
  screen?: boolean;
  quality?: RealtimeQuality;
  transport?: MediaTransport;
  screenFps?: 15 | 30 | 60;
}
export const roomId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 120 &&
  /^[a-zA-Z0-9_-]+$/.test(value);
export function readVoiceState(value: unknown): VoiceStateInput | null {
  if (!object(value) || typeof value.joined !== 'boolean') return null;
  for (const field of ['muted', 'deafened', 'camera', 'screen'])
    if (value[field] !== undefined && typeof value[field] !== 'boolean') return null;
  if (value.quality !== undefined && !isRealtimeQuality(value.quality)) return null;
  if (
    value.transport !== undefined &&
    value.transport !== 'p2p' &&
    value.transport !== 'sfu' &&
    value.transport !== 'sfu-pending'
  )
    return null;
  if (
    value.screenFps !== undefined &&
    value.screenFps !== 15 &&
    value.screenFps !== 30 &&
    value.screenFps !== 60
  )
    return null;
  return {
    joined: value.joined,
    ...(value.muted === undefined ? {} : { muted: value.muted as boolean }),
    ...(value.deafened === undefined ? {} : { deafened: value.deafened as boolean }),
    ...(value.camera === undefined ? {} : { camera: value.camera as boolean }),
    ...(value.screen === undefined ? {} : { screen: value.screen as boolean }),
    ...(value.quality === undefined ? {} : { quality: value.quality as RealtimeQuality }),
    ...(value.transport === undefined ? {} : { transport: value.transport as MediaTransport }),
    ...(value.screenFps === undefined ? {} : { screenFps: value.screenFps as 15 | 30 | 60 }),
  };
}
export function readVoiceSignal(value: unknown, fromId: string) {
  if (
    !object(value) ||
    typeof value.targetId !== 'string' ||
    !value.targetId ||
    value.targetId.length > 120
  )
    return null;
  const signal = parsePeerSignal({ ...value, fromId });
  return signal
    ? { targetId: value.targetId, signalType: signal.signalType, data: signal.data }
    : null;
}
