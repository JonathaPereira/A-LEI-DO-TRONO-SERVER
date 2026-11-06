'use strict';
const path = require('node:path'),
  { prepareSite, DOWNLOAD_REPOSITORY } = require('./package-site.cjs'),
  { releaseInstaller } = require('./release-installer.cjs');
(async () => {
  const root = path.resolve(__dirname, '../..'),
    { version } = require('../../electron/package.json');
  const installerPath = await releaseInstaller({
    version,
    repository: DOWNLOAD_REPOSITORY,
    localPath:
      process.env.MN_INSTALLER_PATH ||
      path.join(root, 'artifacts/windows-app', `MN-Trono-${version}-Windows.exe`),
    cacheDir: path.join(root, 'artifacts/published-installer'),
  });
  const result = await prepareSite({ installerPath });
  console.log(
    `Site ${(result.siteBytes / 1024 / 1024).toFixed(1)} MiB; domínio de downloads ${(result.downloadSiteBytes / 1024 / 1024).toFixed(1)} MiB. O ZIP completo conserva o instalador atual.`,
  );
  console.log(
    'Publicar primeiro frontend/downloads/ no domínio de downloads e depois frontend/ disponibiliza a atualização: ' +
      result.url,
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
