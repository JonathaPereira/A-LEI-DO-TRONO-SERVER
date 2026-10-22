export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Retains writes in memory when storage is blocked, unavailable or full. */
export function createPreferenceStorage(persistent: () => PreferenceStorage): PreferenceStorage {
  const memory = new Map<string, string | null>();
  let storage: PreferenceStorage | undefined;
  try {
    storage = persistent();
  } catch {
    /* Private contexts can deny even the getter. */
  }
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key) ?? null;
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      memory.set(key, String(value));
      try {
        storage?.setItem(key, String(value));
      } catch {
        /* Keep the in-memory value. */
      }
    },
    removeItem(key) {
      memory.set(key, null);
      try {
        storage?.removeItem(key);
      } catch {
        /* Keep the tombstone. */
      }
    },
  };
}
