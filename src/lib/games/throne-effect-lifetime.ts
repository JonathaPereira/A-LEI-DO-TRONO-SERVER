export interface ThroneEffectTask {
  active(): boolean;
  wait(milliseconds: number): Promise<boolean>;
  own(cleanup: () => void): void;
  finish(): void;
}

/** Replacement invalidates old callbacks before releasing their timers and visual resources. */
export function createThroneEffectLifetime(
  schedule: (fn: () => void, ms: number) => () => void,
  warn: (error: unknown) => void,
) {
  const channels = new Map<string, () => void>();
  let disposed = false;
  function begin(key: string): ThroneEffectTask {
    channels.get(key)?.();
    let live = !disposed;
    const cleanup = new Set<() => void>();
    const stop = () => {
      if (!live) return;
      live = false;
      if (channels.get(key) === stop) channels.delete(key);
      const callbacks = [...cleanup];
      cleanup.clear();
      callbacks.reverse().forEach((fn) => {
        try {
          fn();
        } catch (error) {
          warn(error);
        }
      });
    };
    if (live) channels.set(key, stop);
    return {
      active: () => live,
      own(fn) {
        if (live) cleanup.add(fn);
        else fn();
      },
      finish: stop,
      wait(ms) {
        if (!live) return Promise.resolve(false);
        return new Promise<boolean>((resolve) => {
          const cancel = () => {
              release();
              resolve(false);
            },
            release = schedule(
              () => {
                cleanup.delete(cancel);
                resolve(live);
              },
              Math.max(0, ms),
            );
          cleanup.add(cancel);
        });
      },
    };
  }
  function clear() {
    [...channels.values()].forEach((stop) => stop());
  }
  return {
    begin,
    clear,
    dispose() {
      disposed = true;
      clear();
    },
  };
}
