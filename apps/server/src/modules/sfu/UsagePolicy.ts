import fs from 'node:fs';
import path from 'node:path';
import {
  isSfuMediaKind,
  isSfuQualityPreset,
  isSfuSimulcastRid,
  type SfuMediaKind,
  type SfuQualityPreset,
  type SfuSimulcastRid,
} from '@trono/protocol';
import { isPlainObject } from './CloudflareCallsClient.ts';

export type RealtimeQuality = SfuQualityPreset;
export type RealtimeKind = SfuMediaKind;
export type RealtimeRid = SfuSimulcastRid;
export const isRealtimeKind = isSfuMediaKind;
export const isRealtimeQuality = isSfuQualityPreset;
export const isRealtimeRid = isSfuSimulcastRid;

const QUALITY_ORDER: readonly SfuQualityPreset[] = ['economy', 'balanced', 'high'];

export const PROFILE: Record<
  SfuQualityPreset,
  { audio: number; camera: Record<SfuSimulcastRid, number>; screen: number }
> = {
  economy: { audio: 64_000, camera: { f: 900_000, h: 450_000, q: 180_000 }, screen: 4_000_000 },
  balanced: { audio: 96_000, camera: { f: 2_200_000, h: 950_000, q: 350_000 }, screen: 8_000_000 },
  high: { audio: 128_000, camera: { f: 3_500_000, h: 1_400_000, q: 450_000 }, screen: 10_000_000 },
};

export interface RealtimeSettings {
  appId: string;
  token: string;
  enabled: boolean;
  turnEnabled: boolean;
  turnKeyId: string;
  turnToken: string;
  turnTtl: number;
  softLimitGb: number;
  hardLimitGb: number;
  ultraDisableGb: number;
  highDisableGb: number;
  screenDisableGb: number;
  monthBaseGb: number;
  maxParticipants: number;
  estimateSafetyFactor: number;
}

export interface RealtimeUsage {
  month: string;
  bytes: number;
  lastTick: number;
  loadedFromDisk: boolean;
}

export interface BitratePublication {
  kind: SfuMediaKind;
  quality: SfuQualityPreset;
  screenBitrate?: number | null;
  rids?: readonly string[];
}

export interface RealtimePolicy {
  enabled: boolean;
  configured: boolean;
  hardBlocked: boolean;
  softWarning: boolean;
  screenAllowed: boolean;
  highAllowed: boolean;
  ultraAllowed: boolean;
  maxQuality: SfuQualityPreset;
  estimatedGb: number;
  processEstimatedGb: number;
  baseGb: number;
  thresholds: {
    soft: number;
    ultra: number;
    high: number;
    screen: number;
    hard: number;
  };
  month: string;
  maxParticipants: number;
  usageIsEstimate: boolean;
  estimateSafetyFactor: number;
}

export type AvailabilityCheckResult =
  { ok: true; policy: RealtimePolicy } | { ok: false; code: string; message: string };

/** Reads production Render environment variables keeping 100% legacy compatibility. */
export function readRealtimeSettings(env: NodeJS.ProcessEnv = process.env): RealtimeSettings {
  const bool = (name: string, fallback = false) =>
    env[name] == null ? fallback : /^(1|true|yes|on)$/i.test(String(env[name]).trim());
  const num = (name: string, fallback: number) => {
    const value = Number(env[name]);
    return Number.isFinite(value) ? value : fallback;
  };

  const softLimitGb = Math.max(0, num('REALTIME_MONTHLY_SOFT_LIMIT_GB', 800));
  const ultraDisableGb = Math.max(0, num('REALTIME_ULTRA_DISABLE_GB', 800));
  const highDisableGb = Math.max(ultraDisableGb, num('REALTIME_HIGH_DISABLE_GB', 850));

  return {
    appId: String(env.CLOUDFLARE_REALTIME_APP_ID || '').trim(),
    token: String(env.CLOUDFLARE_REALTIME_API_TOKEN || '').trim(),
    enabled: bool('CLOUDFLARE_REALTIME_ENABLED'),
    turnEnabled: bool('CLOUDFLARE_TURN_ENABLED'),
    turnKeyId: String(env.CLOUDFLARE_TURN_KEY_ID || '').trim(),
    turnToken: String(env.CLOUDFLARE_TURN_API_TOKEN || '').trim(),
    turnTtl: Math.max(
      600,
      Math.min(172_800, Math.floor(num('CLOUDFLARE_TURN_TTL_SECONDS', 21_600))),
    ),
    softLimitGb,
    hardLimitGb: Math.max(softLimitGb, num('REALTIME_MONTHLY_HARD_LIMIT_GB', 950)),
    ultraDisableGb,
    highDisableGb,
    screenDisableGb: Math.max(highDisableGb, num('REALTIME_SCREEN_DISABLE_GB', 900)),
    monthBaseGb: Math.max(0, num('REALTIME_MONTHLY_BASE_GB', 0)),
    maxParticipants: Math.max(2, Math.min(32, Math.floor(num('REALTIME_MAX_PARTICIPANTS', 32)))),
    estimateSafetyFactor: Math.max(1, Math.min(4, num('REALTIME_ESTIMATE_SAFETY_FACTOR', 1.5))),
  };
}

export function computeRealtimePolicy(
  settings: RealtimeSettings,
  usage: RealtimeUsage,
): RealtimePolicy {
  const gb = settings.monthBaseGb + usage.bytes / 1e9;
  const hardBlocked = gb >= settings.hardLimitGb;
  const highAllowed = gb < settings.highDisableGb && !hardBlocked;

  return {
    enabled: settings.enabled,
    configured: !!(settings.appId && settings.token),
    hardBlocked,
    softWarning: gb >= settings.softLimitGb,
    screenAllowed: gb < settings.screenDisableGb && !hardBlocked,
    highAllowed,
    ultraAllowed: false,
    maxQuality: hardBlocked ? 'economy' : !highAllowed ? 'balanced' : 'high',
    estimatedGb: Number(gb.toFixed(3)),
    processEstimatedGb: Number((usage.bytes / 1e9).toFixed(3)),
    baseGb: settings.monthBaseGb,
    thresholds: {
      soft: settings.softLimitGb,
      ultra: settings.ultraDisableGb,
      high: settings.highDisableGb,
      screen: settings.screenDisableGb,
      hard: settings.hardLimitGb,
    },
    month: usage.month,
    maxParticipants: settings.maxParticipants,
    usageIsEstimate: true,
    estimateSafetyFactor: settings.estimateSafetyFactor,
  };
}

export function clampRealtimeQuality(value: unknown, policy: RealtimePolicy): SfuQualityPreset {
  const quality: SfuQualityPreset =
    value === 'economy' || value === 'high' || value === 'balanced' ? value : 'balanced';
  return QUALITY_ORDER.indexOf(quality) > QUALITY_ORDER.indexOf(policy.maxQuality)
    ? policy.maxQuality
    : quality;
}

export function preferredRealtimeRid(quality: unknown, policy: RealtimePolicy): SfuSimulcastRid {
  return clampRealtimeQuality(quality, policy) === 'economy' ? 'q' : 'f';
}

export function clampRealtimeRid(
  pub: Pick<BitratePublication, 'rids'> | null,
  requested: unknown,
  quality: unknown,
  policy: RealtimePolicy,
): SfuSimulcastRid | null {
  const available = Array.isArray(pub?.rids)
    ? pub.rids.filter((r): r is SfuSimulcastRid => r === 'f' || r === 'h' || r === 'q')
    : [];
  if (available.length === 0) return null;

  let rid: SfuSimulcastRid = available.includes(requested as SfuSimulcastRid)
    ? (requested as SfuSimulcastRid)
    : preferredRealtimeRid(quality, policy);
  if (rid === 'f' && !policy.highAllowed) rid = 'h';
  if (!available.includes(rid)) {
    rid = available.includes('h') ? 'h' : available.includes('q') ? 'q' : available[0];
  }
  return rid;
}

export function subscriptionBitrate(
  pub: BitratePublication,
  rid: SfuSimulcastRid | null,
  safetyFactor: number,
): number {
  const profile = PROFILE[pub.quality] || PROFILE.balanced;
  let bps: number;
  if (pub.kind === 'audio') bps = profile.audio;
  else if (pub.kind === 'screen-audio') bps = 192_000;
  else if (pub.kind === 'screen') {
    bps = (pub.screenBitrate || profile.screen) * (rid === 'q' ? 0.18 : rid === 'h' ? 0.42 : 1);
  } else {
    bps = profile.camera[rid as SfuSimulcastRid] || profile.camera.h;
  }
  return Math.ceil(bps * safetyFactor);
}

export function assertSfuAvailable(
  settings: RealtimeSettings,
  policy: RealtimePolicy,
  kind: SfuMediaKind = 'audio',
  quality: SfuQualityPreset = 'balanced',
): AvailabilityCheckResult {
  if (!settings.enabled) {
    return {
      ok: false,
      code: 'REALTIME_DISABLED',
      message: 'Cloudflare Realtime está desligado pelo kill switch.',
    };
  }
  if (!policy.configured) {
    return {
      ok: false,
      code: 'REALTIME_NOT_CONFIGURED',
      message: 'Cloudflare Realtime não está configurado no backend.',
    };
  }
  if (policy.hardBlocked) {
    return {
      ok: false,
      code: 'REALTIME_HARD_LIMIT',
      message: 'Limite operacional mensal do Realtime atingido.',
    };
  }
  if ((kind === 'screen' || kind === 'screen-audio') && !policy.screenAllowed) {
    return {
      ok: false,
      code: 'SCREEN_BUDGET_BLOCKED',
      message: 'Compartilhamento bloqueado pelo freio de consumo.',
    };
  }
  if (quality === 'high' && !policy.highAllowed) {
    return {
      ok: false,
      code: 'HIGH_BUDGET_BLOCKED',
      message: 'Qualidade Alta foi bloqueada pelo freio de consumo.',
    };
  }
  return { ok: true, policy };
}

export function monthKeyUTC(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface UsageMeter {
  readonly state: RealtimeUsage;
  save(timestamp?: number): void;
  advance(egressBps: number, timestamp?: number): void;
}

/** Tracks estimated monthly SFU egress bytes with an ephemeral local checkpoint file. */
export function createRealtimeUsage({
  file,
  now = Date.now,
}: {
  file: string;
  now?: () => number;
}): UsageMeter {
  let state: RealtimeUsage = {
    month: monthKeyUTC(now()),
    bytes: 0,
    lastTick: now(),
    loadedFromDisk: false,
  };

  function load(): void {
    try {
      const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        isPlainObject(data) &&
        data.month === state.month &&
        (typeof data.bytes === 'number' || typeof data.bytes === 'string') &&
        Number.isFinite(Number(data.bytes))
      ) {
        state.bytes = Math.max(0, Number(data.bytes));
        state.loadedFromDisk = true;
      }
    } catch {
      // Missing or invalid checkpoint starts a fresh counter for the current month.
    }
  }

  function save(timestamp = now()): void {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({
          month: state.month,
          bytes: state.bytes,
          updatedAt: new Date(timestamp).toISOString(),
        }),
      );
    } catch {
      // Ephemeral filesystem failures must never disrupt active voice calls.
    }
  }

  function advance(egressBps: number, timestamp = now()): void {
    const month = monthKeyUTC(timestamp);
    if (month !== state.month) {
      state = { month, bytes: 0, lastTick: timestamp, loadedFromDisk: false };
    }
    const dt = Math.max(0, Math.min(15_000, timestamp - state.lastTick));
    state.lastTick = timestamp;
    if (dt > 0) state.bytes += (egressBps / 8) * (dt / 1000);
  }

  load();
  return {
    get state() {
      return state;
    },
    save,
    advance,
  };
}
