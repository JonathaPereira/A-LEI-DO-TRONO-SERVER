'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/sfu-session.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const metadata = (kind = 'camera', sessionId = 'remote-1') => ({
  ownerId: 'peer',
  kind,
  sessionId,
  trackName: kind + '-track',
  rids: kind === 'camera' ? ['f', 'h', 'q'] : [],
});
const sdp = (type) => ({
  type,
  sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\na=fmtp:96 x-google-start-bitrate=100;foo=bar\r\n',
});
class Track extends EventTarget {
  constructor(kind = 'video') {
    super();
    this.kind = kind;
    this.readyState = 'live';
    this.stops = 0;
  }
  stop() {
    this.stops++;
    this.readyState = 'ended';
  }
}
class Peer extends EventTarget {
  constructor() {
    super();
    this.connectionState = 'connected';
    this.iceConnectionState = 'connected';
    this.iceGatheringState = 'complete';
    this.closes = 0;
    this.listeners = 0;
    this.init = null;
    this.kind = 'video';
  }
  addEventListener(...a) {
    this.listeners++;
    return super.addEventListener(...a);
  }
  removeEventListener(...a) {
    this.listeners--;
    return super.removeEventListener(...a);
  }
  addTransceiver(track, init) {
    this.init = init;
    this.tr = {
      mid: '0',
      sender: { track, getParameters: () => ({ encodings: init.sendEncodings || [{}] }) },
      receiver: { track: new Track(track.kind) },
    };
    return this.tr;
  }
  async createOffer() {
    return sdp('offer');
  }
  async createAnswer() {
    return sdp('answer');
  }
  async setLocalDescription(value) {
    this.localDescription = value;
  }
  async setRemoteDescription(value) {
    this.remoteDescription = value;
    if (value.type === 'offer') {
      const receiver = { track: new Track(this.kind) };
      this.ontrack?.({ track: receiver.track, receiver });
    }
  }
  getReceivers() {
    return this.tr ? [this.tr.receiver] : [];
  }
  close() {
    this.closes++;
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }
}
async function setup(t) {
  const { createSfuSession } = await modulePromise;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const settings = {
    enabled: true,
    screenAllowed: true,
    quality: 'balanced',
    screenBitrate: 8000000,
    videoBitrate: 2200000,
    camera: { width: 1280, height: 720, fps: 30 },
    screen: { width: 1920, height: 1080, fps: 60 },
    ice: { iceServers: [] },
  };
  const pcs = [],
    calls = [],
    tracks = [],
    detached = [],
    ready = [],
    retries = [],
    fallback = [],
    warnings = [],
    watch = new Map();
  let serial = 0,
    allowed = true,
    list = [];
  const base = async (action, payload) => {
    if (action === 'publish-track')
      return {
        sessionId: 'local-' + ++serial,
        sessionDescription: sdp('answer'),
        publication: { trackName: payload.kind + '-track', rids: payload.rids },
      };
    if (action === 'publication-ready') return { ready: true, rids: [] };
    if (action === 'subscribe-track') {
      pcs.at(-1).kind =
        payload.kind === 'audio' || payload.kind === 'screen-audio' ? 'audio' : 'video';
      return {
        sessionId: 'sub-' + ++serial,
        mid: '0',
        preferredRid: payload.preferredRid,
        sessionDescription: sdp('offer'),
      };
    }
    if (action === 'renegotiate') return { accepted: true };
    if (action === 'list-publications') return { publications: list };
    if (action === 'update-subscription') return { preferredRid: payload.preferredRid };
    return { closed: true };
  };
  let request = base,
    closed = (sub) => detached.push(sub);
  const session = createSfuSession({
    getSettings: () => settings,
    createConnection: () => {
      const pc = new Peer();
      pcs.push(pc);
      return pc;
    },
    request: (action, payload, timeout) => {
      calls.push({ action, payload, timeout });
      return request(action, payload, timeout);
    },
    wants: () => allowed,
    watchVersion: (id) => watch.get(id) || 0,
    preferredRid: () => 'f',
    applyQuality: async () => {},
    onTrack: (...args) => tracks.push(args),
    onSubscriptionClosed: (sub) => closed(sub),
    onReady: (...args) => ready.push(args),
    onRetry: (info) => retries.push(info),
    onFallback: async (reason) => {
      fallback.push(reason);
    },
    onChange() {},
    warn: (e) => warnings.push(e),
  });
  t.after(() => session.reset());
  return {
    session,
    settings,
    pcs,
    calls,
    tracks,
    detached,
    ready,
    retries,
    fallback,
    warnings,
    watch,
    base,
    onClosed(fn) {
      closed = fn;
    },
    request(fn) {
      request = fn;
    },
    allow(value) {
      allowed = value;
    },
    list(value) {
      list = value;
    },
    async advance(ms) {
      t.mock.timers.tick(ms);
      await tick();
    },
  };
}
test('camera publication preserves simulcast profiles, readiness and borrowed capture ownership', async (t) => {
  const h = await setup(t),
    track = new Track();
  const pub = await h.session.publish('camera', track);
  assert.equal(pub.ready, true);
  assert.equal(h.session.publications.get('camera'), pub);
  assert.deepEqual(
    h.pcs[0].init.sendEncodings.map((e) => [e.rid, e.maxBitrate, e.maxFramerate]),
    [
      ['f', 2200000, 30],
      ['h', 924000, 30],
      ['q', 352000, 24],
    ],
  );
  assert.deepEqual(h.calls[0].payload.rids, ['f', 'h', 'q']);
  await h.session.closePublication('camera');
  assert.equal(track.stops, 0);
  assert.equal(h.pcs[0].closes, 1);
});
test('screen stays single-layer with native 60 FPS settings and video-only startup SDP hints', async (t) => {
  const h = await setup(t);
  await h.session.publish('screen', new Track());
  assert.equal(h.pcs[0].init.sendEncodings, undefined);
  assert.equal(h.settings.screen.fps, 60);
  const offer = h.pcs[0].localDescription.sdp;
  assert(offer.includes('x-google-start-bitrate=5200;x-google-max-bitrate=8000'));
  assert(offer.includes('foo=bar'));
  assert(!offer.includes('start-bitrate=100'));
  assert(offer.includes('a=rtpmap:111 opus/48000/2'));
  assert.deepEqual(h.calls[0].payload.rids, []);
});
test('unsupported camera simulcast retries one single layer; explicit budget/network blocks do not retry', async (t) => {
  const h = await setup(t);
  let attempted = 0;
  h.request(async (a, p) => {
    if (a === 'publish-track' && ++attempted === 1)
      throw new DOMException('simulcast', 'NotSupportedError');
    return h.base(a, p);
  });
  await h.session.publish('camera', new Track());
  assert.equal(h.pcs.length, 2);
  assert.equal(h.pcs[0].closes, 1);
  assert.equal(h.pcs[1].init.sendEncodings, undefined);
  h.settings.screenAllowed = false;
  await assert.rejects(h.session.publish('screen', new Track()), { code: 'SCREEN_BUDGET_BLOCKED' });
  assert.equal(h.pcs.length, 2);
  h.request(async () => {
    throw Object.assign(new Error('offline'), { code: 'NETWORK_OFFLINE' });
  });
  await assert.rejects(h.session.publish('camera', new Track()), { code: 'NETWORK_OFFLINE' });
  assert.equal(h.pcs.length, 3);
});
test('late publication reply cleans only its remote session and cannot overwrite a replacement', async (t) => {
  const h = await setup(t),
    gate = deferred();
  h.request((a, p) => (a === 'publish-track' ? gate.promise : h.base(a, p)));
  const old = h.session.publish('audio', new Track('audio'));
  const rejected = assert.rejects(old, { code: 'SFU_CANCELLED' });
  await tick();
  h.session.reset();
  h.request(h.base);
  const next = await h.session.publish('audio', new Track('audio'));
  await rejected;
  gate.resolve({
    sessionId: 'retired',
    sessionDescription: sdp('answer'),
    publication: { trackName: 'old', rids: [] },
  });
  await tick();
  assert.equal(h.session.publications.get('audio'), next);
  assert.equal(next.pc.closes, 0);
  assert(
    h.calls.some((c) => c.action === 'close-publication' && c.payload.sessionId === 'retired'),
  );
});
test('reset cancels pending browser offer immediately without stopping capture or waiting on the browser', async (t) => {
  const h = await setup(t),
    gate = deferred(),
    track = new Track();
  // Install the gate before the next newly allocated peer can create its offer.
  const original = Peer.prototype.createOffer;
  Peer.prototype.createOffer = () => gate.promise;
  t.after(() => {
    Peer.prototype.createOffer = original;
  });
  const next = h.session.publish('audio', track),
    rejected = assert.rejects(next, { code: 'SFU_CANCELLED' });
  await tick();
  h.session.reset();
  await rejected;
  assert.equal(track.stops, 0);
  gate.resolve(sdp('offer'));
  await tick();
  assert.equal(h.session.publications.size, 0);
});
test('publication readiness and SDP replies are validated; malformed allocated sessions are cleaned', async (t) => {
  const h = await setup(t);
  h.request(async (a, p) => (a === 'publication-ready' ? { ready: false } : h.base(a, p)));
  await assert.rejects(h.session.publish('audio', new Track('audio')), { code: 'BAD_SFU_READY' });
  assert.equal(h.session.publications.size, 0);
  assert.equal(h.ready.length, 0);
  h.request(async (a, p) =>
    a === 'publish-track'
      ? {
          sessionId: 'malformed',
          publication: { trackName: 'x' },
          sessionDescription: { type: 'offer', sdp: 'wrong' },
        }
      : h.base(a, p),
  );
  await assert.rejects(h.session.publish('audio', new Track('audio')), { code: 'BAD_SFU_ANSWER' });
  assert(
    h.calls.some((c) => c.action === 'close-publication' && c.payload.sessionId === 'malformed'),
  );
});
test('subscription reuses the wire contract, attaches received tracks and validates the answer confirmation', async (t) => {
  const h = await setup(t);
  h.session.setPublications([metadata()]);
  await h.session.syncSubscriptions();
  const sub = h.session.subscriptions.get('peer:camera');
  assert(sub && !sub.negotiating && sub.readyAt > 0);
  assert.equal(h.tracks.length, 1);
  assert.equal(h.tracks[0][4](), true);
  assert.deepEqual(h.calls.find((c) => c.action === 'subscribe-track').payload, {
    publisherId: 'peer',
    kind: 'camera',
    quality: 'balanced',
    preferredRid: 'f',
  });
  assert.equal(
    h.calls.find((c) => c.action === 'renegotiate').payload.sessionDescription.type,
    'answer',
  );
  await h.session.closeSubscription('peer:camera');
  assert.equal(h.tracks[0][4](), false);
  assert.equal(h.detached[0], sub);
});
test('unwatch during a subscribe request aborts locally and closes the remote session arriving later', async (t) => {
  const h = await setup(t),
    gate = deferred();
  h.session.setPublications([metadata('screen')]);
  h.request((a, p) => (a === 'subscribe-track' ? gate.promise : h.base(a, p)));
  const pending = h.session.syncSubscriptions();
  await tick();
  h.allow(false);
  await h.session.closeSubscription('peer:screen');
  await pending;
  gate.resolve({
    sessionId: 'late-sub',
    mid: '0',
    preferredRid: null,
    sessionDescription: sdp('offer'),
  });
  await tick();
  assert.equal(h.tracks.length, 0);
  assert.equal(h.session.subscriptions.size, 0);
  assert(
    h.calls.some((c) => c.action === 'close-subscription' && c.payload.sessionId === 'late-sub'),
  );
});
test('subscription cancellation does not block a fresh join or detach its received media', async (t) => {
  const h = await setup(t),
    gate = deferred();
  h.session.setPublications([metadata()]);
  h.request((a, p) => (a === 'subscribe-track' ? gate.promise : h.base(a, p)));
  const old = h.session.syncSubscriptions();
  await tick();
  h.session.reset();
  h.request(h.base);
  h.session.setPublications([metadata('camera', 'remote-2')]);
  await h.session.syncSubscriptions();
  const next = h.session.subscriptions.get('peer:camera');
  await old;
  gate.resolve({
    sessionId: 'old-sub',
    mid: '0',
    preferredRid: 'f',
    sessionDescription: sdp('offer'),
  });
  await tick();
  assert.equal(h.session.subscriptions.get('peer:camera'), next);
  assert.equal(h.detached.length, 0);
  assert.equal(next.pc.closes, 0);
});
test('catalog validation is atomic and stale list responses cannot overwrite broadcasts', async (t) => {
  const h = await setup(t);
  assert(h.session.setPublications([metadata()]));
  const before = h.session.getPublications();
  assert(Object.isFrozen(before) && Object.isFrozen(before[0]) && Object.isFrozen(before[0].rids));
  for (const rows of [
    [metadata(), metadata()],
    [{ ...metadata(), kind: 'unknown' }],
    [{ ...metadata(), kind: ['audio'] }],
    [{ ...metadata(), rids: ['x'] }],
    null,
  ])
    assert.equal(h.session.setPublications(rows), false);
  assert.equal(h.session.getPublications(), before);
  const gate = deferred();
  h.request(() => gate.promise);
  const pending = h.session.refreshPublications();
  h.session.setPublications([metadata('camera', 'new')]);
  gate.resolve({ publications: [metadata()] });
  await pending;
  assert.equal(h.session.getPublications()[0].sessionId, 'new');
});
test('layer updates are serialized and null responses preserve single-layer truth', async (t) => {
  const h = await setup(t);
  h.session.setPublications([metadata()]);
  await h.session.syncSubscriptions();
  const sub = h.session.subscriptions.get('peer:camera'),
    gate = deferred();
  sub.preferredRid = 'q';
  h.request((a, p) =>
    a === 'update-subscription' && p.preferredRid === 'f' ? gate.promise : h.base(a, p),
  );
  const first = h.session.setLayer(sub.key, 'f'),
    last = h.session.setLayer(sub.key, 'q');
  await tick();
  assert.equal(h.calls.filter((c) => c.action === 'update-subscription').length, 1);
  gate.resolve({ preferredRid: 'f' });
  await Promise.all([first, last]);
  assert.equal(sub.preferredRid, 'q');
  h.request(async () => ({ preferredRid: null }));
  await h.session.setLayer(sub.key, 'f');
  assert.equal(sub.preferredRid, null);
  h.request(async () => ({ preferredRid: ['f'] }));
  await assert.rejects(h.session.setLayer(sub.key, 'f'), { code: 'BAD_SFU_RIDS' });
  assert.equal(sub.preferredRid, null);
});
test('malformed subscription offers retry with the existing backoff and fall back after three attempts', async (t) => {
  const h = await setup(t);
  h.session.setPublications([metadata()]);
  h.request(async (a, p) =>
    a === 'subscribe-track'
      ? { sessionId: 'bad', mid: '0', sessionDescription: sdp('answer') }
      : h.base(a, p),
  );
  await h.session.syncSubscriptions();
  assert.equal(h.retries.length, 1);
  await h.advance(900);
  assert.equal(h.retries.length, 2);
  await h.advance(1800);
  assert.deepEqual(
    h.retries.map((r) => r.attempt),
    [1, 2, 3],
  );
  assert.deepEqual(h.fallback, ['subscription']);
});
test('connection failure handlers and timers from a reset session cannot affect the next call', async (t) => {
  const h = await setup(t);
  const pub = await h.session.publish('audio', new Track('audio')),
    handler = pub.pc.onconnectionstatechange;
  h.session.reset();
  await h.session.publish('audio', new Track('audio'));
  pub.pc.connectionState = 'failed';
  handler();
  await h.advance(60000);
  assert.deepEqual(h.fallback, []);
  assert.equal(h.session.publications.get('audio').pc.closes, 0);
});
test('gathering and connection waits remove all listeners and timers on cancellation', async (t) => {
  const h = await setup(t);
  const original = Peer.prototype.createOffer;
  Peer.prototype.createOffer = async function () {
    this.iceGatheringState = 'gathering';
    return sdp('offer');
  };
  t.after(() => {
    Peer.prototype.createOffer = original;
  });
  const pending = h.session.publish('audio', new Track('audio')),
    reject = assert.rejects(pending, { code: 'SFU_CANCELLED' });
  await tick();
  assert.equal(h.pcs[0].listeners, 1);
  h.session.reset();
  await reject;
  assert.equal(h.pcs[0].listeners, 0);
  await h.advance(20000);
  assert.equal(h.calls.filter((c) => c.action === 'publish-track').length, 0);
});
test('publication connection timeout remains bounded and restores all waiting listeners', async (t) => {
  const h = await setup(t),
    pending = h.session.publish('audio', new Track('audio'));
  const rejected = assert.rejects(pending, { code: 'SFU_CONNECT_TIMEOUT' });
  h.pcs[0].connectionState = 'new';
  h.pcs[0].iceConnectionState = 'new';
  await tick();
  assert.equal(h.pcs[0].listeners, 2);
  await h.advance(14000);
  await rejected;
  assert.equal(h.pcs[0].listeners, 0);
  assert.equal(h.pcs[0].closes, 1);
});
test('a stale publication refresh schedules the new session without waiting for another broadcast', async (t) => {
  const h = await setup(t);
  h.session.setPublications([metadata()]);
  h.list([metadata('camera', 'remote-2')]);
  let first = true;
  h.request(async (a, p) => {
    if (a === 'subscribe-track' && first) {
      first = false;
      throw Object.assign(new Error('stale'), { code: 'PUBLICATION_STALE' });
    }
    return h.base(a, p);
  });
  await h.session.syncSubscriptions();
  await tick();
  assert.equal(h.session.subscriptions.get('peer:camera').publisherSessionId, 'remote-2');
});
test('layer replies arriving after close cannot mutate a replacement subscription', async (t) => {
  const h = await setup(t);
  h.session.setPublications([metadata()]);
  await h.session.syncSubscriptions();
  const old = h.session.subscriptions.get('peer:camera'),
    gate = deferred();
  old.preferredRid = 'q';
  h.request((a, p) => (a === 'update-subscription' ? gate.promise : h.base(a, p)));
  const pending = h.session.setLayer(old.key, 'f'),
    rejected = assert.rejects(pending, { code: 'SFU_CANCELLED' });
  await tick();
  await h.session.closeSubscription(old.key);
  await rejected;
  h.request(h.base);
  await h.session.syncSubscriptions();
  const next = h.session.subscriptions.get(old.key);
  gate.resolve({ preferredRid: 'h' });
  await tick();
  assert.equal(next.preferredRid, 'f');
  assert.notEqual(next, old);
});
test('a publication broadcast cancels obsolete pending subscriptions and immediately negotiates the replacement', async (t) => {
  const h = await setup(t),
    gate = deferred();
  h.session.setPublications([metadata()]);
  h.request((a, p) => (a === 'subscribe-track' ? gate.promise : h.base(a, p)));
  const old = h.session.syncSubscriptions();
  await tick();
  h.session.setPublications([metadata('camera', 'remote-new')]);
  h.request(h.base);
  await h.session.syncSubscriptions();
  await old;
  const next = h.session.subscriptions.get('peer:camera');
  assert.equal(next.publisherSessionId, 'remote-new');
  gate.resolve({
    sessionId: 'retired-pending',
    mid: '0',
    preferredRid: 'f',
    sessionDescription: sdp('offer'),
  });
  await tick();
  assert.equal(h.session.subscriptions.get('peer:camera'), next);
  assert.equal(next.pc.closes, 0);
});

test('receiver cleanup exceptions cannot leak SFU peers or skip remote cleanup', async (t) => {
  const h = await setup(t);
  h.session.setPublications([metadata()]);
  await h.session.syncSubscriptions();
  const sub = h.session.subscriptions.get('peer:camera');
  h.onClosed(() => {
    throw new Error('renderer cleanup failed');
  });
  await h.session.closeSubscription(sub.key);
  assert.equal(sub.pc.closes, 1);
  assert.equal(h.session.subscriptions.size, 0);
  assert.equal(h.warnings.length, 1);
  assert(
    h.calls.some((c) => c.action === 'close-subscription' && c.payload.sessionId === sub.sessionId),
  );
});

test('replacing a live sender during readiness preserves the publication and its failure handler', async (t) => {
  const h = await setup(t),
    gate = deferred(),
    old = new Track('audio'),
    replacement = new Track('audio');
  h.request((action, payload) =>
    action === 'publication-ready' ? gate.promise : h.base(action, payload),
  );
  const pending = h.session.publish('audio', old);
  await tick();
  const pub = h.session.publications.get('audio');
  pub.sender.track = replacement;
  old.stop();
  gate.resolve({ ready: true, rids: [] });
  assert.equal(await pending, pub);
  assert.equal(pub.ready, true);
  pub.pc.connectionState = 'failed';
  pub.pc.onconnectionstatechange();
  await tick();
  assert.deepEqual(h.fallback, ['publisher']);
  assert.equal(replacement.stops, 0);
});
