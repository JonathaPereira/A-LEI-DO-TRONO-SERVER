'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/speaking-indicators.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
class Events extends EventTarget {
  bindings = new Map();
  addEventListener(type, listener, ...rest) {
    if (!this.bindings.has(type)) this.bindings.set(type, new Set());
    this.bindings.get(type).add(listener);
    return super.addEventListener(type, listener, ...rest);
  }
  removeEventListener(type, listener, ...rest) {
    this.bindings.get(type)?.delete(listener);
    return super.removeEventListener(type, listener, ...rest);
  }
  get listeners() {
    return [...this.bindings.values()].reduce((n, values) => n + values.size, 0);
  }
  event(type) {
    this.dispatchEvent(new Event(type));
  }
}
class Track extends Events {
  constructor(id = 'voice') {
    super();
    this.id = id;
  }
  kind = 'audio';
  readyState = 'live';
  stops = 0;
  stop() {
    this.stops++;
    this.readyState = 'ended';
  }
  end() {
    this.readyState = 'ended';
    this.event('ended');
  }
}
class Context extends Events {
  state = 'running';
  nodes = [];
  resumes = 0;
  closes = 0;
  sample = 128;
  destination = { kind: 'speaker' };
  node(kind) {
    const ctx = this;
    const node = {
      kind,
      connections: new Set(),
      disconnects: 0,
      reads: 0,
      fftSize: 0,
      smoothingTimeConstant: 0,
      connect(target) {
        assert.equal(kind, 'source');
        assert.equal(target.kind, 'analyser');
        this.connections.add(target);
      },
      disconnect() {
        this.connections.clear();
        this.disconnects++;
      },
      getByteTimeDomainData(data) {
        this.reads++;
        data.fill(ctx.sample);
      },
    };
    this.nodes.push(node);
    return node;
  }
  createMediaStreamSource(stream) {
    const node = this.node('source');
    node.stream = stream;
    return node;
  }
  createAnalyser() {
    return this.node('analyser');
  }
  async resume() {
    this.resumes++;
    this.state = 'running';
  }
  async close() {
    this.closes++;
    this.state = 'closed';
  }
  change(state) {
    this.state = state;
    this.event('statechange');
  }
}
const stream = (...tracks) => ({ getAudioTracks: () => tracks });
async function setup(t, overrides = {}) {
  const { createSpeakingIndicators } = await modulePromise;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = new Context(),
    windowEvents = new Events(),
    documentEvents = new Events();
  const settings = { enabled: true, hidden: false, foreground: true, lightMode: false };
  const changes = [],
    warnings = [];
  let time = 1000,
    contextRequests = 0,
    indicators;
  indicators = createSpeakingIndicators({
    getSettings: () => settings,
    getContext: () => {
      contextRequests++;
      return context;
    },
    createStream: (track) => stream(track),
    windowEvents,
    documentEvents,
    now: () => time,
    onChange: () => changes.push(indicators.getSnapshot().speaking),
    warn: (error) => warnings.push(error),
    ...overrides,
  });
  t.after(() => indicators.reset());
  return {
    indicators,
    context,
    settings,
    windowEvents,
    documentEvents,
    changes,
    warnings,
    get contextRequests() {
      return contextRequests;
    },
    async advance(ms) {
      time += ms;
      t.mock.timers.tick(ms);
      await tick();
    },
  };
}

test('keeps the original borrowed track and context; normal refreshes never duplicate nodes or connections', async (t) => {
  const h = await setup(t),
    track = new Track();
  await h.indicators.watch('p', stream(track));
  await h.indicators.watch('p', stream(track));
  h.indicators.refresh();
  h.windowEvents.event('focus');
  assert.equal(h.contextRequests, 1);
  assert.equal(h.context.nodes.length, 2);
  assert.equal(h.context.nodes[0].stream.getAudioTracks()[0], track);
  assert.equal(h.context.nodes[0].connections.size, 1);
  assert.equal(h.context.nodes[1].fftSize, 256);
  assert.equal(h.context.nodes[1].smoothingTimeConstant, 0.72);
  assert.equal(h.context.listeners, 1);
  assert.equal(h.windowEvents.listeners, 2);
  assert.equal(h.documentEvents.listeners, 1);
  assert.equal(h.indicators.getSnapshot().running, 1);
  assert.equal(h.indicators.isSpeaking('p'), false);
  h.indicators.remove('p');
  assert.equal(track.stops, 0);
  assert.equal(track.listeners, 0);
  assert.equal(h.context.resumes, 0);
  assert.equal(h.context.closes, 0);
  assert.equal(h.context.listeners + h.windowEvents.listeners + h.documentEvents.listeners, 0);
});

test('detects RMS above the existing threshold and retains the indicator for 300 ms only', async (t) => {
  const h = await setup(t);
  h.context.sample = 133; // 5/128 is below 0.042.
  await h.indicators.watch('p', stream(new Track()));
  assert.equal(h.indicators.isSpeaking('p'), false);
  h.context.sample = 134;
  await h.advance(100);
  assert.equal(h.indicators.isSpeaking('p'), true);
  h.context.sample = 128;
  await h.advance(200);
  assert.equal(h.indicators.isSpeaking('p'), true);
  await h.advance(100);
  assert.equal(h.indicators.isSpeaking('p'), false);
  assert.deepEqual(h.changes, [['p'], []]);
  const snapshot = h.indicators.getSnapshot();
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.speaking));
});

test('foreground, light mode and unfocused windows use 100/200/500 ms without creating another graph', async (t) => {
  const h = await setup(t);
  await h.indicators.watch('p', stream(new Track()));
  const analyser = h.context.nodes[1];
  await h.advance(99);
  assert.equal(analyser.reads, 1);
  await h.advance(1);
  assert.equal(analyser.reads, 2);
  h.settings.lightMode = true;
  h.indicators.refresh();
  const light = analyser.reads;
  await h.advance(199);
  assert.equal(analyser.reads, light);
  await h.advance(1);
  assert.equal(analyser.reads, light + 1);
  h.settings.foreground = false;
  h.windowEvents.event('blur');
  const blurred = analyser.reads;
  assert.equal(h.indicators.getSnapshot().mode, 'reduced');
  await h.advance(499);
  assert.equal(analyser.reads, blurred);
  await h.advance(1);
  assert.equal(analyser.reads, blurred + 1);
  assert.equal(h.context.nodes.length, 2);
});

test('hidden pages disconnect and stop visual timers; returning resumes the same meter', async (t) => {
  const h = await setup(t),
    track = new Track();
  h.context.sample = 150;
  await h.indicators.watch('p', stream(track));
  const [source, analyser] = h.context.nodes;
  h.settings.hidden = true;
  h.documentEvents.event('visibilitychange');
  assert.equal(h.indicators.getSnapshot().mode, 'paused');
  assert.equal(h.indicators.getSnapshot().running, 0);
  assert.equal(h.indicators.isSpeaking('p'), false);
  assert.equal(source.connections.size, 0);
  const reads = analyser.reads;
  await h.advance(5000);
  assert.equal(analyser.reads, reads);
  h.settings.hidden = false;
  h.documentEvents.event('visibilitychange');
  assert.equal(h.indicators.getSnapshot().running, 1);
  assert.equal(h.indicators.isSpeaking('p'), true);
  assert.equal(source.connections.size, 1);
  assert.equal(h.context.nodes.length, 2);
  assert.equal(track.stops + h.context.resumes + h.context.closes, 0);
});

test('a shared context gets one state listener; suspension pauses visual work without resuming the microphone context', async (t) => {
  const h = await setup(t);
  h.context.sample = 150;
  await h.indicators.watch('a', stream(new Track('a')));
  await h.indicators.watch('b', stream(new Track('b')));
  assert.equal(h.context.listeners, 1);
  h.context.change('suspended');
  assert.equal(h.indicators.getSnapshot().running, 0);
  assert.deepEqual(h.indicators.getSnapshot().speaking, []);
  assert.equal(h.context.resumes, 0);
  h.context.change('running');
  assert.equal(h.indicators.getSnapshot().running, 2);
  assert.deepEqual(h.indicators.getSnapshot().speaking, ['a', 'b']);
  h.indicators.remove('a');
  assert.equal(h.context.listeners, 1);
  h.indicators.remove('b');
  assert.equal(h.context.listeners, 0);
});

test('an initially suspended context keeps a paused meter and waits for its owner to resume it', async (t) => {
  const h = await setup(t);
  h.context.state = 'suspended';
  await h.indicators.watch('p', stream(new Track()));
  assert.equal(h.indicators.getSnapshot().meters, 1);
  assert.equal(h.indicators.getSnapshot().running, 0);
  assert.equal(h.context.nodes[0].connections.size, 0);
  assert.equal(h.context.resumes, 0);
  h.context.change('running');
  assert.equal(h.indicators.getSnapshot().running, 1);
});

test('concurrent watches of the same track share the pending request', async (t) => {
  const pending = deferred(),
    h = await setup(t, { getContext: () => pending.promise }),
    track = new Track();
  const first = h.indicators.watch('p', stream(track));
  assert.equal(h.indicators.watch('p', stream(track)), first);
  assert.equal(h.indicators.getSnapshot().pending, 1);
  pending.resolve(h.context);
  await first;
  assert.equal(h.context.nodes.length, 2);
  assert.equal(h.indicators.getSnapshot().pending, 0);
});

test('late context results from a replaced track cannot overwrite the current meter, even with identical track IDs', async (t) => {
  const first = deferred(),
    second = deferred();
  let calls = 0;
  const h = await setup(t, { getContext: () => (++calls === 1 ? first : second).promise });
  const a = new Track('same'),
    b = new Track('same');
  const old = h.indicators.watch('p', stream(a)),
    next = h.indicators.watch('p', stream(b));
  second.resolve(h.context);
  await next;
  first.resolve(h.context);
  await old;
  assert.equal(h.context.nodes.length, 2);
  assert.equal(h.context.nodes[0].stream.getAudioTracks()[0], b);
  assert.equal(a.listeners, 0);
  assert.equal(b.listeners, 1);
  assert.equal(a.stops + b.stops, 0);
});

for (const action of ['remove', 'reset', 'ended']) {
  test(`${action} during a pending watch prevents late node creation and removes all listeners`, async (t) => {
    const pending = deferred(),
      h = await setup(t, { getContext: () => pending.promise }),
      track = new Track();
    const watching = h.indicators.watch('p', stream(track));
    if (action === 'ended') track.end();
    else h.indicators[action]('p');
    pending.resolve(h.context);
    await watching;
    assert.equal(h.indicators.getSnapshot().meters, 0);
    assert.equal(h.indicators.getSnapshot().running, 0);
    assert.equal(h.context.nodes.length, 0);
    assert.equal(track.listeners + h.windowEvents.listeners + h.documentEvents.listeners, 0);
    assert.equal(track.stops + h.context.resumes + h.context.closes, 0);
  });
}

test('reset and old track/context callbacks cannot affect a new call using the same peer ID', async (t) => {
  const h = await setup(t),
    old = new Track('old'),
    next = new Track('new');
  h.context.sample = 150;
  await h.indicators.watch('p', stream(old));
  const onEnded = [...old.bindings.get('ended')][0],
    onState = [...h.context.bindings.get('statechange')][0];
  h.indicators.reset();
  await h.indicators.watch('p', stream(next));
  const before = h.indicators.getSnapshot();
  onEnded();
  onState();
  assert.deepEqual(h.indicators.getSnapshot(), before);
  assert.equal(old.listeners, 0);
  assert.equal(h.context.listeners, 1);
  assert.equal(
    h.context.nodes.slice(0, 2).every((node) => node.connections.size === 0),
    true,
  );
});

test('partial graph construction and failed analyser reads clean up only the owned nodes', async (t) => {
  const h = await setup(t),
    track = new Track();
  const createAnalyser = h.context.createAnalyser;
  h.context.createAnalyser = () => {
    throw new Error('analyser unavailable');
  };
  await h.indicators.watch('p', stream(track));
  assert.equal(h.context.nodes[0].disconnects, 1);
  assert.equal(track.listeners + h.context.listeners, 0);
  h.context.createAnalyser = createAnalyser;
  await h.indicators.watch('p', stream(track));
  h.context.nodes.at(-1).getByteTimeDomainData = () => {
    throw new Error('read unavailable');
  };
  await h.advance(100);
  assert.equal(h.indicators.getSnapshot().meters, 0);
  assert.equal(h.warnings.length, 2);
  assert.equal(h.context.closes + track.stops, 0);
  assert.equal(
    track.listeners + h.context.listeners + h.windowEvents.listeners + h.documentEvents.listeners,
    0,
  );
});

test('closing the borrowed context or ending a track retires its visual meter', async (t) => {
  const h = await setup(t),
    a = new Track('a'),
    b = new Track('b');
  await h.indicators.watch('a', stream(a));
  await h.indicators.watch('b', stream(b));
  a.end();
  assert.equal(h.indicators.getSnapshot().meters, 1);
  h.context.change('closed');
  assert.equal(h.indicators.getSnapshot().meters, 0);
  assert.equal(a.listeners + b.listeners + h.context.listeners, 0);
  assert.equal(h.context.closes + a.stops + b.stops, 0);
});

test('disabled calls and empty/ended streams do not allocate work or retain an old indicator', async (t) => {
  const h = await setup(t),
    track = new Track();
  h.context.sample = 150;
  await h.indicators.watch('p', stream(track));
  await h.indicators.watch('p', stream());
  assert.equal(h.indicators.isSpeaking('p'), false);
  h.settings.enabled = false;
  await h.indicators.watch('p', stream(track));
  assert.equal(h.indicators.getSnapshot().meters, 0);
  assert.equal(h.contextRequests, 1);
  assert.equal(h.indicators.getSnapshot().mode, 'paused');
});

test('a consumer reset during an indicator change cannot leave a retired timer running', async (t) => {
  let indicators,
    reset = true;
  const h = await setup(t, {
    onChange() {
      if (reset) {
        reset = false;
        indicators.reset();
      }
    },
  });
  indicators = h.indicators;
  h.context.sample = 150;
  await indicators.watch('p', stream(new Track()));
  assert.equal(indicators.getSnapshot().running, 0);
  const reads = h.context.nodes[1].reads;
  await h.advance(5000);
  assert.equal(h.context.nodes[1].reads, reads);
  assert.equal(h.context.listeners + h.windowEvents.listeners + h.documentEvents.listeners, 0);
});
