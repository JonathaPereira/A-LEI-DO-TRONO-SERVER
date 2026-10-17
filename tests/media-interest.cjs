'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/media-interest.ts');
const gate = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function setup(t, extra = {}) {
  const { createMediaInterest } = await modulePromise;
  const state = { joined: true, generation: 1, sfu: false, community: true },
    members = new Map([
      ['remote', { camera: true, screen: true }],
      ['me', { camera: true, screen: true }],
    ]);
  const events = [],
    tracks = [{ enabled: true }];
  const interest = createMediaInterest({
    call: () => state,
    localId: () => 'me',
    participant: (id) => members.get(id),
    community: () => state.community,
    isSfu: () => state.sfu,
    cameraTracks: () => tracks,
    unlockAudio: () => events.push('unlock'),
    removeScreenAudio: (id) => events.push(['remove', id]),
    attachScreenAudio: (id) => events.push(['attach', id]),
    cancelRecovery: (id) => events.push(['cancel', id]),
    clearCameraRetry: (id) => events.push(['retry', id]),
    closeSubscription: async (...args) => events.push(['close', ...args]),
    syncSubscriptions: async () => events.push('sync'),
    sendWatch: (...args) => events.push(['watch', ...args]),
    hide: async (...args) => events.push(['hide', ...args]),
    onChange: (kind) => events.push(['change', kind]),
    ...extra,
  });
  t.after(interest.dispose);
  return { interest, state, members, events, tracks };
}
test('screen watching is explicit and P2P sends one watch request without capturing or stopping tracks', async (t) => {
  const h = await setup(t);
  assert.equal(h.interest.isWatching('remote'), false);
  const before = h.interest.watchVersion('remote');
  await h.interest.toggleScreen('remote');
  assert(h.interest.isWatching('remote'));
  assert(h.interest.watchVersion('remote') > before);
  assert(h.events.includes('unlock'));
  assert.deepEqual(
    h.events.filter(Array.isArray).filter((e) => e[0] === 'watch'),
    [['watch', 'remote', true]],
  );
  await h.interest.toggleScreen('remote');
  assert(!h.interest.isWatching('remote'));
  assert(h.events.some((e) => Array.isArray(e) && e[0] === 'remove'));
  assert.deepEqual(h.tracks, [{ enabled: true }]);
});
test('SFU closes only screen subscriptions and retains voice and camera', async (t) => {
  const h = await setup(t);
  h.state.sfu = true;
  await h.interest.toggleScreen('remote');
  await h.interest.toggleScreen('remote');
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'close'),
    [
      ['close', 'remote', 'screen'],
      ['close', 'remote', 'screen-audio'],
    ],
  );
  assert(!h.events.some((e) => e[0] === 'watch'));
});
test('hiding a camera disables borrowed video without stopping it and restores the same track', async (t) => {
  const h = await setup(t);
  await h.interest.toggleCamera('remote');
  assert(h.interest.isCameraHidden('remote'));
  assert.equal(h.tracks[0].enabled, false);
  await h.interest.toggleCamera('remote');
  assert(!h.interest.isCameraHidden('remote'));
  assert.equal(h.tracks[0].enabled, true);
  assert(!h.events.some((e) => e[0] === 'close'));
});
test('SFU camera hiding closes only camera and does not signal a P2P watch', async (t) => {
  const h = await setup(t);
  h.state.sfu = true;
  await h.interest.toggleCamera('remote');
  assert.deepEqual(
    h.events.filter((e) => e[0] === 'close'),
    [['close', 'remote', 'camera']],
  );
  assert(!h.events.some((e) => e[0] === 'watch'));
});
test('invalid participants, self camera and actions outside calls are ignored', async (t) => {
  const h = await setup(t);
  await h.interest.toggleCamera('me');
  await h.interest.toggleScreen('unknown');
  await h.interest.toggleCamera('unknown');
  h.state.joined = false;
  await h.interest.toggleScreen('remote');
  await h.interest.toggleCamera('remote');
  assert.deepEqual(h.events, []);
});
test('publication selection preserves voice and requires explicit screen interest and community visibility', async (t) => {
  const h = await setup(t),
    wants = (kind, ownerId = 'remote') => h.interest.wants({ kind, ownerId });
  assert(wants('audio'));
  assert(wants('camera'));
  assert(!wants('screen'));
  assert(!wants('audio', 'me'));
  await h.interest.toggleScreen('remote');
  assert(wants('screen'));
  assert(wants('screen-audio'));
  h.state.community = false;
  assert(!wants('screen'));
  assert(wants('audio'));
  await h.interest.toggleCamera('remote');
  assert(!wants('camera'));
  assert(wants('audio'));
});
test('a late fullscreen exit cannot undo a newer screen watch', async (t) => {
  const blocked = gate(),
    h = await setup(t, { hide: () => blocked.promise });
  await h.interest.toggleScreen('remote');
  const stopping = h.interest.toggleScreen('remote');
  await h.interest.toggleScreen('remote');
  const count = h.events.length;
  blocked.resolve();
  await stopping;
  assert(h.interest.isWatching('remote'));
  assert.equal(h.events.length, count);
});
test('a late camera hide cannot close or repaint after the camera is restored', async (t) => {
  const blocked = gate(),
    h = await setup(t, { hide: () => blocked.promise });
  h.state.sfu = true;
  const hiding = h.interest.toggleCamera('remote');
  await h.interest.toggleCamera('remote');
  const count = h.events.length;
  blocked.resolve();
  await hiding;
  assert.equal(h.tracks[0].enabled, true);
  assert.equal(h.events.length, count);
});
test('leave and reset invalidate continuations and watch versions across calls', async (t) => {
  const blocked = gate(),
    h = await setup(t, { hide: () => blocked.promise });
  await h.interest.toggleScreen('remote');
  const before = h.interest.watchVersion('remote');
  const stopping = h.interest.toggleScreen('remote');
  h.state.generation++;
  h.interest.reset();
  const count = h.events.length;
  blocked.resolve();
  await stopping;
  assert(h.interest.watchVersion('remote') > before);
  assert(!h.interest.isWatching('remote'));
  assert.equal(h.events.length, count);
});
test('screen disappearance prunes intent and audio once while retaining camera preferences', async (t) => {
  const h = await setup(t);
  await h.interest.toggleScreen('remote');
  await h.interest.toggleCamera('remote');
  h.members.get('remote').screen = false;
  h.interest.prune();
  const count = h.events.length;
  h.interest.prune();
  assert(!h.interest.isWatching('remote'));
  assert(h.interest.isCameraHidden('remote'));
  assert.equal(h.events.length, count);
});
test('one participant toggle does not invalidate another watched screen version', async (t) => {
  const h = await setup(t);
  h.members.set('other', { screen: true, camera: true });
  await h.interest.toggleScreen('remote');
  const before = h.interest.watchVersion('remote');
  await h.interest.toggleScreen('other');
  assert.equal(h.interest.watchVersion('remote'), before);
});
test('dispose ignores later actions and does not close borrowed resources', async (t) => {
  const h = await setup(t);
  h.interest.dispose();
  await h.interest.toggleScreen('remote');
  await h.interest.toggleCamera('remote');
  assert.deepEqual(h.events, []);
});
