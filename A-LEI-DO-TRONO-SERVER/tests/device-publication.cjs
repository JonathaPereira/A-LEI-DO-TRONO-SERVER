'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/device-publication.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function gate() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function setup() {
  const { createDevicePublication } = await modulePromise;
  const events = [],
    connections = new Map(),
    publications = new Map();
  const state = { joined: true, sfu: false, current: true, camera: null };
  const track = Object.freeze({ kind: 'audio', readyState: 'live', enabled: false });
  const stream = Object.freeze({ getAudioTracks: () => [track] });
  const microphone = { track, stream, reason: 'acquire', isCurrent: () => state.current };
  const cameraTrack = Object.freeze({ kind: 'video', readyState: 'live' });
  const camera = { capture: { track: cameraTrack, source: {} }, isCurrent: () => state.current };
  state.camera = camera.capture;
  const options = {
    call: () => state,
    isSfu: () => state.sfu,
    sfu: {
      publications,
      publish: async (kind, track) => events.push(['publish', kind, track]),
      closePublication: async (kind) => events.push(['close', kind]),
      recoverPublication: async (kind, error) => events.push(['recover', kind, error]),
    },
    p2p: {
      connections,
      syncTracks: async (peer) => events.push(['sync', peer]),
      ensure: (id) => events.push(['ensure', id]),
    },
    quality: { applySender: async (sender, kind) => events.push(['quality', sender, kind]) },
    camera: { getSnapshot: () => ({ capture: state.camera }) },
    controls: { cancelPending: () => events.push(['cancel']) },
    closePeer: (id) => {
      connections.delete(id);
      events.push(['close-peer', id]);
    },
    announceCamera: () => events.push(['announce']),
    onMicrophoneResumed: (stream) => events.push(['resumed', stream]),
    onDevicesChanged: async () => events.push(['devices']),
    warn: (error) => events.push(['warn', error]),
  };
  const publication = createDevicePublication(options);
  function sender() {
    const value = {
      track: null,
      replaceTrack: async (track) => {
        value.track = track;
        events.push(['replace', track]);
      },
    };
    return value;
  }
  return {
    publication,
    options,
    events,
    connections,
    publications,
    state,
    microphone,
    camera,
    sender,
  };
}

test('microphone acquisition reuses P2P queues and the SFU sender without changing mute or tracks', async () => {
  const h = await setup(),
    peer = { _tronoAudioSender: {} },
    sender = h.sender();
  h.connections.set('remote', peer);
  h.publications.set('audio', { sender });
  await h.publication.publishMicrophone(h.microphone);
  assert.deepEqual(h.events, [
    ['sync', peer],
    ['replace', h.microphone.track],
    ['quality', sender, 'audio'],
    ['devices'],
  ]);
  assert.equal(h.microphone.track.enabled, false);
  assert.strictEqual(sender.track, h.microphone.track);
});

test('a failed microphone peer reconnects only that peer through the existing owner', async () => {
  const h = await setup(),
    broken = { _tronoAudioSender: {} },
    healthy = { _tronoAudioSender: {} };
  h.connections.set('broken', broken);
  h.connections.set('healthy', healthy);
  h.options.p2p.syncTracks = async (peer) => {
    if (peer === broken) throw new Error('peer failed');
    h.events.push(['sync', peer]);
  };
  await h.publication.publishMicrophone(h.microphone);
  assert.deepEqual(
    h.events.filter((e) => ['close-peer', 'ensure'].includes(e[0])),
    [
      ['close-peer', 'broken'],
      ['ensure', 'broken'],
    ],
  );
  assert(h.events.some((e) => e[0] === 'sync' && e[1] === healthy));
  assert.strictEqual(h.connections.get('healthy'), healthy);
});

test('a failed SFU microphone replacement republishes audio without changing camera or screen', async () => {
  const h = await setup();
  h.publications.set('audio', {
    sender: {
      replaceTrack: async () => {
        throw new Error('sender failed');
      },
    },
  });
  await h.publication.publishMicrophone(h.microphone);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'publish'),
    [['publish', 'audio', h.microphone.track]],
  );
  assert(!h.events.some((e) => ['close', 'recover'].includes(e[0])));
});

test('a failed microphone republish delegates recovery to the SFU owner', async () => {
  const h = await setup(),
    failure = new Error('publish failed');
  h.publications.set('audio', {
    sender: {
      replaceTrack: async () => {
        throw new Error('sender failed');
      },
    },
  });
  h.options.sfu.publish = async () => {
    throw failure;
  };
  await h.publication.publishMicrophone(h.microphone);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'recover'),
    [['recover', 'audio', failure]],
  );
});

test('microphone resume restores the same sender and indicator without acquiring, retuning or enumerating', async () => {
  const h = await setup(),
    sender = h.sender(),
    peer = {};
  h.microphone.reason = 'resume';
  h.connections.set('remote', peer);
  h.publications.set('audio', { sender });
  await h.publication.publishMicrophone(h.microphone);
  assert.deepEqual(h.events, [
    ['sync', peer],
    ['replace', h.microphone.track],
    ['resumed', h.microphone.stream],
  ]);
});

test('an obsolete microphone failure cannot close a peer, republish or enumerate for the new call', async () => {
  const h = await setup(),
    pending = gate();
  h.connections.set('remote', { _tronoAudioSender: {} });
  h.options.p2p.syncTracks = () => pending.promise;
  const work = h.publication.publishMicrophone(h.microphone);
  h.state.current = false;
  pending.reject(new Error('old peer failed'));
  await work;
  assert.deepEqual(h.events, []);
});

test('a late SFU microphone replacement cannot retune or restart an obsolete publication', async () => {
  const h = await setup(),
    pending = gate();
  h.publications.set('audio', { sender: { replaceTrack: () => pending.promise } });
  const work = h.publication.publishMicrophone(h.microphone);
  h.state.current = false;
  pending.resolve();
  await work;
  assert.deepEqual(h.events, []);
});

test('camera availability is announced before a slow P2P sender and quality follows publication', async () => {
  const h = await setup(),
    pending = gate(),
    sender = h.sender();
  sender.replaceTrack = async (track) => {
    await pending.promise;
    sender.track = track;
  };
  h.connections.set('remote', { _tronoVideoSender: sender });
  const work = h.publication.publishCamera(h.camera);
  assert.deepEqual(h.events, [['announce']]);
  pending.resolve();
  await work;
  assert.strictEqual(sender.track, h.camera.capture.track);
  assert.deepEqual(h.events, [
    ['announce'],
    ['quality', sender, 'camera'],
    ['announce'],
    ['devices'],
  ]);
});

test('camera SFU publication reuses the existing sender and its quality owner', async () => {
  const h = await setup(),
    sender = h.sender();
  h.state.sfu = true;
  h.publications.set('camera', { sender });
  await h.publication.publishCamera(h.camera);
  assert.deepEqual(h.events, [
    ['announce'],
    ['replace', h.camera.capture.track],
    ['quality', sender, 'camera'],
    ['announce'],
    ['devices'],
  ]);
});

test('a camera without an SFU publication delegates creation to the existing session', async () => {
  const h = await setup();
  h.state.sfu = true;
  await h.publication.publishCamera(h.camera);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'publish'),
    [['publish', 'camera', h.camera.capture.track]],
  );
});

test('camera publication failure recovers only camera, leaving voice and screen active', async () => {
  const h = await setup(),
    error = new Error('camera failed');
  h.state.sfu = true;
  h.options.sfu.publish = async () => {
    throw error;
  };
  await h.publication.publishCamera(h.camera);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'recover'),
    [['recover', 'camera', error]],
  );
  assert(!h.events.some((e) => ['close', 'close-peer'].includes(e[0])));
});

test('a stale camera replacement cannot retune, recover or announce completion', async () => {
  const h = await setup(),
    pending = gate();
  h.state.sfu = true;
  h.publications.set('camera', { sender: { replaceTrack: () => pending.promise } });
  const work = h.publication.publishCamera(h.camera);
  h.state.current = false;
  pending.reject(new Error('old sender failed'));
  await work;
  assert.deepEqual(h.events, [['announce']]);
});

test('camera publication rechecks fallback and syncs the current P2P sender', async () => {
  const h = await setup(),
    pending = gate(),
    sender = h.sender();
  h.state.sfu = true;
  h.connections.set('remote', { _tronoVideoSender: sender });
  h.options.sfu.publish = () => pending.promise;
  const work = h.publication.publishCamera(h.camera);
  h.state.sfu = false;
  pending.resolve();
  await work;
  assert.strictEqual(sender.track, h.camera.capture.track);
  assert(h.events.some((e) => e[0] === 'quality' && e[2] === 'camera'));
});

test('a delayed old camera attach converges on the new track after a newer publication', async () => {
  const h = await setup(),
    pending = gate(),
    sender = h.sender();
  const replace = sender.replaceTrack;
  let first = true;
  sender.replaceTrack = async (track) => {
    if (first) {
      first = false;
      await pending.promise;
    }
    await replace(track);
  };
  h.connections.set('remote', { _tronoVideoSender: sender });
  const old = h.publication.publishCamera(h.camera);
  h.state.current = false;
  const current = {
    capture: { track: Object.freeze({ kind: 'video', readyState: 'live' }) },
    isCurrent: () => true,
  };
  h.state.camera = current.capture;
  await h.publication.publishCamera(current);
  pending.resolve();
  await old;
  assert.strictEqual(sender.track, current.capture.track);
  assert.equal(h.events.filter((e) => e[0] === 'quality').length, 1);
});

test('a delayed camera detach cannot erase a newly started camera', async () => {
  const h = await setup(),
    pending = gate(),
    sender = h.sender();
  const replace = sender.replaceTrack;
  sender.replaceTrack = async (track) => {
    if (track === null) await pending.promise;
    await replace(track);
  };
  h.connections.set('remote', { _tronoVideoSender: sender });
  h.state.camera = null;
  h.publication.cameraStopped();
  assert.deepEqual(h.events, [['cancel'], ['announce']]);
  h.state.camera = h.camera.capture;
  await h.publication.publishCamera(h.camera);
  pending.resolve();
  await tick();
  assert.strictEqual(sender.track, h.camera.capture.track);
});

test('camera stop announces and cancels immediately without awaiting SFU teardown or touching other media', async () => {
  const h = await setup(),
    pending = gate();
  h.state.sfu = true;
  h.options.sfu.closePublication = (kind) => {
    h.events.push(['close', kind]);
    return pending.promise;
  };
  assert.equal(h.publication.cameraStopped(), undefined);
  assert.deepEqual(h.events, [['cancel'], ['announce'], ['close', 'camera']]);
  pending.resolve();
  await tick();
});

test('a removed P2P peer is not retried by delayed camera reconciliation', async () => {
  const h = await setup(),
    pending = gate(),
    sender = h.sender();
  let attempts = 0;
  sender.replaceTrack = async (track) => {
    attempts++;
    await pending.promise;
    sender.track = track;
  };
  h.connections.set('remote', { _tronoVideoSender: sender });
  const work = h.publication.publishCamera(h.camera);
  h.connections.delete('remote');
  h.state.current = false;
  h.state.camera = null;
  pending.resolve();
  await work;
  assert.equal(attempts, 1);
  assert.deepEqual(h.events, [['announce']]);
});

test('old callbacks and a stopped call do not publish or announce camera teardown', async () => {
  const h = await setup();
  h.state.current = false;
  h.state.joined = false;
  await h.publication.publishMicrophone(h.microphone);
  await h.publication.publishCamera(h.camera);
  h.publication.cameraStopped();
  assert.deepEqual(h.events, []);
});
