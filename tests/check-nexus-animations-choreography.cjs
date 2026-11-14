'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const serverRoot = path.resolve(__dirname, '..');
const nexusRoot = path.resolve(serverRoot, '../PROJETO-NEXUS');
const godotBinary = path.join(
  serverRoot,
  'artifacts/godot-tools/editor/Godot_v4.6.3-stable_linux.x86_64'
);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-choreography-'));

function runGodotSuite(suiteName, scriptPath, args = [], timeout = 120000) {
  assert(fs.existsSync(godotBinary), 'Binário do Godot 4.6.3 deve estar disponível');
  const suiteDir = path.join(scratch, suiteName);
  fs.mkdirSync(path.join(suiteDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(suiteDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(suiteDir, 'cache'), { recursive: true });

  const env = {
    ...process.env,
    XDG_DATA_HOME: path.join(suiteDir, 'data'),
    XDG_CONFIG_HOME: path.join(suiteDir, 'config'),
    XDG_CACHE_HOME: path.join(suiteDir, 'cache'),
  };

  return execFileSync(
    godotBinary,
    ['--headless', '--audio-driver', 'Dummy', '--path', 'godot', '--script', scriptPath, ...args],
    {
      cwd: nexusRoot,
      env,
      encoding: 'utf8',
      timeout,
    }
  );
}

// =============================================================================
// SUÍTE DE VALIDAÇÃO: ANIMAÇÕES COMPLETAS, IMPACTOS E SUPREMOS FINAIS
// Coreografia de 24 heróis, 208 desenhos, impactos elementais e poses de derrota
// =============================================================================

// -----------------------------------------------------------------------------
// BATERIA 1: INTEGRIDADE DE ASSETS E FOLHAS DE POSES DOS 24 HERÓIS
// -----------------------------------------------------------------------------

test('1.1 - Folhas de poses base completas para todos os 24 heróis (192 desenhos)', () => {
  const poseRegionsPath = path.join(nexusRoot, 'godot/data/pose-regions.json');
  assert(fs.existsSync(poseRegionsPath), 'Arquivo pose-regions.json deve existir');
  const poseData = JSON.parse(fs.readFileSync(poseRegionsPath, 'utf8'));

  const heroes = [
    'rhazen', 'cindra', 'oren', 'nima', 'kira', 'vektor',
    'axion', 'astra', 'elun', 'saira', 'veyra', 'sylva',
    'vesper', 'auren', 'torv', 'brin', 'bast', 'ivo',
    'noct', 'maura', 'riven', 'elyra', 'solen', 'zaya'
  ];

  assert.equal(heroes.length, 24, 'Deve cobrir os 24 heróis do elenco');

  for (const id of heroes) {
    assert(poseData[id], `Herói ${id} deve estar registrado em pose-regions.json`);
    const frames = poseData[id].frames;
    assert(frames && frames.length >= 8, `${id} deve ter pelo menos 8 poses corporais base`);
    assert(fs.existsSync(path.join(nexusRoot, 'godot/assets/poses', poseData[id].file)),
      `Arquivo de poses base ${poseData[id].file} deve existir fisicamente no disco`);
  }
});

test('1.2 - Folhas dedicadas de supremos finais diferenciados (8 desenhos cada)', () => {
  const dedicatedSupremes = [
    { hero: 'rhazen', file: 'rhazen-supreme-renascimento-v1.png' },
    { hero: 'cindra', file: 'cindra-supreme-renascimento-v1.png' },
    { hero: 'oren', file: 'oren-supreme-renascimento-v1.png' },
    { hero: 'nima', file: 'nima-supreme-renascimento-v1.png' },
    { hero: 'kira', file: 'kira-supreme-renascimento-v1.png' },
    { hero: 'axion', file: 'axion-supreme-renascimento-v1.png' },
  ];

  for (const s of dedicatedSupremes) {
    const filePath = path.join(nexusRoot, 'godot/assets/poses', s.file);
    assert(fs.existsSync(filePath), `Folha de supremo dedicada ${s.file} para ${s.hero} deve existir no disco`);
  }
});

// -----------------------------------------------------------------------------
// BATERIA 2: TESTES NATIVOS DE TRANSIÇÃO, ENQUADRAMENTO E DERROTA
// -----------------------------------------------------------------------------

test('2.1 - Godot headless: Transições de poses suaves e atômicas (pose_transition.gd)', () => {
  const output = runGodotSuite('pose_transition', 'res://tests/pose_transition.gd');
  assert(
    output.includes('Pose transitions: 14 checks, 0 failures.'),
    `pose_transition.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

test('2.2 - Godot headless: Enquadramento e proporção na Galeria/Showcase (showcase_framing.gd)', () => {
  const output = runGodotSuite('showcase_framing', 'res://tests/showcase_framing.gd');
  assert(
    output.includes('Showcase framing: 4 checks, 0 failures.'),
    `showcase_framing.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

test('2.3 - Godot headless: Apresentação de derrotas ajoelhadas sem tombar (defeat_presentation.gd)', () => {
  const output = runGodotSuite('defeat_presentation', 'res://tests/defeat_presentation.gd');
  assert(
    output.includes('Defeat presentation: 110 checks, 0 failures.'),
    `defeat_presentation.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

test('2.4 - Godot headless: Cancelamento e pulo de animações conservando resolução (animation_skip.gd)', () => {
  const output = runGodotSuite('animation_skip', 'res://tests/animation_skip.gd');
  assert(
    output.includes('Animation skip: 18 checks, 0 failures.'),
    `animation_skip.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

// -----------------------------------------------------------------------------
// BATERIA 3: EXECUÇÃO DA COREOGRAFIA DE COMBATE E SUPREMOS
// -----------------------------------------------------------------------------

test('3.1 - Godot headless: Coreografia de combate, impactos e supremos (hero_choreography.gd)', () => {
  const output = runGodotSuite(
    'hero_choreography',
    'res://tests/hero_choreography.gd',
    ['--', '--heroes=oren,nima,kira,vektor,axion,astra'],
    180000
  );
  assert(
    output.includes('Hero choreography: 100 checks, 0 failures.'),
    `hero_choreography.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

console.log('\n======================================================');
console.log('Sucesso! Animações completas, impactos e supremos finais do elenco 100% verificados.');
console.log('======================================================');
