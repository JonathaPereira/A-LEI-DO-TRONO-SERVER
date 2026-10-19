export type GameDestination =
  'library' | 'throne' | 'azul' | 'roguelite' | 'splendor' | 'love-letter' | 'community' | 'home';
export const GAME_LINKS = Object.freeze([
  { id: 'library', label: 'Todos os jogos' },
  { id: 'throne', label: '♛ A Lei do Trono' },
  { id: 'azul', label: '✥ Azul' },
  { id: 'roguelite', label: '✦ Cinzas do Abismo' },
  { id: 'splendor', label: '◇ Splendor' },
  { id: 'love-letter', label: '✉ Love Letter' },
  { id: 'community', label: '🎙 Comunidade' },
] as const);
interface LibraryOptions {
  read(): GameDestination | null;
  subscribeSource(listener: () => void): () => void;
  navigate(destination: GameDestination): unknown;
  warn(error: unknown): void;
}
/** Navigation projection only. Game sessions, channel membership and media retain their owners. */
export function createGameLibrary(options: LibraryOptions) {
  let state = Object.freeze({ destination: options.read() }),
    disposed = false,
    started = false;
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined;
  function sync() {
    const destination = options.read();
    if (disposed || destination === state.destination) return;
    state = Object.freeze({ destination });
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      unsubscribe = options.subscribeSource(sync);
      sync();
    },
    async open(destination: GameDestination) {
      if (
        !started ||
        disposed ||
        ![...GAME_LINKS.map((link) => link.id), 'home'].includes(destination)
      )
        return;
      try {
        await options.navigate(destination);
        if (!disposed) sync();
      } catch (error) {
        if (!disposed) options.warn(error);
      }
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      listeners.clear();
    },
  };
}
export type GameLibrary = ReturnType<typeof createGameLibrary>;
