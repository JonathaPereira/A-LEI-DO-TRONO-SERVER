'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/screen-capture.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
class Track extends EventTarget {
  constructor(kind) { super(); this.kind = kind; this.readyState = 'live'; this.stops = 0; this.constraints = []; }
  stop() { this.stops++; this.readyState = 'ended'; }
  end() { this.stop(); this.dispatchEvent(new Event('ended')); }
  applyConstraints(value) { this.constraints.push(value); return Promise.resolve(); }
}
function stream(audio = true, video = true) {
  const tracks = [...(video ? [new Track('video')] : []), ...(audio ? [new Track('audio')] : [])];
  return {
    clones: [],
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
    getAudioTracks: () => tracks.filter(t => t.kind === 'audio'),
    clone() { const clone = stream(audio, video); this.clones.push(clone); return clone; },
  };
}
async function setup(t) {
  const { createScreenCapture } = await modulePromise;
  const settings = { generation: 1, joined: true, format: { width: 1280, height: 720, fps: 30 },
    replay: { width: 1920, height: 1080, fps: 60 }, audio: true, contentHint: 'detail' };
  const requests = [], changes = [], replayStarts = [], replayStops = [], audioEnds = [];
  let open = async () => stream(), publish = async change => { changes.push(change); };
  const capture = createScreenCapture({
    mediaDevices: { getDisplayMedia(options) { requests.push(options); return open(options); } },
    getSettings: () => ({ ...settings }),
    onStarted: change => publish(change),
    onEnded: async () => { capture.stop(); },
    onAudioEnded: async change => { audioEnds.push(change); },
    onSourceStarted: source => { replayStarts.push(source); },
    onSourceStopped: source => { replayStops.push(source); },
  });
  t.after(() => capture.stop());
  return { capture, settings, requests, changes, replayStarts, replayStops, audioEnds,
    open(fn) { open = fn; }, publish(fn) { publish = fn; } };
}
function released(source) {
  assert(source.getTracks().every(t => t.readyState === 'ended' && t.stops === 1));
  for (const clone of source.clones) assert(clone.getTracks().every(t => t.readyState === 'ended' && t.stops === 1));
}

test('screen capture preserves replay quality, native audio options and a single source', async t => {
  const h = await setup(t);
  assert.equal(await h.capture.start(), true);
  const current = h.capture.getCapture();
  assert(Object.isFrozen(current));
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0], {
    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      suppressLocalAudioPlayback: false, restrictOwnAudio: true },
    systemAudio: 'include', windowAudio: 'window', selfBrowserSurface: 'exclude',
  });
  assert.equal(h.replayStarts[0], current.source);
  assert.notEqual(current.source, current.outgoing);
  assert.equal(current.outgoing.getVideoTracks()[0].contentHint, 'detail');
  h.settings.contentHint = 'motion';
  h.capture.refreshHint();
  for (const track of [...current.source.getTracks(), ...current.outgoing.getTracks()]) assert.deepEqual(track.constraints, []);
  assert.equal(current.outgoing.getVideoTracks()[0].contentHint, 'motion');
  assert.equal(await h.capture.start(), true);
  assert.equal(h.requests.length, 1);
  h.capture.stop();
  released(current.source);
  assert.deepEqual(h.replayStops, [current.source]);
});

test('without replay or shared audio, capture requests only the selected call format', async t => {
  const h = await setup(t);
  h.settings.replay = null; h.settings.audio = false;
  h.settings.format = { width: 1920, height: 1080, fps: 60 };
  await h.capture.start();
  assert.deepEqual(h.requests[0].video.frameRate, { ideal: 60 });
  assert.equal(h.requests[0].audio, false);
  assert.equal(h.requests[0].systemAudio, 'exclude');
  assert.equal(h.requests[0].windowAudio, 'exclude');
});

test('canceling the replacement picker preserves the previous source, replay and ended listeners', async t => {
  const h = await setup(t);
  await h.capture.start();
  const before = h.capture.getCapture();
  h.open(async () => { throw new DOMException('Canceled', 'NotAllowedError'); });
  await assert.rejects(h.capture.start({ replace: true }), { name: 'NotAllowedError' });
  assert.equal(h.capture.getCapture(), before);
  assert.equal(before.source.getVideoTracks()[0].readyState, 'live');
  assert.deepEqual(h.replayStops, []);
  before.outgoing.getAudioTracks()[0].end();
  await tick();
  assert.equal(h.audioEnds.length, 1);
  assert.equal(h.audioEnds[0].isCurrent(), true);
  before.source.getVideoTracks()[0].dispatchEvent(new Event('ended'));
  await tick();
  assert.equal(h.capture.getCapture(), null);
});

test('replacement retires the old capture only after publication finishes', async t => {
  const h = await setup(t);
  await h.capture.start();
  const old = h.capture.getCapture(), gate = deferred();
  h.publish(async change => { h.changes.push(change); await gate.promise; });
  const replacement = h.capture.start({ replace: true });
  await tick();
  const next = h.capture.getCapture();
  assert.notEqual(next, old);
  assert.equal(old.source.getVideoTracks()[0].readyState, 'live');
  gate.resolve();
  assert.equal(await replacement, true);
  released(old.source);
  old.source.getVideoTracks()[0].dispatchEvent(new Event('ended'));
  old.outgoing.getAudioTracks()[0].dispatchEvent(new Event('ended'));
  assert.equal(h.capture.getCapture(), next);
  assert.equal(h.audioEnds.length, 0);
});

test('leaving with a picker pending releases its late result without replay or publication', async t => {
  const h = await setup(t), gate = deferred(), late = stream();
  h.open(() => gate.promise);
  const pending = h.capture.start();
  h.settings.joined = false; h.settings.generation++;
  h.capture.stop(); gate.resolve(late);
  assert.equal(await pending, false);
  released(late);
  assert.equal(h.changes.length, 0);
  assert.equal(h.replayStarts.length, 0);
});

test('a late picker cannot replace a newer capture', async t => {
  const h = await setup(t), gate = deferred(), late = stream();
  h.open(() => gate.promise);
  const first = h.capture.start();
  h.open(async () => stream());
  assert.equal(await h.capture.start(), true);
  const current = h.capture.getCapture();
  gate.resolve(late);
  assert.equal(await first, false);
  released(late);
  assert.equal(h.capture.getCapture(), current);
  assert.equal(h.changes.length, 1);
});

test('stop releases both current and retiring captures during pending publication', async t => {
  const h = await setup(t);
  await h.capture.start();
  const old = h.capture.getCapture(), gate = deferred();
  h.publish(() => gate.promise);
  const pending = h.capture.start({ replace: true });
  await tick();
  const next = h.capture.getCapture();
  h.capture.stop();
  released(old.source); released(next.source);
  assert.equal(h.changes[0].isCurrent(), false);
  gate.resolve(); assert.equal(await pending, false);
  h.capture.stop(); released(old.source); released(next.source);
});

test('publication failure releases the new capture and reports the error', async t => {
  const h = await setup(t), source = stream();
  h.open(async () => source);
  h.publish(async () => { throw new Error('publication failed'); });
  await assert.rejects(h.capture.start(), /publication failed/);
  released(source);
  assert.equal(h.capture.getCapture(), null);
  assert.deepEqual(h.replayStops, [source]);
});

test('an obsolete publication failure does not stop the replacement', async t => {
  const h = await setup(t), gate = deferred();
  h.publish(() => gate.promise);
  const first = h.capture.start();
  await tick();
  const old = h.capture.getCapture();
  h.publish(async () => {});
  assert.equal(await h.capture.start({ replace: true }), true);
  const current = h.capture.getCapture();
  gate.reject(new Error('obsolete'));
  assert.equal(await first, false);
  assert.equal(h.capture.getCapture(), current);
  released(old.source);
});

test('a stale publication failure does not cancel a newer pending picker', async t => {
  const h = await setup(t), publication = deferred(), picker = deferred();
  h.publish(() => publication.promise);
  const first = h.capture.start();
  await tick();
  h.open(() => picker.promise);
  const replacement = h.capture.start({ replace: true });
  publication.reject(new Error('obsolete'));
  assert.equal(await first, false);
  h.publish(async () => {});
  picker.resolve(stream());
  assert.equal(await replacement, true);
  assert.equal(h.capture.getCapture().source.getVideoTracks()[0].readyState, 'live');
});

test('a capture without a live video track is released and never published', async t => {
  const h = await setup(t), invalid = stream(true, false);
  h.open(async () => invalid);
  await assert.rejects(h.capture.start(), /Nenhuma tela/);
  released(invalid);
  assert.equal(h.capture.getCapture(), null);
  assert.equal(h.changes.length, 0);
});
