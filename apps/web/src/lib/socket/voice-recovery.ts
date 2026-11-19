import type { SocketMessage, SocketTransport } from '../../types/socket';

export interface VoiceRecoveryIdentity {
  resumeToken: string;
  accountId?: string;
  guest?: { id: string; nickname: string; ticket: string; expiresAt: number };
}
interface Options {
  transport: Pick<SocketTransport, 'connect' | 'disconnect'>;
  identity(): VoiceRecoveryIdentity | null;
  restore(identity: VoiceRecoveryIdentity, current: () => boolean): Promise<SocketMessage>;
  deliver(message: SocketMessage): void;
  restored(result: SocketMessage): void;
  windowMs?: number;
}
interface Recovery {
  identity: VoiceRecoveryIdentity;
  deadline: ReturnType<typeof setTimeout>;
  retry?: ReturnType<typeof setTimeout>;
  welcome?: SocketMessage;
  buffered: SocketMessage[];
  attempts: number;
  promise: Promise<void>;
  finish(): void;
}

/** A bounded retry on the existing transport. It never captures or releases media. */
export function createVoiceRecovery(options: Options) {
  let active: Recovery | undefined;
  let suppressClose = false;
  function clear(job: Recovery) {
    clearTimeout(job.deadline);
    clearTimeout(job.retry);
    if (active === job) active = undefined;
    job.finish();
  }
  function fail(job: Recovery, code?: number) {
    if (active !== job) return;
    clear(job);
    suppressClose = true;
    try {
      options.transport.disconnect();
    } finally {
      suppressClose = false;
    }
    options.deliver({
      type: 'connection',
      connected: false,
      recovering: false,
      code,
      recoveryFailed: true,
    });
  }
  async function attempt(job: Recovery) {
    const current = () => active === job;
    try {
      if (!(await options.transport.connect()) || !current()) throw Error('offline');
      const result = await options.restore(job.identity, current);
      if (!current()) return;
      if (
        result.resumed !== true ||
        typeof result.clientId !== 'string' ||
        typeof result.resumeToken !== 'string'
      ) {
        fail(job);
        return;
      }
      const welcome = job.welcome;
      clear(job);
      options.restored(result);
      if (welcome) options.deliver({ ...welcome, clientId: result.clientId });
      options.deliver({ type: 'connection', connected: true, resumed: true });
      const { authToken: _privateToken, ...publicResult } = result;
      options.deliver(publicResult);
      for (const message of job.buffered) options.deliver(message);
    } catch (error) {
      if (!current()) return;
      const code = (error as { code?: string })?.code;
      if (
        [
          'AUTH_REQUIRED',
          'AUTH_EXPIRED',
          'INVALID_CREDENTIALS',
          'RECOVERY_IDENTITY_CHANGED',
        ].includes(code || '')
      ) {
        fail(job);
        return;
      }
      // One attempt at a time; temporary transport/auth-provider failures use bounded backoff.
      job.retry = setTimeout(() => void attempt(job), Math.min(4000, 500 * 2 ** job.attempts++));
    }
  }
  return {
    get pending() {
      return active?.promise;
    },
    cancel() {
      if (active) clear(active);
    },
    filter(message: SocketMessage): SocketMessage | null {
      if (suppressClose) return null;
      if (message.type === 'connection' && message.connected === false) {
        if ([1000, 1001, 4001, 4002].includes(Number(message.code))) {
          if (active) clear(active);
          return message;
        }
        if (!active) {
          const identity = options.identity();
          if (!identity) return message;
          let finish!: () => void;
          const job: Recovery = {
            identity,
            attempts: 0,
            buffered: [],
            promise: new Promise<void>((r) => {
              finish = r;
            }),
            finish: () => finish(),
            deadline: setTimeout(() => fail(job), options.windowMs ?? 45000),
          };
          active = job;
          job.retry = setTimeout(() => void attempt(job), 300);
        }
        return { ...message, recovering: true };
      }
      if (active) {
        if (message.type === 'welcome') active.welcome = message;
        else if (message.type !== 'connection' && !message.requestId) {
          if (active.buffered.length >= 100) {
            fail(active);
            return null;
          }
          active.buffered.push(message);
        }
        return null;
      }
      return message;
    },
  };
}
