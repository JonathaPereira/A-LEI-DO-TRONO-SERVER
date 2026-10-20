'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClipPreferences, readClipSettings } = require('../src/lib/clips/preferences.ts');
const { createClipControls } = require('../src/components/clips/controls-runtime.ts');
const key = (code, modifiers = {}) => ({
  key: code,
  code,
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...modifiers,
});
function fixture() {
  const rows = new Map();
  const storage = {
    getItem: (name) => rows.get(name) ?? null,
    setItem: (name, value) => rows.set(name, value),
  };
  return { rows, storage, preferences: createClipPreferences(() => storage) };
}
test('version-two preferences keep quality, FPS, duration, flags and shortcut under the existing account key', () => {
  const f = fixture();
  f.rows.set(
    'tronoClips:alice',
    JSON.stringify({
      version: 2,
      quality: 'high',
      fps: 30,
      seconds: 120,
      auto: false,
      desktopAuto: false,
      shortcut: { code: 'F9', ctrl: false, shift: false, alt: false, meta: false },
    }),
  );
  f.preferences.setOwner('alice');
  assert.equal(f.preferences.getSnapshot().settings.quality, 'high');
  assert.equal(f.preferences.getSnapshot().settings.fps, 30);
  assert.equal(f.preferences.getSnapshot().settings.auto, false);
  assert.equal(f.preferences.getSnapshot().settings.desktopAuto, false);
  assert.equal(f.preferences.shortcutLabel(), 'F9');
  assert.equal(f.preferences.captureProfile(), null);
  f.preferences.setSetting('auto', true);
  assert.deepEqual(f.preferences.captureProfile(), { width: 2560, height: 1440, fps: 30 });
  assert.equal(JSON.parse(f.rows.get('tronoClips:alice')).seconds, 120);
  assert(Object.isFrozen(f.preferences.getSnapshot().settings));
  assert(Object.isFrozen(f.preferences.getSnapshot().settings.shortcut));
  assert(Object.isFrozen(f.preferences.getQuality()));
});
test('legacy settings retain their migration and malformed JSON or shortcut fields never break startup', () => {
  assert.equal(readClipSettings({ quality: 'high', fps: 30 }).fps, 60);
  assert.equal(readClipSettings({ quality: 'light' }).quality, 'balanced');
  assert.equal(readClipSettings({ version: 2, quality: null, fps: null }).quality, 'light');
  assert.equal(readClipSettings({ version: 2, quality: null, fps: null }).fps, 30);
  const f = fixture();
  for (const raw of [
    'null',
    '[]',
    '7',
    '"invalid"',
    '{bad-json',
    '{"version":2,"shortcut":{"code":42}}',
  ]) {
    f.rows.set('tronoClips:alice', raw);
    assert.doesNotThrow(() => f.preferences.setOwner('alice'));
    assert.equal(f.preferences.shortcutLabel(), 'Ctrl + Shift + X');
  }
  assert.equal(
    readClipSettings({ version: 2, shortcut: { code: 'KeyR', ctrl: true } }).shortcut.code,
    'KeyX',
  );
});
test('switching accounts cancels shortcut selection and never stores another account settings', () => {
  const f = fixture();
  f.preferences.setOwner('alice');
  f.preferences.setSetting('seconds', 15);
  f.preferences.beginShortcut();
  f.preferences.setOwner('bob');
  assert.equal(f.preferences.getSnapshot().choosingShortcut, false);
  assert.equal(f.preferences.getSnapshot().settings.seconds, 30);
  f.preferences.setSetting('quality', 'light');
  f.preferences.setOwner('alice');
  assert.equal(f.preferences.getSnapshot().settings.seconds, 15);
  assert.equal(f.preferences.getSnapshot().settings.quality, 'balanced');
  assert.equal(JSON.parse(f.rows.get('tronoClips:bob')).quality, 'light');
});
test('reserved shortcuts and Escape preserve the saved binding; editable, repeat and Windows-global events do not clip locally', () => {
  const f = fixture();
  f.preferences.setOwner('alice');
  f.preferences.beginShortcut();
  for (const event of [key('F5'), key('KeyR'), key('KeyZ', { ctrlKey: false }), key('F11')]) {
    assert.equal(f.preferences.handleKey(event, false, false), 'handled');
    assert.equal(f.preferences.getSnapshot().choosingShortcut, true);
    assert.equal(f.preferences.getSnapshot().settings.shortcut.code, 'KeyX');
  }
  assert.equal(f.preferences.handleKey(key('Escape'), false, false), 'handled');
  assert.equal(f.preferences.getSnapshot().choosingShortcut, false);
  f.preferences.beginShortcut();
  f.preferences.handleKey(key('KeyK'), false, false);
  assert.equal(f.preferences.shortcutLabel(), 'Ctrl + Shift + K');
  assert.equal(f.preferences.handleKey(key('KeyK'), false, false), 'clip');
  assert.equal(f.preferences.handleKey(key('KeyK'), true, false), null);
  assert.equal(f.preferences.handleKey(key('KeyK', { repeat: true }), false, false), null);
  assert.equal(f.preferences.handleKey(key('KeyK'), false, true), 'handled');
  assert.equal(f.preferences.handleKey(key('KeyK', { altKey: true }), false, false), null);
});
test('blocked storage keeps validated preferences for the current session with an explicit warning', () => {
  const f = fixture();
  f.storage.getItem = () => {
    throw Error('storage blocked');
  };
  f.preferences.setOwner('alice');
  f.storage.setItem = () => {
    throw Error('quota');
  };
  assert.doesNotThrow(() => f.preferences.setSetting('seconds', 60));
  assert.equal(f.preferences.getSnapshot().settings.seconds, 60);
  assert.match(f.preferences.getSnapshot().message, /nesta sessão/);
  const settings = f.preferences.getSnapshot().settings;
  for (const [name, value] of [
    ['quality', 'unknown'],
    ['fps', 120],
    ['seconds', -1],
    ['auto', 'false'],
  ])
    f.preferences.setSetting(name, value);
  assert.equal(f.preferences.getSnapshot().settings, settings);
  f.preferences.dispose();
  f.preferences.setSetting('seconds', 15);
  assert.equal(f.preferences.getSnapshot().settings, settings);
});
test('keyboard listener binds once, consumes shortcut capture before dialog Escape, and detaches on dispose', () => {
  const f = fixture();
  const doc = new EventTarget(),
    dialog = new EventTarget(),
    target = new EventTarget();
  doc.getElementById = () => dialog;
  target.document = doc;
  let clips = 0;
  target.TronoClips = {
    clip() {
      clips++;
    },
  };
  const controls = createClipControls(target, f.preferences);
  controls.bind();
  controls.bind();
  const press = (values) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), key('KeyX'), values);
    doc.dispatchEvent(event);
    return event;
  };
  assert.equal(press({}).defaultPrevented, true);
  assert.equal(clips, 1);
  f.preferences.beginShortcut();
  assert.equal(press({ key: 'Escape', code: 'Escape' }).defaultPrevented, true);
  assert.equal(f.preferences.getSnapshot().choosingShortcut, false);
  assert.equal(clips, 1);
  f.preferences.beginShortcut();
  dialog.dispatchEvent(new Event('close'));
  assert.equal(f.preferences.getSnapshot().choosingShortcut, false);
  controls.dispose();
  assert.equal(press({}).defaultPrevented, false);
  assert.equal(clips, 1);
});
test('account change or disposal invalidates a pending floating-window request without adding listeners', async () => {
  for (const invalidate of ['account', 'dispose']) {
    const f = fixture(),
      doc = new EventTarget(),
      target = new EventTarget();
    doc.getElementById = () => null;
    target.document = doc;
    let resolve,
      requested = 0,
      closed = 0;
    target.documentPictureInPicture = {
      requestWindow() {
        requested++;
        return new Promise((yes) => {
          resolve = yes;
        });
      },
    };
    const controls = createClipControls(target, f.preferences);
    controls.bind();
    const opening = controls.openFloating();
    await controls.openFloating();
    assert.equal(requested, 1);
    if (invalidate === 'account') f.preferences.setOwner('bob');
    else controls.dispose();
    resolve({
      close() {
        closed++;
      },
      get document() {
        assert.fail('obsolete window must not install DOM or listeners');
      },
    });
    await opening;
    assert.equal(closed, 1);
    controls.dispose();
  }
});
