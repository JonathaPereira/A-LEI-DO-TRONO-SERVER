import type { ProfileViewerSnapshot } from '../../types/profiles';
import type { ProfilesClient } from './client';
import { profileId, record } from './protocol.ts';

export const EMPTY_PROFILE_VIEWER: ProfileViewerSnapshot = Object.freeze({
  open: false,
  full: false,
  loading: false,
  profile: null,
  message: '',
  canMessage: false,
});
interface ProfileViewerOptions {
  client: ProfilesClient;
  openMessage(id: string): unknown;
  warn?(error: unknown): void;
}
/** Owns one open member view. Closing or changing identity invalidates every pending response. */
export function createProfileViewer({ client, openMessage, warn }: ProfileViewerOptions) {
  let state = EMPTY_PROFILE_VIEWER,
    disposed = false,
    sequence = 0;
  let currentId: string | null = null,
    controller: AbortController | null = null;
  let clientEpoch = client.getSnapshot().epoch,
    revision = client.getSnapshot().revision;
  const listeners = new Set<() => void>();
  function update(patch: Partial<ProfileViewerSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        warn?.(error);
      }
    }
  }
  function close() {
    sequence++;
    controller?.abort();
    controller = null;
    currentId = null;
    update(EMPTY_PROFILE_VIEWER);
  }
  async function open(person: unknown, { full = false }: { full?: boolean } = {}): Promise<void> {
    if (disposed || !client.getSnapshot().accountId) return;
    const value =
      typeof person === 'string' ? person : record(person) ? person.accountId || person.id : null;
    let id: string;
    try {
      id = profileId(value);
    } catch {
      return;
    }
    const operation = ++sequence;
    controller?.abort();
    controller = new AbortController();
    currentId = id;
    update({ open: true, full, loading: true, profile: null, message: '', canMessage: false });
    try {
      const profile = await client.readProfile(id, { signal: controller.signal });
      if (disposed || operation !== sequence || !state.open) return;
      update({ loading: false, profile, canMessage: id !== client.getSnapshot().accountId });
    } catch (error) {
      if (disposed || operation !== sequence || !state.open) return;
      update({
        loading: false,
        message: error instanceof Error ? error.message : 'Não foi possível carregar o perfil.',
      });
    }
  }
  const unsubscribeClient = client.subscribe(() => {
    const next = client.getSnapshot();
    if (next.epoch !== clientEpoch) {
      clientEpoch = next.epoch;
      revision = next.revision;
      close();
      return;
    }
    if (next.revision !== revision) {
      revision = next.revision;
      if (state.open && currentId && next.profileId === currentId)
        void open(currentId, { full: state.full });
    }
  });
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open,
    close,
    expand() {
      if (state.open) update({ full: true });
    },
    message() {
      if (
        disposed ||
        !state.open ||
        !state.canMessage ||
        !state.profile ||
        !client.getSnapshot().accountId
      )
        return;
      const id = state.profile.id;
      close();
      try {
        void Promise.resolve(openMessage(id)).catch((error: unknown) => warn?.(error));
      } catch (error) {
        warn?.(error);
      }
    },
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
      unsubscribeClient();
      listeners.clear();
    },
  };
}
export type ProfileViewer = ReturnType<typeof createProfileViewer>;
