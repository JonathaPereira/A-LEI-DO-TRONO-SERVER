'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modulePromise = import('../src/lib/games/throne-local-lifecycle.ts');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function fixture() {
  const { createThroneLocalLifecycle } = await modulePromise;
  let source = { key: 'a:room', online: false, allowed: true },
    time = 1000;
  let audio = () => Promise.resolve(),
    execute = () => new Promise(() => {}),
    reset = 0;
  const sources = new Set(),
    timers = new Set(),
    runs = [],
    cancelled = [],
    errors = [];
  const c = createThroneLocalLifecycle({
    source: () => source,
    subscribeSource(fn) {
      sources.add(fn);
      return () => sources.delete(fn);
    },
    prepare: () => audio(),
    reset: () => reset++,
    execute(run, demo) {
      runs.push({ run, demo });
      return execute(run, demo);
    },
    cancelled: (run) => cancelled.push(run),
    error: (error) => errors.push(error),
    now: () => time,
    schedule(fn, ms) {
      const job = { fn, ms, stopped: false };
      timers.add(job);
      return () => {
        job.stopped = true;
        timers.delete(job);
      };
    },
  });
  c.initialize();
  return {
    c,
    runs,
    cancelled,
    errors,
    sources,
    timers,
    source(patch) {
      source = { ...source, ...patch };
      sources.forEach((fn) => fn());
    },
    audio(fn) {
      audio = fn;
    },
    execute(fn) {
      execute = fn;
    },
    get resets() {
      return reset;
    },
    fire(job) {
      time += job.ms;
      job.fn();
    },
  };
}
test('preparation is deduplicated and cannot launch after navigation, identity ABA, room change or online start', async () => {
  for (const action of ['navigation', 'identity', 'room', 'online']) {
    const f = await fixture(),
      audio = deferred();
    f.audio(() => audio.promise);
    const pending = f.c.start(false);
    assert.equal(f.c.start(true), pending);
    assert.equal(f.c.getSnapshot().phase, 'preparing');
    assert.equal(f.resets, 0);
    if (action === 'navigation') f.source({ allowed: false });
    if (action === 'identity') {
      f.source({ key: 'b:room' });
      f.source({ key: 'a:room' });
    }
    if (action === 'room') f.source({ key: 'a:other' });
    if (action === 'online') f.source({ online: true });
    await pending;
    audio.resolve();
    await flush();
    assert.equal(f.runs.length, 0);
    assert.equal(f.resets, 0);
    assert.equal(f.cancelled.length, 1);
    assert.deepEqual(f.errors, []);
    f.c.dispose();
    assert.equal(f.sources.size, 0);
  }
});
test('cancelling a run rejects every waiting boundary and owns its timer cleanup without waiting for external promises', async () => {
  const f = await fixture(),
    effect = deferred();
  let waiting, sleeping;
  f.execute((run) => {
    waiting = assert.rejects(run.wait(effect.promise), { name: 'AbortError' });
    sleeping = assert.rejects(run.delay(1000), { name: 'AbortError' });
    return new Promise(() => {});
  });
  const pending = f.c.start(true);
  await flush();
  const oldTimer = [...f.timers][0],
    old = f.runs[0].run;
  f.c.cancel();
  await pending;
  await waiting;
  await sleeping;
  assert.equal(f.timers.size, 0);
  assert.throws(() => old.assert(), { name: 'AbortError' });
  effect.reject(new Error('late effect failure'));
  f.fire(oldTimer);
  await flush();
  assert.deepEqual(f.errors, []);
  assert.equal(f.c.getSnapshot().phase, 'idle');
  f.c.dispose();
});
test('a resolved await still requires its current token before applying the result', async () => {
  const f = await fixture();
  const pending = f.c.start(false);
  await flush();
  const old = f.runs[0].run;
  const value = await old.wait(Promise.resolve('card'));
  f.c.cancel();
  await pending;
  assert.throws(() => old.check(value), { name: 'AbortError' });
  const next = f.c.start(true);
  await flush();
  assert.notEqual(f.runs[1].run, old);
  assert.throws(() => old.check(value), { name: 'AbortError' });
  assert.equal(f.c.getSnapshot().phase, 'running');
  f.c.cancel();
  await next;
  f.c.dispose();
});
test('one turn deadline remains active in the background; old tickets and cancelled callbacks cannot consume a replacement turn', async () => {
  const f = await fixture(),
    pending = f.c.start(false);
  await flush();
  const run = f.runs[0].run;
  let expired = 0;
  const first = run.turn(60000, () => expired++),
    oldJob = [...f.timers][0];
  assert.equal(first.deadline, 61000);
  f.source({ allowed: false });
  assert.equal(f.c.getSnapshot().phase, 'running');
  assert(first.current());
  const second = run.turn(60000, () => expired++),
    currentJob = [...f.timers][0];
  first.cancel();
  f.fire(oldJob);
  assert.equal(expired, 0);
  assert(second.current());
  f.fire(currentJob);
  f.fire(currentJob);
  assert.equal(expired, 1);
  assert.equal(f.timers.size, 0);
  assert(!second.current());
  f.c.cancel();
  await pending;
  f.c.dispose();
});
test('identity changes and an authoritative online match cancel a running local engine without another reset', async () => {
  for (const patch of [{ key: 'other' }, { online: true }]) {
    const f = await fixture(),
      pending = f.c.start(false);
    await flush();
    const run = f.runs[0].run;
    run.turn(60000, () => assert.fail('old local timeout'));
    f.source(patch);
    await pending;
    assert.equal(f.resets, 1);
    assert.equal(f.cancelled[0], run);
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.errors, []);
    f.c.dispose();
  }
});
test('failed preparation/engine work recovers, while disposal rejects old waits and releases subscriptions', async () => {
  const f = await fixture();
  f.audio(() => Promise.reject(new Error('audio unavailable')));
  await f.c.start(false);
  assert.equal(f.errors.length, 1);
  assert.equal(f.runs.length, 0);
  f.audio(() => Promise.resolve());
  f.execute(() => Promise.reject(new Error('engine failure')));
  await f.c.start(false);
  assert.equal(f.errors.length, 2);
  f.execute(() => new Promise(() => {}));
  const pending = f.c.start(true);
  await flush();
  const run = f.runs.at(-1).run;
  const aborted = assert.rejects(run.delay(1000), { name: 'AbortError' });
  f.c.dispose();
  await pending;
  await aborted;
  assert.equal(f.sources.size, 0);
  assert.equal(f.timers.size, 0);
  await f.c.start(false);
  assert.equal(f.runs.length, 2);
});
