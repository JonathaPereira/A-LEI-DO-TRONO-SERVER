export type ScreenShareResolutionPreset = 'low_480p' | '720p' | '1080p' | '1440p' | 'source';
export type ScreenShareFrameRate = 15 | 30 | 60;
export type ScreenShareContentHint = 'motion' | 'detail' | 'text';
export type ScreenShareStreamingMode =
  'gaming' | 'motion' | 'text' | 'detail' | 'presentation' | 'standard';
export type ScreenShareDegradationPreference =
  'maintain-framerate' | 'maintain-resolution' | 'balanced';
export type ScreenShareCodec = 'auto' | 'h264' | 'vp9' | 'vp8' | 'av1';

export interface ScreenShareDimensions {
  width: number;
  height: number;
}

export interface ScreenShareResolutionPresetSpec {
  readonly width: number | null;
  readonly height: number | null;
  readonly defaultBitrateByFps: Readonly<Record<ScreenShareFrameRate, number>>;
}

export const SCREEN_SHARE_FRAME_RATES: readonly ScreenShareFrameRate[] = [15, 30, 60];

export const SCREEN_SHARE_RESOLUTION_PRESETS: Readonly<
  Record<ScreenShareResolutionPreset, ScreenShareResolutionPresetSpec>
> = {
  low_480p: {
    width: 854,
    height: 480,
    defaultBitrateByFps: { 15: 1_200_000, 30: 1_800_000, 60: 2_500_000 },
  },
  '720p': {
    width: 1280,
    height: 720,
    defaultBitrateByFps: { 15: 2_500_000, 30: 4_000_000, 60: 6_000_000 },
  },
  '1080p': {
    width: 1920,
    height: 1080,
    defaultBitrateByFps: { 15: 4_000_000, 30: 8_000_000, 60: 10_000_000 },
  },
  '1440p': {
    width: 2560,
    height: 1440,
    defaultBitrateByFps: { 15: 6_000_000, 30: 12_000_000, 60: 15_000_000 },
  },
  source: {
    width: null,
    height: null,
    defaultBitrateByFps: { 15: 8_000_000, 30: 12_000_000, 60: 15_000_000 },
  },
};

export interface ScreenShareConfig {
  resolution?: ScreenShareResolutionPreset;
  frameRate?: ScreenShareFrameRate | number;
  maxBitrateBps?: number;
  minBitrateBps?: number;
  contentHint?: ScreenShareContentHint;
  streamingMode?: ScreenShareStreamingMode;
  codec?: ScreenShareCodec;
  hardwareEncoding?: boolean;
  zeroCopyRequired?: boolean;
  captureAudio?: boolean;
  simulcast?: boolean;
  scalabilityMode?: string;
  sourceDimensions?: { width?: number | null; height?: number | null } | null;
}

export interface BuiltScreenShareOptions {
  resolution: ScreenShareResolutionPreset;
  frameRate: ScreenShareFrameRate;
  dimensions: ScreenShareDimensions | null;
  maxWidth: number | undefined;
  maxHeight: number | undefined;
  maxBitrateBps: number;
  minBitrateBps: number;
  contentHint: ScreenShareContentHint;
  degradationPreference: ScreenShareDegradationPreference;
  codec: ScreenShareCodec;
  hardwareEncoding: boolean;
  zeroCopyRequired: boolean;
  captureAudio: boolean;
  simulcast: boolean;
  scalabilityMode: string | undefined;
}

export interface ScreenShareEncodingParameters extends RTCRtpEncodingParameters {
  scalabilityMode?: string;
  networkPriority?: 'very-low' | 'low' | 'medium' | 'high';
  priority?: 'very-low' | 'low' | 'medium' | 'high';
}

export interface ScreenShareSenderTarget {
  resolution?: ScreenShareResolutionPreset;
  frameRate?: ScreenShareFrameRate | number;
  maxFramerate?: number;
  maxBitrateBps?: number;
  maxBitrate?: number;
  contentHint?: ScreenShareContentHint;
  streamingMode?: ScreenShareStreamingMode;
  degradationPreference?: ScreenShareDegradationPreference;
  networkPriority?: 'very-low' | 'low' | 'medium' | 'high';
  priority?: 'very-low' | 'low' | 'medium' | 'high';
  scaleResolutionDownBy?: number;
  scalabilityMode?: string;
}

export interface ScreenShareCaptureMetrics {
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
}

export interface BuildScreenShareSenderParametersInput {
  encodings?: readonly ScreenShareEncodingParameters[];
  target: ScreenShareSenderTarget;
  capture?: ScreenShareCaptureMetrics | null;
  scalabilityMode?: string;
}

export interface BuiltScreenShareSenderParameters {
  degradationPreference: ScreenShareDegradationPreference;
  encodings: ScreenShareEncodingParameters[];
}

/** Rounds a positive number down to the nearest even integer (minimum 0). */
export function floorToEven(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const floored = Math.floor(value);
  return floored - (floored % 2);
}

function normalizeFrameRate(frameRate?: number): ScreenShareFrameRate {
  if (typeof frameRate !== 'number' || !Number.isFinite(frameRate)) return 30;
  if (frameRate <= 15) return 15;
  if (frameRate >= 60) return 60;
  return 30;
}

function hasValidDimensions(
  dims?: { width?: number | null; height?: number | null } | null,
): dims is ScreenShareDimensions {
  return (
    dims !== null &&
    dims !== undefined &&
    typeof dims.width === 'number' &&
    typeof dims.height === 'number' &&
    Number.isFinite(dims.width) &&
    Number.isFinite(dims.height) &&
    dims.width > 0 &&
    dims.height > 0
  );
}

/**
 * Computes effective even capture/encoding dimensions from a resolution preset
 * and optional source dimensions while preserving aspect ratio without upscaling.
 */
export function resolveEffectiveScreenShareDimensions(
  resolution: ScreenShareResolutionPreset,
  sourceDimensions?: { width?: number | null; height?: number | null } | null,
): ScreenShareDimensions | null {
  const preset = SCREEN_SHARE_RESOLUTION_PRESETS[resolution];
  if (!hasValidDimensions(sourceDimensions)) {
    if (preset.width === null || preset.height === null) return null;
    return { width: preset.width, height: preset.height };
  }

  const sourceWidth = sourceDimensions.width;
  const sourceHeight = sourceDimensions.height;

  if (preset.width === null || preset.height === null) {
    return {
      width: Math.max(2, floorToEven(sourceWidth)),
      height: Math.max(2, floorToEven(sourceHeight)),
    };
  }

  // Fit inside preset bounding box regardless of landscape vs portrait orientation.
  const sourceLong = Math.max(sourceWidth, sourceHeight);
  const sourceShort = Math.min(sourceWidth, sourceHeight);
  const targetLong = Math.max(preset.width, preset.height);
  const targetShort = Math.min(preset.width, preset.height);
  const scale = Math.min(1, targetLong / sourceLong, targetShort / sourceShort);

  return {
    width: Math.max(2, floorToEven(sourceWidth * scale)),
    height: Math.max(2, floorToEven(sourceHeight * scale)),
  };
}

/**
 * Chooses WebRTC RTCDegradationPreference for screen sharing:
 * - 'maintain-framerate' for motion, gaming, or 60fps
 * - 'maintain-resolution' for detail, text, presentation, or 15fps
 */
export function resolveScreenShareDegradationPreference(input: {
  contentHint?: ScreenShareContentHint | string | null;
  maxFramerate?: number | null;
  streamingMode?: ScreenShareStreamingMode | string | null;
}): ScreenShareDegradationPreference {
  const { contentHint, maxFramerate, streamingMode } = input;
  if (contentHint === 'detail' || contentHint === 'text') return 'maintain-resolution';
  if (contentHint === 'motion') return 'maintain-framerate';
  if (streamingMode === 'text' || streamingMode === 'detail' || streamingMode === 'presentation') {
    return 'maintain-resolution';
  }
  if (streamingMode === 'gaming' || streamingMode === 'motion') {
    return 'maintain-framerate';
  }
  if (typeof maxFramerate === 'number' && Number.isFinite(maxFramerate) && maxFramerate <= 15) {
    return 'maintain-resolution';
  }
  if (typeof maxFramerate === 'number' && Number.isFinite(maxFramerate) && maxFramerate >= 60) {
    return 'maintain-framerate';
  }
  return 'maintain-framerate';
}

/** Normalizes screen share options into a deterministic policy configuration. */
export function buildScreenShareOptions(config: ScreenShareConfig = {}): BuiltScreenShareOptions {
  const resolution: ScreenShareResolutionPreset = config.resolution ?? '720p';
  const frameRate = normalizeFrameRate(config.frameRate);
  const dimensions = resolveEffectiveScreenShareDimensions(resolution, config.sourceDimensions);
  const preset = SCREEN_SHARE_RESOLUTION_PRESETS[resolution];

  const contentHint: ScreenShareContentHint =
    config.contentHint ??
    (config.streamingMode === 'text' || config.streamingMode === 'detail' || frameRate <= 15
      ? 'detail'
      : 'motion');

  const degradationPreference = resolveScreenShareDegradationPreference({
    contentHint,
    maxFramerate: frameRate,
    streamingMode: config.streamingMode,
  });

  const maxBitrateBps =
    typeof config.maxBitrateBps === 'number' &&
    Number.isFinite(config.maxBitrateBps) &&
    config.maxBitrateBps > 0
      ? Math.round(config.maxBitrateBps)
      : preset.defaultBitrateByFps[frameRate];

  const minBitrateBps =
    typeof config.minBitrateBps === 'number' &&
    Number.isFinite(config.minBitrateBps) &&
    config.minBitrateBps > 0
      ? Math.min(maxBitrateBps, Math.round(config.minBitrateBps))
      : Math.min(maxBitrateBps, Math.max(150_000, Math.round(maxBitrateBps * 0.1)));

  return {
    resolution,
    frameRate,
    dimensions,
    maxWidth: dimensions?.width,
    maxHeight: dimensions?.height,
    maxBitrateBps,
    minBitrateBps,
    contentHint,
    degradationPreference,
    codec: config.codec ?? 'auto',
    hardwareEncoding: Boolean(config.hardwareEncoding),
    zeroCopyRequired: Boolean(config.zeroCopyRequired),
    captureAudio: config.captureAudio ?? true,
    simulcast: Boolean(config.simulcast),
    scalabilityMode: config.scalabilityMode,
  };
}

function computeBaseScaleDownBy(
  target: ScreenShareSenderTarget,
  capture?: ScreenShareCaptureMetrics | null,
): number {
  if (
    typeof target.scaleResolutionDownBy === 'number' &&
    Number.isFinite(target.scaleResolutionDownBy) &&
    target.scaleResolutionDownBy >= 1
  ) {
    return target.scaleResolutionDownBy;
  }
  if (!target.resolution || !hasValidDimensions(capture)) return 1;
  const effective = resolveEffectiveScreenShareDimensions(target.resolution, capture);
  if (!effective) return 1;
  const ratio = Math.max(capture.width / effective.width, capture.height / effective.height);
  return ratio > 1 ? Number(ratio.toFixed(4)) : 1;
}

/**
 * Builds RTCRtpSender parameter updates (degradationPreference + encodings)
 * for single-layer or simulcast screen share senders without mutating inputs.
 */
export function buildScreenShareSenderParameters(
  input: BuildScreenShareSenderParametersInput,
): BuiltScreenShareSenderParameters {
  const { encodings, target, capture, scalabilityMode } = input;
  const requestedFps = target.maxFramerate ?? target.frameRate;
  const normalizedFps =
    typeof requestedFps === 'number' && Number.isFinite(requestedFps) && requestedFps > 0
      ? Math.round(requestedFps)
      : undefined;

  const degradationPreference =
    target.degradationPreference ??
    resolveScreenShareDegradationPreference({
      contentHint: target.contentHint,
      maxFramerate: normalizedFps,
      streamingMode: target.streamingMode,
    });

  const maxBitrate = target.maxBitrateBps ?? target.maxBitrate;
  const resolvedMaxBitrate =
    typeof maxBitrate === 'number' && Number.isFinite(maxBitrate) && maxBitrate > 0
      ? Math.round(maxBitrate)
      : undefined;

  const baseScale = computeBaseScaleDownBy(target, capture);
  const resolvedScalabilityMode = scalabilityMode ?? target.scalabilityMode;
  const networkPriority = target.networkPriority ?? 'high';
  const priority = target.priority ?? 'high';

  const sourceEncodings =
    encodings && encodings.length > 0 ? encodings : ([{}] as ScreenShareEncodingParameters[]);

  const nextEncodings = sourceEncodings.map((existing, index): ScreenShareEncodingParameters => {
    const cloned: ScreenShareEncodingParameters = { ...existing };

    if (sourceEncodings.length === 1) {
      if (resolvedMaxBitrate !== undefined) cloned.maxBitrate = resolvedMaxBitrate;
      if (normalizedFps !== undefined) cloned.maxFramerate = normalizedFps;
      cloned.scaleResolutionDownBy = Math.max(1, baseScale);
      cloned.networkPriority = existing.networkPriority ?? networkPriority;
      cloned.priority = existing.priority ?? priority;
      if (resolvedScalabilityMode !== undefined) {
        cloned.scalabilityMode = resolvedScalabilityMode;
      }
      return cloned;
    }

    // Simulcast layering ('f' / 'h' / 'q' or index-ordered): scale relative to baseScale.
    const layerFactor =
      existing.rid === 'q'
        ? 4
        : existing.rid === 'h'
          ? 2
          : existing.rid === 'f'
            ? 1
            : Math.max(1, existing.scaleResolutionDownBy ?? 2 ** index);

    cloned.scaleResolutionDownBy = Number((baseScale * layerFactor).toFixed(4));

    if (resolvedMaxBitrate !== undefined) {
      if (existing.rid === 'q' || (existing.rid === undefined && index >= 2)) {
        cloned.maxBitrate = Math.max(250_000, Math.round(resolvedMaxBitrate * 0.18));
      } else if (existing.rid === 'h' || (existing.rid === undefined && index === 1)) {
        cloned.maxBitrate = Math.max(500_000, Math.round(resolvedMaxBitrate * 0.42));
      } else {
        cloned.maxBitrate = resolvedMaxBitrate;
      }
    }

    if (normalizedFps !== undefined) {
      if (existing.rid === 'q' || (existing.rid === undefined && index >= 2)) {
        cloned.maxFramerate = Math.min(normalizedFps, 20);
      } else if (existing.rid === 'h' || (existing.rid === undefined && index === 1)) {
        cloned.maxFramerate = Math.min(normalizedFps, 30);
      } else {
        cloned.maxFramerate = normalizedFps;
      }
    }

    if (index === 0 || existing.rid === 'f') {
      cloned.networkPriority = existing.networkPriority ?? networkPriority;
      cloned.priority = existing.priority ?? priority;
    }

    if (resolvedScalabilityMode !== undefined) {
      cloned.scalabilityMode = resolvedScalabilityMode;
    }

    return cloned;
  });

  return {
    degradationPreference,
    encodings: nextEncodings,
  };
}
