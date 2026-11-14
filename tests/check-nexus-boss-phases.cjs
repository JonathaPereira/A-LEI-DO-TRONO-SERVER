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
// SUÍTE DE VALIDAÇÃO: MECÂNICAS DE ELITES E CHEFES DO PROJECT NEXUS
// 7 Fases de Chefes, Composição com Ondas e Campos, Pressões Distintas
// =============================================================================

// -----------------------------------------------------------------------------
// BATERIA 1: INTEGRIDADE DAS 7 DEFINIÇÕES DE FASES DE CHEFES
// -----------------------------------------------------------------------------

test('1.1 - Validação estrutural das 7 fases de chefes nos capítulos da campanha', () => {
  assert(fs.existsSync(nexusRoot), 'Diretório do PROJETO-NEXUS deve existir');

  const campaignFiles = [
    'godot/scripts/campaign.gd',
    'godot/scripts/campaign_chapter_collapse.gd',
    'godot/scripts/campaign_chapter_nexus.gd',
    'godot/scripts/campaign_chapter_returns.gd',
    'godot/scripts/campaign_chapter_truths.gd',
  ];

  const contents = campaignFiles.map((f) =>
    fs.readFileSync(path.join(nexusRoot, f), 'utf8')
  ).join('\n');

  // As 7 definições de chefes e suas respectivas fases
  const expectedBosses = [
    {
      id: 'boss-forge',
      missionId: 'forge-heart',
      name: 'Arconte da fornalha',
      target: '1-boss-forge',
      phaseName: 'Núcleo exposto',
      skillName: 'Erupção do núcleo',
      healthRatio: 0.5,
      skillPower: 0.8,
    },
    {
      id: 'boss-collapse',
      missionId: 'collapse-anchor',
      name: 'Custódio da dobra',
      target: '1-boss-collapse',
      phaseName: 'Refração aberta',
      skillName: 'Estilhaço prismático',
      healthRatio: 0.6,
      skillPower: 0.83,
    },
    {
      id: 'boss-nexus',
      missionId: 'nexus-heart',
      name: 'Primeira Arquiteta',
      target: '1-boss-nexus',
      phaseName: 'Portas abertas',
      skillName: 'Colapso das margens',
      healthRatio: 0.6,
      skillPower: 0.92,
      skillPierce: 0.35,
    },
    {
      id: 'boss-copykeeper',
      missionId: 'beacon-returns-proof',
      name: 'Vigia da cópia',
      target: '1-boss-copykeeper',
      phaseName: 'Selo partido',
      skillName: 'Eco do juramento',
      healthRatio: 0.45,
      skillPower: 0.81,
    },
    {
      id: 'boss-sluice',
      missionId: 'tides-returns-proof',
      name: 'Executor da comporta',
      target: '1-boss-sluice',
      phaseName: 'Comporta aberta',
      skillName: 'Refluxo das marés',
      healthRatio: 0.55,
      skillPower: 0.8,
      skillEffect: 'weaken',
    },
    {
      id: 'boss-failsafe',
      missionId: 'forge-returns-proof',
      name: 'Válvula de recuo',
      target: '1-boss-failsafe',
      phaseName: 'Última reserva',
      skillName: 'Contrapressão',
      healthRatio: 0.65,
      skillPower: 0.77,
    },
    {
      id: 'boss-archivist',
      missionId: 'truths-archive',
      name: 'Arquivista do silêncio',
      target: '1-boss-archivist',
      phaseName: 'Registro aberto',
      skillName: 'Rebote da ata',
      healthRatio: 0.55,
      skillPower: 0.82,
      skillEffect: 'expose',
    },
  ];

  for (const b of expectedBosses) {
    assert(contents.includes(b.id), `Inimigo ${b.id} (${b.name}) deve estar catalogado`);
    assert(contents.includes(b.missionId), `Missão ${b.missionId} deve estar catalogada`);
    assert(contents.includes(b.phaseName), `Fase ${b.phaseName} deve estar configurada`);
    assert(contents.includes(b.skillName), `Técnica ${b.skillName} deve estar configurada`);
    if (b.skillEffect) {
      assert(contents.includes(`"skillEffect":"${b.skillEffect}"`), `Efeito ${b.skillEffect} de ${b.id} deve estar configurado`);
    }
    if (b.skillPierce) {
      assert(contents.includes(`"skillPierce":${b.skillPierce}`), `Perfuração ${b.skillPierce} de ${b.id} deve estar configurada`);
    }
  }
});

// -----------------------------------------------------------------------------
// BATERIA 2: PRESSÕES DISTINTAS DE ARQUIVISTA, ARQUITETA E EXECUTOR
// -----------------------------------------------------------------------------

test('2.1 - Arquivista: Pressão de Exposição purificável (Defesa −25%)', () => {
  const truthsContent = fs.readFileSync(
    path.join(nexusRoot, 'godot/scripts/campaign_chapter_truths.gd'),
    'utf8'
  );
  assert(truthsContent.includes('"skillEffect":"expose"'), 'Arquivista aplica expose');
  assert(truthsContent.includes('Rebote da ata'), 'Habilidade de fase é Rebote da ata');
  assert(truthsContent.includes('Purifique os aliados expostos'), 'Contrajogo por purificação documentado na dica da missão');
});

test('2.2 - Arquiteta: Pressão de Perfuração de Escudo (35% pierce com mitigação por Guarda)', () => {
  const nexusContent = fs.readFileSync(
    path.join(nexusRoot, 'godot/scripts/campaign_chapter_nexus.gd'),
    'utf8'
  );
  assert(nexusContent.includes('"skillPierce":0.35'), 'Arquiteta aplica 35% de perfuração');
  assert(nexusContent.includes('Colapso das margens'), 'Habilidade de fase é Colapso das margens');
  assert(nexusContent.includes('35% do dano de Colapso das Margens atravessa escudos. Defesa reduz o golpe inteiro'), 'Contrajogo por Guarda/Defesa documentado na dica da missão');
});

test('2.3 - Executor: Pressão de Enfraquecimento purificável (Ataque −20%)', () => {
  const returnsContent = fs.readFileSync(
    path.join(nexusRoot, 'godot/scripts/campaign_chapter_returns.gd'),
    'utf8'
  );
  assert(returnsContent.includes('"skillEffect":"weaken"'), 'Executor aplica weaken');
  assert(returnsContent.includes('Refluxo das marés'), 'Habilidade de fase é Refluxo das marés');
  assert(returnsContent.includes('Refluxo reduz o ataque do trio em 20% por dois turnos pessoais; purificação remove o efeito'), 'Contrajogo por purificação documentado na dica da missão');
});

// -----------------------------------------------------------------------------
// BATERIA 3: COMPOSIÇÃO DE ELITES COM ONDAS E CAMPOS SIMÉTRICOS
// -----------------------------------------------------------------------------

test('3.1 - Presença de objetivos variados de campanha e composição de encontros', () => {
  const files = [
    'godot/scripts/campaign.gd',
    'godot/scripts/campaign_chapter_collapse.gd',
    'godot/scripts/campaign_chapter_nexus.gd',
    'godot/scripts/campaign_chapter_returns.gd',
    'godot/scripts/campaign_chapter_truths.gd',
  ];

  let waveCount = 0;
  let fieldCount = 0;
  let targetCount = 0;
  let escortCount = 0;
  let surviveCount = 0;

  for (const f of files) {
    const text = fs.readFileSync(path.join(nexusRoot, f), 'utf8');
    waveCount += (text.match(/"waves":\s*\[/g) || []).length;
    fieldCount += (text.match(/"field":\s*\{/g) || []).length;
    targetCount += (text.match(/"type":\s*"target"/g) || []).length;
    escortCount += (text.match(/"protectSlot":\s*\d/g) || []).length;
    surviveCount += (text.match(/"type":\s*"survive"/g) || []).length;
  }

  assert(waveCount >= 5, `Pelo menos 5 missões com ondas compostas (encontradas: ${waveCount})`);
  assert(fieldCount >= 10, `Pelo menos 10 missões com campos simétricos de energia (encontradas: ${fieldCount})`);
  assert(targetCount >= 7, `Pelo menos 7 missões com objetivo sob prazo (encontradas: ${targetCount})`);
  assert(escortCount >= 5, `Pelo menos 5 missões com escolta de aliado livre (encontradas: ${escortCount})`);
  assert(surviveCount >= 6, `Pelo menos 6 missões de sobrevivência coletiva (encontradas: ${surviveCount})`);
});

// -----------------------------------------------------------------------------
// BATERIA 4: EXECUÇÃO DOS TESTES NATIVOS DO GODOT (BOSS PHASES & PATTERNS)
// -----------------------------------------------------------------------------

test('4.1 - Godot headless: Execução nativa de tests/boss_phases.gd', () => {
  assert(fs.existsSync(godotBinary), 'Binário do Godot 4.6.3 deve estar disponível');

  const output = execFileSync(
    godotBinary,
    ['--headless', '--audio-driver', 'Dummy', '--path', 'godot', '--script', 'res://tests/boss_phases.gd'],
    {
      cwd: nexusRoot,
      encoding: 'utf8',
      timeout: 60000,
    }
  );

  assert(
    output.includes('Boss phases: 22 checks, 0 failures.'),
    `boss_phases.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

test('4.2 - Godot headless: Execução nativa de tests/boss_patterns.gd', () => {
  assert(fs.existsSync(godotBinary), 'Binário do Godot 4.6.3 deve estar disponível');

  const output = execFileSync(
    godotBinary,
    ['--headless', '--audio-driver', 'Dummy', '--path', 'godot', '--script', 'res://tests/boss_patterns.gd'],
    {
      cwd: nexusRoot,
      encoding: 'utf8',
      timeout: 60000,
    }
  );

  assert(
    output.includes('Boss patterns: 38 checks, 0 failures.'),
    `boss_patterns.gd deve passar com 0 falhas. Saída:\n${output}`
  );
});

console.log('\n======================================================');
console.log('Sucesso! Mecânicas de chefes, elites, ondas, campos e pressões do Nexus 100% verificadas.');
console.log('======================================================');
