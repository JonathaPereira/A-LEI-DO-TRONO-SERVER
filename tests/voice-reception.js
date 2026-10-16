'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const policy = import('../src/lib/voice/reception-policy.ts');
const { diagnosticReport } = require('../src/legacy/call-stability');
const receiver = (value = null) => ({
  track: { kind: 'audio', readyState: 'live' },
  jitterBufferTarget: value,
});
function stats(n, { jitter = 0.005, loss = 0, concealed = 0 } = {}) {
  return {
    packetsReceived: n * 100,
    packetsLost: n * loss,
    totalSamplesReceived: n * 48000,
    concealedSamples: n * concealed,
    jitterBufferDelay: n * 48,
    jitterBufferEmittedCount: n * 1000,
    jitter,
  };
}
test('voice margin responds to interval recovery, remains bounded and restores slowly without touching tracks', async () => {
  const { VoiceReception } = await policy;
  const c = new VoiceReception(),
    r = receiver(20),
    track = r.track;
  c.add(r);
  assert.equal(r.jitterBufferTarget, 60);
  assert.equal(c.sample(r, stats(1), 0), null);
  let row = c.sample(r, stats(2, { concealed: 4000 }), 5000);
  assert.equal(row.concealedPct, (8000 / 48000) * 100);
  assert.equal(r.jitterBufferTarget, 100);
  c.sample(r, stats(3, { concealed: 8000 }), 10000);
  assert.equal(r.jitterBufferTarget, 100);
  c.sample(r, stats(4, { concealed: 8000 }), 15000);
  assert.equal(r.jitterBufferTarget, 140);
  c.sample(r, stats(5, { concealed: 8000 }), 30000);
  assert.equal(r.jitterBufferTarget, 140);
  // Cumulative concealment is held constant in healthy intervals.
  for (const stamp of [35000, 65000, 90000, 95000, 155000]) {
    const n = 6 + stamp / 5000,
      s = stats(n);
    s.concealedSamples = 40000;
    c.sample(r, s, stamp);
  }
  assert.equal(r.jitterBufferTarget, 60);
  assert.equal(r.track, track);
  c.configure(false);
  assert.equal(r.jitterBufferTarget, 20);
  c.configure(true);
  assert.equal(r.jitterBufferTarget, 60);
  c.clear();
  assert.equal(r.jitterBufferTarget, 20);
  assert.equal(c.has(r), false);
});
test('loss alone, UI lag and missing/stale/reset counters do not manufacture a healthy interval or a growing buffer', async () => {
  const { VoiceReception, assessment } = await policy;
  const c = new VoiceReception(),
    r = receiver();
  c.sample(r, stats(1), 0);
  c.sample(r, stats(2, { loss: 20 }), 5000);
  assert.equal(r.jitterBufferTarget, 60);
  c.sample(r, { packetsReceived: 300, jitter: 0.005 }, 10000);
  assert.equal(c.snapshot()[0].concealedPct, null);
  assert.equal(c.sample(r, stats(1), 15000), null);
  assert.equal(c.sample(r, stats(2), 14000), null);
  assert.equal(assessment([], 500).kind, 'local-timing');
  assert.equal(r.jitterBufferTarget, 60);
  const other = receiver();
  c.add(other);
  c.prune(new Set([r]));
  assert.equal(c.has(r), true);
  assert.equal(other.jitterBufferTarget, null);
  r.track.readyState = 'ended';
  c.prune(new Set([r]));
  assert.equal(c.has(r), false);
});
test('old browsers and rejected receiver targets fall back to the native engine without reconnecting', async () => {
  const { VoiceReception } = await policy;
  const c = new VoiceReception(),
    old = { track: { kind: 'audio' } },
    denied = {
      track: { kind: 'audio' },
      get jitterBufferTarget() {
        return null;
      },
      set jitterBufferTarget(_) {
        throw Error('unsupported');
      },
    };
  c.add(old);
  c.add(denied);
  assert.equal(c.add(old).supported, false);
  assert.equal(c.add(denied).supported, false);
  assert.equal(c.add({ track: { kind: 'video' } }), null);
  c.clear();
});
test('diagnostics separate arrival/output/timing clues and export only bounded anonymous receive metrics', async () => {
  const { assessment } = await policy;
  assert.equal(assessment([{ lossPct: 4 }], 0).kind, 'arrival');
  assert.equal(assessment([{ concealedPct: 9 }], 200).kind, 'local');
  assert.equal(assessment([{ concealedPct: 9 }], 0).kind, 'recovery');
  assert.equal(assessment([], 0, { gapEvents: 1 }).kind, 'output');
  const row = {
    voice: 'private name',
    id: 'private-id',
    ip: '10.0.0.1',
    lossPct: 3,
    concealedPct: 8,
    jitterMs: 20,
    bufferMs: 70,
    targetMs: 100,
    supported: true,
    packets: 100,
    token: 'secret',
  };
  const report = diagnosticReport({
    call: {},
    reception: {
      enabled: true,
      rows: Array(100).fill(row),
      assessment: 'arrival',
      priority: 'managed',
      recent: [{ ...row, agoMs: 5000, stamp: 555, localLagMs: 200 }],
      playout: { gapEvents: 1, gapMs: 20, device: 'private device' },
    },
  });
  const data = JSON.parse(report);
  assert.equal(data.reception.rows.length, 24);
  assert.equal(data.reception.rows[0].voice, 1);
  assert.equal(data.reception.rows[0].targetMs, 100);
  assert.equal(data.reception.recent[0].agoMs, 5000);
  assert(report.length < 12000);
  for (const text of ['private', 'secret', '10.0.0.1', 'stamp'])
    assert(!report.includes(text), text);
});
