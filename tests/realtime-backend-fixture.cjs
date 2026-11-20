'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { RealtimeSfuManager } = require('../server/realtime-sfu.ts');
const { readPublish, readReady } = require('../src/lib/voice/sfu-protocol.ts');
const sdp = (type) => ({ type, sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=fixture\r\nt=0 0\r\n' });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
function fixture(t, ports = {}) {
  fs.mkdirSync(path.resolve('artifacts'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('artifacts/server-realtime-'));
  const peers = [0, 1, 2].map((i) => ({ clientId: 'client-' + i, roomId: 'voice', out: [] }));
  const room = {
    id: 'voice',
    kind: 'chat',
    channelType: 'voice',
    voiceMode: 'sfu',
    players: new Map(
      peers.map((ws) => [
        ws.clientId,
        {
          id: ws.clientId,
          name: 'Pessoa ' + ws.clientId,
          ws,
          voiceJoined: true,
          transmissionQuality: 'high',
        },
      ]),
    ),
  };
  const sessions = new Map(),
    calls = [];
  let serial = 0,
    request = 0,
    rosters = 0;
  const provider = async (input, options) => {
    const url = new URL(input),
      body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url: url.pathname, method: options.method, body, signal: options.signal });
    assert.equal(url.origin, 'https://rtc.live.cloudflare.com');
    assert.equal(options.headers.Authorization, 'Bearer fixture-private-token');
    if (ports.fetch) {
      const value = await ports.fetch(url, options, body);
      if (value !== undefined) return value;
    }
    if (url.pathname.endsWith('/sessions/new')) {
      const id = 'session-' + ++serial;
      sessions.set(id, { tracks: [] });
      return Response.json({ sessionId: id });
    }
    const match = /\/sessions\/([^/]+)(.*)$/.exec(url.pathname),
      id = match?.[1],
      current = sessions.get(id),
      suffix = match?.[2];
    if (!current)
      return Response.json(
        { errorCode: 'not_found_session', errorDescription: 'Not found' },
        { status: 404 },
      );
    if (options.method === 'GET') return Response.json({ tracks: current.tracks });
    if (suffix === '/tracks/new') {
      const track = body.tracks[0];
      if (track.location === 'local') {
        assert.equal(body.sessionDescription.type, 'offer');
        current.tracks.push({ ...track, status: 'active' });
        return Response.json({
          tracks: [{ mid: track.mid, trackName: track.trackName }],
          sessionDescription: sdp('answer'),
        });
      }
      const source = sessions
        .get(track.sessionId)
        ?.tracks.find((t) => t.trackName === track.trackName && t.status === 'active');
      if (!source)
        return Response.json({
          tracks: [{ errorCode: 'not_found_track_error', errorDescription: 'Track gone' }],
        });
      const mid = '0';
      current.tracks.push({ ...track, mid, status: 'active' });
      return Response.json({
        tracks: [{ mid, trackName: track.trackName, sessionId: track.sessionId }],
        sessionDescription: sdp('offer'),
        requiresImmediateRenegotiation: true,
      });
    }
    if (suffix === '/renegotiate') {
      assert.equal(body.sessionDescription.type, 'answer');
      current.answered = true;
      return Response.json({});
    }
    if (suffix === '/tracks/update') {
      const value = body.tracks[0].simulcast;
      assert.equal(value.priorityOrdering, 'asciibetical');
      assert.equal(value.ridNotAvailable, 'asciibetical');
      return Response.json({ tracks: [{ mid: body.tracks[0].mid }] });
    }
    if (suffix === '/tracks/close') {
      assert.equal(body.force, true);
      for (const track of current.tracks)
        if (body.tracks.some((t) => t.mid === track.mid)) track.status = 'inactive';
      return Response.json({ tracks: body.tracks });
    }
    throw Error('Unexpected fixture endpoint ' + url.pathname);
  };
  const manager = new (ports.Manager || RealtimeSfuManager)({
    rooms: new Map([[room.id, room]]),
    send: (ws, msg) => ws.out.push(msg),
    broadcastVoiceRoster: () => rosters++,
    version: 'fixture',
    usageFile: path.join(root, 'usage.json'),
    env: {
      CLOUDFLARE_REALTIME_ENABLED: 'true',
      CLOUDFLARE_REALTIME_APP_ID: 'fixture-app',
      CLOUDFLARE_REALTIME_API_TOKEN: 'fixture-private-token',
      ...ports.env,
    },
    fetchImpl: provider,
  });
  t.after(async () => {
    await manager.stop();
    assert.equal(path.dirname(root), path.resolve('artifacts'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const command = async (ws, action, payload = {}) => {
    const requestId = 'request-' + ++request;
    await manager.handleRequest(ws, { requestId, action, payload });
    return ws.out.findLast((e) => e.type === 'sfu-response' && e.requestId === requestId);
  };
  const publish = async (ws, kind = 'audio') => {
    const result = await command(ws, 'publish-track', {
      kind,
      quality: 'high',
      mid: '0',
      sessionDescription: sdp('offer'),
      rids: ['f', 'h', 'q'],
      screenBitrate: 12000000,
    });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    readPublish(result.data);
    return result.data;
  };
  const ready = async (ws, pub) => {
    const result = await command(ws, 'publication-ready', { sessionId: pub.sessionId });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    readReady(result.data);
    return result;
  };
  return {
    manager,
    fetch: provider,
    peers,
    room,
    sessions,
    calls,
    command,
    publish,
    ready,
    get rosters() {
      return rosters;
    },
  };
}
module.exports = { fixture, sdp, tick, deferred };
