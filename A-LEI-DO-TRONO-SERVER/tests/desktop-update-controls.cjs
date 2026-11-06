'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/desktop/updates.ts');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup(t, overrides = {}) {
  const { createDesktopUpdates, desktopUpdatePresentation } = await modulePromise;
  let event = () => {},
    subscriptions = 0,
    removed = 0,
    checks = 0,
    installs = 0;
  const native = {
    version: '0.2.10',
    getUpdateState: async () => ({ status: 'idle' }),
    onUpdateState(listener) {
      event = listener;
      subscriptions++;
      return () => removed++;
    },
    checkUpdates: async () => {
      checks++;
      return { status: 'current' };
    },
    installUpdate: async () => {
      installs++;
      return { canceled: true };
    },
    ...overrides,
  };
  const client = createDesktopUpdates(native);
  t.after(client.dispose);
  return {
    client,
    native,
    emit: (value) => event(value),
    view: () => desktopUpdatePresentation(client.getSnapshot()),
    counts: () => ({ subscriptions, removed, checks, installs }),
  };
}

test('automatic progress stays quiet; a newly ready update opens once and keeps all labels', async (t) => {
  const { client, emit, view } = await setup(t);
  client.start();
  await Promise.resolve();
  emit({ status: 'downloading', version: '0.3.0', percent: 62 });
  assert.equal(client.getSnapshot().visible, false);
  assert.equal(view().label, 'Baixando · 62%');
  assert.equal(view().text, 'Atualizando de 0.2.10 direto para 0.3.0 · 62%');
  emit({ status: 'ready', version: '0.3.0' });
  assert.equal(client.getSnapshot().visible, true);
  assert.equal(view().restart, 'Instalar 0.3.0 e reiniciar');
  assert.match(view().text, /Será instalada ao sair do app/);
  client.close();
  emit({ status: 'ready', version: '0.3.0', message: 'A versão baixada continua pronta.' });
  assert.equal(client.getSnapshot().visible, false);
  assert.equal(view().text, 'A versão baixada continua pronta.');
  emit({ status: 'checking' });
  emit({ status: 'ready', version: '0.3.1' });
  assert.equal(client.getSnapshot().visible, true);
});

test('remaining status messages and unversioned ready labels preserve the updater copy', async (t) => {
  const { client, emit, native, view } = await setup(t);
  client.start();
  await Promise.resolve();
  for (const [status, expected] of [
    ['idle', 'Verificar atualizações'],
    ['checking', 'Buscando a versão mais recente…'],
    ['development', 'Atualizador disponível na versão instalada.'],
    ['current', 'Você está na versão mais recente.'],
  ]) {
    emit({ status });
    assert.equal(view().text, expected);
  }
  native.version = '0.3.0';
  emit({ status: 'ready' });
  assert.equal(client.getSnapshot().currentVersion, '0.3.0');
  assert.equal(view().restart, 'Reiniciar e atualizar');
  assert.equal(view().title, 'Atualizar diretamente para a versão mais recente');
  assert.match(view().text, /direto para a versão mais recente pronta/);
});

test('a manual check invalidates the initial read, and double clicks send one native request', async (t) => {
  const initial = deferred(),
    check = deferred();
  let calls = 0;
  const { client, view } = await setup(t, {
    getUpdateState: () => initial.promise,
    checkUpdates: () => {
      calls++;
      return check.promise;
    },
  });
  client.start();
  const pending = client.check();
  await client.check();
  assert.equal(calls, 1);
  assert.equal(client.getSnapshot().checking, true);
  initial.resolve({ status: 'idle' });
  await Promise.resolve();
  check.resolve({ status: 'current' });
  await pending;
  assert.equal(client.getSnapshot().state.status, 'current');
  assert.equal(client.getSnapshot().checking, false);
  assert.equal(client.getSnapshot().visible, true);
  assert.equal(view().text, 'Você está na versão mais recente.');
});

test('native broadcasts supersede late initial reads and check replies or errors', async (t) => {
  const initial = deferred(),
    check = deferred();
  const { client, emit } = await setup(t, {
    getUpdateState: () => initial.promise,
    checkUpdates: () => check.promise,
  });
  client.start();
  emit({ status: 'ready', version: '0.3.0' });
  initial.resolve({ status: 'idle' });
  await Promise.resolve();
  assert.equal(client.getSnapshot().state.status, 'ready');
  const pending = client.check();
  emit({ status: 'downloading', version: '0.3.1', percent: 78 });
  check.reject(Error('old check failure'));
  await pending;
  assert.deepEqual(client.getSnapshot().state, {
    status: 'downloading',
    version: '0.3.1',
    percent: 78,
  });
});

test('closing a manual banner stays closed when its request completes', async (t) => {
  const check = deferred();
  const { client } = await setup(t, { checkUpdates: () => check.promise });
  client.start();
  await Promise.resolve();
  const pending = client.check();
  client.close();
  check.resolve({ status: 'current' });
  await pending;
  assert.equal(client.getSnapshot().visible, false);
});

test('invalid native payloads cannot replace confirmed state or reopen a hidden banner', async (t) => {
  const { client, emit } = await setup(t);
  client.start();
  await Promise.resolve();
  const before = client.getSnapshot();
  for (const value of [
    null,
    [],
    'ready',
    { status: 'unknown' },
    { status: 'ready', version: 42 },
    { status: 'ready', message: {} },
    { status: 'downloading' },
    { status: 'downloading', percent: NaN },
    { status: 'downloading', percent: Infinity },
    { status: 'downloading', percent: -1 },
    { status: 'downloading', percent: 101 },
  ])
    emit(value);
  assert.strictEqual(client.getSnapshot(), before);
  const source = { status: 'ready', version: '0.3.0', unused: { invalid: true } };
  emit(source);
  source.version = 'corrupted';
  assert.equal(client.getSnapshot().state.version, '0.3.0');
  assert(Object.isFrozen(client.getSnapshot()));
  assert(Object.isFrozen(client.getSnapshot().state));
});

test('checking failures and malformed replies use the existing error feedback', async (t) => {
  let broken = true;
  const { client, view } = await setup(t, {
    checkUpdates: async () => {
      if (broken) throw Error('offline');
      return { status: 'downloaded' };
    },
  });
  client.start();
  await Promise.resolve();
  await client.check();
  assert.equal(view().text, 'Não foi possível verificar atualizações agora.');
  broken = false;
  await client.check();
  assert.equal(view().text, 'Não foi possível verificar atualizações agora.');
});

test('installation requires ready, deduplicates clicks and leaves consent to native IPC', async (t) => {
  const install = deferred();
  let calls = 0;
  const { client, emit } = await setup(t, {
    installUpdate: () => {
      calls++;
      return install.promise;
    },
  });
  client.start();
  await Promise.resolve();
  await client.install();
  assert.equal(calls, 0);
  emit({ status: 'ready', version: '0.3.0' });
  const pending = client.install();
  await client.install();
  await client.check();
  assert.equal(calls, 1);
  assert.equal(client.getSnapshot().installing, true);
  install.resolve({ canceled: true });
  await pending;
  assert.equal(client.getSnapshot().state.status, 'ready');
  assert.equal(client.getSnapshot().installing, false);
});

test('pending installation reads native state without restoring a superseded ready version', async (t) => {
  const install = deferred(),
    read = deferred();
  let reads = 0;
  const { client, emit } = await setup(t, {
    installUpdate: () => install.promise,
    getUpdateState: async () => (++reads === 1 ? { status: 'idle' } : read.promise),
  });
  client.start();
  await Promise.resolve();
  emit({ status: 'ready', version: '0.3.0' });
  const pending = client.install();
  install.resolve({ pending: true });
  await Promise.resolve();
  emit({ status: 'downloading', version: '0.3.1', percent: 1 });
  read.resolve({ status: 'ready', version: '0.3.0' });
  await pending;
  assert.equal(client.getSnapshot().state.version, '0.3.1');
  assert.equal(client.getSnapshot().state.status, 'downloading');
});

test('a failed restart reports existing feedback but an old failure cannot replace a new broadcast', async (t) => {
  let operation = deferred();
  const { client, emit, view } = await setup(t, { installUpdate: () => operation.promise });
  client.start();
  await Promise.resolve();
  emit({ status: 'ready' });
  let pending = client.install();
  operation.reject(Error('restart'));
  await pending;
  assert.equal(view().text, 'Não foi possível reiniciar para atualizar. Tente novamente.');
  operation = deferred();
  emit({ status: 'ready', version: '0.3.0' });
  pending = client.install();
  emit({ status: 'ready', version: '0.3.1' });
  operation.reject(Error('old restart'));
  await pending;
  assert.equal(client.getSnapshot().state.version, '0.3.1');
  assert.equal(client.getSnapshot().state.status, 'ready');
});

test('repeated starts subscribe once; disposal removes the listener and ignores all late work', async (t) => {
  const check = deferred();
  const { client, emit, counts } = await setup(t, { checkUpdates: () => check.promise });
  client.start();
  client.start();
  await Promise.resolve();
  assert.equal(counts().subscriptions, 1);
  let changes = 0;
  client.subscribe(() => changes++);
  const pending = client.check();
  client.dispose();
  client.dispose();
  const before = client.getSnapshot(),
    count = changes;
  emit({ status: 'ready' });
  check.resolve({ status: 'current' });
  await pending;
  client.start();
  client.close();
  await client.install();
  await client.check();
  assert.strictEqual(client.getSnapshot(), before);
  assert.equal(changes, count);
  assert.equal(counts().removed, 1);
});
