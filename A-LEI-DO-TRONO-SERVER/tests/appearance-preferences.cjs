'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/profiles/appearance.ts');
async function setup(t) {
  const { createAppearancePreferences } = await modulePromise;
  const saved = new Map(), inline = new Map(), events = new EventTarget(), applied = [];
  let account = 'a', ready, blocked = false;
  const authReady = new Promise(resolve => ready = resolve);
  const client = createAppearancePreferences({
    storage: {
      getItem: key => { if (blocked) throw Error('blocked'); return saved.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw Error('blocked'); saved.set(key, value); },
      removeItem: key => { if (blocked) throw Error('blocked'); saved.delete(key); },
    },
    style: { removeProperty: key => inline.delete(key) }, events, authReady,
    accountId: () => account, applyTheme: theme => applied.push(theme),
  });
  t.after(client.dispose);
  const auth = value => { account = value; events.dispatchEvent(new Event('trono-auth-change')); };
  return { client, saved, inline, events, applied, ready, auth, block: () => blocked = true };
}
test('theme preferences are scoped by account and guest; invalid values use the default', async t => {
  const { client, saved, auth, applied } = await setup(t);
  saved.set('mnTheme:a', 'green'); saved.set('mnTheme:b', 'blue'); saved.set('mnTheme:guest', 'rose');
  client.start(); assert.equal(client.getSnapshot().theme, 'green');
  client.selectTheme('teal'); assert.equal(saved.get('mnTheme:a'), 'teal');
  assert.equal(client.getSnapshot().message, 'Tema aplicado.');
  auth('b'); assert.equal(client.getSnapshot().theme, 'blue'); assert.equal(client.getSnapshot().message, '');
  auth(null); assert.equal(client.getSnapshot().theme, 'rose'); client.selectTheme('orange');
  assert.equal(saved.get('mnTheme:guest'), 'orange'); assert.equal(saved.get('mnTheme:a'), 'teal');
  saved.set('mnTheme:b', '<script>'); auth('b'); assert.equal(applied.at(-1), 'purple');
});
test('panel reset clears only the retired inline dimensions and current account key', async t => {
  const { client, saved, inline, auth } = await setup(t); client.start();
  const dimensions = ['sidebar-width', 'sidebar-height', 'strip-height', 'chat-width', 'chat-height', 'people-width', 'people-height', 'center-height'];
  for (const dimension of dimensions) inline.set('--layout-' + dimension, '280px');
  inline.set('--layout-unknown', '42px'); inline.set('--theme-accent', 'red');
  saved.set('mnPanelLayout:a', '{}'); saved.set('mnPanelLayout:b', '{}'); saved.set('mnPanelLayout:guest', '{}');
  saved.set('mn-personal:a', '{"appLayout":"discord"}'); client.selectTheme('green');
  client.resetPanels();
  assert.equal(saved.has('mnPanelLayout:a'), false); assert.equal(saved.has('mnPanelLayout:b'), true);
  assert.equal(saved.get('mn-personal:a'), '{"appLayout":"discord"}'); assert.equal(saved.get('mnTheme:a'), 'green');
  assert.deepEqual([...inline], [['--layout-unknown', '42px'], ['--theme-accent', 'red']]);
  assert.deepEqual(client.getSnapshot(), { theme: 'green', message: 'Layout restaurado ao padrão.' });
  auth(null); client.resetPanels(); assert.equal(saved.has('mnPanelLayout:guest'), false); assert.equal(saved.has('mnPanelLayout:b'), true);
});
test('boot and account changes never hydrate inaccessible old geometry or delete stored preferences', async t => {
  const { client, saved, inline, auth } = await setup(t);
  saved.set('mnPanelLayout:a', '{"sidebar-width":400}'); inline.set('--layout-sidebar-width', '400px');
  client.start(); assert.equal(inline.has('--layout-sidebar-width'), false); assert.equal(saved.has('mnPanelLayout:a'), true);
  inline.set('--layout-chat-width', '400px'); auth('b');
  assert.equal(inline.size, 0); assert.equal(saved.has('mnPanelLayout:a'), true);
});
test('unavailable storage still applies themes and resets visible geometry', async t => {
  const { client, inline, block, applied } = await setup(t); block(); client.start();
  assert.equal(client.getSnapshot().theme, 'purple'); client.selectTheme('blue');
  assert.equal(applied.at(-1), 'blue'); inline.set('--layout-center-height', '320px'); client.resetPanels();
  assert.equal(inline.size, 0); assert.equal(client.getSnapshot().theme, 'blue');
});
test('auth readiness reads the current account, and disposal prevents late writes and subscriptions', async t => {
  const { client, saved, auth, ready, applied, inline } = await setup(t);
  client.start(); let changes = 0; client.subscribe(() => changes++);
  saved.set('mnTheme:b', 'graphite'); auth('b'); ready(); await Promise.resolve();
  assert.equal(client.getSnapshot().theme, 'graphite'); assert(Object.isFrozen(client.getSnapshot()));
  client.dispose(); const before = client.getSnapshot(), writes = applied.length, count = changes;
  inline.set('--layout-chat-width', '400px'); auth('a'); client.start(); client.selectTheme('red'); client.resetPanels();
  assert.strictEqual(client.getSnapshot(), before); assert.equal(applied.length, writes); assert.equal(changes, count);
  assert.equal(inline.get('--layout-chat-width'), '400px');
});
test('repeated starts and unchanged snapshots do not duplicate preference subscriptions', async t => {
  const { client, events, saved } = await setup(t);
  let registered = 0; const add = events.addEventListener.bind(events);
  events.addEventListener = (...args) => { registered++; return add(...args); };
  client.start(); client.start(); assert.equal(registered, 1);
  const before = client.getSnapshot(); events.dispatchEvent(new Event('trono-auth-change'));
  assert.strictEqual(client.getSnapshot(), before);
  saved.set('mnTheme:a', 'indigo'); events.dispatchEvent(new Event('trono-auth-change'));
  assert.notStrictEqual(client.getSnapshot(), before);
});
