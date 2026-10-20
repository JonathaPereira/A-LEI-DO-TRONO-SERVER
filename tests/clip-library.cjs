'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClipLibrary } = require('../src/lib/clips/library.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const clip = (id = 'a', owner = 'alice') => ({
  id,
  owner,
  createdAt: 1,
  name: 'Clipe',
  filename: id + '.webm',
  blob: new Blob(['encoded-webm']),
  state: 'pending',
});
function fixture() {
  const rows = new Map(),
    directories = new Map(),
    operations = [];
  const store = {
    async list(owner) {
      return [...rows.values()].filter((row) => row.owner === owner);
    },
    async directory(owner) {
      return directories.get(owner);
    },
    async setDirectory(owner, value) {
      directories.set(owner, value);
    },
    async put(row) {
      operations.push(['put', row]);
      rows.set(row.id, row);
    },
    async remove(id) {
      operations.push(['remove', id]);
      rows.delete(id);
    },
  };
  const files = {
    async chooseDirectory() {
      return undefined;
    },
    chooseFile() {
      return undefined;
    },
    download(blob, filename) {
      operations.push(['download', blob, filename]);
    },
  };
  const library = createClipLibrary(store, files);
  return { rows, directories, store, files, library, operations };
}
test('late list failures and folders cannot restore an earlier account, including alice-bob-alice', async () => {
  const f = fixture(),
    oldList = deferred(),
    oldFolder = deferred();
  let firstList = true,
    firstFolder = true;
  const list = f.store.list,
    directory = f.store.directory;
  f.store.list = (owner) => {
    if (firstList) {
      firstList = false;
      return oldList.promise;
    }
    return list(owner);
  };
  f.store.directory = (owner) => {
    if (firstFolder) {
      firstFolder = false;
      return oldFolder.promise;
    }
    return directory(owner);
  };
  const old = f.library.setOwner('alice');
  await f.library.setOwner('bob');
  f.rows.set('new', clip('new'));
  await f.library.setOwner('alice');
  oldList.reject(Error('obsolete failure'));
  oldFolder.resolve({ name: 'obsolete folder' });
  await old;
  const state = f.library.getSnapshot();
  assert.deepEqual(
    state.clips.map((row) => row.id),
    ['new'],
  );
  assert.equal(state.directory, null);
  assert.equal(state.message, '');
  assert(Object.isFrozen(state));
  assert(Object.isFrozen(state.clips));
  assert(Object.isFrozen(state.clips[0]));
});
test('latest refresh wins and an outdated successful list cannot reinsert deleted rows', async () => {
  const f = fixture();
  await f.library.setOwner('alice');
  const pending = deferred();
  f.store.list = () => pending.promise;
  const old = f.library.refresh();
  f.store.list = async () => [clip('latest')];
  await f.library.refresh();
  pending.resolve([clip('deleted')]);
  await old;
  assert.deepEqual(
    f.library.getSnapshot().clips.map((row) => row.id),
    ['latest'],
  );
});
test('resetting the folder invalidates both pending selection and persisted-folder reads', async () => {
  const f = fixture(),
    loaded = deferred(),
    picked = deferred();
  f.store.directory = () => loaded.promise;
  f.files.chooseDirectory = () => picked.promise;
  const owner = f.library.setOwner('alice'),
    choosing = f.library.chooseFolder();
  await f.library.resetFolder();
  picked.resolve({ name: 'stale picker' });
  loaded.resolve({ name: 'old saved folder' });
  await Promise.all([owner, choosing]);
  assert.equal(f.library.getSnapshot().directory, null);
  assert.equal(f.directories.get('alice'), null);
});
test('save opens its picker synchronously and cancellation leaves the only Blob intact', async () => {
  const f = fixture();
  f.rows.set('a', clip());
  await f.library.setOwner('alice');
  const picked = deferred();
  let invoked = false;
  f.files.chooseFile = (filename) => {
    assert.equal(filename, 'a.webm');
    invoked = true;
    return picked.promise;
  };
  const saving = f.library.save('a');
  assert.equal(invoked, true);
  assert.deepEqual(f.library.getSnapshot().busyIds, ['a']);
  picked.reject(new DOMException('Canceled', 'AbortError'));
  await saving;
  assert.equal(await f.rows.get('a').blob.text(), 'encoded-webm');
  assert.equal(f.operations.length, 0);
  assert.match(f.library.getSnapshot().message, /cancelado/);
  assert.deepEqual(f.library.getSnapshot().busyIds, []);
});
test('account change while choosing a file prevents writes and notifications in the new account', async () => {
  const f = fixture();
  f.rows.set('a', clip());
  await f.library.setOwner('alice');
  const picked = deferred();
  f.files.chooseFile = () => picked.promise;
  const saving = f.library.save('a');
  await f.library.setOwner('bob');
  picked.resolve({
    createWritable() {
      assert.fail('a stale picker must not create a writable');
    },
  });
  await saving;
  assert.equal(f.library.getSnapshot().owner, 'bob');
  assert.deepEqual(f.library.getSnapshot().clips, []);
  assert.equal(f.library.getSnapshot().message, '');
  assert.equal(f.operations.length, 0);
  assert(f.rows.get('a').blob);
});
test('a write already started finishes for its original account without overwriting the new account status', async () => {
  const f = fixture(),
    writing = deferred();
  let began = false,
    closed = false;
  f.rows.set('a', clip());
  f.rows.set('b', clip('b', 'bob'));
  await f.library.setOwner('alice');
  f.files.chooseFile = async () => ({
    async createWritable() {
      return {
        async write(blob) {
          assert.equal(await blob.text(), 'encoded-webm');
          began = true;
          await writing.promise;
        },
        async close() {
          closed = true;
        },
        async abort() {
          assert.fail('completed writes should close');
        },
      };
    },
  });
  const saving = f.library.save('a');
  await tick();
  assert.equal(began, true);
  await f.library.setOwner('bob');
  writing.resolve();
  await saving;
  assert.equal(closed, true);
  assert.equal(f.rows.get('a').blob, null);
  assert.equal(f.rows.get('a').state, 'saved');
  assert.deepEqual(
    f.library.getSnapshot().clips.map((row) => row.id),
    ['b'],
  );
  assert.equal(f.library.getSnapshot().message, '');
});
test('quota failure retains a memory-only clip across accounts and discards it without a database delete', async () => {
  const f = fixture();
  await f.library.setOwner('alice');
  let stopped = 0;
  f.store.put = async () => {
    throw Error('quota');
  };
  f.store.remove = async () => {
    assert.fail('memory-only data was never inserted');
  };
  await f.library.retain(clip(), () => stopped++);
  assert.equal(stopped, 1);
  assert.equal(f.library.hasUnsavedMemory('alice'), true);
  assert.equal(f.library.getSnapshot().pendingCount, 1);
  assert.match(f.library.getSnapshot().message, /somente na memória/);
  await f.library.setOwner('bob');
  assert.equal(f.library.getSnapshot().clips.length, 0);
  assert.equal(f.library.hasUnsavedMemory('bob'), false);
  assert.equal(f.library.hasUnsavedMemory(), true);
  await f.library.setOwner('alice');
  await f.library.discard('a');
  assert.equal(f.library.getSnapshot().clips.length, 0);
  assert.equal(f.library.hasUnsavedMemory(), false);
});
test('concurrent save/delete cannot export twice; failed writes abort and keep the Blob available', async () => {
  const f = fixture(),
    picked = deferred();
  let picks = 0,
    aborted = 0;
  f.rows.set('a', clip());
  await f.library.setOwner('alice');
  f.files.chooseFile = () => {
    picks++;
    return picked.promise;
  };
  const saving = f.library.save('a');
  await f.library.save('a');
  await f.library.discard('a');
  assert.equal(picks, 1);
  assert.equal(f.rows.size, 1);
  picked.resolve({
    async createWritable() {
      return {
        async write() {
          throw Error('disk full');
        },
        async abort() {
          aborted++;
        },
        async close() {
          assert.fail('failed write must abort');
        },
      };
    },
  });
  await saving;
  assert.equal(aborted, 1);
  assert(f.rows.get('a').blob);
  assert.deepEqual(f.library.getSnapshot().busyIds, []);
  assert.match(f.library.getSnapshot().message, /disk full/);
  assert.equal(f.operations.length, 0);
});
test('download keeps the Blob and failed saved metadata overlays the old row without losing the completed export', async () => {
  const f = fixture();
  f.rows.set('a', clip());
  await f.library.setOwner('alice');
  await f.library.save('a');
  assert.equal(f.operations[0][0], 'download');
  assert.equal(f.rows.get('a').state, 'download');
  assert(f.rows.get('a').blob);
  assert.equal(f.library.getSnapshot().pendingCount, 1);
  f.store.put = async () => {
    throw Error('database unavailable');
  };
  let wrote,
    closed = false;
  f.files.chooseFile = async () => ({
    async createWritable() {
      return {
        async write(blob) {
          wrote = blob;
        },
        async close() {
          closed = true;
        },
        async abort() {},
      };
    },
  });
  await f.library.save('a');
  const state = f.library.getSnapshot();
  assert.equal(await wrote.text(), 'encoded-webm');
  assert.equal(closed, true);
  assert.equal(state.clips[0].state, 'saved');
  assert.equal(state.clips[0].blob, null);
  assert.equal(state.pendingCount, 0);
  assert.equal(f.library.hasUnsavedMemory(), false);
  assert.match(state.message, /salvo no arquivo/);
  await f.library.discard('a');
  assert.equal(f.rows.size, 0);
});
test('revoked directory permission and stale writable creation preserve local clips', async () => {
  const f = fixture();
  f.rows.set('a', clip());
  f.directories.set('alice', {
    name: 'folder',
    async queryPermission() {
      return 'denied';
    },
    async requestPermission() {
      return 'denied';
    },
    getFileHandle() {
      assert.fail('denied access must not create a file');
    },
  });
  await f.library.setOwner('alice');
  await f.library.save('a');
  assert.match(f.library.getSnapshot().message, /Acesso à pasta negado/);
  await f.library.resetFolder();
  const opening = deferred();
  let aborted = 0;
  f.files.chooseFile = async () => ({ createWritable: () => opening.promise });
  const saving = f.library.save('a');
  await tick();
  await f.library.setOwner('bob');
  opening.resolve({
    async abort() {
      aborted++;
    },
    write() {
      assert.fail('stale writable must abort');
    },
  });
  await saving;
  assert.equal(aborted, 1);
  assert(f.rows.get('a').blob);
  f.library.dispose();
  let picker = 0;
  f.files.chooseDirectory = async () => {
    picker++;
  };
  await f.library.chooseFolder();
  assert.equal(picker, 0);
});
