'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtime = process.env.GODOT_BIN
  ? { binary: process.env.GODOT_BIN }
  : JSON.parse(fs.readFileSync(path.join(root, 'artifacts/godot-tools/runtime.json'), 'utf8'));
const env = { ...process.env };
if (runtime.data) {
  if (process.platform === 'win32') env.APPDATA = runtime.data;
  else env.XDG_DATA_HOME = runtime.data;
  env.XDG_CONFIG_HOME = path.join(root, 'artifacts/godot-tools/config');
  env.XDG_CACHE_HOME = path.join(root, 'artifacts/godot-tools/cache');
}
const game = path.join(root, 'games/atalaia'),
  web = path.join(root, 'artifacts/atalaia/web');
const gameVersion = /^config\/version="([^"]+)"/m.exec(
    fs.readFileSync(path.join(game, 'project.godot'), 'utf8'),
  )[1],
  source = process.env.GITHUB_SHA || 'local';
if (!/^\d+\.\d+\.\d+$/.test(gameVersion) || !/^(?:local|[a-f0-9]{40})$/.test(source))
  throw Error('Invalid Atalaia export identity.');
const executable = `atalaia-${gameVersion}-${source.slice(0, 12)}`;
fs.rmSync(web, { recursive: true, force: true });
fs.mkdirSync(web, { recursive: true });
const run = (args) =>
  execFileSync(runtime.binary, ['--headless', '--path', game, ...args], {
    env,
    stdio: 'inherit',
    timeout: 180000,
  });
run(['--editor', '--import']);
run(['--script', 'res://tests/verify.gd']);
run(['--script', 'res://tests/runtime_verify.gd', '--', '--qa']);
run(['--export-release', 'Web', path.join(web, executable + '.html')]);
fs.renameSync(path.join(web, executable + '.html'), path.join(web, 'index.html'));
for (const file of ['FONT-LICENSES.txt', 'GODOT-LICENSE.txt', 'GODOT-COPYRIGHT.txt'])
  fs.copyFileSync(path.join(game, file), path.join(web, file));
fs.writeFileSync(
  path.join(web, 'version.json'),
  JSON.stringify({
    game: 'atalaia',
    gameVersion,
    executable,
    desktopVersion: require('../electron/package.json').version,
    source,
  }) + '\n',
);
console.log('Atalaia web export ready at ' + web);
