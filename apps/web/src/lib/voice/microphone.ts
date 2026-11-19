import type {
  MicrophoneCapture,
  MicrophoneProcessor,
  MicrophoneSettings,
  MicrophoneSnapshot,
} from '../../types/voice';
import { enableNativeSuppression, microphoneConstraints } from './audio-constraints.ts';

export interface TrackChange {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly reason: 'acquire' | 'resume';
  isCurrent(): boolean;
}
interface MicrophoneOptions {
  mediaDevices: Pick<MediaDevices, 'getUserMedia' | 'getSupportedConstraints'> | undefined;
  getSettings(): MicrophoneSettings;
  getStream(): MediaStream;
  customSuppressionSupported(): boolean;
  createProcessor(
    stream: MediaStream,
    options: { enabled: boolean; nativeOnly: boolean; gain: number; signal: AbortSignal },
  ): Promise<MicrophoneProcessor | null>;
  onTrackChanged(change: TrackChange): Promise<void>;
  warn?: (error: unknown) => void;
}
interface Resource {
  rawStream: MediaStream;
  processor: MicrophoneProcessor | null;
  controller: AbortController;
}
export const voiceCancelled = () =>
  Object.assign(new Error('Entrada na chamada cancelada.'), { code: 'VOICE_CANCELLED' });

/** Owns raw/processed microphone tracks and pending captures. It never creates a socket or peer. */
export function createMicrophone({
  mediaDevices,
  getSettings,
  getStream,
  customSuppressionSupported,
  createProcessor,
  onTrackChanged,
  warn = (error) => console.warn('[Microphone]', error),
}: MicrophoneOptions) {
  let state: MicrophoneSnapshot = Object.freeze({ capture: null, loading: false });
  let generation = 0,
    disposed = false,
    active: Resource | null = null;
  const resources = new Set<Resource>(),
    listeners = new Set<() => void>();
  const stoppedProcessors = new WeakSet<MicrophoneProcessor>();
  const stoppedTracks = new WeakSet<MediaStreamTrack>();
  function update(patch: Partial<MicrophoneSnapshot>) {
    if (disposed) return;
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
    if (!resource) return;
    resource.controller.abort();
    if (resource.processor && !stoppedProcessors.has(resource.processor)) {
      stoppedProcessors.add(resource.processor);
      try {
        resource.processor.stop();
      } catch (error) {
        warn(error);
      }
    }
    for (const track of resource.rawStream.getTracks())
      if (!stoppedTracks.has(track)) {
        stoppedTracks.add(track);
        try {
          track.stop();
        } catch (error) {
          warn(error);
        }
      }
    resources.delete(resource);
  }
  function mute(capture: MicrophoneCapture | null, muted: boolean) {
    if (!capture) return;
    const enabled = !muted && getSettings().gain > 0;
    for (const track of capture.rawStream.getAudioTracks()) track.enabled = enabled;
    capture.outgoingTrack.enabled = enabled;
    if (capture.processor?.track) capture.processor.track.enabled = enabled;
  }
  function outgoingTrack(resource: Pick<Resource, 'rawStream' | 'processor'>) {
    const { processor, rawStream } = resource;
    // Native/off at unity gain can stay on WebRTC's capture path. Custom gain
    // and RNNoise still use the same owned graph, without reopening the device.
    return processor?.ctx.state === 'running' &&
      !(processor.rawAtUnity && getSettings().gain === 100)
      ? processor.track
      : rawStream.getAudioTracks()[0];
  }
  function attach(capture: MicrophoneCapture): MediaStream {
    const stream = getStream();
    for (const track of stream.getAudioTracks()) stream.removeTrack(track);
    stream.addTrack(capture.outgoingTrack);
    mute(capture, getSettings().muted);
    return stream;
  }
  async function acquire(
    options: { generation?: number; nativeOnly?: boolean } = {},
  ): Promise<MediaStream> {
    if (disposed) throw voiceCancelled();
    if (!mediaDevices?.getUserMedia)
      throw new Error(
        'Seu navegador não oferece acesso ao microfone nesta página. Use HTTPS em navegador atualizado.',
      );
    const settings = getSettings(),
      callGeneration = options.generation ?? settings.generation;
    const request = ++generation,
      nativeOnly = options.nativeOnly ?? settings.nativeOnly;
    const current = () =>
      !disposed && request === generation && callGeneration === getSettings().generation;
    const ensureCurrent = () => {
      if (!current()) throw voiceCancelled();
    };
    const support = mediaDevices.getSupportedConstraints?.() ?? {};
    let resource: Resource | null = null,
      previous: Resource | null = null,
      installed = false;
    async function open(native: boolean): Promise<Resource> {
      const rawStream = await mediaDevices!.getUserMedia({
        audio: microphoneConstraints(settings, native, support, customSuppressionSupported),
        video: false,
      });
      resource = { rawStream, processor: null, controller: new AbortController() };
      resources.add(resource);
      ensureCurrent();
      try {
        resource.processor = await createProcessor(rawStream, {
          enabled: settings.enabled,
          nativeOnly: native,
          gain: settings.gain,
          signal: resource.controller.signal,
        });
      } catch (error) {
        if (current()) warn(error);
      }
      ensureCurrent();
      return resource;
    }
    update({ loading: true });
    try {
      ensureCurrent();
      let candidate = await open(nativeOnly);
      ensureCurrent();
      if (settings.enabled && !candidate.processor) {
        await enableNativeSuppression(candidate.rawStream, !!support.noiseSuppression);
        ensureCurrent();
      }
      if (
        settings.enabled &&
        !nativeOnly &&
        candidate.processor?.mode !== 'rnnoise' &&
        candidate.rawStream.getAudioTracks()[0]?.getSettings().noiseSuppression !== true &&
        support.noiseSuppression
      ) {
        release(resource);
        resource = null;
        candidate = await open(true);
        ensureCurrent();
      }
      const track = outgoingTrack(candidate);
      if (!track || track.readyState !== 'live')
        throw new Error('Nenhuma trilha de microfone foi recebida.');
      candidate.processor?.setGain(getSettings().gain);
      const capture = Object.freeze({
        rawStream: candidate.rawStream,
        processor: candidate.processor,
        outgoingTrack: track,
      });
      const stream = attach(capture);
      previous = active;
      active = candidate;
      update({ capture });
      installed = true;
      await onTrackChanged({
        stream,
        track,
        reason: 'acquire',
        isCurrent: () =>
          current() &&
          active === candidate &&
          state.capture?.outgoingTrack === track &&
          outgoingTrack(candidate) === track,
      });
      ensureCurrent();
      return stream;
    } finally {
      release(previous);
      if (!installed) release(resource);
      if (request === generation) update({ loading: false });
    }
  }
  async function refresh(): Promise<void> {
    const capture = state.capture,
      owner = active;
    if (disposed || !capture || !owner) return;
    const request = generation,
      callGeneration = getSettings().generation;
    const track = outgoingTrack(owner);
    const current = () =>
      !disposed &&
      owner === active &&
      request === generation &&
      callGeneration === getSettings().generation &&
      state.capture?.outgoingTrack === track &&
      outgoingTrack(owner) === track;
    if (!track || track.readyState !== 'live' || track === capture.outgoingTrack) return;
    const next = Object.freeze({ ...capture, outgoingTrack: track });
    const stream = attach(next);
    update({ capture: next });
    await onTrackChanged({ stream, track, reason: 'resume', isCurrent: current });
  }
  function stop() {
    generation++;
    const capture = state.capture;
    active = null;
    if (capture) {
      const stream = getStream();
      if (stream.getAudioTracks().includes(capture.outgoingTrack))
        stream.removeTrack(capture.outgoingTrack);
    }
    for (const resource of [...resources]) release(resource);
    update({ capture: null, loading: false });
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
    refresh,
    stop,
    setMuted(muted: boolean) {
      mute(state.capture, muted);
    },
    setGain(percent: number) {
      state.capture?.processor?.setGain(percent);
      mute(state.capture, getSettings().muted);
    },
    dispose() {
      stop();
      disposed = true;
      listeners.clear();
    },
  };
}
export type Microphone = ReturnType<typeof createMicrophone>;
