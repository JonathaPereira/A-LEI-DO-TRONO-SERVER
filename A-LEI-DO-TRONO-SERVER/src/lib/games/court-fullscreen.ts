/** The desktop window controller is the only owner of native IPC and window events. */
export interface CourtNativeFullscreen {
  getSnapshot(): {
    readonly fullscreen: boolean;
    readonly fullscreenPending: boolean;
    readonly fullscreenError: string | null;
  };
  subscribe(fn: () => void): () => void;
  toggleFullscreen(): Promise<void>;
}
interface Options {
  read(): { playing: boolean; rootFullscreen: boolean; hasFullscreen: boolean };
  subscribeSource(fn: () => void): () => void;
  requestDocument(): Promise<void>;
  exitDocument(): Promise<void>;
  native?: CourtNativeFullscreen;
}
interface Snapshot {
  readonly fullscreen: boolean;
  readonly active: boolean;
  readonly pending: boolean;
  readonly title: string;
}
interface DocumentClaim {
  cancelled: boolean;
  seen: boolean;
  released: boolean;
  exit: Promise<void> | null;
}
const title = 'Tela cheia nativa';
const failure = 'Não foi possível entrar em tela cheia. No navegador, tente F11.';
/** Owns only the court's web fullscreen claim and view; never captures, moves or stops media. */
export function createCourtFullscreen(options: Options) {
  let state: Snapshot = Object.freeze({ fullscreen: false, active: false, pending: false, title });
  let started = false,
    disposed = false,
    error: string | null = null;
  let operation: Promise<void> | null = null,
    claim: DocumentClaim | null = null;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function release(owned: DocumentClaim) {
    if (owned.released || !owned.cancelled || !options.read().rootFullscreen) return;
    owned.released = true;
    // Mark before invoking: fullscreenchange may run synchronously in an adapter.
    owned.exit = (async () => {
      try {
        await options.exitDocument();
      } catch {
        /* A refused automatic exit must not become an unhandled rejection. */
      }
    })();
  }
  function sync() {
    const source = options.read();
    if (claim) {
      if (!source.playing || disposed) claim.cancelled = true;
      if (source.rootFullscreen) claim.seen = true;
      else if (claim.seen) claim.released = true;
      release(claim);
    }
    if (disposed) return;
    const native = options.native?.getSnapshot();
    const fullscreen = !!native?.fullscreen || source.rootFullscreen;
    const next: Snapshot = {
      fullscreen,
      active: source.playing && fullscreen,
      pending: !!operation || !!native?.fullscreenPending,
      title: error ?? native?.fullscreenError ?? title,
    };
    if (
      next.fullscreen === state.fullscreen &&
      next.active === state.active &&
      next.pending === state.pending &&
      next.title === state.title
    )
      return;
    state = Object.freeze(next);
    listeners.forEach((fn) => fn());
  }
  function toggle(): Promise<void> {
    if (!started || disposed || !options.read().playing) return Promise.resolve();
    if (options.native) return options.native.toggleFullscreen();
    if (operation) return operation;
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    operation = done;
    error = null;
    const entering = !options.read().hasFullscreen;
    const owned: DocumentClaim | null = entering
      ? { cancelled: false, seen: false, released: false, exit: null }
      : null;
    if (owned) claim = owned;
    sync();
    void (async () => {
      try {
        if (disposed || !options.read().playing) {
          if (owned) owned.released = true;
          return;
        }
        // Invoke before the first await so requestFullscreen retains the click's user activation.
        await (entering ? options.requestDocument() : options.exitDocument());
        sync();
        if (owned?.exit) await owned.exit;
      } catch {
        if (owned) {
          owned.released = true;
          if (claim === owned) claim = null;
        }
        if (!disposed) error = failure;
      } finally {
        operation = null;
        sync();
        if (claim?.released) claim = null;
        finish();
      }
    })();
    return done;
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    toggle,
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(options.subscribeSource(sync));
      if (options.native) cleanup.push(options.native.subscribe(sync));
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (claim) {
        claim.cancelled = true;
        release(claim);
      }
      cleanup.splice(0).forEach((off) => off());
      listeners.clear();
    },
  };
}
export type CourtFullscreen = ReturnType<typeof createCourtFullscreen>;
