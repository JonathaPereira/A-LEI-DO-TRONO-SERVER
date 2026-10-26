export interface DesktopWindowPort {
  getWindowState(): Promise<unknown>;
  onWindowState(listener: (state: unknown) => void): (() => void) | void;
  toggleFullscreen(): Promise<unknown>;
}
interface WindowSnapshot {
  readonly fullscreen: boolean;
  readonly fullscreenPending: boolean;
  readonly fullscreenError: string | null;
}
function fullscreen(value: unknown): boolean | null {
  return value &&
    typeof value === 'object' &&
    'fullscreen' in value &&
    typeof value.fullscreen === 'boolean'
    ? value.fullscreen
    : null;
}
/** Owns the native window subscription and one pending IPC operation, independently of presentation. */
export function createDesktopWindow(native: DesktopWindowPort) {
  let state: WindowSnapshot = Object.freeze({
    fullscreen: false,
    fullscreenPending: false,
    fullscreenError: null,
  });
  let started = false,
    disposed = false,
    revision = 0,
    operation: Promise<void> | null = null;
  let release: (() => void) | void;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<WindowSnapshot>) => {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  };
  const apply = (value: unknown) => {
    const next = fullscreen(value);
    if (next === null) return false;
    update({ fullscreen: next, fullscreenError: null });
    return true;
  };
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      release = native.onWindowState((value) => {
        if (disposed || fullscreen(value) === null) return;
        revision++;
        apply(value);
      });
      const current = revision;
      void native
        .getWindowState()
        .then((value) => {
          if (!disposed && current === revision) apply(value);
        })
        .catch(() => {});
    },
    toggleFullscreen(): Promise<void> {
      if (!started || disposed) return Promise.resolve();
      if (operation) return operation;
      const current = revision;
      let finish!: () => void;
      operation = new Promise((resolve) => {
        finish = resolve;
      });
      const result = operation;
      update({ fullscreenPending: true, fullscreenError: null });
      void (async () => {
        try {
          const value = await native.toggleFullscreen();
          if (!disposed && current === revision && !apply(value))
            update({ fullscreenError: 'Não foi possível alterar a tela cheia.' });
        } catch {
          if (!disposed && current === revision)
            update({ fullscreenError: 'Não foi possível alterar a tela cheia.' });
        } finally {
          operation = null;
          update({ fullscreenPending: false });
          finish();
        }
      })();
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      release?.();
      listeners.clear();
    },
  };
}
export type DesktopWindow = ReturnType<typeof createDesktopWindow>;

interface Runtime extends Window {
  TronoDesktop?: DesktopWindowPort;
  TronoDesktopWindow?: DesktopWindow;
}
export function initializeDesktopWindow(target: Window) {
  const runtime = target as Runtime,
    native = runtime.TronoDesktop;
  if (
    runtime.TronoDesktopWindow ||
    !native ||
    typeof native.getWindowState !== 'function' ||
    typeof native.onWindowState !== 'function' ||
    typeof native.toggleFullscreen !== 'function'
  )
    return;
  const client = createDesktopWindow(native);
  runtime.TronoDesktopWindow = client;
  client.start();
  target.addEventListener(
    'pagehide',
    () => {
      client.dispose();
      if (runtime.TronoDesktopWindow === client) delete runtime.TronoDesktopWindow;
    },
    { once: true },
  );
}
