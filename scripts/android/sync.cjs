'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
if (!fs.existsSync(path.join(root, 'out/index.html')))
  throw Error('Execute npm run build antes de preparar o Android.');
const result = spawnSync(
  process.execPath,
  [require.resolve('@capacitor/cli/bin/capacitor'), 'sync', 'android'],
  { cwd: root, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status || 1);
// Android never embeds the Windows installer from the website distribution.
const assets = path.join(root, 'android/app/src/main/assets/public');
fs.rmSync(path.join(assets, 'downloads'), { recursive: true, force: true });
const testBackend = process.env.TRONO_ANDROID_TEST_BACKEND;
if (testBackend) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(testBackend))
    throw Error('Android test backend must be a loopback fixture.');
  const configuration = path.join(root, 'android/app/src/main/assets/capacitor.config.json');
  const config = JSON.parse(fs.readFileSync(configuration, 'utf8'));
  config.android.allowMixedContent = true;
  fs.writeFileSync(configuration, JSON.stringify(config));
  const boot = path.join(assets, 'auth-boot.js');
  fs.writeFileSync(
    boot,
    'window.TRONO_BACKEND_URL=' +
      JSON.stringify(testBackend) +
      ';\n' +
      fs.readFileSync(boot, 'utf8'),
  );
}
console.log(
  'Android assets prepared. Firebase and signing files are never copied into web assets.',
);
