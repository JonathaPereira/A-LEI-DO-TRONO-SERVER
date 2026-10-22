'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { audioCapability } = require('../electron/application-audio.cjs');
const { DesktopActivity } = require('../electron/activity.cjs');
const packaging = require('../electron/package.json');
const { nativeHelperPath } = require('../electron/native-helper.cjs');

test('development audio and activity resolve the same helper that the desktop package consumes', () => {
  const resource = packaging.build.extraResources.find(
    (row) => row.to === 'native/MN-Application-Audio.exe',
  );
  assert(resource, 'native helper must remain part of the desktop package');
  const expected = path.resolve(__dirname, '../electron', resource.from);
  const activity = new DesktopActivity({ isPackaged: false }, () => {}, { available: false });
  try {
    assert.equal(audioCapability({ isPackaged: false }).executable, expected);
    assert.equal(activity.executable, expected);
    assert.equal(activity.child, null, 'resolving the helper must not start a process');
  } finally {
    activity.dispose();
  }
});

test('packaged helper stays under the executable resources, independently of the development folder', () => {
  const resources = path.join('C:', 'Program Files', 'MN Trono', 'resources');
  assert.equal(
    nativeHelperPath({ isPackaged: true }, resources),
    path.join(resources, 'native/MN-Application-Audio.exe'),
  );
});
