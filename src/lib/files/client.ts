import type {
  FilesApiOptions,
  FilesSnapshot,
  FileUploadOptions,
  FileRecord,
} from '../../types/files';
import type { NetworkAccount } from '../../types/network';
import type { SocketMessage } from '../../types/socket';
import { fileId, readFile, readSignedUrl, record } from './protocol.ts';

export const FILE_LIMITS = Object.freeze({ file: 10_000_000, video: 100_000_000 });
export const EMPTY_FILES: FilesSnapshot = Object.freeze({
  accountId: null,
  moderateFiles: false,
  epoch: 0,
  deleted: Object.freeze({}),
});
export const formatFileSize = (n: number): string =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)} GB`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)} MB`
      : `${Math.ceil(n / 1000)} KB`;

interface FilesOptions {
  backendHttp: string;
  getAccount(): NetworkAccount | null;
  getAccessToken(): Promise<string | null>;
  fetch: typeof fetch;
  createUpload(): XMLHttpRequest;
  subscribeIdentity(listener: () => void): () => void;
  subscribeMessages(listener: (message: SocketMessage) => void): () => void;
  now?: () => number;
  warn?: (error: unknown) => void;
}
const changed = () => new Error('A conta mudou. Tente novamente.');
const missing = () =>
  Object.assign(new Error('Arquivo excluído ou indisponível.'), { code: 'FILE_NOT_FOUND' });

/** One authenticated transport and URL cache for chat, DMs, profiles and soundboard. */
export function createFiles({
  backendHttp,
  getAccount,
  getAccessToken,
  fetch: request,
  createUpload,
  subscribeIdentity,
  subscribeMessages,
  now = Date.now,
  warn = console.warn,
}: FilesOptions) {
  let state = EMPTY_FILES,
    disposed = false;
  const cache = new Map<string, { url: string; expiresAt: number }>();
  const pendingUrls = new Map<string, Promise<string>>();
  const uploads = new Set<() => void>();
  const listeners = new Set<() => void>();
  function update(patch: Partial<FilesSnapshot>) {
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
  function syncIdentity() {
    const account = getAccount(),
      accountId = account?.id ?? null;
    const moderateFiles = account?.permissions.moderateFiles === true;
    if (state.accountId !== accountId) {
      cache.clear();
      pendingUrls.clear();
      update({ accountId, moderateFiles, epoch: state.epoch + 1, deleted: Object.freeze({}) });
      for (const cancel of [...uploads]) cancel();
    } else if (state.moderateFiles !== moderateFiles) update({ moderateFiles });
  }
  function context() {
    syncIdentity();
    if (disposed) throw new Error('A biblioteca de arquivos foi encerrada.');
    if (!state.accountId) throw new Error('Entre na sua conta para continuar.');
    return { accountId: state.accountId, epoch: state.epoch };
  }
  function assertCurrent(scope: { accountId: string; epoch: number }) {
    syncIdentity();
    if (disposed || scope.epoch !== state.epoch || scope.accountId !== state.accountId)
      throw changed();
  }
  function markDeleted(id: string) {
    if (disposed || Object.hasOwn(state.deleted, id)) return;
    for (const key of cache.keys()) if (key.startsWith(`${id}:`)) cache.delete(key);
    update({ deleted: Object.freeze({ ...state.deleted, [id]: true }) });
  }
  async function api(
    path: string,
    { method = 'GET', body }: FilesApiOptions = {},
  ): Promise<Record<string, unknown>> {
    const scope = context(),
      token = await getAccessToken();
    assertCurrent(scope);
    if (!token) throw new Error('Entre na sua conta para continuar.');
    let response;
    try {
      response = await request(`${backendHttp}/files${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(25000),
      });
    } catch (error) {
      assertCurrent(scope);
      throw error;
    }
    const data: unknown = await response.json().catch(() => null);
    assertCurrent(scope);
    if (!response.ok) {
      const error = record(data) && record(data.error) ? data.error : null;
      throw Object.assign(
        new Error(
          typeof error?.message === 'string'
            ? error.message
            : 'Não foi possível acessar esse arquivo.',
        ),
        { code: typeof error?.code === 'string' ? error.code : undefined },
      );
    }
    if (!record(data)) throw new Error('Resposta de arquivo inválida.');
    return data;
  }
  async function url(id: string, download = false): Promise<string> {
    fileId(id);
    const scope = context();
    if (Object.hasOwn(state.deleted, id)) throw missing();
    const key = `${id}:${download}`,
      old = cache.get(key);
    if (old && old.expiresAt > now() + 30000) return old.url;
    const pending = pendingUrls.get(key);
    if (pending) return pending;
    const operation = (async () => {
      try {
        const data = await api(`/${encodeURIComponent(id)}/url${download ? '?download=1' : ''}`);
        assertCurrent(scope);
        if (Object.hasOwn(state.deleted, id)) throw missing();
        const link = readSignedUrl(data, now());
        cache.set(key, link);
        return link.url;
      } catch (error) {
        assertCurrent(scope);
        if (record(error) && error.code === 'FILE_NOT_FOUND') markDeleted(id);
        throw error;
      }
    })();
    pendingUrls.set(key, operation);
    try {
      return await operation;
    } finally {
      if (pendingUrls.get(key) === operation) pendingUrls.delete(key);
    }
  }
  async function remove(id: string): Promise<void> {
    const scope = context();
    fileId(id);
    await api(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
    assertCurrent(scope);
    markDeleted(id);
  }
  async function upload(
    file: File,
    { kind = 'chat', roomId, peerId, signal, onProgress }: FileUploadOptions = {},
  ): Promise<FileRecord> {
    const video = /\.(mp4|webm)$/i.test(file.name);
    const max =
      kind === 'soundboard'
        ? 2_880_044
        : kind === 'avatar'
          ? FILE_LIMITS.file
          : video
            ? FILE_LIMITS.video
            : FILE_LIMITS.file;
    if (!file.size || file.size > max)
      throw new Error(`Limite: ${formatFileSize(max)} ${video ? 'por vídeo' : 'por arquivo'}.`);
    const scope = context();
    if (signal?.aborted) throw new Error('Envio cancelado.');
    const token = await getAccessToken();
    assertCurrent(scope);
    if (signal?.aborted) throw new Error('Envio cancelado.');
    if (!token) throw new Error('Entre na sua conta.');
    return new Promise((resolve, reject) => {
      const xhr = createUpload();
      let settled = false;
      const abort = () => {
        finish(new Error('Envio cancelado.'));
        xhr.abort();
      };
      const cancelIdentity = () => {
        finish(changed());
        xhr.abort();
      };
      function finish(error?: unknown, file?: FileRecord) {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        uploads.delete(cancelIdentity);
        xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
        xhr.upload.onprogress = null;
        if (error) reject(error);
        else if (file) resolve(file);
        else reject(new Error('Resposta de envio inválida.'));
      }
      try {
        xhr.open('POST', `${backendHttp}/files/upload`);
        xhr.timeout = 300000;
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
        xhr.setRequestHeader('X-File-Kind', kind);
        if (roomId) xhr.setRequestHeader('X-Room-Id', roomId);
        if (peerId) xhr.setRequestHeader('X-Peer-Id', peerId);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && !settled) {
            try {
              assertCurrent(scope);
            } catch (error) {
              finish(error);
              xhr.abort();
              return;
            }
            try {
              onProgress?.(Math.round((event.loaded / event.total) * 100));
            } catch (error) {
              warn(error);
            }
          }
        };
        xhr.onload = () => {
          try {
            assertCurrent(scope);
            let data: unknown;
            try {
              data = JSON.parse(xhr.responseText);
            } catch {
              throw new Error('Resposta de envio inválida.');
            }
            if (xhr.status < 200 || xhr.status >= 300)
              throw new Error(
                record(data) && record(data.error) && typeof data.error.message === 'string'
                  ? data.error.message
                  : 'Falha ao enviar o arquivo.',
              );
            finish(undefined, readFile(record(data) ? data.file : null));
          } catch (error) {
            finish(error);
          }
        };
        xhr.onerror = () => finish(new Error('Conexão interrompida durante o envio.'));
        xhr.ontimeout = () => finish(new Error('Envio demorou demais. Tente novamente.'));
        xhr.onabort = () => finish(new Error('Envio cancelado.'));
        uploads.add(cancelIdentity);
        signal?.addEventListener('abort', abort, { once: true });
        xhr.send(file);
      } catch (error) {
        finish(error);
      }
    });
  }
  const unsubscribeIdentity = subscribeIdentity(syncIdentity);
  const unsubscribeMessages = subscribeMessages((message) => {
    if (message.type === 'attachment-deleted' && typeof message.id === 'string' && message.id)
      markDeleted(message.id);
  });
  syncIdentity();
  return {
    api,
    url,
    upload,
    remove,
    size: formatFileSize,
    limits: FILE_LIMITS,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      for (const cancel of [...uploads]) cancel();
      disposed = true;
      cache.clear();
      pendingUrls.clear();
      unsubscribeIdentity();
      unsubscribeMessages();
      listeners.clear();
    },
  };
}
export type FilesClient = ReturnType<typeof createFiles>;
