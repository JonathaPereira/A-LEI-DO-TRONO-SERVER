'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  Engine,
  CARDS: CINZAS_CARDS,
  CHAPTERS: CINZAS_CHAPTERS,
  REGIONS: CINZAS_REGIONS,
  WEAPONS: CINZAS_WEAPONS,
  MONSTERS: CINZAS_MONSTERS,
  SPECIALS: CINZAS_SPECIALS,
  hordeTuning
} = require('../public/roguelite/core.js');

const AbyssPersistence = require('../public/roguelite/persistence.js');
const { Keyboard: CinzasKeyboard, Controller: CinzasController } = require('../public/roguelite/controller.js');
const { WEAPON_VARIANTS: CINZAS_VARIANTS, RUNES: CINZAS_RUNES, TERRAIN: CINZAS_TERRAIN } = require('../public/roguelite/levels.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS ' + name);
}

// Catálogo Atalaia
const atalaiaCatalogFile = path.resolve(__dirname, '../games/atalaia/scripts/catalog.gd');
const atalaiaContent = fs.readFileSync(atalaiaCatalogFile, 'utf8');
const ATALAIA_TOWERS = JSON.parse(atalaiaContent.match(/const TOWERS = (\{[\s\S]*?\n\})/)[1]);
const ATALAIA_ENEMIES = JSON.parse(atalaiaContent.match(/const ENEMIES = (\{[\s\S]*?\n\})/)[1]);
const ATALAIA_CARDS = JSON.parse(atalaiaContent.match(/const CARDS = (\[[\s\S]*?\n\])/)[1]);
const ROOT_GUARDIAN = JSON.parse(atalaiaContent.match(/const ROOT_GUARDIAN = (\{[\s\S]*?\})/)[1]);
const ATALAIA_MATRIARCH_BROOD = JSON.parse(atalaiaContent.match(/const MATRIARCH_BROOD = (\{[\s\S]*?\})/)[1]);
const ATALAIA_CITADEL_SENTINEL = JSON.parse(atalaiaContent.match(/const CITADEL_SENTINEL = (\{[\s\S]*?\})/)[1]);
const ATALAIA_SLAG_WARD = JSON.parse(atalaiaContent.match(/const SLAG_WARD = (\{[\s\S]*?\})/)[1]);
const ATALAIA_CROWN_PULSE = JSON.parse(atalaiaContent.match(/const CROWN_PULSE = (\{[\s\S]*?\})/)[1]);

// Crônica de Atalaia
const chronicleFile = path.resolve(__dirname, '../games/atalaia/scripts/chronicle.gd');
const chronicleContent = fs.readFileSync(chronicleFile, 'utf8');

// =============================================================================
// BATERIA 1: AUDITORIA DO SUBSISTEMA DE COMBATE, FÍSICA E ESTADOS
// =============================================================================

test('1.1 - Combate Cinzas: 6 pilares (dano, cadência, colisão, esquiva, resistência, estados)', () => {
  const engine = new Engine();
  engine.start({ mode: 'adventure', seed: 'combat-subsystem-audit', name: 'Lia' });
  const p = engine.player;

  // 1. Dano e cadência
  assert.equal(p.power, 1.0);
  assert.equal(p.weapon, 'blade');
  assert.equal(typeof p.attackCd, 'number');

  // 2. Colisão e física vertical
  p.y = 100;
  p.vy = 0;
  engine.update(1 / 60, {});
  assert(p.vy > 0, 'Gravidade deve acelerar o corpo para baixo');
  assert(p.y > 100, 'Posição Y deve aumentar na queda livre');

  // 3. Esquiva e invulnerabilidade
  assert.equal(p.dashTime, 0);
  engine.update(1 / 60, { dash: true });
  assert(p.dashTime > 0, 'Esquiva deve ativar tempo de avanço');
  assert(p.invuln >= 0.25, 'Esquiva deve conceder janela de invulnerabilidade');

  // 4. Resistência e multiplicador de dificuldade
  engine.difficulty = 'easy';
  p.hp = 100;
  p.invuln = 0;
  p.dashTime = 0;
  engine.hurtPlayer(20, 0, 'physical');
  assert.equal(p.hp, 86, 'Dificuldade fácil aplica 0.70x do dano (20 * 0.7 = 14 de dano sofrido)');

  // 5. Estados e controle de grupo
  p.invuln = 0;
  engine.hurtPlayer(10, 0, 'web');
  assert.equal(p.snare, 1.8, 'Dano por teia deve enredar o jogador por 1.8 segundos');
});

test('1.2 - Combate Atalaia: 12 inimigos, armaduras, velocidades e chefes com segundas fases', () => {
  assert.equal(Object.keys(ATALAIA_ENEMIES).length, 12, 'Atalaia deve conter exatamente 12 tipos de inimigos');
  for (const [id, enemy] of Object.entries(ATALAIA_ENEMIES)) {
    assert(enemy.hp > 0, `Inimigo ${id} deve ter vida positiva`);
    assert(enemy.speed >= 20 && enemy.speed <= 85, `Velocidade de ${id} deve estar entre 20 e 85`);
    assert(enemy.armor >= 0.0 && enemy.armor <= 0.35, `Armadura de ${id} deve estar balanceada`);
    assert(Number.isInteger(enemy.gold) && enemy.gold >= 0, `Ouro de ${id} deve ser inteiro não negativo`);
  }

  // Verificação dos gatilhos das 5 segundas fases
  assert.equal(ROOT_GUARDIAN.wave, 6);
  assert.deepEqual(ROOT_GUARDIAN.escorts, ['wolf', 'wolf']);
  assert.equal(ATALAIA_MATRIARCH_BROOD.wave, 12);
  assert.deepEqual(ATALAIA_MATRIARCH_BROOD.escorts, ['brood', 'brood']);
  assert.equal(ATALAIA_CITADEL_SENTINEL.wave, 18);
  assert.equal(ATALAIA_CITADEL_SENTINEL.bonusArmor, 0.15);
  assert.equal(ATALAIA_SLAG_WARD.wave, 24);
  assert.equal(ATALAIA_SLAG_WARD.radius, 105.0);
  assert.equal(ATALAIA_CROWN_PULSE.period, 7.0);
  assert.equal(ATALAIA_CROWN_PULSE.jamDuration, 0.8);
});

// =============================================================================
// BATERIA 2: AUDITORIA DO SUBSISTEMA DE CONTEÚDO E NÍVEIS
// =============================================================================

test('2.1 - Cinzas: integridade dos 25 capítulos das 5 regiões e 4 marcos de exploração', () => {
  assert.equal(CINZAS_CHAPTERS.length, 25, 'Cinzas deve conter exatamente 25 capítulos autorais');
  assert.equal(CINZAS_REGIONS.length, 5, 'Cinzas deve conter 5 regiões completas');

  const bossStages = [4, 9, 14, 19, 24]; // Capítulos 5, 10, 15, 20, 25
  for (let i = 0; i < 25; i++) {
    const chapter = CINZAS_CHAPTERS[i];
    assert(typeof chapter.name === 'string' && chapter.name.length > 0);
    assert(Number.isInteger(chapter.biome) && chapter.biome >= 0 && chapter.biome <= 4);
    if (bossStages.includes(i)) {
      assert.equal(chapter.boss, true, `Capítulo ${i + 1} deve ser de chefe de região`);
    }
  }

  // 4 marcos de exploração confirmados
  assert.equal(CINZAS_CHAPTERS[7].cacheId, 'eclipse-cache'); // Cap. 8 (índice 7)
  assert.equal(CINZAS_CHAPTERS[17].cacheName, 'Urna do degelo'); // Cap. 18 (índice 17)
  assert.equal(CINZAS_CHAPTERS[21].shrineName, 'Sino da vigília'); // Cap. 22 (índice 21)
  assert.equal(CINZAS_CHAPTERS[24].conductorName, 'Condutor do alvorecer'); // Cap. 25 (índice 24)
});

test('2.2 - Atalaia: 5 atos da Crônica (30 fases) e campanha clássica de 15 ondas', () => {
  const chroniclePhasesFile = path.resolve(__dirname, '../games/atalaia/data/chronicle-phases.json');
  const chronicleActs = JSON.parse(fs.readFileSync(chroniclePhasesFile, 'utf8'));

  assert.equal(chronicleActs.length, 5, 'Crônica deve conter exatamente 5 atos');
  const totalPhases = chronicleActs.reduce((acc, a) => acc + a.phases.length, 0);
  assert.equal(totalPhases, 30, 'Crônica deve conter exatamente 30 fases');

  // Cada ato possui 6 fases
  for (const act of chronicleActs) {
    assert(typeof act.act === 'string' && act.act.length > 0);
    assert.equal(act.phases.length, 6, `Ato ${act.act} deve conter 6 fases`);
    for (const phase of act.phases) {
      assert(typeof phase.name === 'string' && phase.name.length > 0);
      assert(Array.isArray(phase.deck) && phase.deck.length > 0);
    }
  }

  // 12 torretas de Atalaia: 6 básicas e 6 avançadas com herança de família
  assert.equal(Object.keys(ATALAIA_TOWERS).length, 12);
  const basicKeys = ['ballista', 'mortar', 'flame', 'tesla', 'ice', 'poison'];
  const advancedKeys = ['roots', 'harpoon', 'seismic', 'spectral', 'ash_forge', 'solar'];
  for (const k of basicKeys) assert(ATALAIA_TOWERS[k], `Torreta básica ${k} deve existir`);
  for (const k of advancedKeys) {
    assert(ATALAIA_TOWERS[k], `Torreta avançada ${k} deve existir`);
    assert(basicKeys.includes(ATALAIA_TOWERS[k].family), `Torreta avançada ${k} deve herdar de família básica válida`);
  }
});

// =============================================================================
// BATERIA 3: AUDITORIA DO SUBSISTEMA DE ECONOMIA, CARTAS E PROGRESSÃO
// =============================================================================

test('3.1 - Cinzas: 36 cartas de melhoria, 4 armas, 4 variantes do Legado e runas permanentes', () => {
  assert.equal(CINZAS_CARDS.length, 36, 'Cinzas deve conter exatamente 36 cartas');
  assert.equal(Object.keys(CINZAS_WEAPONS).length, 4, 'Cinzas deve conter 4 armas base');
  assert.equal(Object.keys(CINZAS_VARIANTS).length, 4, 'Cinzas deve conter 4 variantes táticas');
  assert.equal(Object.keys(CINZAS_RUNES).length, 2, 'Cinzas deve conter 2 runas permanentes');

  // Variantes e seus marcos
  assert.equal(CINZAS_VARIANTS.ash_blade.chapter, 5);
  assert.equal(CINZAS_VARIANTS.echo_bow.chapter, 10);
  assert.equal(CINZAS_VARIANTS.rift_hammer.chapter, 15);
  assert.equal(CINZAS_VARIANTS.frost_staff.chapter, 20);

  // Runas e seus marcos
  assert.equal(CINZAS_RUNES.frost.chapter, 20);
  assert.equal(CINZAS_RUNES.fire.chapter, 25);
});

test('3.2 - Atalaia: economia de ouro, árvores de especialização e 8 conquistas locais', () => {
  // Paridade econômica: 10 esqueletos (7g cada = 70g) compram 1 balista básica (70g)
  assert.equal(ATALAIA_ENEMIES.skeleton.gold, 7);
  assert.equal(ATALAIA_TOWERS.ballista.cost, 70);
  assert.equal(ATALAIA_ENEMIES.skeleton.gold * 10, ATALAIA_TOWERS.ballista.cost);

  // Cartas estratégicas
  assert.equal(ATALAIA_CARDS.length, 12, 'Atalaia deve possuir 12 cartas/doutrinas catalogadas');

  // Árvores estratégicas
  const strategyFile = path.resolve(__dirname, '../games/atalaia/scripts/strategy_progress.gd');
  const strategyCode = fs.readFileSync(strategyFile, 'utf8');
  assert(strategyCode.includes('const BRANCHES = {'));
  assert(strategyCode.includes('"engineering":'));
  assert(strategyCode.includes('"protection":'));
  assert(strategyCode.includes('"knowledge":'));
  assert(strategyCode.includes('const THRESHOLDS = [5,10]') || strategyCode.includes('THRESHOLDS = [5, 10]'));
});

// =============================================================================
// BATERIA 4: AUDITORIA DO SUBSISTEMA DE ÁUDIO, VISUAL E ACESSIBILIDADE
// =============================================================================

test('4.1 - Integridade física de assets no disco e conformidade com licenças', () => {
  // Fontes e licenças
  assert(fs.existsSync(path.resolve(__dirname, '../games/atalaia/FONT-LICENSES.txt')));
  assert(fs.existsSync(path.resolve(__dirname, '../games/atalaia/GODOT-LICENSE.txt')));
  assert(fs.existsSync(path.resolve(__dirname, '../games/atalaia/GODOT-COPYRIGHT.txt')));

  // Texturas de Atalaia
  assert(fs.existsSync(path.resolve(__dirname, '../games/atalaia/assets/icon.svg')));
  assert(fs.existsSync(path.resolve(__dirname, '../games/atalaia/assets/art/towers-v2.webp')));
  assert(fs.existsSync(path.resolve(__dirname, '../games/atalaia/assets/art/creatures-v2.webp')));
  assert(fs.existsSync(path.resolve(__dirname, '../games/atalaia/assets/art/crystal-core-v5.webp')));

  // Áudio de Atalaia
  for (const sound of ['click', 'card', 'ballista', 'mortar', 'defeat', 'victory', 'wave']) {
    assert(fs.existsSync(path.resolve(__dirname, `../games/atalaia/assets/audio/${sound}.ogg`)),
      `Áudio ${sound}.ogg deve existir no diretório de assets`);
  }

  // Arquivos frontend de Cinzas
  for (const file of ['index.html', 'style.css', 'core.js', 'game.js', 'renderer.js', 'audio.js', 'persistence.js', 'levels.js', 'controller.js']) {
    assert(fs.existsSync(path.resolve(__dirname, `../public/roguelite/${file}`)),
      `Arquivo ${file} deve existir em public/roguelite`);
  }
});

test('4.2 - Acessibilidade visual e sonora: tremor, efeitos reduzidos e volumes multicanal', () => {
  // Cinzas
  const gameJs = fs.readFileSync(path.resolve(__dirname, '../public/roguelite/game.js'), 'utf8');
  assert(gameJs.includes('reducedShake'), 'Cinzas deve ter controle para reducedShake');
  assert(gameJs.includes('sfx.levels('), 'Cinzas deve permitir ajuste independente de volume');

  // Atalaia
  const atalaiaMain = fs.readFileSync(path.resolve(__dirname, '../games/atalaia/scripts/main.gd'), 'utf8');
  assert(atalaiaMain.includes('ReducedEffects'), 'Atalaia deve possuir controle de efeitos reduzidos');
  assert(atalaiaMain.includes('sound.set_volume(bus,value)'), 'Atalaia deve ter ajuste contínuo de volume por canal');
});

// =============================================================================
// BATERIA 5: AUDITORIA DO SUBSISTEMA DE DADOS, ESTADO E RESILIÊNCIA
// =============================================================================

test('5.1 - Integridade de dados, atomicidade e isolamento de estado entre sessões', () => {
  // Teste de isolamento de nova partida em Cinzas
  const e1 = new Engine();
  e1.start({ mode: 'adventure', seed: 'audit-run-1' });
  e1.score = 5000;
  e1.kills = 80;

  const e2 = new Engine();
  e2.start({ mode: 'adventure', seed: 'audit-run-2' });
  assert.equal(e2.score, 0, 'Nova instância de Engine não deve herdar pontuação da anterior');
  assert.equal(e2.kills, 0, 'Nova instância de Engine não deve herdar abates da anterior');

  // Teste de recuperação de dados e cópias atômicas
  const backup = AbyssPersistence.backup([], null, e1.createCheckpoint());
  assert(typeof backup === 'string');
  const parsed = AbyssPersistence.parseBackup(backup);
  assert.equal(parsed.campaignCheckpoint.seed, 'audit-run-1');
});

console.log(`\n======================================================`);
console.log(`Sucesso! Todas as ${passed} baterias de verificação foram aprovadas.`);
console.log(`======================================================`);
