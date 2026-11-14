import net from 'node:net';
import tls from 'node:tls';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, max: number, windowMs: number): Promise<RateLimitResult>;
  getLockout(key: string): Promise<number>;
  recordFailure(key: string, scheduleMs: readonly number[], threshold?: number): Promise<number>;
  clearFailures(key: string): Promise<void>;
  stop(): Promise<void> | void;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly rates = new Map<string, { count: number; until: number }>();
  private readonly failures = new Map<
    string,
    { count: number; lockedUntil: number; seenAt: number }
  >();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.rates) {
        if (v.until <= now) this.rates.delete(k);
      }
      for (const [k, v] of this.failures) {
        if (v.lockedUntil <= now && now - v.seenAt > 3_600_000) {
          this.failures.delete(k);
        }
      }
    }, 60_000);
    this.cleanupTimer.unref();
  }

  async consume(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    let entry = this.rates.get(key);
    if (!entry || entry.until <= now) {
      entry = { count: 0, until: now + windowMs };
      this.rates.set(key, entry);
    }
    entry.count++;
    const remainingMs = Math.max(0, entry.until - now);
    return {
      allowed: entry.count <= max,
      count: entry.count,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }

  async getLockout(key: string): Promise<number> {
    const entry = this.failures.get(key);
    if (!entry) return 0;
    const remaining = entry.lockedUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  async recordFailure(key: string, scheduleMs: readonly number[], threshold = 5): Promise<number> {
    const now = Date.now();
    const entry = this.failures.get(key) || { count: 0, lockedUntil: 0, seenAt: now };
    entry.count++;
    entry.seenAt = now;
    if (entry.count >= threshold && scheduleMs.length > 0) {
      const idx = Math.min(entry.count - threshold, scheduleMs.length - 1);
      const duration = scheduleMs[idx];
      entry.lockedUntil = now + duration;
      this.failures.set(key, entry);
      return duration;
    }
    this.failures.set(key, entry);
    return 0;
  }

  async clearFailures(key: string): Promise<void> {
    this.failures.delete(key);
  }

  stop(): void {
    clearInterval(this.cleanupTimer);
    this.rates.clear();
    this.failures.clear();
  }
}

function encodeResp(args: string[]): Buffer {
  const parts: string[] = [`*${args.length}\r\n`];
  for (const arg of args) {
    const len = Buffer.byteLength(arg, 'utf8');
    parts.push(`$${len}\r\n${arg}\r\n`);
  }
  return Buffer.from(parts.join(''), 'utf8');
}

interface RespParserState {
  buf: Buffer;
}

function tryReadResp(state: RespParserState): { value: string | number | null } | undefined {
  const str = state.buf.toString('utf8');
  const crlf = str.indexOf('\r\n');
  if (crlf === -1) return undefined;
  const prefix = str[0];
  const header = str.slice(1, crlf);
  if (prefix === '+' || prefix === ':') {
    const byteLen = Buffer.byteLength(str.slice(0, crlf + 2), 'utf8');
    state.buf = state.buf.subarray(byteLen);
    return { value: prefix === ':' ? Number(header) : header };
  }
  if (prefix === '-') {
    const byteLen = Buffer.byteLength(str.slice(0, crlf + 2), 'utf8');
    state.buf = state.buf.subarray(byteLen);
    throw new Error(`Redis error: ${header}`);
  }
  if (prefix === '$') {
    const len = Number(header);
    const headerBytes = Buffer.byteLength(str.slice(0, crlf + 2), 'utf8');
    if (len === -1) {
      state.buf = state.buf.subarray(headerBytes);
      return { value: null };
    }
    if (state.buf.length < headerBytes + len + 2) return undefined;
    const val = state.buf.subarray(headerBytes, headerBytes + len).toString('utf8');
    state.buf = state.buf.subarray(headerBytes + len + 2);
    return { value: val };
  }
  throw new Error('Unsupported RESP type');
}

export class RedisRateLimiter implements RateLimiter {
  private readonly url: URL;
  private readonly fallback = new MemoryRateLimiter();
  private socket: net.Socket | null = null;
  private connecting: Promise<net.Socket> | null = null;
  private closed = false;
  private queue: Array<{
    resolve: (v: string | number | null) => void;
    reject: (e: Error) => void;
  }> = [];
  private parser: RespParserState = { buf: Buffer.alloc(0) };

  constructor(redisUrl: string) {
    this.url = new URL(redisUrl);
  }

  private async getSocket(): Promise<net.Socket> {
    if (this.closed) throw new Error('RateLimiter closed');
    if (this.socket && !this.socket.destroyed) return this.socket;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<net.Socket>((resolve, reject) => {
      const port = Number(this.url.port || 6379);
      const host = this.url.hostname;
      const isTls = this.url.protocol === 'rediss:';
      const sock = isTls
        ? tls.connect({ host, port, servername: host })
        : net.createConnection({ host, port });

      const onError = (err: Error) => {
        sock.destroy();
        this.connecting = null;
        reject(err);
      };
      sock.once('error', onError);
      sock.once(isTls ? 'secureConnect' : 'connect', async () => {
        sock.removeListener('error', onError);
        sock.unref();
        this.socket = sock;
        this.parser = { buf: Buffer.alloc(0) };
        sock.on('data', (chunk) => {
          this.parser.buf = Buffer.concat([this.parser.buf, chunk]);
          try {
            while (this.queue.length > 0) {
              const parsed = tryReadResp(this.parser);
              if (!parsed) break;
              const next = this.queue.shift()!;
              next.resolve(parsed.value);
            }
          } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            while (this.queue.length > 0) this.queue.shift()!.reject(e);
            sock.destroy();
          }
        });
        sock.on('close', () => {
          if (this.socket === sock) this.socket = null;
          while (this.queue.length > 0) {
            this.queue.shift()!.reject(new Error('Redis connection closed'));
          }
        });
        sock.on('error', () => {
          sock.destroy();
        });
        try {
          if (this.url.password) {
            const args = this.url.username
              ? [
                  'AUTH',
                  decodeURIComponent(this.url.username),
                  decodeURIComponent(this.url.password),
                ]
              : ['AUTH', decodeURIComponent(this.url.password)];
            await this.rawCommand(sock, args);
          }
          const db = this.url.pathname.replace(/^\//, '');
          if (db && /^\d+$/.test(db) && db !== '0') {
            await this.rawCommand(sock, ['SELECT', db]);
          }
          this.connecting = null;
          resolve(sock);
        } catch (err) {
          this.connecting = null;
          sock.destroy();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
    return this.connecting;
  }

  private rawCommand(sock: net.Socket, args: string[]): Promise<string | number | null> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Redis command timeout'));
      }, 2000);
      timer.unref?.();
      this.queue.push({
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      sock.write(encodeResp(args));
    });
  }

  private async command(args: string[]): Promise<string | number | null> {
    const sock = await this.getSocket();
    return this.rawCommand(sock, args);
  }

  async consume(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
    try {
      const rKey = `rl:${key}`;
      const count = Number(await this.command(['INCR', rKey]));
      if (count === 1) {
        await this.command(['PEXPIRE', rKey, String(windowMs)]);
      }
      const pttl = Number(await this.command(['PTTL', rKey]));
      const remainingMs = pttl > 0 ? pttl : windowMs;
      return {
        allowed: count <= max,
        count,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    } catch {
      return this.fallback.consume(key, max, windowMs);
    }
  }

  async getLockout(key: string): Promise<number> {
    try {
      const pttl = Number(await this.command(['PTTL', `lock:${key}`]));
      return pttl > 0 ? pttl : 0;
    } catch {
      return this.fallback.getLockout(key);
    }
  }

  async recordFailure(key: string, scheduleMs: readonly number[], threshold = 5): Promise<number> {
    try {
      const fKey = `fail:${key}`;
      const count = Number(await this.command(['INCR', fKey]));
      await this.command(['PEXPIRE', fKey, '3600000']);
      if (count >= threshold && scheduleMs.length > 0) {
        const idx = Math.min(count - threshold, scheduleMs.length - 1);
        const duration = scheduleMs[idx];
        await this.command(['SET', `lock:${key}`, '1', 'PX', String(duration)]);
        return duration;
      }
      return 0;
    } catch {
      return this.fallback.recordFailure(key, scheduleMs, threshold);
    }
  }

  async clearFailures(key: string): Promise<void> {
    try {
      await this.command(['DEL', `fail:${key}`, `lock:${key}`]);
    } catch {
      await this.fallback.clearFailures(key);
    }
  }

  stop(): void {
    this.closed = true;
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
    this.socket = null;
    this.fallback.stop();
  }
}

export function createRateLimiter(env: NodeJS.ProcessEnv = process.env): RateLimiter {
  const redisUrl = String(env.REDIS_URL || '').trim();
  if (redisUrl && /^rediss?:\/\//.test(redisUrl)) {
    return new RedisRateLimiter(redisUrl);
  }
  return new MemoryRateLimiter();
}
