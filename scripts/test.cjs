'use strict';
const { spawnSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const { existsSync } = require('node:fs');
const suites = require('../tests/suites.json');

function select(args) {
  let suite = 'core',
    filter = '',
    list = false;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === '--list') list = true;
    else if (option === '--suite' || option === '--filter') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Valor obrigatório: ' + option);
      if (option === '--suite') suite = value;
      else filter = value;
    } else throw new Error('Opção desconhecida: ' + option);
  }
  const selected = suite === 'all' ? Object.values(suites).flat() : suites[suite];
  if (!selected) throw new Error('Suíte desconhecida: ' + suite);
  const pattern = filter ? new RegExp(filter, 'i') : null;
  const files = selected.filter((file) => !pattern || pattern.test(file));
  if (!files.length) throw new Error('Nenhum teste corresponde à seleção.');
  return { files, list, suite };
}
function run(args) {
  const selection = select(args);
  if (selection.list) {
    console.log(selection.files.join('\n'));
    return 0;
  }
  if (selection.files.some((file) => suites.desktop.includes(file)) && process.platform !== 'win32')
    throw new Error(
      'A suíte desktop exige Windows e os recursos nativos descritos no guia de desenvolvimento.',
    );
  const env = { ...process.env };
  if (!env.CHROMIUM_EXECUTABLE_PATH && process.platform === 'win32') {
    const bundled = require('@playwright/test').chromium.executablePath();
    const chrome = join(
      env.ProgramFiles || 'C:\\Program Files',
      'Google/Chrome/Application/chrome.exe',
    );
    if (!existsSync(bundled) && existsSync(chrome)) env.CHROMIUM_EXECUTABLE_PATH = chrome;
  }
  if (env.CHROMIUM_EXECUTABLE_PATH && !env.AUTH_TEST_CHROMIUM)
    env.AUTH_TEST_CHROMIUM = env.CHROMIUM_EXECUTABLE_PATH;
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', ...selection.files],
    {
      cwd: resolve(__dirname, '..'),
      env,
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}
if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { select };
