'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { planForChangedFiles } = require('../scripts/select-tests.cjs');
const { isGameTest } = require('../scripts/test.cjs');

const root = path.resolve(__dirname, '..');

test('select-tests skips runtime suites when only documentation files change', () => {
  const plan = planForChangedFiles({ files: ['README.md', 'docs/architecture.md'] });
  assert.equal(plan.mode, 'docs-only');
  assert.equal(plan.docsOnly, true);
  assert.equal(plan.includeGames, false);
  assert.equal(plan.runCore, false);
  assert.equal(plan.coreMode, 'skip');
  assert.equal(plan.browserMode, 'skip');
  assert.equal(plan.desktopMode, 'skip');
});

test('select-tests scopes core and browser tests cleanly and excludes games for pure UI/theme edits', () => {
  const plan = planForChangedFiles({
    files: [
      'src/styles/app-themes.css',
      'src/components/application/christmas-promo.tsx',
      'src/lib/profiles/appearance.ts',
    ],
  });
  assert.equal(plan.mode, 'selective');
  assert.equal(plan.includeGames, false);
  assert.equal(plan.runCore, true);
  assert.equal(plan.coreMode, 'filtered');
  assert.ok(plan.coreTests.includes('tests/appearance-preferences.cjs'));
  assert.ok(plan.coreTests.every((file) => !isGameTest(file)));
  assert.equal(plan.browserMode, 'filtered');
  assert.ok(plan.browserTests.includes('tests/christmas-theme-browser.js'));
  assert.ok(plan.browserTests.includes('tests/appearance-preferences-browser.cjs'));
  assert.ok(plan.browserTests.every((file) => !isGameTest(file)));
  assert.equal(plan.desktopMode, 'skip');

  const dryCore = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--suite', 'core', '--filter', plan.coreFilter],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(dryCore.status, 0, dryCore.stderr);
  const coreMatched = dryCore.stdout.trim().split(/\r?\n/);
  assert.ok(coreMatched.includes('tests/appearance-preferences.cjs'));
  assert.ok(coreMatched.every((file) => !isGameTest(file)));

  const dryBrowser = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--suite', 'browser', '--filter', plan.browserFilter],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(dryBrowser.status, 0, dryBrowser.stderr);
  const matched = dryBrowser.stdout.trim().split(/\r?\n/);
  assert.ok(matched.includes('tests/christmas-theme-browser.js'));
  assert.ok(!matched.includes('tests/similo-browser.cjs'));
});

test('select-tests activates affected voice tests without triggering games', () => {
  const plan = planForChangedFiles({ files: ['src/lib/voice/sfu.ts'] });
  assert.equal(plan.mode, 'selective');
  assert.equal(plan.includeGames, false);
  assert.equal(plan.coreMode, 'filtered');
  assert.ok(plan.coreTests.includes('tests/sfu-session.cjs'));
  assert.ok(plan.coreTests.every((file) => !isGameTest(file)));
  assert.equal(plan.browserMode, 'filtered');
  assert.equal(plan.desktopMode, 'filtered');
  assert.ok(plan.browserTests.includes('tests/voice-recovery-browser.cjs'));
  assert.ok(plan.desktopTests.includes('tests/application-call-desktop.cjs'));
});

test('select-tests keeps version-only release bumps lightweight and avoids unrelated call/game suites', () => {
  const plan = planForChangedFiles({
    files: ['electron/package.json', 'electron/LEIA-ME-WINDOWS.txt'],
    versionOnlyFiles: ['electron/package.json'],
  });
  assert.equal(plan.mode, 'selective');
  assert.equal(plan.includeGames, false);
  assert.equal(plan.coreMode, 'filtered');
  assert.ok(plan.coreTests.includes('tests/site-package.js'));
  assert.equal(plan.browserMode, 'skip');
  assert.equal(plan.desktopMode, 'filtered');
  assert.deepEqual(plan.desktopTests, ['tests/desktop-updates.js']);
});

test('select-tests isolates game tests to the affected game only', () => {
  const plan = planForChangedFiles({ files: ['src/components/games/similo-lobby.tsx'] });
  assert.equal(plan.mode, 'selective');
  assert.equal(plan.includeGames, true);
  assert.deepEqual(plan.coreTests, [
    'tests/similo-controller.cjs',
    'tests/similo-rules.cjs',
    'tests/similo-service.cjs',
  ]);
  assert.deepEqual(plan.browserTests, [
    'tests/similo-browser.cjs',
    'tests/similo-crowd-browser.cjs',
  ]);
  assert.equal(plan.desktopMode, 'skip');
});

test('select-tests falls back to platform suite (excluding games) on shared infra or unmapped files', () => {
  for (const files of [
    ['server/index.ts'],
    ['electron/main.cjs'],
    ['tsconfig.json'],
    ['src/unknown/new-module.ts'],
    [],
  ]) {
    const plan = planForChangedFiles({ files });
    assert.equal(plan.mode, 'platform');
    assert.equal(plan.includeGames, false);
    assert.equal(plan.runCore, true);
    assert.equal(plan.coreMode, 'platform');
    assert.equal(plan.browserMode, 'platform');
    assert.equal(plan.desktopMode, 'platform');
  }

  const explicitWithGames = planForChangedFiles({
    files: ['server/index.ts'],
    includeGames: true,
  });
  assert.equal(explicitWithGames.mode, 'full');
  assert.equal(explicitWithGames.includeGames, true);
  assert.equal(explicitWithGames.browserMode, 'release');
});

test('test command supports --exclude-games, --retries, and --concurrency validation', () => {
  const valid = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--concurrency', '4', '--retries', '1', '--filter', 'test-selection'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(valid.stdout.trim().split(/\r?\n/), ['tests/test-selection.cjs']);

  const noGames = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--suite', 'all', '--exclude-games'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(noGames.status, 0, noGames.stderr);
  const listed = noGames.stdout.trim().split(/\r?\n/);
  assert.ok(listed.includes('tests/auth.js'));
  assert.ok(listed.every((file) => !isGameTest(file)));

  const invalidConc = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--concurrency', '0'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.notEqual(invalidConc.status, 0);
  assert.match(invalidConc.stderr, /Concorrência inválida/);

  const invalidRetries = spawnSync(
    process.execPath,
    ['scripts/test.cjs', '--list', '--retries', '-1'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.notEqual(invalidRetries.status, 0);
  assert.match(invalidRetries.stderr, /Tentativas extras inválida/);
});
