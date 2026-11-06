import type { ClipDirectory, LocalClip } from '../../types/clips';

/** Keeps the original database/schema and stores complete records, including unknown metadata. */
export function createClipStore(indexedDB: () => Pick<IDBFactory, 'open'>) {
  let connection: Promise<IDBDatabase> | null = null,
    database: IDBDatabase | null = null,
    disposed = false;
  const closed = () => new DOMException('O armazenamento de clipes foi encerrado.', 'AbortError');
  function db(): Promise<IDBDatabase> {
    if (disposed) return Promise.reject(closed());
    if (connection) return connection;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB().open('trono-local-clips', 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('clips', { keyPath: 'id' }).createIndex('owner', 'owner');
        request.result.createObjectStore('settings');
      };
      request.onerror = () =>
        reject(
          request.error ?? new Error('Não foi possível abrir o armazenamento local de clipes.'),
        );
      request.onblocked = () => {
        abandoned = true;
        reject(
          new Error('Feche as outras abas do aplicativo para abrir o armazenamento de clipes.'),
        );
      };
      request.onsuccess = () => {
        const opened = request.result;
        if (disposed || abandoned) {
          opened.close();
          reject(closed());
          return;
        }
        database = opened;
        const release = () => {
          if (database === opened) {
            database = null;
            connection = null;
          }
        };
        opened.onversionchange = () => {
          opened.close();
          release();
        };
        opened.onclose = release;
        resolve(opened);
      };
    });
    connection = pending;
    // A failed open is retryable, without letting an older request clear a newer connection.
    void pending.catch(() => {
      if (connection === pending) connection = null;
    });
    return pending;
  }
  async function run<T>(
    store: 'clips' | 'settings',
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const opened = await db();
    if (disposed) throw closed();
    return new Promise<T>((resolve, reject) => {
      const transaction = opened.transaction(store, mode);
      let request: IDBRequest<T>;
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error('Não foi possível armazenar o clipe. Confira o espaço do navegador.'),
        );
      transaction.onerror = () => {};
      try {
        request = action(transaction.objectStore(store));
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }
  return {
    put: (clip: LocalClip) => run('clips', 'readwrite', (store) => store.put(clip)),
    get: (id: string): Promise<LocalClip | undefined> =>
      run('clips', 'readonly', (store) => store.get(id)),
    remove: (id: string) => run('clips', 'readwrite', (store) => store.delete(id)),
    async list(owner: string): Promise<LocalClip[]> {
      const clips: LocalClip[] = await run('clips', 'readonly', (store) =>
        store.index('owner').getAll(owner),
      );
      return clips.sort((a, b) => b.createdAt - a.createdAt);
    },
    directory: (owner: string): Promise<ClipDirectory | null | undefined> =>
      run('settings', 'readonly', (store) => store.get('directory:' + owner)),
    setDirectory: (owner: string, handle: ClipDirectory | null) =>
      run('settings', 'readwrite', (store) => store.put(handle, 'directory:' + owner)),
    dispose() {
      if (disposed) return;
      disposed = true;
      database?.close();
      database = null;
      connection = null;
    },
  };
}
export type ClipStore = ReturnType<typeof createClipStore>;
