import type { VoiceAudioContext, CallAudioSnapshot } from '../../types/voice-audio';

interface CallAudioOptions {
  desktop: boolean;
  getSettings(): { joined: boolean; generation: number; output: string; visible: boolean };
  createContext(options: AudioContextOptions): VoiceAudioContext | null;
  playback: { unlock(): void; refresh(): void };
  alerts: { prime(): void; unlock(): void };
  refreshMicrophone(): Promise<void>;
  documentEvents: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  onChange(): void;
  warn?(error: unknown): void;
}

/** Owns the shared microphone context and gesture listeners, never capture or received playback. */
export function createCallAudio(options: CallAudioOptions) {
  let context: VoiceAudioContext | null = null,
    disposed = false,
    started = false;
  const resumes = new WeakMap<AudioContext, Promise<void>>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[CallAudio]', error));
  const current = (ctx: AudioContext) => !disposed && context === ctx;
  function ensureContext(): AudioContext | null {
    if (disposed) return null;
    if (!context || context.state === 'closed') {
      if (context) context.onstatechange = null;
      try {
        context = options.createContext({
          latencyHint: options.desktop ? 0.04 : 'interactive',
          sampleRate: 48000,
        });
      } catch (error) {
        warn(error);
        return null;
      }
      const ctx = context;
      if (!ctx) return null;
      const output = options.getSettings().output;
      try {
        if (output && ctx.setSinkId) void ctx.setSinkId(output).catch(() => {});
      } catch {
        /* Optional routing must not disable microphone processing. */
      }
      ctx.onstatechange = () => {
        if (!current(ctx)) return;
        try {
          void options.refreshMicrophone().catch((error) => {
            if (current(ctx)) warn(error);
          });
        } catch (error) {
          warn(error);
        }
        options.onChange();
      };
    }
    return context;
  }
  function unlock() {
    const ctx = ensureContext();
    if (ctx && ctx.state !== 'running' && !resumes.has(ctx)) {
      const generation = options.getSettings().generation;
      try {
        // Keep resume(), player play() and alert resume() inside the original gesture.
        const request = ctx
          .resume()
          .then(() => {
            if (!current(ctx) || generation !== options.getSettings().generation) return;
            options.playback.refresh();
            options.onChange();
          })
          .catch(() => {
            if (current(ctx) && generation === options.getSettings().generation) options.onChange();
          });
        resumes.set(ctx, request);
        void request.then(() => {
          if (resumes.get(ctx) === request) resumes.delete(ctx);
        });
      } catch {
        if (current(ctx)) options.onChange();
      }
    }
    if (disposed) return;
    options.playback.unlock();
    options.alerts.unlock();
  }
  const onPointer: EventListener = () => {
    if (disposed) return;
    options.alerts.prime();
    if (options.getSettings().joined) unlock();
  };
  const onKey: EventListener = () => {
    if (disposed) return;
    if (options.getSettings().joined) unlock();
  };
  const onVisibility: EventListener = () => {
    if (disposed) return;
    const settings = options.getSettings();
    if (settings.visible && settings.joined) {
      options.playback.refresh();
      options.onChange();
    }
  };
  return {
    ensureContext,
    unlock,
    getSnapshot: (): CallAudioSnapshot => Object.freeze({ context: context?.state ?? null }),
    start() {
      if (disposed || started) return;
      started = true;
      options.documentEvents.addEventListener('pointerdown', onPointer);
      options.documentEvents.addEventListener('keydown', onKey);
      options.documentEvents.addEventListener('visibilitychange', onVisibility);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (started) {
        options.documentEvents.removeEventListener('pointerdown', onPointer);
        options.documentEvents.removeEventListener('keydown', onKey);
        options.documentEvents.removeEventListener('visibilitychange', onVisibility);
      }
      const ctx = context;
      context = null;
      if (ctx) {
        ctx.onstatechange = null;
        if (ctx.state !== 'closed') void ctx.close().catch(warn);
      }
    },
  };
}
