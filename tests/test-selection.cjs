'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { planForChangedFiles } = require('../scripts/select-tests.cjs');

const root = path.resolve(__dirname, '..');

test('select-tests skips runtime suites when only documentation files change', () => {
  const plan = planForChangedFiles({ files: ['README.md', 'docs/architecture.md'] });
  assert.equal(plan.mode, 'docs-only');
  assert.equal(plan.docsOnly, true);
  assert.equal(plan.runCore, false);
  assert.equal(plan.browserMode, 'skip');
  assert.equal(plan.desktopMode, 'skip');
});

test('select-tests scopes browser tests and skips un-packaged desktop tests for pure UI/theme edits', () => {
  const plan = planForChangedFiles({
    files: [
      'src/styles/app-themes.css',
      'src/components/application/christmas-promo.tsx',
      'src/lib/profiles/appearance.ts',
    ],
  });
  assert.equal(plan.mode, 'selective');
  assert.equal(plan.runCore, true);
  assert.equal(plan.browserMode, 'filtered');
  assert.ok(plan.browserTests.includes('tests/christmas-theme-browser.js'));
  assert.ok(plan.browserTests.includes('tests/appearance-preferences-browser.cjs'));
  assert.ok(plan.browserTests.includes('tests/style-cascade-browser.cjs'));
  assert.equal(plan.desktopMode, 'skip');

  const dryRun = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--suite', 'browser', '--filter', plan.browserFilter],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const matched = dryRun.stdout.trim().split(/\r?\n/);
  assert.ok(matched.includes('tests/christmas-theme-browser.js'));
  assert.ok(!matched.includes('tests/similo-browser.cjs'));
});

test('select-tests activates affected voice browser and desktop suites together', () => {
  const plan = planForChangedFiles({ files: ['src/lib/voice/sfu.ts'] });
  assert.equal(plan.mode, 'selective');
  assert.equal(plan.browserMode, 'filtered');
  assert.equal(plan.desktopMode, 'filtered');
  assert.ok(plan.browserTests.includes('tests/voice-recovery-browser.cjs'));
  assert.ok(plan.desktopTests.includes('tests/application-call-desktop.cjs'));
});

test('select-tests falls back safely to full release validation on shared infra or unmapped files', () => {
  for (const files of [
    ['server/index.js'],
    ['electron/main.cjs'],
    ['package.json'],
    ['src/unknown/new-module.ts'],
    [],
  ]) {
    const plan = planForChangedFiles({ files });
    assert.equal(plan.mode, 'full');
    assert.equal(plan.runCore, true);
    assert.equal(plan.browserMode, 'release');
    assert.equal(plan.desktopMode, 'release');
  }
});

test('test command accepts explicit --concurrency and rejects invalid values', () => {
  const valid = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--concurrency', '4', '--filter', 'test-selection'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(valid.stdout.trim().split(/\r?\n/), ['tests/test-selection.cjs']);

  const invalid = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--concurrency', '0'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Concorrência inválida/);
});
