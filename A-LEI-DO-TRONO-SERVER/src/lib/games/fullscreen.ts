interface Options {
  visible(): boolean;
  owned(): boolean;
  enter(): Promise<void>;
  exit(): Promise<void>;
}
interface FullscreenSnapshot {
  readonly active: boolean;
  readonly immersive: boolean;
  readonly pending: boolean;
}
/** Owns one game's fullscreen gesture and fallback, never another media surface. */
export function createGameFullscreen(options: Options) {
  let state: FullscreenSnapshot = Object.freeze({
    active: false,
    immersive: false,
    pending: false,
  });
  let version = 0,
    disposed = false;
  const listeners = new Set<() => void>();
  function update(patch: Partial<typeof state>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  }
  function leave() {
    version++;
    update({ active: false, immersive: false, pending: false });
    if (options.owned()) void options.exit().catch(() => {});
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    sync() {
      if (!options.visible()) leave();
      else update({ active: state.immersive || options.owned() });
    },
    escape() {
      if (state.immersive) {
        version++;
        update({ immersive: false, active: options.owned(), pending: false });
      }
    },
    leave,
    async toggle() {
      if (disposed || !options.visible() || state.pending) return;
      const operation = ++version;
      update({ pending: true });
      try {
        if (state.immersive || options.owned()) {
          update({ immersive: false });
          if (options.owned()) await options.exit().catch(() => {});
        } else {
          try {
            await options.enter();
          } catch {
            if (!disposed && operation === version && options.visible())
              update({ immersive: true });
          }
        }
        if ((disposed || operation !== version || !options.visible()) && options.owned())
          await options.exit().catch(() => {});
      } finally {
        if (!disposed && operation === version)
          update({ pending: false, active: state.immersive || options.owned() });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      version++;
      if (options.owned()) void options.exit().catch(() => {});
      listeners.clear();
    },
  };
}
export type GameFullscreen = ReturnType<typeof createGameFullscreen>;
