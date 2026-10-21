import { authError, authUnavailable, providerError } from './auth-errors.ts';

export interface AuthProviderOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

/** The only account-provider transport. Its service owns timeout and shutdown cancellation. */
export function createAuthProvider({
  url,
  key,
  configured,
  signal,
  fetchImpl,
}: {
  url: string;
  key: string;
  configured: boolean;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
}) {
  function assertAvailable() {
    if (!configured)
      throw authError(
        'AUTH_UNAVAILABLE',
        'O acesso às contas está temporariamente indisponível. Tente novamente mais tarde.',
        503,
      );
    if (signal.aborted) throw authUnavailable();
  }
  async function request(path: string, options: AuthProviderOptions = {}): Promise<unknown> {
    assertAvailable();
    const current = AbortSignal.any([
      signal,
      AbortSignal.timeout(12_000),
      ...(options.signal ? [options.signal] : []),
    ]);
    if (current.aborted) throw authUnavailable();
    let response: Response, raw: string;
    try {
      response = await fetchImpl(`${url}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          apikey: key,
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: current,
      });
      raw = await response.text();
    } catch {
      throw authUnavailable();
    }
    // Adapters that finish after cancellation must not revive a closed account operation.
    if (current.aborted) throw authUnavailable();
    let data: unknown = null;
    try {
      if (raw) data = JSON.parse(raw);
      else if (response.ok && response.status !== 204 && response.status !== 205)
        throw Error('empty provider response');
    } catch {
      if (response.ok) throw authUnavailable();
    }
    if (!response.ok) providerError(path, response.status, data);
    return data;
  }
  return { assertAvailable, request };
}
