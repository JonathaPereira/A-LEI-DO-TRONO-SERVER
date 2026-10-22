'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/workspace.ts');
async function setup(t) {
  const { createCallWorkspace } = await modulePromise;
  const events = new EventTarget(), sources = new Set(), calls = [], preferences = new Map();
  const source = { active: true, layout: 'original', roomName: 'Geral', directVisible: false, drawerOpen: false, width: 720 };
  let account = 'a', ready;
  const authReady = new Promise(resolve => ready = resolve);
  const client = createCallWorkspace({
    events, read: () => source,
    subscribeSource: listener => { sources.add(listener); return () => sources.delete(listener); },
    accountId: () => account, readHeader: () => preferences.get(account),
    saveHeader: value => preferences.set(account, value), authReady,
    resize: () => events.dispatchEvent(new Event('resize')),
    openDirect: id => calls.push(['direct', id]), openGames: () => calls.push(['games']),
    applyLayout: layout => calls.push(['layout', layout]),
  });
  client.start();
  t.after(client.dispose);
  const event = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
  return { client, events, source, sources, calls, preferences, ready, event,
    account: value => account = value,
    refresh: () => { for (const listener of sources) listener(); },
    direct: (people, unread = 0, accountId = account) => event('trono-direct-change', { accountId, people, unread }),
  };
}
const person = (id, unread = 0) => ({ id, name: id, unread, avatar_preset: 'lion', avatar_file_id: null });
test('workspace delegates navigation and inbox actions without changing their state', async t => {
  const { client, source, calls, refresh } = await setup(t);
  client.toggleSidebar();
  assert.equal(client.getSnapshot().sidebarOpen, true);
  client.openDirect('friend');
  assert.equal(client.getSnapshot().sidebarOpen, false);
  client.openDirect(); client.openGames(); client.switchLayout();
  assert.deepEqual(calls, [['direct', 'friend'], ['direct', undefined], ['games'], ['layout', 'discord']]);
  source.layout = 'discord'; source.roomName = 'Voz'; source.directVisible = true;
  refresh(); client.switchLayout();
  assert.equal(client.getSnapshot().roomName, 'Voz');
  assert.equal(client.getSnapshot().directVisible, true);
  assert.deepEqual(calls.at(-1), ['layout', 'original']);
  assert.equal(source.active, true);
});
test('workspace clears narrow sidebar on departure and desktop breakpoint', async t => {
  const { client, source, events, refresh } = await setup(t);
  client.toggleSidebar(); source.width = 1100; events.dispatchEvent(new Event('resize'));
  assert.equal(client.getSnapshot().sidebarOpen, false);
  source.width = 720; events.dispatchEvent(new Event('resize')); client.toggleSidebar();
  source.active = false; refresh(); client.toggleSidebar();
  assert.equal(client.getSnapshot().sidebarOpen, false);
});
test('header preferences follow the current account, including delayed auth readiness', async t => {
  const { client, preferences, account, event, ready } = await setup(t);
  client.toggleHeader();
  assert.equal(preferences.get('a'), true);
  preferences.set('b', false); account('b'); event('trono-auth-change');
  assert.equal(client.getSnapshot().headerCollapsed, false);
  preferences.set('b', true); ready(); await Promise.resolve();
  assert.equal(client.getSnapshot().headerCollapsed, true);
  preferences.set('b', false); event('trono-personal-change', { key: 'other' });
  assert.equal(client.getSnapshot().headerCollapsed, true);
  event('trono-personal-change', { key: 'workspaceHeaderCollapsed' });
  assert.equal(client.getSnapshot().headerCollapsed, false);
});
test('direct projection is immutable, limited to seven and preserves total unread', async t => {
  const { client, direct } = await setup(t);
  const people = Array.from({ length: 9 }, (_, i) => person('p' + i, i));
  direct(people, 36);
  const state = client.getSnapshot();
  assert.equal(state.people.length, 7); assert.equal(state.unread, 36);
  people[0].name = 'changed';
  assert.equal(state.people[0].name, 'p0');
  assert(Object.isFrozen(state)); assert(Object.isFrozen(state.people)); assert(Object.isFrozen(state.people[0]));
});
test('malformed direct events and old-account projections cannot replace valid contacts', async t => {
  const { client, direct, account, event } = await setup(t);
  direct([person('friend')], 1);
  const before = client.getSnapshot();
  for (const people of [[person('duplicate'), person('duplicate')], [person('negative', -1)], [{...person('bad'), avatar_file_id: 12}], null]) direct(people, 2);
  direct([person('stale')], 3, 'other'); direct([person('bad')], NaN);
  assert.strictEqual(client.getSnapshot(), before);
  account('b'); event('trono-auth-change');
  assert.deepEqual(client.getSnapshot().people, []); assert.equal(client.getSnapshot().unread, 0);
  direct([person('stale')], 9, 'a');
  assert.deepEqual(client.getSnapshot().people, []);
  // Messenger may publish synchronously before the workspace auth listener runs.
  account('c'); direct([person('current')], 2); event('trono-auth-change');
  assert.equal(client.getSnapshot().people[0].id, 'current');
  account(null); event('trono-auth-change'); direct([person('guest')], 1, null);
  assert.deepEqual(client.getSnapshot().people, []);
});
test('disposal releases subscriptions and ignores pending auth, events and actions', async t => {
  const { client, sources, source, ready, event, calls, preferences } = await setup(t);
  let changes = 0; client.subscribe(() => changes++); client.start();
  assert.equal(sources.size, 1);
  client.dispose(); const before = client.getSnapshot();
  source.roomName = 'late'; preferences.set('a', true); ready(); await Promise.resolve();
  event('trono-layout-change'); event('trono-direct-change', { accountId: 'a', people: [person('late')], unread: 3 });
  client.refresh(); client.toggleHeader(); client.toggleSidebar(); client.openDirect(); client.openGames(); client.switchLayout();
  assert.strictEqual(client.getSnapshot(), before); assert.equal(changes, 0);
  assert.equal(sources.size, 0); assert.deepEqual(calls, []);
});
