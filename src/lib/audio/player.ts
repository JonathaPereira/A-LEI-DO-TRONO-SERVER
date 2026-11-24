import { tabletopGameKeys, type TabletopGame } from '../games/tabletop-audio.ts';
import type { PreferenceStorage } from '../storage/preferences';
import { musicTracks, isMusicTrack, type MusicTrack } from './catalog.ts';
import { createGameEffects } from './effects.ts';

type MusicPlayer = Pick<
  HTMLAudioElement,
  'src' | 'paused' | 'muted' | 'volume' | 'dataset' | 'play' | 'pause' | 'load'
>;
interface Options {
  storage: PreferenceStorage;
  events: Pick<EventTarget, 'dispatchEvent'>;
  desktop: boolean;
  href: string;
  player(): MusicPlayer | null;
  createContext(): AudioContext | null;
  warn?(error: unknown): void;
}
const volume = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));
const game = (key: string | null): key is TabletopGame =>
  tabletopGameKeys.includes(key as TabletopGame);
export interface AudioSnapshot {
  readonly musicEnabled: boolean;
  readonly sfxEnabled: boolean;
  readonly musicVolume: number;
  readonly currentTrack: MusicTrack;
  readonly musicStatus: string;
  readonly volumes: Readonly<Record<TabletopGame, number>>;
}
export function createAudioPlayer(options: Options) {
  const storage = options.storage,
    effects = createGameEffects(),
    buses = new Map<TabletopGame, GainNode>();
  const listeners = new Set<() => void>();
  let context: AudioContext | null = null,
    master: GainNode | null = null,
    sfx: GainNode | null = null;
  let disposed = false,
    started = false,
    generation = 0;
  let disposal: Promise<void> | undefined;
  const saved = storage.getItem('tronoMusicTrack') || 'lofi';
  const initialTrack = saved === 'tavern' || saved === 'classical' ? 'lofi' : saved;
  let state: AudioSnapshot = Object.freeze({
    musicEnabled: false,
    sfxEnabled: storage.getItem('tronoSfxEnabled') !== '0',
    musicVolume: volume(storage.getItem('tronoMusicVolume') ?? 32),
    currentTrack: isMusicTrack(initialTrack) ? initialTrack : ('lofi' as MusicTrack),
    musicStatus: '',
    volumes: Object.freeze(
      Object.fromEntries(
        tabletopGameKeys.map((key) => [
          key,
          volume(storage.getItem('mnGameVolume:' + key) ?? (key === 'splendor' ? 90 : 80)),
        ]),
      ) as Record<TabletopGame, number>,
    ),
  });
  function publish(patch: Partial<typeof state>, event?: string, detail?: unknown) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((listener) => listener());
    if (event)
      options.events.dispatchEvent(
        detail === undefined ? new Event(event) : new CustomEvent(event, { detail }),
      );
  }
  async function ensureAudio(): Promise<boolean> {
    if (disposed) return false;
    if (!context) {
      let candidate: AudioContext | null = null;
      try {
        candidate = options.createContext();
        if (candidate) {
          const nextMaster = candidate.createGain(),
            nextSfx = candidate.createGain();
          nextMaster.gain.value = 0.82;
          nextSfx.gain.value = 0.78;
          nextSfx.connect(nextMaster);
          nextMaster.connect(candidate.destination);
          context = candidate;
          master = nextMaster;
          sfx = nextSfx;
        }
      } catch (error) {
        void candidate?.close().catch(() => {});
        options.warn?.(error);
      }
    }
    try {
      if (context?.state === 'suspended')
        void context.resume().catch((error) => options.warn?.(error));
    } catch (error) {
      options.warn?.(error);
    }
    return !context || context.state === 'running';
  }
  function setMusicVolume(value: unknown) {
    if (disposed) return;
    const next = volume(value),
      player = options.player();
    if (player) {
      player.volume = next / 100;
      player.muted = true;
      player.pause();
    }
    storage.setItem('tronoMusicVolume', String(next));
    publish({ musicVolume: next }, 'trono-music-volume');
  }
  function setMusicTrack(id: string) {
    if (disposed || !isMusicTrack(id)) return;
    generation++;
    storage.setItem('tronoMusicTrack', id);
    publish({ currentTrack: id }, 'trono-music-track', { id, ...musicTracks[id] });
  }
  async function setMusicEnabled(_next: boolean) {
    if (disposed) return false;
    generation++;
    storage.setItem('tronoMusicEnabled', '0');
    const player = options.player();
    if (player) {
      player.muted = true;
      player.pause();
    }
    publish({ musicEnabled: false, musicStatus: '' }, 'trono-audio-state', {
      musicEnabled: false,
      sfxEnabled: state.sfxEnabled,
    });
    return false;
  }
  function setSfxEnabled(next: boolean) {
    if (disposed) return state.sfxEnabled;
    storage.setItem('tronoSfxEnabled', next ? '1' : '0');
    publish({ sfxEnabled: next }, 'trono-audio-state', {
      musicEnabled: false,
      sfxEnabled: next,
    });
    return next;
  }
  function gameVolume(key: string) {
    return game(key) ? state.volumes[key] : 80;
  }
  function setGameVolume(key: string, value: unknown) {
    if (disposed || !game(key)) return;
    const next = volume(value);
    storage.setItem('mnGameVolume:' + key, String(next));
    if (context) buses.get(key)?.gain.setTargetAtTime(next / 100, context.currentTime, 0.02);
    publish({ volumes: Object.freeze({ ...state.volumes, [key]: next }) }, 'trono-game-volume', {
      key,
      value: next,
    });
  }
  function playSfx(kind: string, override: string | null = null) {
    if (disposed || !state.sfxEnabled || !context || context.state !== 'running' || !sfx) return;
    const key =
      override ||
      (kind.startsWith('similo-')
        ? 'similo'
        : kind.startsWith('love-letter-')
          ? 'love-letter'
          : kind.startsWith('splendor-')
            ? 'splendor'
            : kind.startsWith('azul-')
              ? 'azul'
              : ['card', 'crown', 'shadow', 'influence', 'decree', 'turn'].includes(kind)
                ? 'throne'
                : null);
    if (key && gameVolume(key) === 0) return;
    let destination: AudioNode = sfx;
    if (game(key)) {
      let bus = buses.get(key);
      if (!bus) {
        bus = context.createGain();
        bus.gain.value = gameVolume(key) / 100;
        bus.connect(sfx);
        buses.set(key, bus);
      }
      destination = bus;
    }
    effects.play(context, destination, kind);
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ensureAudio,
    playSfx,
    gameVolume,
    setGameVolume,
    setMusicTrack,
    setMusicVolume,
    setMusicEnabled,
    setSfxEnabled,
    toggleMusic: () => setMusicEnabled(false),
    toggleSfx: () => setSfxEnabled(!state.sfxEnabled),
    handleMusicError() {
      const player = options.player();
      if (player) {
        player.muted = true;
        player.pause();
      }
    },
    start() {
      if (started || disposed) return;
      started = true;
      const player = options.player();
      if (player) {
        player.muted = true;
        player.pause();
      }
    },
    get currentTrack() {
      return state.currentTrack;
    },
    get musicEnabled() {
      return state.musicEnabled;
    },
    get sfxEnabled() {
      return state.sfxEnabled;
    },
    get musicStatus() {
      return state.musicStatus;
    },
    get musicVolume() {
      return state.musicVolume;
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true;
      generation++;
      listeners.clear();
      const player = options.player();
      if (player) {
        player.muted = true;
        player.pause();
      }
      effects.dispose();
      buses.forEach((bus) => bus.disconnect());
      buses.clear();
      sfx?.disconnect();
      master?.disconnect();
      const owned = context;
      context = null;
      sfx = null;
      master = null;
      disposal = Promise.resolve(owned?.close()).catch((error) => options.warn?.(error));
      return disposal;
    },
  };
}
export type AudioPlayer = ReturnType<typeof createAudioPlayer>;
