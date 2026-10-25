'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const audioModule = import('../src/lib/voice/call-audio.ts');
const alertsModule = import('../src/lib/voice/call-alerts.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function nativeContext(state = 'suspended') {
  const ctx = {
    state,
    currentTime: 10,
    destination: {},
    resumes: 0,
    closes: 0,
    sinks: [],
    gains: [],
    oscillators: [],
    resume() {
      this.resumes++;
      this.state = 'running';
      return Promise.resolve();
    },
    close() {
      this.closes++;
      this.state = 'closed';
      return Promise.resolve();
    },
    setSinkId(id) {
      this.sinks.push(id);
      this.sinkId = id;
      return Promise.resolve();
    },
    createGain() {
      const gain = {
        connections: [],
        disconnected: 0,
        levels: [],
        connect(target) {
          this.connections.push(target);
        },
        disconnect() {
          this.disconnected++;
        },
      };
      gain.gain = {
        setValueAtTime: (...args) => gain.levels.push(['initial', ...args]),
        exponentialRampToValueAtTime: (...args) => gain.levels.push(['ramp', ...args]),
      };
      this.gains.push(gain);
      return gain;
    },
    createOscillator() {
      const node = {
        disconnected: 0,
        stops: [],
        frequency: {
          setValueAtTime(value) {
            node.hz = value;
          },
        },
        connect(target) {
          this.target = target;
        },
        disconnect() {
          this.disconnected++;
        },
        start(at) {
          this.startAt = at;
        },
        stop(at) {
          this.stops.push(at);
        },
      };
      this.oscillators.push(node);
      return node;
    },
  };
  return ctx;
}
async function audioSetup(t, overrides = {}) {
  const { createCallAudio } = await audioModule;
  const settings = { joined: true, generation: 1, output: '', visible: true };
  const contexts = [],
    parameters = [],
    order = [],
    warnings = [],
    events = new EventTarget();
  const audio = createCallAudio({
    desktop: true,
    getSettings: () => settings,
    createContext(options) {
      const ctx = nativeContext();
      contexts.push(ctx);
      parameters.push(options);
      return ctx;
    },
    playback: {
      unlock: () => order.push('playback-unlock'),
      refresh: () => order.push('playback-refresh'),
    },
    alerts: { prime: () => order.push('alerts-prime'), unlock: () => order.push('alerts-unlock') },
    refreshMicrophone: async () => {
      order.push('refresh-microphone');
    },
    documentEvents: events,
    onChange: () => order.push('change'),
    warn: (error) => warnings.push(error),
    ...overrides,
  });
  t.after(audio.dispose);
  return { audio, settings, contexts, parameters, order, warnings, events };
}
async function alertsSetup(t, stored = {}, overrides = {}) {
  const { createCallAlerts } = await alertsModule;
  const settings = { enabled: true, muted: false, output: '' },
    contexts = [],
    values = new Map(Object.entries(stored)),
    warnings = [];
  let stamp = 1000;
  const alerts = createCallAlerts({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    getSettings: () => settings,
    createContext() {
      const ctx = nativeContext();
      contexts.push(ctx);
      return ctx;
    },
    now: () => stamp,
    warn: (error) => warnings.push(error),
    ...overrides,
  });
  t.after(alerts.dispose);
  return {
    alerts,
    settings,
    contexts,
    values,
    warnings,
    time(value) {
      stamp = value;
    },
  };
}

test('microphone context is lazy and reused across call entry/exit with the existing desktop latency', async (t) => {
  const h = await audioSetup(t);
  assert.equal(h.contexts.length, 0);
  const ctx = h.audio.ensureContext();
  h.settings.joined = false;
  h.settings.generation++;
  h.settings.joined = true;
  assert.equal(h.audio.ensureContext(), ctx);
  assert.deepEqual(h.parameters, [{ latencyHint: 0.04, sampleRate: 48000 }]);
  assert.equal(ctx.closes, 0);
});
test('web context retains interactive latency and unsupported/failed creation can retry', async (t) => {
  const web = await audioSetup(t, { desktop: false });
  web.audio.ensureContext();
  assert.deepEqual(web.parameters[0], { latencyHint: 'interactive', sampleRate: 48000 });
  let attempts = 0;
  const ctx = nativeContext();
  const h = await audioSetup(t, {
    createContext() {
      if (++attempts === 1) throw new Error('Unavailable');
      return attempts === 2 ? null : ctx;
    },
  });
  assert.equal(h.audio.ensureContext(), null);
  assert.equal(h.audio.ensureContext(), null);
  assert.equal(h.audio.ensureContext(), ctx);
  assert.equal(h.warnings.length, 1);
});
test('resume, received playback and alert unlock run in the same synchronous gesture', async (t) => {
  const h = await audioSetup(t),
    blocked = deferred(),
    ctx = h.audio.ensureContext();
  ctx.resume = () => {
    h.order.push('resume');
    return blocked.promise;
  };
  h.audio.unlock();
  assert.deepEqual(h.order, ['resume', 'playback-unlock', 'alerts-unlock']);
  blocked.resolve();
  await tick();
  assert.deepEqual(h.order.slice(-2), ['playback-refresh', 'change']);
});
test('repeated gestures share pending resume and do not create another microphone context', async (t) => {
  const h = await audioSetup(t),
    ctx = h.audio.ensureContext(),
    blocked = deferred();
  ctx.resume = () => {
    ctx.resumes++;
    return blocked.promise;
  };
  h.audio.unlock();
  h.audio.unlock();
  assert.equal(ctx.resumes, 1);
  assert.equal(h.contexts.length, 1);
  blocked.resolve();
  await tick();
  assert.equal(h.order.filter((x) => x === 'playback-refresh').length, 1);
});
test('a late resume from an earlier call cannot refresh players in the next call', async (t) => {
  const h = await audioSetup(t),
    ctx = h.audio.ensureContext(),
    blocked = deferred();
  ctx.resume = () => blocked.promise;
  h.audio.unlock();
  h.settings.generation++;
  blocked.resolve();
  await tick();
  assert.equal(h.order.includes('playback-refresh'), false);
  assert.equal(h.order.includes('change'), false);
});
test('closed context replacement detaches its state listener and ignores old resume completions', async (t) => {
  const h = await audioSetup(t),
    old = h.audio.ensureContext(),
    blocked = deferred(),
    staleListener = old.onstatechange;
  old.resume = () => blocked.promise;
  h.audio.unlock();
  old.state = 'closed';
  const next = h.audio.ensureContext();
  assert.notEqual(next, old);
  assert.equal(old.onstatechange, null);
  staleListener();
  blocked.resolve();
  await tick();
  assert.equal(h.order.includes('refresh-microphone'), false);
  assert.equal(h.order.includes('playback-refresh'), false);
});
test('state changes refresh the existing pipeline while resume rejection retains the recovery UI', async (t) => {
  const h = await audioSetup(t),
    ctx = h.audio.ensureContext();
  ctx.onstatechange();
  assert.deepEqual(h.order, ['refresh-microphone', 'change']);
  h.order.length = 0;
  ctx.resume = () => Promise.reject(new Error('Autoplay blocked'));
  h.audio.unlock();
  await tick();
  assert(h.order.includes('change'));
  assert(!h.order.includes('playback-refresh'));
});
test('optional microphone output routing failure does not prevent state recovery', async (t) => {
  const ctx = nativeContext();
  ctx.setSinkId = () => {
    throw new Error('Unsupported sink');
  };
  const h = await audioSetup(t, { createContext: () => ctx });
  h.settings.output = 'headset';
  assert.equal(h.audio.ensureContext(), ctx);
  ctx.onstatechange();
  assert(h.order.includes('refresh-microphone'));
});
test('gesture listeners install once, warm outside calls and unlock only while joined', async (t) => {
  const h = await audioSetup(t);
  h.settings.joined = false;
  h.audio.start();
  h.audio.start();
  h.events.dispatchEvent(new Event('pointerdown'));
  h.events.dispatchEvent(new Event('keydown'));
  assert.deepEqual(h.order, ['alerts-prime']);
  assert.equal(h.contexts.length, 0);
  h.settings.joined = true;
  h.events.dispatchEvent(new Event('keydown'));
  assert(h.order.includes('playback-unlock'));
  assert.equal(h.contexts.length, 1);
});
test('visibility recovery refreshes existing players without resuming contexts in the background', async (t) => {
  const h = await audioSetup(t);
  h.audio.start();
  h.settings.visible = false;
  h.events.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(h.order, []);
  h.settings.visible = true;
  h.events.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(h.order, ['playback-refresh', 'change']);
  assert.equal(h.contexts.length, 0);
});
test('dispose detaches gestures and state listeners and closes only its owned microphone context', async (t) => {
  const h = await audioSetup(t),
    ctx = h.audio.ensureContext(),
    blocked = deferred();
  ctx.resume = () => blocked.promise;
  h.audio.start();
  h.audio.unlock();
  h.order.length = 0;
  h.audio.dispose();
  h.audio.dispose();
  h.events.dispatchEvent(new Event('pointerdown'));
  h.events.dispatchEvent(new Event('keydown'));
  h.events.dispatchEvent(new Event('visibilitychange'));
  blocked.resolve();
  await tick();
  assert.deepEqual(h.order, []);
  assert.equal(ctx.closes, 1);
  assert.equal(ctx.onstatechange, null);
  assert.equal(h.audio.ensureContext(), null);
});
test('alert volume defaults to 45%, clamps invalid input and persists the existing preference key', async (t) => {
  const h = await alertsSetup(t);
  assert.equal(h.alerts.getSnapshot().volume, 45);
  assert.equal(h.alerts.setVolume(180), 100);
  assert.equal(h.values.get('mnCallAlertVolume'), '100');
  assert.equal(h.alerts.setVolume(-20), 0);
  assert.equal(h.alerts.setVolume('bad'), 0);
  const stored = await alertsSetup(t, { mnCallAlertVolume: 'NaN' });
  assert.equal(stored.alerts.getSnapshot().volume, 0);
});
test('muted and disabled alerts create no graph; warming muted alerts remains silent', async (t) => {
  const h = await alertsSetup(t);
  h.settings.muted = true;
  h.alerts.play('join');
  assert.equal(h.contexts.length, 0);
  h.alerts.prime();
  assert.equal(h.contexts.length, 1);
  assert.equal(h.contexts[0].oscillators.length, 0);
  h.settings.enabled = false;
  h.contexts[0].state = 'closed';
  h.alerts.prime();
  assert.equal(h.contexts.length, 1);
});
test('each alert keeps its existing notes and envelope; zero call volume preserves message sounds', async (t) => {
  const h = await alertsSetup(t);
  const notes = {
    join: [659, 784, 1047],
    leave: [1047, 698],
    disconnect: [740, 554, 370],
    message: [1320, 1760],
  };
  for (const [kind, expected] of Object.entries(notes)) {
    const before = h.contexts[0]?.oscillators.length ?? 0;
    h.alerts.play(kind);
    assert.deepEqual(
      h.contexts[0].oscillators.slice(before).map((o) => o.hz),
      expected,
    );
  }
  const ctx = h.contexts[0];
  assert.equal(ctx.gains[0].levels[1][1], (0.32 * 45) / 100);
  assert.equal(ctx.gains[3].levels[1][1], 0.11);
  h.alerts.setVolume(0);
  const count = ctx.oscillators.length;
  h.alerts.play('leave', 'new');
  assert.equal(ctx.oscillators.length, count);
  h.alerts.play('message', 'new');
  assert.equal(ctx.oscillators.length, count + 2);
});
test('alert cooldown applies per sound and participant for exactly 750 ms', async (t) => {
  const h = await alertsSetup(t);
  h.alerts.play('join', 'one');
  h.time(1749);
  h.alerts.play('join', 'one');
  assert.equal(h.contexts[0].oscillators.length, 3);
  h.alerts.play('join', 'two');
  h.alerts.play('leave', 'one');
  assert.equal(h.contexts[0].oscillators.length, 8);
  h.time(1750);
  h.alerts.play('join', 'one');
  assert.equal(h.contexts[0].oscillators.length, 11);
});
test('ended oscillators detach independently and the gain releases after the last note', async (t) => {
  const h = await alertsSetup(t);
  h.alerts.play('join');
  const ctx = h.contexts[0],
    [first, middle, last] = ctx.oscillators;
  last.onended();
  assert.equal(last.disconnected, 1);
  assert.equal(ctx.gains[0].disconnected, 0);
  first.onended();
  middle.onended();
  assert.equal(ctx.gains[0].disconnected, 1);
  assert(ctx.oscillators.every((o) => o.onended === null && o.disconnected === 1));
});
test('partial oscillator construction failure releases the graph and does not escape the event', async (t) => {
  const ctx = nativeContext();
  const create = ctx.createOscillator.bind(ctx);
  let count = 0;
  ctx.createOscillator = () => {
    if (++count === 2) throw new Error('Native failure');
    return create();
  };
  const h = await alertsSetup(t, {}, { createContext: () => ctx });
  assert.doesNotThrow(() => h.alerts.play('join'));
  assert.equal(ctx.gains[0].disconnected, 1);
  assert.equal(ctx.oscillators[0].disconnected, 1);
  assert.equal(ctx.oscillators[0].onended, null);
  assert.equal(h.warnings.length, 1);
});
test('alert routing serializes native sink changes and uses the latest selection', async (t) => {
  const h = await alertsSetup(t),
    blocked = deferred();
  h.alerts.prime();
  const ctx = h.contexts[0];
  ctx.setSinkId = async (id) => {
    ctx.sinks.push(id);
    if (ctx.sinks.length === 1) await blocked.promise;
    ctx.sinkId = id;
  };
  h.settings.output = 'old';
  h.alerts.prime();
  h.settings.output = 'new';
  h.alerts.prime();
  assert.deepEqual(ctx.sinks, ['old']);
  blocked.resolve();
  await tick();
  assert.deepEqual(ctx.sinks, ['old', 'new']);
  assert.equal(ctx.sinkId, 'new');
});
test('an old pending route cannot hold back a newly created alert context', async (t) => {
  const h = await alertsSetup(t),
    blocked = deferred();
  h.alerts.prime();
  const old = h.contexts[0];
  old.setSinkId = () => blocked.promise;
  h.settings.output = 'old';
  h.alerts.prime();
  old.state = 'closed';
  h.settings.output = 'new';
  h.alerts.prime();
  assert.deepEqual(h.contexts[1].sinks, ['new']);
  blocked.resolve();
  await tick();
});
test('dispose cancels active notes and queued routes without touching another audio context', async (t) => {
  const h = await alertsSetup(t),
    unrelated = nativeContext(),
    blocked = deferred();
  h.alerts.play('join');
  const ctx = h.contexts[0];
  ctx.setSinkId = async (id) => {
    ctx.sinks.push(id);
    await blocked.promise;
  };
  h.settings.output = 'old';
  h.alerts.prime();
  h.settings.output = 'new';
  h.alerts.prime();
  h.alerts.dispose();
  h.alerts.dispose();
  h.alerts.play('message');
  h.alerts.prime();
  blocked.resolve();
  await tick();
  assert.equal(ctx.closes, 1);
  assert.equal(unrelated.closes, 0);
  assert.deepEqual(ctx.sinks, ['old']);
  assert(ctx.oscillators.every((o) => o.disconnected === 1 && o.onended === null));
  assert.equal(h.alerts.getSnapshot().context, null);
});
