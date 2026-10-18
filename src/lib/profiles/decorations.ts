import type { MemberProfile } from '../../types/profiles';
import type { ProfilesClient } from './client';

interface DecorationEntry {
  profile: MemberProfile | null;
  expires: number;
  controller: AbortController | null;
  pending: Promise<void> | null;
}
export interface ProfileDecorationsOptions {
  profiles: Pick<ProfilesClient, 'readProfile' | 'getSnapshot' | 'subscribe'>;
  now?(): number;
}

/** Shared presentation cache only. The profiles/files clients retain transport and identity ownership. */
export function createProfileDecorations({ profiles, now = Date.now }: ProfileDecorationsOptions) {
  const entries = new Map<string, DecorationEntry>();
  const listeners = new Map<string, Set<() => void>>();
  let source = profiles.getSnapshot(),
    disposed = false;
  function notify(id: string) {
    for (const listener of listeners.get(id) ?? []) listener();
  }
  function current(id: string, entry: DecorationEntry) {
    return !disposed && !!source.accountId && entries.get(id) === entry;
  }
  function load(id: string): Promise<void> {
    if (disposed || !id || !source.accountId) return Promise.resolve();
    const cached = entries.get(id);
    if (cached?.pending) return cached.pending;
    if (cached && cached.expires > now()) return Promise.resolve();
    // Prune inactive expired entries when used, without keeping a timer alive per profile.
    for (const [key, entry] of entries) {
      if (!listeners.has(key) && !entry.pending && entry.expires <= now()) entries.delete(key);
    }
    const controller = new AbortController();
    const entry: DecorationEntry = {
      profile: null,
      expires: now() + 60000,
      controller,
      pending: null,
    };
    entries.set(id, entry);
    // Start after publishing the entry so even synchronous failures obey the same generation check.
    entry.pending = Promise.resolve()
      .then(() => {
        if (!current(id, entry)) return null;
        return profiles.readProfile(id, { signal: controller.signal });
      })
      .then(
        (profile) => {
          if (current(id, entry)) entry.profile = profile;
        },
        () => {
          // Decorations are optional; failed reads remain empty for the same 60-second cache lifetime.
        },
      )
      .finally(() => {
        if (!current(id, entry)) return;
        entry.pending = null;
        entry.controller = null;
        notify(id);
      });
    notify(id);
    return entry.pending;
  }
  function invalidate(id: string) {
    entries.get(id)?.controller?.abort();
    entries.delete(id);
    if (listeners.has(id)) void load(id);
    notify(id);
  }
  const unsubscribe = profiles.subscribe(() => {
    const next = profiles.getSnapshot(),
      previous = source;
    source = next;
    if (source.epoch !== previous.epoch) {
      for (const entry of entries.values()) entry.controller?.abort();
      entries.clear();
      for (const id of listeners.keys()) {
        if (source.accountId) void load(id);
        notify(id);
      }
    } else if (source.revision !== previous.revision && source.profileId)
      invalidate(source.profileId);
  });
  return {
    load,
    getSnapshot(id: string): MemberProfile | null {
      return disposed || !source.accountId ? null : (entries.get(id)?.profile ?? null);
    },
    subscribe(id: string, listener: () => void) {
      if (disposed || !id) return () => {};
      const subscribers = listeners.get(id) ?? new Set<() => void>();
      subscribers.add(listener);
      listeners.set(id, subscribers);
      return () => {
        subscribers.delete(listener);
        if (subscribers.size) return;
        listeners.delete(id);
        const entry = entries.get(id);
        if (entry?.pending) {
          entry.controller?.abort();
          entries.delete(id);
        }
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      for (const entry of entries.values()) entry.controller?.abort();
      entries.clear();
      for (const id of listeners.keys()) notify(id);
      listeners.clear();
    },
  };
}
export type ProfileDecorations = ReturnType<typeof createProfileDecorations>;
