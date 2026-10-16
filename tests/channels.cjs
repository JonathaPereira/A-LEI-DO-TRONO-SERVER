'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/channels/catalog.ts');
const channel = (id, extra = {}) => ({
  id,
  name: id,
  type: 'mixed',
  count: 0,
  voiceActive: false,
  ...extra,
});
const person = (id, extra = {}) => ({ id, name: id, guest: false, inVoice: true, ...extra });

async function setup(t) {
  const { createChannels } = await modulePromise;
  const messages = new Set(),
    selection = new Set(),
    identities = new Set(),
    notices = new Set();
  let currentRoom = null,
    accountId = 'account';
  const notice = new Map(),
    warnings = [];
  const subscribe = (set) => (fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };
  const controller = createChannels({
    network: {
      getSnapshot: () => ({ currentRoom }),
      subscribe: subscribe(selection),
      onMessage: subscribe(messages),
    },
    getAccountId: () => accountId,
    getNotice: (id) => notice.get(id) ?? { unread: 0, muted: false },
    subscribeIdentity: subscribe(identities),
    subscribeNotices: subscribe(notices),
    warn: (e) => warnings.push(e),
  });
  t.after(() => controller.dispose());
  return {
    controller,
    warnings,
    receive: (message) => messages.forEach((fn) => fn(message)),
    select(id) {
      currentRoom = id;
      selection.forEach((fn) => fn());
    },
    identity(id) {
      accountId = id;
      identities.forEach((fn) => fn());
    },
    notify(id, value) {
      notice.set(id, value);
      notices.forEach((fn) => fn());
    },
    listenerCounts: () => [messages.size, selection.size, identities.size, notices.size],
  };
}

test('welcome and socket updates replace one immutable catalog including typed voice participants', async (t) => {
  const { controller, receive } = await setup(t);
  assert.equal(controller.getSnapshot().ready, false);
  receive({ type: 'welcome', chatChannels: [channel('a')] });
  const original = controller.getSnapshot();
  receive({
    type: 'chat-channels',
    channels: [channel('b', { count: 1, voiceActive: true, players: [person('peer')] })],
  });
  assert.equal(original.channels[0].id, 'a');
  assert.equal(controller.get('a'), undefined);
  assert.equal(controller.get('b').players[0].inVoice, true);
  for (const object of [
    controller.getSnapshot(),
    controller.getSnapshot().channels,
    controller.get('b'),
    controller.get('b').players,
    controller.get('b').players[0],
  ])
    assert(Object.isFrozen(object));
});

test('selection follows network membership immediately, independently from catalog broadcasts', async (t) => {
  const { controller, receive, select } = await setup(t);
  receive({
    type: 'chat-channels',
    channels: [channel('voice'), channel('text', { type: 'text' })],
  });
  const catalog = controller.getSnapshot().channels;
  select('text');
  assert.equal(controller.getSnapshot().selectedId, 'text');
  assert.equal(controller.getSnapshot().channels, catalog);
  select(null);
  assert.equal(controller.getSnapshot().selectedId, null);
});

test('a slow HTTP response cannot overwrite a newer broadcast or recreate a deleted channel', async (t) => {
  const { controller, receive } = await setup(t);
  controller.replace([channel('a')]);
  const version = controller.getSnapshot().version;
  receive({ type: 'chat-channels', channels: [channel('a'), channel('b')] });
  assert.equal(controller.replace([channel('a')], version), false);
  const deletingVersion = controller.getSnapshot().version;
  receive({ type: 'channel-deleted', roomId: 'b' });
  assert.equal(controller.replace([channel('a'), channel('b')], deletingVersion), false);
  assert.deepEqual(
    controller.getSnapshot().channels.map((c) => c.id),
    ['a'],
  );
});

test('metadata refresh preserves live counts and presence instead of resetting them', async (t) => {
  const { controller } = await setup(t);
  controller.replace([channel('a', { count: 3, voiceActive: true, players: [person('peer')] })]);
  const before = controller.get('a');
  controller.replace(
    [{ id: 'a', name: 'Renamed', type: 'voice', description: 'Description' }],
    controller.getSnapshot().version,
  );
  assert.equal(controller.get('a').name, 'Renamed');
  assert.equal(controller.get('a').count, 3);
  assert.equal(controller.get('a').players, before.players);
  assert.equal(controller.get('a').voiceActive, true);
});

test('invalid catalogs are rejected atomically, including duplicate IDs and invalid participant data', async (t) => {
  const { controller, receive, warnings } = await setup(t);
  controller.replace([channel('a')]);
  const before = controller.getSnapshot();
  for (const channels of [
    null,
    [channel('a'), channel('a')],
    [channel('a'), channel('b', { type: 'other' })],
    [channel('a', { count: -1 })],
    [channel('a', { players: [person('p', { inVoice: 1 })] })],
    [channel('a', { players: [person('p'), person('p')] })],
  ]) {
    receive({ type: 'chat-channels', channels });
    assert.equal(controller.getSnapshot(), before);
  }
  assert.equal(warnings.length, 6);
});

test('unread and mute projections update without replacing the catalog or losing selection', async (t) => {
  const { controller, select, notify } = await setup(t);
  controller.replace([channel('a')]);
  select('a');
  const catalog = controller.getSnapshot().channels;
  const notice = { unread: 124, muted: true };
  notify('a', notice);
  notice.unread = 900;
  assert.deepEqual(controller.getSnapshot().notices.a, { unread: 124, muted: true });
  assert(Object.isFrozen(controller.getSnapshot().notices.a));
  assert.equal(controller.getSnapshot().channels, catalog);
  assert.equal(controller.getSnapshot().selectedId, 'a');
  notify('a', { unread: 0, muted: false });
  assert.deepEqual(controller.getSnapshot().notices.a, { unread: 0, muted: false });
});

test('account changes discard private presence and invalidate old HTTP refreshes', async (t) => {
  const { controller, identity } = await setup(t);
  controller.replace([channel('a', { players: [person('peer')] })]);
  const version = controller.getSnapshot().version;
  identity('another-account');
  assert.deepEqual(controller.get('a').players, []);
  assert.equal(controller.replace([channel('old')], version), false);
});

test('observer failure does not block other subscribers; disposal removes every listener', async (t) => {
  const { controller, warnings, listenerCounts } = await setup(t);
  let calls = 0;
  controller.subscribe(() => {
    throw Error('broken observer');
  });
  controller.subscribe(() => calls++);
  controller.replace([]);
  assert.equal(calls, 1);
  assert.equal(warnings.length, 1);
  assert.equal(controller.getSnapshot().ready, true);
  controller.dispose();
  assert.deepEqual(listenerCounts(), [0, 0, 0, 0]);
  assert.equal(controller.replace([channel('late')]), false);
});

test('browser initialization shares the catalog, network client and external event subscriptions', async (t) => {
  const { initializeChannels } = await import('../src/lib/channels/browser.ts');
  const events = new Set();
  const network = {
    getSnapshot: () => ({ currentRoom: null }),
    subscribe: () => () => {},
    onMessage: () => () => {},
  };
  const runtime = {
    location: { hostname: 'localhost' },
    TronoNetwork: network,
    addEventListener: (event) => events.add(event),
    removeEventListener: (event) => events.delete(event),
  };
  const first = initializeChannels(runtime);
  t.after(() => first.dispose());
  assert.equal(initializeChannels(runtime), first);
  assert.equal(runtime.TronoNetwork, network);
  assert.deepEqual(
    [...events],
    ['trono-auth-change', 'trono-role-change', 'trono-channel-notifications-change'],
  );
  first.dispose();
  assert.equal(events.size, 0);
});
