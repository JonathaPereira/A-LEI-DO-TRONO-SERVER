'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const application = path.join(root, 'desktop', 'app');
const profile = path.join(root, 'artifacts', 'desktop-profile');
const helper = path.join(root, 'artifacts', 'native-audio', 'Release', 'MN-Application-Audio.exe');

let electron;
try {
  electron = require(path.join(application, 'node_modules', 'electron'));
} catch {
  console.error('Instale as dependências do desktop com: npm run desktop:install');
  process.exit(1);
}

fs.mkdirSync(profile, {recursive: true});
console.log('Iniciando M&N desktop com a interface local.');
console.log('Perfil de desenvolvimento: ' + profile);
console.log('Conexão: backend existente do projeto (mesmas contas e comunidade).');
if (!fs.existsSync(helper)) {
  console.log('Helper nativo ausente: áudio isolado por aplicativo e detecção de jogos indisponíveis.');
  console.log('Para habilitar, configure CMake / Visual C++ e execute: npm run desktop:build:native');
}

// Keep the development profile separate from the installed application's data.
// Caller arguments follow the fixed profile so an explicit override is possible.
const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [application, '--user-data-dir=' + profile, ...process.argv.slice(2)], {
  cwd: application,
  env,
  stdio: 'inherit'
});

child.on('error', error => {
  console.error('Não foi possível iniciar o desktop: ' + error.message);
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (child.exitCode === null) child.kill(signal); });
}
