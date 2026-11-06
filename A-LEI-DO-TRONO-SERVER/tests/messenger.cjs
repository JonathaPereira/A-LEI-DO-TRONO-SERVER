'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const ready = Promise.all([
  import('../src/lib/messenger/controller.ts'),
  import('../src/lib/messenger/protocol.ts'),
  import('../src/lib/messenger/client.ts'),
]);
const id = (n) => '21000000-0000-4000-8000-' + String(n).padStart(12, '0');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const person = (n) => ({ id: id(n), name: 'Pessoa ' + n, state: 'accepted', incoming: false });
const message = (n, extra = {}) => ({
  id: id(n),
  senderId: id(2),
  text: 'Mensagem ' + n,
  roomId: null,
  ts: new Date(1000 + n).toISOString(),
  ...extra,
});
async function setup(t) {
  const [{ createMessenger }] = await ready;
  let source = { accountId: id(1), epoch: 1 },
    focused = true,
    allowed = true,
    request = async (action, body) => {
      if (action === 'snapshot') return { friends: [person(2), person(3)], threads: [] };
      if (action === 'read') return { messages: [], hasMore: false };
      if (action === 'send') return message(10, { ...body, senderId: id(1) });
      return { ok: true };
    },
    upload = async () => {
      throw new Error('Not configured');
    };
  const identities = new Set(),
    network = new Set(),
    preferences = new Set(),
    presence = new Set(),
    calls = [],
    uploads = [],
    jobs = [],
    notifications = [],
    warnings = [];
  const subscribe = (set) => (fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };
  const controller = createMessenger({
    client: {
      request: (action, body = {}, signal) => {
        calls.push({ action, body, signal });
        return request(action, body, signal);
      },
    },
    files: {
      getSnapshot: () => source,
      subscribe: subscribe(identities),
      upload: (file, options) => {
        uploads.push({ file, options });
        return upload(file, options);
      },
    },
    community: {
      getSnapshot: () => ({
        identity: { accountId: source.accountId },
        presence: { members: [person(2), person(3)] },
      }),
      subscribe: subscribe(presence),
    },
    network: { onMessage: subscribe(network) },
    channels: { getSnapshot: () => ({ channels: [{ id: 'chat-livre', name: 'Geral' }] }) },
    notifications: {
      allowed: () => allowed,
      notify: async (value) => {
        notifications.push(value);
      },
      subscribe: subscribe(preferences),
    },
    foreground: () => focused,
    openLogin: () => {},
    beforeOpen: () => {},
    randomId: () => id(500),
    warn: (error) => warnings.push(error),
    schedule(callback, delay) {
      const job = { callback, delay, canceled: false };
      jobs.push(job);
      return () => {
        job.canceled = true;
      };
    },
  });
  controller.start();
  await controller.refresh();
  t.after(() => controller.dispose());
  return {
    controller,
    calls,
    uploads,
    jobs,
    notifications,
    warnings,
    request(fn) {
      request = fn;
    },
    upload(fn) {
      upload = fn;
    },
    identity(value = id(1)) {
      source = { accountId: value, epoch: source.epoch + 1 };
      identities.forEach((fn) => fn());
    },
    emit(value) {
      network.forEach((fn) => fn(value));
    },
    focus(value) {
      focused = value;
    },
    policy(value) {
      allowed = value;
      preferences.forEach((fn) => fn());
    },
    listeners: () => identities.size + network.size + preferences.size + presence.size,
  };
}
test('late history merges live messages and expanded history without advancing the earlier cursor', async (t) => {
  const f = await setup(t),
    held = deferred();
  f.request(async (action) => (action === 'read' ? held.promise : { ok: true }));
  await f.controller.open(id(2));
  f.emit({ type: 'direct-message', peerId: id(1), senderName: 'Pessoa', message: message(20) });
  held.resolve({ messages: [message(10)], hasMore: true });
  await tick();
  assert.deepEqual(
    f.controller.getSnapshot().messages.map((m) => m.id),
    [id(10), id(20)],
  );
  f.request(async (action) =>
    action === 'read' ? { messages: [message(5)], hasMore: true } : { ok: true },
  );
  await f.controller.read(true);
  f.request(async (action) =>
    action === 'read' ? { messages: [message(20)], hasMore: false } : { ok: true },
  );
  await f.controller.read();
  assert.deepEqual(
    f.controller.getSnapshot().messages.map((m) => m.id),
    [id(5), id(10), id(20)],
  );
  assert.equal(f.controller.getSnapshot().hasMore, true);
});
test('switching peers aborts upload, retains per-peer drafts and cannot send the file to a different peer', async (t) => {
  const f = await setup(t),
    held = deferred();
  f.upload(() => held.promise);
  await f.controller.open(id(2));
  f.controller.setText('Só para dois');
  f.controller.setFile(new File(['image'], 'foto.png', { type: 'image/png' }));
  const sending = f.controller.submit();
  await tick();
  await f.controller.open(id(3));
  assert.equal(f.uploads[0].options.signal.aborted, true);
  assert.equal(f.controller.getSnapshot().draft.text, '');
  assert.equal(f.controller.getSnapshot().draft.file, null);
  held.reject(new Error('Canceled'));
  await sending;
  f.controller.setText('Para três');
  await f.controller.submit();
  assert.equal(f.calls.filter((call) => call.action === 'send')[0].body.peerId, id(3));
  assert.equal(f.calls.filter((call) => call.action === 'send')[0].body.attachmentId, null);
  await f.controller.open(id(2));
  assert.equal(f.controller.getSnapshot().draft.text, 'Só para dois');
  assert.equal(f.controller.getSnapshot().draft.file.name, 'foto.png');
});
test('failed send reuses the upload and idempotency key; later text edits are not cleared by acknowledgement', async (t) => {
  const f = await setup(t);
  await f.controller.open(id(2));
  const attachment = {
    id: id(400),
    name: 'foto.png',
    mime: 'image/png',
    bytes: 5,
    kind: 'direct',
    ownerId: id(1),
    peerId: id(2),
    roomId: null,
  };
  f.upload(async () => attachment);
  let fail = true;
  f.request(async (action, body) => {
    if (action !== 'send') return { ok: true };
    if (fail) {
      fail = false;
      throw new Error('Falha após enviar');
    }
    return message(500, { id: body.id, senderId: id(1), text: body.text, attachment });
  });
  f.controller.setText('Repetir');
  f.controller.setFile(new File(['image'], 'foto.png', { type: 'image/png' }));
  await f.controller.submit();
  assert.equal(f.controller.getSnapshot().draft.text, 'Repetir');
  await f.controller.submit();
  assert.equal(f.uploads.length, 1);
  const sends = f.calls.filter((call) => call.action === 'send');
  assert.equal(sends[0].body.id, sends[1].body.id);
  assert.equal(f.controller.getSnapshot().draft.file, null);
  assert.equal(f.controller.getSnapshot().draft.text, '');
  const held = deferred();
  f.request(async (action) => (action === 'send' ? held.promise : { ok: true }));
  f.controller.setText('Primeiro');
  const writing = f.controller.submit();
  f.controller.setText('Novo texto');
  held.resolve(message(500, { senderId: id(1), text: 'Primeiro' }));
  await writing;
  assert.equal(f.controller.getSnapshot().draft.text, 'Novo texto');
});
test('account ABA invalidates a send, clears private state and prevents late callbacks from restoring it', async (t) => {
  const f = await setup(t);
  await f.controller.open(id(2));
  const held = deferred();
  f.request(async (action) => (action === 'send' ? held.promise : { ok: true }));
  f.controller.setText('Privado');
  const sending = f.controller.submit();
  f.identity(null);
  f.identity(id(1));
  held.resolve(message(500, { senderId: id(1), text: 'Privado' }));
  await sending;
  const state = f.controller.getSnapshot();
  assert.equal(state.peerId, null);
  assert.equal(state.open, false);
  assert.deepEqual(state.messages, []);
  assert.equal(state.draft.text, '');
});
test('notices cap, deduplicate, pause, respect policy changes and dispose with their timers', async (t) => {
  const f = await setup(t);
  f.focus(false);
  for (let n = 2; n < 7; n++)
    f.emit({
      type: 'direct-message',
      peerId: id(1),
      senderName: 'Pessoa',
      message: message(50 + n, { senderId: id(n) }),
    });
  f.emit({
    type: 'direct-message',
    peerId: id(1),
    senderName: 'Duplicate',
    message: message(56, { senderId: id(6) }),
  });
  assert.equal(f.controller.getSnapshot().toasts.length, 3);
  assert.equal(f.notifications.length, 5);
  const last = f.jobs.filter((job) => job.delay === 8000).at(-1);
  f.controller.toastTimer(id(6), true);
  assert.equal(last.canceled, true);
  f.policy(false);
  assert.equal(f.controller.getSnapshot().toasts.length, 0);
  f.controller.dispose();
  assert.equal(f.listeners(), 0);
  const state = f.controller.getSnapshot();
  last.callback();
  f.controller.attention();
  assert.equal(f.controller.getSnapshot(), state);
});
test('unrelated senders and foreign attachments cannot enter private history; malformed snapshots apply atomically', async (t) => {
  const [, protocol] = await ready;
  assert.throws(() =>
    protocol.readDirectPage(
      { messages: [message(10, { senderId: id(9) })], hasMore: false },
      id(1),
      id(2),
    ),
  );
  assert.throws(() =>
    protocol.readDirectMessage(
      message(10, {
        attachment: {
          id: id(20),
          name: 'Foreign',
          mime: 'image/png',
          bytes: 2,
          kind: 'direct',
          ownerId: id(1),
          peerId: id(9),
        },
      }),
      id(1),
      id(2),
    ),
  );
  const f = await setup(t),
    before = f.controller.getSnapshot().friends;
  f.request(async () => ({ friends: [person(2), person(2)], threads: [] }));
  await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().friends, before);
});
test('social HTTP cancellation during token lookup prevents a write under an old account, including ABA', async () => {
  const [, , { createSocialClient }] = await ready;
  let source = { accountId: id(1), epoch: 1 };
  const listeners = new Set(),
    held = deferred(),
    requests = [];
  const client = createSocialClient({
    identity: {
      getSnapshot: () => source,
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    backendHttp: 'https://backend.test',
    getAccessToken: () => held.promise,
    fetch: async (...args) => {
      requests.push(args);
      return new Response('{}');
    },
  });
  try {
    const writing = client.request('send', {}),
      rejected = assert.rejects(writing);
    source = { accountId: null, epoch: 2 };
    listeners.forEach((fn) => fn());
    source = { accountId: id(1), epoch: 3 };
    listeners.forEach((fn) => fn());
    held.resolve('old-token');
    await rejected;
    assert.deepEqual(requests, []);
  } finally {
    client.dispose();
    assert.equal(listeners.size, 0);
  }
});
