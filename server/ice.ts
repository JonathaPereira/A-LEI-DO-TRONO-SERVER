import { withAbort } from './abortable.ts';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceConfiguration {
  iceServers: IceServer[];
  turn: boolean;
}

interface TurnProviderOptions {
  enabled: boolean;
  keyId: string;
  token: string;
  ttl: number;
  fetchImpl?: typeof fetch;
}

/** Credentials are short-lived and cached only in this backend instance. */
export function createIceProvider({
  enabled,
  keyId,
  token,
  ttl,
  fetchImpl = fetch,
}: TurnProviderOptions) {
  let cache: { iceServers: IceServer[]; expiresAt: number } | undefined;
  const lifetime = new AbortController();

  async function configuration(signal?: AbortSignal): Promise<IceConfiguration> {
    const current = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(10000),
      ...(signal ? [signal] : []),
    ]);
    current.throwIfAborted();
    if (!enabled || !keyId || !token) {
      return { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }], turn: false };
    }
    const now = Date.now();
    if (cache && cache.expiresAt > now + 300000)
      return { iceServers: cache.iceServers, turn: true };
    const response = await withAbort(
      fetchImpl(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl }),
          signal: current,
        },
      ),
      current,
    );
    const data: unknown = await withAbort(
      response.json().catch(() => null),
      current,
    );
    current.throwIfAborted();
    if (
      !response.ok ||
      !data ||
      typeof data !== 'object' ||
      !('iceServers' in data) ||
      !Array.isArray(data.iceServers)
    ) {
      throw new Error(`TURN HTTP ${response.status}`);
    }
    const iceServers = data.iceServers.filter(
      (item: unknown): item is IceServer =>
        !!item &&
        typeof item === 'object' &&
        'urls' in item &&
        Array.isArray(item.urls) &&
        item.urls.length > 0 &&
        item.urls.every((url: unknown) => typeof url === 'string') &&
        (!('username' in item) || typeof item.username === 'string') &&
        (!('credential' in item) || typeof item.credential === 'string'),
    );
    if (iceServers.length !== data.iceServers.length) throw new Error('Invalid TURN response');
    cache = { iceServers, expiresAt: now + ttl * 1000 };
    return { iceServers, turn: true };
  }

  return {
    configuration,
    stop() {
      lifetime.abort();
      cache = undefined;
    },
  };
}
