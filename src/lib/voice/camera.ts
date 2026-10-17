import type { CameraCaptureChange, CameraSettings, CameraSnapshot } from '../../types/voice';

interface CameraOptions {
  mediaDevices: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'> | undefined;
  getSettings(): CameraSettings;
  getStream(): MediaStream;
  onStarted(change: CameraCaptureChange): Promise<void>;
  onStopped(): void;
  onDeviceMissing(deviceId: string): void;
  warn?: (error: unknown) => void;
}
interface Resource {
  released: boolean;
  source: MediaStream;
  stream: MediaStream | null;
  track: MediaStreamTrack | undefined;
  ended: () => void;
}
const cancelled = () =>
  Object.assign(new Error('Abertura da câmera cancelada.'), { code: 'CAMERA_CANCELLED' });
function canFallback(error: unknown) {
  const { name, code } = (error ?? {}) as { name?: string; code?: string };
  return (
    [
      'OverconstrainedError',
      'NotFoundError',
      'NotReadableError',
      'AbortError',
      'TypeError',
    ].includes(name ?? '') || ['OVERCONSTRAINED', 'DEVICE_NOT_FOUND'].includes(code ?? '')
  );
}

/** Owns camera capture, listeners and cancellation; borrows the call's AV stream. */
export function createCamera({
  mediaDevices,
  getSettings,
  getStream,
  onStarted,
  onStopped,
  onDeviceMissing,
  warn = (error) => console.warn('[Camera]', error),
}: CameraOptions) {
  let state: CameraSnapshot = Object.freeze({ capture: null, loading: false });
  let generation = 0;
  let pending: Promise<MediaStreamTrack> | null = null;
  let active: Resource | null = null;
  const listeners = new Set<() => void>();
  function update(patch: Partial<CameraSnapshot>) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        warn(error);
      }
    }
  }
  function release(resource: Resource | null) {
    if (!resource || resource.released) return;
    resource.released = true;
    resource.track?.removeEventListener('ended', resource.ended);
    if (resource.track && resource.stream?.getVideoTracks().includes(resource.track))
      resource.stream.removeTrack(resource.track);
    for (const track of resource.source.getTracks()) {
      try {
        track.stop();
      } catch (error) {
        warn(error);
      }
    }
  }
  function stop() {
    generation++;
    pending = null;
    const previous = active;
    active = null;
    release(previous);
    update({ capture: null, loading: false });
    onStopped();
  }
  function acquire(): Promise<MediaStreamTrack> {
    if (pending) return pending;
    if (!mediaDevices?.getUserMedia)
      return Promise.reject(new Error('Seu navegador não oferece acesso à câmera nesta página.'));
    const settings = getSettings(),
      request = ++generation;
    const current = () =>
      request === generation &&
      getSettings().joined &&
      settings.generation === getSettings().generation;
    const ensureCurrent = () => {
      if (!current()) throw cancelled();
    };
    let candidate: Resource | null = null;
    async function open(): Promise<MediaStream> {
      const q = settings.format;
      const base = {
        width: { ideal: q.width },
        height: { ideal: q.height },
        frameRate: { ideal: Math.min(q.fps, 30) },
      };
      const attempts: (boolean | MediaTrackConstraints)[] = settings.deviceId
        ? [
            { ...base, deviceId: { exact: settings.deviceId } },
            { deviceId: { exact: settings.deviceId } },
          ]
        : [{ ...base, facingMode: { ideal: 'user' } }, true];
      let last: unknown;
      for (const video of attempts) {
        ensureCurrent();
        try {
          return await mediaDevices!.getUserMedia({ audio: false, video });
        } catch (error) {
          ensureCurrent();
          last = error;
          if (!canFallback(error)) throw error;
        }
      }
      const name = (last as { name?: string } | undefined)?.name;
      if (settings.deviceId && ['NotFoundError', 'OverconstrainedError'].includes(name ?? '')) {
        const devices = await mediaDevices!.enumerateDevices();
        ensureCurrent();
        if (!devices.some((d) => d.kind === 'videoinput' && d.deviceId === settings.deviceId)) {
          onDeviceMissing(settings.deviceId);
          ensureCurrent();
          return mediaDevices!.getUserMedia({ audio: false, video: true });
        }
      }
      throw last || new Error('Não foi possível iniciar a câmera.');
    }
    // Defer work so pending is installed before notifying subscribers.
    const run = Promise.resolve().then(async () => {
      ensureCurrent();
      // Some webcams allow only one capture: release before reopening.
      const previous = active;
      active = null;
      release(previous);
      update({ capture: null, loading: true });
      const source = await open();
      candidate = {
        source,
        track: source.getVideoTracks()[0],
        stream: null,
        ended: () => {},
        released: false,
      };
      ensureCurrent();
      const track = candidate.track;
      if (!track || track.readyState !== 'live')
        throw new Error('Nenhuma trilha de câmera foi recebida.');
      const stream = getStream();
      candidate.stream = stream;
      stream.addTrack(track);
      active = candidate;
      const capture = Object.freeze({ source, track });
      candidate.ended = () => {
        if (current() && active === candidate) stop();
      };
      track.addEventListener('ended', candidate.ended, { once: true });
      update({ capture });
      ensureCurrent();
      await onStarted({ capture, isCurrent: () => current() && active === candidate });
      ensureCurrent();
      return track;
    });
    const tracked = run
      .catch((error) => {
        const valid = current();
        if (valid) stop();
        else if (candidate && active === candidate) {
          active = null;
          update({ capture: null });
        }
        throw valid ? error : cancelled();
      })
      .finally(() => {
        if (candidate !== active) release(candidate);
        if (pending === tracked) {
          pending = null;
          update({ loading: false });
        }
      });
    pending = tracked;
    update({ loading: true });
    return tracked;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    acquire,
    stop,
    async refreshQuality() {
      const track = state.capture?.track;
      if (!track) return;
      const q = getSettings().format;
      await track.applyConstraints({
        width: { ideal: q.width },
        height: { ideal: q.height },
        frameRate: { ideal: q.fps, max: q.fps },
      });
    },
  };
}
export type Camera = ReturnType<typeof createCamera>;
