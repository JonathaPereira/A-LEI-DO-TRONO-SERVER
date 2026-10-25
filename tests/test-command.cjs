'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const list = (...args) =>
  spawnSync(process.execPath, ['scripts/test.cjs', '--list', ...args], {
    cwd: root,
    encoding: 'utf8',
  });

test('test command selects only the requested public regression and rejects an empty selection', () => {
  const selected = list('--suite', 'core', '--filter', 'game-rules');
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(selected.stdout.trim().split(/\r?\n/), ['tests/game-rules.js']);
  const empty = list('--filter', 'a-test-that-does-not-exist');
  assert.notEqual(empty.status, 0);
  assert.match(empty.stderr, /Nenhum teste/);
});
