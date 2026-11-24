import type {
  CommunityIdentity,
  CommunitySnapshot,
  CommunityVoiceNotice,
} from '../../types/community';
import type { PresenceStatus } from '../../types/domain';
import type { NetworkClient } from '../socket/client.ts';
import { readGamePresence, readPresence } from './protocol.ts';

export const DEFAULT_AUTO_AWAY_MS = 10 * 60 * 1000;

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
  autoAwayMs?: number;
  isVoiceActiveUnmuted?: () => boolean;
  subscribeVoiceState?: (listener: () => void) => () => void;
  subscribeInteraction?: (listener: () => void) => () => void;
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
  autoAwayMs: autoAwayMsOption,
  isVoiceActiveUnmuted = () => false,
  subscribeVoiceState,
  subscribeInteraction,
  now = Date.now,
  schedule = (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
  warn = (error) => console.warn('[Community]', error),
}: CommunityOptions) {
  const autoAwayMs = autoAwayMsOption ?? DEFAULT_AUTO_AWAY_MS;
  const autoAwayEnabled =
    (subscribeInteraction !== undefined || autoAwayMsOption !== undefined) && autoAwayMs > 0;
  function readIdentity() {
    const identity = getIdentity();
    return identity ? Object.freeze({ ...identity }) : null;
  }
  function readSavedStatus(identity: CommunityIdentity | null): PresenceStatus {
    if (!identity?.accountId || !preferences) return 'online';
    return normalizeStatus(preferences.get('presenceStatus', 'online'));
  }
  const initialIdentity = readIdentity();
  let manualStatus: PresenceStatus = readSavedStatus(initialIdentity);
  let autoAway = false;
  let lastInteractionAt = now();
  let wasUnmutedInCall = false;
  let idleCancel: (() => void) | null = null;
  let state: CommunitySnapshot = Object.freeze({
    identity: initialIdentity,
    presence: null,
    presenceStatus: manualStatus,
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
  function effectiveStatus(): PresenceStatus {
    return manualStatus === 'online' && autoAway ? 'away' : manualStatus;
  }
  function clearIdleTimer() {
    if (idleCancel) {
      idleCancel();
      idleCancel = null;
    }
  }
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
  function applyEffectiveStatus(push = true) {
    const next = effectiveStatus();
    if (next === state.presenceStatus) return;
    update({ presenceStatus: next });
    if (push) pushStatusToServer(state.identity, next);
  }
  function syncAutoAway() {
    clearIdleTimer();
    if (
      disposed ||
      !started ||
      !autoAwayEnabled ||
      !state.identity?.accountId ||
      manualStatus !== 'online'
    ) {
      autoAway = false;
      applyEffectiveStatus(true);
      return;
    }
    const activeUnmuted = !!isVoiceActiveUnmuted();
    if (activeUnmuted) {
      wasUnmutedInCall = true;
      lastInteractionAt = now();
      if (autoAway) {
        autoAway = false;
        applyEffectiveStatus(true);
      }
      return;
    }
    if (wasUnmutedInCall) {
      wasUnmutedInCall = false;
      lastInteractionAt = now();
    }
    if (autoAway) return;
    const elapsed = Math.max(0, now() - lastInteractionAt);
    const remaining = Math.max(0, autoAwayMs - elapsed);
    if (remaining === 0) {
      autoAway = true;
      applyEffectiveStatus(true);
      return;
    }
    idleCancel = schedule(() => {
      idleCancel = null;
      if (disposed || !started || !state.identity?.accountId || manualStatus !== 'online') return;
      if (isVoiceActiveUnmuted()) {
        wasUnmutedInCall = true;
        lastInteractionAt = now();
        return;
      }
      const checkElapsed = Math.max(0, now() - lastInteractionAt);
      if (checkElapsed >= autoAwayMs) {
        autoAway = true;
        applyEffectiveStatus(true);
      } else {
        syncAutoAway();
      }
    }, remaining);
  }
  function recordInteraction() {
    if (disposed || !started) return;
    lastInteractionAt = now();
    if (manualStatus !== 'online') return;
    if (autoAway) {
      autoAway = false;
      applyEffectiveStatus(true);
    }
    syncAutoAway();
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
          if (value !== manualStatus) {
            manualStatus = value;
            autoAway = false;
            preferences?.set('presenceStatus', value);
            applyEffectiveStatus(true);
            syncAutoAway();
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
              manualStatus = readSavedStatus(identity);
              if (manualStatus !== 'online') autoAway = false;
              const status = effectiveStatus();
              if (status !== state.presenceStatus) update({ presenceStatus: status });
              network.setPresenceStatus?.(status);
              syncAutoAway();
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
      clearIdleTimer();
      autoAway = false;
      lastInteractionAt = now();
      wasUnmutedInCall = !!isVoiceActiveUnmuted();
      manualStatus = readSavedStatus(identity);
      update({
        identity,
        presence: null,
        presenceStatus: manualStatus,
        rooms: empty,
        open: false,
        activities: empty,
        notices: empty,
      });
      if (identity?.accountId) hydrateDesktopStatus(identity, epoch);
      else void Promise.resolve(syncDesktopStatus?.('', 'online')).catch(() => {});
      syncAutoAway();
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
    manualStatus = next;
    autoAway = false;
    lastInteractionAt = now();
    preferences?.set('presenceStatus', next);
    void Promise.resolve(syncDesktopStatus?.(state.identity.accountId, next)).catch(() => {});
    if (next === 'dnd' && state.notices.length) clearNotices();
    update({
      presenceStatus: next,
      ...(next === 'dnd' ? { notices: empty } : {}),
    });
    pushStatusToServer(state.identity, next);
    syncAutoAway();
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
      lastInteractionAt = now();
      wasUnmutedInCall = !!isVoiceActiveUnmuted();
      cleanup.push(
        network.subscribe(syncConnection),
        subscribeIdentity(identityChanged),
        ...(subscribeVoiceState ? [subscribeVoiceState(() => syncAutoAway())] : []),
        ...(subscribeInteraction ? [subscribeInteraction(recordInteraction)] : []),
        ...(subscribePreferences
          ? [
              subscribePreferences((key) => {
                if (key !== 'presenceStatus' || disposed || !state.identity?.accountId) return;
                const next = readSavedStatus(state.identity);
                manualStatus = next;
                autoAway = false;
                lastInteractionAt = now();
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
                syncAutoAway();
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
      syncAutoAway();
      void requestPresence();
    },
    toggle(value = !state.open) {
      if (!disposed) update({ open: !!state.identity && value });
    },
    setPresenceStatus,
    recordInteraction,
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
      autoAway = false;
      clearIdleTimer();
      cleanup.forEach((remove) => remove());
      clearNotices();
      listeners.clear();
    },
  };
}
export type CommunityController = ReturnType<typeof createCommunity>;
