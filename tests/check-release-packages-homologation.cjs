'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nexusRoot = path.resolve(root, '../PROJETO-NEXUS');

// =============================================================================
// SUÍTE DE VALIDAÇÃO: HOMOLOGAÇÃO DE PACOTES FINAIS E AUSÊNCIA DE BLOQUEADORES
// Item 2596 da Operação Renascimento 1.0
// =============================================================================

// -----------------------------------------------------------------------------
// BATERIA 1: HOMOLOGAÇÃO DOS PACOTES WEB DOS TRÊS JOGOS
// -----------------------------------------------------------------------------

test('1.1 - Homologação do pacote Web de Cinzas do Abismo', () => {
  const rogueliteDir = path.join(root, 'public/roguelite');
  assert(fs.existsSync(rogueliteDir), 'Diretório public/roguelite deve existir');

  const requiredFiles = [
    'core.js',
    'game.js',
    'levels.js',
    'persistence.js',
    'renderer.js',
    'audio.js',
    'controller.js',
    'index.html',
    'asset-manifest.json',
  ];

  for (const f of requiredFiles) {
    const full = path.join(rogueliteDir, f);
    assert(fs.existsSync(full), `Arquivo essencial ${f} deve estar presente no pacote`);
    const stats = fs.statSync(full);
    assert(stats.size > 0, `Arquivo ${f} não pode estar vazio`);
  }
});

test('1.2 - Homologação do pacote Web exportado do Atalaia: Guardiões do Cristal', () => {
  const atalaiaWebDir = path.join(root, 'artifacts/atalaia/web');
  assert(fs.existsSync(atalaiaWebDir), 'Diretório artifacts/atalaia/web deve existir após build');

  const files = fs.readdirSync(atalaiaWebDir);
  assert(files.includes('index.html'), 'index.html deve existir em artifacts/atalaia/web');
  assert(files.some((f) => f.endsWith('.wasm') && fs.statSync(path.join(atalaiaWebDir, f)).size > 10 * 1024 * 1024), 'Binário WebAssembly compilado do Godot deve existir (> 10 MiB)');
  assert(files.some((f) => f.endsWith('.pck') && fs.statSync(path.join(atalaiaWebDir, f)).size > 10 * 1024 * 1024), 'Pacote de recursos PCK do Godot deve existir (> 10 MiB)');
  assert(files.some((f) => f.endsWith('.js') && fs.statSync(path.join(atalaiaWebDir, f)).size > 100 * 1024), 'Runtime JS do Godot deve existir (> 100 KiB)');
});

test('1.3 - Homologação do pacote Web exportado do Project Nexus', () => {
  const nexusZip = path.join(nexusRoot, 'artifacts/nexus-web.zip');
  assert(fs.existsSync(nexusZip), 'Arquivo nexus-web.zip deve existir após exportação');
  const zipStats = fs.statSync(nexusZip);
  assert(zipStats.size > 10 * 1024 * 1024, 'Pacote ZIP de Nexus deve conter assets completos (> 10 MiB)');

  const webGameDir = path.join(nexusRoot, 'artifacts/web-game');
  assert(fs.existsSync(webGameDir), 'Pasta artifacts/web-game deve existir');
  const indexHtml = path.join(webGameDir, 'index.html');
  assert(fs.existsSync(indexHtml), 'index.html deve existir em artifacts/web-game');
  const htmlText = fs.readFileSync(indexHtml, 'utf8');
  assert(htmlText.includes('lang="pt-BR"'), 'HTML do jogo deve estar em pt-BR');
  assert(htmlText.includes('window.NEXUS_PVP_SERVER'), 'PVP_SERVER deve estar configurado no HTML');
});

test('1.4 - Homologação do pacote Next.js e mono-repositório exportado', () => {
  const outDir = path.join(root, 'out');
  assert(fs.existsSync(outDir), 'Pasta out deve existir após next build');
  assert(fs.existsSync(path.join(outDir, 'index.html')), 'index.html estático deve existir');
  assert(fs.existsSync(path.join(outDir, '_next')), 'Assets compilados _next devem existir');
});

// -----------------------------------------------------------------------------
// BATERIA 2: AUSÊNCIA DE BLOQUEADORES CONHECIDOS E INTEGRIDADE DE REGRESSÕES
// -----------------------------------------------------------------------------

test('2.1 - Ausência de arquivos temporários órfãos de falha ou conflitos de merge', () => {
  const dirtyMarkers = ['<<<<<<<', '=======', '>>>>>>>'];
  const textCheckFiles = [
    'docs/RENASCIMENTO.md',
    'docs/COMPARACAO_RENASCIMENTO.md',
    'tests/suites.json',
  ];

  for (const f of textCheckFiles) {
    const content = fs.readFileSync(path.join(root, f), 'utf8');
    for (const marker of dirtyMarkers) {
      assert(!content.includes(marker), `Arquivo ${f} não pode conter marcadores de conflito ${marker}`);
    }
  }
});

test('2.2 - Homologação de todas as suítes de validação unificadas da Operação Renascimento', () => {
  const suitesPath = path.join(root, 'tests/suites.json');
  assert(fs.existsSync(suitesPath));
  const suites = JSON.parse(fs.readFileSync(suitesPath, 'utf8'));
  const coreList = suites.core || [];

  const renascimentoSuites = [
    'tests/check-balance-matrices.cjs',
    'tests/check-prolonged-sessions.cjs',
    'tests/check-profiles-achievements-remapping.cjs',
    'tests/check-menus-scenes-accessibility.cjs',
    'tests/check-persistence-systems.cjs',
    'tests/check-subsystems-content-audit.cjs',
    'tests/check-atalaia-audiovisual-fantasy.cjs',
    'tests/check-campaigns-manuals-comparative.cjs',
    'tests/check-nexus-boss-phases.cjs',
    'tests/check-nexus-screens-accessibility.cjs',
    'tests/check-nexus-animations-choreography.cjs',
    'tests/check-hardware-electron-resolutions.cjs',
  ];

  for (const s of renascimentoSuites) {
    assert(coreList.includes(s), `Suíte ${s} deve estar registrada em suites.json`);
    assert(fs.existsSync(path.join(root, s)), `Arquivo físico da suíte ${s} deve existir`);
  }
});

console.log('\n======================================================');
console.log('Sucesso! Homologação de pacotes finais e ausência de bloqueadores 100% aprovadas.');
console.log('======================================================');
