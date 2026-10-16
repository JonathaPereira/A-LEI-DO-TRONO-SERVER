'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { prepareSite, MAX_SITE_BYTES } = require('../scripts/desktop/package-site.cjs');
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-site-'));
  for (const dir of [
    'out/downloads',
    'out/manual',
    'out/vendor/rnnoise',
    'electron',
    'supabase',
    'installer',
    'docs/archive',
  ])
    await fs.mkdir(path.join(root, dir), { recursive: true });
  for (const file of [
    'electron/LEIA-ME-WINDOWS.txt',
    'electron/LEIA-ME-PUBLICAR.txt',
    'docs/PUBLICAR_SURGE_LEVE.md',
    'docs/archive/ATUALIZAR_WINDOWS_v0.1.11.md',
    'docs/archive/ATUALIZAR_WINDOWS_v0.1.10.md',
    'docs/archive/ATUALIZAR_WINDOWS_v0.1.9.md',
    'docs/archive/ATUALIZAR_WINDOWS_v0.1.12.md',
    'supabase/upgrade-azul.sql',
    'supabase/upgrade-splendor.sql',
  ])
    await fs.writeFile(path.join(root, file), 'fixture');
  await fs.writeFile(
    path.join(root, 'out/index.html'),
    '<a id="authDesktopDownload" href="/downloads/MN-Trono-0.1.10-Windows.exe" download="MN-Trono-0.1.10-Windows.exe">Desktop</a>',
  );
  await fs.writeFile(path.join(root, 'out/LEIA_ME_v0.7.9.txt'), 'old instructions');
  await fs.writeFile(path.join(root, 'out/.surgeignore'), '*.exe\n*.zip\n');
  await fs.writeFile(
    path.join(root, 'out/manual/A_Lei_do_Trono_Manual_v0.9.0.pdf'),
    'current manual',
  );
  await fs.writeFile(
    path.join(root, 'out/manual/A_Lei_do_Trono_Manual_v0.4_Edicao_Visual.pdf'),
    'legacy manual',
  );
  await fs.writeFile(path.join(root, 'out/vendor/rnnoise/rnnoise.wasm'), 'model');
  const installerPath = path.join(root, 'installer/MN-Trono-0.1.11-Windows.exe'),
    bytes = Buffer.alloc(1024 * 1024 + 100, 5);
  bytes[0] = 0x4d;
  bytes[1] = 0x5a;
  await fs.writeFile(installerPath, bytes);
  await fs.writeFile(path.join(root, 'out/downloads/old.exe'), bytes);
  await fs.writeFile(path.join(root, 'out/accidental.zip'), bytes);
  return { root, installerPath, bytes };
}
test('Surge package contains the entire frontend and exactly the latest installer and a matching local update manifest; preserves native SHA-512', async () => {
  const f = await fixture();
  try {
    const result = await prepareSite({ ...f, version: '0.1.11' });
    assert(result.siteBytes < MAX_SITE_BYTES);
    assert.deepEqual(
      (await fs.readdir(result.site))
        .filter((n) => n.startsWith('ATUALIZAR_WINDOWS_'))
        .sort(),
      ['ATUALIZAR_WINDOWS_v0.1.10.md', 'ATUALIZAR_WINDOWS_v0.1.11.md'],
    );
    const index = await fs.readFile(path.join(result.frontend, 'index.html'), 'utf8');
    assert(index.includes('href="' + result.url + '"'));
    assert(index.includes('download="MN-Trono-0.1.11-Windows.exe"'));
    const yaml = await fs.readFile(path.join(result.frontend, 'downloads/latest.yml'), 'utf8');
    assert(yaml.includes('version: 0.1.11'));
    assert(yaml.includes('url: MN-Trono-0.1.11-Windows.exe'));
    assert(yaml.includes('path: MN-Trono-0.1.11-Windows.exe'));
    assert.equal(
      result.url,
      'https://a-lei-do-trono.surge.sh/downloads/MN-Trono-0.1.11-Windows.exe',
    );
    assert(
      yaml.includes('sha512: ' + crypto.createHash('sha512').update(f.bytes).digest('base64')),
    );
    assert(yaml.includes('size: ' + f.bytes.length));
    assert.deepEqual((await fs.readdir(path.join(result.frontend, 'downloads'))).sort(), [
      'MN-Trono-0.1.11-Windows.exe',
      'latest.yml',
    ]);
    assert.deepEqual(
      await fs.readFile(path.join(result.frontend, 'downloads/MN-Trono-0.1.11-Windows.exe')),
      f.bytes,
    );
    const ignore = await fs.readFile(path.join(result.frontend, '.surgeignore'), 'utf8');
    assert(ignore.includes('*.exe'));
    assert(ignore.includes('!downloads/MN-Trono-0.1.11-Windows.exe'));
    assert.equal(ignore.split('\n').filter((l) => l.startsWith('!downloads/')).length, 1);
    assert.equal(
      await fs.readFile(path.join(result.frontend, 'vendor/rnnoise/rnnoise.wasm'), 'utf8'),
      'model',
    );
    assert.equal(
      await fs.readFile(
        path.join(result.frontend, 'manual/A_Lei_do_Trono_Manual_v0.9.0.pdf'),
        'utf8',
      ),
      'current manual',
    );
    await assert.rejects(
      fs.stat(path.join(result.frontend, 'manual/A_Lei_do_Trono_Manual_v0.4_Edicao_Visual.pdf')),
    );
    await assert.rejects(fs.stat(path.join(result.frontend, 'accidental.zip')));
    await assert.rejects(fs.stat(path.join(result.frontend, 'LEIA_ME_v0.7.9.txt')));
    assert.deepEqual(
      await fs.readFile(path.join(result.direct, 'MN-Trono-0.1.11-Windows.exe')),
      f.bytes,
    );
    const report = JSON.parse(
      await fs.readFile(path.join(result.site, 'TAMANHO-E-DOWNLOAD.json'), 'utf8'),
    );
    assert.equal(report.installerURL, result.url);
    assert.equal(report.installerSHA256, crypto.createHash('sha256').update(f.bytes).digest('hex'));
    assert.equal(report.siteBytes, result.siteBytes);
    await fs.writeFile(path.join(result.frontend, 'downloads/forgotten.exe'), f.bytes);
    await prepareSite({ ...f, version: '0.1.11' });
    await assert.rejects(fs.stat(path.join(result.frontend, 'downloads/forgotten.exe')));
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});
test('an invalid executable or oversized frontend prevents a ready-to-publish result', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(f.installerPath, 'not an executable');
    await assert.rejects(prepareSite({ ...f, version: '0.1.11' }), /Instalador Windows inválido/);
    await fs.writeFile(f.installerPath, f.bytes);
    const large = await fs.open(path.join(f.root, 'out/large.bin'), 'w');
    await large.truncate(MAX_SITE_BYTES + 1);
    await large.close();
    await assert.rejects(prepareSite({ ...f, version: '0.1.11' }), /limite preventivo/);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});
test('a published version reuses its exact release installer when a rebuild has different bytes', async () => {
  const f = await fixture();
  try {
    const { releaseInstaller } = require('../scripts/desktop/release-installer.cjs'),
      version = '0.1.11',
      repository = 'JonathaPereira/MN-Trono-Downloads',
      url = `https://github.com/${repository}/releases/download/v${version}/MN-Trono-${version}-Windows.exe`,
      published = Buffer.from(f.bytes);
    published[8] = 9;
    const digest = 'sha256:' + crypto.createHash('sha256').update(published).digest('hex'),
      requests = [];
    const fetchImpl = async (target) => {
      requests.push(target);
      return target.startsWith('https://api.github.com/')
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              tag_name: 'v' + version,
              draft: false,
              assets: [
                {
                  name: 'MN-Trono-' + version + '-Windows.exe',
                  browser_download_url: url,
                  size: published.length,
                  digest,
                },
              ],
            }),
          }
        : { ok: true, arrayBuffer: async () => published };
    };
    const canonical = await releaseInstaller({
      version,
      repository,
      localPath: f.installerPath,
      cacheDir: path.join(f.root, 'canonical'),
      fetchImpl,
    });
    assert.notEqual(canonical, f.installerPath);
    assert.deepEqual(await fs.readFile(canonical), published);
    assert.deepEqual(await fs.readFile(f.installerPath), f.bytes);
    assert.equal(requests[1], url);
    const packageResult = await prepareSite({ ...f, installerPath: canonical, version });
    assert.equal(
      packageResult.sha512,
      crypto.createHash('sha512').update(published).digest('base64'),
    );
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});
test('a new release uses the approved local installer and a mismatched public download fails closed', async () => {
  const f = await fixture();
  try {
    const { releaseInstaller } = require('../scripts/desktop/release-installer.cjs'),
      options = {
        version: '0.1.11',
        repository: 'JonathaPereira/MN-Trono-Downloads',
        localPath: f.installerPath,
        cacheDir: path.join(f.root, 'canonical'),
      };
    assert.equal(
      await releaseInstaller({ ...options, fetchImpl: async () => ({ status: 404 }) }),
      f.installerPath,
    );
    const url =
      'https://github.com/JonathaPereira/MN-Trono-Downloads/releases/download/v0.1.11/MN-Trono-0.1.11-Windows.exe';
    await assert.rejects(
      releaseInstaller({
        ...options,
        fetchImpl: async (target) =>
          target.startsWith('https://api.github.com/')
            ? {
                ok: true,
                json: async () => ({
                  tag_name: 'v0.1.11',
                  draft: false,
                  assets: [
                    {
                      name: 'MN-Trono-0.1.11-Windows.exe',
                      browser_download_url: url,
                      size: f.bytes.length,
                      digest: 'sha256:' + 'a'.repeat(64),
                    },
                  ],
                }),
              }
            : { ok: true, arrayBuffer: async () => f.bytes },
      }),
      /não corresponde/,
    );
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});
