'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { runGodot } = require('./godot-process.cjs');

const root = path.resolve(__dirname, '..');
const game = path.join(root, 'games/atalaia');
const web = path.join(root, 'artifacts/atalaia/web');
const ATALAIA_ORIGIN = 'https://atalaia-mn.surge.sh';

async function syncRemoteAtalaiaBuild() {
  const source = process.env.GITHUB_SHA || 'local';
  if (!/^(?:local|[a-f0-9]{40})$/.test(source)) {
    throw Error('Invalid Atalaia export identity.');
  }

  const versionRes = await fetch(`${ATALAIA_ORIGIN}/version.json`);
  if (!versionRes.ok) {
    throw Error(`Failed to fetch remote Atalaia metadata: HTTP ${versionRes.status}`);
  }
  const remoteMeta = await versionRes.json();
  const gameVersion = remoteMeta.gameVersion || '0.2.0';
  const remoteExec = remoteMeta.executable;
  if (!/^\d+\.\d+\.\d+$/.test(gameVersion) || !remoteExec) {
    throw Error('Invalid remote Atalaia metadata payload.');
  }

  const executable = `atalaia-${gameVersion}-${source.slice(0, 12)}`;
  fs.rmSync(web, { recursive: true, force: true });
  fs.mkdirSync(web, { recursive: true });

  const indexRes = await fetch(`${ATALAIA_ORIGIN}/index.html`);
  if (!indexRes.ok) {
    throw Error(`Failed to fetch remote Atalaia index.html: HTTP ${indexRes.status}`);
  }
  const indexHtml = (await indexRes.text()).split(remoteExec).join(executable);
  fs.writeFileSync(path.join(web, 'index.html'), indexHtml, 'utf8');

  for (const ext of ['js', 'wasm', 'pck']) {
    const assetRes = await fetch(`${ATALAIA_ORIGIN}/${remoteExec}.${ext}`);
    if (!assetRes.ok) {
      throw Error(`Failed to download Atalaia asset ${remoteExec}.${ext}: HTTP ${assetRes.status}`);
    }
    const bytes = Buffer.from(await assetRes.arrayBuffer());
    fs.writeFileSync(path.join(web, `${executable}.${ext}`), bytes);
  }

  for (const ext of [
    'png',
    'icon.png',
    'apple-touch-icon.png',
    'audio.worklet.js',
    'audio.position.worklet.js',
  ]) {
    const optRes = await fetch(`${ATALAIA_ORIGIN}/${remoteExec}.${ext}`);
    if (optRes.ok) {
      const bytes = Buffer.from(await optRes.arrayBuffer());
      fs.writeFileSync(path.join(web, `${executable}.${ext}`), bytes);
    }
  }

  for (const license of ['FONT-LICENSES.txt', 'GODOT-LICENSE.txt', 'GODOT-COPYRIGHT.txt']) {
    const licRes = await fetch(`${ATALAIA_ORIGIN}/${license}`);
    if (licRes.ok) {
      fs.writeFileSync(path.join(web, license), Buffer.from(await licRes.arrayBuffer()));
    } else {
      fs.writeFileSync(
        path.join(web, license),
        `Hosted by MENGAMES (${ATALAIA_ORIGIN}/${license})\n`,
        'utf8',
      );
    }
  }

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
  console.log(`Atalaia web build synced from ${ATALAIA_ORIGIN} (${executable}) at ${web}`);
}

if (!fs.existsSync(path.join(game, 'project.godot'))) {
  syncRemoteAtalaiaBuild().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
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
  const gameVersion = /^config\/version="([^"]+)"/m.exec(
      fs.readFileSync(path.join(game, 'project.godot'), 'utf8'),
    )[1],
    source = process.env.GITHUB_SHA || 'local';
  if (!/^\d+\.\d+\.\d+$/.test(gameVersion) || !/^(?:local|[a-f0-9]{40})$/.test(source))
    throw Error('Invalid Atalaia export identity.');
  const executable = `atalaia-${gameVersion}-${source.slice(0, 12)}`;
  const completionMarkers = {
    'res://tests/verify.gd': /RESULTADO: \d+ verificações, 0 falhas/,
    'res://tests/save_validation.gd': /Save validation: \d+ checks, 0 failures/,
    'res://tests/save_store.gd': /SAVE STORE: \d+ checks, 0 failures/,
    'res://tests/strategy.gd': /Strategic progression: \d+ checks, 0 failures/,
    'res://tests/profile_recovery.gd': /Strategic profile recovery: \d+ checks, 0 failures/,
    'res://tests/keyboard_controls.gd': /Keyboard controls: \d+ checks, 0 failures/,
    'res://tests/achievements.gd': /Local achievements: \d+ checks, 0 failures/,
    'res://tests/chronicle.gd': /Chronicle: \d+ checks, 0 failures/,
    'res://tests/economy_offers.gd': /Economy offers: \d+ checks, 0 failures/,
    'res://tests/crown_pulse.gd': /Crown pulse: \d+ checks, 0 failures/,
    'res://tests/slag_ward.gd': /Slag ward: \d+ checks, 0 failures/,
    'res://tests/march_aura.gd': /March aura: \d+ checks, 0 failures/,
    'res://tests/interference.gd': /Tower interference: \d+ checks, 0 failures/,
    'res://tests/campaign.gd': /CAMPANHA: victory/,
    'res://tests/runtime_verify.gd': /UI RESULTADO: 0 falha\(s\)/,
  };
  fs.rmSync(web, { recursive: true, force: true });
  fs.mkdirSync(web, { recursive: true });
  const run = (args) =>
    runGodot(runtime.binary, ['--headless', '--path', game, ...args], {
      env,
      timeout: 180000,
      expectedOutput: completionMarkers[args[args.indexOf('--script') + 1]],
    });
  run(['--editor', '--import']);
  run(['--script', 'res://tests/verify.gd']);
  run(['--script', 'res://tests/save_validation.gd']);
  run(['--script', 'res://tests/save_store.gd']);
  run(['--script', 'res://tests/strategy.gd', '--', '--qa']);
  run(['--script', 'res://tests/profile_recovery.gd', '--', '--qa']);
  run(['--script', 'res://tests/keyboard_controls.gd', '--', '--qa']);
  run(['--script', 'res://tests/achievements.gd', '--', '--qa']);
  run(['--script', 'res://tests/chronicle.gd', '--', '--qa']);
  run(['--script', 'res://tests/economy_offers.gd']);
  run(['--script', 'res://tests/interference.gd', '--', '--qa']);
  run(['--script', 'res://tests/march_aura.gd', '--', '--qa']);
  run(['--script', 'res://tests/crown_pulse.gd', '--', '--qa']);
  run(['--script', 'res://tests/slag_ward.gd', '--', '--qa']);
  run(['--script', 'res://tests/campaign.gd']);
  run(['--script', 'res://tests/campaign.gd', '--', '--chronicle', '--seed=78']);
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
}
