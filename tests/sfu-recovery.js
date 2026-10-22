'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  classes = import('../src/lib/voice/sfu-recovery.ts');
const failure = (code) => Object.assign(Error(code), { code });
test('camera/screen recovery stays isolated; only exhausted microphone recovery can request fallback', async () => {
  const { SfuPublicationRecovery } = await classes;
  for (const kind of ['audio', 'camera', 'screen', 'screen-audio']) {
    const track = { readyState: 'live' },
      attempts = [],
      exhausted = [];
    let active = true;
    const r = new SfuPublicationRecovery({
      active: () => active,
      track: () => track,
      delay: async () => {},
      publish: async (k) => {
        attempts.push(k);
        throw failure('SFU_REQUEST_FAILED');
      },
      exhausted: async (k) => {
        exhausted.push(k);
        if (k === 'audio') active = false;
      },
    });
    assert.equal(await r.recover(kind, failure('SFU_CONNECTION_FAILED')), false);
    assert.equal(attempts.length, kind === 'audio' ? 2 : 4);
    assert.deepEqual(exhausted, [kind]);
    assert.equal(active, kind !== 'audio');
    assert.equal(r.size, 0);
  }
});
test('transient failures recover without fallback, and concurrent requests share one job', async () => {
  const { SfuPublicationRecovery } = await classes;
  const track = { readyState: 'live' };
  let tries = 0,
    fallbacks = 0,
    release;
  const r = new SfuPublicationRecovery({
    active: () => true,
    track: () => track,
    delay: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    publish: async () => {
      tries++;
    },
    exhausted: () => fallbacks++,
  });
  const a = r.recover('audio', failure('SFU_REQUEST_FAILED')),
    b = r.recover('audio', failure('SFU_REQUEST_FAILED'));
  assert.equal(a, b);
  release();
  assert(await a);
  assert.equal(tries, 1);
  assert.equal(fallbacks, 0);
});
test('leave, stopped capture and replacement invalidate old retries and never republish into the next call', async () => {
  const { SfuPublicationRecovery } = await classes;
  for (const change of ['leave', 'stop', 'replace', 'cancel']) {
    let active = true,
      track = { readyState: 'live' },
      publish = 0,
      exhausted = 0,
      release;
    const r = new SfuPublicationRecovery({
      active: () => active,
      track: () => track,
      delay: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      publish: async () => publish++,
      exhausted: () => exhausted++,
    });
    const old = r.recover('camera', failure('SFU_REQUEST_FAILED'));
    if (change === 'leave') active = false;
    if (change === 'stop') track.readyState = 'ended';
    if (change === 'replace') track = { readyState: 'live' };
    if (change === 'cancel') r.clear();
    release();
    assert.equal(await old, false);
    assert.equal(publish, 0);
    assert.equal(exhausted, 0);
    assert.equal(r.size, 0);
  }
});
test('budget/disabled policy errors are not retried; cancellation never forces a transport change', async () => {
  const { SfuPublicationRecovery } = await classes;
  for (const code of [
    'SCREEN_BUDGET_BLOCKED',
    'REALTIME_HARD_LIMIT',
    'REALTIME_DISABLED',
    'SFU_CANCELLED',
  ]) {
    let tries = 0,
      exhausted = 0;
    const track = { readyState: 'live' };
    const r = new SfuPublicationRecovery({
      active: () => true,
      track: () => track,
      publish: async () => tries++,
      exhausted: () => exhausted++,
    });
    await r.recover('screen', failure(code));
    assert.equal(tries, 0);
    assert.equal(exhausted, code === 'SFU_CANCELLED' ? 0 : 1);
  }
});

test('a stalled video negotiation cannot block incoming voice; duplicate requests share the same job', async () => {
  const { SfuSubscriptionQueue } = await classes;
  const q = new SfuSubscriptionQueue();
  let release,
    cameraCurrent,
    audio = false;
  const camera = q.schedule('a:camera', 'camera', '1', (current) => {
    cameraCurrent = current;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  await Promise.resolve();
  assert.equal(
    q.schedule('a:camera', 'camera', '1', () => assert.fail('duplicate')),
    camera,
  );
  await q.schedule('b:audio', 'audio', '1', () => {
    audio = true;
  });
  assert(audio);
  assert(cameraCurrent());
  q.cancel('a:camera');
  assert(!cameraCurrent());
  release();
  await camera;
});
test('subscription work is bounded per media lane and cancelled queued tasks cannot enter the next call', async () => {
  const { SfuSubscriptionQueue } = await classes;
  const q = new SfuSubscriptionQueue(),
    releases = [];
  let active = 0,
    peak = 0,
    cancelledRan = false;
  const jobs = Array.from({ length: 4 }, (_, i) =>
    q.schedule('audio' + i, 'audio', '1', () => {
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve) =>
        releases.push(() => {
          active--;
          resolve();
        }),
      );
    }),
  );
  await Promise.resolve();
  assert.equal(active, 3);
  q.cancel('audio3');
  releases.splice(0).forEach((release) => release());
  await Promise.all(jobs);
  assert.equal(peak, 3);
  const blocked = q.schedule(
    'a',
    'camera',
    '1',
    () => new Promise((resolve) => releases.push(resolve)),
  );
  const second = q.schedule(
    'b',
    'camera',
    '1',
    () => new Promise((resolve) => releases.push(resolve)),
  );
  const queued = q.schedule('c', 'camera', '1', () => {
    cancelledRan = true;
  });
  await Promise.resolve();
  q.clear();
  releases.splice(0).forEach((release) => release());
  await Promise.all([blocked, second, queued]);
  assert(!cancelledRan);
  assert.equal(q.size, 0);
});

test('quality budget rejection can retry at a permitted quality without abandoning SFU', async () => {
  const { SfuPublicationRecovery } = await classes;
  const track = { readyState: 'live' };
  let quality = 'high',
    attempts = 0;
  const r = new SfuPublicationRecovery({
    active: () => true,
    track: () => track,
    delay: async () => {},
    report: (_kind, err) => {
      if (err.code === 'HIGH_BUDGET_BLOCKED') quality = 'balanced';
    },
    publish: async () => {
      attempts++;
      assert.equal(quality, 'balanced');
    },
    exhausted: () => assert.fail('unnecessary fallback'),
  });
  assert(await r.recover('audio', failure('HIGH_BUDGET_BLOCKED')));
  assert.equal(attempts, 1);
});
test('a replacement capture starts its own recovery instead of sharing a stale job', async () => {
  const { SfuPublicationRecovery } = await classes;
  let track = { readyState: 'live' };
  const releases = [],
    published = [];
  const r = new SfuPublicationRecovery({
    active: () => true,
    track: () => track,
    delay: () => new Promise((resolve) => releases.push(resolve)),
    publish: async (_kind, t) => published.push(t),
    exhausted: () => assert.fail('fallback'),
  });
  const old = r.recover('camera', failure('SFU_REQUEST_FAILED'));
  track = { readyState: 'live' };
  const next = r.recover('camera', failure('SFU_REQUEST_FAILED'));
  assert.notEqual(old, next);
  releases.forEach((resolve) => resolve());
  assert.equal(await old, false);
  assert.equal(await next, true);
  assert.deepEqual(published, [track]);
});
