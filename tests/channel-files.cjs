'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ready = import('../src/lib/channels/files.ts');
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const file = (id, roomId = 'room') => ({
  id,
  name: id,
  mime: 'image/png',
  bytes: 12,
  kind: 'chat',
  roomId,
  ownerId: 'owner',
});
async function setup(t) {
  const { createChannelFiles } = await ready;
  let account = { accountId: 'one', epoch: 1 },
    room = { connected: true, currentRoom: 'room' },
    api = async () => ({ files: [file('one')], hasMore: false, nextOffset: 1 });
  const identities = new Set(),
    rooms = new Set(),
    messages = new Set(),
    calls = [];
  const subscribe = (set) => (fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };
  const controller = createChannelFiles({
    files: {
      getSnapshot: () => account,
      subscribe: subscribe(identities),
      api: (path, options) => {
        calls.push({ path, options });
        return api(path, options);
      },
    },
    network: {
      getSnapshot: () => room,
      subscribe: subscribe(rooms),
      onMessage: subscribe(messages),
    },
  });
  t.after(() => controller.dispose());
  return {
    controller,
    calls,
    identities,
    rooms,
    messages,
    api(fn) {
      api = fn;
    },
    identity() {
      account = { ...account, epoch: account.epoch + 1 };
      identities.forEach((fn) => fn());
    },
    room(value) {
      room = { ...room, ...value };
      rooms.forEach((fn) => fn());
    },
    emit(value) {
      messages.forEach((fn) => fn(value));
    },
  };
}
test('pagination retries the same failed cursor, deduplicates overlaps and rejects foreign-room files atomically', async (t) => {
  const f = await setup(t);
  f.api(async () => ({ files: [file('one')], hasMore: true, nextOffset: 1 }));
  await f.controller.open();
  f.api(async () => {
    throw new Error('Falha de página');
  });
  await f.controller.more();
  assert.equal(f.controller.getSnapshot().error, true);
  assert.equal(f.controller.getSnapshot().loading, false);
  f.api(async () => ({ files: [file('one'), file('two')], hasMore: true, nextOffset: 3 }));
  await f.controller.more();
  assert.deepEqual(
    f.calls.map((call) => call.path),
    ['/channel/room?offset=0', '/channel/room?offset=1', '/channel/room?offset=1'],
  );
  assert.deepEqual(
    f.controller.getSnapshot().files.map((row) => row.id),
    ['one', 'two'],
  );
  f.api(async () => ({ files: [file('foreign', 'other')], hasMore: false, nextOffset: 4 }));
  await f.controller.more();
  assert.equal(f.controller.getSnapshot().nextOffset, 3);
  assert.equal(f.controller.getSnapshot().files.length, 2);
  assert.equal(f.controller.getSnapshot().error, true);
});
test('closing, switching room, identity ABA and disconnect discard late pages', async (t) => {
  const f = await setup(t);
  for (const reset of [
    () => f.controller.close(),
    () => {
      f.room({ currentRoom: 'other' });
      f.room({ currentRoom: 'room' });
    },
    () => f.identity(),
    () => {
      f.room({ connected: false });
      f.room({ connected: true });
    },
  ]) {
    const pending = deferred();
    f.api(() => pending.promise);
    const read = f.controller.open();
    reset();
    assert.equal(f.calls.at(-1).options.signal.aborted, true);
    pending.resolve({ files: [file('late')], hasMore: false, nextOffset: 1 });
    await read;
    assert.equal(f.controller.getSnapshot().open, false);
    assert.deepEqual(f.controller.getSnapshot().files, []);
  }
});
test('only deletion of the displayed channel closes the view; disposal removes listeners', async (t) => {
  const f = await setup(t);
  await f.controller.open();
  f.emit({ type: 'channel-deleted', roomId: 'other' });
  assert.equal(f.controller.getSnapshot().open, true);
  f.emit({ type: 'channel-deleted', roomId: 'room' });
  assert.equal(f.controller.getSnapshot().open, false);
  f.controller.dispose();
  assert.equal(f.identities.size + f.rooms.size + f.messages.size, 0);
});
