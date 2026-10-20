'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReplayController } = require('../src/lib/clips/replay.ts');
const { createClipLibrary } = require('../src/lib/clips/library.ts');
const { createClipPreferences } = require('../src/lib/clips/preferences.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function borrowed(id) {
  return {
    id,
    getTracks() {
      assert.fail('the coordinator must never stop or constrain borrowed tracks');
    },
  };
}
function prepared(options) {
  return {
    ...options,
    quality: '1920×1080',
    fps: 60,
    hasAudio: true,
    maxBytes: 64000000,
    stopping: false,
    starts: 0,
    stops: 0,
    pendingCount: 0,
    status: { ready: true, seconds: 10, bytes: 200 },
    start() {
      this.starts++;
      options.onStatus();
    },
    stop() {
      if (!this.stopping) {
        this.stopping = true;
        this.stops++;
      }
    },
    requestClip(id) {
      this.pendingCount++;
      this.requested = id;
    },
  };
}
function fixture() {
  const rows = new Map(),
    saved = [],
    created = [],
    storage = new Map();
  const preferences = createClipPreferences(() => ({
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  }));
  const store = {
    async list(owner) {
      return [...rows.values()].filter((row) => row.owner === owner);
    },
    async put(row) {
      rows.set(row.id, row);
    },
    async remove(id) {
      rows.delete(id);
    },
    async directory() {},
    async setDirectory() {},
  };
  const library = createClipLibrary(store, {
    async chooseDirectory() {},
    chooseFile() {},
    download() {},
  });
  const options = {
    preferences,
    library,
    supported: () => true,
    createId: () => 'clip-one',
    now: () => 1792519430000,
    saved: (count) => saved.push(count),
    async createSession(options) {
      const session = prepared(options);
      created.push(session);
      return session;
    },
  };
  const controller = createReplayController(options);
  return { controller, preferences, library, options, rows, saved, created, store };
}
test('a replaced source invalidates delayed preparation and stale source shutdown cannot stop its replacement', async () => {
  const f = fixture(),
    pending = deferred(),
    a = borrowed('a'),
    b = borrowed('b');
  await f.controller.setOwner('alice');
  const original = f.options.createSession;
  let oldOptions;
  f.options.createSession = (options) => {
    if (options.source === a) {
      oldOptions = options;
      return pending.promise;
    }
    return original(options);
  };
  const first = f.controller.sharedStarted(a);
  assert.equal(f.controller.getSnapshot().preparing, true);
  await f.controller.sharedStarted(b);
  const current = f.created[0];
  assert.equal(oldOptions.isCurrent(), false);
  const old = prepared(oldOptions);
  pending.resolve(old);
  await first;
  assert.equal(old.starts, 0);
  assert.equal(old.stops, 1);
  assert.equal(current.starts, 1);
  f.controller.sharedStopped(a);
  assert.equal(f.controller.getSnapshot().active, true);
  assert.equal(current.stops, 0);
  f.controller.sharedStopped(b);
  assert.equal(current.stops, 1);
  assert.equal(f.controller.getSnapshot().shared, false);
});
test('account alice-bob-alice invalidates old preparation even when account and source match again', async () => {
  const f = fixture(),
    pending = deferred(),
    source = borrowed('screen');
  await f.controller.setOwner('alice');
  let oldOptions;
  f.options.createSession = (options) => {
    oldOptions = options;
    return pending.promise;
  };
  const starting = f.controller.sharedStarted(source);
  await f.controller.setOwner('bob');
  await f.controller.setOwner('alice');
  assert.equal(oldOptions.isCurrent(), false);
  const old = prepared(oldOptions);
  pending.resolve(old);
  await starting;
  assert.equal(old.stops, 1);
  assert.equal(f.controller.getSnapshot().active, false);
  assert.equal(f.controller.getSnapshot().preparing, false);
});
test('only capture preference changes replace a session; shortcut selection and cancellation do not restart media', async () => {
  const f = fixture();
  await f.controller.setOwner('alice');
  const source = borrowed('screen');
  await f.controller.sharedStarted(source);
  const first = f.created[0];
  f.preferences.beginShortcut();
  f.preferences.cancelShortcut();
  assert.equal(f.created.length, 1);
  assert.equal(first.stops, 0);
  f.preferences.setSetting('seconds', 15);
  await tick();
  assert.equal(f.created.length, 2);
  assert.equal(first.stops, 1);
  assert.equal(f.created[1].seconds, 15);
  f.preferences.setSetting('auto', false);
  await tick();
  assert.equal(f.created[1].stops, 1);
  assert.equal(f.created.length, 2);
  assert.equal(f.controller.getSnapshot().shared, true);
  assert.equal(f.controller.getSnapshot().active, false);
  f.preferences.setSetting('auto', true);
  await tick();
  assert.equal(f.created.length, 3);
  assert.equal(f.controller.getSnapshot().ready, true);
});
test('late worker errors and ended events cannot clear a new replay or overwrite its status', async () => {
  const f = fixture();
  await f.controller.setOwner('alice');
  await f.controller.sharedStarted(borrowed('a'));
  const old = f.created[0];
  await f.controller.sharedStarted(borrowed('b'));
  const next = f.created[1],
    state = f.controller.getSnapshot();
  old.onError('old error');
  old.onEnded();
  old.onStatus();
  assert.equal(f.controller.getSnapshot(), state);
  assert.equal(next.stops, 0);
  next.stopping = true;
  next.onError('current worker failure');
  assert.equal(f.controller.getSnapshot().active, false);
  assert.equal(f.controller.getSnapshot().message, 'current worker failure');
});
test('a clip requested before account change persists for the original owner without notifying the new owner', async () => {
  const f = fixture();
  await f.controller.setOwner('alice');
  await f.controller.sharedStarted(borrowed('a'));
  const session = f.created[0];
  f.controller.clip();
  assert.equal(session.requested, 'clip-one');
  await f.controller.setOwner('bob');
  await session.onClip(session, {
    id: 'clip-one',
    blob: new Blob(['encoded']),
    bytes: 7,
    duration: 2,
  });
  assert.equal(f.rows.get('clip-one').owner, 'alice');
  assert.equal(await f.rows.get('clip-one').blob.text(), 'encoded');
  assert.equal(f.library.getSnapshot().pendingCount, 0);
  assert.deepEqual(f.saved, []);
  assert.equal(f.controller.getSnapshot().message, '');
});
test('quota failure pauses replay, blocks resume until the memory-only clip is saved or discarded, then allows retry', async () => {
  const f = fixture();
  await f.controller.setOwner('alice');
  await f.controller.sharedStarted(borrowed('a'));
  const session = f.created[0],
    put = f.store.put;
  f.store.put = async () => {
    throw Error('quota');
  };
  await session.onClip(session, {
    id: 'clip-one',
    blob: new Blob(['encoded']),
    bytes: 7,
    duration: 2,
  });
  assert.equal(session.stops, 1);
  assert.equal(f.controller.getSnapshot().active, false);
  assert.equal(f.library.hasUnsavedMemory('alice'), true);
  await f.controller.resume();
  assert.equal(f.created.length, 1);
  assert.match(f.controller.getSnapshot().message, /Salve ou descarte/);
  await f.library.discard('clip-one');
  f.store.put = put;
  await f.controller.resume();
  assert.equal(f.created.length, 2);
  assert.equal(f.controller.getSnapshot().ready, true);
  f.controller.stop();
  assert.equal(f.created[1].stops, 1);
  assert.equal(f.controller.getSnapshot().shared, true);
});
test('unsupported, empty and failed preparation do not leave replay stuck in a preparing state', async () => {
  const f = fixture();
  await f.controller.setOwner('alice');
  f.options.supported = () => false;
  await f.controller.sharedStarted(borrowed('a'));
  assert.equal(f.created.length, 0);
  assert.match(f.controller.getSnapshot().message, /indisponível/);
  f.options.supported = () => true;
  f.options.createSession = async () => null;
  await f.controller.resume();
  assert.equal(f.controller.getSnapshot().preparing, false);
  let session;
  f.options.createSession = async (options) => {
    session = prepared(options);
    session.start = () => {
      throw Error('recorder failed');
    };
    return session;
  };
  await f.controller.resume();
  assert.equal(session.stops, 1);
  assert.equal(f.controller.getSnapshot().preparing, false);
  assert.equal(f.controller.getSnapshot().active, false);
  assert.equal(f.controller.getSnapshot().message, 'recorder failed');
});
test('dispose invalidates pending work and detaches preference subscriptions without affecting the borrowed source', async () => {
  const f = fixture(),
    pending = deferred();
  await f.controller.setOwner('alice');
  let options;
  f.options.createSession = (value) => {
    options = value;
    return pending.promise;
  };
  const starting = f.controller.sharedStarted(borrowed('a'));
  f.controller.dispose();
  assert.equal(options.isCurrent(), false);
  const session = prepared(options);
  pending.resolve(session);
  await starting;
  assert.equal(session.stops, 1);
  assert.equal(f.controller.getSnapshot().active, false);
  assert.equal(f.controller.hasUnsavedWork(), false);
  f.preferences.setSetting('seconds', 15);
  await f.controller.sharedStarted(borrowed('b'));
  assert.equal(f.created.length, 0);
  assert.equal(f.controller.getSnapshot().preparing, false);
});
