'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/toolbar.ts');
function gate() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function setup(t) {
  const { createCallToolbar, CALL_CONTROL_IDS } = await modulePromise;
  const state = {
    joined: true,
    joining: false,
    eligible: true,
    textOnly: false,
    communityVoice: true,
    discord: false,
    desktop: true,
    micMuted: false,
    deafened: false,
    camera: false,
    cameraPending: false,
    cameraLoading: false,
    screen: false,
    blocked: false,
  };
  const calls = [],
    warnings = [],
    subscribers = new Set();
  let open = false,
    workspace = false;
  const settings = {
    getSnapshot: () => ({ open }),
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    toggle() {
      open = !open;
      for (const listener of subscribers) listener();
    },
  };
  const options = {
    read: () => state,
    workspace: () => workspace,
    settings: () => settings,
    actions: Object.fromEntries(
      CALL_CONTROL_IDS.filter((id) => id !== 'voiceSettingsBtn').map((id) => [
        id,
        () => calls.push(id),
      ]),
    ),
    resume: () => calls.push('resume'),
    warn: (error) => warnings.push(error),
  };
  const client = createCallToolbar(options);
  t.after(client.dispose);
  return {
    client,
    state,
    calls,
    warnings,
    settings,
    subscribers,
    options,
    setWorkspace: (value) => (workspace = value),
  };
}

test('one stable snapshot projects eligibility, deafen and sharing rules without owning participation', async (t) => {
  const { client, state } = await setup(t);
  const initial = client.getSnapshot();
  assert.strictEqual(client.getSnapshot(), initial);
  state.deafened = true;
  state.micMuted = true;
  state.screen = true;
  client.refresh();
  let buttons = client.getSnapshot().buttons;
  assert.equal(buttons.muteMicBtn.disabled, true);
  assert.equal(buttons.deafenVoiceBtn.disabled, false);
  assert.equal(buttons.muteMicBtn.active, true);
  assert.equal(buttons.screenShareBtn.label, 'Parar tela');
  state.joined = false;
  state.joining = true;
  client.refresh();
  buttons = client.getSnapshot().buttons;
  assert.equal(buttons.joinVoiceBtn.label, 'Conectando…');
  assert.equal(buttons.joinVoiceBtn.disabled, true);
  assert.equal(buttons.screenShareBtn.disabled, true);
  assert.equal(buttons.deafenVoiceBtn.disabled, true);
  state.joining = false;
  state.eligible = false;
  client.refresh();
  assert.equal(client.getSnapshot().buttons.joinVoiceBtn.disabled, true);
  assert(Object.isFrozen(buttons));
  assert(Object.isFrozen(buttons.cameraBtn));
});

test('original camera auto-join remains possible while Discord, text-only and pending capture retain their restrictions', async (t) => {
  const { client, state } = await setup(t);
  state.joined = false;
  client.refresh();
  assert.equal(client.getSnapshot().buttons.cameraBtn.disabled, false);
  state.discord = true;
  client.refresh();
  assert.equal(client.getSnapshot().buttons.cameraBtn.disabled, true);
  state.discord = false;
  state.textOnly = true;
  client.refresh();
  assert.equal(client.getSnapshot().buttons.cameraBtn.disabled, true);
  state.textOnly = false;
  state.joined = true;
  state.cameraPending = true;
  client.refresh();
  assert.equal(client.getSnapshot().buttons.cameraBtn.disabled, true);
  state.camera = true;
  client.refresh();
  assert.equal(client.getSnapshot().buttons.cameraBtn.disabled, false);
  assert.equal(client.getSnapshot().buttons.cameraBtn.label, 'Desligar câmera');
});

test('commands begin synchronously inside the gesture and re-read availability before a second click', async (t) => {
  const { client, state, calls, options } = await setup(t);
  const pending = gate();
  options.actions.cameraBtn = () => {
    calls.push('camera-start');
    state.cameraPending = true;
    return pending.promise;
  };
  const action = client.activate('cameraBtn');
  assert.deepEqual(calls, ['camera-start']);
  assert.equal(client.getSnapshot().buttons.cameraBtn.disabled, true);
  await client.activate('cameraBtn');
  assert.deepEqual(calls, ['camera-start']);
  pending.resolve();
  await action;
  await client.activate('muteMicBtn');
  await client.activate('deafenVoiceBtn');
  await client.activate('screenShareBtn');
  await client.activate('joinVoiceBtn');
  await client.resume();
  assert.deepEqual(calls, [
    'camera-start',
    'muteMicBtn',
    'deafenVoiceBtn',
    'screenShareBtn',
    'joinVoiceBtn',
    'resume',
  ]);
});

test('settings share one subscription and the existing owner supplies opening and external closing', async (t) => {
  const { client, settings, subscribers } = await setup(t);
  client.start();
  client.start();
  assert.equal(subscribers.size, 1);
  await client.activate('voiceSettingsBtn');
  assert.equal(client.getSnapshot().buttons.voiceSettingsBtn.active, true);
  settings.toggle();
  assert.equal(client.getSnapshot().buttons.voiceSettingsBtn.active, false);
  client.dispose();
  assert.equal(subscribers.size, 0);
});

test('layout changes update icons and labels while status persists; early startup can precede the settings controller', async (t) => {
  const { client, state, setWorkspace, options } = await setup(t);
  const settings = options.settings();
  options.settings = () => undefined;
  client.setStatus('Preparando áudio', 'warn');
  assert.deepEqual(client.getSnapshot().status, { text: 'Preparando áudio', kind: 'warn' });
  assert.equal(client.getSnapshot().buttons.voiceSettingsBtn.active, false);
  options.settings = () => settings;
  client.start();
  setWorkspace(true);
  state.camera = true;
  client.refresh();
  assert.equal(client.getSnapshot().buttons.cameraBtn.workspace, true);
  assert.equal(client.getSnapshot().buttons.cameraBtn.short, 'Desligar');
  setWorkspace(false);
  client.refresh();
  assert.equal(client.getSnapshot().buttons.cameraBtn.workspace, false);
  assert.equal(client.getSnapshot().status.text, 'Preparando áudio');
});

test('recovery and asynchronous failures use existing actions and preserve current status', async (t) => {
  const { client, state, options, warnings } = await setup(t);
  state.blocked = true;
  client.refresh();
  assert.equal(client.getSnapshot().blocked, true);
  const pending = gate(),
    error = new Error('unavailable');
  options.resume = () => pending.promise;
  const action = client.resume();
  client.setStatus('Nova mensagem', 'ok');
  pending.reject(error);
  await action;
  assert.deepEqual(warnings, [error]);
  assert.equal(client.getSnapshot().status.text, 'Nova mensagem');
});

test('dispose ignores late results and further actions without stopping borrowed owners', async (t) => {
  const { client, settings, options, calls } = await setup(t);
  settings.dispose = () => assert.fail('settings disposed');
  const pending = gate();
  options.actions.screenShareBtn = () => pending.promise;
  const action = client.activate('screenShareBtn');
  let updates = 0;
  client.subscribe(() => updates++);
  client.start();
  updates = 0;
  const snapshot = client.getSnapshot();
  client.dispose();
  pending.resolve();
  await action;
  await client.activate('muteMicBtn');
  await client.resume();
  client.setStatus('Late');
  client.refresh();
  client.start();
  assert.equal(updates, 0);
  assert.deepEqual(calls, []);
  assert.strictEqual(client.getSnapshot(), snapshot);
});
