import type { FileRecord } from '../../types/files';
import type { FilesClient } from './client.ts';
import { openFile as defaultOpenFile } from './open.ts';
import { readFile } from './protocol.ts';

export interface FileLibrarySnapshot {
  readonly accountId: string | null;
  readonly files: readonly FileRecord[];
  readonly hasMore: boolean;
  readonly used: number | null;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly loading: boolean;
  readonly message: string;
  readonly deletingIds: readonly string[];
  readonly protectedIds: readonly string[];
}

interface FileLibraryOptions {
  client: Pick<FilesClient, 'api' | 'url' | 'remove' | 'getSnapshot' | 'subscribe'>;
  getProtectedIds(): readonly string[];
  subscribeProfile?(listener: () => void): () => void;
  openFile?: typeof defaultOpenFile;
  warn?(error: unknown): void;
}

function readMine(data: Record<string, unknown>) {
  if (!Array.isArray(data.files) || data.files.length > 200 || typeof data.hasMore !== 'boolean')
    throw new Error('Lista de arquivos inválida.');
  const files = data.files.map(readFile);
  if (new Set(files.map((file) => file.id)).size !== files.length)
    throw new Error('Lista de arquivos inválida.');
  return { files, hasMore: data.hasMore };
}

function readUsage(data: Record<string, unknown>) {
  if (typeof data.used !== 'number' || !Number.isSafeInteger(data.used) || data.used < 0)
    throw new Error('Uso de armazenamento inválido.');
  return data.used;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível acessar esse arquivo.';
}

/** Account-scoped library state; authenticated transport and tombstones belong to FilesClient. */
export function createFileLibrary({
  client,
  getProtectedIds,
  subscribeProfile,
  openFile = defaultOpenFile,
  warn = console.warn,
}: FileLibraryOptions) {
  let source = client.getSnapshot();
  let disposed = false,
    generation = 0,
    refreshId = 0,
    messageId = 0;
  const listeners = new Set<() => void>();
  const deleting = new Set<string>();
  const downloads = new Map<string, Promise<void>>();
  const protectedIds = () =>
    Object.freeze([...new Set(getProtectedIds().filter((id) => typeof id === 'string' && id))]);
  const empty = (): FileLibrarySnapshot =>
    Object.freeze({
      accountId: source.accountId,
      files: Object.freeze([]),
      hasMore: false,
      used: null,
      status: 'idle',
      loading: false,
      message: '',
      deletingIds: Object.freeze([]),
      protectedIds: protectedIds(),
    });
  let state = empty();

  function update(patch: Partial<FileLibrarySnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        warn(error);
      }
    }
  }

  function syncProtected() {
    if (disposed) return;
    const ids = protectedIds();
    if (
      ids.length !== state.protectedIds.length ||
      ids.some((id, index) => id !== state.protectedIds[index])
    )
      update({ protectedIds: ids });
  }

  function syncClient() {
    const next = client.getSnapshot();
    if (source.accountId !== next.accountId || source.epoch !== next.epoch) {
      source = next;
      generation++;
      refreshId++;
      messageId++;
      deleting.clear();
      downloads.clear();
      update(empty());
      return;
    }
    source = next;
    const files = state.files.filter((file) => !Object.hasOwn(source.deleted, file.id));
    if (files.length !== state.files.length) update({ files: Object.freeze(files) });
  }

  function context() {
    syncClient();
    return { generation, accountId: source.accountId, epoch: source.epoch };
  }

  function current(scope: ReturnType<typeof context>) {
    syncClient();
    return (
      !disposed &&
      scope.generation === generation &&
      scope.accountId === source.accountId &&
      scope.epoch === source.epoch
    );
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    syncProtected();
    const scope = context(),
      requestId = ++refreshId,
      noticeId = ++messageId;
    if (!scope.accountId) {
      update({ status: 'error', loading: false, message: 'Entre na sua conta para continuar.' });
      return;
    }
    update({ status: 'loading', loading: true, message: '' });
    try {
      const [status, mine] = await Promise.all([client.api('/status'), client.api('/mine')]);
      if (!current(scope) || requestId !== refreshId) return;
      const used = readUsage(status),
        list = readMine(mine);
      update({
        files: Object.freeze(
          list.files.filter((file) => !file.deleted && !Object.hasOwn(source.deleted, file.id)),
        ),
        hasMore: list.hasMore,
        used,
        status: 'ready',
        loading: false,
        ...(noticeId === messageId ? { message: '' } : {}),
      });
    } catch (error) {
      if (current(scope) && requestId === refreshId)
        update({
          status: 'error',
          loading: false,
          ...(noticeId === messageId ? { message: errorMessage(error) } : {}),
        });
    }
  }

  async function remove(id: string): Promise<void> {
    if (disposed) return;
    const scope = context();
    if (!scope.accountId || deleting.has(id)) return;
    syncProtected();
    const noticeId = ++messageId;
    if (state.protectedIds.includes(id)) {
      update({ message: 'Remova esse arquivo do seu perfil antes de excluí-lo.' });
      return;
    }
    if (!state.files.some((file) => file.id === id)) return;
    deleting.add(id);
    update({ deletingIds: Object.freeze([...deleting]), message: '' });
    try {
      await client.remove(id);
      if (!current(scope)) return;
      update({ files: Object.freeze(state.files.filter((file) => file.id !== id)) });
    } catch (error) {
      if (current(scope) && noticeId === messageId) update({ message: errorMessage(error) });
    } finally {
      if (current(scope)) {
        deleting.delete(id);
        update({ deletingIds: Object.freeze([...deleting]) });
      }
    }
  }

  function download(id: string): Promise<void> {
    if (disposed) return Promise.resolve();
    const scope = context();
    if (!scope.accountId || !state.files.some((file) => file.id === id)) return Promise.resolve();
    const pending = downloads.get(id);
    if (pending) return pending;
    const noticeId = ++messageId;
    update({ message: '' });
    const canOpen = () => current(scope) && !Object.hasOwn(source.deleted, id);
    // Call immediately: the web opener needs the same user gesture as the button click.
    const operation = openFile(
      () => client.url(id, true),
      (message) => {
        if (current(scope) && noticeId === messageId) update({ message });
      },
      canOpen,
    ).catch((error: unknown) => {
      if (current(scope) && noticeId === messageId) update({ message: errorMessage(error) });
    });
    downloads.set(id, operation);
    void operation.finally(() => {
      if (downloads.get(id) === operation) downloads.delete(id);
    });
    return operation;
  }

  const unsubscribeClient = client.subscribe(syncClient);
  const unsubscribeProfile = subscribeProfile?.(syncProtected);
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    remove,
    download,
    syncProtected,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      unsubscribeClient();
      unsubscribeProfile?.();
      listeners.clear();
      deleting.clear();
      downloads.clear();
    },
  };
}

export type FileLibrary = ReturnType<typeof createFileLibrary>;
