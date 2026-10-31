'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { spawnSync } = require('node:child_process');
const TAG = 'autobuild-2026-10-31-12-59',
  NAME = 'ffmpeg-n8.1.3-27-g8dca1586f4-win64-lgpl-shared-8.1',
  SHA256 = '5cef7bc48e513f3cee7c881e8b2999d835541edb1846c3e89443a67f8f8556ab';
const URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${TAG}/${NAME}.zip`;
async function prepare() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw Error('FFmpeg da distribuição requer Windows x64.');
  const root = path.resolve(__dirname, '../..'),
    output = path.join(root, 'artifacts/ffmpeg'),
    archive = path.join(root, 'artifacts/ffmpeg-verified.zip'),
    staging = path.join(root, 'artifacts/ffmpeg-extract');
  await fs.mkdir(path.dirname(archive), { recursive: true });
  const response = await fetch(URL, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error('Não foi possível obter o FFmpeg fixado: ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length > 128 * 1048576 ||
    crypto.createHash('sha256').update(bytes).digest('hex') !== SHA256
  )
    throw Error('Integridade do pacote FFmpeg inválida.');
  await fs.writeFile(archive, bytes);
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  const result = spawnSync('tar', ['-xf', archive, '-C', staging], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) throw Error('Extração do FFmpeg falhou.');
  const source = path.join(staging, NAME);
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(path.join(output, 'bin'), { recursive: true });
  for (const name of await fs.readdir(path.join(source, 'bin'))) {
    if (/^(ffmpeg|ffprobe)\.exe$|\.dll$/i.test(name))
      await fs.copyFile(path.join(source, 'bin', name), path.join(output, 'bin', name));
  }
  await fs.copyFile(path.join(source, 'LICENSE.txt'), path.join(output, 'LICENSE-LGPL-3.txt'));
  await fs.copyFile(
    path.join(root, 'electron/ffmpeg-notices/GPL-3.txt'),
    path.join(output, 'LICENSE-GPL-3.txt'),
  );
  await fs.copyFile(
    path.join(root, 'electron/ffmpeg-notices/UPSTREAM.txt'),
    path.join(output, 'UPSTREAM.txt'),
  );
  await fs.writeFile(
    path.join(output, 'VERSION.json'),
    JSON.stringify({ version: NAME, source: '8dca1586f4', archive: URL, sha256: SHA256 }, null, 2) +
      '\n',
  );
  const probe = spawnSync(path.join(output, 'bin/ffmpeg.exe'), ['-hide_banner', '-encoders'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (probe.status !== 0 || !probe.stdout.includes('h264_nvenc'))
    throw Error('O FFmpeg verificado não oferece NVENC.');
  await fs.rm(staging, { recursive: true, force: true });
  await fs.rm(archive, { force: true });
  console.log(
    'FFmpeg LGPL compartilhado preparado; SHA-256 conferido. A disponibilidade física do NVENC é testada ao iniciar a captura.',
  );
}
if (require.main === module)
  prepare().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { URL, SHA256 };
