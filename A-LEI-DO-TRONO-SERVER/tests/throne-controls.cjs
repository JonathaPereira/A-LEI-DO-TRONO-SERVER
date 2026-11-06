'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modulePromise = import('../src/lib/games/throne-controls.ts');
async function fixture() {
  const { createThroneControls } = await modulePromise;
  let source = { key: 'user:a:room', mode: 'local' },
    confirm = () => true;
  let leaves = 0,
    manuals = 0,
    confirmations = 0;
  const listeners = new Set(),
    warnings = [];
  const c = createThroneControls({
    source: () => source,
    subscribeSource(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    confirmLeave() {
      confirmations++;
      return confirm();
    },
    leave() {
      leaves++;
    },
    openManual() {
      manuals++;
    },
    warn: (error) => warnings.push(error),
  });
  c.start();
  return {
    c,
    listeners,
    warnings,
    source(patch) {
      source = { ...source, ...patch };
      listeners.forEach((fn) => fn());
    },
    confirm(fn) {
      confirm = fn;
    },
    get leaves() {
      return leaves;
    },
    get manuals() {
      return manuals;
    },
    get confirmations() {
      return confirmations;
    },
  };
}
test('speed cycles locally, online always uses normal timing, and leaving online enables local controls again', async () => {
  const f = await fixture();
  assert.equal(f.c.getSnapshot().scale, 1);
  for (const scale of [0.38, 1.65, 1]) {
    f.c.cycleSpeed();
    assert.equal(f.c.getSnapshot().scale, scale);
  }
  f.c.setFast();
  assert.equal(f.c.getSnapshot().scale, 0.05);
  f.source({ mode: 'online' });
  f.c.cycleSpeed();
  f.c.setFast();
  assert.equal(f.c.getSnapshot().scale, 1);
  f.source({ mode: null });
  f.source({ mode: 'local' });
  f.c.cycleSpeed();
  assert.equal(f.c.getSnapshot().scale, 0.38);
  f.c.dispose();
});
test('clock and presence notifications retain rules and do not rerender controls; scope changes close rules', async () => {
  const f = await fixture();
  let updates = 0;
  f.c.subscribe(() => updates++);
  f.c.rules(true);
  const before = f.c.getSnapshot();
  for (let i = 0; i < 10; i++) f.source({});
  assert.equal(f.c.getSnapshot(), before);
  assert.equal(updates, 1);
  f.source({ key: 'user:b:room' });
  assert.equal(f.c.getSnapshot().rulesOpen, false);
  f.c.dispose();
});
test('leave requires confirmation, deduplicates clicks and releases the action after a rejection', async () => {
  const f = await fixture();
  let complete;
  f.confirm(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = f.c.leave();
  await f.c.leave();
  assert.equal(f.confirmations, 1);
  assert.equal(f.c.getSnapshot().leaving, true);
  complete(false);
  await pending;
  assert.equal(f.leaves, 0);
  assert.equal(f.c.getSnapshot().leaving, false);
  f.confirm(() => true);
  await f.c.leave();
  assert.equal(f.leaves, 1);
  f.c.dispose();
});
test('a late confirmation cannot leave a replacement match, identity ABA, hidden board or disposed controller', async () => {
  for (const action of ['match', 'identity', 'navigation', 'dispose']) {
    const f = await fixture();
    let complete;
    f.confirm(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = f.c.leave();
    if (action === 'match') {
      f.source({ mode: null });
      f.source({ mode: 'local' });
    }
    if (action === 'identity') {
      f.source({ key: 'b' });
      f.source({ key: 'user:a:room' });
    }
    if (action === 'navigation') f.source({ key: 'user:a:room:hidden' });
    if (action === 'dispose') f.c.dispose();
    complete(true);
    await pending;
    assert.equal(f.leaves, 0);
    f.c.dispose();
    assert.equal(f.listeners.size, 0);
  }
});
test('failed confirmations recover, idle cannot leave, and manual activation is synchronous', async () => {
  const f = await fixture();
  f.confirm(() => {
    throw new Error('cancelled by runtime');
  });
  await f.c.leave();
  assert.equal(f.c.getSnapshot().leaving, false);
  assert.equal(f.warnings.length, 1);
  f.source({ mode: null });
  await f.c.leave();
  assert.equal(f.confirmations, 1);
  f.c.openManual();
  assert.equal(f.manuals, 1);
  f.c.dispose();
  f.c.openManual();
  f.c.cycleSpeed();
  f.c.rules(true);
  assert.equal(f.manuals, 1);
  assert.equal(f.c.getSnapshot().rulesOpen, false);
});

test('manual failures report only to the same live table scope', async () => {
  const { createThroneControls } = await modulePromise;
  let reject,
    warnings = 0;
  const c = createThroneControls({
    source: () => ({ key: 'a', mode: 'local' }),
    subscribeSource: () => () => {},
    confirmLeave: () => true,
    leave() {},
    openManual: () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
    warn: () => warnings++,
  });
  c.start();
  c.openManual();
  reject(new Error('native viewer unavailable'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warnings, 1);
  c.openManual();
  c.dispose();
  reject(new Error('old viewer request'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warnings, 1);
});
