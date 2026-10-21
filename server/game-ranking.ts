import { object } from './http-api.ts';

/** Privileged match persistence/listing. Callers supply the domain's complete record reader. */
export function createGameRanking<Record>({
  game,
  configured,
  url,
  key,
  fetchImpl,
  signal,
  read,
  unavailable,
}: {
  game: 'azul' | 'splendor';
  configured: boolean;
  url: string;
  key: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  read(value: unknown): Record[];
  unavailable(configured: boolean): Error;
}) {
  let ready = false;
  async function rpc<T>(
    name: string,
    body: unknown,
    parse: (value: unknown) => T,
    caller?: AbortSignal,
  ): Promise<T> {
    if (!configured || signal.aborted) throw unavailable(configured);
    const current = AbortSignal.any([
      signal,
      AbortSignal.timeout(12000),
      ...(caller ? [caller] : []),
    ]);
    if (current.aborted) throw unavailable(configured);
    try {
      const response = await fetchImpl(url + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: {
          apikey: key,
          ...(!key.startsWith('sb_secret_') ? { Authorization: 'Bearer ' + key } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: current,
      });
      if (!response.ok) throw unavailable(configured);
      const value: unknown = await response.json();
      if (current.aborted) throw unavailable(configured);
      const result = parse(value);
      ready = true;
      return result;
    } catch {
      // Deliberate caller cancellation says nothing about provider health.
      if (!signal.aborted && !caller?.aborted) ready = false;
      throw unavailable(configured);
    }
  }
  return {
    get ready() {
      return !signal.aborted && ready;
    },
    list(caller?: AbortSignal) {
      return rpc(game + '_top_five', {}, read, caller);
    },
    save(body: unknown) {
      return rpc(game + '_record_match', body, (value) => {
        if (!object(value) || value.saved !== true) throw unavailable(configured);
      });
    },
  };
}
