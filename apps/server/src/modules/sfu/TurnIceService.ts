import { withAbort } from './CloudflareCallsClient.ts';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceConfiguration {
  iceServers: IceServer[];
  turn: boolean;
}

export interface TurnIceServiceOptions {
  enabled: boolean;
  keyId: string;
  token: string;
  ttl: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const DEFAULT_STUN_SERVERS: IceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478'] }];

/** Short-lived Cloudflare TURN credentials cached in memory per backend instance. */
export class TurnIceService {
  private readonly enabled: boolean;
  private readonly keyId: string;
  private readonly token: string;
  private readonly ttl: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly lifetime = new AbortController();
  private cache?: { iceServers: IceServer[]; expiresAt: number };

  constructor({
    enabled,
    keyId,
    token,
    ttl,
    fetchImpl = fetch,
    now = Date.now,
  }: TurnIceServiceOptions) {
    this.enabled = enabled;
    this.keyId = keyId;
    this.token = token;
    this.ttl = ttl;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  configured(): boolean {
    return !!(this.keyId && this.token);
  }

  async configuration(signal?: AbortSignal): Promise<IceConfiguration> {
    const current = AbortSignal.any([
      this.lifetime.signal,
      AbortSignal.timeout(10_000),
      ...(signal ? [signal] : []),
    ]);
    current.throwIfAborted();

    if (!this.enabled || !this.keyId || !this.token) {
      return { iceServers: DEFAULT_STUN_SERVERS, turn: false };
    }

    const now = this.now();
    if (this.cache && this.cache.expiresAt > now + 300_000) {
      return { iceServers: this.cache.iceServers, turn: true };
    }

    const response = await withAbort(
      this.fetchImpl(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.keyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: this.ttl }),
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

    if (iceServers.length !== data.iceServers.length) {
      throw new Error('Invalid TURN response');
    }

    this.cache = { iceServers, expiresAt: now + this.ttl * 1000 };
    return { iceServers, turn: true };
  }

  stop(): void {
    this.lifetime.abort();
    this.cache = undefined;
  }
}
