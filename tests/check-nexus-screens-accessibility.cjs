'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const serverRoot = path.resolve(__dirname, '..');
const nexusRoot = path.resolve(serverRoot, '../PROJETO-NEXUS');
const godotBinary = path.join(
  serverRoot,
  'artifacts/godot-tools/editor/Godot_v4.6.3-stable_linux.x86_64'
);

// =============================================================================
// SUÍTE DE VALIDAÇÃO: TELAS E ACESSIBILIDADE DE PROJECT NEXUS
// Campanha, Evolução, Equipamentos, Vínculos, Teclado e Foco
// =============================================================================

// -----------------------------------------------------------------------------
// BATERIA 1: ESTRUTURA DAS TELAS NO HUB E ACESSIBILIDADE DE NAVEGAÇÃO
// -----------------------------------------------------------------------------

test('1.1 - Hub: presença das 4 telas (Campanha, Evolução, Equipamentos, Vínculos)', () => {
  const hubFile = path.join(nexusRoot, 'godot/scripts/hub.gd');
  assert(fs.existsSync(hubFile), 'Arquivo hub.gd deve existir');
  const hubContent = fs.readFileSync(hubFile, 'utf8');

  // Tela da Campanha
  assert(hubContent.includes('func _story()'), 'Tela da Campanha (_story) deve estar implementada');
  assert(hubContent.includes('func _mission_preparation()'), 'Preparação de missão com objetivos deve existir');

  // Tela de Evolução e Treinamento
  assert(hubContent.includes('func _progress()'), 'Tela de Evolução (_progress) deve estar implementada');
  assert(hubContent.includes('EQUIPE · NÍVEL'), 'Nível da equipe e XP devem constar na tela');
  assert(hubContent.includes('MAESTRIA'), 'Maestria individual I-III deve constar na tela');

  // Vínculos
  assert(hubContent.includes('Vínculos com o trio'), 'Visualização de vínculos deve constar na evolução/herói');
  assert(hubContent.includes('Três vitórias em dupla liberam +2 EN'), 'Bônus de vínculo deve estar documentado e visível');

  // Equipamentos e Oficina
  assert(hubContent.includes('func _equipment()'), 'Tela da Oficina/Equipamentos (_equipment) deve estar implementada');
  assert(hubContent.includes('func _gems()'), 'Tela de Engastes e Gemas (_gems) deve estar implementada');

  // Acessibilidade por teclado e foco
  assert(hubContent.includes('scroll.follow_focus = true'), 'Rolagem deve acompanhar o foco do teclado');
  assert(hubContent.includes('grab_focus()'), 'Controles devem transferir foco ao interagir');
  assert(hubContent.includes('_restore_collection_focus'), 'Restauração de foco e scroll deve existir');
});

test('1.2 - Configurações de teclado e acessibilidade no combate e menus', () => {
  const keyboardFile = path.join(nexusRoot, 'godot/scripts/keyboard_settings.gd');
  assert(fs.existsSync(keyboardFile), 'keyboard_settings.gd deve existir');
  const kbContent = fs.readFileSync(keyboardFile, 'utf8');

  assert(kbContent.includes('accessibility_name'), 'Botões de remapeamento devem ter accessibility_name');
  assert(kbContent.includes('app.keyboard.reset()'), 'Restauração padrão de teclas deve existir');

  const mainFile = path.join(nexusRoot, 'godot/scripts/main.gd');
  const mainContent = fs.readFileSync(mainFile, 'utf8');
  assert(mainContent.includes('var reduced_motion := false'), 'Modo de movimento reduzido deve existir');
  assert(mainContent.includes('func _set_reduced(enabled: bool)'), 'Alternância de acessibilidade visual deve existir');
});

const os = require('node:os');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-screens-'));

function runGodotSuite(suiteName, scriptPath) {
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
    ['--headless', '--audio-driver', 'Dummy', '--path', 'godot', '--script', scriptPath],
    {
      cwd: nexusRoot,
      env,
      encoding: 'utf8',
      timeout: 60000,
    }
  );
}

test('2.1 - Godot headless: Navegação, foco e persistência na Coleção (collection_navigation.gd)', () => {
  const output = runGodotSuite('collection_navigation', 'res://tests/collection_navigation.gd');
  assert(
    output.includes('Collection navigation: 30 checks, 0 failures.'),
    `collection_navigation.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

test('2.2 - Godot headless: Mapeamento de controles físicos de teclado (keyboard_controls.gd)', () => {
  const output = runGodotSuite('keyboard_controls', 'res://tests/keyboard_controls.gd');
  assert(
    output.includes('Keyboard controls: 25 checks, 0 failures.'),
    `keyboard_controls.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

test('2.3 - Godot headless: Sistema de Vínculos e bônus em dupla (bonds.gd)', () => {
  const output = runGodotSuite('bonds', 'res://tests/bonds.gd');
  assert(
    output.includes('Bonds: 12 checks, 0 failures.'),
    `bonds.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

test('2.4 - Godot headless: Oficina de Equipamentos e Especializações (equipment.gd)', () => {
  const output = runGodotSuite('equipment', 'res://tests/equipment.gd');
  assert(
    output.includes('Equipment progression: 51 checks, 0 failures.'),
    `equipment.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

test('2.5 - Godot headless: Nível de Equipe e Maestria Individual (mastery.gd)', () => {
  const output = runGodotSuite('mastery', 'res://tests/mastery.gd');
  assert(
    output.includes('Team level and hero mastery: 39 checks, 0 failures.'),
    `mastery.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

console.log('\n======================================================');
console.log('Sucesso! Telas e acessibilidade da campanha, evolução, equipamentos e vínculos 100% verificadas.');
console.log('======================================================');
