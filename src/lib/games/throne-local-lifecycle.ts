export interface ThroneLocalTurn {
  readonly deadline: number;
  cancel(): void;
  current(): boolean;
}
export interface ThroneLocalRun {
  assert(): void;
  check<T>(value: T): T;
  wait<T>(work: PromiseLike<T>): Promise<T>;
  delay(milliseconds: number): Promise<void>;
  turn(milliseconds: number, expired: () => void): ThroneLocalTurn;
  clearTurn(): void;
}
export interface ThroneLocalLifecycleSnapshot {
  readonly phase: 'idle' | 'preparing' | 'running';
  readonly demo: boolean;
  readonly available: boolean;
}
interface Options {
  source(): { key: string; online: boolean; allowed: boolean };
  subscribeSource(fn: () => void): () => void;
  prepare(): PromiseLike<unknown>;
  reset(): void;
  execute(run: ThroneLocalRun, demo: boolean): PromiseLike<void>;
  cancelled(run: ThroneLocalRun): void;
  error(error: unknown): void;
  now(): number;
  schedule(fn: () => void, milliseconds: number): () => void;
}
const aborted = () => Object.assign(new Error('Partida local encerrada.'), { name: 'AbortError' });
/** Owns local preparation, waits and timers; never owns cards, sockets or media. */
export function createThroneLocalLifecycle(options: Options) {
  let state: ThroneLocalLifecycleSnapshot = Object.freeze({
    phase: 'idle',
    demo: false,
    available: false,
  });
  let disposed = false,
    release: (() => void) | null = null;
  const listeners = new Set<() => void>();
  let current: {
    run: ThroneLocalRun;
    key: string;
    done: Promise<void>;
    reject: Set<(error: Error) => void>;
    timers: Set<() => void>;
  } | null = null;
  function update(phase = state.phase, demo = state.demo) {
    if (disposed) return;
    const source = options.source(),
      available = source.allowed && !source.online;
    if (state.phase === phase && state.demo === demo && state.available === available) return;
    state = Object.freeze({ phase, demo, available });
    listeners.forEach((fn) => fn());
  }
  function cancel() {
    const previous = current;
    if (!previous) return;
    current = null;
    previous.timers.forEach((off) => off());
    previous.reject.forEach((reject) => reject(aborted()));
    previous.reject.clear();
    update('idle', false);
    options.cancelled(previous.run);
  }
  function sync() {
    if (disposed) return;
    const source = options.source();
    if (
      current &&
      (source.key !== current.key ||
        source.online ||
        (state.phase === 'preparing' && !source.allowed))
    )
      cancel();
    update();
  }
  function start(demo: boolean): Promise<void> {
    sync();
    if (disposed) return Promise.resolve();
    if (current) return current.done;
    if (!state.available) return Promise.resolve();
    const reject = new Set<(error: Error) => void>(),
      timers = new Set<() => void>();
    let finish!: () => void,
      turn: ThroneLocalTurn | null = null;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const run: ThroneLocalRun = {
      assert() {
        sync();
        if (disposed || current?.run !== run) throw aborted();
      },
      check(value) {
        run.assert();
        return value;
      },
      wait(work) {
        return new Promise((resolve, fail) => {
          let settled = false;
          const failOnce = (error: unknown) => {
            if (settled) return;
            settled = true;
            reject.delete(failOnce);
            fail(error);
          };
          // Observe even a work promise that lost its session before registration.
          Promise.resolve(work).then((value) => {
            if (settled) return;
            try {
              run.assert();
            } catch (error) {
              failOnce(error);
              return;
            }
            settled = true;
            reject.delete(failOnce);
            resolve(value);
          }, failOnce);
          try {
            run.assert();
            reject.add(failOnce);
          } catch (error) {
            failOnce(error);
          }
        });
      },
      delay(milliseconds) {
        run.assert();
        return run.wait(new Promise<void>((resolve) => schedule(milliseconds, resolve)));
      },
      turn(milliseconds, expired) {
        run.assert();
        run.clearTurn();
        const ticket: ThroneLocalTurn = {
          deadline: options.now() + milliseconds,
          current: () => current?.run === run && turn === ticket,
          cancel() {
            off();
            if (turn === ticket) turn = null;
          },
        };
        const off = schedule(milliseconds, () => {
          if (turn !== ticket) return;
          turn = null;
          expired();
        });
        turn = ticket;
        return ticket;
      },
      clearTurn() {
        turn?.cancel();
      },
    };
    function schedule(milliseconds: number, fn: () => void) {
      run.assert();
      let active = true;
      const off = () => {
        if (!active) return;
        active = false;
        stop();
        timers.delete(off);
      };
      const stop = options.schedule(
        () => {
          if (!active) return;
          off();
          try {
            run.assert();
            fn();
          } catch (error) {
            if (current?.run === run) {
              cancel();
              options.error(error);
            }
          }
        },
        Math.max(0, milliseconds),
      );
      timers.add(off);
      return off;
    }
    current = { run, done, key: options.source().key, reject, timers };
    update('preparing', demo);
    void (async () => {
      try {
        run.check(await run.wait(options.prepare()));
        options.reset();
        run.assert();
        update('running', demo);
        run.check(await run.wait(options.execute(run, demo)));
      } catch (error) {
        const relevant = current?.run === run;
        if (relevant) cancel();
        if (relevant && !(error instanceof Error && error.name === 'AbortError'))
          options.error(error);
      } finally {
        if (current?.run === run) cancel();
        finish();
      }
    })();
    return done;
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start,
    cancel,
    initialize() {
      if (disposed || release) return;
      sync();
      release = options.subscribeSource(sync);
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      release?.();
      release = null;
      listeners.clear();
      state = Object.freeze({ phase: 'idle', demo: false, available: false });
    },
  };
}
export type ThroneLocalLifecycle = ReturnType<typeof createThroneLocalLifecycle>;
