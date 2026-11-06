import { object } from './http-api.ts';
import { fileError, storageUnavailable } from './files-contract.ts';

/** Privileged DB adapter, never exposed to the renderer. Secret keys don't use Bearer auth. */
export function createStorageDatabase({
  url,
  key,
  fetchImpl,
  signal,
}: {
  url: string;
  key: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}) {
  return async function db(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: unknown,
    caller?: AbortSignal,
  ): Promise<unknown> {
    const current = AbortSignal.any([
      signal,
      AbortSignal.timeout(15000),
      ...(caller ? [caller] : []),
    ]);
    if (current.aborted) throw storageUnavailable();
    let response: Response, raw: string;
    try {
      response = await fetchImpl(url + '/rest/v1/' + path, {
        method,
        headers: {
          apikey: key,
          ...(!key.startsWith('sb_secret_') ? { Authorization: 'Bearer ' + key } : {}),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: current,
      });
      raw = await response.text();
    } catch {
      throw storageUnavailable();
    }
    if (current.aborted) throw storageUnavailable();
    let data: unknown = null;
    try {
      if (raw) data = JSON.parse(raw);
      else if (response.ok && response.status !== 204 && response.status !== 205)
        throw storageUnavailable();
    } catch {
      if (response.ok) throw storageUnavailable();
    }
    if (!response.ok) {
      const message = object(data) && typeof data.message === 'string' ? data.message : '';
      const copy: Record<string, string> = {
        STORAGE_FULL: 'Armazenamento de 8 GB cheio. Exclua anexos para liberar espaço.',
        FILE_TOO_LARGE: 'Arquivo acima do limite permitido.',
        UPLOAD_BUSY: 'Aguarde os envios em andamento.',
        AVATAR_IN_USE: 'Troque seu ícone antes de excluir essa foto.',
        FRIEND_REQUIRED: 'Adicione esta pessoa aos amigos antes de enviar anexos.',
        INVALID_ATTACHMENT: 'Esse anexo não está disponível nesta conversa.',
      };
      const reason = Object.keys(copy).find((code) => message.includes(code));
      throw fileError(
        reason || 'STORAGE_UNAVAILABLE',
        reason
          ? copy[reason]
          : 'Armazenamento indisponível. Confira a configuração e a atualização SQL.',
        reason === 'FRIEND_REQUIRED' ? 403 : reason ? 409 : 503,
      );
    }
    return data;
  };
}
