'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/chat/messages.ts');

const message = (id, roomId = 'chat-a', extra = {}) => ({
  id,
  roomId,
  senderId: 'peer',
  accountId: 'account',
  name: 'Pessoa',
  seat: 0,
  text: 'Texto ' + id,
  ts: 1000,
  ...extra,
});

async function setup(t, role = 'creator') {
  const { createChatMessages } = await modulePromise;
  let snapshot = { currentRoom: 'chat-a', connected: true, clientId: 'peer' };
  let account = { id: 'account', role };
  let send = true;
  const stateListeners = new Set(),
    messageListeners = new Set(),
    identityListeners = new Set();
  const sent = [],
    notices = [],
    activity = [],
    warnings = [];
  const network = {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      stateListeners.add(fn);
      return () => stateListeners.delete(fn);
    },
    onMessage(fn) {
      messageListeners.add(fn);
      return () => messageListeners.delete(fn);
    },
    requestChatHistory(before) {
      sent.push({ type: 'history', before });
      return send;
    },
    deleteChatMessage(id, requestId) {
      sent.push({ type: 'delete', id, requestId });
      return send;
    },
    clearChatHistory(requestId) {
      sent.push({ type: 'clear', requestId });
      return send;
    },
  };
  const controller = createChatMessages({
    network,
    getAccount: () => account,
    subscribeIdentity(fn) {
      identityListeners.add(fn);
      return () => identityListeners.delete(fn);
    },
    reportStatus: (text) => notices.push(text),
    onActivity: (event) => activity.push(event),
    warn: (error) => warnings.push(error),
  });
  const receive = (data) => {
    for (const fn of messageListeners) fn(data);
  };
  const join = (id, kind = 'chat', channelType = 'mixed') => {
    snapshot = { ...snapshot, currentRoom: id };
    for (const fn of stateListeners) fn();
    receive({ type: 'joined-room', room: { id, kind, channelType } });
  };
  const history = (items, extra = {}) =>
    receive({
      type: 'chat-history',
      roomId: snapshot.currentRoom,
      messages: items,
      hasMore: false,
      before: items[0]?.id ?? null,
      revision: 0,
      older: false,
      ...extra,
    });
  receive({ type: 'welcome', features: { chatModeration: true } });
  join('chat-a');
  t.after(() => controller.dispose());
  return {
    controller,
    sent,
    notices,
    warnings,
    activity,
    receive,
    history,
    join,
    failSend() {
      send = false;
    },
    disconnect() {
      snapshot = { ...snapshot, connected: false };
      for (const fn of stateListeners) fn();
    },
    identity(id, role) {
      account = { id, role };
      for (const fn of identityListeners) fn();
    },
    listenerCounts: () => [stateListeners.size, messageListeners.size, identityListeners.size],
  };
}

test('history and pagination merge once, retaining immutable rows and refusing duplicate requests', async (t) => {
  const { controller, history, sent } = await setup(t);
  history([message('b'), message('c')], { hasMore: true });
  const row = controller.getSnapshot().messages[0];
  assert.equal(controller.loadOlder(), true);
  assert.equal(controller.loadOlder(), false);
  history([message('a'), message('b')], { older: true });
  assert.deepEqual(
    controller.getSnapshot().messages.map((m) => m.id),
    ['a', 'b', 'c'],
  );
  assert.equal(controller.getSnapshot().messages[1], row);
  assert.deepEqual(sent, [{ type: 'history', before: 'b' }]);
  assert(Object.isFrozen(controller.getSnapshot().messages));
  assert(Object.isFrozen(row));
  assert.equal(controller.getSnapshot().loadingOlder, false);
  assert.equal(controller.getSnapshot().change, 'prepend');
});

test('live messages are deduplicated and only new live rows produce unread/sound activity', async (t) => {
  const { controller, history, receive, activity } = await setup(t);
  history([message('a')]);
  receive({ type: 'chat-message', message: message('b'), revision: 1 });
  receive({ type: 'chat-message', message: message('b'), revision: 1 });
  receive({ type: 'chat-message', message: message('other', 'chat-b'), revision: 2 });
  assert.deepEqual(
    controller.getSnapshot().messages.map((m) => m.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    activity.map((item) => item.type),
    ['read', 'message'],
  );
});

test('a newer deletion prevents an old history or live event from restoring a message', async (t) => {
  const { controller, history, receive } = await setup(t);
  history([message('a'), message('b')], { revision: 3, hasMore: true });
  controller.loadOlder();
  receive({ type: 'chat-message-deleted', id: 'a', roomId: 'chat-a', revision: 4 });
  history([message('a')], { revision: 3, older: true });
  receive({ type: 'chat-message', message: message('a'), revision: 3 });
  assert.deepEqual(
    controller.getSnapshot().messages.map((m) => m.id),
    ['b'],
  );
  assert.equal(controller.getSnapshot().before, 'b');
  assert.equal(controller.getSnapshot().loadingOlder, false);
});

test('clearing history invalidates an outstanding page and closes its confirmation', async (t) => {
  const { controller, history, receive } = await setup(t);
  history([message('a')], { hasMore: true });
  controller.loadOlder();
  controller.chooseModeration({ action: 'clear' });
  receive({ type: 'chat-history-cleared', roomId: 'chat-a', revision: 1 });
  history([message('old')], { older: true, revision: 0 });
  assert.equal(controller.getSnapshot().messages.length, 0);
  assert.equal(controller.getSnapshot().hasMore, false);
  assert.equal(controller.getSnapshot().choice, null);
});

test('switching rooms discards rows, pagination and confirmations, ignoring old room replies', async (t) => {
  const { controller, history, join, receive } = await setup(t);
  history([message('a')], { hasMore: true });
  controller.loadOlder();
  controller.chooseModeration({ action: 'delete', id: 'a' });
  join('chat-b');
  receive({
    type: 'chat-history',
    roomId: 'chat-a',
    messages: [message('a')],
    hasMore: false,
    revision: 1,
  });
  assert.equal(controller.getSnapshot().roomId, 'chat-b');
  assert.equal(controller.getSnapshot().messages.length, 0);
  assert.equal(controller.confirmModeration(), false);
  assert.equal(controller.getSnapshot().loadingOlder, false);
});

test('malformed pages are rejected atomically without advancing the room revision', async (t) => {
  const { controller, history, receive, warnings } = await setup(t);
  history([message('a')]);
  const rows = controller.getSnapshot().messages;
  history([message('b'), message('wrong', 'chat-b')], { revision: 900 });
  assert.equal(controller.getSnapshot().messages, rows);
  receive({
    type: 'chat-message',
    message: message('b', 'chat-a', { attachment: { id: 2 } }),
    revision: 900,
  });
  receive({ type: 'chat-message', message: message('b'), revision: -1 });
  receive({ type: 'chat-message', message: message('b'), revision: 1 });
  assert.deepEqual(
    controller.getSnapshot().messages.map((m) => m.id),
    ['a', 'b'],
  );
  assert.equal(warnings.length, 3);
});

test('permissions follow creator role, negotiated support and room kind/type', async (t) => {
  const { controller, join, identity, receive } = await setup(t, 'member');
  assert.equal(controller.getSnapshot().canModerate, false);
  controller.chooseModeration({ action: 'clear' });
  assert.equal(controller.getSnapshot().choice, null);
  identity('account', 'creator');
  assert.equal(controller.getSnapshot().canModerate, true);
  join('voice', 'chat', 'voice');
  assert.equal(controller.getSnapshot().canModerate, false);
  join('game', 'game', null);
  assert.equal(controller.getSnapshot().canModerate, false);
  join('chat-a');
  receive({ type: 'welcome', features: {} });
  assert.equal(controller.getSnapshot().canModerate, false);
});

test('moderation sends only after confirmation and matches request, room, action and message', async (t) => {
  const { controller, history, sent, receive, notices } = await setup(t);
  history([message('a')]);
  controller.chooseModeration({ action: 'delete', id: 'a' });
  controller.cancelModeration();
  assert.equal(controller.confirmModeration(), false);
  assert.equal(sent.length, 0);
  controller.chooseModeration({ action: 'delete', id: 'a' });
  assert.equal(controller.confirmModeration(), true);
  const { requestId } = sent[0];
  for (const extra of [
    { roomId: 'other' },
    { requestId: 'wrong' },
    { action: 'clear' },
    { id: 'wrong' },
  ])
    receive({
      type: 'chat-moderation-result',
      requestId,
      roomId: 'chat-a',
      action: 'delete',
      id: 'a',
      ok: true,
      ...extra,
    });
  assert(controller.getSnapshot().pending);
  receive({
    type: 'chat-moderation-result',
    requestId,
    roomId: 'chat-a',
    action: 'delete',
    id: 'a',
    ok: true,
  });
  assert.equal(controller.getSnapshot().pending, null);
  assert.deepEqual(notices, ['Mensagem apagada.']);
});

test('a removed message or lost role cannot be confirmed from an old dialog', async (t) => {
  const { controller, history, receive, identity, sent } = await setup(t);
  history([message('a')]);
  controller.chooseModeration({ action: 'delete', id: 'a' });
  receive({ type: 'chat-message-deleted', roomId: 'chat-a', id: 'a', revision: 1 });
  assert.equal(controller.confirmModeration(), false);
  controller.chooseModeration({ action: 'clear' });
  identity('account', 'member');
  assert.equal(controller.confirmModeration(), false);
  assert.deepEqual(sent, []);
});

test('history and moderation deadlines release their locks and allow retry', async (t) => {
  const { controller, history, notices } = await setup(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  history([message('a')], { hasMore: true });
  controller.loadOlder();
  t.mock.timers.tick(15000);
  assert.equal(controller.getSnapshot().loadingOlder, false);
  assert.match(notices.at(-1), /histórico demorou/);
  controller.chooseModeration({ action: 'clear' });
  controller.confirmModeration();
  t.mock.timers.tick(30000);
  assert.equal(controller.getSnapshot().pending, null);
  assert.match(notices.at(-1), /confirmação demorou/);
  assert.equal(controller.loadOlder(), true);
});

test('disconnect cancels pending work; late acknowledgements do not affect a later room', async (t) => {
  const { controller, history, sent, receive, notices, disconnect } = await setup(t);
  history([message('a')]);
  controller.chooseModeration({ action: 'clear' });
  controller.confirmModeration();
  const { requestId } = sent[0];
  disconnect();
  assert.equal(controller.getSnapshot().pending, null);
  receive({
    type: 'chat-moderation-result',
    requestId,
    roomId: 'chat-a',
    action: 'clear',
    ok: true,
  });
  assert.deepEqual(notices, []);
});

test('send failures release pending work and deletion marks only the referenced attachment', async (t) => {
  const { controller, history, receive, failSend, notices } = await setup(t);
  const file = { id: 'file', name: 'file.pdf', bytes: 8, mime: 'application/pdf' };
  history([message('a', 'chat-a', { attachment: file })], { hasMore: true });
  const before = controller.getSnapshot().messages[0];
  receive({ type: 'attachment-deleted', id: 'file' });
  assert.equal(controller.getSnapshot().messages[0].attachment.deleted, true);
  assert.equal(before.attachment.deleted, undefined);
  failSend();
  assert.equal(controller.loadOlder(), false);
  controller.chooseModeration({ action: 'clear' });
  assert.equal(controller.confirmModeration(), false);
  assert.equal(controller.getSnapshot().pending, null);
  assert.equal(notices.length, 2);
});

test('identity changes clear private rows; observer errors cannot prevent cleanup', async (t) => {
  const { controller, history, identity, warnings, listenerCounts } = await setup(t);
  history([message('a')]);
  controller.subscribe(() => {
    throw Error('observer failure');
  });
  identity('another-account', 'member');
  assert.equal(controller.getSnapshot().messages.length, 0);
  assert(warnings.length > 0);
  controller.dispose();
  assert.deepEqual(listenerCounts(), [0, 0, 0]);
});

test('disposing a controller prevents later pagination or destructive commands', async (t) => {
  const { controller, history, sent } = await setup(t);
  history([message('a')], { hasMore: true });
  controller.chooseModeration({ action: 'clear' });
  controller.dispose();
  assert.equal(controller.loadOlder(), false);
  controller.chooseModeration({ action: 'delete', id: 'a' });
  assert.equal(controller.confirmModeration(), false);
  assert.deepEqual(sent, []);
});
