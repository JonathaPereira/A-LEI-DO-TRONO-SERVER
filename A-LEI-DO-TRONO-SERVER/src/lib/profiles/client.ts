import { abortable } from '../http/abortable.ts';
import type { NetworkAccount } from '../../types/network';
import type { ProfilesSnapshot } from '../../types/profiles';
import type { SocketMessage } from '../../types/socket';
import { profileId, readMemberProfile, readRegisteredAccountsPage, record } from './protocol.ts';

export interface ProfilesOptions {
  backendHttp: string;
  getAccount(): NetworkAccount | null;
  getAccessToken(): Promise<string | null>;
  fetch: typeof fetch;
  subscribeIdentity(listener: () => void): () => void;
  subscribeMessages(listener: (message: SocketMessage) => void): () => void;
  subscribeProfileChange?(listener: () => void): () => void;
  warn?(error: unknown): void;
}
export const EMPTY_PROFILES: ProfilesSnapshot = Object.freeze({
  accountId: null,
  role: null,
  epoch: 0,
  revision: 0,
  profileId: null,
});
const changed = () => new Error('A conta mudou. Abra novamente.');

/** Authenticated reads only. Existing decoration caches retain their own presentation lifetime. */
export function createProfiles(options: ProfilesOptions) {
  let state = EMPTY_PROFILES,
    disposed = false,
    permissionScope = '';
  const listeners = new Set<() => void>();
  const pending = new Set<AbortController>();
  function update(patch: Partial<ProfilesSnapshot>) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        options.warn?.(error);
      }
    }
  }
  function syncIdentity() {
    if (disposed) return;
    const account = options.getAccount();
    const permissions = account
      ? JSON.stringify(Object.entries(account.permissions).sort(([a], [b]) => a.localeCompare(b)))
      : '';
    if (
      state.accountId === (account?.id ?? null) &&
      state.role === (account?.role ?? null) &&
      permissionScope === permissions
    )
      return;
    permissionScope = permissions;
    for (const controller of pending) controller.abort();
    update({
      accountId: account?.id ?? null,
      role: account?.role ?? null,
      epoch: state.epoch + 1,
      profileId: null,
    });
  }
  function assertCurrent(scope: ProfilesSnapshot) {
    syncIdentity();
    if (disposed || scope.epoch !== state.epoch || scope.accountId !== state.accountId)
      throw changed();
  }
  function requireCreator() {
    const account = options.getAccount();
    if (account?.role !== 'creator' || account.permissions.viewEmails === false)
      throw new Error('Você não tem permissão para consultar as contas.');
  }
  async function api(
    path: string,
    signal?: AbortSignal,
    creator = false,
  ): Promise<Record<string, unknown>> {
    syncIdentity();
    if (disposed) throw new Error('A consulta de perfis foi encerrada.');
    if (!state.accountId) throw new Error('Entre na sua conta.');
    if (creator) requireCreator();
    const scope = state,
      controller = new AbortController();
    pending.add(controller);
    const abortSignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
      ...(signal ? [signal] : []),
    ]);
    try {
      abortSignal.throwIfAborted();
      const token = await abortable(options.getAccessToken(), abortSignal);
      assertCurrent(scope);
      abortSignal.throwIfAborted();
      if (!token) throw new Error('Entre na sua conta.');
      if (creator) requireCreator();
      const response = await options.fetch(`${options.backendHttp}/community/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: abortSignal,
      });
      const data: unknown = await response.json().catch(() => null);
      assertCurrent(scope);
      abortSignal.throwIfAborted();
      if (creator) requireCreator();
      if (!response.ok) {
        const error = record(data) && record(data.error) ? data.error : null;
        throw Object.assign(
          new Error(
            typeof error?.message === 'string'
              ? error.message
              : 'Não foi possível carregar o perfil.',
          ),
          {
            code: typeof error?.code === 'string' ? error.code : undefined,
          },
        );
      }
      if (!record(data)) throw new Error('Resposta de perfil inválida.');
      return data;
    } catch (error) {
      assertCurrent(scope);
      throw error;
    } finally {
      pending.delete(controller);
    }
  }
  function invalidate(id: unknown) {
    if (disposed || typeof id !== 'string' || !id) return;
    update({ profileId: id, revision: state.revision + 1 });
  }
  const unsubscribeIdentity = options.subscribeIdentity(syncIdentity);
  const unsubscribeMessages = options.subscribeMessages((message) => {
    if (message.type === 'member-profile-updated') invalidate(message.accountId);
  });
  const unsubscribeProfile = options.subscribeProfileChange?.(() =>
    invalidate(options.getAccount()?.id),
  );
  syncIdentity();
  return {
    async readProfile(id: string, { signal }: { signal?: AbortSignal } = {}) {
      profileId(id);
      syncIdentity();
      const scope = state;
      const data = await api(`profiles/${encodeURIComponent(id)}`, signal);
      assertCurrent(scope);
      const profile = readMemberProfile(data.profile);
      if (profile.id !== id) throw new Error('Resposta de perfil inválida.');
      return profile;
    },
    async readAccounts(offset = 0, { signal }: { signal?: AbortSignal } = {}) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
        throw new Error('Página de contas inválida.');
      syncIdentity();
      const scope = state;
      const data = await api(`registered-accounts?offset=${offset}`, signal, true);
      assertCurrent(scope);
      const page = readRegisteredAccountsPage(data);
      if (
        page.nextOffset !== offset + page.accounts.length ||
        (page.hasMore && page.accounts.length !== 50)
      )
        throw new Error('Resposta de contas inválida.');
      return page;
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of pending) controller.abort();
      pending.clear();
      unsubscribeIdentity();
      unsubscribeMessages();
      unsubscribeProfile?.();
      update({ accountId: null, role: null, epoch: state.epoch + 1, profileId: null });
      listeners.clear();
    },
  };
}
export type ProfilesClient = ReturnType<typeof createProfiles>;
