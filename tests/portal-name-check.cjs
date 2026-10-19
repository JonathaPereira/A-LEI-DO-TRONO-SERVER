'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(
  require('node:path').resolve(__dirname, '../src/legacy/portal.js'),
  'utf8',
);

function setup() {
  const events = new Map(),
    timers = new Map(),
    calls = [];
  const feedback = { textContent: '', classList: { toggle() {} } };
  let next = 0,
    read = async () => ({ available: true, message: 'Disponível' });
  const window = {
    TronoAuth: { user: { id: 'alice', nickname: 'Alice' }, guest: null },
    TronoNetwork: {
      checkName(name) {
        calls.push(name);
        return read();
      },
    },
    addEventListener(name, callback) {
      events.set(name, callback);
    },
  };
  vm.runInNewContext(source, {
    window,
    document: { getElementById: (id) => (id === 'portalNameAvailability' ? feedback : null) },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    console,
    setTimeout(callback) {
      timers.set(++next, callback);
      return next;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  return {
    window,
    calls,
    timers,
    feedback,
    portal: window.TronoPortal,
    identity(user) {
      window.TronoAuth.user = user;
      events.get('trono-auth-change')();
    },
    read(value) {
      read = value;
    },
  };
}

test('a queued name check cannot prompt for guest access after logout, including a callback already queued', async () => {
  const f = setup();
  f.portal.queueNameCheck('Alice');
  const callback = [...f.timers.values()][0];
  f.identity(null);
  assert.equal(f.timers.size, 0);
  await callback();
  assert.deepEqual(f.calls, []);
});

test('account ABA and a different owner invalidate the old scheduled name check', async () => {
  const f = setup();
  f.portal.queueNameCheck('Alice');
  const callback = [...f.timers.values()][0];
  f.identity({ id: 'bob', nickname: 'Bob' });
  f.identity({ id: 'alice', nickname: 'Alice' });
  await callback();
  assert.deepEqual(f.calls, []);
  f.portal.queueNameCheck('Alice');
  const changed = [...f.timers.values()][0];
  f.window.TronoAuth.user = { id: 'bob', nickname: 'Bob' };
  await changed();
  assert.deepEqual(f.calls, []);
});

test('current name checks still run and an old result cannot overwrite feedback after logout', async () => {
  const f = setup();
  f.portal.queueNameCheck('Alice');
  await [...f.timers.values()][0]();
  assert.deepEqual(f.calls, ['Alice']);
  assert.equal(f.feedback.textContent, 'Disponível');
  let finish;
  f.read(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.portal.queueNameCheck('Alice');
  const pending = [...f.timers.values()].at(-1)();
  f.identity(null);
  f.feedback.textContent = 'Entre na conta';
  finish({ available: true, message: 'Resultado antigo' });
  await pending;
  assert.equal(f.feedback.textContent, 'Entre na conta');
});
