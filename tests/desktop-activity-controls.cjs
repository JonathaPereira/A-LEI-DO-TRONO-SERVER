'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/desktop/activity.ts');
const appId = 'a'.repeat(64);
const otherAppId = 'b'.repeat(64);
const nativeState = (extra = {}) => ({
  available: true,
  enabled: true,
  game: null,
  apps: [],
  error: null,
  ...extra,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
async function setup(t, options = {}) {
  const { createDesktopActivity } = await modulePromise;
  const identities = new Set(),
    visibility = new Set(),
    messages = new Set(),
    nativeEvents = new Set(),
    saved = new Map(Object.entries(options.saved || {})),
    configurations = [],
    published = [];
  let account = options.account === undefined ? 'alice' : options.account,
    gameVisible = false,
    capability = true,
    reads = 0,
    changes = 0;
  const subscribe = (set) => (listener) => {
    set.add(listener);
    return () => set.delete(listener);
  };
  const emit = (set, value) => [...set].forEach((listener) => listener(value));
  const client = createDesktopActivity({
    readAccount: () => account,
    authReady: options.authReady || Promise.resolve(),
    readGame: () => gameVisible,
    subscribeIdentity: subscribe(identities),
    subscribeGameVisibility: subscribe(visibility),
    storage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: (key) => saved.delete(key),
    },
    network: {
      get gameActivitySupported() {
        return capability;
      },
      onMessage: subscribe(messages),
      setActivity: (activity) => published.push(activity),
    },
    native: {
      onActivity: subscribe(nativeEvents),
      getActivityState: () => {
        reads++;
        return options.read ? options.read() : Promise.resolve(nativeState());
      },
      configureActivity: (config) => {
        configurations.push(config);
        return options.configure
          ? options.configure(config)
          : Promise.resolve(nativeState({ enabled: config.enabled }));
      },
    },
  });
  const off = client.subscribe(() => changes++);
  t.after(() => {
    off();
    client.dispose();
  });
  return {
    client,
    saved,
    configurations,
    published,
    emit: (value) => emit(nativeEvents, value),
    receive: (value) => emit(messages, value),
    identity(value) {
      account = value;
      emit(identities);
    },
    game(value) {
      gameVisible = value;
      emit(visibility);
    },
    capability(value) {
      capability = value;
      emit(messages, { type: 'welcome' });
    },
    counts: () => ({ reads, changes }),
    listeners: () => [identities, visibility, messages, nativeEvents].map((set) => set.size),
  };
}

test('activity stays opt-in and preserves the existing device preference keys', async (t) => {
  const { client, saved, configurations, identity } = await setup(t);
  client.start();
  await flush();
  assert.equal(client.getSnapshot().enabled, false);
  assert.equal(configurations.at(-1).enabled, false);
  client.setEnabled(true);
  client.setPreferredApp(appId);
  client.setName('  Meu aplicativo  ');
  await flush();
  assert.equal(saved.get('mn-activity-enabled'), '1');
  assert.equal(saved.get('mn-activity-app'), appId);
  assert.equal(saved.get('mn-activity-name'), 'Meu aplicativo');
  assert.deepEqual(configurations.at(-1), {
    enabled: true,
    preferredAppId: appId,
    name: 'Meu aplicativo',
  });
  identity('bob');
  await flush();
  assert.equal(client.getSnapshot().enabled, true, 'device preference survives account changes');
  assert.equal(client.getSnapshot().preferredAppId, appId);
  client.setPreferredApp(otherAppId);
  assert.equal(client.getSnapshot().name, '', 'choosing another app resets its custom name');
  client.setPreferredApp(null);
  assert.equal(saved.has('mn-activity-app'), false);
});

test('saved preferences load safely and selecting an app validates its opaque ID', async (t) => {
  const { client, saved } = await setup(t, {
    saved: {
      'mn-activity-enabled': '1',
      'mn-activity-app': appId,
      'mn-activity-name': 'Nome salvo',
    },
  });
  client.start();
  await flush();
  assert.equal(client.getSnapshot().enabled, true);
  assert.equal(client.getSnapshot().preferredAppId, appId);
  assert.equal(client.getSnapshot().name, 'Nome salvo');
  for (const value of ['../game.exe', 'C:\\Games\\private.exe', 'bad', 42])
    client.setPreferredApp(value);
  assert.equal(client.getSnapshot().preferredAppId, appId);
  assert.equal(saved.get('mn-activity-app'), appId);
  client.setName('x'.repeat(120));
  assert.equal(client.getSnapshot().name.length, 80);
});

test('only an authenticated supported connection publishes names, never native metadata', async (t) => {
  const { client, published, emit, receive, capability, identity } = await setup(t, {
    saved: { 'mn-activity-enabled': '1' },
  });
  client.start();
  await flush();
  emit(
    nativeState({
      game: { name: 'Counter-Strike 2', startedAt: 123, pid: 999, path: 'C:\\secret' },
      apps: [{ id: appId, name: 'Counter-Strike 2', pid: 999, path: 'C:\\secret' }],
    }),
  );
  assert.equal(published.length, 0);
  receive({ type: 'auth-result', ok: true });
  assert.deepEqual(published.at(-1), { name: 'Counter-Strike 2' });
  assert(!JSON.stringify(client.getSnapshot()).includes('secret'));
  assert(!JSON.stringify(client.getSnapshot()).includes('pid'));
  assert(Object.isFrozen(client.getSnapshot()));
  assert(Object.isFrozen(client.getSnapshot().apps));
  capability(false);
  const count = published.length;
  emit(nativeState({ game: { name: 'Outro jogo', startedAt: 456 } }));
  assert.equal(published.length, count);
  capability(true);
  assert.deepEqual(published.at(-1), { name: 'Outro jogo' });
  receive({ type: 'connection', connected: false });
  const disconnectedCount = published.length;
  emit(nativeState({ game: { name: 'Sem conexão', startedAt: 789 } }));
  assert.equal(published.length, disconnectedCount);
  receive({ type: 'auth-result', ok: true });
  identity(null);
  assert.equal(published.at(-1), null);
  const loggedOutCount = published.length;
  receive({ type: 'auth-result', ok: true });
  emit(nativeState({ game: { name: 'Não deve aparecer', startedAt: 1000 } }));
  assert.equal(published.length, loggedOutCount);
  await flush();
});

test('a late auth result for the previous account cannot publish the new account activity', async (t) => {
  const { client, receive, identity, emit, published } = await setup(t, {
    saved: { 'mn-activity-enabled': '1' },
  });
  client.start();
  await flush();
  receive({ type: 'auth-result', ok: true, user: { id: 'alice' } });
  identity('bob');
  await flush();
  emit(nativeState({ game: { name: 'Atividade de Bob', startedAt: 1 } }));
  const count = published.length;
  for (const user of [{ id: 'alice' }, null, [], 'bob', { id: 42 }])
    receive({ type: 'auth-result', ok: true, user });
  assert.equal(published.length, count);
  receive({ type: 'auth-result', ok: true, user: { id: 'bob' } });
  assert.deepEqual(published.at(-1), { name: 'Atividade de Bob' });
});

test('the built-in game is a visible automatic fallback, never a manual or hidden activity', async (t) => {
  const { client, game, published, receive, emit } = await setup(t, {
    saved: { 'mn-activity-enabled': '1' },
  });
  client.start();
  await flush();
  receive({ type: 'auth-result', ok: true });
  game(true);
  assert.deepEqual(published.at(-1), { name: 'A Lei do Trono' });
  emit(nativeState({ game: { name: 'Jogo nativo', startedAt: 1 } }));
  assert.deepEqual(published.at(-1), { name: 'Jogo nativo' });
  emit(nativeState());
  game(false);
  assert.equal(published.at(-1), null);
  game(true);
  client.setPreferredApp(appId);
  await flush();
  assert.equal(published.at(-1), null);
  client.setPreferredApp(null);
  await flush();
  assert.deepEqual(published.at(-1), { name: 'A Lei do Trono' });
  client.setEnabled(false);
  assert.equal(published.at(-1), null);
});

test('malformed native payloads preserve confirmed state and snapshots copy only public fields', async (t) => {
  const { client, emit } = await setup(t);
  client.start();
  await flush();
  emit(nativeState({ apps: [{ id: appId, name: 'Aplicativo' }] }));
  const before = client.getSnapshot();
  for (const value of [
    null,
    [],
    'running',
    { available: true },
    nativeState({ available: 'yes' }),
    nativeState({ enabled: 1 }),
    nativeState({ game: { name: 42 } }),
    nativeState({ game: { name: 'Jogo', startedAt: Infinity } }),
    nativeState({ apps: [{ id: '../private.exe', name: 'App' }] }),
    nativeState({ apps: [{ id: appId, name: 42 }] }),
    nativeState({ apps: Array.from({ length: 129 }, () => ({ id: appId, name: 'App' })) }),
    nativeState({ error: { message: 'broken' } }),
  ])
    emit(value);
  assert.strictEqual(client.getSnapshot(), before);
  const source = nativeState({
    game: { name: 'Jogo', startedAt: 123 },
    apps: [{ id: appId, name: 'Aplicativo', path: 'C:\\private' }],
  });
  emit(source);
  source.game.name = 'Corrompido';
  source.apps[0].name = 'Corrompido';
  assert.equal(client.getSnapshot().currentGame.name, 'Jogo');
  assert.equal(client.getSnapshot().apps[0].name, 'Aplicativo');
  assert.deepEqual(Object.keys(client.getSnapshot().apps[0]).sort(), ['id', 'name']);
});

test('a native event supersedes a late initial read without overwriting newer game state', async (t) => {
  const initial = deferred(),
    configuration = deferred();
  const { client, emit } = await setup(t, {
    read: () => initial.promise,
    configure: () => configuration.promise,
  });
  client.start();
  await flush();
  emit(nativeState({ game: { name: 'Estado recente', startedAt: 2 } }));
  initial.resolve(nativeState({ game: { name: 'Leitura antiga', startedAt: 1 } }));
  await flush();
  assert.equal(client.getSnapshot().currentGame.name, 'Estado recente');
});

test('native broadcasts beat configure replies and failures from the same pending request', async (t) => {
  let pending = deferred();
  const { client, emit } = await setup(t, {
    saved: { 'mn-activity-enabled': '1' },
    configure: () => pending.promise,
  });
  client.start();
  await flush();
  emit(nativeState({ game: { name: 'Novo', startedAt: 2 } }));
  pending.resolve(nativeState({ game: { name: 'Antigo', startedAt: 1 } }));
  await flush();
  assert.equal(client.getSnapshot().currentGame.name, 'Novo');
  pending = deferred();
  client.setName('Outro nome');
  await flush();
  emit(nativeState({ game: { name: 'Mais recente', startedAt: 3 } }));
  pending.reject(Error('old native failure'));
  await flush();
  assert.equal(client.getSnapshot().currentGame.name, 'Mais recente');
  assert.equal(client.getSnapshot().error, null);
});

test('configuration serializes and coalesces rapid edits into the newest native intent', async (t) => {
  const first = deferred();
  let calls = 0;
  const { client, configurations } = await setup(t, {
    configure: (config) =>
      ++calls === 1 ? first.promise : Promise.resolve(nativeState({ enabled: config.enabled })),
  });
  client.start();
  await flush();
  client.setEnabled(true);
  client.setPreferredApp(appId);
  client.setName('Primeiro');
  client.setName('Último');
  assert.equal(configurations.length, 1, 'one native request is in flight');
  first.resolve(nativeState({ enabled: false }));
  await flush();
  assert.equal(configurations.length, 2);
  assert.deepEqual(configurations[1], {
    enabled: true,
    preferredAppId: appId,
    name: 'Último',
  });
  assert.equal(client.getSnapshot().configuring, false);
});

test('logout during an enabled request clears presence and eventually disables the native helper', async (t) => {
  const pending = deferred();
  let calls = 0;
  const { client, identity, receive, published, configurations } = await setup(t, {
    saved: { 'mn-activity-enabled': '1' },
    configure: (config) =>
      ++calls === 1 ? pending.promise : Promise.resolve(nativeState({ enabled: config.enabled })),
  });
  client.start();
  await flush();
  receive({ type: 'auth-result', ok: true });
  identity(null);
  assert.equal(published.at(-1), null);
  pending.resolve(nativeState({ game: { name: 'Old account game', startedAt: 1 } }));
  await flush();
  assert.equal(configurations.at(-1).enabled, false);
  assert.equal(client.getSnapshot().accountPresent, false);
  assert.equal(client.getSnapshot().currentGame, null);
  identity('bob');
  await flush();
  const count = published.length;
  receive({ type: 'game-state' });
  assert.equal(published.length, count, 'new account needs its own successful socket auth');
});

test('authentication readiness gates native configuration and disposal releases every subscription', async (t) => {
  const ready = deferred();
  const { client, listeners, counts, configurations, emit, receive, identity, game } = await setup(
    t,
    { authReady: ready.promise },
  );
  client.start();
  client.start();
  assert.deepEqual(listeners(), [1, 1, 1, 1]);
  assert.equal(configurations.length, 0);
  client.dispose();
  client.dispose();
  const before = client.getSnapshot(),
    changes = counts().changes;
  ready.resolve();
  await flush();
  client.start();
  client.setEnabled(true);
  client.setPreferredApp(appId);
  client.setName('Late');
  emit(nativeState({ game: { name: 'Late', startedAt: 1 } }));
  receive({ type: 'auth-result', ok: true });
  identity('bob');
  game(true);
  await flush();
  assert.deepEqual(listeners(), [0, 0, 0, 0]);
  assert.strictEqual(client.getSnapshot(), before);
  assert.equal(counts().changes, changes);
  assert.equal(configurations.length, 0, 'late auth readiness cannot reopen the helper');
});

test('disposal suppresses queued enabling requests after an old native request finishes', async (t) => {
  const pending = deferred();
  const { client, configurations } = await setup(t, { configure: () => pending.promise });
  client.start();
  await flush();
  assert.equal(configurations.length, 1);
  client.setEnabled(true);
  client.dispose();
  const before = client.getSnapshot();
  pending.resolve(nativeState({ enabled: false }));
  await flush();
  assert.strictEqual(client.getSnapshot(), before);
  assert(!configurations.slice(1).some((config) => config.enabled));
});

test('disposal after an in-flight opt-in serializes a final native opt-out', async (t) => {
  const pending = deferred();
  let calls = 0;
  const { client, configurations } = await setup(t, {
    saved: { 'mn-activity-enabled': '1' },
    configure: (config) =>
      ++calls === 1 ? pending.promise : Promise.resolve(nativeState({ enabled: config.enabled })),
  });
  client.start();
  await flush();
  assert.equal(configurations[0].enabled, true);
  client.dispose();
  pending.resolve(nativeState({ game: { name: 'Late opt-in', startedAt: 1 } }));
  await flush();
  assert.equal(configurations.length, 2);
  assert.equal(configurations[1].enabled, false);
});

test('a current configuration failure reports the existing feedback and a native update recovers', async (t) => {
  const { client, emit } = await setup(t, {
    saved: { 'mn-activity-enabled': '1' },
    configure: async () => {
      throw Error('unavailable bridge');
    },
  });
  client.start();
  await flush();
  assert.equal(client.getSnapshot().error, 'Não foi possível atualizar sua atividade.');
  assert.equal(client.getSnapshot().enabled, true);
  emit(nativeState({ game: { name: 'Recuperado', startedAt: 2 } }));
  assert.equal(client.getSnapshot().error, null);
  assert.equal(client.getSnapshot().currentGame.name, 'Recuperado');
});
