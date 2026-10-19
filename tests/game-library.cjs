'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const ready = import('../src/lib/games/library.ts');
test('library navigation delegates to the existing owners and reflects external game changes', async () => {
  const { createGameLibrary } = await ready;
  let destination = null,
    count = 0;
  const listeners = new Set(),
    calls = [],
    errors = [];
  const controller = createGameLibrary({
    read: () => destination,
    subscribeSource(fn) {
      count++;
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    navigate(value) {
      calls.push(value);
      destination = value;
    },
    warn: (error) => errors.push(error),
  });
  await controller.open('library');
  assert.deepEqual(calls, []);
  controller.start();
  controller.start();
  assert.equal(count, 1);
  for (const value of [
    'library',
    'throne',
    'azul',
    'roguelite',
    'splendor',
    'love-letter',
    'community',
    'home',
  ]) {
    await controller.open(value);
    assert.equal(controller.getSnapshot().destination, value);
  }
  destination = 'azul';
  listeners.forEach((fn) => fn());
  assert.equal(controller.getSnapshot().destination, 'azul');
  await controller.open('unknown');
  assert.equal(calls.length, 8);
  controller.dispose();
  await controller.open('library');
  assert.equal(calls.length, 8);
  assert.equal(listeners.size, 0);
  assert.deepEqual(errors, []);
});
test('a rejected navigation surfaces through the owner without inventing a destination', async () => {
  const { createGameLibrary } = await ready,
    errors = [];
  const controller = createGameLibrary({
    read: () => 'library',
    subscribeSource: () => () => {},
    navigate: async () => {
      throw new Error('Navigation failed');
    },
    warn: (error) => errors.push(error),
  });
  controller.start();
  await controller.open('azul');
  assert.equal(errors[0].message, 'Navigation failed');
  assert.equal(controller.getSnapshot().destination, 'library');
  controller.dispose();
});
