'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/camera.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
class Track extends EventTarget {
  constructor(kind = 'video') { super(); this.kind = kind; this.readyState = 'live'; this.stops = 0; this.constraints = []; }
  stop() { this.stops++; this.readyState = 'ended'; }
  applyConstraints(value) { this.constraints.push(value); return Promise.resolve(); }
}
function stream(...initial) {
  const tracks = [...initial];
  return { getTracks: () => [...tracks], getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
    getAudioTracks: () => tracks.filter(t => t.kind === 'audio'),
    addTrack(track) { if (!tracks.includes(track)) tracks.push(track); },
    removeTrack(track) { const i = tracks.indexOf(track); if (i !== -1) tracks.splice(i, 1); } };
}
async function setup(t) {
  const { createCamera } = await modulePromise;
  const settings = { generation: 1, joined: true, deviceId: '', format: {width: 1280, height: 720, fps: 30} };
  const mic = new Track('audio'), callStream = stream(mic), requests = [], changes = [], missing = [];
  let open = async () => stream(new Track()), devices = [], stops = 0;
  let publish = async change => { changes.push(change); };
  const camera = createCamera({
    mediaDevices: { getUserMedia(options) { requests.push(options); return open(options); }, enumerateDevices: async () => devices },
    getSettings: () => ({...settings}), getStream: () => callStream,
    onStarted: change => publish(change), onStopped: () => { stops++; },
    onDeviceMissing: device => { missing.push(device); settings.deviceId = ''; },
  });
  t.after(() => camera.stop());
  return {camera, settings, mic, callStream, requests, changes, missing,
    open(fn) { open = fn; }, publish(fn) { publish = fn; }, devices(value) { devices = value; }, get stops() { return stops; }};
}

test('camera deduplicates acquisition, publishes a live capture and leaves microphone ownership intact', async t => {
  const h = await setup(t), gate = deferred();
  h.publish(async change => { h.changes.push(change); await gate.promise; });
  const first = h.camera.acquire();
  assert.equal(h.camera.acquire(), first);
  await tick();
  const snapshot = h.camera.getSnapshot();
  assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.capture));
  assert.equal(snapshot.loading, true);
  assert.equal(snapshot.capture.track.readyState, 'live');
  assert.equal(h.changes[0].isCurrent(), true);
  assert.deepEqual(h.requests, [{audio: false, video: {width: {ideal: 1280}, height: {ideal: 720}, frameRate: {ideal: 30}, facingMode: {ideal: 'user'}}}]);
  gate.resolve(); assert.equal(await first, snapshot.capture.track);
  h.camera.stop(); h.camera.stop();
  assert.equal(snapshot.capture.track.stops, 1);
  assert.deepEqual(h.callStream.getTracks(), [h.mic]);
  assert.equal(h.mic.readyState, 'live');
});

test('replacement releases the previous webcam before opening another and removes its ended listener', async t => {
  const h = await setup(t), old = await h.camera.acquire(), next = new Track();
  h.settings.deviceId = 'camera-2';
  h.open(async options => {
    assert.equal(old.readyState, 'ended');
    assert.deepEqual(h.callStream.getTracks(), [h.mic]);
    assert.deepEqual(options.video.deviceId, {exact: 'camera-2'});
    return stream(next);
  });
  assert.equal(await h.camera.acquire(), next);
  old.dispatchEvent(new Event('ended'));
  assert.equal(h.camera.getSnapshot().capture.track, next);
  assert.equal(h.stops, 0);
  next.dispatchEvent(new Event('ended'));
  assert.equal(h.camera.getSnapshot().capture, null);
  assert.equal(next.stops, 1);
  assert.equal(h.stops, 1);
});

test('quality fallback retains the explicitly selected camera', async t => {
  const h = await setup(t);
  h.settings.deviceId = 'selected'; h.settings.format.fps = 60;
  h.open(async () => {
    if (h.requests.length === 1) throw new DOMException('quality', 'OverconstrainedError');
    return stream(new Track());
  });
  await h.camera.acquire();
  assert.equal(h.requests[0].video.frameRate.ideal, 30);
  assert.deepEqual(h.requests[1], {audio: false, video: {deviceId: {exact: 'selected'}}});
  assert.deepEqual(h.missing, []);
});

test('only a confirmed missing device clears the preference and opens the default camera', async t => {
  const h = await setup(t); h.settings.deviceId = 'unplugged';
  h.open(async options => {
    if (options.video !== true) throw new DOMException('missing', 'NotFoundError');
    return stream(new Track());
  });
  await h.camera.acquire();
  assert.deepEqual(h.missing, ['unplugged']);
  assert.equal(h.requests.length, 3);
});

test('a present device cannot silently fall back to a different webcam', async t => {
  const h = await setup(t); h.settings.deviceId = 'present';
  h.devices([{kind: 'videoinput', deviceId: 'present'}]);
  h.open(async () => { throw new DOMException('cannot open', 'OverconstrainedError'); });
  await assert.rejects(h.camera.acquire(), {name: 'OverconstrainedError'});
  assert.equal(h.requests.length, 2); assert.deepEqual(h.missing, []);
});

test('permission and security failures never retry another device', async t => {
  for (const name of ['NotAllowedError', 'SecurityError']) {
    const h = await setup(t);
    h.open(async () => { throw new DOMException('denied', name); });
    await assert.rejects(h.camera.acquire(), {name});
    assert.equal(h.requests.length, 1);
    assert.equal(h.camera.getSnapshot().loading, false);
  }
});

test('leave during permission discards the late capture without publishing or touching the new call', async t => {
  const h = await setup(t), gate = deferred(), late = new Track();
  h.open(() => gate.promise);
  const old = h.camera.acquire(); await tick();
  h.settings.generation++; h.camera.stop();
  h.open(async () => stream(new Track()));
  const next = await h.camera.acquire();
  gate.resolve(stream(late));
  await assert.rejects(old, {code: 'CAMERA_CANCELLED'});
  assert.equal(late.stops, 1);
  assert.equal(h.changes.length, 1);
  assert.equal(h.camera.getSnapshot().capture.track, next);
  assert.equal(next.readyState, 'live');
});

test('stop during publication immediately releases the camera and permits a new acquisition', async t => {
  const h = await setup(t), gate = deferred();
  h.publish(async change => { h.changes.push(change); await gate.promise; });
  const old = h.camera.acquire(); await tick();
  const track = h.camera.getSnapshot().capture.track;
  h.camera.stop();
  assert.equal(track.stops, 1); assert.equal(h.changes[0].isCurrent(), false);
  assert.equal(h.camera.getSnapshot().loading, false);
  h.publish(async change => { h.changes.push(change); });
  const next = await h.camera.acquire();
  gate.reject(new Error('old publication failed'));
  await assert.rejects(old, {code: 'CAMERA_CANCELLED'});
  assert.equal(h.camera.getSnapshot().capture.track, next);
  assert.equal(next.readyState, 'live'); assert.equal(track.stops, 1);
});

test('a canceled permission error never triggers quality fallback or overwrites newer loading state', async t => {
  const h = await setup(t), oldGate = deferred(), newGate = deferred();
  h.open(() => oldGate.promise);
  const old = h.camera.acquire(); await tick(); h.camera.stop();
  h.open(() => newGate.promise);
  const next = h.camera.acquire(); await tick();
  oldGate.reject(new DOMException('stale', 'NotFoundError'));
  await assert.rejects(old, {code: 'CAMERA_CANCELLED'});
  assert.equal(h.requests.length, 2); assert.equal(h.camera.getSnapshot().loading, true);
  newGate.resolve(stream(new Track())); await next;
});

test('invalid captures and publication errors release every acquired track', async t => {
  for (const invalid of [true, false]) {
    const h = await setup(t), audio = new Track('audio'), video = new Track();
    h.open(async () => invalid ? stream(audio) : stream(video, audio));
    h.publish(async () => { throw new Error('publication failed'); });
    await assert.rejects(h.camera.acquire(), invalid ? /Nenhuma trilha/ : /publication failed/);
    assert.equal(audio.stops, 1);
    if (!invalid) assert.equal(video.stops, 1);
    assert.equal(h.camera.getSnapshot().capture, null);
    assert.deepEqual(h.callStream.getTracks(), [h.mic]);
  }
});

test('quality changes affect only the owned camera and do not reopen devices', async t => {
  const h = await setup(t), track = await h.camera.acquire();
  h.settings.format = {width: 1920, height: 1080, fps: 30};
  await h.camera.refreshQuality();
  assert.deepEqual(track.constraints, [{width: {ideal: 1920}, height: {ideal: 1080}, frameRate: {ideal: 30, max: 30}}]);
  assert.equal(h.requests.length, 1); assert.deepEqual(h.mic.constraints, []);
});
