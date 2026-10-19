export type ThroneSpeed = 1 | 0.38 | 1.65 | 0.05;
export interface ThroneControlsSnapshot {
  readonly mode: 'local' | 'online' | null;
  readonly scale: ThroneSpeed;
  readonly rulesOpen: boolean;
  readonly leaving: boolean;
}
interface Options {
  source(): { key: string; mode: ThroneControlsSnapshot['mode'] };
  subscribeSource(fn: () => void): () => void;
  confirmLeave(): boolean | Promise<boolean>;
  leave(): void;
  openManual(): unknown;
  warn(error: unknown): void;
}
/** Owns table controls only; match, lobby, audio and media keep their existing owners. */
export function createThroneControls(options: Options) {
  let state: ThroneControlsSnapshot = Object.freeze({
    mode: null,
    scale: 1,
    rulesOpen: false,
    leaving: false,
  });
  let key: string | null = null,
    epoch = 0,
    disposed = false;
  let release: (() => void) | null = null;
  const listeners = new Set<() => void>();
  function update(patch: Partial<ThroneControlsSnapshot>) {
    if (disposed) return;
    const next = { ...state, ...patch };
    if (
      next.mode === state.mode &&
      next.scale === state.scale &&
      next.rulesOpen === state.rulesOpen &&
      next.leaving === state.leaving
    )
      return;
    state = Object.freeze(next);
    listeners.forEach((fn) => fn());
  }
  function sync() {
    if (disposed) return;
    const source = options.source();
    if (source.key === key && source.mode === state.mode) return;
    key = source.key;
    epoch++;
    update({
      mode: source.mode,
      rulesOpen: false,
      leaving: false,
      ...(source.mode === 'online' ? { scale: 1 } : {}),
    });
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    cycleSpeed() {
      sync();
      if (disposed || state.mode === 'online') return;
      update({ scale: state.scale === 1 ? 0.38 : state.scale === 0.38 ? 1.65 : 1 });
    },
    /** Existing simulation-test bridge; never changes authoritative online timing. */
    setFast() {
      sync();
      if (!disposed && state.mode !== 'online') update({ scale: 0.05 });
    },
    rules(open: boolean) {
      sync();
      update({ rulesOpen: open });
    },
    openManual() {
      if (disposed) return;
      const offered = epoch;
      const report = (error: unknown) => {
        sync();
        if (!disposed && offered === epoch) options.warn(error);
      };
      try {
        // Invoke synchronously so window.open retains the user's activation.
        void Promise.resolve(options.openManual()).catch(report);
      } catch (error) {
        report(error);
      }
    },
    async leave() {
      sync();
      if (disposed || !state.mode || state.leaving) return;
      const offered = epoch;
      update({ leaving: true });
      try {
        const confirmed = await options.confirmLeave();
        sync();
        if (!disposed && offered === epoch && confirmed) options.leave();
      } catch (error) {
        sync();
        if (!disposed && offered === epoch) options.warn(error);
      } finally {
        if (offered === epoch) update({ leaving: false });
      }
    },
    start() {
      if (disposed || release) return;
      sync();
      release = options.subscribeSource(sync);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      release?.();
      release = null;
      listeners.clear();
      state = Object.freeze({ mode: null, scale: 1, rulesOpen: false, leaving: false });
    },
  };
}
export type ThroneControls = ReturnType<typeof createThroneControls>;
