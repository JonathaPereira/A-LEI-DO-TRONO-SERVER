import type { CallAlertsSnapshot, CallSoundKind, VoiceAudioContext } from '../../types/voice-audio';

interface AlertsOptions {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  getSettings(): { enabled: boolean; muted: boolean; output: string };
  createContext(): VoiceAudioContext | null;
  now?(): number;
  warn?(error: unknown): void;
}
interface Tone {
  gain: GainNode;
  oscillators: Set<OscillatorNode>;
}
const clampVolume = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));

/** Owns alert volume, cooldown, oscillators and its own context; never microphone audio. */
export function createCallAlerts(options: AlertsOptions) {
  let volume = clampVolume(options.storage.getItem('mnCallAlertVolume') ?? 85);
  let context: VoiceAudioContext | null = null,
    disposed = false;
  const cooldown = new Map<string, number>(),
    tones = new Set<Tone>();
  const resumes = new WeakMap<AudioContext, Promise<void>>();
  let routing: Promise<void> | undefined;
  const now = options.now ?? Date.now;
  const warn = options.warn ?? ((error: unknown) => console.warn('[CallAlerts]', error));
  function ensure() {
    if (disposed) return null;
    if (!context || context.state === 'closed') {
      context = options.createContext();
      routing = undefined;
    }
    return context;
  }
  function resume(ctx: VoiceAudioContext) {
    if (ctx.state === 'running' || resumes.has(ctx)) return;
    // Call immediately: awaiting another task here loses browser user activation.
    const request = ctx.resume().catch(() => {});
    resumes.set(ctx, request);
    void request.then(() => {
      if (resumes.get(ctx) === request) resumes.delete(ctx);
    });
  }
  function unlock() {
    if (disposed || !context) return;
    try {
      resume(context);
    } catch (error) {
      warn(error);
    }
  }
  function prime() {
    if (disposed || !options.getSettings().enabled) return;
    try {
      const ctx = ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') resume(ctx);
      if (!options.getSettings().output || !ctx.setSinkId) return;
      // Serial native routing keeps an older completion from restoring an old device.
      const route = async () => {
        if (disposed || context !== ctx || ctx.state === 'closed') return;
        await ctx.setSinkId!(options.getSettings().output);
      };
      routing = (routing ? routing.then(route) : route()).catch(() => {});
    } catch {
      /* Warming is opportunistic; a later gesture retries. */
    }
  }
  function release(tone: Tone, stop = false) {
    if (!tones.delete(tone)) return;
    for (const oscillator of tone.oscillators) {
      oscillator.onended = null;
      if (stop) {
        try {
          oscillator.stop();
        } catch {}
      }
      oscillator.disconnect();
    }
    tone.oscillators.clear();
    tone.gain.disconnect();
  }
  function play(kind: CallSoundKind = 'join', id = 'local') {
    const settings = options.getSettings();
    if (disposed || !settings.enabled || settings.muted) return;
    const key = `${kind}:${id}`,
      stamp = now();
    if ((cooldown.get(key) ?? -Infinity) > stamp - 750) return;
    cooldown.set(key, stamp);
    let tone: Tone | undefined;
    try {
      const ctx = ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') resume(ctx);
      if (kind !== 'message' && volume === 0) return;
      const time = ctx.currentTime + 0.01,
        gain = ctx.createGain();
      tone = { gain, oscillators: new Set() };
      tones.add(tone);
      gain.connect(ctx.destination);
      const level = kind === 'message' ? 0.11 : (0.52 * volume) / 100;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), time + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + (kind === 'message' ? 0.36 : 0.65));
      const notes =
        kind === 'join'
          ? [784, 1047, 1568]
          : kind === 'message'
            ? [1320, 1760]
            : kind === 'disconnect'
              ? [740, 554, 370]
              : [1047, 698];
      for (const [index, frequency] of notes.entries()) {
        const at = time + index * (kind === 'message' ? 0.11 : 0.17),
          oscillator = ctx.createOscillator(),
          owner = tone;
        owner.oscillators.add(oscillator);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, at);
        oscillator.connect(gain);
        oscillator.onended = () => {
          oscillator.onended = null;
          oscillator.disconnect();
          owner.oscillators.delete(oscillator);
          if (!owner.oscillators.size) release(owner);
        };
        oscillator.start(at);
        oscillator.stop(at + (kind === 'message' ? 0.18 : 0.22));
      }
    } catch (error) {
      if (tone) release(tone, true);
      warn(error);
    }
  }
  return {
    prime,
    unlock,
    play,
    getSnapshot: (): CallAlertsSnapshot =>
      Object.freeze({ volume, context: context?.state ?? null }),
    setVolume(value: unknown) {
      if (disposed) return volume;
      volume = clampVolume(value);
      options.storage.setItem('mnCallAlertVolume', String(volume));
      return volume;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const tone of [...tones]) release(tone, true);
      cooldown.clear();
      const ctx = context;
      context = null;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(warn);
    },
  };
}
