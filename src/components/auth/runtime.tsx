import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createAuthApi } from '../../lib/auth/api';
import { createAccountSession, type SessionSnapshot } from '../../lib/auth/session';
import { createAuthForms, type AuthForms } from '../../lib/auth/forms';
import { readAccount } from '../../lib/socket/protocol';
import { createPreferenceStorage, type PreferenceStorage } from '../../lib/storage/preferences';
import type { NetworkClient } from '../../lib/socket/client';
import type { AuthCallback, AuthSessionData } from '../../types/auth';
import { AuthDialogs } from './dialogs';

interface Runtime extends Window {
  TronoNetwork: NetworkClient;
  TronoStorage: PreferenceStorage;
  TronoDesktop?: {
    readSession?(): Promise<unknown>;
    saveSession?(value: AuthSessionData | null): Promise<unknown>;
  };
  TronoAuthCallback?: AuthCallback;
  TronoAuth?: object;
  TronoChatHub?: { leave(): Promise<unknown> };
  TronoSocial?: { leaveVoice(): Promise<unknown> };
  TronoPortal?: {
    showPortal(): void;
    openGame(): void;
    setNameFeedback(value: { code: string; message: string }): void;
  };
}
const installed = new WeakMap<Window, () => void>();

/** One account owner, one socket subscription and React forms. Moved header buttons keep native action listeners. */
export function initializeAuth(target: Window) {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    network = runtime.TronoNetwork;
  const api = createAuthApi({ base: network.BACKEND_HTTP, fetch: target.fetch.bind(target) });
  let forms!: AuthForms,
    prior: SessionSnapshot | undefined,
    acknowledgedAccount: string | null = null,
    disposed = false,
    bound = false;
  const warn = (error: unknown) => console.warn('[Conta]', error);
  function syncAccount(state: SessionSnapshot) {
    const name = state.user?.nickname || state.guest?.nickname || '';
    if (name) runtime.TronoStorage.setItem('tronoPlayerName', name);
    else runtime.TronoStorage.removeItem('tronoPlayerName');
    for (const [id, hidden] of [
      ['accountGuestExitBtn', !state.guest],
      ['openGuestGameBtn', !!state.user],
      ['accountLoginBtn', !!state.user],
      ['accountProfileBtn', !state.user],
      ['accountLogoutBtn', !state.user],
    ] as const)
      doc.getElementById(id)?.classList.toggle('hidden', hidden);
    doc.body.classList.toggle('guest-mode', !!state.guest);
    target.dispatchEvent(
      new CustomEvent('trono-auth-change', { detail: { user: state.user, guest: state.guest } }),
    );
  }
  const session = createAccountSession({
    api,
    storage: createPreferenceStorage(() => target.sessionStorage),
    preferences: runtime.TronoStorage,
    native: runtime.TronoDesktop
      ? {
          readSession: () => runtime.TronoDesktop?.readSession?.() ?? Promise.resolve(null),
          saveSession: (value) =>
            runtime.TronoDesktop?.saveSession?.(value) ?? Promise.resolve(undefined),
        }
      : undefined,
    authenticate: network.authenticate,
    authenticateGuest: network.authenticateGuest,
    disconnect: network.disconnect,
    async leaveIdentity() {
      await runtime.TronoChatHub?.leave().catch(warn);
      await runtime.TronoSocial?.leaveVoice().catch(warn);
      network.leaveRoom();
    },
    showPortal: () => runtime.TronoPortal?.showPortal(),
    needLogin: (message) => forms.open('login', message, !!message),
    needGuest: () => forms.openGuest(),
    guestRestored: () => runtime.TronoPortal?.openGame(),
    offline: () =>
      runtime.TronoPortal?.setNameFeedback({
        code: 'NETWORK_OFFLINE',
        message: 'Aguardando conexão para retomar sua conta.',
      }),
    changed(state, roleOnly) {
      if (prior?.user?.id !== state.user?.id) acknowledgedAccount = null;
      if (roleOnly)
        target.dispatchEvent(
          new CustomEvent('trono-role-change', { detail: { user: state.user } }),
        );
      else if (prior?.user !== state.user || prior?.guest !== state.guest) syncAccount(state);
      if (prior?.remembered !== state.remembered || prior?.rememberError !== state.rememberError)
        target.dispatchEvent(new Event('trono-remember-change'));
      prior = state;
    },
    warn,
  });
  forms = createAuthForms({
    session,
    api,
    takeCallback() {
      const value = runtime.TronoAuthCallback;
      delete runtime.TronoAuthCallback;
      return value;
    },
    disconnect: network.disconnect,
    enterGame: () => runtime.TronoPortal?.openGame(),
  });
  const facade = {
    ready: session.ready,
    updateProfile: session.updateProfile,
    setRemember: session.setRemember,
    get remembered() {
      return session.getSnapshot().remembered;
    },
    get rememberError() {
      return session.getSnapshot().rememberError;
    },
    get user() {
      return session.getSnapshot().user;
    },
    get guest() {
      return session.getSnapshot().guest;
    },
    open: forms.open,
    openGuest: forms.openGuest,
    ensureGuest: session.ensureGuest,
    logout: session.logout,
    expire: session.expire,
    getAccessToken: session.getAccessToken,
    passwordChecks: forms.passwordChecks,
    validPassword: forms.validPassword,
  };
  runtime.TronoAuth = facade;
  const root = createRoot(doc.getElementById('authDialogsRoot')!);
  flushSync(() => root.render(<AuthDialogs forms={forms} desktop={!!runtime.TronoDesktop} />));
  const unsubscribe = network.onMessage((message) => {
    if (message.type === 'connection' && !message.connected) acknowledgedAccount = null;
    if (message.type === 'error' && message.code === 'AUTH_REQUIRED') session.expire();
    if (message.type === 'auth-result' && message.ok) {
      try {
        const user = readAccount(message.user);
        if (user.id !== session.getSnapshot().user?.id) return;
        acknowledgedAccount = user.id;
        session.applyRole(user.role, user.permissions);
      } catch {
        /* Invalid socket payload cannot change the local account. */
      }
    }
    if (message.type === 'role-updated' && acknowledgedAccount === session.getSnapshot().user?.id)
      session.applyRole(message.role, message.permissions);
  });
  const actions: Array<[string, () => void]> = [
    ['accountLoginBtn', () => forms.open('login')],
    [
      'accountLogoutBtn',
      () => {
        void session.logout().catch(warn);
      },
    ],
    [
      'accountGuestExitBtn',
      () => {
        void session.endGuest().catch(warn);
      },
    ],
    ['openGuestGameBtn', forms.openGuest],
  ];
  const bind = () => {
    if (disposed || bound) return;
    bound = true;
    for (const [id, action] of actions) doc.getElementById(id)?.addEventListener('click', action);
    prior = session.getSnapshot();
    syncAccount(prior);
    void forms.start().catch(warn);
  };
  const callback = () => {
    void forms.callback().catch(warn);
  };
  const wake = () => {
    if (!doc.hidden) void session.refreshIfNeeded().catch(warn);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('trono:ready', bind);
    target.removeEventListener('trono-auth-callback', callback);
    target.removeEventListener('focus', wake);
    target.removeEventListener('pagehide', dispose);
    doc.removeEventListener('visibilitychange', wake);
    for (const [id, action] of actions)
      doc.getElementById(id)?.removeEventListener('click', action);
    unsubscribe();
    forms.dispose();
    session.dispose();
    flushSync(() => root.unmount());
    // Account is a dependency of later pagehide listeners and async call teardown.
    // Keep the inert facade until the document dies or a new installation replaces it.
    if (installed.get(target) === dispose) installed.delete(target);
  };
  target.addEventListener('trono:ready', bind, { once: true });
  target.addEventListener('trono-auth-callback', callback);
  target.addEventListener('focus', wake);
  doc.addEventListener('visibilitychange', wake);
  target.addEventListener('pagehide', dispose, { once: true });
  installed.set(target, dispose);
  return dispose;
}
