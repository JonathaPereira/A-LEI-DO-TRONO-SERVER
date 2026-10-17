import type { VoiceMediaKind } from '../../types/voice';
import { errorCode } from './sfu-protocol.ts';

export const globalSfuFailure = (error: unknown) =>
  [
    'REALTIME_DISABLED',
    'REALTIME_NOT_CONFIGURED',
    'REALTIME_HARD_LIMIT',
    'SFU_ROOM_SAFETY_LIMIT',
  ].includes(errorCode(error));
interface RecoveryOptions {
  active(): boolean;
  track(kind: VoiceMediaKind): MediaStreamTrack | null | undefined;
  publish(kind: VoiceMediaKind, track: MediaStreamTrack): Promise<unknown>;
  exhausted(kind: VoiceMediaKind, error: unknown): Promise<unknown> | unknown;
  report?(kind: VoiceMediaKind, error: unknown, attempt: number, done: boolean): void;
  now?: () => number;
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
}
interface RecoveryJob {
  track: MediaStreamTrack;
  controller: AbortController;
  promise: Promise<boolean>;
}
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}
/** Retry a single borrowed capture. Only the owner chooses a room-wide fallback. */
export class SfuPublicationRecovery {
  private readonly jobs = new Map<VoiceMediaKind, RecoveryJob>();
  constructor(privateOptions: RecoveryOptions) {
    this.options = privateOptions;
  }
  private readonly options: RecoveryOptions;
  get size() {
    return this.jobs.size;
  }
  cancel(kind: VoiceMediaKind) {
    this.jobs.get(kind)?.controller.abort();
    this.jobs.delete(kind);
  }
  clear() {
    for (const kind of this.jobs.keys()) this.cancel(kind);
  }
  recover(kind: VoiceMediaKind, error: unknown): Promise<boolean> {
    const track = this.options.track(kind),
      previous = this.jobs.get(kind);
    if (previous && previous.track === track) return previous.promise;
    this.cancel(kind);
    if (!this.options.active() || !track || track.readyState !== 'live')
      return Promise.resolve(false);
    const job: RecoveryJob = {
      track,
      controller: new AbortController(),
      promise: Promise.resolve(false),
    };
    this.jobs.set(kind, job);
    const current = () =>
      !job.controller.signal.aborted &&
      this.jobs.get(kind) === job &&
      this.options.active() &&
      this.options.track(kind) === track &&
      track.readyState === 'live';
    job.promise = (async () => {
      let last = error;
      const now = this.options.now ?? Date.now,
        start = now(),
        limit = kind === 'audio' ? 2 : 4;
      for (let attempt = 1; attempt <= limit; attempt++) {
        if (!current()) return false;
        if (
          globalSfuFailure(last) ||
          ['SCREEN_BUDGET_BLOCKED', 'SFU_CANCELLED'].includes(errorCode(last))
        )
          break;
        this.options.report?.(kind, last, attempt, false);
        await (this.options.delay ?? delay)(
          Math.min(8000, 500 * 2 ** (attempt - 1)),
          job.controller.signal,
        );
        if (!current()) return false;
        try {
          await this.options.publish(kind, track);
          return current();
        } catch (error) {
          last = error;
          if (now() - start >= (kind === 'audio' ? 15000 : 60000)) break;
        }
      }
      if (current() && errorCode(last) !== 'SFU_CANCELLED') {
        this.options.report?.(kind, last, limit, true);
        await this.options.exhausted(kind, last);
      }
      return false;
    })().finally(() => {
      if (this.jobs.get(kind) === job) this.jobs.delete(kind);
    });
    return job.promise;
  }
}

interface QueueJob {
  version: string;
  cancelled: boolean;
  started: boolean;
  promise: Promise<unknown>;
  resolve(value: unknown): void;
}
interface QueuedTask {
  key: string;
  job: QueueJob;
  current(): boolean;
  task(current: () => boolean): unknown;
  reject(error: unknown): void;
}
interface Pool {
  active: number;
  limit: number;
  queue: QueuedTask[];
}
/** Voice has three slots; video/screen have two independent slots. */
export class SfuSubscriptionQueue {
  private readonly jobs = new Map<string, QueueJob>();
  private pools = this.createPools();
  private createPools() {
    return {
      audio: { active: 0, limit: 3, queue: [] } as Pool,
      media: { active: 0, limit: 2, queue: [] } as Pool,
    };
  }
  get size() {
    return this.jobs.size;
  }
  keys() {
    return this.jobs.keys();
  }
  cancel(key: string) {
    const job = this.jobs.get(key);
    if (job) {
      job.cancelled = true;
      if (!job.started) job.resolve(false);
    }
    this.jobs.delete(key);
  }
  clear() {
    for (const key of this.jobs.keys()) this.cancel(key);
    this.pools = this.createPools();
  }
  schedule(
    key: string,
    kind: VoiceMediaKind,
    version: string,
    task: QueuedTask['task'],
  ): Promise<unknown> {
    const previous = this.jobs.get(key);
    if (previous?.version === version) return previous.promise;
    this.cancel(key);
    let resolve!: QueueJob['resolve'], reject!: QueuedTask['reject'];
    const promise = new Promise<unknown>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const job: QueueJob = { version, cancelled: false, started: false, promise, resolve };
    this.jobs.set(key, job);
    const pool = this.pools[kind === 'audio' ? 'audio' : 'media'];
    pool.queue.push({
      key,
      job,
      current: () => !job.cancelled && this.jobs.get(key) === job,
      task,
      reject,
    });
    this.drain(pool);
    return promise;
  }
  private drain(pool: Pool) {
    while (pool.active < pool.limit && pool.queue.length) {
      const entry = pool.queue.shift()!;
      if (!entry.current()) {
        entry.job.resolve(false);
        continue;
      }
      pool.active++;
      entry.job.started = true;
      void Promise.resolve()
        .then(() => (entry.current() ? entry.task(entry.current) : false))
        .then(entry.job.resolve, entry.reject)
        .finally(() => {
          pool.active--;
          if (this.jobs.get(entry.key) === entry.job) this.jobs.delete(entry.key);
          this.drain(pool);
        });
    }
  }
}
