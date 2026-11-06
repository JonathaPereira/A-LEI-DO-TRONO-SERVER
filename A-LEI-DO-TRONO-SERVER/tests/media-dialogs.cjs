'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mosaicModule = import('../src/lib/voice/mosaic.ts');
const screenModule = import('../src/lib/voice/screen-options.ts');

async function mosaic(t) {
  const { createMosaic } = await mosaicModule;
  const calls = [],
    subscribers = new Set();
  const track = {
    readyState: 'live',
    stop() {
      throw new Error('Borrowed track stopped');
    },
  };
  const stream = { getVideoTracks: () => [track] };
  const source = {
    generation: 1,
    joined: true,
    people: Array.from({ length: 7 }, (_, i) => ({
      id: String(i),
      name: 'Pessoa ' + i,
      self: i === 0,
      cameraOffered: true,
      screenOffered: true,
      cameraHidden: false,
      watching: true,
      camera: stream,
      screen: stream,
    })),
  };
  const client = createMosaic({
    read: () => source,
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    closeDialog: () => calls.push('close'),
    fullscreen: (id, kind) => calls.push(['fullscreen', id, kind]),
    toggleCamera: (id) => calls.push(['camera', id]),
    toggleScreen: (id) => calls.push(['screen', id]),
  });
  t.after(client.dispose);
  client.start();
  return { client, source, calls, subscribers, track, stream };
}
test('mosaic caps at six, frees deselected slots and ignores unknown people', async (t) => {
  const { client } = await mosaic(t);
  client.open();
  assert.equal(client.getSnapshot().selected.length, 6);
  client.select('6', true);
  assert.equal(client.getSnapshot().selected.includes('6'), false);
  client.select('0', false);
  client.select('6', true);
  client.select('unknown', true);
  assert.deepEqual(client.getSnapshot().selected, ['1', '2', '3', '4', '5', '6']);
});
test('mosaic prunes departures and closes when a generation is replaced', async (t) => {
  const { client, source, subscribers } = await mosaic(t);
  client.open();
  source.people = source.people.slice(2);
  for (const refresh of subscribers) refresh();
  assert.deepEqual(client.getSnapshot().selected, ['2', '3', '4', '5']);
  source.generation++;
  client.refresh();
  assert.equal(client.getSnapshot().open, false);
  assert.deepEqual(client.getSnapshot().visible, []);
  client.open();
  source.joined = false;
  client.refresh();
  assert.equal(client.getSnapshot().open, false);
  client.open();
  assert.equal(client.getSnapshot().open, false);
});
test('fullscreen closes native dialog synchronously and prefers a live screen', async (t) => {
  const { client, calls, source, track } = await mosaic(t);
  client.open('1');
  calls.length = 0;
  client.fullscreen();
  assert.deepEqual(calls, ['close', ['fullscreen', '1', 'screen']]);
  source.people[1].screen = null;
  client.open('1');
  calls.length = 0;
  client.fullscreen();
  assert.deepEqual(calls, ['close', ['fullscreen', '1', 'camera']]);
  track.readyState = 'ended';
  client.open('1');
  calls.length = 0;
  client.fullscreen();
  assert.deepEqual(calls, []);
});
test('mosaic forwards interests to their existing owner and releases only its subscription', async (t) => {
  const { client, calls, subscribers, track } = await mosaic(t);
  client.open('1');
  calls.length = 0;
  client.toggleCamera('0');
  client.toggleCamera('unknown');
  client.toggleCamera('1');
  client.toggleScreen('1');
  assert.deepEqual(calls, [
    ['camera', '1'],
    ['screen', '1'],
  ]);
  client.close();
  assert.deepEqual(client.getSnapshot().visible, []);
  assert.equal(track.readyState, 'live');
  client.dispose();
  client.open();
  assert.equal(subscribers.size, 0);
  assert.equal(client.getSnapshot().open, false);
});
test('mosaic projection borrows streams and respects camera/screen visibility', async () => {
  const { getMosaicSources } = await mosaicModule;
  const camera = {},
    screen = {};
  const people = getMosaicSources({
    participants: [
      {
        id: '1',
        name: 'Ana',
        camera: true,
        screen: true,
        cameraStream: camera,
        screenStream: screen,
        hiddenCamera: false,
        watching: true,
      },
      {
        id: '2',
        camera: true,
        screen: true,
        cameraStream: camera,
        screenStream: screen,
        hiddenCamera: true,
        watching: false,
      },
      { id: '3', camera: false, screen: false },
    ],
  });
  assert.equal(people.length, 2);
  assert.equal(people[0].camera, camera);
  assert.equal(people[0].screen, screen);
  assert.equal(people[1].camera, null);
  assert.equal(people[1].screen, null);
  assert.equal(people[1].cameraOffered, true);
  assert.equal(Object.isFrozen(people), true);
});
async function screen() {
  const { createScreenOptions } = await screenModule;
  const call = { joined: true, generation: 1 },
    calls = [];
  const defaults = { resolution: 1080, fps: 60, limited: false, audio: true };
  let accepts = true;
  const client = createScreenOptions({
    call: () => call,
    replayEnabled: () => false,
    closeDialog: () => calls.push('close'),
    sharing: {
      dialogOptions: () => defaults,
      configure(...args) {
        calls.push(['configure', ...args]);
        return accepts;
      },
      start() {
        calls.push('start');
        return Promise.resolve(true);
      },
    },
  });
  return { client, call, calls, defaults, reject: () => (accepts = false) };
}
test('share draft is discarded on cancel and opening never persists or captures', async () => {
  const { client, calls } = await screen();
  client.open();
  client.setResolution('720');
  client.setFps('15');
  client.setAudio(false);
  assert.deepEqual(calls, []);
  client.close();
  client.open();
  assert.deepEqual(
    {
      resolution: client.getSnapshot().resolution,
      fps: client.getSnapshot().fps,
      audio: client.getSnapshot().audio,
    },
    { resolution: '1080', fps: '60', audio: true },
  );
  assert.deepEqual(calls, ['close']);
});
test('confirm applies draft then closes before starting picker in the same stack', async () => {
  const { client, calls } = await screen();
  client.open();
  client.setAudio(false);
  const pending = client.confirm();
  assert.deepEqual(calls, [['configure', '1080', '60', false], 'close', 'start']);
  assert.equal(client.getSnapshot().open, false);
  await pending;
  client.confirm();
  assert.equal(calls.length, 3);
});
test('limits changed while open are checked again at confirmation without persisting on open', async () => {
  const { client, defaults, calls } = await screen();
  client.open();
  defaults.limited = true;
  client.confirm();
  assert.deepEqual(calls[0], ['configure', '720', '30', true]);
  client.open();
  client.setResolution('1080');
  client.setFps('60');
  client.setFps('invalid');
  client.refresh();
  assert.equal(client.getSnapshot().resolution, '720');
  assert.equal(client.getSnapshot().fps, '30');
});
test('stale generation or leave cannot confirm a picker', async () => {
  const { client, call, calls } = await screen();
  client.open();
  call.generation++;
  client.confirm();
  assert.deepEqual(calls, ['close']);
  client.open();
  call.joined = false;
  client.refresh();
  client.confirm();
  client.open();
  assert.equal(client.getSnapshot().open, false);
  assert.equal(calls.includes('start'), false);
});
test('rejected preferences leave dialog open and never request capture', async () => {
  const { client, reject, calls } = await screen();
  client.open();
  reject();
  client.confirm();
  assert.equal(client.getSnapshot().open, true);
  assert.deepEqual(calls, [['configure', '1080', '60', true]]);
});
