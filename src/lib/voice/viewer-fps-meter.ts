export interface ViewerFpsSnapshot {
  readonly fps: number;
  readonly width: number;
  readonly height: number;
}

export interface VideoFrameMetadataLike {
  readonly presentedFrames?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface MeasurableVideoElement {
  readonly videoWidth?: number;
  readonly videoHeight?: number;
  readonly paused?: boolean;
  readonly readyState?: number;
  readonly webkitDecodedFrameCount?: number;
  getVideoPlaybackQuality?: () => { readonly totalVideoFrames?: number };
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadataLike) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export interface ViewerFpsMeterOptions {
  video: MeasurableVideoElement;
  onUpdate(snapshot: ViewerFpsSnapshot): void;
  now?: () => number;
  setIntervalFn?: (handler: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export function formatViewerFpsBadge(snapshot: ViewerFpsSnapshot | null | undefined): string {
  if (!snapshot) return '';
  return snapshot.height > 0 ? `${snapshot.height}p · ${snapshot.fps} FPS` : `${snapshot.fps} FPS`;
}

/**
 * Measures real rendered frames per second on a borrowed viewer <video> element.
 * Never mutates srcObject, playback state, or underlying MediaStreamTracks.
 */
export function createViewerFpsMeter({
  video,
  onUpdate,
  now = () => performance.now(),
  setIntervalFn = (fn, ms) => setInterval(fn, ms),
  clearIntervalFn = (h) => clearInterval(h as ReturnType<typeof setInterval>),
}: ViewerFpsMeterOptions) {
  let disposed = false;
  let rVfcHandle: number | null = null;
  let baseStamp: number | null = null;
  let baseFrames = 0;
  let callbackCounter = 0;
  let lastFrameAt: number | null = null;
  let lastWidth = video.videoWidth || 0;
  let lastHeight = video.videoHeight || 0;
  let lastEmittedFps: number | null = null;

  const emit = (fps: number, width: number, height: number) => {
    if (disposed) return;
    lastWidth = width || video.videoWidth || lastWidth || 0;
    lastHeight = height || video.videoHeight || lastHeight || 0;
    lastEmittedFps = fps;
    onUpdate(
      Object.freeze({
        fps: Math.max(0, Math.round(fps)),
        width: lastWidth,
        height: lastHeight,
      }),
    );
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    const onFrame = (_frameNow: number, metadata: VideoFrameMetadataLike) => {
      if (disposed) return;
      const stamp = now();
      callbackCounter++;
      const total =
        typeof metadata?.presentedFrames === 'number' && Number.isFinite(metadata.presentedFrames)
          ? metadata.presentedFrames
          : callbackCounter;
      const w = metadata?.width || video.videoWidth || lastWidth || 0;
      const h = metadata?.height || video.videoHeight || lastHeight || 0;
      lastWidth = w;
      lastHeight = h;
      lastFrameAt = stamp;

      if (baseStamp === null || stamp < baseStamp || total < baseFrames) {
        baseStamp = stamp;
        baseFrames = total;
      } else if (stamp - baseStamp >= 950) {
        const elapsed = stamp - baseStamp;
        const fps = ((total - baseFrames) * 1000) / Math.max(1, elapsed);
        baseStamp = stamp;
        baseFrames = total;
        emit(fps, w, h);
      }

      if (!disposed && typeof video.requestVideoFrameCallback === 'function') {
        rVfcHandle = video.requestVideoFrameCallback(onFrame);
      }
    };

    rVfcHandle = video.requestVideoFrameCallback(onFrame);

    const timer = setIntervalFn(() => {
      if (disposed) return;
      const stamp = now();
      if (lastFrameAt !== null && stamp - lastFrameAt >= 1300) {
        baseStamp = null;
        if (lastEmittedFps !== 0) emit(0, lastWidth, lastHeight);
      }
    }, 1000);

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        if (rVfcHandle !== null && typeof video.cancelVideoFrameCallback === 'function') {
          try {
            video.cancelVideoFrameCallback(rVfcHandle);
          } catch {}
          rVfcHandle = null;
        }
        clearIntervalFn(timer);
      },
    };
  }

  const readTotalFrames = (): number | null => {
    const qualityTotal = video.getVideoPlaybackQuality?.()?.totalVideoFrames;
    if (typeof qualityTotal === 'number' && Number.isFinite(qualityTotal)) return qualityTotal;
    if (
      typeof video.webkitDecodedFrameCount === 'number' &&
      Number.isFinite(video.webkitDecodedFrameCount)
    )
      return video.webkitDecodedFrameCount;
    return null;
  };

  const timer = setIntervalFn(() => {
    if (disposed) return;
    const total = readTotalFrames();
    if (total === null) return;
    const stamp = now();
    const w = video.videoWidth || lastWidth || 0;
    const h = video.videoHeight || lastHeight || 0;
    if (baseStamp === null || stamp <= baseStamp || total < baseFrames) {
      baseStamp = stamp;
      baseFrames = total;
      return;
    }
    const fps = ((total - baseFrames) * 1000) / Math.max(1, stamp - baseStamp);
    baseStamp = stamp;
    baseFrames = total;
    emit(fps, w, h);
  }, 1000);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      clearIntervalFn(timer);
    },
  };
}
