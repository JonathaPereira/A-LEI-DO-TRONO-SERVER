'use strict';
const { spawnSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const { existsSync } = require('node:fs');
const os = require('node:os');
const suites = require('../tests/suites.json');

const GAME_TEST_PATTERN =
  /^tests\/(?:men-games-|lazy-games|similo-|atalaia|azul-|bot-names|court-|game-|love-letter-|nexus|roguelite-|splendor-|tabletop-audio|throne-|ticket-to-ride-|desktop-cinzas-runtime)/i;

function isGameTest(file) {
  return GAME_TEST_PATTERN.test(String(file || '').replace(/\\/g, '/'));
}

function defaultConcurrency(suite) {
  if (suite !== 'core') return 1;
  const cpus =
    typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.min(4, Math.max(1, cpus || 4));
}

function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value || parsed < 1) {
    throw new Error(`${label} inválida: ${value}`);
  }
  return parsed;
}

function parseNonNegativeInt(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value || parsed < 0) {
    throw new Error(`${label} inválida: ${value}`);
  }
  return parsed;
}

function select(args) {
  let suite = 'core',
    filter = '',
    profile = '',
    concurrency = null,
    retries = 0,
    excludeGames = false,
    list = false;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === '--list') list = true;
    else if (option === '--exclude-games') excludeGames = true;
    else if (
      option === '--suite' ||
      option === '--filter' ||
      option === '--profile' ||
      option === '--concurrency' ||
      option === '--retries'
    ) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Valor obrigatório: ' + option);
      if (option === '--suite') suite = value;
      else if (option === '--filter') filter = value;
      else if (option === '--profile') profile = value;
      else if (option === '--concurrency') concurrency = parsePositiveInt(value, 'Concorrência');
      else retries = parseNonNegativeInt(value, 'Tentativas extras');
    } else throw new Error('Opção desconhecida: ' + option);
  }
  if (profile && profile !== 'release') throw new Error('Perfil desconhecido: ' + profile);
  const release = profile ? require('../tests/release.json') : null;
  const selected = suite === 'all' ? Object.values(suites).flat() : suites[suite];
  if (!selected) throw new Error('Suíte desconhecida: ' + suite);
  const pattern = filter ? new RegExp(filter, 'i') : null;
  const files = selected.filter(
    (file) =>
      (!release ||
        suites.core.includes(file) ||
        Object.values(release).some((group) => group.includes(file))) &&
      (!excludeGames || !isGameTest(file)) &&
      (!pattern || pattern.test(file)),
  );
  if (!files.length) throw new Error('Nenhum teste corresponde à seleção.');
  return {
    files,
    list,
    suite,
    profile,
    excludeGames,
    retries,
    concurrency: concurrency ?? defaultConcurrency(suite),
  };
}
function spawnTests(files, selection, env) {
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      `--test-concurrency=${selection.concurrency}`,
      ...(env.CI ? ['--test-reporter=tap'] : []),
      ...files,
    ],
    {
      cwd: resolve(__dirname, '..'),
      env,
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runWithIsolation(selection, env) {
  const failed = [];
  for (const file of selection.files) {
    let status = spawnTests([file], selection, env);
    let attempts = 0;
    while (status !== 0 && attempts < selection.retries) {
      attempts++;
      console.log(
        `\n[retry ${attempts}/${selection.retries}] Reexecutando teste isolado: ${file}\n`,
      );
      status = spawnTests([file], selection, env);
    }
    if (status !== 0) failed.push(file);
  }
  if (failed.length) {
    console.error(`\nTestes com falha após isolamento (${failed.length}): ${failed.join(', ')}`);
    return 1;
  }
  return 0;
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
  const env = { ...process.env, MN_TEST_PROFILE: selection.profile };
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
  if (selection.retries > 0 && (selection.concurrency === 1 || selection.files.length === 1)) {
    return runWithIsolation(selection, env);
  }
  return spawnTests(selection.files, selection, env);
}
if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { select, isGameTest, GAME_TEST_PATTERN };
