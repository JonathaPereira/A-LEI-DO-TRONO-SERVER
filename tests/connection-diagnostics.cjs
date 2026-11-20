'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const presentation = import('../src/lib/voice/diagnostics-presentation.ts');
const controllerModule = import('../src/lib/voice/connection-diagnostics.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function gate() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function source() {
  return {
    generation: 1,
    joined: true,
    mode: 'p2p',
    hub: true,
    foreground: true,
    version: 'test',
    negotiating: false,
    connectionStates: ['connected'],
    expectedVoices: 1,
    deafened: false,
    desiredFps: 60,
    lastSfuError: '',
    outputLabel: 'Fone',
    audioContext: 'running',
    playback: {
      entries: [{ key: 'peer', route: 'direct', paused: false, blocked: false, gain: 100 }],
      volume: 100,
      output: 'headset',
      outputError: '',
    },
    telemetry: {
      telemetry: null,
      resources: null,
      lagMs: 0,
      enabled: true,
      priority: null,
      rows: [],
      owners: [],
      playout: null,
      assessment: { kind: 'waiting', text: 'Aguardando' },
      history: [],
    },
    realtime: { status: null, error: '', turn: false },
    quality: { preferences: { adaptiveEnabled: true }, adaptation: { level: 0, reason: '' } },
    receptionNames: [],
  };
}
async function setup(t) {
  const { createConnectionDiagnostics } = await controllerModule;
  const state = source(),
    calls = [],
    warnings = [];
  const options = {
    read: () => state,
    telemetry: { start: () => calls.push('start'), collect: async () => calls.push('collect') },
    quality: {
      configure(next) {
        calls.push(['configure', next]);
        Object.assign(state.quality.preferences, next);
      },
      applyAll: async () => calls.push('apply'),
    },
    report: () => {
      calls.push('report');
      return '{"app":"M&N"}';
    },
    copy: async (text) => calls.push(['copy', text]),
    onOpen: (open) => calls.push(['open', open]),
    onQualityChanged: () => calls.push('quality-refreshed'),
    warn: (error) => warnings.push(error),
  };
  const client = createConnectionDiagnostics(options);
  t.after(client.dispose);
  return { client, state, calls, options, warnings };
}

test('infrastructure distinguishes confirmed availability, game P2P, pending negotiation and budget restrictions', async () => {
  const { infrastructurePresentation: present } = await presentation;
  const state = source();
  assert.match(present(state).policy, /aguardando/);
  state.realtime.error = 'offline';
  assert.match(present(state).policy, /Não foi possível sincronizar/);
  state.realtime.status = {
    enabled: true,
    configured: true,
    hardBlocked: false,
    softWarning: true,
    screenAllowed: true,
    highAllowed: true,
    estimatedGb: 1000,
    estimateSafetyFactor: 1.2,
    thresholds: { hard: 950 },
  };
  state.joined = false;
  let view = present(state);
  assert.equal(view.mode, 'Cloudflare SFU pronto');
  assert.equal(view.progress, 100);
  assert.match(view.usage, /1000.00 \/ 950 GB/);
  assert.equal(view.warning, true);
  state.realtime.status.hardBlocked = true;
  assert.match(present(state).policy, /SFU bloqueado/);
  assert.equal(present(state).mode, 'WebRTC P2P (fallback)');
  state.mode = 'sfu-pending';
  assert.equal(present(state).mode, 'Conectando ao SFU…');
  state.hub = false;
  assert.equal(present(state).mode, 'WebRTC P2P (partida)');
  state.realtime.status.hardBlocked = false;
  state.realtime.status.screenAllowed = false;
  assert.match(present(state).policy, /tela bloqueado/);
  state.realtime.status.screenAllowed = true;
  state.realtime.status.highAllowed = false;
  assert.match(present(state).policy, /máximo Equilibrada/);
});

test('playback excludes screen audio and distinguishes muted voices, blocked players and amplification', async () => {
  const { playbackPresentation: present } = await presentation;
  const state = source();
  state.playback.entries.push({
    key: 'stream:x',
    route: 'direct',
    paused: true,
    blocked: true,
    gain: 0,
  });
  assert.equal(present(state).count, 1);
  assert.match(present(state).label, /direto/);
  state.playback.entries[0].route = 'gain';
  state.playback.entries[0].paused = true;
  assert.match(present(state).label, /amplificação/);
  state.playback.entries[0].blocked = true;
  assert.equal(present(state).problem, true);
  state.playback.entries[0].blocked = false;
  state.playback.entries[0].gain = 0;
  assert.match(present(state).label, /participantes em 0%/);
  state.deafened = true;
  assert.match(present(state).label, /silenciada/);
  state.joined = false;
  assert.equal(present(state).count, 0);
});

test('health prioritizes local output and incomplete negotiation over healthy traffic metrics', async () => {
  const { connectionHealth: health } = await presentation;
  const state = source();
  state.telemetry.telemetry = {
    rttMs: 20,
    lossPct: 0,
    jitterMs: 0,
    outFps: 60,
    limiter: 'none',
    pcState: 'connected',
  };
  assert.equal(health(state).level, 'good');
  state.playback.volume = 0;
  assert.equal(health(state).detail, 'saída local');
  state.playback.volume = 100;
  state.mode = 'sfu-pending';
  assert.equal(health(state).label, 'Conectando áudio');
  state.mode = 'sfu';
  state.negotiating = true;
  assert.equal(health(state).detail, 'negociando receptor');
  state.negotiating = false;
  state.connectionStates = ['connecting'];
  assert.equal(health(state).detail, 'aguardando rota');
  state.connectionStates = ['connected'];
  state.telemetry.telemetry.concealedPct = 9;
  assert.equal(health(state).label, 'Voz recebida instável');
  state.telemetry.telemetry.concealedPct = 0;
  state.telemetry.telemetry.outFps = 10;
  assert.match(health(state).recommendation, /origem está codificando poucos quadros/);
  state.telemetry.telemetry.outFps = 60;
  state.expectedVoices = 2;
  assert.equal(health(state).label, 'Aguardando áudio remoto');
});

test('presentation keeps missing metrics distinct from zero and leaves receiver labels as local plain text', async () => {
  const { diagnosticPresentation: present } = await presentation;
  const state = source();
  assert.equal(present(state).fields.telemetryAudioLoss, '—');
  state.telemetry.telemetry = {
    audioLossPct: 0,
    audioJitterMs: 1.6,
    concealedPct: 0,
    uploadBps: 1500000,
    downloadBps: 70000,
  };
  state.telemetry.rows = [
    { voice: 1, lossPct: null, jitterMs: 2.4, concealedPct: 0, bufferMs: 64, targetMs: 60 },
  ];
  state.receptionNames = ['<img onerror=alert(1)>'];
  const view = present(state);
  assert.equal(view.fields.telemetryAudioLoss, '0.0%');
  assert.equal(view.fields.telemetryAudioJitter, '2 ms');
  assert.equal(view.fields.telemetryUpload, '1.50 Mbps');
  assert.equal(view.fields.telemetryDownload, '70 Kbps');
  assert.match(view.rows, /^<img onerror=alert\(1\)> · Voz 1 · perda —/);
  assert.match(view.rows, /buffer medido 64.0 ms · margem solicitada 60 ms/);
  assert.equal(view.fields.telemetryOutput, 'Fone');
  assert(Object.isFrozen(view.fields));
});

test('one shared open state controls the collector cadence; background keeps details stable while header/policy refresh', async (t) => {
  const { client, state, calls } = await setup(t);
  let notifications = 0;
  const before = client.getSnapshot();
  assert.strictEqual(client.getSnapshot(), before);
  const unsubscribe = client.subscribe(() => notifications++);
  client.toggle(true);
  client.toggle(true);
  assert.deepEqual(calls, [['open', true], 'start']);
  assert.equal(notifications, 1);
  const details = client.getSnapshot().details;
  state.foreground = false;
  state.mode = 'sfu-pending';
  client.refresh();
  assert.strictEqual(client.getSnapshot().details, details);
  assert.equal(client.getSnapshot().health.label, 'Conectando áudio');
  state.foreground = true;
  client.refresh();
  assert.notStrictEqual(client.getSnapshot().details, details);
  client.toggle(false);
  assert.deepEqual(calls.slice(-2), [['open', false], 'start']);
  unsubscribe();
  const count = notifications;
  client.refresh();
  assert.equal(notifications, count);
});

test('adaptive checkbox updates the existing owner synchronously once and surfaces encoder failures', async (t) => {
  const { client, state, calls, options, warnings } = await setup(t);
  const pending = gate();
  options.quality.applyAll = () => {
    calls.push('apply');
    return pending.promise;
  };
  const action = client.setAdaptive(false);
  assert.equal(client.getSnapshot().adaptiveEnabled, false);
  await client.setAdaptive(false);
  assert.deepEqual(calls, [['configure', { adaptiveEnabled: false }], 'apply']);
  const error = new Error('encoder');
  pending.reject(error);
  await action;
  assert.deepEqual(warnings, [error]);
  assert.equal(calls.at(-1), 'quality-refreshed');
  assert.equal(state.quality.preferences.adaptiveEnabled, false);
});

test('copy collects fresh metrics before generating the sanitized report and deduplicates clicks', async (t) => {
  const { client, calls, options } = await setup(t);
  const sample = gate();
  options.telemetry.collect = () => {
    calls.push('collect');
    return sample.promise;
  };
  const pending = client.copy();
  await client.copy();
  assert.equal(client.getSnapshot().copying, true);
  assert.deepEqual(calls, ['collect']);
  sample.resolve();
  await pending;
  assert.deepEqual(calls, ['collect', 'report', ['copy', '{"app":"M&N"}']]);
  assert.match(client.getSnapshot().copyStatus, /Copiado/);
  assert.equal(client.getSnapshot().copying, false);
});

test('copy failure permits retry and a previous call cannot copy after a delayed collection', async (t) => {
  const { client, state, calls, options } = await setup(t);
  options.copy = async () => {
    throw new Error('denied');
  };
  await client.copy();
  assert.match(client.getSnapshot().copyStatus, /Não foi possível/);
  const sample = gate();
  options.telemetry.collect = () => sample.promise;
  const old = client.copy();
  state.generation++;
  client.refresh();
  options.telemetry.collect = async () => {};
  options.copy = async (text) => calls.push(['fresh', text]);
  await client.copy();
  sample.resolve();
  await old;
  assert.equal(calls.filter((row) => Array.isArray(row) && row[0] === 'fresh').length, 1);
  assert.match(client.getSnapshot().copyStatus, /Copiado/);
});

test('a clipboard completion from the previous call cannot replace the new copy status', async (t) => {
  const { client, state, options } = await setup(t);
  const clipboard = gate();
  options.copy = () => clipboard.promise;
  const old = client.copy();
  await tick();
  state.generation++;
  client.refresh();
  options.copy = async () => {
    throw new Error('denied');
  };
  await client.copy();
  clipboard.resolve();
  await old;
  assert.match(client.getSnapshot().copyStatus, /Não foi possível/);
});

test('dispose invalidates collection and updates without stopping borrowed media owners', async (t) => {
  const { client, calls, options } = await setup(t);
  options.telemetry.dispose =
    options.telemetry.stop =
    options.quality.dispose =
      () => assert.fail('borrowed owner stopped');
  const sample = gate();
  options.telemetry.collect = () => sample.promise;
  const pending = client.copy(),
    snapshot = client.getSnapshot();
  let notifications = 0;
  client.subscribe(() => notifications++);
  client.dispose();
  client.toggle(true);
  await client.setAdaptive(false);
  client.refresh();
  sample.resolve();
  await pending;
  assert.equal(notifications, 0);
  assert.strictEqual(client.getSnapshot(), snapshot);
  assert.deepEqual(calls, []);
});
