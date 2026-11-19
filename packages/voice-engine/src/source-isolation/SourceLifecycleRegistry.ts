export interface LifecycleTrackLike {
  id?: string;
  kind?: string;
  readyState?: string;
  stop(): void;
}

export interface RegisterCaptureOptions {
  sourceKey?: string;
  replacePrevious?: boolean;
}

/**
 * Tracks captured MediaStreamTracks per captureId and sourceKey.
 * Guarantees stopping replaced or stopped tracks while never stopping tracks
 * still referenced by a newer or concurrent active capture.
 */
export class SourceLifecycleRegistry {
  private readonly captures = new Map<string, Set<LifecycleTrackLike>>();
  private readonly activeBySourceKey = new Map<string, string>();
  private readonly sourceKeyByCaptureId = new Map<string, string>();
  private readonly onStopError?: (error: unknown, track: LifecycleTrackLike) => void;

  constructor(options?: { onStopError?: (error: unknown, track: LifecycleTrackLike) => void }) {
    this.onStopError = options?.onStopError;
  }

  /** Registers a captureId with its tracks, optionally replacing an active capture for sourceKey. */
  registerCapture(
    captureId: string,
    tracks: Iterable<LifecycleTrackLike | null | undefined>,
    options?: RegisterCaptureOptions,
  ): LifecycleTrackLike[] {
    const sourceKey = options?.sourceKey;
    const replacePrevious = options?.replacePrevious ?? Boolean(sourceKey);
    const previousCaptureId =
      sourceKey && replacePrevious ? this.activeBySourceKey.get(sourceKey) : undefined;

    const existingForSameId = this.captures.get(captureId);
    const nextTracks = new Set<LifecycleTrackLike>();
    for (const track of tracks) {
      if (track) nextTracks.add(track);
    }

    this.captures.set(captureId, nextTracks);
    if (sourceKey) {
      this.activeBySourceKey.set(sourceKey, captureId);
      this.sourceKeyByCaptureId.set(captureId, sourceKey);
    }

    // Stop tracks removed when re-registering the same captureId.
    if (existingForSameId) {
      for (const oldTrack of existingForSameId) {
        if (!nextTracks.has(oldTrack) && !this.isTrackActive(oldTrack)) {
          this.stopTrackSafely(oldTrack);
        }
      }
    }

    if (previousCaptureId && previousCaptureId !== captureId) {
      this.stopCapture(previousCaptureId);
    }

    return [...nextTracks];
  }

  /** Registers nextCaptureId first so shared tracks survive, then stops previousCaptureId. */
  replaceCapture(
    previousCaptureId: string | null | undefined,
    nextCaptureId: string,
    nextTracks: Iterable<LifecycleTrackLike | null | undefined>,
    options?: RegisterCaptureOptions,
  ): LifecycleTrackLike[] {
    const registered = this.registerCapture(nextCaptureId, nextTracks, options);
    if (previousCaptureId && previousCaptureId !== nextCaptureId) {
      this.stopCapture(previousCaptureId);
    }
    return registered;
  }

  /** Appends tracks to an existing (or newly created) captureId. */
  addTracks(
    captureId: string,
    tracks: Iterable<LifecycleTrackLike | null | undefined>,
  ): LifecycleTrackLike[] {
    let set = this.captures.get(captureId);
    if (!set) {
      set = new Set<LifecycleTrackLike>();
      this.captures.set(captureId, set);
    }
    for (const track of tracks) {
      if (track) set.add(track);
    }
    return [...set];
  }

  /**
   * Stops tracks belonging to captureId that are not referenced by any other active capture.
   * Safe to call with stale or already-stopped captureIds.
   */
  stopCapture(captureId: string): number {
    const tracks = this.captures.get(captureId);
    if (!tracks) return 0;

    this.captures.delete(captureId);
    const sourceKey = this.sourceKeyByCaptureId.get(captureId);
    this.sourceKeyByCaptureId.delete(captureId);
    if (sourceKey && this.activeBySourceKey.get(sourceKey) === captureId) {
      this.activeBySourceKey.delete(sourceKey);
    }

    let stoppedCount = 0;
    for (const track of tracks) {
      if (!this.isTrackActive(track)) {
        this.stopTrackSafely(track);
        stoppedCount += 1;
      }
    }
    return stoppedCount;
  }

  /** Stops all tracked captures and clears the registry. */
  stopAll(): number {
    const captureIds = [...this.captures.keys()];
    let totalStopped = 0;
    for (const captureId of captureIds) {
      totalStopped += this.stopCapture(captureId);
    }
    return totalStopped;
  }

  getActiveCaptureId(sourceKey = 'screen'): string | null {
    return this.activeBySourceKey.get(sourceKey) ?? null;
  }

  hasCapture(captureId: string): boolean {
    return this.captures.has(captureId);
  }

  getTracks(captureId: string): LifecycleTrackLike[] {
    const set = this.captures.get(captureId);
    return set ? [...set] : [];
  }

  isTrackOwnedBy(track: LifecycleTrackLike, captureId: string): boolean {
    return this.captures.get(captureId)?.has(track) ?? false;
  }

  isTrackActive(track: LifecycleTrackLike): boolean {
    for (const set of this.captures.values()) {
      if (set.has(track)) return true;
    }
    return false;
  }

  private stopTrackSafely(track: LifecycleTrackLike): void {
    try {
      track.stop();
    } catch (error) {
      this.onStopError?.(error, track);
    }
  }
}
