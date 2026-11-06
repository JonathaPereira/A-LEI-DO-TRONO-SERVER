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


test('release profile selects the documented user journeys while keeping every core contract', () => {
  const fs = require('node:fs');
  const selection = list('--suite', 'browser', '--profile', 'release');
  assert.equal(selection.status, 0, selection.stderr);
  const release = JSON.parse(fs.readFileSync(path.join(root, 'tests/release.json'), 'utf8'));
  const suites = require('./suites.json');
  for (const suite of ['browser', 'desktop']) {
    const result = list('--suite', suite, '--profile', 'release');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/).sort(), [...release[suite]].sort());
    assert.equal(new Set(release[suite]).size, release[suite].length);
    assert(release[suite].length < suites[suite].length);
    assert(release[suite].every(file => suites[suite].includes(file)));
  }
  assert.equal(list('--suite', 'core', '--profile', 'release').stdout, list('--suite', 'core').stdout);
  assert.notEqual(list('--profile', 'unknown').status, 0);
  assert.notEqual(list('--suite', 'browser', '--profile', 'release', '--filter', 'application-call-browser').status, 0);
});
