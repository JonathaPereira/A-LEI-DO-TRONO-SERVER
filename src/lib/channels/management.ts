import { abortable } from '../http/abortable.ts';
import type {
  ChannelDraft,
  ChannelManagementSnapshot,
  RoleTarget,
} from '../../types/channel-management';
import type { NetworkAccount } from '../../types/network';
import type { NetworkClient } from '../socket/client.ts';
import type { ChannelsController } from './catalog.ts';
import { record } from '../files/protocol.ts';
import { readManagedChannels } from './management-protocol.ts';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}
interface ManagementOptions {
  channels: Pick<ChannelsController, 'getSnapshot' | 'subscribe' | 'replace'>;
  network: Pick<NetworkClient, 'BACKEND_HTTP' | 'requestChatChannels' | 'requestPresence'>;
  getAccount(): NetworkAccount | null;
  getAccessToken(): Promise<string | null>;
  subscribeIdentity(listener: () => void): () => void;
  fetch: typeof fetch;
}
const draft: ChannelDraft = Object.freeze({ name: '', type: 'text', description: '' });
const manager = Object.freeze({ open: false, loading: false, busy: false, message: '', draft });
const roleEditor = Object.freeze({
  target: null,
  selected: 'member' as const,
  busy: false,
  message: '',
});
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível atualizar a comunidade.';

/** Administrative actions share the catalog and socket; permission/identity epochs fence HTTP work. */
export function createChannelManagement(options: ManagementOptions) {
  let state: ChannelManagementSnapshot = Object.freeze({
    accountId: null,
    role: null,
    canManageChannels: false,
    canManageRoles: false,
    channels: options.channels.getSnapshot().channels,
    manager,
    roleEditor,
  });
  let scope = '',
    epoch = 0,
    managerVersion = 0,
    roleVersion = 0,
    disposed = false;
  const listeners = new Set<() => void>(),
    requests = new Set<AbortController>();
  let refreshPending: Promise<ChannelManagementSnapshot['channels']> | null = null;
  let managerRequest: AbortController | null = null,
    roleRequest: AbortController | null = null;
  function update(patch: Partial<ChannelManagementSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function syncIdentity() {
    if (disposed) return;
    const account = options.getAccount();
    const next = JSON.stringify([
      account?.id,
      account?.role,
      !!account?.permissions.manageChannels,
      !!account?.permissions.manageRoles,
    ]);
    if (scope === next) return;
    const changedAccount = state.accountId !== (account?.id ?? null);
    scope = next;
    epoch++;
    managerVersion++;
    roleVersion++;
    for (const request of requests) request.abort();
    refreshPending = null;
    const canManageChannels = !!account?.permissions.manageChannels,
      canManageRoles = !!account?.permissions.manageRoles;
    update({
      accountId: account?.id ?? null,
      role: account?.role ?? null,
      canManageChannels,
      canManageRoles,
      manager:
        changedAccount || !canManageChannels
          ? manager
          : Object.freeze({ ...state.manager, busy: false, loading: false, message: '' }),
      roleEditor:
        changedAccount || !canManageRoles
          ? roleEditor
          : Object.freeze({ ...state.roleEditor, busy: false, message: '' }),
    });
  }
  function current(operation: number) {
    syncIdentity();
    return !disposed && operation === epoch;
  }
  async function api(
    path: string,
    { method = 'GET', body, signal }: ApiOptions = {},
  ): Promise<Record<string, unknown>> {
    syncIdentity();
    if (disposed || !state.accountId) throw new Error('Entre na sua conta.');
    const permission =
      method === 'GET' && path === '/channels'
        ? null
        : (method === 'POST' && path === '/channels') ||
            (method === 'DELETE' && /^\/channels\/[^/?#]+$/.test(path))
          ? 'canManageChannels'
          : method === 'POST' && path === '/roles'
            ? 'canManageRoles'
            : undefined;
    if (permission === undefined) throw new Error('Operação da comunidade inválida.');
    if (permission && !state[permission])
      throw new Error('Você não tem permissão para realizar essa operação.');
    const operation = epoch,
      request = new AbortController();
    const combined = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(20000),
      ...(signal ? [signal] : []),
    ]);
    requests.add(request);
    function assertCurrent() {
      if (!current(operation)) throw new Error('A conta ou a permissão mudou. Abra novamente.');
      combined.throwIfAborted();
    }
    try {
      assertCurrent();
      const token = await abortable(options.getAccessToken(), combined);
      assertCurrent();
      if (!token) throw new Error('Entre na sua conta.');
      const response = await options.fetch(options.network.BACKEND_HTTP + '/community' + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store',
        signal: combined,
      });
      const data: unknown = await response.json().catch(() => null);
      assertCurrent();
      if (!response.ok)
        throw new Error(
          record(data) && record(data.error) && typeof data.error.message === 'string'
            ? data.error.message
            : 'Não foi possível atualizar a comunidade.',
        );
      if (!record(data)) throw new Error('Resposta da comunidade inválida.');
      return data;
    } catch (error) {
      assertCurrent();
      throw error;
    } finally {
      requests.delete(request);
    }
  }
  function refresh() {
    syncIdentity();
    if (disposed || !state.accountId) return Promise.resolve(Object.freeze([]));
    if (refreshPending) return refreshPending;
    const operation = epoch,
      version = options.channels.getSnapshot().version;
    const pending = (async () => {
      const data = await api('/channels');
      if (!current(operation)) return Object.freeze([]);
      const channels = readManagedChannels(data.channels);
      options.channels.replace(
        channels.map(
          ({ players: _players, count: _count, voiceActive: _voice, ...channel }) => channel,
        ),
        version,
      );
      options.network.requestChatChannels();
      return options.channels.getSnapshot().channels;
    })();
    refreshPending = pending;
    void pending
      .finally(() => {
        if (refreshPending === pending) refreshPending = null;
      })
      .catch(() => {});
    return pending;
  }
  function managerCurrent(operation: number, version: number) {
    return (
      current(operation) &&
      state.manager.open &&
      state.canManageChannels &&
      managerVersion === version
    );
  }
  function closeManager() {
    managerVersion++;
    managerRequest?.abort();
    managerRequest = null;
    update({
      manager: Object.freeze({ ...state.manager, open: false, busy: false, loading: false }),
    });
  }
  function closeRole() {
    roleVersion++;
    roleRequest?.abort();
    roleRequest = null;
    update({ roleEditor });
  }
  async function mutateChannel(path: string, body?: ChannelDraft) {
    syncIdentity();
    if (!state.canManageChannels || !state.manager.open || state.manager.busy) return;
    const operation = epoch,
      version = managerVersion;
    managerRequest = new AbortController();
    update({
      manager: Object.freeze({
        ...state.manager,
        busy: true,
        message: body ? 'Criando…' : 'Excluindo…',
      }),
    });
    try {
      const data = await api(path, {
        method: body ? 'POST' : 'DELETE',
        body,
        signal: managerRequest.signal,
      });
      if (!managerCurrent(operation, version)) return;
      if (body) readManagedChannels([data.channel]);
      else if (data.ok !== true) throw new Error('Exclusão não confirmada.');
      if (body) update({ manager: Object.freeze({ ...state.manager, draft }) });
      await refresh();
      if (managerCurrent(operation, version))
        update({
          manager: Object.freeze({
            ...state.manager,
            message: body ? 'Canal criado.' : 'Canal excluído.',
          }),
        });
    } catch (error) {
      if (managerCurrent(operation, version))
        update({ manager: Object.freeze({ ...state.manager, message: message(error) }) });
    } finally {
      if (managerCurrent(operation, version)) {
        managerRequest = null;
        update({ manager: Object.freeze({ ...state.manager, busy: false }) });
      }
    }
  }
  const unsubscribeIdentity = options.subscribeIdentity(syncIdentity);
  const unsubscribeChannels = options.channels.subscribe(() =>
    update({ channels: options.channels.getSnapshot().channels }),
  );
  syncIdentity();
  return {
    api,
    refresh,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async openManager() {
      syncIdentity();
      if (disposed || !state.canManageChannels || state.manager.busy) return;
      const operation = epoch,
        version = ++managerVersion;
      update({
        manager: Object.freeze({ ...state.manager, open: true, loading: true, message: '' }),
      });
      try {
        await refresh();
      } catch (error) {
        if (managerCurrent(operation, version))
          update({ manager: Object.freeze({ ...state.manager, message: message(error) }) });
      } finally {
        if (managerCurrent(operation, version))
          update({ manager: Object.freeze({ ...state.manager, loading: false }) });
      }
    },
    closeManager,
    setDraft(patch: Partial<ChannelDraft>) {
      if (!state.manager.busy)
        update({
          manager: Object.freeze({
            ...state.manager,
            draft: Object.freeze({ ...state.manager.draft, ...patch }),
          }),
        });
    },
    createChannel() {
      const value = state.manager.draft;
      if (
        value.name.trim().length < 2 ||
        value.name.trim().length > 40 ||
        /[\x00-\x1f\x7f]/.test(value.name) ||
        !['text', 'voice'].includes(value.type) ||
        value.description.length > 160
      ) {
        update({
          manager: Object.freeze({
            ...state.manager,
            message: 'Use nome de 2 a 40 caracteres e tipo texto ou voz.',
          }),
        });
        return Promise.resolve();
      }
      return mutateChannel('/channels', value);
    },
    deleteChannel(id: string) {
      if (!state.channels.some((channel) => channel.id === id)) return Promise.resolve();
      return mutateChannel('/channels/' + encodeURIComponent(id));
    },
    editRole(person: RoleTarget) {
      syncIdentity();
      if (
        disposed ||
        !state.canManageRoles ||
        person.guest ||
        person.role === 'creator' ||
        !person.id ||
        !person.name
      )
        return;
      closeRole();
      update({
        roleEditor: Object.freeze({
          target: Object.freeze({ ...person }),
          selected: person.role === 'admin' ? 'admin' : 'member',
          busy: false,
          message: '',
        }),
      });
    },
    closeRole,
    selectRole(selected: 'admin' | 'member') {
      if (!state.roleEditor.busy)
        update({ roleEditor: Object.freeze({ ...state.roleEditor, selected }) });
    },
    async saveRole() {
      syncIdentity();
      const { target, selected, busy } = state.roleEditor;
      if (disposed || !state.canManageRoles || !target || busy) return;
      const operation = epoch,
        version = roleVersion;
      const valid = () =>
        current(operation) && version === roleVersion && state.roleEditor.target?.id === target.id;
      roleRequest = new AbortController();
      update({ roleEditor: Object.freeze({ ...state.roleEditor, busy: true, message: '' }) });
      try {
        const data = await api('/roles', {
          method: 'POST',
          body: { userId: target.id, role: selected },
          signal: roleRequest.signal,
        });
        if (!valid()) return;
        if (data.ok !== true || data.userId !== target.id || data.role !== selected)
          throw new Error('Cargo não confirmado.');
        options.network.requestPresence();
        closeRole();
      } catch (error) {
        if (valid())
          update({ roleEditor: Object.freeze({ ...state.roleEditor, message: message(error) }) });
      } finally {
        if (valid()) {
          roleRequest = null;
          update({ roleEditor: Object.freeze({ ...state.roleEditor, busy: false }) });
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      for (const request of requests) request.abort();
      requests.clear();
      unsubscribeIdentity();
      unsubscribeChannels();
      state = Object.freeze({
        ...state,
        accountId: null,
        role: null,
        canManageChannels: false,
        canManageRoles: false,
        channels: Object.freeze([]),
        manager,
        roleEditor,
      });
      for (const listener of listeners) listener();
      listeners.clear();
    },
  };
}
export type ChannelManagement = ReturnType<typeof createChannelManagement>;
