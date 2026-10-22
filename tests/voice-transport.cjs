'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/transport.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const check = (name, run) =>
  test(name, { timeout: 3000 }, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await run(t);
  });
const status = (patch = {}) => ({
  enabled: true,
  configured: true,
  hardBlocked: false,
  screenAllowed: true,
  ...patch,
});
async function setup(t, overrides = {}) {
  const { createVoiceTransport } = await modulePromise;
  const events = [],
    statuses = [],
    errors = [],
    warnings = [],
    listeners = new Set(),
    publications = new Map();
  const tracks = Object.fromEntries(
    ['audio', 'camera', 'screen', 'screen-audio'].map((kind) => [
      kind,
      {
        readyState: 'live',
        kind,
        stops: 0,
        stop() {
          this.stops++;
        },
      },
    ]),
  );
  const state = {
    call: { generation: 1, joined: true, joining: false, phase: 'joined' },
    community: true,
    sfuGeneration: 0,
    resets: 0,
    clears: 0,
    fallbacks: 0,
    syncs: 0,
  };
  let sync = async () => status(),
    ice = async () => {},
    publish = async (kind) => {
      publications.set(kind, { ready: true });
    },
    recover = async () => true,
    subscriptions = async () => {};
  let controller = new AbortController();
  const operation = () => {
    const generation = state.call.generation,
      signal = controller.signal;
    return {
      generation,
      signal,
      isCurrent: () => state.call.joined && generation === state.call.generation && !signal.aborted,
    };
  };
  const transport = createVoiceTransport({
    call: () => state.call,
    community: () => state.community,
    realtime: {
      refreshIce: () => {
        events.push('ice');
        return ice();
      },
      sync: () => {
        state.syncs++;
        events.push('status');
        return sync();
      },
    },
    sfu: {
      getGeneration: () => state.sfuGeneration,
      publications,
      publish: (kind, track) => {
        events.push('publish:' + kind);
        return publish(kind, track);
      },
      recoverPublication: (kind, error) => {
        events.push('recover:' + kind);
        return recover(kind, error);
      },
      syncSubscriptions: () => {
        events.push('subscriptions');
        return subscriptions();
      },
      reset: () => {
        state.sfuGeneration++;
        state.resets++;
        publications.clear();
        events.push('reset');
      },
    },
    tracks: () => tracks,
    closePeers: () => events.push('close-peers'),
    clearReceived: () => {
      state.clears++;
      events.push('clear-received');
    },
    syncPeers: () => events.push('sync-peers'),
    announce: (mode) => events.push('announce:' + mode),
    fallbackRoom: () => {
      state.fallbacks++;
      events.push('fallback-room');
    },
    onMessage: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onChange() {},
    onStatus: (text, kind) => statuses.push({ text, kind }),
    onError: (error) => errors.push(error),
    warn: (error) => warnings.push(error),
    ...overrides,
  });
  transport.setRoom('room');
  transport.prepare('sfu');
  transport.begin();
  transport.start();
  t.after(transport.dispose);
  return {
    transport,
    events,
    statuses,
    errors,
    warnings,
    state,
    tracks,
    publications,
    listeners,
    operation,
    sync(fn) {
      sync = fn;
    },
    ice(fn) {
      ice = fn;
    },
    publish(fn) {
      publish = fn;
    },
    recover(fn) {
      recover = fn;
    },
    subscriptions(fn) {
      subscriptions = fn;
    },
    emit(message) {
      for (const fn of listeners) fn(message);
    },
    leave() {
      state.call = { ...state.call, joined: false, generation: state.call.generation + 1 };
      controller.abort();
      transport.reset();
    },
    next() {
      state.call = { ...state.call, joined: true, generation: state.call.generation + 1 };
      controller = new AbortController();
      transport.prepare('sfu');
      transport.begin();
      return operation();
    },
    async advance(ms) {
      t.mock.timers.tick(ms);
      await tick();
    },
  };
}

check(
  'private/game calls stay P2P and never request SFU configuration or replace captures',
  async (t) => {
    const h = await setup(t);
    h.state.community = false;
    h.transport.begin();
    await h.transport.connect(h.operation());
    assert.equal(h.transport.getSnapshot().mode, 'p2p');
    assert.equal(h.transport.announced(), 'p2p');
    assert.deepEqual(h.events, ['sync-peers']);
    assert(Object.values(h.tracks).every((track) => track.stops === 0));
  },
);

check(
  'SFU startup confirms policy, publishes voice first and preserves independent video and subscription work',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.publish((kind) => {
      if (kind === 'camera') return gate.promise;
      h.publications.set(kind, { ready: true });
      return Promise.resolve();
    });
    await h.transport.connect(h.operation());
    assert.deepEqual(h.events.slice(0, 4), ['ice', 'status', 'close-peers', 'publish:audio']);
    assert(h.events.indexOf('publish:camera') < h.events.indexOf('subscriptions'));
    assert(h.events.includes('publish:screen') && h.events.includes('publish:screen-audio'));
    assert.equal(h.transport.announced(), 'sfu');
    assert.equal(h.state.fallbacks, 0);
    assert(h.statuses.some((s) => s.kind === 'ok'));
    gate.resolve();
  },
);

check(
  'the SFU announcement remains pending until the local microphone publication is ready',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.publish((kind) => (kind === 'audio' ? gate.promise : Promise.resolve()));
    const pending = h.transport.connect(h.operation());
    await tick();
    assert.equal(h.transport.getSnapshot().mode, 'sfu');
    assert.equal(h.transport.announced(), 'sfu-pending');
    assert(!h.events.includes('announce:sfu'));
    h.publications.set('audio', { ready: true });
    gate.resolve();
    await pending;
    assert.equal(h.transport.announced(), 'sfu');
  },
);

check(
  'duplicate connection requests share one negotiation in the same call generation',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.ice(() => gate.promise);
    const operation = h.operation(),
      first = h.transport.connect(operation);
    assert.equal(h.transport.connect(operation), first);
    await tick();
    assert.equal(h.events.filter((event) => event === 'ice').length, 1);
    gate.resolve();
    await first;
    assert.equal(h.events.filter((event) => event === 'publish:audio').length, 1);
  },
);

check(
  'a missing initial policy retries once after 500 ms without assuming SFU availability',
  async (t) => {
    const h = await setup(t);
    let attempt = 0;
    h.sync(async () => (++attempt === 1 ? null : status()));
    const pending = h.transport.connect(h.operation());
    await tick();
    assert(!h.events.includes('publish:audio'));
    await h.advance(499);
    assert.equal(h.state.syncs, 1);
    await h.advance(1);
    await pending;
    assert.equal(h.state.syncs, 2);
    assert.equal(h.transport.getSnapshot().mode, 'sfu');
  },
);

check(
  'unconfirmed, disabled, unconfigured and hard-blocked SFU policies use coordinated P2P',
  async (t) => {
    for (const policy of [
      null,
      status({ enabled: false }),
      status({ configured: false }),
      status({ hardBlocked: true }),
    ]) {
      const h = await setup(t);
      h.sync(async () => policy);
      const pending = h.transport.connect(h.operation());
      await tick();
      if (policy === null) await h.advance(500);
      await pending;
      assert.equal(h.state.fallbacks, 1);
      assert.equal(h.transport.getSnapshot().mode, 'p2p');
      assert.equal(h.transport.getSnapshot().roomMode, 'p2p');
      assert.equal(h.state.resets, 1);
      assert(!h.events.includes('publish:audio'));
      assert(h.events.includes('announce:p2p'));
    }
  },
);

check(
  'a transient microphone failure recovers the same capture without changing the room transport',
  async (t) => {
    const h = await setup(t);
    h.publish(async (kind, track) => {
      assert.equal(track, h.tracks[kind]);
      if (kind === 'audio') throw Error('temporary');
    });
    h.recover(async (kind) => {
      assert.equal(kind, 'audio');
      h.publications.set('audio', { ready: true });
      return true;
    });
    await h.transport.connect(h.operation());
    assert(h.events.includes('recover:audio'));
    assert.equal(h.state.fallbacks, 0);
    assert.equal(h.transport.announced(), 'sfu');
    assert.equal(h.tracks.audio.stops, 0);
  },
);

check(
  'exhausted microphone recovery closes SFU and announces P2P without stopping captures',
  async (t) => {
    const h = await setup(t);
    h.publish(async () => {
      throw Error('failed');
    });
    h.recover(async () => false);
    await h.transport.connect(h.operation());
    assert.equal(h.state.fallbacks, 1);
    assert.equal(h.state.resets, 1);
    assert.equal(h.state.clears, 1);
    assert(h.events.includes('announce:p2p'));
    assert(Object.values(h.tracks).every((track) => track.stops === 0));
  },
);

check(
  'optional publication failures recover by kind and cannot force a room-wide fallback',
  async (t) => {
    const h = await setup(t);
    h.publish(async (kind) => {
      if (kind !== 'audio') throw Error(kind);
      h.publications.set(kind, { ready: true });
    });
    h.recover(async () => false);
    await h.transport.connect(h.operation());
    await tick();
    for (const kind of ['camera', 'screen', 'screen-audio'])
      assert(h.events.includes('recover:' + kind));
    assert.equal(h.state.fallbacks, 0);
    assert.equal(h.transport.getSnapshot().mode, 'sfu');
  },
);

check(
  'screen restrictions skip screen and screen-audio while preserving camera and voice',
  async (t) => {
    const h = await setup(t);
    h.sync(async () => status({ screenAllowed: false }));
    await h.transport.connect(h.operation());
    assert(h.events.includes('publish:audio') && h.events.includes('publish:camera'));
    assert(!h.events.includes('publish:screen') && !h.events.includes('publish:screen-audio'));
  },
);

check(
  'leaving during any startup wait settles locally and prevents old announcements in the next call',
  async (t) => {
    for (const phase of ['ice', 'sync', 'publish', 'recover', 'subscriptions']) {
      const h = await setup(t),
        gate = deferred();
      if (phase === 'publish') h.publish(() => gate.promise);
      else if (phase === 'recover') {
        h.publish(async () => {
          throw Error('temporary');
        });
        h.recover(() => gate.promise);
      } else h[phase](() => gate.promise);
      const old = h.transport.connect(h.operation());
      await tick();
      h.leave();
      await old;
      const announced = h.events.filter((event) => event.startsWith('announce:')).length;
      gate.resolve(status());
      await tick();
      assert.equal(h.events.filter((event) => event.startsWith('announce:')).length, announced);
      assert.equal(h.transport.getSnapshot().mode, 'p2p');
      assert.equal(h.state.fallbacks, 0);
    }
  },
);

check(
  'an authoritative room fallback cancels pending SFU startup without waiting for its HTTP reply',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.ice(() => gate.promise);
    const pending = h.transport.connect(h.operation());
    await tick();
    h.emit({ type: 'voice-mode', roomId: 'room', mode: 'p2p', reason: 'Room policy' });
    await pending;
    assert.equal(h.transport.getSnapshot().mode, 'p2p');
    assert.equal(h.state.resets, 1);
    assert.equal(h.state.fallbacks, 1);
    gate.resolve();
    await tick();
    assert(!h.events.includes('publish:audio'));
  },
);

check(
  'simultaneous fallback requests close media, notify the backend and announce P2P only once',
  async (t) => {
    const h = await setup(t);
    await h.transport.connect(h.operation());
    await Promise.all([h.transport.fallback('one'), h.transport.fallback('two')]);
    assert.equal(h.state.fallbacks, 1);
    assert.equal(h.state.resets, 1);
    assert.equal(h.state.clears, 1);
    assert.equal(h.events.filter((event) => event === 'announce:p2p').length, 1);
  },
);

check(
  'a backend broadcast delivered synchronously during fallback cannot recurse or duplicate cleanup',
  async (t) => {
    let transport,
      requests = 0;
    const h = await setup(t, {
      fallbackRoom: () => {
        requests++;
        h.emit({ type: 'voice-mode', roomId: 'room', mode: 'p2p' });
      },
    });
    transport = h.transport;
    await transport.connect(h.operation());
    await transport.fallback();
    assert.equal(requests, 1);
    assert.equal(h.state.resets, 1);
    assert.equal(h.events.filter((event) => event === 'announce:p2p').length, 1);
  },
);

check(
  'voice-mode validates the room and exact mode strings and never upgrades an active P2P call automatically',
  async (t) => {
    const h = await setup(t);
    await h.transport.connect(h.operation());
    for (const message of [
      { roomId: 'other', mode: 'p2p' },
      { roomId: 'room', mode: ['p2p'] },
      { roomId: null, mode: 'p2p' },
      { roomId: 'room', mode: 'invalid' },
    ])
      h.emit({ type: 'voice-mode', ...message });
    assert.equal(h.transport.getSnapshot().mode, 'sfu');
    await h.transport.fallback();
    h.emit({ type: 'voice-mode', roomId: 'room', mode: 'sfu' });
    assert.equal(h.transport.getSnapshot().mode, 'p2p');
  },
);

check(
  'changing the actual voice room cancels old resources while allowing a fresh connection immediately',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.ice(() => gate.promise);
    const old = h.transport.connect(h.operation());
    await tick();
    h.transport.setRoom('new-room');
    await old;
    assert.equal(h.state.resets, 1);
    assert.equal(h.transport.getSnapshot().roomMode, null);
    h.ice(async () => {});
    await h.transport.connect(h.next());
    gate.resolve();
    await tick();
    assert.equal(h.transport.announced(), 'sfu');
    assert.equal(h.events.filter((event) => event === 'announce:sfu').length, 1);
  },
);

check(
  'late failures from old optional publications cannot recover into a replacement call',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.publish((kind) => (kind === 'camera' ? gate.promise : Promise.resolve()));
    await h.transport.connect(h.operation());
    h.leave();
    h.publish(async (kind) => {
      h.publications.set(kind, { ready: true });
    });
    await h.transport.connect(h.next());
    gate.reject(Error('old camera'));
    await tick();
    assert(!h.events.includes('recover:camera'));
    assert.equal(h.transport.getSnapshot().mode, 'sfu');
  },
);

check(
  'initialization errors report diagnostics and fall back without altering borrowed captures',
  async (t) => {
    const h = await setup(t),
      error = Object.assign(Error('configuration'), { code: 'NETWORK_CLOSED' });
    h.sync(async () => {
      throw error;
    });
    await h.transport.connect(h.operation());
    assert.deepEqual(h.errors, [error]);
    assert.equal(h.state.fallbacks, 1);
    assert(h.statuses.some((item) => item.text.includes('NETWORK_CLOSED')));
    assert(Object.values(h.tracks).every((track) => track.stops === 0));
  },
);

check(
  'cancelling the initial status retry removes its timer and cannot issue a later status request',
  async (t) => {
    const h = await setup(t);
    h.sync(async () => null);
    const pending = h.transport.connect(h.operation());
    await tick();
    h.leave();
    await pending;
    await h.advance(60000);
    assert.equal(h.state.syncs, 1);
    assert.equal(h.state.fallbacks, 0);
  },
);

check('a repeated fallback while already in P2P preserves healthy received media', async (t) => {
  const h = await setup(t);
  h.transport.prepare('p2p');
  h.transport.begin();
  await h.transport.connect(h.operation());
  await h.transport.fallback();
  await h.transport.fallback();
  assert.equal(h.state.fallbacks, 1);
  assert.equal(h.state.clears, 0);
  assert.equal(h.state.resets, 0);
});

check(
  'disposal cancels pending work, removes its listener and prevents further connection work',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.ice(() => gate.promise);
    h.transport.start();
    assert.equal(h.listeners.size, 1);
    const pending = h.transport.connect(h.operation());
    await tick();
    h.transport.dispose();
    await pending;
    h.transport.start();
    await h.transport.connect(h.operation());
    assert.equal(h.listeners.size, 0);
    assert.equal(h.events.filter((event) => event === 'ice').length, 1);
    gate.resolve();
  },
);
