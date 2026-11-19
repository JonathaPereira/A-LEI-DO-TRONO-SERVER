'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

function collectTestFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(full, suffix));
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      results.push(path.relative(ROOT_DIR, full).replace(/\\/g, '/'));
    }
  }
  return results.sort();
}

function parseArgs(argv) {
  let layer = 'all';
  let filter = '';
  let retries = 0;
  let list = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') {
      list = true;
    } else if (arg === '--layer') {
      const value = argv[++i];
      if (!value || !['unit', 'integration', 'e2e', 'all'].includes(value)) {
        throw new Error(`Camada inválida para --layer: ${value || '(vazio)'}`);
      }
      layer = value;
    } else if (arg === '--filter') {
      filter = argv[++i] || '';
    } else if (arg === '--retries') {
      const parsed = Number.parseInt(argv[++i] || '', 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error('Valor inválido para --retries');
      }
      retries = parsed;
    } else {
      throw new Error(`Opção desconhecida: ${arg}`);
    }
  }

  return { layer, filter, retries, list };
}

function runNodeTestLayer(files) {
  if (!files.length) return 0;
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runE2eLayer(files, retries) {
  if (!files.length) return 0;
  const cli = require.resolve('@playwright/test/cli');
  const args = [cli, 'test', ...files];
  if (retries > 0) args.push(`--retries=${retries}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function main() {
  const { layer, filter, retries, list } = parseArgs(process.argv.slice(2));
  const pattern = filter ? new RegExp(filter, 'i') : null;

  const unitFiles = collectTestFiles(path.join(ROOT_DIR, 'tests/unit'), '.test.ts').filter(
    (file) => !pattern || pattern.test(file),
  );
  const integrationFiles = collectTestFiles(
    path.join(ROOT_DIR, 'tests/integration'),
    '.test.ts',
  ).filter((file) => !pattern || pattern.test(file));
  const e2eFiles = collectTestFiles(path.join(ROOT_DIR, 'tests/e2e'), '.spec.ts').filter(
    (file) => !pattern || pattern.test(file),
  );

  if (list) {
    const selected =
      layer === 'unit'
        ? unitFiles
        : layer === 'integration'
          ? integrationFiles
          : layer === 'e2e'
            ? e2eFiles
            : [...unitFiles, ...integrationFiles];
    console.log(selected.join('\n'));
    return 0;
  }

  if (layer === 'unit') {
    if (!unitFiles.length) throw new Error('Nenhum teste unitário encontrado em tests/unit.');
    return runNodeTestLayer(unitFiles);
  }
  if (layer === 'integration') {
    if (!integrationFiles.length) {
      throw new Error('Nenhum teste de integração encontrado em tests/integration.');
    }
    return runNodeTestLayer(integrationFiles);
  }
  if (layer === 'e2e') {
    if (!e2eFiles.length) throw new Error('Nenhum teste E2E encontrado em tests/e2e.');
    return runE2eLayer(e2eFiles, retries);
  }

  if (!unitFiles.length && !integrationFiles.length) {
    throw new Error('Nenhum teste encontrado em tests/unit ou tests/integration.');
  }
  const unitStatus = runNodeTestLayer(unitFiles);
  if (unitStatus !== 0) return unitStatus;
  return runNodeTestLayer(integrationFiles);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
