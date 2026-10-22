'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createSoundboard } = require('../src/lib/soundboard/controller.ts');
const { encodeWav, waveformPeaks } = require('../src/lib/soundboard/wav.ts');
const { decodeSound } = require('../src/lib/soundboard/decode.ts');
const { validateSound } = require('../server/soundboard.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const clip = (duration = 30, channels = 2, rate = 48000) => ({
  duration,
  length: duration * rate,
  sampleRate: rate,
  numberOfChannels: channels,
  getChannelData: (channel) =>
    Float32Array.from({ length: duration * rate }, (_, i) => (channel ? (i % 2 ? 1 : -1) : 0.5)),
});
const sound = (id = 'one') => ({
  id,
  name: id + '.wav',
  mime: 'audio/wav',
  bytes: 96044,
  kind: 'soundboard',
  ownerId: 'account-a',
  durationMs: 1000,
});
function fixture(ports = {}) {
  let source = { accountId: 'account-a', moderateFiles: false, epoch: 1, deleted: {} },
    listener,
    releases = 0;
  const players = [],
    sent = [],
    removed = [],
    uploads = [],
    revoked = [],
    signals = [],
    notices = [],
    storage = new Map();
  const files = {
    getSnapshot: () => source,
    subscribe(fn) {
      listener = fn;
      return () => {
        releases++;
        listener = null;
      };
    },
    api: ports.api ?? (async () => ({ files: [sound()], hasMore: false })),
    url: ports.url ?? (async (id) => 'https://files.test/' + id),
    upload:
      ports.upload ??
      (async (file, options) => {
        uploads.push({ file, options });
      }),
    remove: async (id) => {
      removed.push(id);
      return ports.remove?.(id);
    },
  };
  const owner = createSoundboard({
    files,
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    decode: async (file, signal) => {
      signals.push(signal);
      return ports.decode ? ports.decode(file, signal) : clip();
    },
    player(url) {
      const value = {
        url,
        volume: 1,
        currentTime: 0,
        paused: true,
        plays: 0,
        loads: 0,
        pause() {
          this.paused = true;
        },
        removeAttribute() {
          this.url = '';
        },
        load() {
          this.loads++;
        },
        async play() {
          this.plays++;
          if (ports.play) await ports.play();
          this.paused = false;
        },
      };
      players.push(value);
      return value;
    },
    createUrl: () => 'blob:preview',
    revokeUrl: (url) => revoked.push(url),
    login: () => notices.push('login'),
    send: (id) => {
      sent.push(id);
      return true;
    },
    confirm: () => true,
  });
  owner.start();
  return {
    owner,
    players,
    sent,
    removed,
    uploads,
    revoked,
    signals,
    notices,
    storage,
    identity(patch) {
      source = { ...source, ...patch };
      listener?.();
    },
    get source() {
      return source;
    },
    get releases() {
      return releases;
    },
    join(roomId = 'voice-one', deafened = false) {
      owner.callChanged({ joined: true, roomId, deafened });
    },
  };
}
const file = () => new File(['fixture'], 'original.wav', { type: 'audio/wav' });
test('WAV encoder preserves signed stereo PCM, selected frame boundaries and the server contract', async () => {
  const blob = encodeWav(clip(1), 0.25, 0.75),
    bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.length, 44 + 24000 * 4);
  assert.equal(bytes.readInt16LE(44), 16383);
  assert.equal(bytes.readInt16LE(46), -32768);
  assert.equal(bytes.readInt16LE(50), 32767);
  assert.equal(validateSound(bytes).durationMs, 500);
  for (const [start, end] of [
    [-1, 1],
    [2, 1],
    [0, 16],
    [NaN, 1],
  ])
    assert.throws(() => encodeWav(clip(), start, end));
  assert.equal(
    validateSound(Buffer.from(await encodeWav(clip(), 11, 26).arrayBuffer())).durationMs,
    15000,
  );
  assert.equal(waveformPeaks(clip(1)).length, 214);
  assert(Object.isFrozen(waveformPeaks(clip(1))));
});
test('decoder abort rejects promptly and closes only its context while a browser decode finishes late', async () => {
  const decoded = deferred(),
    abort = new AbortController();
  let closes = 0;
  const result = decodeSound(file(), abort.signal, () => ({
    decodeAudioData: () => decoded.promise,
    async close() {
      closes++;
    },
  }));
  const rejected = assert.rejects(result, { name: 'AbortError' });
  await tick();
  abort.abort();
  await rejected;
  decoded.resolve(clip());
  await tick();
  assert.equal(closes, 1);
});
test('library parsing rejects malformed pages, duplicate IDs and stalled pagination atomically', async () => {
  for (const page of [
    { files: [sound(), sound()], hasMore: false },
    { files: [sound()], hasMore: true, nextOffset: 0 },
    { files: [{ ...sound(), durationMs: 15001 }], hasMore: false },
    { files: 'invalid', hasMore: false },
  ]) {
    const f = fixture({ api: async () => page });
    await f.owner.open();
    assert.equal(f.owner.getSnapshot().sounds.length, 0);
    assert.match(f.owner.getSnapshot().message, /inválid/);
    f.owner.dispose();
  }
});
test('refresh cannot publish into a later account, including a round trip to the same ID', async () => {
  const page = deferred(),
    f = fixture({ api: () => page.promise });
  const opened = f.owner.open();
  f.identity({ accountId: 'account-b', epoch: 2 });
  f.identity({ accountId: 'account-a', epoch: 3 });
  page.resolve({ files: [sound()], hasMore: false });
  await opened;
  assert.equal(f.owner.getSnapshot().sounds.length, 0);
  assert.equal(f.owner.getSnapshot().message, '');
  f.owner.dispose();
});
test('a tombstone arriving during refresh cannot resurrect a deleted sound', async () => {
  const page = deferred(),
    f = fixture({ api: () => page.promise });
  const opened = f.owner.open();
  f.identity({ deleted: { one: true } });
  page.resolve({ files: [sound()], hasMore: false });
  await opened;
  assert.equal(f.owner.getSnapshot().sounds.length, 0);
  f.owner.dispose();
});
test('preview stays local, call effects require membership and room-scoped messages use the same player', async () => {
  const f = fixture();
  await f.owner.open();
  f.owner.play('one');
  assert.deepEqual(f.sent, []);
  await f.owner.preview('one');
  assert.equal(f.players.length, 1);
  assert.equal(f.players[0].paused, false);
  f.owner.close();
  assert.equal(f.players[0].paused, true);
  f.join();
  f.owner.play('one');
  assert.deepEqual(f.sent, ['one']);
  f.owner.handleMessage({ type: 'soundboard-play', roomId: 'other', file: sound() });
  await tick();
  assert.equal(f.players.length, 1);
  f.owner.handleMessage({ type: 'soundboard-play', roomId: 'voice-one', file: sound() });
  await tick();
  assert.equal(f.players.length, 2);
  f.owner.handleMessage({ type: 'soundboard-play', roomId: 'voice-one', file: sound() });
  await tick();
  assert.equal(f.players.length, 2);
  assert.equal(f.players[1].plays, 2);
  f.owner.dispose();
});
test('deafen mutes received effects without muting a local preview, and volume is account scoped', async () => {
  const f = fixture();
  await f.owner.open();
  f.join('voice-one', true);
  f.owner.setVolume(35);
  f.owner.handleMessage({ type: 'soundboard-play', roomId: 'voice-one', file: sound() });
  await tick();
  assert.equal(f.players[0].volume, 0);
  await f.owner.preview('one');
  assert.equal(f.players[1].volume, 0.35);
  assert.equal(f.storage.get('mnSoundVolume:account-a'), '35');
  f.identity({ accountId: 'account-b', epoch: 2 });
  assert.equal(f.owner.getSnapshot().volume, 70);
  assert.equal(f.players[1].paused, true);
  f.owner.dispose();
});
test('a late signed URL after call leave never creates a player', async () => {
  const url = deferred(),
    f = fixture({ url: () => url.promise });
  f.join();
  f.owner.handleMessage({ type: 'soundboard-play', roomId: 'voice-one', file: sound() });
  f.owner.callChanged({ joined: false, deafened: false, roomId: null });
  url.resolve('https://files.test/late');
  await tick();
  assert.equal(f.players.length, 0);
  f.owner.dispose();
});

test('closing the menu cancels a pending local preview before its signed URL arrives', async () => {
  const url = deferred(),
    f = fixture({ url: () => url.promise });
  await f.owner.open();
  const preview = f.owner.preview('one');
  f.owner.close();
  url.resolve('https://files.test/late');
  await preview;
  assert.equal(f.players.length, 0);
  f.owner.dispose();
});

test('closing the menu preserves a received call effect that is still resolving its URL', async () => {
  const url = deferred(),
    f = fixture({ url: () => url.promise });
  await f.owner.open();
  f.join();
  f.owner.handleMessage({ type: 'soundboard-play', roomId: 'voice-one', file: sound() });
  f.owner.close();
  url.resolve('https://files.test/call');
  await tick();
  assert.equal(f.players.length, 1);
  assert.equal(f.players[0].paused, false);
  f.owner.dispose();
});
test('restarting the same pending player cannot let its earlier promise stop the new playback', async () => {
  const first = deferred(),
    second = deferred(),
    queue = [first, second],
    f = fixture({ play: () => queue.shift().promise });
  await f.owner.open();
  const a = f.owner.preview('one');
  await tick();
  const b = f.owner.preview('one');
  first.resolve();
  await a;
  second.resolve();
  await b;
  assert.equal(f.players.length, 1);
  assert.equal(f.players[0].paused, false);
  f.owner.dispose();
});
test('a replaced decoder cannot publish its clip or clear a newer loading state', async () => {
  const first = deferred(),
    second = deferred(),
    queue = [first, second],
    f = fixture({ decode: () => queue.shift().promise });
  const a = f.owner.load(file()),
    b = f.owner.load(new File(['b'], 'second.wav'));
  first.resolve(clip(3));
  await a;
  assert.equal(f.owner.getSnapshot().loading, true);
  assert.equal(f.signals[0].aborted, true);
  second.resolve(clip(30));
  await b;
  assert.equal(f.owner.getSnapshot().name, 'second');
  assert.equal(f.owner.getSnapshot().trimEnd, 15);
  f.owner.dispose();
});
test('trim fields keep at most 15 seconds and previews revoke their object URLs on trim and close', async () => {
  const f = fixture();
  await f.owner.open();
  await f.owner.load(file());
  f.owner.changeTrim('end', 26);
  assert.equal(f.owner.getSnapshot().trimStart, 11);
  assert.equal(f.owner.getSnapshot().trimEnd, 26);
  await f.owner.previewTrim();
  assert.equal(f.players[0].paused, false);
  f.owner.changeTrim('start', 12);
  assert.deepEqual(f.revoked, ['blob:preview']);
  assert.equal(f.players[0].paused, true);
  await f.owner.previewTrim();
  f.owner.close();
  assert.equal(f.revoked.length, 2);
  f.owner.dispose();
});
test('upload serializes selected PCM and clears the editor only for its originating session', async () => {
  const pending = deferred(),
    f = fixture({
      upload: async (file, options) => {
        f.uploads.push({ file, options });
        return pending.promise;
      },
    });
  await f.owner.load(file());
  f.owner.changeTrim('end', 26);
  const upload = f.owner.upload();
  assert.equal(f.owner.getSnapshot().uploading, true);
  assert.equal(f.uploads.length, 1);
  const bytes = Buffer.from(await f.uploads[0].file.arrayBuffer());
  assert.equal(validateSound(bytes).durationMs, 15000);
  f.identity({ accountId: 'account-b', epoch: 2 });
  assert.equal(f.uploads[0].options.signal.aborted, true);
  f.owner.setName('new account');
  pending.resolve({});
  await upload;
  assert.equal(f.owner.getSnapshot().name, 'new account');
  assert.equal(f.owner.getSnapshot().message, '');
  f.owner.dispose();
});
test('successful upload resets file, trim and details, then refreshes the library', async () => {
  const f = fixture();
  f.owner.setDetails(true);
  await f.owner.load(file());
  await f.owner.upload();
  assert.equal(f.owner.getSnapshot().clip, null);
  assert.equal(f.owner.getSnapshot().detailsOpen, false);
  assert.equal(f.owner.getSnapshot().fileRevision, 1);
  assert.equal(f.owner.getSnapshot().sounds.length, 1);
  assert.equal(f.owner.getSnapshot().message, 'Efeito adicionado à biblioteca.');
  f.owner.dispose();
});
test('delete authorization and in-flight deduplication preserve a later account library', async () => {
  const removal = deferred(),
    f = fixture({ remove: () => removal.promise });
  await f.owner.open();
  const pending = f.owner.remove('one');
  await f.owner.remove('one');
  assert.deepEqual(f.removed, ['one']);
  f.identity({ accountId: 'account-b', epoch: 2 });
  await f.owner.open();
  removal.resolve();
  await pending;
  assert.equal(f.owner.getSnapshot().sounds.length, 1);
  await f.owner.remove('one');
  assert.deepEqual(f.removed, ['one']);
  f.owner.dispose();
});
test('disposal unsubscribes, aborts uploads/decodes and prevents late playback from restarting', async () => {
  const playing = deferred(),
    f = fixture({ play: () => playing.promise });
  await f.owner.open();
  const preview = f.owner.preview('one');
  await tick();
  f.owner.dispose();
  f.owner.dispose();
  playing.resolve();
  await preview;
  assert.equal(f.players[0].paused, true);
  assert.equal(f.releases, 1);
  const snapshot = f.owner.getSnapshot();
  await f.owner.open();
  await f.owner.load(file());
  assert.strictEqual(f.owner.getSnapshot(), snapshot);
});
