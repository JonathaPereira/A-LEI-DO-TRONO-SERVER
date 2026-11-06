'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
(async () => {
  const target = path.join(root, 'artifacts/similo-art');
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  await fs.cp(path.join(root, 'games/similo/art'), target, { recursive: true });
  const files = {};
  for (const name of ['animals', 'history', 'tales', 'monsters', 'myths']) {
    const file = 'v1/' + name + '.webp',
      bytes = await fs.readFile(path.join(target, file));
    files[file] = crypto.createHash('sha256').update(bytes).digest('hex');
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
