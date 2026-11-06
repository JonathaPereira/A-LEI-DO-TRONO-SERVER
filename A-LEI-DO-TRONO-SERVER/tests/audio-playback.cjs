'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/audio-playback.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const denied = () => Object.assign(new Error('denied'), { name: 'NotAllowedError' });
function track(id = 'audio') {
  return {
    id,
    readyState: 'live',
    stops: 0,
    stop() {
      this.stops++;
    },
  };
}
class Sink {
  sinkId = '';
  sinkCalls = [];
  setSink = async () => {};
  async setSinkId(id) {
    this.sinkCalls.push(id);
    await this.setSink(id);
    this.sinkId = id;
  }
}
class Audio extends Sink {
  srcObject = null;
  paused = true;
  muted = false;
  volume = 1;
  plays = 0;
  removed = false;
  playImpl = () => Promise.resolve();
  play() {
    this.plays++;
    this.paused = false;
    return this.playImpl();
  }
  pause() {
    this.paused = true;
  }
  remove() {
    this.removed = true;
  }
}
class Context extends Sink {
  state = 'running';
  currentTime = 10;
  destination = {};
  onstatechange = null;
  nodes = [];
  closes = 0;
  resumeImpl = async () => {};
  async resume() {
    await this.resumeImpl();
    this.state = 'running';
  }
  async close() {
    this.closes++;
    this.state = 'closed';
  }
  node(kind) {
    const param = () => ({
      value: 0,
      targets: [],
      setTargetAtTime(value, time, duration) {
        this.targets.push({ value, time, duration });
      },
    });
    const node = {
      kind,
      disconnected: 0,
      connect() {},
      disconnect() {
        this.disconnected++;
      },
      gain: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    };
    this.nodes.push(node);
    return node;
  }
  createMediaStreamSource(stream) {
    const node = this.node('source');
    node.stream = stream;
    return node;
  }
  createGain() {
    return this.node('gain');
  }
  createDynamicsCompressor() {
    return this.node('limiter');
  }
  stateChange(value) {
    this.state = value;
    this.onstatechange?.();
  }
}
async function setup(t, options = {}) {
  const { createAudioPlayback } = await modulePromise;
  const audios = [],
    contexts = [],
    blocked = [],
    fallbacks = [],
    warnings = [];
  let changes = 0;
  const player = createAudioPlayback({
    volume: 100,
    output: '',
    createAudio(key) {
      const audio = new Audio();
      audio.key = key;
      audios.push(audio);
      return audio;
    },
    createStream(track) {
      return { getAudioTracks: () => [track] };
    },
    createContext() {
      const ctx = new Context();
      contexts.push(ctx);
      return ctx;
    },
    onChange() {
      changes++;
    },
    onBlocked: () => blocked.push(true),
    onOutputFallback: (failed) => fallbacks.push(failed),
    warn: (error) => warnings.push(error),
    ...options,
  });
  t.after(() => player.reset());
  return {
    player,
    audios,
    contexts,
    blocked,
    fallbacks,
    warnings,
    get changes() {
      return changes;
    },
  };
}

test('normal listening borrows the original track, reuses the player and never allocates a gain context', async (t) => {
  const h = await setup(t),
    source = track();
  const stream = h.player.attach('p', source),
    audio = h.audios[0];
  assert.equal(stream.getAudioTracks()[0], source);
  assert.equal(audio.srcObject, stream);
  h.player.setVolume(80);
  assert.equal(h.player.attach('p', source), stream);
  assert.equal(h.audios.length, 1);
  assert.equal(h.contexts.length, 0);
  assert.equal(audio.volume, 0.8);
  await tick();
  assert.equal(audio.muted, false);
  assert.equal(h.player.getSnapshot().entries[0].route, 'direct');
  h.player.remove('p');
  assert.equal(audio.srcObject, null);
  assert(audio.removed && audio.paused);
  assert.equal(source.stops, 0);
});

test('amplification is optional and returning to normal closes only its owned nodes', async (t) => {
  const h = await setup(t),
    source = track();
  const stream = h.player.attach('p', source);
  h.player.setVolume(180);
  await tick();
  const audio = h.audios[0],
    ctx = h.contexts[0];
  assert.equal(audio.srcObject, stream);
  assert.equal(audio.muted, true);
  assert.equal(h.player.getSnapshot().entries[0].route, 'gain');
  assert.equal(ctx.nodes.find((n) => n.kind === 'gain').gain.targets.at(-1).value, 1.8);
  h.player.setVolume(100);
  assert(ctx.nodes.every((n) => n.disconnected === 1));
  assert.equal(audio.muted, false);
  assert.equal(audio.srcObject, stream);
  assert.equal(ctx.closes, 0);
  assert.equal(source.stops, 0);
});

test('deafen starts every amplified graph at zero and applies voice and screen gains independently', async (t) => {
  const h = await setup(t);
  h.player.setDeafened(true);
  h.player.setVolume(300);
  h.player.setGain('p', 300);
  h.player.setGain('stream:p', 50);
  h.player.attach('p', track());
  h.player.attach('stream:p', track('screen'));
  const ctx = h.contexts[0],
    gains = ctx.nodes.filter((n) => n.kind === 'gain');
  assert(gains.every((n) => n.gain.value === 0));
  assert(h.audios.every((a) => a.muted));
  h.player.setDeafened(false);
  assert.equal(gains[0].gain.targets.at(-1).value, 9);
  assert.equal(gains[1].gain.targets.at(-1).value, 1.5);
  h.player.clearVoiceGains();
  assert.equal(h.player.getGain('p'), 100);
  assert.equal(h.player.getGain('stream:p'), 50);
  h.player.setGain('p', -50);
  assert.equal(h.audios[0].volume, 0);
  assert.equal(h.player.getSnapshot().entries[0].route, 'direct');
});

test('a suspended gain context restores direct playback and can resume without replacing a player or track', async (t) => {
  const h = await setup(t);
  const stream = h.player.attach('p', track());
  h.player.setVolume(200);
  await tick();
  const ctx = h.contexts[0],
    resume = deferred();
  ctx.resumeImpl = () => resume.promise;
  ctx.stateChange('suspended');
  assert.equal(h.player.getSnapshot().entries[0].route, 'direct');
  assert.equal(h.audios[0].muted, false);
  assert(ctx.nodes.every((n) => n.disconnected === 1));
  resume.resolve();
  await tick();
  assert.equal(h.player.getSnapshot().entries[0].route, 'gain');
  assert.equal(h.audios.length, 1);
  assert.equal(h.audios[0].srcObject, stream);
});

test('partial gain graph failure disconnects all allocated nodes and retains native playback', async (t) => {
  const ctx = new Context();
  ctx.createDynamicsCompressor = () => {
    throw new Error('allocation failed');
  };
  const h = await setup(t, { createContext: () => ctx });
  h.player.setVolume(200);
  h.player.attach('p', track());
  await tick();
  assert(ctx.nodes.length > 0);
  assert(ctx.nodes.every((n) => n.disconnected === 1));
  assert.equal(h.player.getSnapshot().entries[0].route, 'direct');
  assert.equal(h.audios[0].muted, false);
});

test('blocked autoplay retries in the gesture and concurrent unlocks share one pending play', async (t) => {
  const h = await setup(t),
    first = deferred();
  h.player.attach('p', track());
  await tick();
  const audio = h.audios[0];
  audio.playImpl = () => first.promise;
  h.player.unlock();
  h.player.unlock();
  h.player.refresh();
  assert.equal(audio.plays, 2);
  first.reject(denied());
  await tick();
  assert.equal(h.blocked.length, 1);
  assert.equal(h.player.getSnapshot().entries[0].blocked, true);
  audio.playImpl = () => Promise.resolve();
  h.player.unlock();
  assert.equal(audio.plays, 3);
  await tick();
  assert.equal(h.player.getSnapshot().entries[0].blocked, false);
});

test('synchronous play errors remain retryable and AbortError is not an autoplay denial', async (t) => {
  const h = await setup(t);
  h.player.attach('p', track());
  await tick();
  const audio = h.audios[0];
  audio.playImpl = () => {
    throw denied();
  };
  h.player.unlock();
  await tick();
  assert.equal(h.blocked.length, 1);
  audio.playImpl = () =>
    Promise.reject(Object.assign(new Error('replaced'), { name: 'AbortError' }));
  h.player.unlock();
  await tick();
  assert.equal(h.blocked.length, 1);
  audio.playImpl = () => Promise.resolve();
  h.player.unlock();
  await tick();
  assert.equal(h.player.getSnapshot().entries[0].blocked, false);
});

test('late play rejection from a replaced track or previous call cannot block the new player', async (t) => {
  const h = await setup(t),
    pending = deferred(),
    old = track('old');
  h.player.attach('p', old);
  await tick();
  h.audios[0].playImpl = () => pending.promise;
  h.player.unlock();
  const oldAudio = h.audios[0];
  h.player.reset();
  h.player.attach('p', track('new'));
  pending.reject(denied());
  await tick();
  assert(oldAudio.removed);
  assert.equal(h.blocked.length, 0);
  assert.equal(h.player.getSnapshot().entries[0].blocked, false);
  assert.equal(old.stops, 0);
});

for (const rejectOld of [false, true]) {
  test(`sink changes serialize and an old ${rejectOld ? 'failure' : 'success'} cannot restore the previous device`, async (t) => {
    const h = await setup(t),
      pending = deferred();
    h.player.attach('p', track());
    await tick();
    const audio = h.audios[0];
    audio.setSink = (id) => (id === 'old' ? pending.promise : Promise.resolve());
    const old = h.player.setOutput('old'),
      latest = h.player.setOutput('latest');
    assert.deepEqual(audio.sinkCalls, ['old']);
    if (rejectOld) pending.reject(denied());
    else pending.resolve();
    assert.equal(await old, false);
    assert.equal(await latest, true);
    await tick();
    assert.equal(audio.sinkId, 'latest');
    assert.equal(h.player.getSnapshot().output, 'latest');
    assert.equal(h.player.getSnapshot().outputError, '');
    assert.deepEqual(h.fallbacks, []);
  });
}

test('an unavailable device moves every native player and the amplification context back to default', async (t) => {
  const h = await setup(t);
  h.player.attach('p', track());
  h.player.attach('stream:p', track('screen'));
  h.player.setVolume(200);
  await tick();
  await h.player.setOutput('working');
  await tick();
  h.audios[0].setSink = async (id) => {
    if (id === 'missing') throw denied();
  };
  assert.equal(await h.player.setOutput('missing'), false);
  await tick();
  assert.equal(h.player.getSnapshot().output, '');
  assert(h.player.getSnapshot().outputError.includes('escolhida'));
  assert([...h.audios, ...h.contexts].every((s) => s.sinkId === ''));
  assert.deepEqual(h.fallbacks, [false]);
  assert(h.player.getSnapshot().entries.every((e) => e.route === 'gain'));
});

test('failed default output reports an error without an endless fallback loop', async (t) => {
  const h = await setup(t);
  h.player.attach('p', track());
  await tick();
  const audio = h.audios[0];
  audio.sinkId = 'working';
  audio.setSink = async () => {
    throw denied();
  };
  await h.player.setOutput('missing');
  await tick();
  assert(h.player.getSnapshot().outputError.includes('padrão'));
  assert(h.fallbacks.includes(true));
  const calls = audio.sinkCalls.length;
  await tick();
  await tick();
  assert.equal(audio.sinkCalls.length, calls);
  assert(calls <= 4);
});

test('reset closes the context, ignores old sink and state callbacks, and preserves borrowed captures', async (t) => {
  const h = await setup(t),
    pending = deferred(),
    source = track();
  h.player.attach('p', source);
  h.player.setVolume(200);
  await tick();
  const ctx = h.contexts[0],
    oldStateChange = ctx.onstatechange;
  ctx.setSink = () => pending.promise;
  const changing = h.player.setOutput('headphones');
  h.player.reset();
  h.player.attach('p', source);
  pending.reject(denied());
  assert.equal(await changing, false);
  await tick();
  const changes = h.changes;
  oldStateChange();
  await tick();
  assert.equal(h.changes, changes);
  assert.equal(h.player.getSnapshot().entries.length, 1);
  assert.equal(ctx.closes, 1);
  assert.equal(ctx.onstatechange, null);
  assert.equal(source.stops, 0);
  assert.deepEqual(h.fallbacks, []);
});
