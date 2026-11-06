import type { RealtimeStatus, TransmissionQuality } from '../../types/realtime';
import { sfuError } from './sfu-protocol.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const quality = (value: unknown): value is TransmissionQuality =>
  value === 'economy' || value === 'balanced' || value === 'high';
const number = (value: unknown, fallback: number, positive = false): number => {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value < 0))
    throw sfuError('BAD_REALTIME_STATUS');
  return value;
};

/** Reject partial/malformed policy atomically; an unavailable policy cannot enable SFU. */
export function readRealtimeStatus(value: unknown): RealtimeStatus {
  if (
    !record(value) ||
    !['enabled', 'configured', 'hardBlocked', 'softWarning', 'screenAllowed', 'highAllowed'].every(
      (key) => typeof value[key] === 'boolean',
    ) ||
    !quality(value.maxQuality) ||
    (value.thresholds !== undefined && !record(value.thresholds))
  )
    throw sfuError('BAD_REALTIME_STATUS');
  const thresholds = value.thresholds as Record<string, unknown> | undefined;
  return Object.freeze({
    enabled: value.enabled as boolean,
    configured: value.configured as boolean,
    hardBlocked: value.hardBlocked as boolean,
    softWarning: value.softWarning as boolean,
    screenAllowed: value.screenAllowed as boolean,
    highAllowed: value.highAllowed as boolean,
    maxQuality: value.maxQuality,
    estimatedGb: number(value.estimatedGb, 0),
    estimateSafetyFactor: number(value.estimateSafetyFactor, 1, true),
    thresholds: Object.freeze({ hard: number(thresholds?.hard, 950, true) }),
  });
}

/** ICE accepts the WebRTC string/array wire forms and temporary TURN credentials. */
export function readIceConfiguration(value: unknown): {
  configuration: RTCConfiguration;
  turn: boolean;
} {
  if (
    !record(value) ||
    typeof value.turn !== 'boolean' ||
    !Array.isArray(value.iceServers) ||
    !value.iceServers.length
  )
    throw sfuError('BAD_SFU_ICE');
  const iceServers = value.iceServers.map((item: unknown): RTCIceServer => {
    if (!record(item)) throw sfuError('BAD_SFU_ICE');
    const urls = typeof item.urls === 'string' ? [item.urls] : item.urls;
    if (
      !Array.isArray(urls) ||
      !urls.length ||
      !urls.every(
        (url: unknown) => typeof url === 'string' && /^(stun|stuns|turn|turns):[^\s]+$/.test(url),
      )
    )
      throw sfuError('BAD_SFU_ICE');
    if (
      (item.username !== undefined && typeof item.username !== 'string') ||
      (item.credential !== undefined && typeof item.credential !== 'string')
    )
      throw sfuError('BAD_SFU_ICE');
    return {
      urls: [...urls],
      ...(item.username === undefined ? {} : { username: item.username }),
      ...(item.credential === undefined ? {} : { credential: item.credential }),
    };
  });
  return { configuration: { iceServers, iceTransportPolicy: 'all' }, turn: value.turn };
}
