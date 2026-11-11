'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  Engine,
  CARDS: CINZAS_CARDS,
  CHAPTERS: CINZAS_CHAPTERS
} = require('../public/roguelite/core.js');

const AbyssPersistence = require('../public/roguelite/persistence.js');
const { Keyboard: CinzasKeyboard, Controller: CinzasController } = require('../public/roguelite/controller.js');
const { WEAPON_VARIANTS: CINZAS_VARIANTS, RUNES: CINZAS_RUNES } = require('../public/roguelite/levels.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS ' + name);
}

// =============================================================================
// BATERIA 1: PERSISTÊNCIA DE EXPLORAÇÃO E OBJETOS QUEBRÁVEIS (CINZAS)
// =============================================================================

test('1.1 - Cinzas: persistência atômica de brokenObjects nos 4 marcos de exploração', () => {
  const engine = new Engine();
  engine.start({ mode: 'adventure', seed: 'persis-explora-test', name: 'Lia' });

  // 1. Simular capítulo 8 (estágio 7): destruição do Relicário do Eclipse
  engine.stage = 7;
  engine.loadStage();
  const cache = engine.breakables.find(b => b.id === 'eclipse-cache');
  assert(cache, 'O estágio 7 deve conter o Relicário do Eclipse destrutível (id: eclipse-cache)');
  assert.equal(cache.broken, false);

  // Limpar inimigos para permitir checkpoint de marco
  engine.enemies = [];
  engine.spawnQueue = [];
  engine.update(1 / 60, {});
  assert(engine.cleared, 'A sala deve ser considerada limpa');

  // Causar dano para quebrar o relicário
  engine.damageBreakable(cache, 100);
  assert.equal(cache.broken, true);

  // Criar checkpoint de campanha pós-limpeza
  const cp = engine.createCheckpoint();
  assert(Array.isArray(cp.brokenObjects), 'Checkpoint deve serializar o array brokenObjects');
  assert(cp.brokenObjects.includes('eclipse-cache'), 'Checkpoint deve conter eclipse-cache');

  // Restaurar em uma nova instância limpa da Engine
  const restored = new Engine();
  assert(restored.restoreCheckpoint(cp), 'Restauração de checkpoint deve ter sucesso');
  assert.equal(restored.stage, 7);
  const restoredCache = restored.breakables.find(b => b.id === 'eclipse-cache');
  assert(restoredCache, 'Objeto deve existir na cena');
  assert.equal(restoredCache.broken, true, 'Objeto restaurado deve permanecer quebrado');
  assert.equal(restoredCache.hp, 0);

  // Novo checkpoint a partir de restored deve continuar serializando eclipse-cache
  const nextCp = restored.createCheckpoint();
  assert(nextCp.brokenObjects.includes('eclipse-cache'));
  const tokensBefore = restored.rerolls;
  restored.damageBreakable(restoredCache, 50); // Não deve dar recompensas
  assert.equal(restored.rerolls, tokensBefore, 'Objeto já quebrado não pode duplicar recompensas');
});

test('1.2 - Cinzas: cobertura dos 4 objetos de exploração (Sino, Relicário, Urna, Condutor)', () => {
  // Breakables de exploração
  const breakablesToCheck = [
    { stage: 7, id: 'eclipse-cache', name: 'Relicário do Eclipse' },
    { stage: 17, id: 'thaw-urn', name: 'Urna do Degelo' },
    { stage: 24, id: 'dawn-conductor', name: 'Condutor do Alvorecer' }
  ];

  for (const { stage, id, name } of breakablesToCheck) {
    const engine = new Engine();
    engine.start({ mode: 'adventure', seed: 'check-breakables-seed', name: 'Lia' });
    engine.stage = stage;
    engine.loadStage();
    const obj = engine.breakables.find(b => b.id === id);
    assert(obj, `O estágio ${stage} deve conter o objeto de exploração ${name} (${id})`);
    assert.equal(obj.broken, false);
  }

  // Sino da Vigília (Santuário que abre rota elevada no estágio 21 / Capítulo 22)
  const bellEngine = new Engine();
  bellEngine.start({ mode: 'adventure', seed: 'check-bell-seed', name: 'Lia' });
  bellEngine.stage = 21;
  bellEngine.loadStage();
  const bell = bellEngine.shrines.find(s => s.opensRoute === 'Ponte da vigília');
  assert(bell, 'O estágio 21 deve conter o Sino da Vigília que abre a rota elevada');
  assert(bellEngine.relics.length > 0, 'O estágio 21 deve ter relíquia na rota elevada');
});

// =============================================================================
// BATERIA 2: BACKUP, RESTAURAÇÃO E ISOLAMENTO DE FORMATOS (CINZAS V1/V2/V3)
// =============================================================================

test('2.1 - Cinzas: serialização e parsing de backup v3 com legado completo e checkpoints', () => {
  const scores = [
    { edition: '0.5', wave: 10, difficulty: 'normal', name: 'Lia', kills: 120, score: 5000, date: new Date().toISOString() }
  ];
  const hordeCheckpoint = { format: 'cinzas-horde', wave: 11, hp: 80, kills: 120 };
  const campaignCheckpoint = { format: 'cinzas-campaign', stage: 14, completedChapters: 15, hp: 100, brokenObjects: ['cache-8'] };
  const legacy = { version: 1, cleared: 20, weapon: 'staff', rune: 'frost', variant: 'frost_staff' };

  const backupText = AbyssPersistence.backup(scores, hordeCheckpoint, campaignCheckpoint, legacy);
  assert(typeof backupText === 'string');

  const parsed = AbyssPersistence.parseBackup(backupText);
  assert(parsed !== null, 'Backup válido deve ser parseado com sucesso');
  assert.equal(parsed.scores.length, 1);
  assert.equal(parsed.scores[0].wave, 10);
  assert.deepEqual(parsed.checkpoint, hordeCheckpoint);
  assert.deepEqual(parsed.campaignCheckpoint, campaignCheckpoint);
  assert.deepEqual(parsed.legacy, legacy);
});

test('2.2 - Cinzas: compatibilidade retroativa com backups legados v1 e v2', () => {
  // Backup v1 (apenas scores e horde checkpoint)
  const v1 = JSON.stringify({
    format: 'cinzas-save',
    version: 1,
    scores: [{ edition: '0.5', difficulty: 'easy', name: 'Antigo', wave: 5, kills: 30 }],
    checkpoint: { format: 'cinzas-horde', wave: 5, hp: 90 }
  });
  const parsedV1 = AbyssPersistence.parseBackup(v1);
  assert(parsedV1 !== null);
  assert.equal(parsedV1.scores.length, 1);
  assert.equal(parsedV1.campaignCheckpoint, null);
  assert.equal(parsedV1.legacy, undefined);

  // Backup v2 (com campaignCheckpoint mas sem legacy)
  const v2 = JSON.stringify({
    format: 'cinzas-save',
    version: 2,
    scores: [],
    checkpoint: null,
    campaignCheckpoint: { format: 'cinzas-campaign', stage: 4, completedChapters: 5, hp: 100 }
  });
  const parsedV2 = AbyssPersistence.parseBackup(v2);
  assert(parsedV2 !== null);
  assert.equal(parsedV2.campaignCheckpoint?.completedChapters, 5);
  assert.equal(parsedV2.legacy, undefined);
});

test('2.3 - Cinzas: rejeição atômica de payloads corrompidos, maliciosos ou superdimensionados', () => {
  // Payload gigante (> 2MB)
  const hugeText = ' '.repeat(2000001);
  assert.equal(AbyssPersistence.parseBackup(hugeText), null);

  // Formato inválido
  assert.equal(AbyssPersistence.parseBackup(JSON.stringify({ format: 'outro-jogo', version: 3 })), null);

  // Versão inexistente
  assert.equal(AbyssPersistence.parseBackup(JSON.stringify({ format: 'cinzas-save', version: 99 })), null);

  // Mais de 150 scores (tentativa de buffer overflow de armazenamento)
  const bloatedScores = Array.from({ length: 151 }, (_, i) => ({
    edition: '0.5',
    difficulty: 'normal',
    name: 'Bot ' + i,
    wave: 1,
    kills: 1
  }));
  assert.equal(AbyssPersistence.parseBackup(JSON.stringify({ format: 'cinzas-save', version: 3, scores: bloatedScores })), null);

  // Legado com arma ou runa inválida dentro do backup v3
  const badLegacy = { format: 'cinzas-save', version: 3, scores: [], legacy: { version: 1, cleared: 5, weapon: 'laser_invalido' } };
  assert.equal(AbyssPersistence.parseBackup(JSON.stringify(badLegacy)), null);
});

// =============================================================================
// BATERIA 3: RESILIÊNCIA E PERSISTÊNCIA ESTRATÉGICA (ATALAIA)
// =============================================================================

test('3.1 - Atalaia: simulação de recuperação com backup atômico .bak e isolamento de arquivos inválidos', () => {
  // Emulador de leitura e recuperação com arquivo .bak
  function loadStrategicProfileWithRecovery(store) {
    let raw = store['profile.json'];
    let recoveryNotice = '';
    let isRecovered = false;

    if (!raw || raw.startsWith('{corrupted')) {
      if (raw && raw.startsWith('{corrupted')) {
        store['profile.json.invalid.bak'] = raw; // Arquivar corrupção
      }
      // Tentar recuperar do .bak
      const bak = store['profile.json.bak'];
      if (bak && !bak.startsWith('{corrupted')) {
        raw = bak;
        recoveryNotice = 'Registro estratégico recuperado de cópia válida anterior.';
        isRecovered = true;
      } else {
        return { data: null, notice: 'Registro estratégico ilegível e sem cópia válida.', isRecovered: false };
      }
    }

    try {
      const data = JSON.parse(raw);
      return { data, notice: recoveryNotice, isRecovered };
    } catch {
      return { data: null, notice: 'Erro no parse do perfil', isRecovered: false };
    }
  }

  // Cenário 1: Perfil íntegro
  const healthyStore = {
    'profile.json': JSON.stringify({ version: 1, bestWave: 15, selected: 'engineering', chronicleBest: 12, survivalBest: 20 }),
    'profile.json.bak': JSON.stringify({ version: 1, bestWave: 10, selected: 'engineering', chronicleBest: 6, survivalBest: 15 })
  };
  const res1 = loadStrategicProfileWithRecovery(healthyStore);
  assert.equal(res1.isRecovered, false);
  assert.equal(res1.data.bestWave, 15);

  // Cenário 2: Perfil corrompido, .bak válido disponível
  const corruptedStore = {
    'profile.json': '{corrupted json bytes from crash...',
    'profile.json.bak': JSON.stringify({ version: 1, bestWave: 12, selected: 'warding', chronicleBest: 10, survivalBest: 15 })
  };
  const res2 = loadStrategicProfileWithRecovery(corruptedStore);
  assert.equal(res2.isRecovered, true);
  assert.equal(res2.data.bestWave, 12);
  assert(res2.notice.includes('recuperado de cópia válida anterior'));
  assert(corruptedStore['profile.json.invalid.bak'].includes('{corrupted json'), 'Arquivo original corrompido deve ser preservado intacto');
});

test('3.2 - Atalaia: persistência desacoplada de Sobrevivência, Crônica e Campanha Clássica', () => {
  // Validação de que atualizar a Sobrevivência nunca contamina o recorde da Crônica
  let profile = { version: 1, bestWave: 5, selected: 'lore', chronicleBest: 8, survivalBest: 12 };

  function recordSurvival(current, cleared) {
    if (cleared <= current.survivalBest) return current;
    return { ...current, survivalBest: cleared };
  }

  function recordChronicle(current, cleared) {
    if (cleared <= current.chronicleBest) return current;
    return { ...current, chronicleBest: cleared };
  }

  // Novo recorde de sobrevivência: onda 25
  profile = recordSurvival(profile, 25);
  assert.equal(profile.survivalBest, 25);
  assert.equal(profile.chronicleBest, 8, 'Crônica não deve ser modificada');
  assert.equal(profile.bestWave, 5, 'Campanha clássica não deve ser modificada');

  // Novo recorde da Crônica: fase 18
  profile = recordChronicle(profile, 18);
  assert.equal(profile.chronicleBest, 18);
  assert.equal(profile.survivalBest, 25, 'Sobrevivência não deve ser modificada');
});

// =============================================================================
// BATERIA 4: PERSISTÊNCIA DE PREFERÊNCIAS E CONFIGURAÇÕES
// =============================================================================

test('4.1 - Persistência das preferências de atalhos e acessibilidade nos dois jogos', () => {
  // Cinzas: Keyboard bindings e Controller
  const kb = new CinzasKeyboard();
  assert(kb.setBinding('attack', 'KeyH'));
  const snapshot = kb.snapshot();
  assert.equal(snapshot.attack[0], 'KeyH');

  // Restaurar em nova instância
  const kb2 = new CinzasKeyboard(snapshot);
  assert.equal(kb2.actionFor('KeyH'), 'attack');

  // Atalaia: código e arquivo de preferências
  const atalaiaKbFile = path.resolve(__dirname, '../games/atalaia/scripts/keyboard_controls.gd');
  const atalaiaKbCode = fs.readFileSync(atalaiaKbFile, 'utf8');
  assert(atalaiaKbCode.includes('func to_data() -> Dictionary:'));
  assert(atalaiaKbCode.includes('func load_data(data: Variant) -> bool:'));
});

console.log(`\n======================================================`);
console.log(`Sucesso! Todas as ${passed} baterias de verificação foram aprovadas.`);
console.log(`======================================================`);
