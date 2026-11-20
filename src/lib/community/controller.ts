import type {
  CommunityIdentity,
  CommunitySnapshot,
  CommunityVoiceNotice,
} from '../../types/community';
import type { NetworkClient } from '../socket/client.ts';
import { readGamePresence, readPresence } from './protocol.ts';

interface CommunityOptions {
  network: Pick<NetworkClient, 'getSnapshot' | 'subscribe' | 'onMessage' | 'requestPresence'>;
  getIdentity(): CommunityIdentity | null;
  subscribeIdentity(listener: () => void): () => void;
  authenticate(identity: CommunityIdentity, current: () => boolean): Promise<boolean>;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => () => void;
  warn?: (error: unknown) => void;
}
const empty = Object.freeze([]);
export function createCommunity({
  network,
  getIdentity,
  subscribeIdentity,
  authenticate,
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
  let state: CommunitySnapshot = Object.freeze({
    identity: readIdentity(),
    presence: null,
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
      accepting = false;
      clearNotices();
      update({
        identity,
        presence: null,
        rooms: empty,
        open: false,
        activities: empty,
        notices: empty,
      });
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
      syncConnection();
      void requestPresence();
    },
    toggle(value = !state.open) {
      if (!disposed) update({ open: !!state.identity && value });
    },
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
      const notices = Object.freeze([...state.notices, item].slice(-3));
      for (const [key, cancel] of timers)
        if (!notices.some((notice) => notice.key === key)) {
          cancel();
          timers.delete(key);
        }
      update({ notices, activities: Object.freeze([item, ...state.activities].slice(0, 8)) });
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
