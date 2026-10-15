'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const build = path.join(root, 'artifacts/native-audio');
const source = path.join(root, 'desktop/native-audio');
const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

function run(command, args, options = {}) {
  return spawnSync(command, args, {cwd: root, encoding: 'utf8', windowsHide: true, ...options});
}

function main() {
  if (process.platform !== 'win32') throw Error('O helper nativo precisa ser compilado no Windows.');

  const vswhere = path.join(programFilesX86, 'Microsoft Visual Studio/Installer/vswhere.exe');
  const found = run(vswhere, ['-all', '-products', '*', '-format', 'json', '-utf8']);
  if (found.error || found.status !== 0) {
    throw Error('Visual Studio Installer não encontrado. Instale Desenvolvimento para desktop com C++.');
  }
  const installations = JSON.parse(found.stdout).filter(instance => {
    const tools = path.join(instance.installationPath, 'VC/Tools/MSVC');
    return instance.isComplete && fs.existsSync(tools) && fs.readdirSync(tools).some(version =>
      fs.existsSync(path.join(tools, version, 'bin/Hostx64/x64/cl.exe')));
  }).sort((a, b) => b.installationVersion.localeCompare(a.installationVersion, 'en', {numeric: true}));
  const instance = installations[0];
  if (!instance) throw Error('Nenhum compilador MSVC x64 encontrado. No Visual Studio Installer, adicione Desenvolvimento para desktop com C++ e o Windows SDK.');

  const major = instance.installationVersion.split('.')[0];
  const year = {'16': '2019', '17': '2022', '18': '2026'}[major];
  if (!year) throw Error('Versão do Visual Studio ainda não suportada por este script: ' + major);
  const generator = `Visual Studio ${major} ${year}`;

  // A terminal opened before installation may not have CMake in PATH yet.
  const candidates = [
    'cmake',
    path.join(programFiles, 'CMake/bin/cmake.exe'),
    path.join(instance.installationPath, 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe')
  ];
  const cmake = candidates.find(candidate => {
    const result = run(candidate, ['--version']);
    const version = /^cmake version (\d+)\.(\d+)/m.exec(result.stdout || '');
    return result.status === 0 && version && (Number(version[1]) > 3 || Number(version[1]) === 3 && Number(version[2]) >= 24);
  });
  if (!cmake) throw Error('CMake 3.24 ou posterior não encontrado. Instale Ferramentas do CMake C++ para Windows.');

  console.log('Compilador: ' + instance.displayName);
  console.log('CMake: ' + cmake);
  const cacheFile = path.join(build, 'CMakeCache.txt');
  const cache = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile, 'utf8') : '';
  const cachedGenerator = /^CMAKE_GENERATOR:INTERNAL=(.*)$/m.exec(cache)?.[1].trim();
  // Reset only CMake's generated configuration when switching generators.
  const fresh = cachedGenerator && cachedGenerator !== generator ? ['--fresh'] : [];
  if (fresh.length) console.log('Substituindo configuração antiga: ' + cachedGenerator + ' → ' + generator);

  for (const args of [
    [...fresh, '-S', source, '-B', build, '-G', generator, '-A', 'x64', '-DCMAKE_GENERATOR_INSTANCE=' + instance.installationPath],
    ['--build', build, '--config', 'Release']
  ]) {
    const result = run(cmake, args, {stdio: 'inherit'});
    if (result.error) throw result.error;
    if (result.status !== 0) { process.exitCode = result.status || 1; return; }
  }
  const executable = path.join(build, 'Release/MN-Application-Audio.exe');
  if (!fs.existsSync(executable)) throw Error('A compilação terminou sem gerar o helper esperado: ' + executable);
  console.log('Helper pronto: ' + executable);
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
