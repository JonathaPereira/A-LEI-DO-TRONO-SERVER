'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../src/lib/mobile/android-updates.ts');

test('compareSemver compares versions accurately and rejects malformed values', async () => {
  const { compareSemver } = await load();
  assert.equal(compareSemver('2.3.0', '2.2.9'), 1);
  assert.equal(compareSemver('android-v2.3.0', 'v2.3.0'), 0);
  assert.equal(compareSemver('2.2.9', '2.3.0'), -1);
  assert.equal(compareSemver('2.10.0', '2.3.0'), 1);
  assert.equal(compareSemver('invalid', '2.3.0'), null);
  assert.equal(compareSemver('2.3.0', '2.3'), null);
});

test('parseSha256Sums extracts exact matching lowercase SHA-256 and rejects invalid digests', async () => {
  const { parseSha256Sums, verifySha256Hex } = await load();
  const validHash = 'A'.repeat(64);
  const content = [
    `${'b'.repeat(64)}  other.apk`,
    `${validHash}  MN-Trono-2.3.0-Android.apk`,
  ].join('\n');

  assert.equal(parseSha256Sums(content, 'MN-Trono-2.3.0-Android.apk'), 'a'.repeat(64));
  assert.equal(parseSha256Sums(content, 'missing.apk'), null);
  assert.equal(parseSha256Sums('deadbeef  MN-Trono-2.3.0-Android.apk\n', 'MN-Trono-2.3.0-Android.apk'), null);

  assert.equal(verifySha256Hex(validHash, 'a'.repeat(64)), true);
  assert.equal(verifySha256Hex(validHash, 'c'.repeat(64)), false);
  assert.equal(verifySha256Hex('short', 'short'), false);
});

test('isAllowedUpdateUrl permits only allowlisted HTTPS hosts', async () => {
  const { isAllowedUpdateUrl } = await load();
  assert.equal(
    isAllowedUpdateUrl('https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases/download/android-v2.3.0/MN-Trono-2.3.0-Android.apk'),
    true,
  );
  assert.equal(isAllowedUpdateUrl('https://objects.githubusercontent.com/file.apk'), true);
  assert.equal(isAllowedUpdateUrl('https://release-assets.githubusercontent.com/file.apk'), true);
  assert.equal(isAllowedUpdateUrl('https://api.github.com/repos/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases'), true);
  assert.equal(isAllowedUpdateUrl('http://github.com/file.apk'), false);
  assert.equal(isAllowedUpdateUrl('https://evil.example.com/file.apk'), false);
  assert.equal(isAllowedUpdateUrl('https://user:pass@github.com/file.apk'), false);
  assert.equal(isAllowedUpdateUrl('file:///data/local/tmp/a.apk'), false);
});

test('selectAndroidRelease picks highest stable signed android-v* release newer than current version', async () => {
  const { selectAndroidRelease } = await load();
  const releases = [
    {
      tag_name: 'android-preview-v2.5.0-run-99',
      draft: false,
      prerelease: true,
      html_url: 'https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases/tag/android-preview-v2.5.0-run-99',
      assets: [
        { name: 'MN-Trono-2.5.0-Android-teste.apk', browser_download_url: 'https://github.com/preview.apk' },
        { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/preview-sums.txt' },
      ],
    },
    {
      tag_name: 'android-v2.3.0',
      draft: false,
      prerelease: false,
      html_url: 'https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases/tag/android-v2.3.0',
      assets: [
        { name: 'MN-Trono-2.3.0-Android.apk', browser_download_url: 'https://github.com/v2.3.0.apk' },
        { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/v2.3.0-sums.txt' },
      ],
    },
    {
      tag_name: 'android-v2.4.0',
      draft: true,
      prerelease: false,
      html_url: 'https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases/tag/android-v2.4.0',
      assets: [
        { name: 'MN-Trono-2.4.0-Android.apk', browser_download_url: 'https://github.com/v2.4.0.apk' },
        { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/v2.4.0-sums.txt' },
      ],
    },
    {
      tag_name: 'v2.9.0',
      draft: false,
      prerelease: false,
      html_url: 'https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases/tag/v2.9.0',
      assets: [
        { name: 'MN-Trono-Setup-2.9.0.exe', browser_download_url: 'https://github.com/win.exe' },
      ],
    },
  ];

  const picked = selectAndroidRelease(releases, '2.2.0');
  assert.ok(picked);
  assert.equal(picked.version, '2.3.0');
  assert.equal(picked.apkName, 'MN-Trono-2.3.0-Android.apk');
  assert.equal(picked.apkUrl, 'https://github.com/v2.3.0.apk');
  assert.equal(picked.checksumUrl, 'https://github.com/v2.3.0-sums.txt');

  assert.equal(selectAndroidRelease(releases, '2.3.0'), null);
  assert.equal(selectAndroidRelease(releases, '2.3.1'), null);
});

test('createAndroidUpdates manages check, download with SHA-256 progress, permission_required, install, and dispose', async () => {
  const { createAndroidUpdates, androidUpdatePresentation } = await load();
  const listeners = new Set();
  const calls = [];
  let state = { status: 'idle' };

  const emit = (next) => {
    state = next;
    for (const fn of listeners) fn(next);
  };

  const client = createAndroidUpdates({
    version: '2.2.0',
    getUpdateState: async () => state,
    onUpdateState: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    checkUpdates: async () => {
      calls.push('check');
      emit({ status: 'available', version: '2.3.0', sha256: 'a'.repeat(64) });
      return state;
    },
    downloadUpdate: async () => {
      calls.push('download');
      emit({ status: 'downloading', version: '2.3.0', percent: 50 });
      emit({ status: 'verifying', version: '2.3.0', percent: 100 });
      emit({ status: 'ready', version: '2.3.0', sha256: 'a'.repeat(64) });
      return state;
    },
    installUpdate: async () => {
      calls.push('install');
      if (calls.filter((c) => c === 'install').length === 1) {
        emit({
          status: 'permission_required',
          version: '2.3.0',
          message: 'Autorize instalar apps desconhecidos e toque em Instalar novamente.',
        });
        return { permissionRequired: true };
      }
      return { launched: true };
    },
    openUpdateDownload: async () => {
      calls.push('openDownload');
    },
  });

  try {
    client.start();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(client.getSnapshot().state.status, 'available');
    assert.equal(client.getSnapshot().visible, true);

    const availView = androidUpdatePresentation(client.getSnapshot());
    assert.match(availView.actionLabel, /Atualizar|Baixar/i);

    // Download + auto-install flow -> hits permission_required on first attempt
    await client.downloadAndInstall();
    assert.deepEqual(calls, ['check', 'download', 'install']);
    assert.equal(client.getSnapshot().state.status, 'permission_required');

    // User grants Unknown Sources permission and taps Install again without re-downloading
    await client.install();
    assert.deepEqual(calls, ['check', 'download', 'install', 'install']);

    client.dispose();
    assert.equal(listeners.size, 0);
  } finally {
    client.dispose();
  }
});

test('Android native manifest, FileProvider paths, and updater Java contracts enforce SHA-256 and installer flow', () => {
  const root = path.resolve(__dirname, '..');
  const manifest = fs.readFileSync(
    path.join(root, 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  const filePaths = fs.readFileSync(
    path.join(root, 'android/app/src/main/res/xml/file_paths.xml'),
    'utf8',
  );
  const plugin = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/br/com/mntrono/app/TronoAndroidPlugin.java'),
    'utf8',
  );
  const updaterPath = path.join(
    root,
    'android/app/src/main/java/br/com/mntrono/app/AndroidUpdater.java',
  );

  assert.match(manifest, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest, /androidx\.core\.content\.FileProvider/);
  assert.match(filePaths, /updates/);
  assert.equal(fs.existsSync(updaterPath), true, 'AndroidUpdater.java must exist');

  const updater = fs.readFileSync(updaterPath, 'utf8');
  assert.match(updater, /SHA-256/);
  assert.match(updater, /canRequestPackageInstalls/);
  assert.match(updater, /ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
  assert.match(updater, /FileProvider\.getUriForFile/);
  assert.match(updater, /application\/vnd\.android\.package-archive/);
  assert.match(plugin, /checkUpdates/);
  assert.match(plugin, /downloadUpdate/);
  assert.match(plugin, /installUpdate/);
  assert.match(plugin, /getAppInfo/);
});
