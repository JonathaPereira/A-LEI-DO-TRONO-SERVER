'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { fixture: channelFixture } = require('./channel-service-fixture.cjs');
const { createChatService } = require('../server/chat-service.ts');
const { createChatHistory } = require('../server/chat-history.ts');
const {
  readChatInput,
  readHistoryInput,
  readModerationInput,
} = require('../server/chat-protocol.ts');
const { CREATOR_EMAIL } = require('../server/roles.ts');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const fileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture({ append, read, attachment } = {}) {
  const f = channelFixture(),
    a = f.connection('alice', 'Alice'),
    b = f.connection('bob', 'Bob'),
    observer = f.connection('observer', 'Pessoa');
  for (const ws of [a, b]) f.service.joinRoom(ws, 'chat-livre');
  const room = f.rooms.get('chat-livre'),
    store = createChatHistory({ auth: { configured: false, required: false } }),
    writes = [],
    removals = [];
  const history = {
    ...store,
    append: async (...args) => {
      writes.push(args);
      if (append) await append(...args);
    },
    read: read ? (...args) => read(store, ...args) : store.read,
    remove: async (...args) => {
      removals.push(args);
      await store.remove(...args);
    },
    clear: store.clear,
  };
  const chat = createChatService({
    rooms: f.rooms,
    wss: { clients: f.clients },
    send: (ws, event) => f.messages.push({ to: ws.clientId, ...JSON.parse(JSON.stringify(event)) }),
    selectedChatId: (ws) => f.service.selectedChatId(ws) || null,
    history,
    files: {
      attachment:
        attachment || (async (id) => ({ id, name: 'Imagem', mime: 'image/png', bytes: 200 })),
    },
  });
  f.messages.length = 0;
  return {
    ...f,
    a,
    b,
    observer,
    room,
    chat,
    store,
    writes,
    removals,
    close() {
      chat.stop();
      store.close();
      f.service.stop();
    },
  };
}
function makeCreator(ws) {
  Object.assign(ws.account, { role: 'creator', email: CREATOR_EMAIL });
}

test('chat protocol validates scalars and IDs, preserves cleaning/limits and projects only known fields', () => {
  for (const input of [
    null,
    [],
    { text: 12 },
    { text: {} },
    { text: 'a', attachmentId: 'x' },
    { text: 'a', roomId: [] },
  ])
    assert.equal(readChatInput(input), null);
  assert.deepEqual(
    readChatInput({
      text: '  a\r\n\n\n\nb\t c\u0000 ',
      attachmentId: fileId,
      roomId: 'chat-livre',
      accountId: 'spoof',
    }),
    { text: 'a\n\nb c', attachmentId: fileId, roomId: 'chat-livre' },
  );
  assert.equal(readChatInput({ text: 'x'.repeat(400) }).text.length, 300);
  assert.equal(readHistoryInput({ roomId: 'chat-livre', before: '-'.repeat(36) }), null);
  assert.deepEqual(
    readModerationInput({
      type: 'chat-message-delete',
      roomId: 'chat-livre',
      requestId: 'x'.repeat(90),
      id: fileId,
      role: 'creator',
    }),
    { action: 'delete', roomId: 'chat-livre', requestId: 'x'.repeat(80), id: fileId },
  );
});

test('one accepted append publishes bounded history, revision, attachment and mention notices using the original actor', async () => {
  const f = fixture();
  try {
    await f.chat.message(f.a, { text: 'Oi @Bob!', attachmentId: fileId });
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0][2], f.a.account.id);
    const events = f.messages.filter((m) => m.type === 'chat-message');
    assert.equal(events.length, 2);
    assert.equal(events[0].revision, 1);
    assert.equal(events[0].message.attachment.id, fileId);
    assert.equal(
      f.messages.find((m) => m.type === 'chat-notice' && m.to === 'bob').mentioned,
      true,
    );
    assert.equal(
      f.messages.find((m) => m.type === 'chat-notice' && m.to === 'observer').mentioned,
      false,
    );
    assert(!f.messages.some((m) => m.type === 'chat-notice' && m.to === 'alice'));
    await f.chat.message(f.a, { text: 'too soon' });
    assert.equal(f.messages.at(-1).code, 'CHAT_RATE');
    assert.equal(f.writes.length, 1);
    f.chat.attachmentDeleted(fileId, f.room.id);
    await f.chat.sendHistory(f.b, f.room);
    assert.equal(f.messages.at(-1).messages[0].attachment.deleted, true);
    assert.equal(f.messages.at(-1).revision, 1);
  } finally {
    f.close();
  }
});

test('malformed, foreign-socket, wrong-channel and guest attachment messages cannot enter the persistence queue', async () => {
  const f = fixture();
  try {
    await f.chat.message(f.a, { text: {} });
    assert.equal(f.messages.at(-1).code, 'INVALID_MESSAGE');
    await f.chat.message({ ...f.a }, { text: 'spoof' });
    assert.equal(f.messages.at(-1).code, 'NOT_IN_ROOM');
    await f.chat.message(f.a, { text: 'wrong', roomId: 'chat-jogos' });
    assert.equal(f.messages.at(-1).code, 'NOT_IN_ROOM');
    f.a.account = null;
    f.a.guest = { id: 'guest', expiresAt: Date.now() + 99999 };
    await f.chat.message(f.a, { text: 'guest', attachmentId: fileId });
    assert.equal(f.messages.at(-1).code, 'LOGIN_REQUIRED_FILES');
    assert.equal(f.writes.length, 0);
  } finally {
    f.close();
  }
});

test('leaving while an attachment is loading prevents append, even when its adapter ignores cancellation', async () => {
  const gate = deferred(),
    entered = deferred(),
    f = fixture({
      attachment: async () => {
        entered.resolve();
        await gate.promise;
        return { id: fileId, name: 'x', mime: 'image/png', bytes: 1 };
      },
    });
  try {
    const pending = f.chat.message(f.a, { text: 'pending', attachmentId: fileId });
    await entered.promise;
    f.room.players.delete(f.a.clientId);
    f.a.roomId = null;
    gate.resolve();
    await pending;
    assert.equal(f.writes.length, 0);
    assert(!f.messages.some((m) => m.type === 'chat-message' || m.type === 'error'));
  } finally {
    f.close();
  }
});

test('a persistent append already submitted survives sender departure without changing its author to a replacement account', async () => {
  const gate = deferred(),
    entered = deferred(),
    f = fixture({
      append: async () => {
        entered.resolve();
        await gate.promise;
      },
    });
  try {
    const actor = f.a.account.id,
      pending = f.chat.message(f.a, { text: 'accepted' });
    await entered.promise;
    f.room.players.delete(f.a.clientId);
    f.a.roomId = null;
    f.a.account = { ...f.a.account, id: 'replacement' };
    gate.resolve();
    await pending;
    const event = f.messages.find((m) => m.type === 'chat-message');
    assert.equal(event.to, 'bob');
    assert.equal(event.message.accountId, actor);
    assert.equal(f.writes.length, 1);
    await f.chat.sendHistory(f.b, f.room);
    assert.equal(f.messages.at(-1).messages.length, 1);
  } finally {
    f.close();
  }
});

test('history and moderation share one room queue so a pending page cannot restore deleted messages afterwards', async () => {
  const gate = deferred(),
    entered = deferred();
  let reading = false;
  const f = fixture({
    read: async (store, ...args) => {
      if (reading) {
        entered.resolve();
        await gate.promise;
      }
      return store.read(...args);
    },
  });
  try {
    makeCreator(f.a);
    await f.chat.message(f.a, { text: 'remove me' });
    const id = f.writes[0][1].id;
    f.messages.length = 0;
    reading = true;
    const page = f.chat.sendHistory(f.b, f.room);
    await entered.promise;
    const deletion = f.chat.moderate(f.a, {
      type: 'chat-message-delete',
      requestId: 'delete',
      roomId: f.room.id,
      id,
    });
    await flush();
    assert.equal(f.removals.length, 0);
    gate.resolve();
    await Promise.all([page, deletion]);
    const pageIndex = f.messages.findIndex((m) => m.type === 'chat-history'),
      deleteIndex = f.messages.findIndex((m) => m.type === 'chat-message-deleted');
    assert(pageIndex >= 0 && deleteIndex > pageIndex);
    assert.equal(f.messages.at(-1).ok, true);
    reading = false;
    await f.chat.sendHistory(f.b, f.room);
    assert.equal(f.messages.at(-1).messages.length, 0);
    assert.equal(f.messages.at(-1).revision, 2);
  } finally {
    f.close();
  }
});

test('queued moderation revalidates creator role and does not use a changed identity for the RPC', async () => {
  const f = fixture(),
    gate = deferred();
  try {
    makeCreator(f.a);
    const blocked = f.store.serial(f.room.id, () => gate.promise);
    const pending = f.chat.moderate(f.a, {
      type: 'chat-message-delete',
      requestId: 'role',
      roomId: f.room.id,
      id: fileId,
    });
    f.a.account = { ...f.a.account, role: 'member' };
    gate.resolve();
    await Promise.all([pending, blocked]);
    assert.equal(f.removals.length, 0);
    assert.equal(f.messages.at(-1).error.code, 'FORBIDDEN');
    assert.equal(f.messages.at(-1).requestId, 'role');
    makeCreator(f.a);
    await f.chat.moderate(f.a, {
      type: 'chat-message-delete',
      requestId: 'bad-id',
      roomId: f.room.id,
      id: 'wrong',
    });
    assert.equal(f.messages.at(-1).error.code, 'INVALID_MESSAGE');
    assert.equal(f.messages.at(-1).requestId, 'bad-id');
  } finally {
    gate.resolve();
    f.close();
  }
});

test('a changed or expired identity cannot receive an old history page or commit queued messages', async () => {
  const gate = deferred(),
    entered = deferred(),
    f = fixture({
      read: async (store, ...args) => {
        entered.resolve();
        await gate.promise;
        return store.read(...args);
      },
    });
  try {
    const pending = f.chat.sendHistory(f.a, f.room);
    await entered.promise;
    f.a.account = { ...f.a.account, id: 'replacement' };
    gate.resolve();
    await pending;
    assert.equal(f.messages.length, 0);
    const queued = deferred(),
      blocked = f.store.serial(f.room.id, () => queued.promise),
      message = f.chat.message(f.a, { text: 'expires' });
    f.a.account.expiresAt = 0;
    queued.resolve();
    await Promise.all([blocked, message]);
    assert.equal(f.writes.length, 0);
  } finally {
    f.close();
  }
});

test('reset invalidates old ephemeral work while keeping revision monotonic for a later game-room history', async () => {
  const gate = deferred(),
    entered = deferred();
  let appends = 0;
  const f = fixture({
    append: async () => {
      if (++appends === 2) {
        entered.resolve();
        await gate.promise;
      }
    },
  });
  try {
    f.room.kind = 'game';
    await f.chat.message(f.a, { text: 'first' });
    f.chat.reset(f.room);
    await f.chat.sendHistory(f.b, f.room);
    assert.equal(f.messages.at(-1).messages.length, 0);
    assert.equal(f.messages.at(-1).revision, 1);
    const pending = f.chat.message(f.b, { text: 'old pending append' });
    await entered.promise;
    f.chat.reset(f.room);
    gate.resolve();
    await pending;
    await f.chat.sendHistory(f.a, f.room);
    assert.equal(f.messages.at(-1).messages.length, 0);
    assert.equal(f.messages.at(-1).revision, 1);
    f.service.joinRoom(f.observer, 'chat-livre');
    await f.chat.message(f.observer, { text: 'fresh' });
    assert.equal(f.messages.findLast((m) => m.type === 'chat-message').revision, 2);
  } finally {
    gate.resolve();
    f.close();
  }
});

test('in-memory history retains only the newest hundred entries with monotonic revision', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const f = fixture();
  try {
    for (let index = 0; index < 120; index++) {
      now += 500;
      await f.chat.message(f.a, { text: 'entry-' + index });
    }
    await f.chat.sendHistory(f.b, f.room);
    const page = f.messages.at(-1);
    assert.equal(page.messages.length, 100);
    assert.equal(page.messages[0].text, 'entry-20');
    assert.equal(page.messages.at(-1).text, 'entry-119');
    assert.equal(page.revision, 120);
  } finally {
    f.close();
  }
});

test('shutdown aborts pending history and append waits, suppresses late replies, and remains idempotent', async () => {
  for (const operation of ['read', 'append']) {
    const gate = deferred(),
      entered = deferred(),
      f = fixture({
        [operation]: async (store, ...args) => {
          entered.resolve();
          await gate.promise;
          return operation === 'read' ? store.read(...args) : undefined;
        },
      });
    try {
      const pending =
        operation === 'read'
          ? f.chat.sendHistory(f.a, f.room)
          : f.chat.message(f.a, { text: 'stopping' });
      await entered.promise;
      f.chat.stop();
      f.chat.stop();
      await pending;
      const count = f.messages.length;
      gate.resolve();
      await flush();
      await f.chat.message(f.a, { text: 'late' });
      f.chat.requestHistory(f.a, { roomId: f.room.id });
      await f.chat.moderate(f.a, { type: 'chat-history-clear', roomId: f.room.id });
      assert.equal(f.messages.length, count);
    } finally {
      gate.resolve();
      f.close();
    }
  }
});
