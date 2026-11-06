'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/p2p-peers.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const offer = {fromId: 'a', signalType: 'offer', data: {type: 'offer', sdp: 'remote-offer'}};
const answer = {fromId: 'z', signalType: 'answer', data: {type: 'answer', sdp: 'remote-answer'}};
const ice = {fromId: 'a', signalType: 'ice', data: {candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0}};
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
}
function transceiver(kind) {
  return {direction: 'recvonly', receiver: {track: {kind}}, sender: {
    track: null, replacements: [],
    async replaceTrack(track) { this.replacements.push(track); this.track = track; },
  }};
}
class Peer {
  constructor() {
    this.connectionState = 'new'; this.signalingState = 'stable'; this.iceConnectionState = 'new';
    this.transceivers = []; this.allocated = []; this.actions = []; this.closes = 0;
    this.localDescription = null; this.remoteDescription = null;
  }
  addTransceiver(kind) { this.allocated.push(kind); const t = transceiver(kind); this.transceivers.push(t); return t; }
  getTransceivers() { return this.transceivers; }
  async createOffer(options) { this.actions.push(['create-offer', options]); return {type: 'offer', sdp: 'local-offer'}; }
  async createAnswer() { this.actions.push(['create-answer']); return {type: 'answer', sdp: 'local-answer'}; }
  async setLocalDescription(desc) {
    this.actions.push(['local', desc.type]); this.localDescription = desc;
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(desc) {
    this.actions.push(['remote', desc.type]); this.remoteDescription = desc;
    this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
    if (desc.type === 'offer' && !this.transceivers.length)
      this.transceivers = ['audio', 'video', 'video', 'audio'].map(transceiver);
  }
  async addIceCandidate(value) { this.actions.push(['ice', value.candidate]); }
  restartIce() { this.actions.push(['restart']); }
  close() { this.closes++; this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
}
async function setup(t, localId = 'a', mockClock = true) {
  const {createP2pPeers} = await modulePromise;
  if (mockClock) t.mock.timers.enable({apis: ['setTimeout']});
  const settings = {enabled: true, localId}, created = [], sent = [], closed = [], received = [], quality = [], statuses = [], warnings = [];
  const tracks = Object.fromEntries(['audio', 'camera', 'screen', 'screen-audio'].map(kind => [kind, {kind, stops: 0, stop() {this.stops++;}}]));
  const peers = createP2pPeers({getSettings: () => settings,
    createConnection: () => {const pc = new Peer(); created.push(pc); return pc;},
    getTracks: () => tracks, applyQuality: async (sender, kind) => {quality.push(kind);},
    sendSignal: (id, type, data) => sent.push({id, type, data}), getScreenWatch: () => true,
    onTrack: (...args) => received.push(args), onClosed: (...args) => closed.push(args),
    onStateChange() {}, onStatus: status => statuses.push(status), warn: error => warnings.push(error),
  });
  t.after(() => {for (const id of peers.connections.keys()) peers.close(id);});
  return {peers, settings, created, sent, closed, received, quality, statuses, warnings, tracks,
    async advance(ms) {t.mock.timers.tick(ms); await tick();}};
}

test('invalid signaling is rejected before peer allocation; P2P readiness and self identity are enforced', async t => {
  const h = await setup(t);
  for (const value of [null, {}, {...offer, fromId: ' '}, {...offer, data: {type: 'answer', sdp: 'x'}},
    {...offer, data: {type: 'offer', sdp: ''}}, {...ice, data: {candidate: 1}},
    {...ice, data: {candidate: 'x', sdpMLineIndex: -1}}, {...ice, data: {candidate: 'x', sdpMid: 3}},
    {fromId: 'z', signalType: 'stream-watch', data: {watching: 'yes'}},
    {fromId: 'z', signalType: 'unknown', data: {}}]) await h.peers.handleSignal(value);
  assert.equal(h.created.length, 0);
  assert.equal(h.peers.ensure('a'), null);
  h.settings.enabled = false; await h.peers.handleSignal({...offer, fromId: 'z'});
  assert.equal(h.peers.ensure('z'), null); assert.equal(h.created.length, 0);
});

test('initiator owns one peer and ordered bidirectional transceivers, with screen opt-in', async t => {
  const h = await setup(t), pc = h.peers.ensure('z');
  assert.equal(h.peers.ensure('z'), pc); assert.equal(h.created.length, 1);
  assert.deepEqual(pc.allocated, ['audio', 'video', 'video', 'audio']);
  await h.advance(0);
  assert.equal(pc._tronoAudioSender.track, h.tracks.audio);
  assert.equal(pc._tronoVideoSender.track, h.tracks.camera);
  assert.equal(pc._tronoScreenSender.track, null);
  assert.equal(pc._tronoScreenAudioSender.track, null);
  assert.deepEqual(h.sent.map(s => s.type), ['offer']);
  await h.peers.handleSignal({fromId: 'z', signalType: 'stream-watch', data: {watching: true}});
  assert.equal(pc._tronoScreenSender.track, h.tracks.screen);
  assert.equal(pc._tronoScreenAudioSender.track, h.tracks['screen-audio']);
  await h.peers.handleSignal({fromId: 'z', signalType: 'stream-watch', data: {watching: false}});
  assert.equal(pc._tronoScreenSender.track, null);
  h.peers.close('z'); assert(Object.values(h.tracks).every(track => track.stops === 0));
});

test('answerer reuses received m-lines and publishes both audio and video before answering', async t => {
  const h = await setup(t, 'z'), pc = h.peers.ensure('a');
  assert.deepEqual(pc.allocated, []);
  await h.peers.handleSignal(offer);
  assert.deepEqual(pc.allocated, []); assert.equal(pc.transceivers.length, 4);
  assert(pc.transceivers.every(t => t.direction === 'sendrecv'));
  assert.equal(pc.transceivers[0].sender.track, h.tracks.audio);
  assert.equal(pc.transceivers[1].sender.track, h.tracks.camera);
  assert.equal(pc._tronoScreenTransceiver, pc.transceivers[2]);
  assert.equal(pc._tronoScreenAudioTransceiver, pc.transceivers[3]);
  assert.deepEqual(h.sent, [{id: 'a', type: 'answer', data: {type: 'answer', sdp: 'local-answer'}}]);
});

test('ICE received before SDP waits for the description and applies before the answer', async t => {
  const h = await setup(t, 'z'), pc = h.peers.ensure('a');
  await h.peers.handleSignal(ice); assert.deepEqual(pc.actions, []);
  await h.peers.handleSignal(offer);
  assert.deepEqual(pc.actions, [['remote', 'offer'], ['ice', 'candidate:1'], ['create-answer'], ['local', 'answer']]);
});

test('signaling queue serializes remote description and later ICE', async t => {
  const h = await setup(t, 'z'), pc = h.peers.ensure('a'), gate = deferred();
  const remote = pc.setRemoteDescription.bind(pc);
  pc.setRemoteDescription = async desc => { await gate.promise; await remote(desc); };
  const pending = h.peers.handleSignal(offer), candidate = h.peers.handleSignal(ice);
  await tick(); assert.deepEqual(pc.actions, []);
  gate.resolve(); await Promise.all([pending, candidate]);
  assert.deepEqual(pc.actions.at(-1), ['ice', 'candidate:1']);
});

test('offer collision is ignored by the initiator and rolled back by the polite endpoint', async t => {
  const h = await setup(t), pc = h.peers.ensure('z'); await h.advance(0);
  await h.peers.handleSignal({...offer, fromId: 'z'});
  assert.equal(pc.remoteDescription, null);
  const p = await setup(t, 'z', false), answerer = p.peers.ensure('a');
  answerer.signalingState = 'have-local-offer';
  await p.peers.handleSignal(offer);
  assert.deepEqual(answerer.actions[0], ['local', 'rollback']);
  assert.equal(p.sent.at(-1).type, 'answer');
});

test('unsolicited answers cannot replace a stable description', async t => {
  const h = await setup(t), pc = h.peers.ensure('z');
  await h.peers.handleSignal(answer);
  assert.equal(pc.remoteDescription, null); assert.deepEqual(pc.actions, []);
});

test('close cancels all timers, detaches callbacks and invalidates saved event handlers', async t => {
  const h = await setup(t, 'z'), pc = h.peers.ensure('a');
  const iceHandler = pc.onicecandidate, negotiation = pc.onnegotiationneeded, trackHandler = pc.ontrack;
  assert.equal(h.peers.close('a'), true); assert.equal(h.peers.close('a'), false);
  iceHandler({candidate: {toJSON: () => ice.data}}); negotiation(); trackHandler({track: {}, transceiver: {}});
  await h.advance(60000);
  assert.equal(h.sent.length, 0); assert.equal(h.received.length, 0);
  assert.equal(h.closed.length, 1); assert.equal(pc.closes, 1);
  for (const name of ['onicecandidate', 'ontrack', 'onnegotiationneeded', 'onconnectionstatechange', 'oniceconnectionstatechange', 'onicecandidateerror']) assert.equal(pc[name], null);
});

test('closing while createOffer awaits cannot send SDP or affect a replacement peer', async t => {
  const h = await setup(t), pc = h.peers.ensure('z'), gate = deferred();
  pc.createOffer = () => gate.promise;
  await h.advance(0); h.peers.close('z');
  const next = h.peers.ensure('z'); await h.advance(0);
  const count = h.sent.length;
  gate.resolve({type: 'offer', sdp: 'obsolete'}); await tick();
  assert.equal(h.sent.length, count); assert.equal(h.peers.connections.get('z'), next);
  assert.equal(pc.localDescription, null); assert.equal(h.peers.isCurrent('z', pc), false);
});

test('closing during setRemoteDescription prevents answer, track binding and queued ICE', async t => {
  const h = await setup(t, 'z'), pc = h.peers.ensure('a'), gate = deferred();
  pc.setRemoteDescription = () => gate.promise;
  const pending = h.peers.handleSignal(offer), queued = h.peers.handleSignal(ice);
  await tick(); h.peers.close('a'); const next = h.peers.ensure('a');
  gate.resolve(); await Promise.all([pending, queued]);
  assert.equal(h.sent.length, 0); assert.deepEqual(h.quality, []);
  assert.equal(h.peers.connections.get('a'), next);
});

test('offer retries are bounded and answering stops them', async t => {
  const h = await setup(t), pc = h.peers.ensure('z'); await h.advance(0);
  pc.connectionState = 'connected'; pc.onconnectionstatechange();
  for (let i = 0; i < 8; i++) await h.advance(2500);
  assert.equal(h.sent.filter(s => s.type === 'offer').length, 6);
  assert(h.statuses.includes('offer-timeout'));
  await h.peers.handleSignal(answer); const before = h.sent.length;
  await h.advance(10000); assert.equal(h.sent.length, before);
});

test('ICE restart survives a later ordinary negotiation and waits for an outstanding answer', async t => {
  const h = await setup(t), pc = h.peers.ensure('z');
  h.peers.negotiate('z', true, true); h.peers.negotiate('z', false, true);
  await h.advance(0);
  assert.deepEqual(pc.actions.find(a => a[0] === 'create-offer')[1], {iceRestart: true});
  h.peers.negotiate('z', true, true); await h.advance(0);
  await h.peers.handleSignal(answer);
  assert.equal(pc.actions.filter(a => a[0] === 'restart').length, 2);
});

test('a late track replacement reconciles the latest capture and stops work after close', async t => {
  const h = await setup(t), pc = h.peers.ensure('z'), gate = deferred();
  const sender = pc._tronoAudioSender, replace = sender.replaceTrack.bind(sender);
  sender.replaceTrack = async track => { await gate.promise; await replace(track); };
  const pending = h.peers.syncTracks(pc); await tick();
  h.tracks.audio = {kind: 'audio', newer: true}; gate.resolve(); await pending;
  assert.equal(sender.track, h.tracks.audio);
  const otherGate = deferred(); sender.replaceTrack = () => otherGate.promise;
  const late = h.peers.syncTracks(pc); await tick(); h.peers.close('z');
  const qualityBefore = h.quality.length; otherGate.resolve(); await late;
  assert.equal(h.quality.length, qualityBefore);
});

test('ICE restart requested while createOffer is pending is retained until the answer', async t => {
  const h = await setup(t), pc = h.peers.ensure('z'), gate = deferred();
  pc.createOffer = () => gate.promise;
  await h.advance(0);
  h.peers.negotiate('z', true, true); await h.advance(0);
  gate.resolve({type: 'offer', sdp: 'local-offer'}); await tick();
  assert.equal(pc.actions.filter(a => a[0] === 'restart').length, 0);
  await h.peers.handleSignal(answer);
  assert.equal(pc.actions.filter(a => a[0] === 'restart').length, 1);
});

test('connected peer announces screen watch; failures request ICE and expose connection timeout', async t => {
  const h = await setup(t, 'z'), pc = h.peers.ensure('a');
  pc.connectionState = 'connected'; pc.onconnectionstatechange();
  assert.deepEqual(h.sent.at(-1), {id: 'a', type: 'stream-watch', data: {watching: true}});
  pc.iceConnectionState = 'failed'; pc.oniceconnectionstatechange();
  assert.equal(h.sent.at(-1).data.iceRestart, true);
  const h2 = await setup(t, 'a', false), pc2 = h2.peers.ensure('z');
  for (let i = 0; i < 3; i++) await h2.advance(10000);
  assert(h2.statuses.includes('connection-timeout'));
  pc2.connectionState = 'closed'; pc2.onconnectionstatechange();
  assert.equal(h2.peers.connections.size, 0);
});
