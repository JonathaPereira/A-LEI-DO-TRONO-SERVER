'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/settings/controller.ts');

test('web validates stored selection and cannot select desktop-only topics', async () => {
  const { createSettingsController } = await modulePromise;
  const saved = [];
  const controller = createSettingsController(false, {
    getItem: () => 'capture',
    setItem: (...args) => saved.push(args),
  });
  assert.equal(controller.getSnapshot().topic, 'audio');
  controller.open('privacy');
  assert.deepEqual(controller.getSnapshot(), { open: true, topic: 'audio' });
  controller.select('video');
  controller.close();
  assert.deepEqual(controller.getSnapshot(), { open: false, topic: 'video' });
  assert.deepEqual(saved.at(-1), ['tronoVoiceSettingsTab', 'video']);
});

test('desktop files is a valid pane; closing/reopening retains the selected topic', async () => {
  const { createSettingsController } = await modulePromise;
  const controller = createSettingsController(true, { getItem: () => 'video', setItem() {} });
  assert.equal(controller.getSnapshot().topic, 'audio');
  controller.open('files');
  controller.toggle(false);
  controller.toggle(true);
  assert.deepEqual(controller.getSnapshot(), { open: true, topic: 'files' });
  controller.open('nonexistent');
  assert.equal(controller.getSnapshot().topic, 'audio');
});

test('one immutable snapshot is shared by navigation subscribers without duplicate notifications', async () => {
  const { createSettingsController } = await modulePromise;
  const controller = createSettingsController(false, { getItem: () => 'connection', setItem() {} });
  const states = [],
    remove = controller.subscribe(() => states.push(controller.getSnapshot()));
  const initial = controller.getSnapshot();
  controller.select('connection');
  assert.strictEqual(controller.getSnapshot(), initial);
  assert(Object.isFrozen(initial));
  controller.toggle();
  controller.open();
  assert.equal(states.length, 1);
  remove();
  controller.close();
  assert.equal(states.length, 1);
  assert.deepEqual(states[0], { open: true, topic: 'connection' });
});

test('web account and file settings remain available while the selected pane changes', async () => {
  const { createSettingsController } = await modulePromise;
  const controller = createSettingsController(false, { getItem: () => 'account', setItem() {} });
  assert.equal(controller.getSnapshot().topic, 'account');
  controller.open('account');
  controller.select('files');
  assert.deepEqual(controller.getSnapshot(), { open: true, topic: 'files' });
  controller.select('account');
  controller.close();
  assert.deepEqual(controller.getSnapshot(), { open: false, topic: 'account' });
});

test('resource actions have their own shared settings pane on web and desktop', async () => {
  const { createSettingsController } = await modulePromise;
  for (const desktop of [false, true]) {
    const c = createSettingsController(desktop, { getItem: () => null, setItem() {} });
    c.open('resources');
    assert.deepEqual(c.getSnapshot(), { open: true, topic: 'resources' });
  }
});
