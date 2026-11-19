import {
  resolveEffectiveScreenShareDimensions,
  type ScreenShareContentHint,
  type ScreenShareDimensions,
  type ScreenShareFrameRate,
  type ScreenShareResolutionPreset,
} from '../../policies/screenShareOptions.ts';
import type { SourceLifecycleRegistry } from '../../source-isolation/SourceLifecycleRegistry.ts';
import { applyScreenContentHint } from './ScreenShareTrackPlumbing.ts';

export interface DisplayMediaTrackLike {
  id?: string;
  kind?: string;
  readyState?: string;
  contentHint?: string;
  stop(): void;
}

export interface DisplayMediaStreamLike {
  getTracks(): DisplayMediaTrackLike[];
  getVideoTracks(): DisplayMediaTrackLike[];
  getAudioTracks(): DisplayMediaTrackLike[];
}

export interface DisplayMediaAudioConstraints extends MediaTrackConstraints {
  restrictOwnAudio?: boolean;
}

export interface FluxerDisplayMediaStreamOptions {
  video: MediaTrackConstraints | boolean;
  audio: DisplayMediaAudioConstraints | boolean;
  windowAudio?: 'window' | 'system' | 'exclude';
  systemAudio?: 'include' | 'exclude';
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
  restrictOwnAudio?: boolean;
}

export interface DisplayMediaDevicesLike {
  getDisplayMedia(constraints?: FluxerDisplayMediaStreamOptions): Promise<DisplayMediaStreamLike>;
}

export interface DisplayMediaCaptureOptions {
  resolution?: ScreenShareResolutionPreset;
  frameRate?: ScreenShareFrameRate | number;
  width?: number;
  height?: number;
  captureAudio?: boolean;
  includeSystemAudio?: boolean;
  excludeSelfBrowserSurface?: boolean;
  windowAudio?: 'window' | 'system' | 'exclude';
  systemAudio?: 'include' | 'exclude';
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
  restrictOwnAudio?: boolean;
  contentHint?: ScreenShareContentHint;
  sourceDimensions?: ScreenShareDimensions | null;
  captureId?: string;
  sourceKey?: string;
  registry?: SourceLifecycleRegistry;
  signal?: AbortSignal;
  fallbackWithoutAudio?: boolean;
}

export interface DisplayScreenShareCaptureResult {
  captureId: string;
  stream: DisplayMediaStreamLike;
  videoTrack: DisplayMediaTrackLike;
  audioTrack: DisplayMediaTrackLike | null;
  tracks: DisplayMediaTrackLike[];
  options: FluxerDisplayMediaStreamOptions;
  stop(): void;
}

let captureSequence = 0;

function nextCaptureId(): string {
  captureSequence += 1;
  return `screen-capture-${captureSequence}`;
}

function stopStreamTracks(stream: DisplayMediaStreamLike | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Ignore individual track stop errors so all remaining tracks still get stopped.
    }
  }
}

/**
 * Builds Fluxer-compatible getDisplayMedia constraints with isolated window/system audio
 * and voice DSP disabled so shared media audio is never degraded by speech filters.
 */
export function getDisplayMediaOptions(
  options: DisplayMediaCaptureOptions = {},
): FluxerDisplayMediaStreamOptions {
  const captureAudio = options.captureAudio !== false && options.includeSystemAudio !== false;
  const restrictOwnAudio = options.restrictOwnAudio ?? true;

  const videoConstraints: MediaTrackConstraints = {};
  if (
    typeof options.width === 'number' &&
    typeof options.height === 'number' &&
    options.width > 0 &&
    options.height > 0
  ) {
    videoConstraints.width = { ideal: options.width, max: options.width };
    videoConstraints.height = { ideal: options.height, max: options.height };
  } else if (options.resolution) {
    const resolved = resolveEffectiveScreenShareDimensions(
      options.resolution,
      options.sourceDimensions,
    );
    if (resolved) {
      videoConstraints.width = { ideal: resolved.width, max: resolved.width };
      videoConstraints.height = { ideal: resolved.height, max: resolved.height };
    }
  }

  if (
    typeof options.frameRate === 'number' &&
    Number.isFinite(options.frameRate) &&
    options.frameRate > 0
  ) {
    const fps = Math.round(options.frameRate);
    videoConstraints.frameRate = { ideal: fps, max: fps };
  }

  const audioConstraints: DisplayMediaAudioConstraints | boolean = captureAudio
    ? {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        restrictOwnAudio,
      }
    : false;

  const result: FluxerDisplayMediaStreamOptions = {
    video: Object.keys(videoConstraints).length > 0 ? videoConstraints : true,
    audio: audioConstraints,
    windowAudio: options.windowAudio ?? (captureAudio ? 'window' : 'exclude'),
    systemAudio: options.systemAudio ?? (captureAudio ? 'include' : 'exclude'),
    selfBrowserSurface:
      options.selfBrowserSurface ??
      (options.excludeSelfBrowserSurface === false ? 'include' : 'exclude'),
    surfaceSwitching: options.surfaceSwitching ?? 'include',
    restrictOwnAudio,
  };

  if (options.monitorTypeSurfaces) {
    result.monitorTypeSurfaces = options.monitorTypeSurfaces;
  }

  return result;
}

function isAudioConstraintFailure(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotSupportedError' || name === 'OverconstrainedError';
}

/**
 * Captures screen share video (+ optional audio) via mediaDevices.getDisplayMedia,
 * applying contentHint and registering tracks in SourceLifecycleRegistry while ensuring
 * all tracks are cleanly stopped on any partial failure or abort.
 */
export async function createDisplayScreenShareTracks(
  mediaDevices: DisplayMediaDevicesLike | null | undefined,
  options: DisplayMediaCaptureOptions = {},
): Promise<DisplayScreenShareCaptureResult> {
  if (!mediaDevices || typeof mediaDevices.getDisplayMedia !== 'function') {
    throw new Error('getDisplayMedia is not supported in this environment.');
  }

  if (options.signal?.aborted) {
    throw new Error('Screen share capture aborted before starting.');
  }

  let displayOptions = getDisplayMediaOptions(options);
  let stream: DisplayMediaStreamLike;

  try {
    stream = await mediaDevices.getDisplayMedia(displayOptions);
  } catch (error) {
    if (
      options.fallbackWithoutAudio &&
      displayOptions.audio !== false &&
      isAudioConstraintFailure(error)
    ) {
      displayOptions = getDisplayMediaOptions({ ...options, captureAudio: false });
      stream = await mediaDevices.getDisplayMedia(displayOptions);
    } else {
      throw error;
    }
  }

  try {
    if (options.signal?.aborted) {
      throw new Error('Screen share capture aborted after getDisplayMedia resolved.');
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    const videoTrack = videoTracks[0] ?? null;

    if (!videoTrack) {
      throw new Error('Display capture returned no video track.');
    }
    if (videoTrack.readyState === 'ended') {
      throw new Error('Display capture returned an already-ended video track.');
    }

    // Stop any extra video tracks or unwanted audio tracks when audio capture was disabled.
    for (let i = 1; i < videoTracks.length; i++) {
      try {
        videoTracks[i].stop();
      } catch {
        // Ignore stop errors on discarded extra tracks.
      }
    }

    let audioTrack: DisplayMediaTrackLike | null = null;
    if (displayOptions.audio === false) {
      for (const extraAudio of audioTracks) {
        try {
          extraAudio.stop();
        } catch {
          // Ignore stop errors on unwanted audio tracks.
        }
      }
    } else {
      const candidate = audioTracks[0] ?? null;
      if (candidate && candidate.readyState !== 'ended') {
        audioTrack = candidate;
      } else if (candidate) {
        try {
          candidate.stop();
        } catch {
          // Ignore stop errors on ended audio track.
        }
      }
      for (let i = 1; i < audioTracks.length; i++) {
        try {
          audioTracks[i].stop();
        } catch {
          // Ignore stop errors on extra audio tracks.
        }
      }
    }

    if (options.contentHint) {
      applyScreenContentHint(videoTrack, options.contentHint);
    }

    const captureId = options.captureId ?? nextCaptureId();
    const tracks = audioTrack ? [videoTrack, audioTrack] : [videoTrack];

    if (options.registry) {
      options.registry.registerCapture(captureId, tracks, {
        sourceKey: options.sourceKey ?? 'screen',
        replacePrevious: true,
      });
    }

    return {
      captureId,
      stream,
      videoTrack,
      audioTrack,
      tracks,
      options: displayOptions,
      stop() {
        if (options.registry) {
          options.registry.stopCapture(captureId);
        } else {
          stopStreamTracks(stream);
        }
      },
    };
  } catch (error) {
    stopStreamTracks(stream);
    throw error;
  }
}
