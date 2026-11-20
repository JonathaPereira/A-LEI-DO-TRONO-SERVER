export const tabletopGames = {
  throne: { label: 'A Lei do Trono', sample: 'card' },
  azul: { label: 'Azul', sample: 'azul-place' },
  splendor: { label: 'Splendor', sample: 'splendor-card' },
  similo: { label: 'Similo', sample: 'similo-card' },
  'love-letter': { label: 'Love Letter', sample: 'love-letter-card' },
} as const;
export type TabletopGame = keyof typeof tabletopGames;
export const tabletopGameKeys: readonly TabletopGame[] = Object.freeze(
  Object.keys(tabletopGames) as TabletopGame[],
);
export interface TabletopAudioSource {
  readonly sfxEnabled: boolean;
  gameVolume(key: TabletopGame): number;
  setGameVolume(key: TabletopGame, value: number): void;
  setSfxEnabled(enabled: boolean): void;
  ensureAudio(): Promise<unknown>;
  playSfx(kind: string, key: TabletopGame): void;
}
interface Options {
  audio: TabletopAudioSource;
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  warn?(error: unknown): void;
}
interface Snapshot {
  readonly enabled: boolean;
  readonly volumes: Readonly<Record<TabletopGame, number>>;
  readonly open: TabletopGame | null;
}
const events = ['trono-game-volume', 'trono-audio-state'] as const;
const volume = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0);

/** Owns the controls only; saved gains, synthesis and AudioContext stay in the audio source. */
export function createTabletopAudio(options: Options) {
  const listeners = new Set<() => void>();
  const last = new Map<TabletopGame, number>();
  let open: TabletopGame | null = null,
    started = false,
    disposed = false,
    preview = 0;
  const read = (): Snapshot =>
    Object.freeze({
      enabled: options.audio.sfxEnabled,
      volumes: Object.freeze(
        Object.fromEntries(
          tabletopGameKeys.map((key) => [key, volume(options.audio.gameVolume(key))]),
        ) as Record<TabletopGame, number>,
      ),
      open,
    });
  let snapshot = read();
  function refresh() {
    if (disposed) return;
    const next = read();
    if (
      next.enabled === snapshot.enabled &&
      next.open === snapshot.open &&
      tabletopGameKeys.every((key) => next.volumes[key] === snapshot.volumes[key])
    )
      return;
    snapshot = next;
    for (const fn of listeners) fn();
  }
  function setOpen(key: TabletopGame | null) {
    if (disposed) return;
    preview++;
    open = key;
    refresh();
  }
  function setVolume(key: TabletopGame, value: number) {
    if (disposed) return;
    options.audio.setGameVolume(key, volume(value));
    refresh();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(fn: () => void) {
      if (!disposed) listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      for (const event of events) options.events.addEventListener(event, refresh);
      refresh();
    },
    setOpen,
    setVolume,
    toggleMute(key: TabletopGame) {
      if (disposed) return;
      const current = volume(options.audio.gameVolume(key));
      if (current) last.set(key, current);
      setVolume(key, current ? 0 : (last.get(key) ?? 80));
    },
    enableEffects() {
      if (disposed) return;
      options.audio.setSfxEnabled(true);
      refresh();
    },
    async playSample(key: TabletopGame) {
      if (disposed) return;
      const generation = ++preview;
      try {
        // Invoke before awaiting so activation belongs to the original user gesture.
        await options.audio.ensureAudio();
        if (!disposed && generation === preview)
          options.audio.playSfx(tabletopGames[key].sample, key);
      } catch (error) {
        if (!disposed && generation === preview) (options.warn ?? console.warn)(error);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      preview++;
      for (const event of events) options.events.removeEventListener(event, refresh);
      listeners.clear();
    },
  };
}
export type TabletopAudio = ReturnType<typeof createTabletopAudio>;
