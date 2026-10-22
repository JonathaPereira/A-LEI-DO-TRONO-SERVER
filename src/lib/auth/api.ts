import { isRecord } from '../socket/protocol.ts';

export class AuthError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}
export interface AuthRequest {
  (
    path: string,
    body?: unknown,
    token?: string | null,
    method?: 'GET' | 'POST',
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
}
/** The application server owns the Supabase contract. Browser calls carry no provider secrets or cookies. */
export function createAuthApi({
  base,
  fetch: request,
  timeoutMs = 20000,
}: {
  base: string;
  fetch: typeof fetch;
  timeoutMs?: number;
}): AuthRequest {
  return async (path, body, token, method = 'POST', signal) => {
    signal?.throwIfAborted();
    const controller = new AbortController(),
      relay = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', relay, { once: true });
    const timer = setTimeout(
      () => controller.abort(new DOMException('Tempo limite de autenticação.', 'TimeoutError')),
      timeoutMs,
    );
    try {
      let response: Response;
      try {
        response = await request(`${base}/auth/${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        throw new AuthError(
          'Não foi possível conectar. Aguarde alguns segundos e tente novamente.',
          'NETWORK_ERROR',
        );
      }
      const data: unknown = await response.json().catch(() => null);
      signal?.throwIfAborted();
      if (!response.ok) {
        const detail = isRecord(data) && isRecord(data.error) ? data.error : null;
        throw new AuthError(
          typeof detail?.message === 'string'
            ? detail.message
            : 'Não foi possível concluir. Tente novamente.',
          typeof detail?.code === 'string' ? detail.code : 'AUTH_ERROR',
          response.status,
        );
      }
      if (!isRecord(data))
        throw new AuthError('Resposta de autenticação inválida.', 'AUTH_RESPONSE');
      return data;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', relay);
    }
  };
}
