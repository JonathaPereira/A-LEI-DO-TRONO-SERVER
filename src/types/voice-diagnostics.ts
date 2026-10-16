export interface ReceptionMetrics {
  readonly lossPct: number | null;
  readonly jitterMs: number | null;
  readonly concealedPct: number | null;
  readonly bufferMs: number | null;
  readonly packets: number | null;
}
export interface ReceptionRow extends ReceptionMetrics {
  readonly voice: number;
  readonly supported: boolean;
  readonly targetMs: number | null;
}
export interface PlayoutMetrics {
  readonly gapEvents: number;
  readonly gapMs: number;
}
export interface ReceptionHistory {
  readonly stamp: number;
  readonly lossPct: number | null;
  readonly jitterMs: number | null;
  readonly concealedPct: number | null;
  readonly localLagMs: number;
}
export interface VoicePriority {
  readonly status: 'managed' | 'system' | 'waiting' | 'idle' | 'unavailable';
  readonly active: boolean;
}
export interface VoiceResources {
  readonly appCpuPercent: number;
  readonly appMemoryMB: number;
  readonly freeMemoryMB: number;
}
export interface MediaTelemetry {
  readonly audioLossPct: number;
  readonly audioJitterMs: number;
  readonly concealedPct: number;
  readonly jitterBufferMs: number;
  readonly eventLoopLagMs: number;
  readonly transport: string;
  readonly rttMs: number;
  readonly uploadBps: number;
  readonly downloadBps: number;
  readonly outFps: number;
  readonly inFps: number;
  readonly outW: number;
  readonly outH: number;
  readonly inW: number;
  readonly inH: number;
  readonly lossPct: number;
  readonly jitterMs: number;
  readonly limiter: string;
  readonly iceRoute: string;
  readonly pcState: string;
}

/** Consumed subset of native getStats(). Missing counters stay missing. */
export interface MediaStat {
  readonly id: string;
  readonly type: string;
  readonly timestamp?: number;
  readonly kind?: string;
  readonly mediaType?: string;
  readonly mid?: string;
  readonly trackIdentifier?: string;
  readonly isRemote?: boolean;
  readonly bytesSent?: number;
  readonly bytesReceived?: number;
  readonly packetsReceived?: number;
  readonly packetsLost?: number;
  readonly totalSamplesReceived?: number;
  readonly concealedSamples?: number;
  readonly jitterBufferDelay?: number;
  readonly jitterBufferEmittedCount?: number;
  readonly jitter?: number;
  readonly framesPerSecond?: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly qualityLimitationReason?: string;
  readonly state?: string;
  readonly nominated?: boolean;
  readonly selected?: boolean;
  readonly currentRoundTripTime?: number;
  readonly roundTripTime?: number;
  readonly localCandidateId?: string;
  readonly candidateType?: string;
  readonly playoutId?: string;
  readonly synthesizedSamplesEvents?: number;
  readonly synthesizedSamplesDuration?: number;
}
