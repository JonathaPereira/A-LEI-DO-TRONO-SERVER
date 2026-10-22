'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createRealtimeProvider, readRealtimeResponse } = require('../server/realtime-provider.ts');
const { createIceProvider } = require('../server/ice.ts');
const { readSubscribe, readAccepted } = require('../src/lib/voice/sfu-protocol.ts');
const { fixture, sdp, tick, deferred } = require('./realtime-backend-fixture.cjs');

test('backend negotiation preserves typed client contracts, readiness, pending answer and exact simulcast controls', async (t) => {
  const f = fixture(t),
    [a, b] = f.peers,
    pub = await f.publish(a, 'screen');
  assert.deepEqual(f.manager.roomPublications('voice'), []);
  const early = await f.command(b, 'subscribe-track', { publisherId: a.clientId, kind: 'screen' });
  assert.equal(early.error.code, 'PUBLICATION_NOT_READY');
  await f.ready(a, pub);
  assert.equal(f.manager.roomPublications('voice')[0].screenBitrate, 12000000);
  const received = await f.command(b, 'subscribe-track', {
    publisherId: a.clientId,
    kind: 'screen',
    preferredRid: 'f',
    quality: 'high',
  });
  assert.equal(received.ok, true);
  const parsed = readSubscribe(received.data);
  assert.equal(parsed.preferredRid, 'f');
  let result = await f.command(b, 'update-subscription', {
    sessionId: parsed.sessionId,
    preferredRid: 'q',
  });
  assert.equal(result.error.code, 'SFU_NEGOTIATION_PENDING');
  result = await f.command(b, 'renegotiate', {
    sessionId: parsed.sessionId,
    sessionDescription: sdp('answer'),
  });
  readAccepted(result.data);
  result = await f.command(b, 'update-subscription', {
    sessionId: parsed.sessionId,
    preferredRid: 'q',
  });
  assert.equal(result.data.preferredRid, 'q');
  const sub = f.manager.subscriptions.get(parsed.sessionId);
  assert.equal(sub.estimatedBps, 3240000);
  result = await f.command(a, 'set-screen-bitrate', { screenBitrate: 15000000 });
  assert.equal(result.data.screenBitrate, 15000000);
  assert.equal(sub.estimatedBps, 4050000);
  assert(f.rosters > 0);
  assert(!JSON.stringify(a.out).includes('fixture-private-token'));
});
test('server ownership rejects foreign sockets/sessions, text/P2P contexts and budget gates before provider IO', async (t) => {
  const f = fixture(t),
    [a, b] = f.peers,
    pub = await f.publish(a);
  await f.ready(a, pub);
  const before = f.calls.length;
  assert.equal(
    (await f.command(b, 'publication-ready', { sessionId: pub.sessionId })).error.code,
    'BAD_SFU_READY',
  );
  assert.equal(
    (await f.command(b, 'close-publication', { sessionId: pub.sessionId })).error.code,
    'BAD_SFU_CLOSE',
  );
  const forged = { ...a, out: [] };
  assert.equal((await f.command(forged, 'list-publications')).error.code, 'SFU_CHAT_ONLY');
  f.room.channelType = 'text';
  assert.equal((await f.command(a, 'publish-track', {})).error.code, 'SFU_CHAT_ONLY');
  f.room.channelType = 'voice';
  f.room.voiceMode = 'p2p';
  assert.equal((await f.command(a, 'publish-track', {})).error.code, 'ROOM_P2P');
  f.room.voiceMode = 'sfu';
  assert.equal(f.calls.length, before);
  const blocked = fixture(t, { env: { REALTIME_MONTHLY_BASE_GB: '950' } });
  const denied = await blocked.command(blocked.peers[0], 'publish-track', {
    kind: 'audio',
    mid: '0',
    sessionDescription: sdp('offer'),
  });
  assert.equal(denied.error.code, 'REALTIME_HARD_LIMIT');
  assert.equal(blocked.calls.length, 0);
});
test('malformed success, track errors and missing subscription MID never install usable media state', async (t) => {
  for (const bad of [
    null,
    [],
    { tracks: {} },
    { tracks: [{ errorCode: 'invalid_track', errorDescription: 'Invalid' }] },
    {},
  ]) {
    const f = fixture(t, {
        fetch: async (url) =>
          url.pathname.endsWith('/tracks/new') ? Response.json(bad) : undefined,
      }),
      a = f.peers[0];
    const result = await f.command(a, 'publish-track', {
      kind: 'audio',
      mid: '0',
      sessionDescription: sdp('offer'),
    });
    assert.equal(result.ok, false);
    assert.equal(f.manager.sessions.size, 0);
    assert.deepEqual(f.manager.roomPublications('voice'), []);
  }
  let malformed = false;
  const f = fixture(t, {
    fetch: async (url, _o, body) =>
      malformed && url.pathname.endsWith('/tracks/new') && body.tracks[0].location === 'remote'
        ? Response.json({ tracks: [{ trackName: 'remote' }], sessionDescription: sdp('offer') })
        : undefined,
  });
  const pub = await f.publish(f.peers[0]);
  await f.ready(f.peers[0], pub);
  malformed = true;
  const result = await f.command(f.peers[1], 'subscribe-track', {
    publisherId: f.peers[0].clientId,
    kind: 'audio',
  });
  assert.equal(result.error.code, 'BAD_SFU_OFFER');
  assert.equal(f.manager.subscriptions.size, 0);
  assert.equal(f.manager.sessions.size, 1);
});
test('same-owner publications serialize and replace one resource while closing the previous remote track', async (t) => {
  const entered = deferred(),
    answer = deferred();
  let pending = true;
  const f = fixture(t, {
      fetch: async (url) => {
        if (pending && url.pathname.endsWith('/sessions/new')) {
          pending = false;
          entered.resolve();
          await answer.promise;
        }
      },
    }),
    a = f.peers[0];
  const first = f.publish(a);
  await entered.promise;
  const second = f.publish(a);
  await tick();
  assert.equal(f.calls.filter((c) => c.url.endsWith('/sessions/new')).length, 1);
  answer.resolve();
  const [old, current] = await Promise.all([first, second]);
  assert.notEqual(old.sessionId, current.sessionId);
  assert.equal(f.manager.sessions.size, 1);
  assert.equal(f.sessions.get(old.sessionId).tracks[0].status, 'inactive');
  assert.equal(
    f.manager.publicationsByRoom.get('voice').get(a.clientId + ':audio').sessionId,
    current.sessionId,
  );
});
test('leaving invalidates queued and active work and an ignored abort cannot republish into the next call', async (t) => {
  const entered = deferred(),
    answer = deferred();
  let pending = true;
  const f = fixture(t, {
      fetch: async (url, _options, body) => {
        if (pending && url.pathname.endsWith('/tracks/new')) {
          pending = false;
          entered.resolve();
          return answer.promise;
        }
      },
    }),
    a = f.peers[0];
  const first = f.command(a, 'publish-track', {
    kind: 'audio',
    mid: '0',
    sessionDescription: sdp('offer'),
  });
  await entered.promise;
  const queued = f.command(a, 'publish-track', {
    kind: 'audio',
    mid: '0',
    sessionDescription: sdp('offer'),
  });
  await f.manager.cleanupClient(a.clientId, 'voice');
  const [failed, stale] = await Promise.all([first, queued]);
  assert.equal(failed.ok, false);
  assert.equal(stale.error.code, 'SFU_SESSION_STALE');
  assert.equal(f.manager.sessions.size, 0);
  assert.equal(f.manager.clientScopes.size, 0);
  const fresh = await f.publish(a);
  await f.ready(a, fresh);
  answer.resolve(
    Response.json({ tracks: [{ mid: '0', trackName: 'late' }], sessionDescription: sdp('answer') }),
  );
  await tick();
  assert.deepEqual(
    f.manager.roomPublications('voice').map((p) => p.sessionId),
    [fresh.sessionId],
  );
  assert.equal(f.manager.sessions.size, 1);
});
test('a new call can publish before the old failed negotiation finishes its remote cleanup', async (t) => {
  const entered = deferred(),
    closeEntered = deferred(),
    lateTrack = deferred(),
    closed = deferred();
  let first = true;
  const f = fixture(t, {
      fetch: async (url, _o, body) => {
        if (first && url.pathname.endsWith('/tracks/new')) {
          first = false;
          entered.resolve();
          return lateTrack.promise;
        }
        if (url.pathname.includes('/session-1/tracks/close')) {
          closeEntered.resolve();
          await closed.promise;
        }
      },
    }),
    a = f.peers[0];
  const old = f.command(a, 'publish-track', {
    kind: 'audio',
    mid: '0',
    sessionDescription: sdp('offer'),
  });
  await entered.promise;
  const cleanup = f.manager.cleanupClient(a.clientId, 'voice');
  await closeEntered.promise;
  const fresh = f.publish(a);
  await tick();
  await tick();
  assert.equal(
    f.calls.filter((call) => call.url.endsWith('/sessions/new')).length,
    2,
    'old cleanup must not own the next call queue',
  );
  closed.resolve();
  const current = await fresh;
  await cleanup;
  await old;
  lateTrack.resolve(
    Response.json({ tracks: [{ mid: '0', trackName: 'late' }], sessionDescription: sdp('answer') }),
  );
  await tick();
  assert.equal(f.manager.sessions.size, 1);
  assert(f.manager.sessions.has(current.sessionId));
});

test('subscription updates serialize behind the answer and old teardown cannot select a replacement session', async (t) => {
  let hold = false;
  const entered = deferred(),
    answer = deferred();
  const f = fixture(t, {
      fetch: async (url) => {
        if (hold && url.pathname.endsWith('/renegotiate')) {
          hold = false;
          entered.resolve();
          await answer.promise;
          return Response.json({});
        }
      },
    }),
    [a, b] = f.peers;
  const pub = await f.publish(a, 'camera');
  await f.ready(a, pub);
  const received = (
    await f.command(b, 'subscribe-track', { publisherId: a.clientId, kind: 'camera' })
  ).data;
  hold = true;
  const renegotiate = f.command(b, 'renegotiate', {
    sessionId: received.sessionId,
    sessionDescription: sdp('answer'),
  });
  await entered.promise;
  const update = f.command(b, 'update-subscription', {
    sessionId: received.sessionId,
    preferredRid: 'q',
  });
  await tick();
  assert.equal(f.calls.filter((c) => c.url.endsWith('/tracks/update')).length, 0);
  answer.resolve();
  assert.equal((await renegotiate).ok, true);
  assert.equal((await update).ok, true);
  await f.manager.cleanupClient(b.clientId, 'voice');
  const next = (await f.command(b, 'subscribe-track', { publisherId: a.clientId, kind: 'camera' }))
    .data;
  assert.notEqual(next.sessionId, received.sessionId);
  assert.equal(f.manager.subscriptions.size, 1);
});
test('shutdown aborts negotiation, drains queues and closes known tracks in one idempotent bounded cleanup', async (t) => {
  let pending = false;
  const entered = deferred(),
    never = deferred();
  const f = fixture(t, {
      fetch: async (url) => {
        if (pending && url.pathname.endsWith('/sessions/new')) {
          pending = false;
          entered.resolve();
          return never.promise;
        }
      },
    }),
    [a, b] = f.peers;
  const pub = await f.publish(a);
  await f.ready(a, pub);
  const received = (
    await f.command(b, 'subscribe-track', { publisherId: a.clientId, kind: 'audio' })
  ).data;
  pending = true;
  const work = f.command(f.peers[2], 'publish-track', {
    kind: 'camera',
    mid: '0',
    sessionDescription: sdp('offer'),
  });
  await entered.promise;
  const counts = f.peers.map((p) => p.out.length);
  const stopped = f.manager.stop();
  assert.equal(stopped, f.manager.stop());
  await stopped;
  await work;
  assert.equal(f.manager.sessions.size, 0);
  assert.equal(f.manager.subscriptions.size, 0);
  assert.equal(f.manager.sessionQueues.size, 0);
  assert.equal(f.manager.clientScopes.size, 0);
  assert.deepEqual(
    f.peers.map((p) => p.out.length),
    counts,
  );
  for (const id of [pub.sessionId, received.sessionId])
    assert(f.sessions.get(id).tracks.every((t) => t.status === 'inactive'));
  const calls = f.calls.length;
  await f.manager.handleRequest(a, { requestId: 'later', action: 'status' });
  assert.equal(f.calls.length, calls);
});
test('unowned malformed requests cannot allocate participant scopes or reveal provider configuration', async (t) => {
  const f = fixture(t);
  for (let n = 0; n < 20; n++) {
    const ws = { clientId: 'outside-' + n, roomId: null, out: [] };
    assert.equal(
      (await f.command(ws, 'publish-track', { kind: 'audio' })).error.code,
      'SFU_CHAT_ONLY',
    );
  }
  assert.equal(f.manager.clientScopes.size, 0);
  assert.equal(f.manager.sessionQueues.size, 0);
  for (const value of [null, [], {}, { requestId: 1, action: 'status' }])
    await f.manager.handleRequest(f.peers[0], value);
  const status = await f.command({ clientId: 'public', out: [] }, 'status');
  assert.equal(status.ok, true);
  assert(!JSON.stringify(status).includes('fixture-private-token'));
  assert.equal(f.calls.length, 0);
});
test('participant capacity includes pending publications and counts each sender once across media kinds', async (t) => {
  const release = deferred();
  const f = fixture(t, {
    env: { REALTIME_MAX_PARTICIPANTS: '2' },
    fetch: async (url) => {
      if (url.pathname.endsWith('/sessions/new')) await release.promise;
    },
  });
  const [a, b, c] = f.peers;
  const first = f.publish(a),
    camera = f.publish(a, 'camera'),
    second = f.publish(b);
  await tick();
  assert.equal(f.calls.filter((call) => call.url.endsWith('/sessions/new')).length, 3);
  const denied = await f.command(c, 'publish-track', {
    kind: 'audio',
    mid: '0',
    sessionDescription: sdp('offer'),
  });
  assert.equal(denied.error.code, 'SFU_ROOM_SAFETY_LIMIT');
  assert.equal(f.calls.filter((call) => call.url.endsWith('/sessions/new')).length, 3);
  release.resolve();
  await Promise.all([first, camera, second]);
  assert.equal(f.manager.pendingPublishers.size, 0);
  assert.equal(f.manager.sessions.size, 3);
});

test('publisher replacement during negotiation cannot acknowledge an obsolete subscription', async (t) => {
  const entered = deferred(),
    answer = deferred();
  let pending = true;
  const f = fixture(t, {
      fetch: async (url, _options, body) => {
        if (
          pending &&
          url.pathname.endsWith('/tracks/new') &&
          body.tracks[0].location === 'remote'
        ) {
          pending = false;
          entered.resolve();
          return answer.promise;
        }
      },
    }),
    [a, b] = f.peers;
  const previous = await f.publish(a, 'camera');
  await f.ready(a, previous);
  const receiving = f.command(b, 'subscribe-track', { publisherId: a.clientId, kind: 'camera' });
  await entered.promise;
  const current = await f.publish(a, 'camera');
  await f.ready(a, current);
  answer.resolve(Response.json({ tracks: [{ mid: '0' }], sessionDescription: sdp('offer') }));
  const result = await receiving;
  assert.equal(result.error.code, 'PUBLICATION_STALE');
  assert.equal(f.manager.subscriptions.size, 0);
  assert.deepEqual(
    f.manager.roomPublications('voice').map((pub) => pub.sessionId),
    [current.sessionId],
  );
});

test('shutdown deadline bounds remote closure even if the provider never settles', async (t) => {
  const original = AbortSignal.timeout,
    deadline = new AbortController(),
    entered = deferred(),
    late = deferred();
  t.mock.method(AbortSignal, 'timeout', (ms) => (ms === 3000 ? deadline.signal : original(ms)));
  let pending = false;
  const f = fixture(t, {
    fetch: async (url) => {
      if (pending && url.pathname.endsWith('/tracks/close')) {
        entered.resolve();
        return late.promise;
      }
    },
  });
  await f.publish(f.peers[0]);
  pending = true;
  const work = f.manager.stop();
  await entered.promise;
  deadline.abort();
  await work;
  assert.equal(f.manager.sessions.size, 0);
  assert.equal(f.calls.findLast((call) => call.url.endsWith('/tracks/close')).signal.aborted, true);
  late.resolve(Response.json({}));
  await tick();
});

test('provider response parsing rejects malformed fields and masks credentials/network failures', async () => {
  for (const bad of [
    null,
    [],
    { sessionId: {} },
    { tracks: {} },
    { tracks: [null] },
    { tracks: [{ mid: 3 }] },
    { tracks: [{ mid: '0' }, { mid: '0' }] },
    { tracks: [{ status: 'invented' }] },
    { sessionDescription: { type: 'offer', sdp: 1 } },
  ])
    assert.throws(() => readRealtimeResponse(bad), { code: 'SFU_RESPONSE_INVALID' });
  const provider = createRealtimeProvider({
    appId: 'fixture',
    token: 'fixture-secret',
    fetchImpl: async () =>
      Response.json({
        errors: [{ errorCode: 'provider_error', errorDescription: 'contains fixture-secret' }],
      }),
  });
  await assert.rejects(
    provider.request('POST', '/sessions/new'),
    (error) => error.publicErrors[0].errorDescription === 'contains [redacted]',
  );
  const top = createRealtimeProvider({
    appId: 'fixture',
    token: 'fixture-secret',
    fetchImpl: async () =>
      Response.json({ errorCode: 'not_found_track_error', errorDescription: 'source gone' }),
  });
  await assert.rejects(
    top.request('GET', '/sessions/fixture'),
    (error) => error.publicErrors[0].errorCode === 'not_found_track_error',
  );
  const failed = createRealtimeProvider({
    appId: 'fixture',
    token: 'fixture-secret',
    fetchImpl: async () => {
      throw Error('private URL and token');
    },
  });
  await assert.rejects(
    failed.request('POST', '/sessions/new'),
    (error) => error.code === 'SFU_REQUEST_FAILED' && !error.message.includes('private'),
  );
});

test('malformed TURN entries cannot produce a partial successful cache', async () => {
  let valid = false,
    calls = 0;
  const good = { urls: ['turn:fixture.test'], username: 'temporary', credential: 'temporary' };
  const ice = createIceProvider({
    enabled: true,
    keyId: 'fixture',
    token: 'fixture',
    ttl: 600,
    fetchImpl: async () => {
      calls++;
      return Response.json({
        iceServers: valid ? [good] : [good, { urls: ['turn:fixture.test'], username: 42 }],
      });
    },
  });
  try {
    await assert.rejects(ice.configuration());
    valid = true;
    assert.equal((await ice.configuration()).iceServers.length, 1);
    assert.equal(calls, 2);
  } finally {
    ice.stop();
  }
});
test('TURN stop aborts a provider ignoring cancellation and cannot populate a disposed cache', async () => {
  const entered = deferred(),
    answer = deferred();
  let seen;
  const ice = createIceProvider({
    enabled: true,
    keyId: 'fixture-key',
    token: 'fixture-token',
    ttl: 600,
    fetchImpl: async (_url, options) => {
      seen = options.signal;
      entered.resolve();
      return answer.promise;
    },
  });
  const work = ice.configuration(),
    rejected = assert.rejects(work);
  await entered.promise;
  ice.stop();
  await rejected;
  assert.equal(seen.aborted, true);
  answer.resolve(
    Response.json({
      iceServers: [{ urls: ['turn:fixture.test'], username: 'temporary', credential: 'temporary' }],
    }),
  );
  await tick();
  await assert.rejects(ice.configuration());
});
