'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createChatHistory } = require('../server/chat-history.ts');
const { accountRole, permissions, CREATOR_EMAIL } = require('../server/roles.ts');
const room = { id: 'text-a', kind: 'chat', channelType: 'text' };
const row = (id) => ({
  message: { id, roomId: room.id, text: 'Registro antigo', extra: { retained: true } },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const create = (fetchImpl) =>
  createChatHistory({
    auth: { required: true, configured: true },
    env: {
      SUPABASE_URL: 'https://provider.invalid',
      SUPABASE_SECRET_KEY: 'sb_secret_local_fixture',
    },
    fetchImpl,
  });

test('role policy uses verified provider email and persisted profile while malformed roles get no permissions', () => {
  const member = {
    email: 'member@example.test',
    email_confirmed_at: '2026-10-20T12:00:00Z',
    user_metadata: { role: 'creator', community_role: 'admin' },
  };
  assert.equal(accountRole(member), 'member');
  assert.equal(accountRole(member, { community_role: 'admin' }), 'admin');
  assert.equal(accountRole(member, { community_role: 'creator' }), 'member');
  assert.equal(
    accountRole({ ...member, email: ' ' + CREATOR_EMAIL.toUpperCase() + ' ' }),
    'creator',
  );
  for (const email_confirmed_at of [null, '', false, true, {}, []])
    assert.equal(accountRole({ email: CREATOR_EMAIL, email_confirmed_at }), 'member');
  for (const input of [null, undefined, [], 1, 'forged-role']) {
    assert.equal(accountRole(input, { community_role: 'admin' }), 'member');
    assert(Object.values(permissions(input)).every((value) => value === false));
  }
  assert.deepEqual(permissions('creator'), {
    moderateVoice: true,
    manageChannels: true,
    moderateFiles: true,
    manageRoles: true,
    viewEmails: true,
    uploadSounds: true,
  });
  assert.deepEqual(permissions('admin'), {
    moderateVoice: true,
    manageChannels: true,
    moderateFiles: true,
    manageRoles: false,
    viewEmails: false,
    uploadSounds: true,
  });
  assert.deepEqual(permissions('member'), {
    moderateVoice: false,
    manageChannels: false,
    moderateFiles: false,
    manageRoles: false,
    viewEmails: false,
    uploadSounds: true,
  });
});

test('history rejects malformed, cross-channel, duplicated and oversized pages as one unavailable response', async () => {
  let payload;
  const store = create(async () => Response.json(payload));
  try {
    const malformed = [
      null,
      {},
      [null],
      [{ message: null }],
      [{ message: [] }],
      [{ message: { id: 42, roomId: room.id } }],
      [{ message: { id: '', roomId: room.id } }],
      [{ message: { id: 'a', roomId: 'foreign' } }],
      [row('a'), row('a')],
      Array.from({ length: 52 }, (_, index) => row('id-' + index)),
    ];
    for (payload of malformed) {
      await assert.rejects(store.read(room), { code: 'CHAT_HISTORY_UNAVAILABLE' });
      assert.equal(store.health().ready, false);
    }
    payload = Array.from({ length: 51 }, (_, index) => row('id-' + index));
    const page = await store.read(room);
    assert.equal(page.messages.length, 50);
    assert.equal(page.hasMore, true);
    assert.equal(page.before, 'id-49');
    assert.deepEqual(page.messages[0].extra, { retained: true });
    assert.equal(store.health().ready, true);
    assert.notEqual(page.messages[0], payload[49].message);
  } finally {
    store.close();
  }
});

test('history serializes each room, keeps other rooms independent and recovers after a failed operation', async () => {
  const store = create(async () => Response.json([])),
    gate = deferred(),
    order = [];
  try {
    const first = store.serial('a', async () => {
      order.push('a1');
      await gate.promise;
      throw Error('write failed');
    });
    const failure = assert.rejects(first, /write failed/);
    const second = store.serial('a', async () => {
      order.push('a2');
      return 2;
    });
    const other = store.serial('b', async () => {
      order.push('b1');
      return 3;
    });
    await other;
    assert.deepEqual(order, ['a1', 'b1']);
    gate.resolve();
    await failure;
    assert.equal(await second, 2);
    assert.deepEqual(order, ['a1', 'b1', 'a2']);
  } finally {
    store.close();
  }
});

test('closing history aborts its own pending RPC and rejects queued/new operations without running them', async () => {
  let request;
  const store = create(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        request = options;
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        });
      }),
  );
  const read = store.serial(room.id, () => store.read(room)),
    rejected = assert.rejects(read, { code: 'CHAT_HISTORY_UNAVAILABLE' });
  let ran = false;
  const queued = store.serial(room.id, async () => {
      ran = true;
    }),
    cancelled = assert.rejects(queued, { code: 'CHAT_HISTORY_UNAVAILABLE' });
  await tick();
  assert.equal(request.signal.aborted, false);
  store.close();
  store.close();
  await Promise.all([rejected, cancelled]);
  assert.equal(request.signal.aborted, true);
  assert.equal(ran, false);
  assert.equal(store.health().ready, false);
  await assert.rejects(store.read(room), { code: 'CHAT_HISTORY_UNAVAILABLE' });
  await assert.rejects(
    store.serial('new', async () => {
      ran = true;
    }),
    { code: 'CHAT_HISTORY_UNAVAILABLE' },
  );
  assert.equal(ran, false);
});

test('local history remains explicit and voice/game rooms never use persistent RPCs', async () => {
  let calls = 0;
  const store = createChatHistory({
    auth: { configured: false, required: false },
    env: {},
    fetchImpl: async () => {
      calls++;
      throw Error('unexpected request');
    },
  });
  try {
    const history = [row('local').message];
    assert.deepEqual((await store.read({ ...room, chatHistory: history })).messages, history);
    assert.notEqual((await store.read({ ...room, chatHistory: history })).messages, history);
    for (const ephemeral of [
      { ...room, kind: 'game' },
      { ...room, channelType: 'voice' },
    ]) {
      await store.append(ephemeral, {}, null);
      assert.deepEqual((await store.read(ephemeral)).messages, []);
    }
    assert.equal(calls, 0);
    assert.deepEqual(store.health(), { configured: false, ready: false, persistent: false });
  } finally {
    store.close();
  }
});
