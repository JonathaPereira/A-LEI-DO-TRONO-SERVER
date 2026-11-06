'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { fixture: channelFixture } = require('./channel-service-fixture.cjs');
const { createVoiceSoundboard } = require('../server/voice-soundboard.ts');
const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sound = (id = first) => ({
  id,
  name: 'Efeito',
  mime: 'audio/wav',
  bytes: 200,
  kind: 'soundboard',
  durationMs: 1000,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = () => new Promise((r) => setImmediate(r));
function fixture(load = async (id) => sound(id)) {
  const f = channelFixture(),
    a = f.connection('alice'),
    b = f.connection('bob'),
    observer = f.connection('observer'),
    requests = [];
  for (const ws of [a, b, observer]) f.service.joinRoom(ws, 'chat-livre');
  for (const ws of [a, b]) f.service.handleVoiceState(ws, { joined: true });
  const owner = createVoiceSoundboard({
    files: {
      sound: async (...args) => {
        requests.push(args);
        return load(...args);
      },
    },
    participation: (ws) => f.service.voiceParticipation(ws),
    send: (ws, event) => f.messages.push({ to: ws.clientId, ...event }),
  });
  f.messages.length = 0;
  return {
    ...f,
    a,
    b,
    observer,
    requests,
    owner,
    close() {
      owner.stop();
      f.service.stop();
    },
  };
}

test('sound playback requires an active account, current voice socket and validated file ID before storage IO', async () => {
  const f = fixture();
  try {
    await f.owner.play(f.observer, { fileId: first });
    assert.equal(f.messages.at(-1).code, 'VOICE_REQUIRED');
    await f.owner.play({ ...f.a }, { fileId: first });
    assert.equal(f.messages.at(-1).code, 'VOICE_REQUIRED');
    await f.owner.play(f.a, { fileId: {} });
    assert.equal(f.messages.at(-1).code, 'FILE_NOT_FOUND');
    f.a.account = null;
    await f.owner.play(f.a, { fileId: first });
    assert.equal(f.messages.at(-1).code, 'AUTH_REQUIRED');
    assert.equal(f.requests.length, 0);
  } finally {
    f.close();
  }
});

test('same sound restarts after 150ms, different sounds wait for the shared minimum window, and observers receive no playback', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const f = fixture();
  try {
    await f.owner.play(f.a, { fileId: first });
    let plays = f.messages.filter((m) => m.type === 'soundboard-play');
    assert.equal(plays.length, 2);
    assert(!plays.some((m) => m.to === 'observer'));
    await f.owner.play(f.a, { fileId: first });
    assert.equal(f.messages.at(-1).code, 'SOUND_RATE');
    now += 151;
    await f.owner.play(f.a, { fileId: first });
    assert.equal(f.messages.filter((m) => m.type === 'soundboard-play').length, 4);
    await f.owner.play(f.b, { fileId: second });
    assert.equal(f.messages.at(-1).code, 'SOUND_RATE');
    assert.equal(f.requests.length, 2);
    now += 3001;
    await f.owner.play(f.b, { fileId: second });
    assert.equal(f.messages.filter((m) => m.type === 'soundboard-play').length, 6);
  } finally {
    f.close();
  }
});

test('concurrent requests recheck the room lock after IO, and duplicate requests from the same actor remain bounded', async () => {
  const gates = [deferred(), deferred()],
    f = fixture(async (id) => {
      await gates[id === first ? 0 : 1].promise;
      return sound(id);
    });
  try {
    const a = f.owner.play(f.a, { fileId: first }),
      b = f.owner.play(f.b, { fileId: second });
    await f.owner.play(f.a, { fileId: first });
    assert.equal(f.requests.length, 2);
    gates[0].resolve();
    await a;
    gates[1].resolve();
    await b;
    assert.equal(f.messages.filter((m) => m.type === 'soundboard-play').length, 2);
    assert.equal(f.messages.at(-1).code, 'SOUND_RATE');
  } finally {
    gates.forEach((g) => g.resolve());
    f.close();
  }
});

test('leaving and rejoining creates a new call token and a fresh request without letting the older load play in it', async () => {
  const gate = deferred();
  let calls = 0,
    oldSignal;
  const f = fixture(async (id, signal) => {
    if (++calls === 1) {
      oldSignal = signal;
      await gate.promise;
    }
    return sound(id);
  });
  try {
    const token = f.service.voiceParticipation(f.a).token,
      old = f.owner.play(f.a, { fileId: first });
    f.service.handleVoiceState(f.a, { joined: false });
    f.service.handleVoiceState(f.a, { joined: true });
    assert.notEqual(f.service.voiceParticipation(f.a).token, token);
    await f.owner.play(f.a, { fileId: first });
    await old;
    assert.equal(oldSignal.aborted, true);
    const plays = f.messages.filter((m) => m.type === 'soundboard-play').length;
    assert.equal(plays, 2);
    gate.resolve();
    await flush();
    assert.equal(f.messages.filter((m) => m.type === 'soundboard-play').length, plays);
  } finally {
    gate.resolve();
    f.close();
  }
});

test('text/game navigation and repeated voice flags preserve the same call token and allow the pending sound', async () => {
  const gate = deferred(),
    f = fixture(async (id) => {
      await gate.promise;
      return sound(id);
    });
  try {
    const token = f.service.voiceParticipation(f.a).token,
      pending = f.owner.play(f.a, { fileId: first });
    f.service.joinTextRoom(f.a, 'text-only');
    f.service.joinGameRoom(f.a, 'sala-cetro');
    f.service.handleVoiceState(f.a, { joined: true, muted: true, screen: true });
    assert.equal(f.service.voiceParticipation(f.a).token, token);
    gate.resolve();
    await pending;
    assert.equal(f.messages.filter((m) => m.type === 'soundboard-play').length, 2);
  } finally {
    gate.resolve();
    f.close();
  }
});

test('identity change or expiry during loading suppresses playback and errors for the replacement actor', async () => {
  for (const change of [
    (ws) => {
      ws.account = { ...ws.account, id: 'replacement' };
    },
    (ws) => {
      ws.account.expiresAt = 0;
    },
  ]) {
    const gate = deferred(),
      f = fixture(async (id) => {
        await gate.promise;
        return sound(id);
      });
    try {
      const pending = f.owner.play(f.a, { fileId: first });
      change(f.a);
      gate.resolve();
      await pending;
      assert.equal(f.messages.length, 0);
    } finally {
      gate.resolve();
      f.close();
    }
  }
});

test('provider errors and mismatched sound identities cannot broadcast malformed playback or expose raw transport errors', async () => {
  let failure = Error('private bearer token'),
    f = fixture(async () => {
      throw failure;
    });
  try {
    await f.owner.play(f.a, { fileId: first });
    assert.equal(f.messages.at(-1).code, 'SOUND_UNAVAILABLE');
    assert(!f.messages.at(-1).message.includes('token'));
  } finally {
    f.close();
  }
  f = fixture(async () => sound(second));
  try {
    await f.owner.play(f.a, { fileId: first });
    assert.equal(f.messages.at(-1).code, 'SOUND_UNAVAILABLE');
    assert(!f.messages.some((m) => m.type === 'soundboard-play'));
  } finally {
    f.close();
  }
});

test('shutdown aborts storage waits even when the adapter ignores the signal and prevents later playback', async () => {
  const gate = deferred();
  let signal;
  const f = fixture(async (id, value) => {
    signal = value;
    await gate.promise;
    return sound(id);
  });
  try {
    const pending = f.owner.play(f.a, { fileId: first });
    f.owner.stop();
    f.owner.stop();
    await pending;
    assert.equal(signal.aborted, true);
    gate.resolve();
    await flush();
    await f.owner.play(f.a, { fileId: first });
    assert.equal(f.messages.length, 0);
  } finally {
    gate.resolve();
    f.close();
  }
});
