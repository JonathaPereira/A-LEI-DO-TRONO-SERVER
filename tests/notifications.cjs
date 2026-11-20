'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/notifications/controller.ts');

const notice = (id, extra = {}) => ({
  type: 'chat-notice',
  id,
  roomId: 'general',
  roomName: 'Geral',
  name: 'Amigo',
  text: 'Olá',
  mentioned: false,
  ...extra,
});
const payload = (extra = {}) => ({
  key: 'message',
  title: 'Mensagem',
  body: 'Olá',
  target: { type: 'channel', id: 'general' },
  mention: true,
  ...extra,
});

async function setup(t, options = {}) {
  const { createNotifications } = await modulePromise;
  const messages = new Set(),
    identities = new Set(),
    preferences = new Set(),
    attention = new Set(),
    clicks = new Set(),
    catalogs = new Set(),
    frames = new Set();
  const saved = new Map(),
    delivered = [],
    browser = [],
    navigated = [],
    warnings = [];
  let account = 'alice',
    currentRoom = 'general',
    visible = false,
    foreground = false,
    channels = [
      { id: 'general', name: 'Geral' },
      { id: 'games', name: 'Jogos' },
    ],
    permission = 'default',
    permissionRequests = 0,
    permissionAnswer,
    changes = 0,
    feedback = false;
  const subscribe = (set) => (fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };
  const emit = (set, value) => [...set].forEach((fn) => fn(value));
  const key = (name) => `${account}:${name}`;
  const controller = createNotifications({
    getAccountId: () => account,
    preferences: {
      get: (name, fallback) => (saved.has(key(name)) ? saved.get(key(name)) : fallback),
      set: (name, value) => {
        saved.set(key(name), value);
        emit(preferences, name);
      },
    },
    channels: { getSnapshot: () => ({ channels }), subscribe: subscribe(catalogs) },
    network: { onMessage: subscribe(messages) },
    getCurrentRoom: () => currentRoom,
    isChannelVisible: (id) => visible && id === currentRoom,
    isForeground: () => foreground,
    desktop: options.desktop ?? true,
    desktopNotify: options.desktop === false ? undefined : (value) => delivered.push(value),
    showBrowserNotification: (value, onClick) => browser.push({ value, onClick }),
    getPermission: () => permission,
    requestPermission: () => {
      permissionRequests++;
      return new Promise((resolve) => {
        permissionAnswer = resolve;
      });
    },
    navigate: (target) => navigated.push(target),
    scheduleRead: (callback) => {
      frames.add(callback);
      return () => frames.delete(callback);
    },
    subscribeIdentity: subscribe(identities),
    subscribePreferences: subscribe(preferences),
    subscribeAttention: subscribe(attention),
    subscribeNotificationClick: subscribe(clicks),
    onNoticesChanged: () => {
      changes++;
      if (feedback) emit(catalogs);
    },
    warn: (error) => warnings.push(error),
  });
  t.after(() => controller.dispose());
  return {
    controller,
    saved,
    delivered,
    browser,
    navigated,
    warnings,
    receive: (value) => emit(messages, value),
    identity(value) {
      account = value;
      emit(identities);
    },
    pref(name, value) {
      saved.set(key(name), value);
      emit(preferences, name);
    },
    catalog(value) {
      channels = value;
      emit(catalogs);
    },
    view(id, isVisible = true) {
      currentRoom = id;
      visible = isVisible;
    },
    focus(value = true) {
      foreground = value;
      emit(attention);
    },
    click: (value) => emit(clicks, value),
    permission(value) {
      permission = value;
    },
    answer(value) {
      permission = value;
      permissionAnswer(value);
    },
    flushFrames() {
      const pending = [...frames];
      frames.clear();
      pending.forEach((fn) => fn());
    },
    feedback(value = true) {
      feedback = value;
    },
    changes: () => changes,
    permissionRequests: () => permissionRequests,
    listeners: () =>
      [messages, identities, preferences, attention, clicks, catalogs, frames].map(
        (set) => set.size,
      ),
  };
}

test('one notification owner starts once and disposal releases subscriptions and deferred reads', async (t) => {
  const { controller, receive, listeners, flushFrames, delivered } = await setup(t);
  assert.deepEqual(listeners(), [0, 0, 0, 0, 0, 0, 0]);
  controller.start();
  controller.start();
  assert.deepEqual(listeners(), [1, 1, 1, 1, 1, 1, 0]);
  receive({ type: 'joined-room', room: { id: 'general' } });
  assert.equal(listeners().at(-1), 1);
  const before = controller.getSnapshot();
  controller.dispose();
  controller.start();
  assert.deepEqual(listeners(), [0, 0, 0, 0, 0, 0, 0]);
  receive(notice('late', { mentioned: true }));
  flushFrames();
  await controller.notify(payload());
  assert.strictEqual(controller.getSnapshot(), before);
  assert.equal(delivered.length, 0);
});

test('unread deduplicates the latest 500 IDs independently of disabled or muted system notices', async (t) => {
  const { controller, receive, pref, delivered } = await setup(t);
  controller.start();
  pref('notifications', 'off');
  controller.mute('general', true);
  receive(notice('first'));
  receive(notice('first'));
  assert.deepEqual(controller.getChannelState('general'), { unread: 1, muted: true });
  for (let index = 0; index < 500; index++) receive(notice(`next-${index}`));
  receive(notice('next-0'));
  assert.equal(controller.getChannelState('general').unread, 501);
  receive(notice('first'));
  assert.equal(controller.getChannelState('general').unread, 502);
  assert.equal(delivered.length, 0);
  controller.channelRead('general');
  assert.deepEqual(controller.getChannelState('general'), { unread: 0, muted: true });
});

test('only a visible current chat is read on notice, focus or deferred join completion', async (t) => {
  const { controller, receive, view, focus, flushFrames } = await setup(t);
  controller.start();
  receive(notice('hidden'));
  focus();
  assert.equal(controller.getChannelState('general').unread, 1);
  view('general');
  focus();
  assert.equal(controller.getChannelState('general').unread, 0);
  receive(notice('visible'));
  assert.equal(controller.getChannelState('general').unread, 0);
  view('games', false);
  receive(notice('other-room'));
  receive({ type: 'joined-text-channel', room: { id: 'general' } });
  flushFrames();
  assert.equal(controller.getChannelState('general').unread, 1);
  receive({ type: 'joined-room', room: { id: 'general' } });
  view('general');
  flushFrames();
  assert.equal(controller.getChannelState('general').unread, 0);
});

test('notification policy preserves mentions, direct messages and requests with account preferences', async (t) => {
  const { controller, pref, identity } = await setup(t);
  controller.start();
  const target = { type: 'channel', id: 'general' };
  assert.equal(controller.allowed(target), false);
  for (const flag of ['mention', 'direct', 'request'])
    assert.equal(controller.allowed(target, { [flag]: true }), true);
  pref('notifications', 'all');
  assert.equal(controller.allowed(target), true);
  controller.mute('general', true);
  assert.equal(controller.allowed(target, { mention: true }), false);
  identity('bob');
  assert.equal(controller.allowed(target, { mention: true }), true);
  pref('notifications', 'off');
  assert.equal(controller.allowed(target, { direct: true }), false);
  identity(null);
  assert.equal(controller.allowed(target, { mention: true }), false);
});

test('account changes clear counters and dedupe while keeping mute and mode scoped to each account', async (t) => {
  const { controller, receive, identity, saved } = await setup(t);
  controller.start();
  controller.setMode('all');
  controller.selectChannel('general');
  controller.setSelectedMuted(true);
  receive(notice('same-id'));
  assert.equal(saved.get('alice:notifications'), 'all');
  assert.equal(saved.get('alice:mute:general'), true);
  identity('bob');
  assert.equal(controller.getSnapshot().mode, 'mentions');
  assert.deepEqual(controller.getChannelState('general'), { unread: 0, muted: false });
  receive(notice('same-id'));
  assert.equal(controller.getChannelState('general').unread, 1);
  identity('alice');
  assert.equal(controller.getSnapshot().mode, 'all');
  assert.deepEqual(controller.getChannelState('general'), { unread: 0, muted: true });
});

test('desktop delivery scopes targets and dedupe keys to the account and limits body length', async (t) => {
  const { controller, delivered, receive } = await setup(t);
  controller.start();
  receive(notice('mention', { mentioned: true }));
  assert.equal(delivered[0].key, 'alice:mention');
  assert.equal(delivered[0].title, 'Você foi mencionado · Geral');
  assert.equal(delivered[0].body, 'Amigo: Olá');
  assert.deepEqual(delivered[0].target, { type: 'channel', id: 'general', accountId: 'alice' });
  await controller.notify(payload({ body: 'a'.repeat(300) }));
  assert.equal(delivered[1].body.length, 220);
});

test('browser notices require background visibility and granted permission; stale clicks cannot cross accounts', async (t) => {
  const { controller, browser, permission, focus, identity, navigated } = await setup(t, {
    desktop: false,
  });
  controller.start();
  await controller.notify(payload());
  assert.equal(browser.length, 0);
  permission('granted');
  focus();
  await controller.notify(payload());
  assert.equal(browser.length, 0);
  focus(false);
  await controller.notify(payload());
  assert.equal(browser.length, 1);
  browser[0].onClick();
  assert.deepEqual(navigated, [{ type: 'channel', id: 'general', accountId: 'alice' }]);
  await controller.notify(payload());
  identity('bob');
  identity('alice');
  browser[1].onClick();
  assert.equal(navigated.length, 1);
  await controller.notify(payload());
  controller.dispose();
  browser[2].onClick();
  assert.equal(navigated.length, 1);
});

test('desktop clicks accept current account channel/direct/friends targets and reject malformed or stale targets', async (t) => {
  const { controller, click, identity, navigated } = await setup(t);
  controller.start();
  for (const type of ['channel', 'direct', 'friends'])
    click({ type, id: 'target', accountId: 'alice' });
  assert.equal(navigated.length, 3);
  for (const invalid of [
    null,
    [],
    {},
    { type: 'channel', id: '', accountId: 'alice' },
    { type: 'other', id: 'target', accountId: 'alice' },
    { type: 'channel', id: 'target', accountId: 'bob' },
  ])
    click(invalid);
  assert.equal(navigated.length, 3);
  identity('bob');
  click({ type: 'direct', id: 'target', accountId: 'alice' });
  assert.equal(navigated.length, 3);
});

test('permission prompts are single flight and late answers cannot update another account or disposed owner', async (t) => {
  const { controller, permissionRequests, answer, identity } = await setup(t, { desktop: false });
  controller.start();
  const first = controller.requestPermission(),
    duplicate = controller.requestPermission();
  assert.equal(permissionRequests(), 1);
  assert.equal(controller.getSnapshot().permissionPending, true);
  identity('bob');
  identity('alice');
  const before = controller.getSnapshot();
  answer('granted');
  await Promise.all([first, duplicate]);
  assert.strictEqual(controller.getSnapshot(), before);
  assert.equal(controller.getSnapshot().permissionStatus, '');
  const next = controller.requestPermission();
  controller.dispose();
  const disposed = controller.getSnapshot();
  answer('denied');
  await next;
  assert.strictEqual(controller.getSnapshot(), disposed);
});

test('valid permission answers update status and support another request after denial', async (t) => {
  const { controller, answer, permissionRequests } = await setup(t, { desktop: false });
  controller.start();
  const denied = controller.requestPermission();
  answer('denied');
  await denied;
  assert.equal(controller.getSnapshot().permissionPending, false);
  const denial = controller.getSnapshot().permissionStatus;
  assert(denial.length > 0);
  const granted = controller.requestPermission();
  answer('granted');
  await granted;
  assert.equal(permissionRequests(), 2);
  assert.equal(controller.getSnapshot().permissionPending, false);
  assert(controller.getSnapshot().permissionStatus.length > 0);
  assert.notEqual(controller.getSnapshot().permissionStatus, denial);
});

test('desktop and unsupported browsers never request browser permission', async (t) => {
  const desktop = await setup(t);
  desktop.controller.start();
  await desktop.controller.requestPermission();
  assert.equal(desktop.permissionRequests(), 0);
  const browser = await setup(t, { desktop: false });
  browser.permission('unsupported');
  browser.controller.start();
  await browser.controller.requestPermission();
  assert.equal(browser.permissionRequests(), 0);
  assert.equal(browser.controller.getSnapshot().permissionPending, false);
});

test('invalid direct requests, policy flags and settings are ignored without storage writes or notices', async (t) => {
  const { controller, delivered, saved } = await setup(t);
  controller.start();
  for (const invalid of [
    null,
    [],
    {},
    payload({ key: '' }),
    payload({ body: 7 }),
    payload({ mention: 'yes' }),
    payload({ target: { type: 'unknown', id: 'general' } }),
    payload({ target: { type: 'channel', id: '' } }),
  ])
    await controller.notify(invalid);
  assert.equal(delivered.length, 0);
  assert.equal(controller.allowed(null, { mention: true }), false);
  assert.equal(controller.allowed({ id: 'general' }, { mention: 'yes' }), false);
  const before = controller.getSnapshot();
  for (const invalid of ['unknown', '', true, null]) controller.setMode(invalid);
  controller.selectChannel('missing');
  assert.strictEqual(controller.getSnapshot(), before);
  assert.equal(saved.size, 0);
});

test('invalid socket notices and joined-room payloads cannot mutate counters or poison deduplication', async (t) => {
  const { controller, receive, delivered, flushFrames } = await setup(t);
  controller.start();
  const before = controller.getSnapshot();
  for (const invalid of [
    null,
    [],
    {},
    notice('bad', { roomId: '' }),
    notice('', {}),
    notice('bad', { roomName: 1 }),
    notice('bad', { name: null }),
    notice('bad', { text: [] }),
    notice('bad', { mentioned: 'yes' }),
    { type: 'joined-room', room: null },
    { type: 'joined-text-channel', room: { id: 5 } },
  ])
    receive(invalid);
  flushFrames();
  assert.strictEqual(controller.getSnapshot(), before);
  assert.equal(delivered.length, 0);
  receive(notice('bad', { mentioned: true }));
  assert.equal(controller.getChannelState('general').unread, 1);
  assert.equal(delivered.length, 1);
});

test('catalog and notice projection feedback never loops, and selection follows catalog replacements', async (t) => {
  const { controller, catalog, feedback, receive, changes } = await setup(t);
  controller.start();
  feedback();
  controller.selectChannel('games');
  receive(notice('one'));
  assert.equal(controller.getSnapshot().selectedChannelId, 'games');
  const beforeChanges = changes();
  const before = controller.getSnapshot();
  catalog([
    { id: 'general', name: 'Geral' },
    { id: 'games', name: 'Jogos' },
  ]);
  assert.strictEqual(controller.getSnapshot(), before);
  assert.equal(changes(), beforeChanges);
  catalog([{ id: 'general', name: 'Renomeado' }]);
  assert.equal(controller.getSnapshot().selectedChannelId, 'general');
  assert.equal(controller.getSnapshot().channels[0].name, 'Renomeado');
  assert.equal(controller.getChannelState('general').unread, 1);
  assert(Object.isFrozen(controller.getSnapshot()));
  assert(Object.isFrozen(controller.getSnapshot().channels));
  assert(Object.isFrozen(controller.getSnapshot().notices));
});
