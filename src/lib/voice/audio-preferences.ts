import type { createCallAlerts } from './call-alerts';
import type { createVoiceTelemetry } from './telemetry';

interface ApplicationAudio {
  readonly sfxEnabled: boolean;
  readonly musicEnabled: boolean;
  readonly musicVolume: number;
  readonly currentTrack: string;
  readonly musicStatus: string;
  toggleMusic(): Promise<boolean>;
  toggleSfx(): boolean;
  setMusicTrack(id: string): void;
  setMusicVolume(value: number): void;
}
interface PreferencesOptions {
  audio(): ApplicationAudio;
  tracks(): Readonly<Record<string, { label: string; artist: string }>>;
  alerts: Pick<
    ReturnType<typeof createCallAlerts>,
    'getSnapshot' | 'setVolume' | 'prime' | 'play'
  > & {
    setMuted?(value: boolean): boolean;
  };
  protection: Pick<ReturnType<typeof createVoiceTelemetry>, 'getSnapshot' | 'configureProtection'>;
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  storage: Pick<Storage, 'setItem'>;
  warn?(error: unknown): void;
}
const EVENTS = [
  'trono-audio-state',
  'trono-music-track',
  'trono-music-volume',
  'trono-music-playback',
] as const;
const volume = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));

/** Projects borrowed audio owners into React; creates no players, contexts or media. */
export function createAudioPreferences(options: PreferencesOptions) {
  const listeners = new Set<() => void>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[AudioPreferences]', error));
  let started = false,
    disposed = false;
  let tracks: readonly Readonly<{ id: string; label: string; artist: string }>[] | undefined;
  function read() {
    const audio = options.audio();
    tracks ??= Object.freeze(
      Object.entries(options.tracks()).map(([id, track]) =>
        Object.freeze({ id, label: track.label, artist: track.artist }),
      ),
    );
    return Object.freeze({
      sfxEnabled: audio.sfxEnabled,
      musicEnabled: audio.musicEnabled,
      musicVolume: audio.musicVolume,
      currentTrack: audio.currentTrack,
      musicStatus: audio.musicStatus,
      alertVolume: options.alerts.getSnapshot().volume,
      alertsMuted: Boolean(options.alerts.getSnapshot().muted),
      protection: options.protection.getSnapshot().enabled,
      tracks,
    });
  }
  let snapshot: ReturnType<typeof read> | undefined;
  const getSnapshot = () => (snapshot ??= read());
  function refresh() {
    if (disposed) return;
    const next = read();
    if (
      snapshot &&
      (Object.keys(next) as (keyof typeof next)[]).every((key) => snapshot![key] === next[key])
    )
      return;
    snapshot = next;
    for (const listener of listeners) listener();
  }
  async function run(action: () => unknown) {
    if (disposed) return;
    try {
      const pending = action(); // Keep audio activation inside the original user gesture.
      refresh();
      await pending;
    } catch (error) {
      warn(error);
    } finally {
      refresh();
    }
  }
  return {
    getSnapshot,
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      for (const event of EVENTS) options.events.addEventListener(event, refresh);
      refresh();
    },
    toggleSfx: () => run(() => options.audio().toggleSfx()),
    toggleMusic: () => run(() => options.audio().toggleMusic()),
    selectTrack(id: string) {
      return run(() => {
        if (getSnapshot().tracks.some((track) => track.id === id))
          options.audio().setMusicTrack(id);
      });
    },
    setMusicVolume(value: unknown) {
      return run(() => {
        const audio = options.audio(),
          next = volume(value);
        if (audio.musicVolume !== next) audio.setMusicVolume(next);
      });
    },
    setAlertVolume(value: unknown) {
      return run(() => {
        const next = volume(value);
        if (options.alerts.getSnapshot().volume === next) return;
        options.alerts.setVolume(next);
        options.alerts.prime();
      });
    },
    setAlertsMuted(muted: boolean) {
      return run(() => {
        if (Boolean(options.alerts.getSnapshot().muted) === muted) return;
        options.alerts.setMuted?.(muted);
      });
    },
    testAlert() {
      return run(() => {
        options.alerts.prime();
        options.alerts.play('join', 'test');
      });
    },
    setProtection(enabled: boolean) {
      return run(() => {
        if (options.protection.getSnapshot().enabled === enabled) return;
        options.storage.setItem('mnVoiceProtection', enabled ? '1' : '0');
        options.protection.configureProtection(enabled);
      });
    },
    dispose() {
      disposed = true;
      listeners.clear();
      if (started) for (const event of EVENTS) options.events.removeEventListener(event, refresh);
      started = false;
    },
  };
}
export type AudioPreferences = ReturnType<typeof createAudioPreferences>;
