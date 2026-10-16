import type { MicrophoneProcessor, NoiseFilter } from '../../types/voice';
import { enableNativeSuppression } from './audio-constraints.ts';

interface ProcessorOptions {
  enabled: boolean;
  nativeOnly: boolean;
  gain: number;
  signal: AbortSignal;
}
interface ProcessorDependencies {
  getContext(): AudioContext | null;
  nativeSuppressionSupported(): boolean;
  createNoise(context: AudioContext, onFailure: () => void): Promise<NoiseFilter>;
  onModeChange(): void;
  onNativeUnavailable(processor: MicrophoneProcessor): void;
  warn?: (error: unknown) => void;
}

/** One graph per raw capture. The call's AudioContext is borrowed and never closed here. */
export async function createMicrophoneProcessor(
  rawStream: MediaStream,
  options: ProcessorOptions,
  {
    getContext,
    nativeSuppressionSupported,
    createNoise,
    onModeChange,
    onNativeUnavailable,
    warn = (error) => console.warn('[MicrophoneProcessor]', error),
  }: ProcessorDependencies,
): Promise<MicrophoneProcessor | null> {
  if (options.signal.aborted) return null;
  const ctx = getContext();
  if (!ctx) return null;
  if (ctx.state !== 'running') {
    void ctx.resume().catch(() => {});
    return null;
  }
  const source = ctx.createMediaStreamSource(rawStream),
    gain = ctx.createGain(),
    limiter = ctx.createDynamicsCompressor(),
    destination = ctx.createMediaStreamDestination();
  gain.gain.value = options.gain / 100;
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.08;
  let denoiser: NoiseFilter | null = null,
    stopped = false,
    fallbackPending: Promise<void> | null = null;
  const destroyed = new WeakSet<NoiseFilter>();
  function destroy(filter: NoiseFilter | null) {
    if (!filter || destroyed.has(filter)) return;
    destroyed.add(filter);
    try {
      filter.destroy();
    } catch (error) {
      warn(error);
    }
  }
  const processor: MicrophoneProcessor = {
    ctx,
    track: destination.stream.getAudioTracks()[0],
    mode: 'gain-only',
    setGain(percent) {
      if (!stopped) gain.gain.setTargetAtTime(percent / 100, ctx.currentTime, 0.012);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      options.signal.removeEventListener('abort', processor.stop);
      destroy(denoiser);
      denoiser = null;
      for (const node of [source, gain, limiter, destination]) {
        try {
          node.disconnect();
        } catch {
          /* Nodes may already be disconnected. */
        }
      }
      processor.track?.stop();
    },
  };
  options.signal.addEventListener('abort', processor.stop, { once: true });
  async function nativeFallback() {
    if (stopped) return;
    try {
      source.disconnect();
    } catch {
      /* Already detached by a failed worklet. */
    }
    destroy(denoiser);
    denoiser = null;
    source.connect(gain);
    processor.mode = 'unavailable';
    const native = await enableNativeSuppression(rawStream, nativeSuppressionSupported());
    if (stopped) return;
    processor.mode = native ? 'native' : 'unavailable';
    onModeChange();
    if (!native) onNativeUnavailable(processor);
  }
  function fallback() {
    if (!fallbackPending)
      fallbackPending = nativeFallback().finally(() => {
        fallbackPending = null;
      });
    return fallbackPending;
  }
  try {
    gain.connect(limiter);
    limiter.connect(destination);
    if (!options.enabled) {
      source.connect(gain);
      return processor;
    }
    if (options.nativeOnly) {
      // Native capture suppression must not be stacked with an expander: doing
      // so gated quiet syllables in the desktop's default microphone mode.
      processor.nativeSuppression =
        rawStream.getAudioTracks()[0]?.getSettings().noiseSuppression === true;
      source.connect(gain);
      processor.mode = processor.nativeSuppression ? 'native' : 'unavailable';
      return processor;
    }
    try {
      let failed = false;
      let failure: Promise<void> | null = null;
      const filter = await createNoise(ctx, () => {
        if (failed) return;
        failed = true;
        failure = fallback();
        void failure.catch(warn);
      });
      if (stopped) {
        destroy(filter);
        return null;
      }
      if (failed) {
        destroy(filter);
        await failure;
        return stopped ? null : processor;
      }
      denoiser = filter;
      source.connect(filter.node);
      filter.node.connect(gain);
      processor.mode = 'rnnoise';
    } catch (error) {
      if (stopped) return null;
      warn(error);
      await fallback();
    }
    return stopped ? null : processor;
  } catch (error) {
    processor.stop();
    throw error;
  }
}
