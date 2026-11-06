'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/chat/composer.ts');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function setup(t) {
  const { createChatComposer } = await modulePromise;
  let snapshot = { currentRoom: 'chat-livre', connected: true };
  let account = 'member-a';
  const stateListeners = new Set(),
    messageListeners = new Set(),
    identityListeners = new Set();
  const sent = [],
    removed = [],
    uploads = [],
    warnings = [];
  let allowSend = true;
  const network = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onMessage: (listener) => {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    sendChat: (text, attachmentId) => {
      if (!allowSend) return false;
      sent.push({ text, attachmentId, roomId: snapshot.currentRoom });
      return true;
    },
  };
  const files = {
    upload(file, options) {
      const result = deferred();
      uploads.push({ file, options, ...result });
      return result.promise;
    },
    async remove(id) {
      removed.push(id);
    },
  };
  const composer = createChatComposer({
    network,
    getFiles: () => files,
    getAccountId: () => account,
    subscribeIdentity: (listener) => {
      identityListeners.add(listener);
      return () => identityListeners.delete(listener);
    },
    warn: (error) => warnings.push(error),
  });
  t.after(() => composer.dispose());
  return {
    composer,
    sent,
    removed,
    uploads,
    warnings,
    offlineSend: () => {
      allowSend = false;
    },
    changeRoom(id) {
      snapshot = { ...snapshot, currentRoom: id };
      for (const listener of stateListeners) listener();
    },
    disconnect() {
      snapshot = { ...snapshot, connected: false };
      for (const listener of stateListeners) listener();
    },
    changeAccount(id) {
      account = id;
      for (const listener of identityListeners) listener();
    },
    receive(message) {
      for (const listener of messageListeners) listener(message);
    },
    listenerCounts: () => [stateListeners.size, messageListeners.size, identityListeners.size],
  };
}
const file = (name = 'anexo.pdf', size = 8) => ({ name, size });

test('text submission trims once, keeps newlines and preserves a draft when send is unavailable', async (t) => {
  const { composer, sent, offlineSend } = await setup(t);
  composer.setDraft('  Primeira\nSegunda  ');
  assert.equal(await composer.send(), true);
  assert.deepEqual(sent, [
    { text: 'Primeira\nSegunda', attachmentId: undefined, roomId: 'chat-livre' },
  ]);
  assert.equal(await composer.send(), false);
  composer.setDraft('Rascunho');
  offlineSend();
  assert.equal(await composer.send(), false);
  assert.equal(composer.getSnapshot().draft, 'Rascunho');
  assert.match(composer.getSnapshot().status, /Conexão interrompida/);
});

test('selection checks empty files and distinct document/video limits before any upload', async (t) => {
  const { composer, uploads, changeRoom } = await setup(t);
  assert.equal(composer.selectFile(file('empty.pdf', 0)), false);
  assert.equal(composer.selectFile(file('large.pdf', 10_000_001)), false);
  assert.equal(composer.selectFile(file('video.WEBM', 100_000_000)), true);
  assert.equal(composer.selectFile(file('large.mp4', 100_000_001)), false);
  assert.equal(composer.getSnapshot().file, null);
  assert.equal(uploads.length, 0);
  changeRoom(null);
  assert.equal(composer.canAttach(), false);
  assert.equal(composer.selectFile(file()), false);
});

test('one upload owns the send lock and progress; successful delivery clears file and draft', async (t) => {
  const { composer, uploads, sent } = await setup(t);
  composer.setDraft('Legenda');
  composer.selectFile(file());
  const sending = composer.send();
  assert.equal(composer.getSnapshot().uploading, true);
  assert.equal(await composer.send(), false);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].options.roomId, 'chat-livre');
  uploads[0].options.onProgress(42);
  assert.match(composer.getSnapshot().status, /42%/);
  composer.setDraft('Alteração durante envio');
  assert.equal(composer.getSnapshot().draft, 'Legenda');
  uploads[0].resolve({ id: 'file-a' });
  assert.equal(await sending, true);
  assert.deepEqual(sent, [{ text: 'Legenda', attachmentId: 'file-a', roomId: 'chat-livre' }]);
  assert.equal(composer.getSnapshot().uploading, false);
  assert.equal(composer.getSnapshot().draft, '');
  assert.equal(composer.getSnapshot().file, null);
});

test('an upload failure preserves selected file and draft for retry', async (t) => {
  const { composer, uploads, sent, removed } = await setup(t);
  const selected = file();
  composer.setDraft('Tentar novamente');
  composer.selectFile(selected);
  const sending = composer.send();
  uploads[0].reject(Error('Upload falhou'));
  assert.equal(await sending, false);
  assert.equal(composer.getSnapshot().draft, 'Tentar novamente');
  assert.equal(composer.getSnapshot().file, selected);
  assert.equal(composer.getSnapshot().status, 'Upload falhou');
  assert.equal(composer.getSnapshot().uploading, false);
  assert.deepEqual([sent, removed], [[], []]);
});

test('an uploaded file is removed if its message cannot be sent', async (t) => {
  const { composer, uploads, removed, offlineSend } = await setup(t);
  composer.selectFile(file());
  const sending = composer.send();
  offlineSend();
  uploads[0].resolve({ id: 'unlinked-file' });
  assert.equal(await sending, false);
  assert.deepEqual(removed, ['unlinked-file']);
  assert.equal(composer.getSnapshot().uploading, false);
});

test('cancel ignores late progress and completion, and rolls back an unlinked file', async (t) => {
  const { composer, uploads, sent, removed } = await setup(t);
  composer.setDraft('Preservar');
  composer.selectFile(file());
  const sending = composer.send();
  composer.cancel();
  const cancelled = composer.getSnapshot();
  assert.equal(uploads[0].options.signal.aborted, true);
  uploads[0].options.onProgress(99);
  uploads[0].resolve({ id: 'late-file' });
  assert.equal(await sending, false);
  assert.equal(composer.getSnapshot(), cancelled);
  assert.equal(cancelled.draft, 'Preservar');
  assert.equal(cancelled.uploading, false);
  assert.deepEqual(sent, []);
  assert.deepEqual(removed, ['late-file']);
});

test('switching channels and back cannot revive an upload from the previous visit', async (t) => {
  const { composer, uploads, sent, changeRoom } = await setup(t);
  composer.selectFile(file());
  const sending = composer.send();
  changeRoom('chat-jogos');
  changeRoom('chat-livre');
  uploads[0].resolve({ id: 'old-visit' });
  assert.equal(await sending, false);
  assert.deepEqual(sent, []);
  assert.equal(composer.getSnapshot().file, null);
});

test('a cancelled upload cannot overwrite progress or unlock a newer upload', async (t) => {
  const { composer, uploads, removed, sent } = await setup(t);
  composer.selectFile(file('old.pdf'));
  const old = composer.send();
  composer.cancel();
  composer.selectFile(file('new.pdf'));
  const next = composer.send();
  uploads[1].options.onProgress(22);
  const progress = composer.getSnapshot();
  uploads[0].resolve({ id: 'old' });
  await old;
  assert.equal(composer.getSnapshot(), progress);
  assert.equal(composer.getSnapshot().uploading, true);
  uploads[1].resolve({ id: 'new' });
  assert.equal(await next, true);
  assert.deepEqual(removed, ['old']);
  assert.equal(sent[0].attachmentId, 'new');
});

test('account changes cancel uploads and clear drafts without deleting under the next account', async (t) => {
  const { composer, uploads, removed, sent, changeAccount } = await setup(t);
  composer.setDraft('Texto privado');
  composer.selectFile(file());
  const sending = composer.send();
  changeAccount('member-b');
  uploads[0].resolve({ id: 'previous-account-file' });
  assert.equal(await sending, false);
  assert.equal(composer.getSnapshot().draft, '');
  assert.deepEqual(sent, []);
  assert.deepEqual(removed, []);
});

test('disconnect cancels uploads but keeps the draft; retries never start uploads offline', async (t) => {
  const { composer, uploads, disconnect } = await setup(t);
  composer.setDraft('Continuar depois');
  composer.selectFile(file());
  const sending = composer.send();
  disconnect();
  uploads[0].reject(Error('Aborted'));
  await sending;
  assert.equal(composer.getSnapshot().draft, 'Continuar depois');
  composer.selectFile(file());
  assert.equal(await composer.send(), false);
  assert.equal(uploads.length, 1);
});

test('history errors restore only an empty draft in the same channel', async (t) => {
  const { composer, receive } = await setup(t);
  const error = {
    type: 'error',
    code: 'CHAT_HISTORY_UNAVAILABLE',
    message: 'Não foi possível salvar',
    failedMessage: { roomId: 'chat-livre', text: 'Recuperado' },
  };
  receive(error);
  assert.equal(composer.getSnapshot().draft, 'Recuperado');
  composer.setDraft('Texto mais recente');
  receive(error);
  assert.equal(composer.getSnapshot().draft, 'Texto mais recente');
  composer.setDraft('');
  receive({ ...error, failedMessage: { ...error.failedMessage, roomId: 'other' } });
  assert.equal(composer.getSnapshot().draft, '');
});

test('malformed upload responses never become attachment IDs', async (t) => {
  const { composer, uploads, sent } = await setup(t);
  composer.selectFile(file());
  const sending = composer.send();
  uploads[0].resolve({ id: 7 });
  assert.equal(await sending, false);
  assert.match(composer.getSnapshot().status, /Resposta inválida/);
  assert.deepEqual(sent, []);
});

test('state observers cannot mutate snapshots or break delivery, and dispose releases all listeners', async (t) => {
  const { composer, warnings, listenerCounts } = await setup(t);
  const old = composer.getSnapshot();
  const unsubscribe = composer.subscribe(() => {
    throw Error('observer failure');
  });
  composer.setDraft('Novo');
  assert.equal(warnings.length, 1);
  assert(Object.isFrozen(composer.getSnapshot()));
  assert.equal(old.draft, '');
  unsubscribe();
  assert.deepEqual(listenerCounts(), [1, 1, 1]);
  composer.dispose();
  assert.deepEqual(listenerCounts(), [0, 0, 0]);
});
