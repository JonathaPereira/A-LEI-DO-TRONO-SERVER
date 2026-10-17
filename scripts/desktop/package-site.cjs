'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
const DOWNLOAD_REPOSITORY = 'JonathaPereira/MN-Trono-Downloads';
const MAX_SITE_BYTES = 190 * 1024 * 1024;
async function filesIn(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await filesIn(file)));
    else result.push({ file, size: (await fs.stat(file)).size });
  }
  return result;
}
async function prepareSite({
  root = path.resolve(__dirname, '../..'),
  version,
  installerPath,
  outputRoot,
  repository = DOWNLOAD_REPOSITORY,
} = {}) {
  version ??= JSON.parse(
    await fs.readFile(path.join(root, 'electron/package.json'), 'utf8'),
  ).version;
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[-\w.]+\/[-\w.]+$/.test(repository))
    throw Error('Versão ou repositório de downloads inválido.');
  const filename = `MN-Trono-${version}-Windows.exe`,
    source = installerPath || path.join(root, 'artifacts/windows-app', filename);
  const bytes = await fs.readFile(source);
  if (bytes.length < 1024 * 1024 || bytes[0] !== 0x4d || bytes[1] !== 0x5a)
    throw Error('Instalador Windows inválido.');
  const hash = crypto.createHash('sha512').update(bytes).digest('base64'),
    url = `https://a-lei-do-trono.surge.sh/downloads/${filename}`;
  const artifacts = outputRoot || path.join(root, 'artifacts'),
    direct = path.join(artifacts, 'windows-download'),
    site = path.join(artifacts, 'site-download');
  await fs.rm(direct, { recursive: true, force: true });
  await fs.rm(site, { recursive: true, force: true });
  await fs.mkdir(direct, { recursive: true });
  await fs.copyFile(source, path.join(direct, filename));
  await fs.copyFile(
    path.join(root, 'electron/LEIA-ME-WINDOWS.txt'),
    path.join(direct, 'LEIA-ME-WINDOWS.txt'),
  );
  const frontend = path.join(site, 'frontend');
  await fs.cp(path.join(root, 'out'), frontend, {
    recursive: true,
    filter: (input) => {
      const relative = path.relative(path.join(root, 'out'), input),
        parts = relative.split(path.sep);
      return (
        !parts.includes('downloads') &&
        !parts.includes('node_modules') &&
        !/^(LEIA_ME_v|ATUALIZAR_v|AUDITORIA_PLAYTEST_v)/.test(relative) &&
        !/\.(exe|zip|tar|tgz)$/i.test(relative) &&
        relative !== path.join('manual', 'A_Lei_do_Trono_Manual_v0.4_Edicao_Visual.pdf')
      );
    },
  });
  const downloads = path.join(frontend, 'downloads');
  await fs.mkdir(downloads, { recursive: true });
  // Clear downloads on every package and include exactly one approved installer.
  await fs.copyFile(source, path.join(downloads, filename));
  const ignorePath = path.join(frontend, '.surgeignore'),
    ignore = await fs.readFile(ignorePath, 'utf8');
  await fs.writeFile(
    ignorePath,
    ignore
      .split(/\r?\n/)
      .filter((line) => !/^!downloads\/MN-Trono-.*-Windows\.exe$/.test(line))
      .join('\n')
      .trimEnd() +
      '\n!downloads/' +
      filename +
      '\n',
  );
  await fs.writeFile(
    path.join(downloads, 'latest.yml'),
    `version: ${version}\nfiles:\n  - url: ${filename}\n    sha512: ${hash}\n    size: ${bytes.length}\npath: ${filename}\nsha512: ${hash}\nreleaseDate: '${new Date().toISOString()}'\n`,
  );
  const index = await fs.readFile(path.join(frontend, 'index.html'), 'utf8');
  if (!/href="[^"]*MN-Trono-[^"/]+-Windows\.exe"/.test(index))
    throw Error('Link do instalador não encontrado no frontend.');
  await fs.writeFile(
    path.join(frontend, 'index.html'),
    index
      .replace(/href="[^"]*MN-Trono-[^"/]+-Windows\.exe"/g, 'href="' + url + '"')
      .replace(/download="MN-Trono-[^"]+\.exe"/g, 'download="' + filename + '"'),
  );
  await fs.copyFile(
    path.join(root, 'electron/LEIA-ME-PUBLICAR.txt'),
    path.join(site, 'LEIA-ME-PUBLICAR.txt'),
  );
  await fs.copyFile(
    path.join(root, 'docs/PUBLICAR_SURGE_LEVE.md'),
    path.join(site, 'PUBLICAR_SURGE_LEVE.md'),
  );
  await fs.copyFile(
    path.join(root, 'docs/ANALISE_SFU_E_JANELA_FLUTUANTE.md'),
    path.join(site, 'ANALISE_SFU_E_JANELA_FLUTUANTE.md'),
  );
  const numeric = (v) => v.split('.').map(Number),
    compare = (a, b) => {
      const x = numeric(a),
        y = numeric(b);
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    };
  const guides = (await fs.readdir(path.join(root, 'docs/archive')))
    .map((name) => ({ name, version: /^ATUALIZAR_WINDOWS_v(\d+\.\d+\.\d+)\.md$/.exec(name)?.[1] }))
    .filter((g) => g.version && compare(g.version, version) <= 0)
    .sort((a, b) => compare(b.version, a.version))
    .slice(0, 2);
  if (guides[0]?.version !== version)
    throw Error('Guia de publicação da versão atual não encontrado.');
  for (const guide of guides)
    await fs.copyFile(path.join(root, 'docs/archive', guide.name), path.join(site, guide.name));
  for (const file of ['upgrade-azul.sql', 'upgrade-splendor.sql'])
    await fs.copyFile(path.join(root, 'supabase', file), path.join(site, file));
  await fs.copyFile(
    path.join(root, 'supabase/migrations/20261016140000_giphy_profile_credits.sql'),
    path.join(site, '20261016140000_giphy_profile_credits.sql'),
  );
  const files = await filesIn(frontend),
    siteBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (
    files.some(
      (f) =>
        /\.(zip|tar|tgz)$/i.test(f.file) ||
        (/\.exe$/i.test(f.file) &&
          path.relative(frontend, f.file) !== path.join('downloads', filename)),
    ) ||
    siteBytes > MAX_SITE_BYTES
  )
    throw Error(
      `O pacote do site excedeu o limite preventivo de 190 MiB ou contém instaladores extras/arquivos compactados. Total: ${siteBytes} bytes; limite: ${MAX_SITE_BYTES} bytes.`,
    );
  const rogueliteBytes = files
    .filter((f) => path.relative(frontend, f.file).split(path.sep)[0] === 'roguelite')
    .reduce((sum, f) => sum + f.size, 0);
  await fs.writeFile(
    path.join(site, 'TAMANHO-E-DOWNLOAD.json'),
    JSON.stringify(
      {
        version,
        siteBytes,
        frontendWithoutInstallerBytes: siteBytes - bytes.length,
        rogueliteBytes,
        installerBytes: bytes.length,
        installerURL: url,
        sha512: hash,
        installerSHA256: crypto.createHash('sha256').update(bytes).digest('hex'),
      },
      null,
      2,
    ) + '\n',
  );
  return {
    version,
    frontend,
    direct,
    site,
    siteBytes,
    installerBytes: bytes.length,
    url,
    sha512: hash,
  };
}
module.exports = { prepareSite, DOWNLOAD_REPOSITORY, MAX_SITE_BYTES };
