'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/screen-sharing.ts');

async function setup(t) {
  const { createScreenSharing } = await modulePromise;
  const state = { joined: true, generation: 1, community: true, supported: true };
  const policy = { sfu: false, screenAllowed: true, highAllowed: true };
  const events = [],
    storage = new Map(),
    peers = new Map();
  let capture = null;
  let preferences = { screenFormat: '1080-60', transmissionQuality: 'high', screenBitrateMbps: 10 };
  const options = {
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    call: () => state,
    community: () => state.community,
    supported: () => state.supported,
    join: async () => {
      events.push('join');
      state.joined = true;
      return true;
    },
    policy: () => policy,
    capture: {
      getCapture: () => capture,
      start: async (value) => {
        events.push(['capture', value]);
        capture = {};
        return true;
      },
      stop: () => {
        if (!capture) return false;
        capture = null;
        events.push('stop');
        return true;
      },
    },
    quality: {
      getSnapshot: () => ({ preferences }),
      configure: (value) => {
        preferences = { ...preferences, ...value };
        events.push(['quality', value]);
      },
    },
    peers,
    stopWatching: (peer) => events.push(['unwatch', peer]),
    closePublication: async (kind) => events.push(['close', kind]),
    announceStopped: () => events.push('announce'),
    onChange: (kind) => events.push(['change', kind]),
    onStatus: (...args) => events.push(['status', ...args]),
    warn: (error) => events.push(['warn', error]),
  };
  const sharing = createScreenSharing(options);
  t.after(sharing.dispose);
  return {
    sharing,
    options,
    state,
    policy,
    events,
    storage,
    peers,
    preferences: () => preferences,
  };
}

test('capture is invoked synchronously from the sharing command to retain native picker activation', async (t) => {
  const h = await setup(t);
  const pending = h.sharing.start();
  assert.deepEqual(h.events, [['capture', { replace: false }]]);
  assert.equal(await pending, true);
  await h.sharing.start();
  assert.equal(h.events.filter((event) => event[0] === 'capture').length, 1);
});

test('joining is awaited before capture; a rejected join does not open the picker', async (t) => {
  const h = await setup(t);
  h.state.joined = false;
  h.options.join = async () => false;
  assert.equal(await h.sharing.start(), false);
  assert.deepEqual(h.events, []);
  h.options.join = async () => {
    h.state.joined = true;
    return true;
  };
  assert.equal(await h.sharing.start(), true);
});

test('non-community, unsupported capture and SFU consumption limits prevent capture', async (t) => {
  const h = await setup(t);
  h.state.community = false;
  assert.equal(await h.sharing.start(), false);
  h.state.community = true;
  h.state.supported = false;
  assert.equal(await h.sharing.start(), false);
  h.state.supported = true;
  h.policy.sfu = true;
  h.policy.screenAllowed = false;
  assert.equal(await h.sharing.start(), false);
  assert(!h.events.some((event) => event[0] === 'capture'));
  assert.deepEqual(
    h.events.filter((event) => event[0] === 'status').map((event) => event[2]),
    ['error', 'warn'],
  );
});

test('1080p at 60fps retains the existing 10Mbps preset and persists audio preferences', async (t) => {
  const h = await setup(t);
  assert.equal(h.sharing.getSnapshot().audio, true);
  assert(h.sharing.configure('1080', '60', false));
  assert.deepEqual(h.preferences(), {
    screenFormat: '1080-60',
    transmissionQuality: 'high',
    screenBitrateMbps: 10,
  });
  assert.equal(h.storage.get('mnShareStreamAudio'), '0');
  const { createScreenSharing } = await modulePromise;
  const reloaded = createScreenSharing(h.options);
  t.after(reloaded.dispose);
  assert.equal(reloaded.getSnapshot().audio, false);
  reloaded.setAudio(true);
  assert.equal(h.storage.get('mnShareStreamAudio'), '1');
});

test('720p/15 and 1080p/30 retain their existing bitrate presets', async (t) => {
  const h = await setup(t);
  assert(h.sharing.configure('720', '15', true));
  assert.deepEqual(h.preferences(), {
    screenFormat: '720-15',
    transmissionQuality: 'balanced',
    screenBitrateMbps: 4,
  });
  assert(h.sharing.configure('1080', '30', true));
  assert.equal(h.preferences().screenBitrateMbps, 8);
});

test('invalid formats and a left call cannot change preferences', async (t) => {
  const h = await setup(t);
  assert.equal(h.sharing.configure('1440', '120', false), false);
  h.state.joined = false;
  assert.equal(h.sharing.configure('720', '30', false), false);
  assert.deepEqual(h.events, []);
  assert.equal(h.storage.size, 0);
});

test('SFU dialog limits do not overwrite stored 60fps preferences and do not affect P2P', async (t) => {
  const h = await setup(t);
  h.policy.sfu = true;
  h.policy.highAllowed = false;
  assert.deepEqual(h.sharing.dialogOptions(), {
    resolution: 720,
    fps: 30,
    limited: true,
    audio: true,
  });
  assert.equal(h.preferences().screenFormat, '1080-60');
  h.policy.sfu = false;
  assert.deepEqual(h.sharing.dialogOptions(), {
    resolution: 1080,
    fps: 60,
    limited: false,
    audio: true,
  });
  assert.deepEqual(h.events, []);
});

test('canceling replacement keeps the current capture and reports cancellation', async (t) => {
  const h = await setup(t);
  await h.sharing.start();
  h.options.capture.start = async ({ replace }) => {
    assert.equal(replace, true);
    throw Object.assign(new Error('cancel'), { name: 'NotAllowedError' });
  };
  assert.equal(await h.sharing.switchSource(), false);
  assert(h.sharing.isActive());
  assert(
    h.events.some((event) => event[0] === 'status' && event[1].includes('tela anterior continua')),
  );
  assert(!h.events.includes('stop'));
});

test('errors from a previous call are ignored after leaving or changing generation', async (t) => {
  const h = await setup(t);
  let reject;
  h.options.capture.start = () =>
    new Promise((_, r) => {
      reject = r;
    });
  const pending = h.sharing.start();
  h.state.generation++;
  h.state.joined = false;
  reject(new Error('old picker failed'));
  assert.equal(await pending, false);
  assert.deepEqual(h.events, []);
});

test('pausing, collapsing and restoring the local preview never stop or recapture media', async (t) => {
  const h = await setup(t);
  await h.sharing.start();
  const source = h.options.capture.getCapture();
  h.sharing.togglePreview();
  assert.deepEqual(h.sharing.getSnapshot(), { audio: true, previewPaused: true, collapsed: true });
  h.sharing.togglePreview();
  assert.equal(h.sharing.getSnapshot().previewPaused, false);
  h.sharing.toggleCollapsed();
  assert.equal(h.sharing.getSnapshot().collapsed, false);
  h.sharing.resetPreview();
  assert.strictEqual(h.options.capture.getCapture(), source);
  assert.equal(h.events.filter((event) => event[0] === 'capture').length, 1);
  assert(!h.events.includes('stop'));
});

test('SFU stop closes only screen publications and is idempotent', async (t) => {
  const h = await setup(t);
  h.policy.sfu = true;
  await h.sharing.start();
  h.sharing.togglePreview();
  await h.sharing.stop();
  await h.sharing.stop();
  assert.deepEqual(
    h.events.filter((event) => event[0] === 'close'),
    [
      ['close', 'screen-audio'],
      ['close', 'screen'],
    ],
  );
  assert.equal(h.events.filter((event) => event === 'announce').length, 1);
  assert.equal(h.events.filter((event) => event === 'stop').length, 1);
  assert.equal(h.sharing.getSnapshot().previewPaused, false);
});

test('P2P stop detaches only screen senders, retaining microphone and camera', async (t) => {
  const h = await setup(t);
  const sender = (name) => ({ replaceTrack: async (track) => h.events.push([name, track]) });
  const peer = {
    _tronoScreenSender: sender('screen'),
    _tronoScreenAudioSender: sender('screen-audio'),
    _tronoMicSender: sender('mic'),
    _tronoCameraSender: sender('camera'),
  };
  h.peers.set('remote', peer);
  await h.sharing.start();
  await h.sharing.stop(false);
  assert(h.events.some((event) => event[0] === 'unwatch' && event[1] === peer));
  assert(h.events.some((event) => event[0] === 'screen' && event[1] === null));
  assert(h.events.some((event) => event[0] === 'screen-audio' && event[1] === null));
  assert(!h.events.some((event) => ['mic', 'camera', 'close'].includes(event[0])));
  assert(!h.events.includes('announce'));
});

test('disposing the command owner does not stop borrowed capture or allow new actions', async (t) => {
  const h = await setup(t);
  await h.sharing.start();
  h.sharing.dispose();
  assert.equal(await h.sharing.start({ replace: true }), false);
  h.sharing.togglePreview();
  h.sharing.setAudio(false);
  await h.sharing.stop();
  assert(h.sharing.isActive());
  assert.equal(h.sharing.getSnapshot().audio, true);
  assert(!h.events.includes('stop'));
});
