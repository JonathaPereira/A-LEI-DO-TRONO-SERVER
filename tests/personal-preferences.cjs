'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPersonalPreferences } = require('../src/lib/preferences/personal.ts');
function fixture() {
  const rows = new Map(),
    changes = [],
    reads = [];
  let owner = null;
  const storage = {
    getItem(key) {
      reads.push(key);
      return rows.get(key) ?? null;
    },
    setItem: (key, value) => rows.set(key, value),
  };
  const preferences = createPersonalPreferences({
    account: () => owner,
    storage: () => storage,
    changed: (key) => changes.push(key),
  });
  return {
    rows,
    reads,
    changes,
    storage,
    preferences,
    account: (value) => {
      owner = value;
    },
  };
}
test('preferences use the signed-in account, cache reads, and reload on an alice-bob-alice switch', () => {
  const f = fixture();
  f.rows.set(
    'mn-personal:alice',
    JSON.stringify({ appLayout: 'discord', workspaceHeaderCollapsed: true, 'volume:bob': 175 }),
  );
  f.rows.set('mn-personal:bob', JSON.stringify({ appLayout: 'original', 'volume:alice': 65 }));
  f.account('alice');
  assert.equal(f.preferences.get('appLayout'), 'discord');
  assert.equal(f.preferences.get('volume:bob'), 175);
  assert.equal(f.preferences.get('workspaceHeaderCollapsed'), true);
  assert.deepEqual(f.reads, ['mn-personal:alice']);
  f.account('bob');
  assert.equal(f.preferences.get('appLayout'), 'original');
  f.preferences.set('notifications', 'off');
  f.account('alice');
  assert.equal(f.preferences.get('notifications', 'mentions'), 'mentions');
  assert.equal(f.preferences.get('appLayout'), 'discord');
  assert.equal(JSON.parse(f.rows.get('mn-personal:bob')).notifications, 'off');
});
test('anonymous settings do not persist or emit changes and deletion keeps unrelated fields', () => {
  const f = fixture();
  f.preferences.set('appLayout', 'discord');
  assert.equal(f.rows.size, 0);
  assert.deepEqual(f.changes, []);
  f.account('alice');
  f.preferences.set('appLayout', 'discord');
  f.preferences.set('notifications', 'off');
  f.preferences.set('appLayout', undefined);
  assert.equal(f.preferences.get('appLayout', 'original'), 'original');
  assert.deepEqual(JSON.parse(f.rows.get('mn-personal:alice')), { notifications: 'off' });
  assert.deepEqual(f.changes, ['appLayout', 'notifications', 'appLayout']);
});
test('malformed values or unavailable storage keep session preferences usable and still notify consumers', () => {
  for (const raw of ['null', '[]', '7', '"value"', '{invalid']) {
    const f = fixture();
    f.account('alice');
    f.rows.set('mn-personal:alice', raw);
    assert.equal(f.preferences.get('appLayout', 'original'), 'original');
  }
  const f = fixture();
  f.account('alice');
  f.storage.getItem = () => {
    throw Error('blocked');
  };
  f.storage.setItem = () => {
    throw Error('quota');
  };
  f.preferences.set('workspaceHeaderCollapsed', true);
  assert.equal(f.preferences.get('workspaceHeaderCollapsed'), true);
  assert.deepEqual(f.changes, ['workspaceHeaderCollapsed']);
});
test('dictionary keys cannot mutate prototypes or leak inherited values into preferences', () => {
  const f = fixture();
  f.account('alice');
  assert.equal(f.preferences.get('toString', 'fallback'), 'fallback');
  f.preferences.set('__proto__', { injected: true });
  f.preferences.set('constructor', 'own-value');
  assert.equal(f.preferences.get('injected'), undefined);
  assert.equal(f.preferences.get('constructor'), 'own-value');
  assert.equal({}.injected, undefined);
  assert.deepEqual(JSON.parse(f.rows.get('mn-personal:alice')).__proto__, { injected: true });
});

test('native notification mute projection follows the account and exposes no other preferences', () => {
  const f = fixture();
  f.account('alice');
  f.preferences.set('mute:peer', true); f.preferences.set('mute:unmuted', false); f.preferences.set('volume:peer', 140);
  assert.deepEqual(f.preferences.mutedTargets(), ['peer']);
  f.account('bob'); assert.deepEqual(f.preferences.mutedTargets(), []);
  f.account('alice'); assert.deepEqual(f.preferences.mutedTargets(), ['peer']);
});
