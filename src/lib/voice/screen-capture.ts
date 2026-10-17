import type { ScreenCapture, ScreenCaptureChange, ScreenCaptureSettings } from '../../types/voice';
interface ScreenCaptureOptions {
  mediaDevices: Pick<MediaDevices, 'getDisplayMedia'> | undefined;
  getSettings(): ScreenCaptureSettings;
  onStarted(change: ScreenCaptureChange): Promise<void>;
  onEnded(): Promise<void>;
  onAudioEnded(change: ScreenCaptureChange): Promise<void>;
  onSourceStarted(source: MediaStream): void;
  onSourceStopped(source: MediaStream): void;
  warn?: (error: unknown) => void;
}
interface Resource {
  capture: ScreenCapture;
  removeListeners(): void;
}

/** Owns the display source and its outgoing clone, including captures awaiting publication. */
export function createScreenCapture({
  mediaDevices,
  getSettings,
  onStarted,
  onEnded,
  onAudioEnded,
  onSourceStarted,
  onSourceStopped,
  warn = (error) => console.warn('[ScreenCapture]', error),
}: ScreenCaptureOptions) {
  let active: Resource | null = null,
    generation = 0;
  const resources = new Set<Resource>();
  const stopped = new WeakSet<MediaStreamTrack>();
  function stopTracks(stream: MediaStream | undefined) {
    for (const track of stream?.getTracks() ?? []) {
      if (stopped.has(track)) continue;
      stopped.add(track);
      try {
        track.stop();
      } catch (error) {
        warn(error);
      }
    }
  }
  function release(resource: Resource) {
    resource.removeListeners();
    stopTracks(resource.capture.source);
    stopTracks(resource.capture.outgoing);
    resources.delete(resource);
  }
  function stop(): boolean {
    generation++;
    const previous = active;
    active = null;
    if (previous) {
      try {
        onSourceStopped(previous.capture.source);
      } catch (error) {
        warn(error);
      }
    }
    for (const resource of [...resources]) release(resource);
    return previous !== null;
  }
  function refreshHint() {
    const track = active?.capture.outgoing.getVideoTracks()[0];
    if (!track) return;
    try {
      track.contentHint = getSettings().contentHint;
    } catch {}
    // Clones share the capture source. Apply resolution/FPS limits to the sender,
    // never to these tracks, so local replay retains its capture quality.
  }
  async function start({ replace = false } = {}): Promise<boolean> {
    if (active && !replace) return true;
    if (!mediaDevices?.getDisplayMedia)
      throw new Error('Compartilhamento de tela não é suportado neste navegador.');
    const settings = getSettings(),
      request = ++generation,
      previous = active;
    const current = () => {
      const next = getSettings();
      return request === generation && settings.generation === next.generation && next.joined;
    };
    if (!current()) return false;
    let source: MediaStream | undefined,
      outgoing: MediaStream | undefined,
      resource: Resource | undefined;
    try {
      // Window audio avoids feeding the whole call back into a game-window share.
      // Older browsers may ignore these optional display-audio controls.
      const constraints: Omit<DisplayMediaStreamOptions, 'audio'> & {
        audio:
          | false
          | (MediaTrackConstraints & {
              suppressLocalAudioPlayback: boolean;
              restrictOwnAudio: boolean;
            });
        windowAudio: 'window' | 'exclude';
        systemAudio: 'include' | 'exclude';
        selfBrowserSurface: 'exclude';
      } = {
        video: {
          width: { ideal: Math.max(settings.format.width, settings.replay?.width || 0) },
          height: { ideal: Math.max(settings.format.height, settings.replay?.height || 0) },
          frameRate: { ideal: Math.max(settings.format.fps, settings.replay?.fps || 0) },
        },
        audio: settings.audio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              suppressLocalAudioPlayback: false,
              restrictOwnAudio: true,
            }
          : false,
        systemAudio: settings.audio ? 'include' : 'exclude',
        windowAudio: settings.audio ? 'window' : 'exclude',
        selfBrowserSurface: 'exclude',
      };
      source = await mediaDevices.getDisplayMedia(constraints);
      if (!current()) return false;
      outgoing = source.clone();
      const video = outgoing.getVideoTracks()[0];
      if (
        !video ||
        video.readyState !== 'live' ||
        source.getVideoTracks()[0]?.readyState !== 'live'
      )
        throw new Error('Nenhuma tela foi selecionada.');
      const capture = Object.freeze({ source, outgoing });
      const change: ScreenCaptureChange = {
        capture,
        replace,
        isCurrent: () => current() && active === resource,
      };
      const ended = () => {
        if (active === resource) void onEnded().catch(warn);
      };
      const audio = outgoing.getAudioTracks()[0];
      // A canceled replacement invalidates its pending request, but the previous
      // capture still owns its lifetime listeners until it is actually replaced.
      const ownsCapture = () =>
        active === resource && getSettings().generation === settings.generation;
      const audioEnded = () => {
        if (ownsCapture()) void onAudioEnded({ ...change, isCurrent: ownsCapture }).catch(warn);
      };
      const sourceVideo = source.getVideoTracks()[0];
      sourceVideo.addEventListener('ended', ended, { once: true });
      audio?.addEventListener('ended', audioEnded, { once: true });
      resource = {
        capture,
        removeListeners() {
          sourceVideo.removeEventListener('ended', ended);
          audio?.removeEventListener('ended', audioEnded);
        },
      };
      resources.add(resource);
      active = resource;
      refreshHint();
      onSourceStarted(source);
      await onStarted(change);
      return change.isCurrent();
    } catch (error) {
      const failedCurrent = current();
      if (failedCurrent && resource && active === resource) {
        try {
          await onEnded();
        } finally {
          if (active === resource) stop();
        }
      }
      const latest = getSettings();
      if (failedCurrent && latest.generation === settings.generation && latest.joined && !active)
        throw error;
      if (current()) throw error;
      return false;
    } finally {
      if (resource) {
        if (previous && resource !== previous) release(previous);
        if (active !== resource) release(resource);
      } else {
        stopTracks(source);
        stopTracks(outgoing);
      }
    }
  }
  return { getCapture: () => active?.capture ?? null, start, stop, refreshHint };
}
