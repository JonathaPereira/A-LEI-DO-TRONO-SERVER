import type { AuthAccount, AuthSession, AuthSessionData } from '../../types/auth';
import type { GuestIdentity } from '../../types/network';
import type { ProfileUpdate } from '../../types/profile-editor';
import type { PreferenceStorage } from '../storage/preferences';
import type { AuthRequest } from './api';
import { AuthError } from './api.ts';
import { readAuthAccount, readSessionData, readGuestIdentity } from './protocol.ts';

export interface SessionSnapshot {
  readonly user: AuthAccount | null;
  readonly guest: GuestIdentity | null;
  readonly remembered: boolean;
  readonly rememberError: string;
  readonly epoch: number;
}
interface Options {
  api: AuthRequest;
  storage: PreferenceStorage;
  preferences: PreferenceStorage;
  native?: {
    readSession(): Promise<unknown>;
    saveSession(value: AuthSessionData | null): Promise<unknown>;
  };
  authenticate(token: string): Promise<unknown>;
  authenticateGuest(name: string, ticket?: string): Promise<unknown>;
  disconnect(): void;
  leaveIdentity(): Promise<void>;
  showPortal(): void;
  needLogin(message?: string): void;
  needGuest(): void;
  guestRestored?(): void;
  offline(): void;
  changed(snapshot: SessionSnapshot, roleOnly: boolean): void;
  now?(): number;
  setTimer?(fn: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  clearTimer?(timer: ReturnType<typeof setTimeout>): void;
  warn?(error: unknown): void;
}
const KEY = 'mn-auth-session-v1',
  GUEST = 'mn-guest-v1';
const aborted = () => new DOMException('A identidade foi alterada.', 'AbortError');
const status = (error: unknown) =>
  error instanceof Error && 'status' in error ? error.status : null;
function awaitCurrent<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      action();
    };
    const abort = () => finish(() => reject(signal.reason ?? aborted()));
    signal.addEventListener('abort', abort, { once: true });
    void pending.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal.aborted) abort();
  });
}
/** Owns credentials, renewal, guest tickets and encrypted native persistence; snapshots never contain tokens. */
export function createAccountSession(options: Options) {
  const now = options.now ?? Date.now,
    setTimer = options.setTimer ?? setTimeout,
    clearTimer = options.clearTimer ?? clearTimeout;
  const listeners = new Set<() => void>();
  let remembered = !!options.native;
  try {
    if (options.native) remembered = options.preferences.getItem('mn-remember-me') !== '0';
  } catch {
    /* Keep the desktop default. */
  }
  let state: SessionSnapshot = Object.freeze({
    user: null,
    guest: null,
    remembered,
    rememberError: '',
    epoch: 0,
  });
  let credentials: AuthSession | null = null,
    disposed = false,
    started = false,
    failures = 0;
  let roleRevision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined,
    scope = new AbortController();
  let transition = new AbortController(),
    transitionVersion = 0;
  let refreshPending: Promise<string | null> | null = null,
    persistence = Promise.resolve(),
    persistVersion = 0;
  let leaving: Promise<void> | null = null;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  function update(patch: Partial<SessionSnapshot>, roleOnly = false) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
    options.changed(state, roleOnly);
  }
  function stopTimer() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  }
  function beginTransition() {
    transition.abort(aborted());
    transition = new AbortController();
    transitionVersion++;
    return transitionVersion;
  }
  function changeActor() {
    scope.abort(aborted());
    scope = new AbortController();
    stopTimer();
    refreshPending = null;
    update({ epoch: state.epoch + 1 });
  }
  function invalidate() {
    beginTransition();
    changeActor();
  }
  function leaveIdentity(): Promise<void> {
    if (leaving) return leaving;
    const pending = options.leaveIdentity().catch((error) => options.warn?.(error));
    leaving = pending;
    void pending
      .finally(() => {
        if (leaving === pending) leaving = null;
      })
      .catch(() => {});
    return pending;
  }
  function rememberSession(): Promise<void> {
    if (!options.native) return Promise.resolve();
    const version = ++persistVersion;
    const value =
      state.remembered && credentials && state.user
        ? {
            session: { ...credentials },
            user: { ...state.user, permissions: { ...state.user.permissions } },
          }
        : null;
    persistence = persistence
      .catch(() => {})
      .then(() => options.native!.saveSession(value))
      .then((result) => {
        if (!disposed && version === persistVersion)
          update({
            rememberError:
              result &&
              typeof result === 'object' &&
              'error' in result &&
              typeof result.error === 'string'
                ? result.error
                : '',
          });
      })
      .catch(() => {
        if (!disposed && version === persistVersion)
          update({ rememberError: 'Não foi possível lembrar sua conta neste computador.' });
      });
    return persistence;
  }
  function saveTab() {
    try {
      if (credentials && state.user)
        options.storage.setItem(KEY, JSON.stringify({ session: credentials, user: state.user }));
      else options.storage.removeItem(KEY);
    } catch {
      /* In-memory identity remains valid. */
    }
  }
  function schedule() {
    stopTimer();
    if (!credentials || disposed) return;
    const delay = Math.max(1000, credentials.expires_at * 1000 - now() - 60000);
    timer = setTimer(
      () => {
        void refresh().catch(() => {});
      },
      Math.min(delay, 2147483647),
    );
  }
  function apply(data: AuthSessionData, expectedRole?: number) {
    if (disposed) throw aborted();
    const user =
      expectedRole !== undefined && expectedRole !== roleRevision && state.user?.id === data.user.id
        ? Object.freeze({
            ...data.user,
            role: state.user.role,
            permissions: state.user.permissions,
          })
        : data.user;
    if (state.user?.id !== data.user.id || state.guest) changeActor();
    credentials = data.session;
    failures = 0;
    try {
      options.storage.removeItem(GUEST);
    } catch {
      /* Optional tab storage. */
    }
    update({ user, guest: null });
    saveTab();
    schedule();
    void rememberSession();
    resolveReady();
  }
  function clear() {
    if (disposed) return;
    invalidate();
    credentials = null;
    saveTab();
    update({ user: null });
    void rememberSession();
  }
  function expire() {
    if (disposed) return;
    clear();
    options.disconnect();
    void leaveIdentity();
    options.showPortal();
    options.needLogin('Sua sessão expirou. Entre novamente.');
  }
  function refresh(): Promise<string | null> {
    if (refreshPending) return refreshPending;
    if (!credentials || disposed) return Promise.resolve(null);
    const expectedRole = roleRevision,
      prior = credentials.refresh_token,
      epoch = state.epoch,
      signal = scope.signal;
    const pending = (async () => {
      try {
        const data = readSessionData(
          await options.api('refresh', { refresh_token: prior }, null, 'POST', signal),
        );
        if (
          disposed ||
          signal.aborted ||
          epoch !== state.epoch ||
          credentials?.refresh_token !== prior
        )
          return null;
        if (data.user.id !== state.user?.id)
          throw new AuthError('A renovação retornou outra conta.', 'ACCOUNT_MISMATCH', 401);
        apply(data, expectedRole);
        await options.authenticate(data.session.access_token);
        return !disposed && epoch === state.epoch ? data.session.access_token : null;
      } catch (error) {
        if (
          disposed ||
          signal.aborted ||
          epoch !== state.epoch ||
          credentials?.refresh_token !== prior
        )
          throw error;
        if (status(error) === 401 || status(error) === 403) expire();
        else {
          failures++;
          stopTimer();
          timer = setTimer(
            () => {
              void refresh().catch(() => {});
            },
            Math.min(30000 * failures, 120000),
          );
        }
        throw error;
      }
    })();
    refreshPending = pending;
    void pending
      .finally(() => {
        if (refreshPending === pending) refreshPending = null;
      })
      .catch(() => {});
    return pending;
  }
  function setGuest(value: unknown) {
    const guest = readGuestIdentity(value);
    if (guest.expiresAt <= now()) throw Error('A sessão de convidado expirou.');
    if (state.user || state.guest?.id !== guest.id) changeActor();
    update({ guest, user: null });
    credentials = null;
    saveTab();
    try {
      options.storage.setItem(GUEST, JSON.stringify(guest));
    } catch {
      /* Optional tab storage. */
    }
    resolveReady();
  }
  async function start(callback?: () => Promise<boolean>) {
    if (started || disposed) return;
    started = true;
    const version = transitionVersion,
      signal = transition.signal;
    try {
      if (callback && (await callback())) return;
      if (disposed || version !== transitionVersion) return;
      let saved: unknown;
      try {
        saved = JSON.parse(options.storage.getItem(KEY) || 'null');
      } catch {
        /* Invalid cache. */
      }
      let data: AuthSessionData | null = null;
      try {
        data = readSessionData(saved);
      } catch {
        /* Try native persistence next. */
      }
      if (!data && options.native && state.remembered) {
        try {
          data = readSessionData(await awaitCurrent(options.native.readSession(), signal));
        } catch {
          /* Optional native persistence. */
        }
      }
      if (disposed || version !== transitionVersion) return;
      if (data) {
        if (state.user?.id !== data.user.id) changeActor();
        credentials = data.session;
        update({ user: data.user });
        try {
          if (data.session.expires_at * 1000 - now() < 60000) await refresh();
          else {
            const expectedRole = roleRevision;
            const result = await options.api('me', null, data.session.access_token, 'GET', signal);
            if (disposed || version !== transitionVersion) return;
            const user = readAuthAccount(result.user);
            if (user.id !== data.user.id)
              throw new AuthError('A sessão retornou outra conta.', 'ACCOUNT_MISMATCH', 401);
            apply({ session: data.session, user }, expectedRole);
          }
        } catch (error) {
          if (disposed || signal.aborted || version !== transitionVersion) return;
          if (status(error) === 401 || status(error) === 403) expire();
          else {
            if (timer === undefined) schedule();
            options.offline();
          }
        }
      } else {
        let guest: GuestIdentity | null = null;
        try {
          guest = readGuestIdentity(JSON.parse(options.storage.getItem(GUEST) || 'null'));
        } catch {
          /* No usable guest ticket. */
        }
        if (guest && guest.expiresAt > now()) {
          try {
            const result = await awaitCurrent(
              options.authenticateGuest(guest.nickname, guest.ticket),
              signal,
            );
            if (disposed || version !== transitionVersion) return;
            setGuest(result);
            options.guestRestored?.();
          } catch {
            if (!disposed && version === transitionVersion) {
              options.storage.removeItem(GUEST);
              update({ guest: null });
              options.needLogin();
            }
          }
        } else options.needLogin();
      }
    } finally {
      if (!disposed && credentials && timer === undefined && !refreshPending) schedule();
      resolveReady();
    }
  }
  async function getAccessToken() {
    await ready;
    if (refreshPending) await refreshPending;
    if (!credentials || disposed) return null;
    return credentials.expires_at * 1000 - now() < 60000 ? refresh() : credentials.access_token;
  }
  async function authenticateGuest(name: string) {
    if (disposed || state.user) throw aborted();
    const version = beginTransition();
    const result = await awaitCurrent(
      options.authenticateGuest(name, state.guest?.ticket),
      transition.signal,
    );
    if (disposed || version !== transitionVersion) throw aborted();
    setGuest(result);
    return state.guest!;
  }
  return {
    ready,
    start,
    refresh,
    refreshIfNeeded: () =>
      !disposed && credentials && credentials.expires_at * 1000 - now() < 60000
        ? refresh()
        : Promise.resolve(null),
    expire,
    clear,
    cancelTransition: () => {
      if (!disposed) beginTransition();
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getAccessToken,
    setRemember(value: boolean) {
      if (disposed) return Promise.resolve();
      update({ remembered: !!options.native && value });
      try {
        options.preferences.setItem('mn-remember-me', state.remembered ? '1' : '0');
      } catch {
        /* Optional preference. */
      }
      return rememberSession();
    },
    async login(email: string, password: string, remember: boolean) {
      if (disposed) throw aborted();
      const expectedRole = roleRevision,
        version = beginTransition(),
        signal = transition.signal;
      const data = readSessionData(
        await options.api('login', { email, password }, null, 'POST', signal),
      );
      if (disposed || version !== transitionVersion) throw aborted();
      const changedIdentity = state.guest || (state.user && state.user.id !== data.user.id);
      if (changedIdentity) await awaitCurrent(leaveIdentity(), signal);
      else if (leaving) await awaitCurrent(leaving, signal);
      if (disposed || version !== transitionVersion) throw aborted();
      if (changedIdentity) options.showPortal();
      update({ remembered: !!options.native && remember });
      try {
        options.preferences.setItem('mn-remember-me', state.remembered ? '1' : '0');
      } catch {
        /* Optional preference. */
      }
      apply(data, expectedRole);
      await persistence;
      if (disposed || version !== transitionVersion) throw aborted();
      await options.authenticate(data.session.access_token);
      if (disposed || version !== transitionVersion) throw aborted();
      return state.user!;
    },
    async logout() {
      if (disposed) return;
      const token = credentials?.access_token;
      clear();
      const epoch = state.epoch;
      options.disconnect();
      await leaveIdentity();
      if (!disposed && epoch === state.epoch) options.showPortal();
      await persistence;
      if (token) await options.api('logout', {}, token).catch(() => {});
      if (!disposed && epoch === state.epoch) options.needLogin();
    },
    async updateProfile(profile: ProfileUpdate) {
      const user = state.user,
        epoch = state.epoch,
        token = await getAccessToken();
      if (!token || !user || disposed || epoch !== state.epoch)
        throw Error('Entre na sua conta novamente.');
      const expectedRole = roleRevision;
      const result = await options.api('profile', profile, token, 'POST', scope.signal);
      if (disposed || epoch !== state.epoch || !credentials)
        throw Error('A conta foi alterada durante o salvamento.');
      const updated = readAuthAccount(result.user);
      if (updated.id !== user.id) throw Error('A conta foi alterada durante o salvamento.');
      apply({ session: credentials, user: updated }, expectedRole);
      return state.user!;
    },
    applyRole(role: unknown, permissions: unknown) {
      if (!state.user || disposed) return;
      try {
        const user = readAuthAccount({ ...state.user, role, permissions });
        roleRevision++;
        update({ user }, true);
        saveTab();
      } catch {
        /* Malformed socket roles cannot change the account. */
      }
    },
    authenticateGuest,
    async ensureGuest(name?: string) {
      await ready;
      if (disposed) return false;
      if (!state.guest) {
        options.needGuest();
        return false;
      }
      const guest = state.guest,
        epoch = state.epoch,
        signal = scope.signal;
      const result = await awaitCurrent(
        options.authenticateGuest(String(name || guest.nickname).trim(), guest.ticket),
        signal,
      );
      if (
        disposed ||
        signal.aborted ||
        epoch !== state.epoch ||
        state.user ||
        state.guest?.ticket !== guest.ticket
      )
        return false;
      setGuest(result);
      return true;
    },
    async endGuest() {
      if (disposed) return;
      invalidate();
      const epoch = state.epoch;
      await leaveIdentity();
      if (disposed || epoch !== state.epoch) return;
      options.disconnect();
      options.storage.removeItem(GUEST);
      update({ guest: null });
      options.showPortal();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scope.abort(aborted());
      transition.abort(aborted());
      stopTimer();
      refreshPending = null;
      credentials = null;
      state = Object.freeze({ ...state, user: null, guest: null });
      listeners.clear();
      resolveReady();
    },
  };
}
export type AccountSession = ReturnType<typeof createAccountSession>;
