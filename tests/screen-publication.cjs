'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/screen-publication.ts');
function gate() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function setup() {
  const { createScreenPublication } = await modulePromise;
  const events = [],
    publications = new Map(),
    connections = new Map();
  const state = { sfu: true, current: true, audio: true };
  const video = Object.freeze({ kind: 'video', readyState: 'live' });
  const audio = Object.freeze({ kind: 'audio', readyState: 'live' });
  const stream = Object.freeze({
    getVideoTracks: () => [video],
    getAudioTracks: () => (state.audio ? [audio] : []),
  });
  const change = {
    capture: { source: {}, outgoing: stream },
    replace: false,
    isCurrent: () => state.current,
  };
  const options = {
    isSfu: () => state.sfu,
    sfu: {
      publications,
      publish: async (kind, track) => events.push(['publish', kind, track]),
      closePublication: async (kind) => events.push(['close', kind]),
      recoverPublication: async (kind, error) => events.push(['recover', kind, error]),
    },
    p2p: { connections, syncTracks: async (peer) => events.push(['sync', peer]) },
    quality: { applySender: async (sender, kind) => events.push(['quality', sender, kind]) },
    sharing: { resetPreview: () => events.push(['preview']), getSnapshot: () => ({ audio: true }) },
    announce: () => events.push(['announce']),
    onAudioDetached: () => events.push(['detached']),
    onStatus: (...args) => events.push(['status', ...args]),
  };
  const publication = createScreenPublication(options);
  return { publication, options, state, change, video, audio, events, publications, connections };
}

test('announces screen availability synchronously before slow publication; video and audio publish independently', async () => {
  const h = await setup(),
    pending = gate();
  h.options.sfu.publish = async (kind, track) => {
    h.events.push(['publish', kind, track]);
    if (kind === 'screen') await pending.promise;
  };
  const work = h.publication.publish(h.change);
  assert.deepEqual(h.events.slice(0, 2), [['preview'], ['announce']]);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'publish'),
    [
      ['publish', 'screen', h.video],
      ['publish', 'screen-audio', h.audio],
    ],
  );
  assert.equal(h.events.filter((e) => e[0] === 'announce').length, 1);
  pending.resolve();
  await work;
  assert.equal(h.events.filter((e) => e[0] === 'announce').length, 2);
  assert.deepEqual(h.events.at(-1), ['status', 'Compartilhando tela e áudio.', 'ok']);
});

test('replacement reuses screen senders and applies existing quality without reopening publications', async () => {
  const h = await setup();
  h.change.replace = true;
  for (const kind of ['screen', 'screen-audio']) {
    h.publications.set(kind, {
      sender: { replaceTrack: async (track) => h.events.push(['replace', kind, track]) },
    });
  }
  await h.publication.publish(h.change);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'replace'),
    [
      ['replace', 'screen', h.video],
      ['replace', 'screen-audio', h.audio],
    ],
  );
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'quality').map((e) => e[2]),
    ['screen', 'screen-audio'],
  );
  assert(!h.events.some((e) => ['publish', 'close', 'sync'].includes(e[0])));
});

test('replacement without shared audio closes only the old screen-audio publication', async () => {
  const h = await setup();
  h.change.replace = true;
  h.state.audio = false;
  h.publications.set('screen-audio', { sender: {} });
  await h.publication.publish(h.change);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'close'),
    [['close', 'screen-audio']],
  );
  assert(h.events.some((e) => e[0] === 'publish' && e[1] === 'screen'));
  assert.deepEqual(h.events.at(-1), [
    'status',
    'Tela compartilhada sem áudio. Marque Compartilhar áudio no seletor do navegador quando disponível.',
    'warn',
  ]);
});

test('audio preference off retains the corresponding no-audio message', async () => {
  const h = await setup();
  h.state.audio = false;
  h.options.sharing.getSnapshot = () => ({ audio: false });
  await h.publication.publish(h.change);
  assert.deepEqual(h.events.at(-1), ['status', 'Compartilhando tela sem áudio.', 'warn']);
});

test('each SFU failure recovers only its own media kind without interrupting the other', async () => {
  const h = await setup(),
    error = new Error('screen failed');
  h.options.sfu.publish = async (kind, track) => {
    if (kind === 'screen') throw error;
    h.events.push(['publish', kind, track]);
  };
  await h.publication.publish(h.change);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'recover'),
    [['recover', 'screen', error]],
  );
  assert(h.events.some((e) => e[0] === 'publish' && e[1] === 'screen-audio'));
  assert(!h.events.some((e) => e[0] === 'close'));
});

test('sender quality failures reuse the existing recovery owner', async () => {
  const h = await setup(),
    error = new Error('quality failed');
  h.change.replace = true;
  h.publications.set('screen', { sender: { replaceTrack: async () => {} } });
  h.options.quality.applySender = async () => {
    throw error;
  };
  await h.publication.publish(h.change);
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'recover'),
    [['recover', 'screen', error]],
  );
});

test('a stale replacement cannot apply quality, recover, or overwrite current UI', async () => {
  const h = await setup(),
    pending = gate();
  h.change.replace = true;
  h.publications.set('screen', { sender: { replaceTrack: () => pending.promise } });
  const work = h.publication.publish(h.change);
  h.state.current = false;
  pending.reject(new Error('old sender failed'));
  await work;
  assert(!h.events.some((e) => ['recover', 'quality', 'status'].includes(e[0])));
  assert.equal(h.events.filter((e) => e[0] === 'announce').length, 1);
});

test('successful stale publication also cannot announce completion or sync a replacement call', async () => {
  const h = await setup(),
    pending = gate();
  h.options.sfu.publish = () => pending.promise;
  h.connections.set('peer', {});
  const work = h.publication.publish(h.change);
  h.state.current = false;
  h.state.sfu = false;
  pending.resolve();
  await work;
  assert(!h.events.some((e) => ['sync', 'status'].includes(e[0])));
  assert.equal(h.events.filter((e) => e[0] === 'announce').length, 1);
});

test('an SFU fallback during publication syncs existing P2P peers without recapturing', async () => {
  const h = await setup(),
    peer = {},
    pending = gate();
  h.connections.set('remote', peer);
  h.options.sfu.publish = () => pending.promise;
  const work = h.publication.publish(h.change);
  h.state.sfu = false;
  pending.resolve();
  await work;
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'sync'),
    [['sync', peer]],
  );
  assert.equal(h.video.readyState, 'live');
});

test('P2P publication delegates to the existing track queues and does no SFU work', async () => {
  const h = await setup();
  h.state.sfu = false;
  h.connections.set('one', {});
  h.connections.set('two', {});
  await h.publication.publish(h.change);
  assert.equal(h.events.filter((e) => e[0] === 'sync').length, 2);
  assert(!h.events.some((e) => ['publish', 'close', 'recover'].includes(e[0])));
});

test('a stale capture produces no publication, UI changes or detach', async () => {
  const h = await setup();
  h.state.current = false;
  await h.publication.publish(h.change);
  await h.publication.detachAudio(h.change);
  assert.deepEqual(h.events, []);
});

test('SFU audio ending leaves video and voice publications untouched', async () => {
  const h = await setup();
  await h.publication.detachAudio(h.change);
  assert.deepEqual(h.events, [['close', 'screen-audio'], ['detached']]);
  assert.equal(h.video.readyState, 'live');
});

test('P2P audio ending detaches only screen audio and aborts remaining work when superseded', async () => {
  const h = await setup(),
    pending = gate();
  h.state.sfu = false;
  h.connections.set('one', {
    _tronoScreenAudioSender: {
      replaceTrack: (track) => {
        assert.equal(track, null);
        return pending.promise;
      },
    },
    _tronoScreenSender: {
      replaceTrack: async () => assert.fail('screen video must remain attached'),
    },
  });
  h.connections.set('two', {
    _tronoScreenAudioSender: {
      replaceTrack: async () => assert.fail('stale detach reached another peer'),
    },
  });
  const work = h.publication.detachAudio(h.change);
  h.state.current = false;
  pending.resolve();
  await work;
  assert.deepEqual(h.events, []);
});
