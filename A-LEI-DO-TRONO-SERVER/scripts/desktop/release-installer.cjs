'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
// A version already published is immutable. Rebuilding the same version must
// not produce a site manifest for different bytes under the existing URL.
async function releaseInstaller({ version, repository, localPath, cacheDir, fetchImpl = fetch }) {
  const filename = `MN-Trono-${version}-Windows.exe`,
    url = `https://github.com/${repository}/releases/download/v${version}/${filename}`;
  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/releases/tags/v${version}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN || process.env.GH_TOKEN
          ? { Authorization: 'Bearer ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) }
          : {}),
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (response.status === 404) return localPath;
  if (!response.ok) throw Error('Não foi possível conferir o instalador já publicado no GitHub.');
  const release = await response.json(),
    asset = release.assets?.find((a) => a.name === filename);
  if (
    release.draft ||
    release.tag_name !== 'v' + version ||
    !asset ||
    asset.browser_download_url !== url ||
    !/^sha256:[0-9a-f]{64}$/.test(asset.digest || '')
  )
    throw Error('A release publicada está sem o instalador correto ou sua identificação SHA-256.');
  const valid = (bytes) =>
    bytes.length === asset.size &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x5a &&
    'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex') === asset.digest;
  try {
    if (valid(await fs.readFile(localPath))) return localPath;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const download = await fetchImpl(url, { signal: AbortSignal.timeout(180000) });
  if (!download.ok) throw Error('Não foi possível baixar o instalador público.');
  const bytes = Buffer.from(await download.arrayBuffer());
  if (!valid(bytes))
    throw Error('O instalador público não corresponde ao tamanho/SHA-256 informado pelo GitHub.');
  await fs.mkdir(cacheDir, { recursive: true });
  const target = path.join(cacheDir, filename);
  await fs.writeFile(target, bytes);
  return target;
}
module.exports = { releaseInstaller };
