'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/remote-media.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
class Track extends EventTarget {
  constructor(kind) { super(); this.kind = kind; this.readyState = 'live'; this.muted = false; this.enabled = true; this.stops = 0; this.listeners = 0; }
  addEventListener(...args) { this.listeners++; return super.addEventListener(...args); }
  removeEventListener(...args) { this.listeners--; return super.removeEventListener(...args); }
  stop() { this.stops++; this.readyState = 'ended'; }
  event(type) { if (type === 'mute') this.muted = true; if (type === 'unmute') this.muted = false; this.dispatchEvent(new Event(type)); }
}
function stream() {
  const tracks = [];
  return {getTracks: () => [...tracks], getAudioTracks: () => tracks.filter(t => t.kind === 'audio'), getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
    addTrack(t) { if (!tracks.includes(t)) tracks.push(t); }, removeTrack(t) { const i = tracks.indexOf(t); if (i >= 0) tracks.splice(i, 1); }};
}
function peer() {
  const transceivers = ['audio', 'video', 'video', 'audio'].map(kind => ({receiver: {track: new Track(kind)}}));
  return {getTransceivers: () => transceivers, transceivers};
}
function bindRefs(pc) {
  [pc._tronoAudioTransceiver, pc._tronoVideoTransceiver, pc._tronoScreenTransceiver, pc._tronoScreenAudioTransceiver] = pc.transceivers;
}
async function setup(t) {
  const {createRemoteMedia} = await modulePromise;
  t.mock.timers.enable({apis: ['setTimeout']});
  let enabled = true, time = 1000, changes = 0;
  const peers = new Map(), interests = new Map(), hidden = new Set(), voices = [], audio = [], recoveries = [], warnings = [];
  let recover = async (...args) => { recoveries.push(args); return false; };
  const media = createRemoteMedia({enabled: () => enabled, createStream: stream,
    getPeer: id => peers.get(id), isPeerCurrent: (id, pc) => enabled && peers.get(id) === pc,
    getInterest: id => interests.get(id) || {camera: false, screen: false}, isCameraHidden: id => hidden.has(id),
    onVoiceReceiver: (...args) => voices.push(args), onAudioReady: (...args) => audio.push(args),
    onChange: () => {changes++;}, onRecover: (...args) => recover(...args), now: () => time, warn: e => warnings.push(e),
  });
  t.after(() => media.reset());
  function attach(id, kind, options = {}) {
    const track = options.track || new Track(kind === 'audio' || kind === 'screen-audio' ? 'audio' : 'video');
    const owner = options.owner || {}, receiver = {track};
    media.attachSubscription({id, kind, track, owner, receiver, isCurrent: options.isCurrent || (() => true)});
    return {track, owner, receiver};
  }
  return {media, peers, interests, hidden, voices, audio, recoveries, warnings, attach,
    get changes() {return changes;}, enable(value) {enabled = value;}, time(value) {time = value;},
    recover(fn) {recover = fn;}, async advance(ms) {t.mock.timers.tick(ms); await tick();}};
}

test('P2P classifies both m-line pairs before answerer binding and keeps stable borrowed streams', async t => {
  const h = await setup(t), pc = peer(); h.peers.set('p', pc);
  const streams = h.media.getStreams('p'); assert(Object.isFrozen(streams));
  for (const tr of pc.transceivers) h.media.attachPeer('p', tr.receiver.track, tr);
  assert.equal(h.media.getStreams('p'), streams);
  assert.deepEqual(streams.av.getTracks(), pc.transceivers.slice(0, 2).map(t => t.receiver.track));
  assert.deepEqual(streams.screen.getTracks(), pc.transceivers.slice(2).map(t => t.receiver.track));
  assert.equal(h.voices.length, 1); assert.equal(h.voices[0][1], pc.transceivers[0].receiver);
  assert.deepEqual(h.audio, [['p', 'audio']]);
  const count = h.changes;
  h.media.attachPeer('p', pc.transceivers[1].receiver.track, pc.transceivers[1]);
  assert.equal(h.changes, count); assert.equal(pc.transceivers[1].receiver.track.listeners, 3);
  h.interests.set('p', {screen: true, camera: true});
  pc.transceivers[3].receiver.track.event('unmute');
  assert.deepEqual(h.audio.at(-1), ['p', 'screen-audio']);
});

test('clearing a peer removes listeners and borrowed membership without stopping its tracks', async t => {
  const h = await setup(t), pc = peer(); h.peers.set('p', pc);
  for (const tr of pc.transceivers) h.media.attachPeer('p', tr.receiver.track, tr);
  const streams = h.media.getStreams('p'); h.media.clear('p');
  assert.deepEqual(streams.av.getTracks(), []); assert.deepEqual(streams.screen.getTracks(), []);
  assert(pc.transceivers.every(t => t.receiver.track.listeners === 0 && t.receiver.track.stops === 0));
  assert.equal(h.voices.at(-1)[2], false);
  h.media.clear('p'); assert.equal(h.voices.length, 2);
});

test('events from a retired peer cannot render, recover or restart audio for a replacement', async t => {
  const h = await setup(t), old = peer(); h.peers.set('p', old);
  for (const tr of old.transceivers) h.media.attachPeer('p', tr.receiver.track, tr);
  h.media.clear('p'); const next = peer(); h.peers.set('p', next);
  h.media.attachPeer('p', next.transceivers[1].receiver.track, next.transceivers[1]);
  h.interests.set('p', {camera: true, screen: true});
  const before = {changes: h.changes, audio: h.audio.length};
  for (const tr of old.transceivers) for (const event of ['mute', 'unmute', 'ended']) tr.receiver.track.event(event);
  await h.advance(10000);
  assert.deepEqual({changes: h.changes, audio: h.audio.length}, before);
  assert.equal(h.recoveries.length, 0);
  assert.equal(h.media.getStreams('p').av.getVideoTracks()[0], next.transceivers[1].receiver.track);
});

test('P2P camera hiding does not disable voice or screen tracks', async t => {
  const h = await setup(t), pc = peer(); h.peers.set('p', pc); h.hidden.add('p');
  for (const tr of pc.transceivers) h.media.attachPeer('p', tr.receiver.track, tr);
  assert.equal(pc.transceivers[1].receiver.track.enabled, false);
  assert(pc.transceivers.filter((_, i) => i !== 1).every(t => t.receiver.track.enabled));
});

test('receiver recovery restores missing membership once without copying or processing tracks', async t => {
  const h = await setup(t), pc = peer(); bindRefs(pc); h.peers.set('p', pc);
  const streams = h.media.recover('p'); h.media.recover('p');
  assert.equal(streams.av.getTracks().length, 2); assert.equal(streams.screen.getTracks().length, 2);
  assert.equal(streams.av.getAudioTracks()[0], pc.transceivers[0].receiver.track);
  assert.equal(h.changes, 0); assert.equal(h.voices.length, 0);
});

test('video grace follows the exact track and expires after 5200 ms without hiding a brief mute', async t => {
  const h = await setup(t), first = h.attach('p', 'camera'), streams = h.media.getStreams('p');
  first.track.event('mute'); assert.equal(h.media.videoUsable('p', streams.av, 'camera'), true);
  h.time(6199); assert.equal(h.media.videoUsable('p', streams.av, 'camera'), true);
  h.time(6200); assert.equal(h.media.videoUsable('p', streams.av, 'camera'), false);
  const next = new Track('video'); next.muted = true; h.attach('p', 'camera', {track: next});
  assert.equal(h.media.videoUsable('p', streams.av, 'camera'), false);
  next.event('unmute'); assert.equal(h.media.videoUsable('p', streams.av, 'camera'), true);
});

test('SFU detach releases only its owned track and removes voice registration/listeners', async t => {
  const h = await setup(t), voice = h.attach('p', 'audio'), camera = h.attach('p', 'camera');
  h.media.detachSubscription(voice.owner); h.media.detachSubscription(voice.owner);
  assert.equal(voice.track.stops, 1); assert.equal(voice.track.listeners, 0);
  assert.equal(camera.track.readyState, 'live'); assert.equal(camera.track.listeners, 3);
  assert.deepEqual(h.media.getStreams('p').av.getAudioTracks(), []);
  assert.deepEqual(h.voices.map(v => v[2]), [true, false]);
});

test('replaced SFU tracks cannot remove a newer publication or restore old listeners', async t => {
  const h = await setup(t), old = h.attach('p', 'camera'), next = h.attach('p', 'camera');
  assert.equal(old.track.stops, 1); assert.equal(old.track.listeners, 0);
  h.media.detachSubscription(old.owner);
  const count = h.changes;
  old.track.event('unmute'); old.track.event('ended');
  assert.equal(h.changes, count);
  assert.equal(h.media.getStreams('p').av.getVideoTracks()[0], next.track);
  assert.equal(next.track.readyState, 'live');
});

test('stale subscription callbacks and disabled calls cannot attach or create playback', async t => {
  const h = await setup(t);
  h.attach('p', 'audio', {isCurrent: () => false});
  h.enable(false); h.attach('p', 'screen-audio');
  assert.equal(h.audio.length, 0); assert.equal(h.voices.length, 0); assert.equal(h.changes, 0);
});

test('recovery waits 3800 ms, deduplicates requests and considers only wanted missing video', async t => {
  const h = await setup(t); h.interests.set('p', {camera: true, screen: false});
  h.media.scheduleRecovery('p'); h.media.scheduleRecovery('p');
  await h.advance(3799); assert.equal(h.recoveries.length, 0);
  await h.advance(1); assert.equal(h.recoveries.length, 1);
  assert.deepEqual(h.recoveries[0][1], {camera: true, screen: false});
  h.attach('p', 'camera'); h.media.scheduleRecovery('p'); await h.advance(3800);
  assert.equal(h.recoveries.length, 1);
});

test('unmute cancels a P2P recovery and mute leaves video visible during the grace interval', async t => {
  const h = await setup(t), pc = peer(); h.peers.set('p', pc);
  const tr = pc.transceivers[1]; h.media.attachPeer('p', tr.receiver.track, tr);
  h.interests.set('p', {camera: true, screen: false});
  const count = h.changes;
  tr.receiver.track.event('mute'); assert.equal(h.changes, count);
  tr.receiver.track.event('unmute'); await h.advance(3800);
  assert.equal(h.recoveries.length, 0);
});

test('clear/cancel invalidate asynchronous recovery and prevent retry on a newer stream', async t => {
  const h = await setup(t); let finish, recoveryCurrent;
  h.interests.set('p', {camera: true, screen: false});
  h.recover((id, missing, current) => { recoveryCurrent = current; return new Promise(resolve => {finish = resolve;}); });
  h.media.scheduleRecovery('p'); await h.advance(3800); assert.equal(recoveryCurrent(), true);
  h.media.clear('p'); h.media.getStreams('p'); assert.equal(recoveryCurrent(), false);
  finish(true); await tick(); await h.advance(10000);
  h.media.scheduleRecovery('p'); await h.advance(3800);
  h.media.cancelRecovery('p'); assert.equal(recoveryCurrent(), false); finish(false); await tick();
});

test('reset removes all tracks/listeners/timers, preserves P2P ownership and handles failed SFU stop', async t => {
  const h = await setup(t), pc = peer(); h.peers.set('p', pc);
  h.media.attachPeer('p', pc.transceivers[0].receiver.track, pc.transceivers[0]);
  const sub = h.attach('s', 'camera'); sub.track.stop = () => { throw new Error('device failure'); };
  h.interests.set('p', {camera: true, screen: false}); h.media.scheduleRecovery('p');
  h.media.reset(); await h.advance(10000);
  assert.equal(h.recoveries.length, 0); assert.equal(h.warnings.length, 1);
  assert.equal(sub.track.listeners, 0); assert.equal(pc.transceivers[0].receiver.track.stops, 0);
});

test('recovery remains single while awaiting signaling and retries only after completion', async t => {
  const h = await setup(t); let finish, calls = 0;
  h.interests.set('p', {camera: false, screen: true});
  h.recover(() => {calls++; return new Promise(resolve => {finish = resolve;});});
  h.media.scheduleRecovery('p'); await h.advance(3800);
  h.media.scheduleRecovery('p'); await h.advance(8000);
  assert.equal(calls, 1);
  finish(true); await tick(); await h.advance(3799); assert.equal(calls, 1);
  await h.advance(1); assert.equal(calls, 2);
  finish(false); await tick();
});
