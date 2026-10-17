'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/call-lifecycle.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const check = (name, run) => test(name, { timeout: 3000 }, run);
async function setup(t, overrides = {}) {
  const { createVoiceCall } = await modulePromise;
  const events = [],
    errors = [],
    warnings = [],
    snapshots = [],
    operations = [],
    listeners = new Set();
  const state = { room: 'room', prepares: 0, captures: 0, stops: 0 };
  let prepare = async () => ({ mode: 'sfu', revision: 1 }),
    acquire = async () => ({});
  const call = createVoiceCall({
    prepare: () => {
      state.prepares++;
      events.push('prepare');
      return prepare();
    },
    microphone: {
      acquire: (options) => {
        state.captures++;
        events.push(['microphone', options.generation]);
        return acquire(options);
      },
      stop: () => {
        state.stops++;
        events.push('stop-microphone');
      },
    },
    roomId: () => state.room,
    onMessage: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onPreparing: () => events.push('unlock'),
    onPrepared: (choice) => events.push(['prepared', choice.mode]),
    onJoined: async (operation) => {
      operations.push(operation);
      events.push('joined');
    },
    connect: async () => {
      events.push('connect');
    },
    onLeaving: () => events.push('leaving'),
    release: [
      () => events.push('release-video'),
      () => events.push('release-peers'),
      () => events.push('release-playback'),
    ],
    onLeft: (reason, wasJoined) => events.push(['left', reason, wasJoined]),
    onError: (error) => errors.push(error),
    onChange: () => snapshots.push(call.getSnapshot()),
    warn: (error) => warnings.push(error),
    ...overrides,
  });
  t.after(call.dispose);
  return {
    call,
    state,
    events,
    errors,
    warnings,
    snapshots,
    operations,
    listeners,
    prepare(fn) {
      prepare = fn;
    },
    acquire(fn) {
      acquire = fn;
    },
    emit(message) {
      for (const fn of listeners) fn(message);
    },
  };
}

check(
  'entry keeps audio unlock synchronous and publishes membership only after microphone acquisition',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.acquire(() => gate.promise);
    const pending = h.call.toggle();
    assert.deepEqual(h.events, ['unlock']);
    assert.equal(h.state.prepares, 0);
    await tick();
    assert.equal(h.call.getSnapshot().phase, 'microphone');
    assert.equal(h.call.getSnapshot().joined, false);
    assert(
      h.events.findIndex((e) => e[0] === 'prepared') <
        h.events.findIndex((e) => e[0] === 'microphone'),
    );
    gate.resolve({});
    assert.equal(await pending, true);
    assert.deepEqual(h.call.getSnapshot(), {
      phase: 'joined',
      generation: 1,
      joined: true,
      joining: false,
    });
    assert(Object.isFrozen(h.call.getSnapshot()));
    assert(h.operations[0].isCurrent());
  },
);

check(
  'duplicate clicks before membership share the same pending call and capture only once',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.prepare(() => gate.promise);
    const first = h.call.toggle();
    assert.equal(h.call.toggle(), first);
    await tick();
    assert.equal(h.state.prepares, 1);
    assert.equal(h.state.captures, 0);
    gate.resolve({ mode: 'p2p', revision: 1 });
    assert(await first);
    assert.equal(h.state.captures, 1);
  },
);

check(
  'leave settles pending preparation immediately and a late reply cannot request a microphone',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.prepare(() => gate.promise);
    const pending = h.call.toggle();
    await tick();
    await h.call.leave();
    assert.equal(await pending, false);
    gate.resolve({ mode: 'sfu', revision: 1 });
    await tick();
    assert.equal(h.state.captures, 0);
    assert.equal(h.call.getSnapshot().phase, 'idle');
    assert.deepEqual(h.errors, []);
    assert(h.events.some((e) => Array.isArray(e) && e[0] === 'left' && e[2] === false));
  },
);

check(
  'leave stops the capture owner without waiting for a permission prompt and permits a new call',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.acquire(() => gate.promise);
    const old = h.call.toggle();
    await tick();
    await h.call.leave();
    assert.equal(await old, false);
    assert.equal(h.state.stops, 1);
    h.acquire(async () => ({}));
    assert(await h.call.toggle());
    const latest = h.call.getSnapshot();
    gate.resolve({});
    await tick();
    assert.equal(h.call.getSnapshot(), latest);
    assert.equal(h.operations.length, 1);
  },
);

check(
  'cancelled visual setup and transport negotiation never hold a new call behind their pending promises',
  async (t) => {
    for (const phase of ['onJoined', 'connect']) {
      const gate = deferred();
      let first = true;
      const h = await setup(t, {
        [phase]: async () => {
          if (first) {
            first = false;
            await gate.promise;
          }
        },
      });
      const old = h.call.toggle();
      await tick();
      assert(h.call.getSnapshot().joined);
      await h.call.leave();
      assert.equal(await old, false);
      assert(await h.call.toggle());
      gate.resolve();
      await tick();
      assert(h.call.getSnapshot().joined);
      assert.equal(h.call.getSnapshot().joining, false);
    }
  },
);

check('a click after membership starts exits even while connection setup is pending', async (t) => {
  const gate = deferred(),
    h = await setup(t, { connect: () => gate.promise });
  const first = h.call.toggle();
  await tick();
  assert.equal(h.call.getSnapshot().phase, 'connecting');
  assert.equal(await h.call.toggle(), false);
  assert.equal(await first, false);
  assert.equal(h.call.getSnapshot().joined, false);
  gate.resolve();
});

check('a successful call aborts its operation before releasing media on leave', async (t) => {
  let call, operation;
  const observations = [];
  const h = await setup(t, {
    onJoined: async (value) => {
      operation = value;
    },
    release: [
      () =>
        observations.push({
          current: operation.isCurrent(),
          aborted: operation.signal.aborted,
          joined: call.getSnapshot().joined,
        }),
    ],
  });
  call = h.call;
  assert(await call.toggle());
  assert(operation.isCurrent());
  await call.leave();
  assert.deepEqual(observations, [{ current: false, aborted: true, joined: false }]);
  assert(h.events.indexOf('stop-microphone') > h.events.indexOf('leaving'));
});

check(
  'errors at every entry stage release media and report only the current operation failure',
  async (t) => {
    for (const phase of ['prepare', 'microphone', 'onJoined', 'connect']) {
      const error = Error(phase),
        h = await setup(t, {
          ...(phase === 'onJoined' || phase === 'connect'
            ? {
                [phase]: async () => {
                  throw error;
                },
              }
            : {}),
        });
      if (phase === 'prepare')
        h.prepare(async () => {
          throw error;
        });
      if (phase === 'microphone')
        h.acquire(async () => {
          throw error;
        });
      assert.equal(await h.call.toggle(), false);
      assert.equal(h.call.getSnapshot().phase, 'idle');
      assert.equal(h.call.getSnapshot().joining, false);
      assert.deepEqual(h.errors, [error]);
      assert.equal(h.state.stops, 1);
      assert(h.events.includes('release-video') && h.events.includes('release-playback'));
    }
  },
);

check(
  'a late rejected request does not stop or report errors into a subsequent call',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.prepare(() => gate.promise);
    const old = h.call.toggle();
    await tick();
    await h.call.leave();
    await old;
    h.prepare(async () => ({ mode: 'sfu', revision: 2 }));
    assert(await h.call.toggle());
    gate.reject(Error('old backend'));
    await tick();
    assert(h.call.getSnapshot().joined);
    assert.deepEqual(h.errors, []);
    assert.equal(h.state.stops, 1);
  },
);

check(
  'release exceptions cannot skip other media owners or leave the membership active',
  async (t) => {
    const released = [],
      h = await setup(t, {
        release: [
          () => {
            released.push('camera');
            throw Error('failed camera cleanup');
          },
          () => released.push('peers'),
          () => released.push('screen'),
        ],
      });
    assert(await h.call.toggle());
    await h.call.leave();
    assert.deepEqual(released, ['camera', 'peers', 'screen']);
    assert.equal(h.warnings.length, 1);
    assert.equal(h.call.getSnapshot().joined, false);
    assert(h.events.some((e) => Array.isArray(e) && e[0] === 'left' && e[2]));
  },
);

check(
  'network exit listeners filter room identity and invalid messages while preserving unrelated membership',
  async (t) => {
    for (const type of ['left-game-room', 'left-voice-room', 'channel-deleted']) {
      const h = await setup(t);
      h.call.start();
      assert(await h.call.toggle());
      h.emit({ type, roomId: 'different' });
      h.emit({ type, roomId: null });
      h.emit({ type: 'connection', connected: 'false' });
      assert(h.call.getSnapshot().joined);
      h.emit({ type, roomId: 'room' });
      assert.equal(h.call.getSnapshot().joined, false);
      assert.equal(h.state.stops, 1);
    }
  },
);

check(
  'disconnect cancels pending entry and reports a disconnect for established membership',
  async (t) => {
    const h = await setup(t),
      gate = deferred();
    h.call.start();
    h.prepare(() => gate.promise);
    const pending = h.call.toggle();
    await tick();
    h.emit({ type: 'connection', connected: false });
    assert.equal(await pending, false);
    assert.equal(h.call.getSnapshot().joining, false);
    h.prepare(async () => ({ mode: 'p2p', revision: 2 }));
    assert(await h.call.toggle());
    h.emit({ type: 'connection', connected: false });
    assert(
      h.events.some((e) => Array.isArray(e) && e[0] === 'left' && e[1] === 'disconnect' && e[2]),
    );
    gate.resolve({ mode: 'sfu', revision: 1 });
    await tick();
    assert.equal(h.call.getSnapshot().joined, false);
  },
);

check(
  'listener installation and disposal are idempotent; disposed calls cannot capture or resubscribe',
  async (t) => {
    const h = await setup(t);
    h.call.start();
    h.call.start();
    assert.equal(h.listeners.size, 1);
    assert(await h.call.toggle());
    h.call.dispose();
    h.call.dispose();
    h.call.start();
    assert.equal(h.listeners.size, 0);
    assert.equal(await h.call.toggle(), false);
    assert.equal(h.state.stops, 1);
    assert.equal(h.state.captures, 1);
  },
);

check(
  'a cancelled entry cannot clear the joining flag of a replacement that is still waiting',
  async (t) => {
    const h = await setup(t),
      first = deferred(),
      second = deferred();
    h.prepare(() => first.promise);
    const old = h.call.toggle();
    await tick();
    await h.call.leave();
    h.prepare(() => second.promise);
    const next = h.call.toggle();
    await tick();
    assert.equal(await old, false);
    first.resolve({ mode: 'sfu', revision: 1 });
    await tick();
    assert(h.call.getSnapshot().joining);
    assert.equal(h.call.toggle(), next);
    second.resolve({ mode: 'p2p', revision: 2 });
    assert(await next);
  },
);

check(
  'a leave triggered by a phase observer prevents capture and does not invoke the audio hook later',
  async (t) => {
    let call;
    const h = await setup(t, {
      onChange: () => {
        if (call.getSnapshot().phase === 'preparing') void call.leave();
      },
    });
    call = h.call;
    assert.equal(await call.toggle(), false);
    assert.equal(h.state.prepares, 0);
    assert.equal(h.state.captures, 0);
    assert(!h.events.includes('unlock'));
  },
);

check(
  'an error cleanup that starts a replacement cannot overwrite its state or inject the old error',
  async (t) => {
    let call, next;
    const h = await setup(t, {
      onLeft: () => {
        next = call.toggle();
      },
    });
    call = h.call;
    h.prepare(async () => {
      h.prepare(async () => ({ mode: 'p2p', revision: 2 }));
      throw Error('first request');
    });
    assert.equal(await call.toggle(), false);
    assert(await next);
    assert(call.getSnapshot().joined);
    assert.deepEqual(h.errors, []);
  },
);
