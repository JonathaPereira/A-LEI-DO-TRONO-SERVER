import type { NetworkAccount } from '../../types/network';
import type { RegisteredAccount } from '../../types/profiles';
import type { ProfilesClient } from './client';

export interface RegisteredAccountsSnapshot {
  readonly allowed: boolean;
  readonly open: boolean;
  readonly loading: boolean;
  readonly accounts: readonly RegisteredAccount[];
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly message: string;
}
export interface RegisteredAccountsOptions {
  profiles: Pick<ProfilesClient, 'readAccounts' | 'getSnapshot' | 'subscribe'>;
  getAccount(): NetworkAccount | null;
}
export const EMPTY_REGISTERED_ACCOUNTS: RegisteredAccountsSnapshot = Object.freeze({
  allowed: false,
  open: false,
  loading: false,
  accounts: Object.freeze([]),
  nextOffset: 0,
  hasMore: false,
  message: '',
});

/** Private directory state is scoped to the authenticated client's permission epoch. */
export function createRegisteredAccounts({ profiles, getAccount }: RegisteredAccountsOptions) {
  let state = EMPTY_REGISTERED_ACCOUNTS,
    disposed = false,
    generation = 0;
  let epoch = profiles.getSnapshot().epoch,
    request: AbortController | null = null;
  const listeners = new Set<() => void>();
  function allowed() {
    const account = getAccount();
    return !!account && account.role === 'creator' && account.permissions.viewEmails !== false;
  }
  function update(patch: Partial<RegisteredAccountsSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function cancel() {
    generation++;
    request?.abort();
    request = null;
  }
  function sync() {
    if (disposed) return;
    const next = profiles.getSnapshot().epoch,
      permission = allowed();
    if (next === epoch && permission === state.allowed) return;
    epoch = next;
    cancel();
    update({ ...EMPTY_REGISTERED_ACCOUNTS, allowed: permission });
  }
  function current(operation: number) {
    sync();
    return !disposed && operation === generation && state.open && state.allowed;
  }
  async function load(append: boolean): Promise<void> {
    sync();
    if (disposed || !state.allowed || (append && (!state.open || state.loading || !state.hasMore)))
      return;
    cancel();
    const operation = generation,
      offset = append ? state.nextOffset : 0;
    request = new AbortController();
    const signal = request.signal;
    update({
      ...(append ? {} : EMPTY_REGISTERED_ACCOUNTS),
      allowed: true,
      open: true,
      loading: true,
      message: 'Carregando contas…',
    });
    try {
      const page = await profiles.readAccounts(offset, { signal });
      if (!current(operation)) return;
      const seen = new Set(state.accounts.map((account) => account.id));
      const accounts = Object.freeze([
        ...state.accounts,
        ...page.accounts.filter((account) => !seen.has(account.id)),
      ]);
      update({
        accounts,
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
        message: `${accounts.length} contas carregadas.`,
      });
    } catch (error) {
      if (current(operation))
        update({
          message: error instanceof Error ? error.message : 'Não foi possível carregar as contas.',
        });
    } finally {
      if (current(operation)) {
        request = null;
        update({ loading: false });
      }
    }
  }
  const unsubscribe = profiles.subscribe(sync);
  sync();
  return {
    open: () => load(false),
    more: () => load(true),
    close() {
      if (disposed) return;
      cancel();
      update({ ...EMPTY_REGISTERED_ACCOUNTS, allowed: allowed() });
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
      cancel();
      unsubscribe();
      state = EMPTY_REGISTERED_ACCOUNTS;
      for (const listener of listeners) listener();
      listeners.clear();
    },
  };
}
export type RegisteredAccounts = ReturnType<typeof createRegisteredAccounts>;
