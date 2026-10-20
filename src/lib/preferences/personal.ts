interface PersonalOptions {
  account(): string | null;
  storage(): Pick<Storage, 'getItem' | 'setItem'>;
  changed(key: string): void;
}
/** Lazy account cache using the existing key. Reads never open or rewrite another account's preferences. */
export function createPersonalPreferences(options: PersonalOptions) {
  let owner: string | null = null;
  let values: Record<string, unknown> = Object.create(null);
  function current() {
    const id = options.account();
    if (id !== owner) {
      owner = id;
      values = Object.create(null);
      if (id) {
        try {
          const saved: unknown = JSON.parse(options.storage().getItem('mn-personal:' + id) || '{}');
          if (saved !== null && typeof saved === 'object' && !Array.isArray(saved))
            Object.assign(values, saved);
        } catch {}
      }
    }
    return values;
  }
  return {
    get(key: string, fallback?: unknown): unknown {
      return current()[key] ?? fallback;
    },
    set(key: string, value: unknown) {
      current();
      if (!owner) return;
      if (value === undefined) delete values[key];
      else values[key] = value;
      try {
        options.storage().setItem('mn-personal:' + owner, JSON.stringify(values));
      } catch {}
      options.changed(key);
    },
  };
}
export type PersonalPreferences = ReturnType<typeof createPersonalPreferences>;
