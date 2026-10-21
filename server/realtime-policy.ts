export type RealtimeQuality = 'economy' | 'balanced' | 'high';
export type RealtimeKind = 'audio' | 'camera' | 'screen' | 'screen-audio';
export type RealtimeRid = 'f' | 'h' | 'q';
export const ALLOWED_KINDS: ReadonlySet<string> = new Set([
  'audio',
  'camera',
  'screen',
  'screen-audio',
]);
export const ALLOWED_QUALITIES: ReadonlySet<string> = new Set(['economy', 'balanced', 'high']);
const QUALITY_ORDER: readonly string[] = ['economy', 'balanced', 'high'];
export const PROFILE: Record<
  RealtimeQuality,
  { audio: number; camera: Record<RealtimeRid, number>; screen: number }
> = {
  economy: { audio: 64000, camera: { f: 900000, h: 450000, q: 180000 }, screen: 4000000 },
  balanced: { audio: 96000, camera: { f: 2200000, h: 950000, q: 350000 }, screen: 8000000 },
  high: { audio: 128000, camera: { f: 3500000, h: 1400000, q: 450000 }, screen: 10000000 },
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
/** Preserve the existing env vocabulary/defaults; no credentials enter the public policy. */
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
    turnTtl: Math.max(600, Math.min(172800, Math.floor(num('CLOUDFLARE_TURN_TTL_SECONDS', 21600)))),
    softLimitGb,
    hardLimitGb: Math.max(softLimitGb, num('REALTIME_MONTHLY_HARD_LIMIT_GB', 950)),
    ultraDisableGb,
    highDisableGb,
    screenDisableGb: Math.max(highDisableGb, num('REALTIME_SCREEN_DISABLE_GB', 900)),
    monthBaseGb: Math.max(0, num('REALTIME_MONTHLY_BASE_GB', 0)),
    maxParticipants: Math.max(2, Math.min(32, Math.floor(num('REALTIME_MAX_PARTICIPANTS', 8)))),
    estimateSafetyFactor: Math.max(1, Math.min(4, num('REALTIME_ESTIMATE_SAFETY_FACTOR', 1.5))),
  };
}
export interface RealtimeUsage {
  month: string;
  bytes: number;
  lastTick: number;
  loadedFromDisk: boolean;
}
export function realtimePolicy(settings: RealtimeSettings, usage: RealtimeUsage) {
  const gb = settings.monthBaseGb + usage.bytes / 1e9,
    hardBlocked = gb >= settings.hardLimitGb;
  const highAllowed = gb < settings.highDisableGb && !hardBlocked;
  return {
    enabled: settings.enabled,
    configured: !!(settings.appId && settings.token),
    hardBlocked,
    softWarning: gb >= settings.softLimitGb,
    screenAllowed: gb < settings.screenDisableGb && !hardBlocked,
    highAllowed,
    ultraAllowed: false,
    maxQuality: (hardBlocked ? 'economy' : !highAllowed ? 'balanced' : 'high') as RealtimeQuality,
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
export type RealtimePolicy = ReturnType<typeof realtimePolicy>;
export function clampRealtimeQuality(value: unknown, policy: RealtimePolicy): RealtimeQuality {
  const quality: RealtimeQuality =
    value === 'economy' || value === 'high' || value === 'balanced' ? value : 'balanced';
  return Math.max(0, QUALITY_ORDER.indexOf(quality)) >
    Math.max(0, QUALITY_ORDER.indexOf(policy.maxQuality))
    ? policy.maxQuality
    : quality;
}
export function preferredRealtimeRid(quality: unknown, policy: RealtimePolicy): RealtimeRid {
  return clampRealtimeQuality(quality, policy) === 'economy' ? 'q' : 'f';
}
export interface BitratePublication {
  kind: RealtimeKind;
  quality: RealtimeQuality;
  screenBitrate?: number | null;
  rids?: readonly string[];
}
export function clampRealtimeRid(
  pub: Pick<BitratePublication, 'rids'> | null,
  requested: unknown,
  quality: unknown,
  policy: RealtimePolicy,
): RealtimeRid | null {
  const available = Array.isArray(pub?.rids)
    ? pub.rids.filter((r): r is RealtimeRid => r === 'f' || r === 'h' || r === 'q')
    : [];
  if (!available.length) return null;
  let rid: RealtimeRid = available.includes(requested as RealtimeRid)
    ? (requested as RealtimeRid)
    : preferredRealtimeRid(quality, policy);
  if (rid === 'f' && !policy.highAllowed) rid = 'h';
  if (!available.includes(rid))
    rid = available.includes('h') ? 'h' : available.includes('q') ? 'q' : available[0];
  return rid;
}
export function subscriptionBitrate(
  pub: BitratePublication,
  rid: RealtimeRid | null,
  safetyFactor: number,
): number {
  const profile = PROFILE[pub.quality] || PROFILE.balanced;
  let bps: number;
  if (pub.kind === 'audio') bps = profile.audio;
  else if (pub.kind === 'screen-audio') bps = 192000;
  else if (pub.kind === 'screen')
    bps = (pub.screenBitrate || profile.screen) * (rid === 'q' ? 0.18 : rid === 'h' ? 0.42 : 1);
  else bps = profile.camera[rid as RealtimeRid] || profile.camera.h;
  return Math.ceil(bps * safetyFactor);
}
