import type {
  CommunityIdentity,
  CommunitySnapshot,
  CommunityVoiceNotice,
} from '../../types/community';
import type { PresenceStatus } from '../../types/domain';
import type { NetworkClient } from '../socket/client.ts';
import { readGamePresence, readPresence } from './protocol.ts';

interface CommunityOptions {
  network: Pick<NetworkClient, 'getSnapshot' | 'subscribe' | 'onMessage' | 'requestPresence'> & {
    setPresenceStatus?(status: PresenceStatus): unknown;
  };
  getIdentity(): CommunityIdentity | null;
  subscribeIdentity(listener: () => void): () => void;
  authenticate(identity: CommunityIdentity, current: () => boolean): Promise<boolean>;
  preferences?: {
    get(key: string, fallback: unknown): unknown;
    set(key: string, value: unknown): void;
  };
  subscribePreferences?: (listener: (key: string) => void) => () => void;
  readDesktopStatus?: (accountId: string) => Promise<unknown>;
  syncDesktopStatus?: (accountId: string, status: PresenceStatus) => Promise<unknown> | unknown;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => () => void;
  warn?: (error: unknown) => void;
}
const empty = Object.freeze([]);
function normalizeStatus(value: unknown): PresenceStatus {
  return value === 'away' || value === 'dnd' ? value : 'online';
}
export function createCommunity({
  network,
  getIdentity,
  subscribeIdentity,
  authenticate,
  preferences,
  subscribePreferences,
  readDesktopStatus,
  syncDesktopStatus,
  now = Date.now,
  schedule = (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
  warn = (error) => console.warn('[Community]', error),
}: CommunityOptions) {
  function readIdentity() {
    const identity = getIdentity();
    return identity ? Object.freeze({ ...identity }) : null;
  }
  function readSavedStatus(identity: CommunityIdentity | null): PresenceStatus {
    if (!identity?.accountId || !preferences) return 'online';
    return normalizeStatus(preferences.get('presenceStatus', 'online'));
  }
  const initialIdentity = readIdentity();
  let state: CommunitySnapshot = Object.freeze({
    identity: initialIdentity,
    presence: null,
    presenceStatus: readSavedStatus(initialIdentity),
    rooms: empty,
    connected: network.getSnapshot().connected,
    open: false,
    activities: empty,
    notices: empty,
  });
  let started = false,
    disposed = false,
    generation = 0,
    requested = 0,
    authenticating = false,
    accepting = false,
    serial = 0;
  const listeners = new Set<() => void>(),
    seen = new Set<string>(),
    timers = new Map<number, () => void>();
  const cleanup: (() => void)[] = [];
  function update(patch: Partial<CommunitySnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function clearNotices() {
    for (const cancel of timers.values()) cancel();
    timers.clear();
    seen.clear();
  }
  function pushStatusToServer(identity: CommunityIdentity | null, status: PresenceStatus) {
    if (!identity?.accountId || !accepting || !state.connected) return;
    network.setPresenceStatus?.(status);
  }
  function hydrateDesktopStatus(identity: CommunityIdentity | null, epoch: number) {
    if (!identity?.accountId) return;
    const saved = readSavedStatus(identity);
    void Promise.resolve(syncDesktopStatus?.(identity.accountId, saved)).catch(() => {});
    if (!readDesktopStatus || preferences?.get('presenceStatus', undefined) !== undefined) return;
    void readDesktopStatus(identity.accountId)
      .then((value) => {
        if (disposed || epoch !== generation || state.identity?.accountId !== identity.accountId)
          return;
        if (value === 'online' || value === 'away' || value === 'dnd') {
          if (value !== state.presenceStatus) {
            preferences?.set('presenceStatus', value);
            update({ presenceStatus: value });
            pushStatusToServer(state.identity, value);
          }
        }
      })
      .catch(() => {});
  }
  /** One authentication drain; account changes invalidate work without opening another socket. */
  async function requestPresence() {
    requested++;
    if (authenticating || disposed || !started) return;
    authenticating = true;
    try {
      let handled = -1;
      while (!disposed && handled !== requested) {
        handled = requested;
        const identity = state.identity,
          epoch = generation;
        if (!identity) break;
        const current = () => !disposed && epoch === generation;
        try {
          if ((await authenticate(identity, current)) && current()) {
            accepting = true;
            if (identity.accountId) {
              const status = readSavedStatus(identity);
              if (status !== state.presenceStatus) update({ presenceStatus: status });
              network.setPresenceStatus?.(status);
            }
            network.requestPresence();
          }
        } catch (error) {
          if (current()) warn(error);
        }
      }
    } finally {
      authenticating = false;
    }
  }
  function identityChanged() {
    const identity = readIdentity();
    if (identity?.key !== state.identity?.key) {
      generation++;
      const epoch = generation;
      accepting = false;
      clearNotices();
      const presenceStatus = readSavedStatus(identity);
      update({
        identity,
        presence: null,
        presenceStatus,
        rooms: empty,
        open: false,
        activities: empty,
        notices: empty,
      });
      if (identity?.accountId) hydrateDesktopStatus(identity, epoch);
      else void Promise.resolve(syncDesktopStatus?.('', 'online')).catch(() => {});
      void requestPresence();
    } else update({ identity });
  }
  function syncConnection() {
    const connected = network.getSnapshot().connected;
    if (connected === state.connected) return;
    generation++;
    accepting = false;
    update({ connected });
    if (connected) void requestPresence();
  }
  function setPresenceStatus(value: PresenceStatus) {
    if (disposed || !state.identity?.accountId) return;
    const next = normalizeStatus(value);
    preferences?.set('presenceStatus', next);
    void Promise.resolve(syncDesktopStatus?.(state.identity.accountId, next)).catch(() => {});
    if (next === 'dnd' && state.notices.length) clearNotices();
    update({
      presenceStatus: next,
      ...(next === 'dnd' ? { notices: empty } : {}),
    });
    pushStatusToServer(state.identity, next);
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(
        network.subscribe(syncConnection),
        subscribeIdentity(identityChanged),
        ...(subscribePreferences
          ? [
              subscribePreferences((key) => {
                if (key !== 'presenceStatus' || disposed || !state.identity?.accountId) return;
                const next = readSavedStatus(state.identity);
                if (next !== state.presenceStatus) {
                  if (next === 'dnd') clearNotices();
                  update({
                    presenceStatus: next,
                    ...(next === 'dnd' ? { notices: empty } : {}),
                  });
                  void Promise.resolve(syncDesktopStatus?.(state.identity.accountId, next)).catch(
                    () => {},
                  );
                  pushStatusToServer(state.identity, next);
                }
              }),
            ]
          : []),
        network.onMessage((message) => {
          try {
            if (message.type === 'presence' && accepting && state.identity) {
              const presence = readPresence(message);
              if (presence.scope === (state.identity.accountId ? 'community' : 'game'))
                update({ presence });
            }
            if (
              (message.type === 'rooms' || message.type === 'welcome') &&
              message.rooms !== undefined
            )
              update({ rooms: readGamePresence(message.rooms) });
          } catch (error) {
            warn(error);
          }
        }),
      );
      identityChanged();
      if (state.identity?.accountId) hydrateDesktopStatus(state.identity, generation);
      syncConnection();
      void requestPresence();
    },
    toggle(value = !state.open) {
      if (!disposed) update({ open: !!state.identity && value });
    },
    setPresenceStatus,
    voiceNotice(event: CommunityVoiceNotice) {
      if (disposed || !state.identity || (event.id && seen.has(event.id))) return;
      if (event.id) {
        seen.add(event.id);
        if (seen.size > 200) seen.delete(seen.values().next().value!);
      }
      const action =
        event.kind === 'joined'
          ? 'entrou na chamada'
          : event.kind === 'disconnected'
            ? 'foi desconectado da chamada'
            : 'saiu da chamada';
      const item = Object.freeze({
        key: ++serial,
        kind: event.kind,
        text: event.text || `${event.name || 'Participante'} ${action}.`,
        at: now(),
      });
      const activities = Object.freeze([item, ...state.activities].slice(0, 8));
      if (state.presenceStatus === 'dnd') {
        update({ activities });
        return;
      }
      const notices = Object.freeze([...state.notices, item].slice(-3));
      for (const [key, cancel] of timers)
        if (!notices.some((notice) => notice.key === key)) {
          cancel();
          timers.delete(key);
        }
      update({ notices, activities });
      timers.set(
        item.key,
        schedule(() => {
          timers.delete(item.key);
          update({
            notices: Object.freeze(state.notices.filter((notice) => notice.key !== item.key)),
          });
        }, 8000),
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      accepting = false;
      cleanup.forEach((remove) => remove());
      clearNotices();
      listeners.clear();
    },
  };
}
export type CommunityController = ReturnType<typeof createCommunity>;
