'use strict';
const fs = require('node:fs/promises'),
  fsSync = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const SIMILO_ORIGIN = 'https://similo-mn.surge.sh';

(async () => {
  const target = path.join(root, 'artifacts/similo-art');
  const localArt = path.join(root, 'games/similo/art');
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.join(target, 'v1'), { recursive: true });

  const themes = ['animals', 'history', 'tales', 'monsters', 'myths'];
  const files = {};
  if (fsSync.existsSync(localArt)) {
    await fs.cp(localArt, target, { recursive: true });
    for (const name of themes) {
      const file = 'v1/' + name + '.webp',
        bytes = await fs.readFile(path.join(target, file));
      files[file] = crypto.createHash('sha256').update(bytes).digest('hex');
    }
  } else {
    for (const name of themes) {
      const file = 'v1/' + name + '.webp';
      const response = await fetch(`${SIMILO_ORIGIN}/${file}`);
      if (!response.ok) {
        throw Error(`Failed to fetch Similo pack ${file}: HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(path.join(target, file), bytes);
      files[file] = crypto.createHash('sha256').update(bytes).digest('hex');
    }
  }

  const version = JSON.parse(
    await fs.readFile(path.join(root, 'electron/package.json'), 'utf8'),
  ).version;
  const source =
    process.env.GITHUB_SHA ||
    require('node:child_process')
      .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
      .trim();
  await fs.writeFile(
    path.join(target, 'version.json'),
    JSON.stringify({ version: 1, source, desktopVersion: version, files }, null, 2) + '\n',
  );
  console.log('Similo: five lossless portrait sheets prepared separately from the installer.');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
