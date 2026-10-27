'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRecorder } = require('../src/lib/recording/recorder.ts');
const { captureRecording } = require('../src/lib/recording/capture.ts');
const { saveRecording } = require('../src/lib/recording/files.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class Track extends EventTarget {
  constructor(kind) {
    super();
    this.kind = kind;
    this.readyState = 'live';
    this.stops = 0;
  }
  stop() {
    this.stops++;
    this.readyState = 'ended';
  }
  clone() {
    return new Track(this.kind);
  }
}
function stream(tracks = []) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    addTrack: (track) => tracks.push(track),
  };
}
function fixture() {
  const video = new Track('video'),
    saved = [];
  let captures = 0,
    releases = 0,
    disposed = false,
    picks = 0;
  const capture = {
    stream: stream([video]),
    dispose() {
      if (disposed) return;
      disposed = true;
      releases++;
      video.stop();
    },
  };
  const recorder = {
    state: 'inactive',
    mimeType: 'video/webm;codecs=vp9,opus',
    start() {
      this.state = 'recording';
    },
    requestData() {},
    stop() {
      if (this.stopError) throw this.stopError;
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['last']) });
        this.onstop?.();
      });
    },
  };
  const options = {
    supported: () => true,
    async capture() {
      captures++;
      return capture;
    },
    createRecorder: () => recorder,
    async chooseDirectory() {
      picks++;
      return null;
    },
    async save(blob, directory, filename) {
      saved.push({ blob, directory, filename });
      return { message: 'saved', kind: 'ok' };
    },
    now: () => 1792519430000,
  };
  const controller = createRecorder(options);
  return {
    options,
    controller,
    capture,
    recorder,
    video,
    saved,
    captures: () => captures,
    releases: () => releases,
    picks: () => picks,
  };
}
test('manual stop does not await its picker and releases capture before directory selection resolves', async () => {
  const f = fixture(),
    picker = deferred();
  f.options.chooseDirectory = () => picker.promise;
  await f.controller.start();
  await f.controller.start();
  assert.equal(f.captures(), 1);
  f.recorder.ondataavailable({ data: new Blob(['first']) });
  await f.controller.stop();
  await tick();
  assert.equal(f.recorder.state, 'inactive');
  assert.equal(f.releases(), 1);
  assert.equal(f.saved.length, 0);
  assert.equal(f.controller.getSnapshot().phase, 'stopping');
  await f.controller.start();
  assert.equal(f.captures(), 1);
  picker.resolve(null);
  await tick();
  assert.equal(await f.saved[0].blob.text(), 'firstlast');
  assert.match(f.saved[0].filename, /^A_Lei_do_Trono_.*\.webm$/);
  assert.equal(f.controller.getSnapshot().phase, 'idle');
  assert.equal(f.controller.recording, false);
  assert.equal(f.releases(), 1);
});
test('cancelled selection closes a late capture and does not allocate a recorder or publish an obsolete result', async () => {
  const f = fixture(),
    capture = deferred();
  let creates = 0;
  f.options.capture = () => capture.promise;
  f.options.createRecorder = () => {
    creates++;
    return f.recorder;
  };
  const selecting = f.controller.start();
  await f.controller.stop(false);
  const state = f.controller.getSnapshot();
  capture.resolve(f.capture);
  await selecting;
  assert.equal(f.releases(), 1);
  assert.equal(creates, 0);
  assert.equal(f.controller.getSnapshot(), state);
});
test('capture ending bypasses the folder prompt and save failures always return to idle after releasing resources', async () => {
  const f = fixture();
  f.options.save = async () => {
    throw Error('download failed');
  };
  await f.controller.start();
  f.video.dispatchEvent(new Event('ended'));
  await tick();
  assert.equal(f.picks(), 0);
  assert.equal(f.releases(), 1);
  assert.equal(f.controller.getSnapshot().phase, 'idle');
  assert.match(f.controller.getSnapshot().notice.message, /download failed/);
});
test('a rejected picker still saves, while stop failure keeps the current recording available for retry', async () => {
  const f = fixture();
  await f.controller.start();
  f.recorder.stopError = Error('stop failed');
  await f.controller.stop();
  assert.equal(f.controller.getSnapshot().phase, 'recording');
  assert.equal(f.releases(), 0);
  f.recorder.stopError = null;
  f.options.chooseDirectory = () => Promise.reject(Error('picker failed'));
  await f.controller.stop();
  await tick();
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].directory, null);
  assert.equal(f.controller.getSnapshot().phase, 'idle');
  assert.equal(f.releases(), 1);
});
test('creation failure and explicit disposal release resources and do not download after teardown', async () => {
  const failed = fixture();
  failed.options.createRecorder = () => {
    throw Error('codec unsupported');
  };
  await failed.controller.start();
  assert.equal(failed.releases(), 1);
  assert.equal(failed.controller.getSnapshot().phase, 'idle');
  const f = fixture();
  await f.controller.start();
  f.controller.dispose();
  await tick();
  assert.equal(f.releases(), 1);
  assert.equal(f.saved.length, 0);
  assert.equal(f.controller.recording, false);
  await f.controller.start();
  assert.equal(f.captures(), 1);
});
test('dispose while the destination is pending cannot save after teardown', async () => {
  const f = fixture(),
    picker = deferred();
  f.options.chooseDirectory = () => picker.promise;
  await f.controller.start();
  await f.controller.stop();
  await tick();
  f.controller.dispose();
  picker.resolve(null);
  await tick();
  assert.equal(f.saved.length, 0);
  assert.equal(f.controller.getSnapshot().phase, 'idle');
  assert.equal(f.releases(), 1);
});
test('mixed capture releases display and mixed tracks and AudioContext while preserving the borrowed microphone', async () => {
  const video = new Track('video'),
    audio = new Track('audio'),
    mic = new Track('audio'),
    mixed = new Track('audio');
  let closed = 0,
    connected = 0;
  const result = await captureRecording(
    {
      async getDisplayMedia(options) {
        assert.equal(options.video.frameRate.max, 30);
        assert.equal(options.preferCurrentTab, true);
        return stream([video, audio]);
      },
      createStream: stream,
      getMicrophone: () => mic,
      createAudioContext: () => ({
        state: 'running',
        createMediaStreamDestination: () => ({ stream: stream([mixed]) }),
        createMediaStreamSource: () => ({
          connect() {
            connected++;
          },
        }),
        async close() {
          closed++;
        },
      }),
      warn: (error) => {
        throw error;
      },
    },
    () => true,
  );
  assert.equal(connected, 2);
  assert.equal(result.stream.getAudioTracks()[0], mixed);
  result.dispose();
  result.dispose();
  assert.equal(video.stops, 1);
  assert.equal(audio.stops, 1);
  assert.equal(mixed.stops, 1);
  assert.equal(mic.stops, 0);
  assert.equal(closed, 1);
});
test('fallback microphone output is cloned and cancellation during AudioContext resume cleans only owned resources', async () => {
  const mic = new Track('audio'),
    video = new Track('video');
  const fallback = await captureRecording(
    {
      async getDisplayMedia() {
        return stream([video]);
      },
      createStream: stream,
      getMicrophone: () => mic,
      createAudioContext: () => null,
      warn() {},
    },
    () => true,
  );
  const clone = fallback.stream.getAudioTracks()[0];
  assert.notEqual(clone, mic);
  fallback.dispose();
  assert.equal(clone.stops, 1);
  assert.equal(mic.stops, 0);
  const resume = deferred(),
    secondVideo = new Track('video');
  let current = true,
    closed = 0;
  const pending = captureRecording(
    {
      async getDisplayMedia() {
        return stream([secondVideo]);
      },
      createStream: stream,
      getMicrophone: () => mic,
      createAudioContext: () => ({
        state: 'suspended',
        resume: () => resume.promise,
        async close() {
          closed++;
        },
      }),
      warn() {},
    },
    () => current,
  );
  await tick();
  current = false;
  resume.resolve();
  assert.equal(await pending, null);
  assert.equal(secondVideo.stops, 1);
  assert.equal(closed, 1);
  assert.equal(mic.stops, 0);
});
test('folder failure aborts the writable before downloading the unchanged encoded Blob', async () => {
  let aborted = 0,
    downloaded;
  const blob = new Blob(['encoded']);
  const directory = {
    async getDirectoryHandle(name) {
      assert.equal(name, 'A Lei do Trono - Gravações');
      return {
        async getFileHandle() {
          return {
            async createWritable() {
              return {
                async write() {
                  throw Error('disk full');
                },
                async abort() {
                  aborted++;
                },
              };
            },
          };
        },
      };
    },
  };
  const notice = await saveRecording(blob, directory, 'manual.webm', (data, filename) => {
    assert.equal(aborted, 1);
    assert.equal(filename, 'manual.webm');
    downloaded = data;
  });
  assert.equal(downloaded, blob);
  assert.equal(notice.kind, 'warn');
});
test('successful folder export closes the file and never invokes download', async () => {
  const blob = new Blob(['encoded']);
  let written,
    closed = false;
  const directory = {
    async getDirectoryHandle() {
      return {
        async getFileHandle() {
          return {
            async createWritable() {
              return {
                async write(value) {
                  written = value;
                },
                async close() {
                  closed = true;
                },
              };
            },
          };
        },
      };
    },
  };
  const notice = await saveRecording(blob, directory, 'manual.webm', () =>
    assert.fail('saved file must not download again'),
  );
  assert.equal(written, blob);
  assert.equal(closed, true);
  assert.equal(notice.kind, 'ok');
});

test('cancelling the recording scope releases captures, rejects a late picker and prevents pending saves', async () => {
  const pending = deferred();
  const f = fixture();
  f.options.capture = () => pending.promise;
  const started = f.controller.start();
  f.controller.cancel();
  pending.resolve(f.capture);
  await started;
  assert.equal(f.controller.getSnapshot().phase, 'idle');
  assert.equal(f.releases(), 1);
  assert.equal(f.saved.length, 0);
  const active = fixture();
  await active.controller.start();
  active.controller.cancel();
  await tick();
  assert.equal(active.video.readyState, 'ended');
  assert.equal(active.saved.length, 0);
  const finishing = fixture(),
    directory = deferred();
  finishing.options.chooseDirectory = () => directory.promise;
  await finishing.controller.start();
  await finishing.controller.stop();
  await tick();
  finishing.controller.cancel();
  directory.resolve(null);
  await tick();
  assert.equal(finishing.saved.length, 0);
  assert.equal(finishing.controller.getSnapshot().phase, 'idle');
});

test('account cancellation aborts uncommitted recordings at every persistence boundary without a fallback download', async () => {
  for (const boundary of ['folder', 'file', 'writable', 'write', 'failure']) {
    const f = fixture(),
      gate = deferred();
    let reached = false,
      writes = 0,
      closes = 0,
      aborts = 0,
      downloads = 0;
    async function pause(at) {
      if (boundary === at) {
        reached = true;
        await gate.promise;
      }
    }
    const writable = {
      async write() {
        writes++;
        await pause('write');
        if (boundary === 'failure') {
          reached = true;
          await gate.promise;
          throw Error('disk full');
        }
      },
      async close() {
        closes++;
      },
      async abort() {
        aborts++;
      },
    };
    const directory = {
      async getDirectoryHandle() {
        await pause('folder');
        return {
          async getFileHandle() {
            await pause('file');
            return {
              async createWritable() {
                await pause('writable');
                return writable;
              },
            };
          },
        };
      },
    };
    f.options.chooseDirectory = async () => directory;
    f.options.save = (blob, selected, filename, signal) =>
      saveRecording(blob, selected, filename, () => downloads++, signal);
    await f.controller.start();
    await f.controller.stop();
    await tick();
    assert.equal(reached, true, boundary);
    f.controller.cancel();
    if (['write', 'failure'].includes(boundary))
      assert.equal(aborts, 1, boundary + ' must abort without waiting for IO');
    gate.resolve();
    await tick();
    assert.equal(writes, ['write', 'failure'].includes(boundary) ? 1 : 0, boundary);
    assert.equal(closes, 0, boundary);
    assert.equal(downloads, 0, boundary);
    assert.equal(f.controller.getSnapshot().phase, 'idle');
    assert.equal(f.controller.getSnapshot().notice, null);
    assert.equal(aborts, ['folder', 'file'].includes(boundary) ? 0 : 1, boundary);
    f.controller.dispose();
  }
});
