/**
 * Pure registry for lazy game initializers.
 * Attaches getters to a target Window so games only allocate memory,
 * roots, observers, and controllers on first access or selection.
 */
export interface LazyRegistry<T extends string> {
  register(name: T, initializer: (target: Window) => void | (() => void)): void;
  isInitialized(target: Window, name: T): boolean;
  ensureInitialized(target: Window, name: T): void;
  install(target: Window): () => void;
}

export function createLazyRegistry<T extends string>(): LazyRegistry<T> {
  const initializers = new Map<T, (target: Window) => void | (() => void)>();
  const initializedByTarget = new WeakMap<Window, Set<T>>();

  return {
    register(name: T, initializer: (target: Window) => void | (() => void)) {
      initializers.set(name, initializer);
    },

    isInitialized(target: Window, name: T): boolean {
      return initializedByTarget.get(target)?.has(name) ?? false;
    },

    ensureInitialized(target: Window, name: T): void {
      let set = initializedByTarget.get(target);
      if (!set) {
        set = new Set();
        initializedByTarget.set(target, set);
      }
      if (!set.has(name)) {
        set.add(name);
        const initFn = initializers.get(name);
        if (initFn) {
          initFn(target);
        }
      }
    },

    install(target: Window): () => void {
      let set = initializedByTarget.get(target);
      if (!set) {
        set = new Set();
        initializedByTarget.set(target, set);
      }

      const values = new Map<T, unknown>();

      for (const [name, initFn] of initializers) {
        Object.defineProperty(target, name, {
          configurable: true,
          enumerable: true,
          get() {
            if (!set!.has(name)) {
              set!.add(name);
              initFn(target);
            }
            return values.get(name);
          },
          set(val: unknown) {
            values.set(name, val);
          },
        });
      }

      return () => {
        for (const name of initializers.keys()) {
          delete (target as unknown as Record<string, unknown>)[name];
        }
      };
    },
  };
}
