export type RemotePerformanceProfileName = 'fast' | 'quality';

export interface RemotePerformanceProfile {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly bitrate: number;
}

export interface RemoteRtcStatReport {
  id: string;
  type: string;
  kind?: string;
  isRemote?: boolean;
  selectedCandidatePairId?: string;
  state?: string;
  nominated?: boolean;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  currentRoundTripTime?: number;
  availableOutgoingBitrate?: number;
  timestamp: number;
  framesPerSecond?: number;
  framesDecoded?: number;
  framesEncoded?: number;
  jitterBufferEmittedCount?: number;
  jitterBufferDelay?: number;
  totalDecodeTime?: number;
  totalEncodeTime?: number;
  bytesReceived?: number;
  bytesSent?: number;
  qualityLimitationReason?: string;
  frameWidth?: number;
  frameHeight?: number;
}

export interface RemotePerformanceSample {
  raw: RemoteRtcStatReport;
  rttMs: number | null;
  relay: boolean;
  fps: number | null;
  bufferMs: number;
  processingMs: number;
  bitrate: number | null;
  available: number | null;
  limitation: string;
  width: number | undefined;
  height: number | undefined;
}

export interface RemoteAdaptationState {
  level: number;
  healthy: number;
  bad: number;
}

export const profiles: Record<RemotePerformanceProfileName, RemotePerformanceProfile> = {
  fast: {
    label: 'Resposta rápida · 720p / 60 FPS',
    width: 1280,
    height: 720,
    bitrate: 6000000,
  },
  quality: {
    label: 'Mais detalhes · 1080p / 60 FPS',
    width: 1920,
    height: 1080,
    bitrate: 12000000,
  },
};

export function sample(
  reports: ReadonlyArray<RemoteRtcStatReport>,
  previous?: RemoteRtcStatReport | null,
): RemotePerformanceSample | null {
  let video: RemoteRtcStatReport | undefined;
  let pair: RemoteRtcStatReport | undefined;
  const byId = new Map(reports.map((r) => [r.id, r]));
  for (const r of reports) {
    if (r.type === 'transport' && r.selectedCandidatePairId) {
      pair = byId.get(r.selectedCandidatePairId);
    }
    if (
      (r.type === 'inbound-rtp' || r.type === 'outbound-rtp') &&
      r.kind === 'video' &&
      !r.isRemote
    ) {
      video = r;
    }
  }
  if (!pair) {
    pair = reports.find(
      (r) => r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated,
    );
  }
  if (!video) return null;
  const elapsed = previous ? Math.max(0.001, (video.timestamp - previous.timestamp) / 1000) : 0;
  const delta = (
    k:
      | 'framesDecoded'
      | 'framesEncoded'
      | 'jitterBufferEmittedCount'
      | 'jitterBufferDelay'
      | 'totalDecodeTime'
      | 'totalEncodeTime'
      | 'bytesReceived'
      | 'bytesSent',
  ) => (previous ? Math.max(0, (video[k] || 0) - (previous[k] || 0)) : 0);
  const frames = delta('framesDecoded') || delta('framesEncoded');
  const emitted = delta('jitterBufferEmittedCount');
  const local = pair?.localCandidateId ? byId.get(pair.localCandidateId) : undefined;
  const remote = pair?.remoteCandidateId ? byId.get(pair.remoteCandidateId) : undefined;
  return {
    raw: video,
    rttMs: pair?.currentRoundTripTime == null ? null : Math.round(pair.currentRoundTripTime * 1000),
    relay: local?.candidateType === 'relay' || remote?.candidateType === 'relay',
    fps: video.framesPerSecond ?? (elapsed ? Math.round(frames / elapsed) : null),
    bufferMs: emitted ? Math.round((delta('jitterBufferDelay') / emitted) * 1000) : 0,
    processingMs: frames
      ? Math.round(((delta('totalDecodeTime') || delta('totalEncodeTime')) / frames) * 1000)
      : 0,
    bitrate: elapsed
      ? Math.round(((delta('bytesReceived') || delta('bytesSent')) * 8) / elapsed)
      : null,
    available: pair?.availableOutgoingBitrate ?? null,
    limitation: video.qualityLimitationReason || 'none',
    width: video.frameWidth,
    height: video.frameHeight,
  };
}

// Congestion is also handled by WebRTC; cap resolution/bitrate so a slow
// upload/encoder does not spend scarce time processing discarded 1080p frames.
export function adaptation(
  profile: string,
  stats: Pick<RemotePerformanceSample, 'limitation' | 'available'> | null | undefined,
  level = 0,
  healthy = 0,
  bad = 0,
): RemoteAdaptationState {
  const p = profiles[profile as RemotePerformanceProfileName] || profiles.fast;
  const target = p.bitrate / (level + 1);
  const slow =
    stats &&
    (stats.limitation === 'cpu' || (stats.available != null && stats.available < target * 0.75));
  if (slow) {
    bad++;
    return {
      level: bad >= 3 ? Math.min(profile === 'quality' ? 2 : 1, level + 1) : level,
      healthy: 0,
      bad: bad >= 3 ? 0 : bad,
    };
  }
  const recovering = stats && (stats.available == null || stats.available > target * 1.2);
  if (recovering && ++healthy >= 8) {
    return { level: Math.max(0, level - 1), healthy: 0, bad: 0 };
  }
  return { level, healthy: recovering ? healthy : 0, bad: 0 };
}

export function encoding(
  profile: string,
  level = 0,
  source: { width?: number; height?: number } = {},
) {
  const p = profiles[profile as RemotePerformanceProfileName] || profiles.fast;
  const factor = level === 2 ? 2 : level === 1 ? 1.5 : 1;
  return {
    maxBitrate: Math.round(p.bitrate / (level + 1)),
    maxFramerate: 60,
    scaleResolutionDownBy:
      Math.max(1, (source.width || p.width) / p.width, (source.height || p.height) / p.height) *
      factor,
    priority: 'high' as const,
    networkPriority: 'high' as const,
  };
}

export const RemotePerformance = Object.freeze({
  profiles,
  sample,
  adaptation,
  encoding,
});

declare global {
  interface Window {
    TronoRemotePerformance?: typeof RemotePerformance;
  }
}

if (typeof window !== 'undefined') {
  window.TronoRemotePerformance = RemotePerformance;
}
