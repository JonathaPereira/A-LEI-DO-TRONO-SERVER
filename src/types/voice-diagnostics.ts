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
export type VideoFreezeCause =
  | 'capture-interrupted'
  | 'encoder-stalled'
  | 'send-stalled'
  | 'transport-congestion'
  | 'sfu-forwarding-stalled'
  | 'subscription-interrupted'
  | 'receiver-not-decoding'
  | 'presentation-frozen';
export interface VideoFreezeEvent {
  readonly streamKey: string;
  readonly pcKey: string;
  readonly direction: 'inbound' | 'outbound';
  readonly mid: string | null;
  readonly rid: string | null;
  readonly trackId: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly durationMs: number;
  readonly recovered: boolean;
  readonly cause: VideoFreezeCause | null;
}
export interface VideoStreamHealth {
  readonly streamKey: string;
  readonly pcKey: string;
  readonly direction: 'inbound' | 'outbound';
  readonly mid: string | null;
  readonly rid: string | null;
  readonly trackId: string | null;
  readonly pcState: string;
  readonly iceState: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number | null;
  readonly bitrateBps: number | null;
  readonly lossPct: number | null;
  readonly packetsDelta: number | null;
  readonly packetsLost: number | null;
  readonly retransmittedPackets: number | null;
  readonly sendDelayMs: number | null;
  readonly encodeMs: number | null;
  readonly decodeMs: number | null;
  readonly bufferMs: number | null;
  readonly minBufferMs: number | null;
  readonly nackCount: number | null;
  readonly pliCount: number | null;
  readonly firCount: number | null;
  readonly keyFrames: number | null;
  readonly freezeCount: number | null;
  readonly stalled: boolean;
  readonly stallMs: number;
  readonly cause: VideoFreezeCause | null;
  readonly codec: string | null;
  readonly implementation: string | null;
  readonly hardwareAccelerated: boolean | null;
}
export interface VideoInterval {
  readonly direction: 'inbound' | 'outbound';
  readonly fps: number | null;
  readonly width: number;
  readonly height: number;
  readonly freezeCount: number | null;
  readonly freezeMs: number | null;
  readonly droppedFrames: number | null;
  readonly decodeMs: number | null;
  readonly encodeMs: number | null;
  readonly sendDelayMs: number | null;
  readonly bufferMs: number | null;
  readonly framesEncoded?: number | null;
  readonly framesSent?: number | null;
  readonly framesReceived?: number | null;
  readonly framesDecoded?: number | null;
  readonly packetsSent?: number | null;
  readonly packetsReceived?: number | null;
  readonly packetsLost?: number | null;
  readonly retransmittedPackets?: number | null;
  readonly nackCount?: number | null;
  readonly pliCount?: number | null;
  readonly firCount?: number | null;
  readonly keyFrames?: number | null;
  readonly minBufferMs?: number | null;
  readonly freezeCause?: VideoFreezeCause | null;
}
export interface MediaTelemetry {
  readonly outFpsMeasured?: boolean;
  readonly video?: readonly Readonly<VideoInterval>[];
  readonly streams?: readonly Readonly<VideoStreamHealth>[];
  readonly freezes?: readonly Readonly<VideoFreezeEvent>[];
  readonly retransmittedPackets?: number;
  readonly availableOutgoingBitrate?: number | null;
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
  readonly retransmittedPacketsSent?: number;
  readonly framesReceived?: number;
  readonly nackCount?: number;
  readonly pliCount?: number;
  readonly firCount?: number;
  readonly keyFramesEncoded?: number;
  readonly keyFramesDecoded?: number;
  readonly jitterBufferMinimumDelay?: number;
  readonly rid?: string;
  readonly codecId?: string;
  readonly mimeType?: string;
  readonly encoderImplementation?: string;
  readonly powerEfficientEncoder?: boolean;
  readonly decoderImplementation?: string;
  readonly powerEfficientDecoder?: boolean;
  readonly availableOutgoingBitrate?: number;
  readonly totalSamplesReceived?: number;
  readonly concealedSamples?: number;
  readonly jitterBufferDelay?: number;
  readonly jitterBufferEmittedCount?: number;
  readonly jitter?: number;
  readonly framesPerSecond?: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly packetsSent?: number;
  readonly framesEncoded?: number;
  readonly totalEncodeTime?: number;
  readonly framesDecoded?: number;
  readonly totalDecodeTime?: number;
  readonly framesSent?: number;
  readonly totalPacketSendDelay?: number;
  readonly framesDropped?: number;
  readonly freezeCount?: number;
  readonly totalFreezesDuration?: number;
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
