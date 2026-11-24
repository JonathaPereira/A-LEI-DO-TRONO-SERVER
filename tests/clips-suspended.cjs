'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Windows installer and CI workflow do not bundle or prepare FFmpeg', () => {
  const pkg = JSON.parse(read('electron/package.json'));
  const extraResources = pkg.build?.extraResources || [];
  assert.equal(
    extraResources.some(
      (entry) =>
        /ffmpeg/i.test(String(entry.from || '')) ||
        /ffmpeg/i.test(String(entry.to || '')) ||
        (Array.isArray(entry.filter) && entry.filter.some((f) => /ffmpeg/i.test(String(f)))),
    ),
    false,
    'electron/package.json must not bundle FFmpeg in extraResources',
  );

  const workflow = read('.github/workflows/windows-app.yml');
  assert.doesNotMatch(workflow, /prepare-ffmpeg\.cjs/i);
  assert.doesNotMatch(workflow, /artifacts\/ffmpeg/i);
});

test('Electron main and preload suspend Clips and remove clip/replay IPCs and FFmpeg hooks', () => {
  const preload = read('electron/preload.cjs');
  assert.match(preload, /clipsSuspended:\s*true/);
  for (const api of [
    'prepareReplay',
    'replayCapability',
    'startNativeReplay',
    'pushNativeReplay',
    'clipNativeReplay',
    'stopNativeReplay',
    'onNativeReplay',
    'configureClips',
    'onClip',
    'chooseFolder',
    'saveClip',
  ]) {
    assert.doesNotMatch(
      preload,
      new RegExp(`\\b${api}\\b`),
      `electron/preload.cjs must not expose ${api}`,
    );
  }

  const main = read('electron/main.cjs');
  for (const token of [
    'ffmpeg',
    'replay-native',
    'clip-files',
    'mn:replay-',
    'mn:clips-configure',
    'mn:clip-save',
    'mn:folder',
    "'Clipar'",
  ]) {
    assert.equal(
      main.includes(token),
      false,
      `electron/main.cjs must not include removed clip token: ${token}`,
    );
  }
});

test('Application UI and voice runtime do not mount or expose Clips controls', () => {
  const shell = read('src/components/application/shell.tsx');
  const call = read('src/components/application/call.tsx');
  const resources = read('src/components/application/resources.tsx');
  const screenDialog = read('src/components/modals/screen-options-dialog.tsx');
  const voiceRuntime = read('src/lib/voice/runtime.ts');

  assert.equal(shell.includes('data-open-clips'), false);
  assert.equal(call.includes('data-open-clips'), false);
  assert.equal(resources.includes('data-open-clips'), false);
  assert.equal(resources.includes('clipToolbarNow'), false);
  assert.equal(resources.includes('ClipsDialog'), false);
  assert.equal(resources.includes('initializeClips'), false);
  assert.equal(screenDialog.includes('shareReplayHelp'), false);
  assert.equal(voiceRuntime.includes('TronoClips'), false);

  // Manual recording, soundboard and Remote PC remain intact
  assert.equal(resources.includes('initializeRecorder'), true);
  assert.equal(resources.includes('initializeSoundboard'), true);
  assert.equal(resources.includes('initializeRemotePc'), true);
});

test('Renderer build does not emit clips-pcm-worklet.js', () => {
  const prepareRenderer = read('scripts/prepare-renderer.cjs');
  const rendererTsconfig = read('tsconfig.renderer.json');
  assert.equal(prepareRenderer.includes('clips-pcm-worklet.js'), false);
  assert.equal(rendererTsconfig.includes('src/lib/clips/worklets'), false);
});

test('Test manifests exclude obsolete clip suites and include clips-suspended contract', () => {
  const suites = JSON.parse(read('tests/suites.json'));
  const release = JSON.parse(read('tests/release.json'));
  const allScheduled = [
    ...suites.core,
    ...suites.browser,
    ...suites.desktop,
    ...release.browser,
    ...release.desktop,
  ];
  const obsolete = allScheduled.filter(
    (file) => /^tests\/clips?-/i.test(file) && file !== 'tests/clips-suspended.cjs',
  );
  assert.deepEqual(obsolete, []);
  assert.ok(suites.core.includes('tests/clips-suspended.cjs'));
});
