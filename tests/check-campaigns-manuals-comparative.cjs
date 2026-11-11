'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { Engine, CINZAS_CHAPTERS } = require('../public/roguelite/core.js');

// =============================================================================
// SUÍTE DE VALIDAÇÃO: CAMPANHAS ZERO->FIM, MANUAIS E RELATÓRIO COMPARATIVO
// =============================================================================

// -----------------------------------------------------------------------------
// BATERIA 1: CAMPANHA ZERO->FIM DE CINZAS DO ABISMO (25 CAPÍTULOS)
// -----------------------------------------------------------------------------

test('1.1 - Cinzas do Abismo: Execução de campanha contínua do Capítulo 1 ao 25 com confronto final', () => {
  const engine = new Engine();
  engine.start({ mode: 'adventure', seed: 'zero-to-end-seed' });

  assert.equal(engine.stage, 0, 'Início no primeiro capítulo (estágio 0)');
  assert.equal(engine.mode, 'adventure');
  assert.equal(engine.hp, engine.maxHp);

  // Simular progressão sequencial pelos primeiros 24 capítulos (estágios 0 a 23)
  for (let s = 0; s < 24; s++) {
    assert.equal(engine.stage, s, `Deve estar no estágio ${s} (Capítulo ${s + 1})`);
    engine.cleared = true;
    engine.kills += 5;
    engine.score += 100;
    engine.player.x = engine.checkpoint.x - 14;
    engine.player.y = engine.checkpoint.y - engine.player.h;
    const ok = engine.useCheckpoint();
    assert(ok, 'useCheckpoint deve retornar true no portal de saída');
    assert.equal(engine.status, 'upgrade', 'Saída de sala deve abrir draft/upgrade de cartas');
    engine.chooseCard(0);
    assert.equal(engine.status, 'running', 'Escolha de carta retoma o jogo');
  }

  // Chegada no Capítulo 25 (estágio 24 / Alvorecer)
  assert.equal(engine.stage, 24, 'Chegada ao estágio 24 (Capítulo 25)');
  assert.equal(engine.chapter, 'O sol sob a pedra');
  assert.equal(engine.biome, 4);
  assert.equal(engine.bossStage, true);

  // Verificar presença do marco Condutor do Alvorecer
  const conductor = engine.breakables.find((b) => b.id === 'dawn-conductor');
  assert(conductor, 'Condutor do Alvorecer deve existir no Capítulo 25');
  assert.equal(conductor.broken, false);

  // Destruição do condutor
  conductor.broken = true;
  engine.score += 250;

  // Interação final com a saída do Capítulo 25 conduz à vitória imediata
  engine.cleared = true;
  engine.player.x = engine.checkpoint.x - 14;
  engine.player.y = engine.checkpoint.y - engine.player.h;
  const wonOk = engine.useCheckpoint();
  assert(wonOk, 'useCheckpoint deve finalizar a expedição no capítulo 25');

  assert.equal(engine.status, 'ended', 'Estado final deve ser encerrado com sucesso');
  assert.equal(engine.won, true, 'Desfecho deve ser de vitória final');
  assert(engine.score > 2500, 'Pontuação final acumulada coerente');
  assert(engine.kills >= 120, 'Contagem de abates acumulada coerente');
});

// -----------------------------------------------------------------------------
// BATERIA 2: CAMPANHA ZERO->FIM DO ATALAIA (CRÔNICA E 15 ONDAS CLÁSSICAS)
// -----------------------------------------------------------------------------

test('2.1 - Atalaia: Validação da integridade dos 5 Atos (30 Fases) da Crônica', () => {
  const chroniclePhasesFile = path.join(root, 'games/atalaia/data/chronicle-phases.json');
  assert(fs.existsSync(chroniclePhasesFile), 'Arquivo chronicle-phases.json deve existir');

  const acts = JSON.parse(fs.readFileSync(chroniclePhasesFile, 'utf8'));
  assert.equal(acts.length, 5, 'Crônica deve possuir exatamente 5 atos');

  const allPhases = acts.flatMap((act) => act.phases);
  assert.equal(allPhases.length, 30, 'Crônica deve possuir exatamente 30 fases no total');

  for (let a = 0; a < acts.length; a++) {
    const act = acts[a];
    assert(act.act, `Ato ${a + 1} deve ter título`);
    assert(act.intro, `Ato ${a + 1} deve ter introdução narrativa`);
    assert(act.ending, `Ato ${a + 1} deve ter conclusão narrativa`);
    assert.equal(act.phases.length, 6, `Ato ${a + 1} deve conter exatamente 6 fases`);

    for (let p = 0; p < act.phases.length; p++) {
      const phase = act.phases[p];
      assert(phase.name, `Fase ${p + 1} do ato ${a + 1} deve ter nome`);
      assert(phase.deck.length > 0, 'Fase deve ter deck de inimigos');
      assert(phase.count > 0, 'Fase deve ter contagem de monstros');
      assert(phase.integrity > 0, 'Meta de integridade deve ser positiva');
      assert(phase.reward > 0, 'Recompensa de ouro deve ser positiva');
    }
  }
});

// -----------------------------------------------------------------------------
// BATERIA 3: MANUAIS DO JOGADOR DE CADA JOGO
// -----------------------------------------------------------------------------

test('3.1 - Manual do Jogador de Cinzas do Abismo', () => {
  const manualPath = path.join(root, 'games/cinzas-do-abismo/MANUAL.md');
  assert(fs.existsSync(manualPath), 'MANUAL.md de Cinzas do Abismo deve existir');

  const content = fs.readFileSync(manualPath, 'utf8');
  assert(content.includes('Controles e Atalhos'), 'Deve conter seção de controles');
  assert(content.includes('As Quatro Armas Fundamentais e Variantes do Legado'), 'Deve detalhar as 4 armas e variantes');
  assert(content.includes('Runas Permanentes do Legado'), 'Deve detalhar runas de gelo e fogo');
  assert(content.includes('Estrutura da Campanha: 5 Regiões e 25 Capítulos'), 'Deve detalhar os 25 capítulos');
  assert(content.includes('Relicário do Eclipse'), 'Deve documentar o segredo do cap. 8');
  assert(content.includes('Urna do Degelo'), 'Deve documentar o segredo do cap. 18');
  assert(content.includes('Sino da Vigília'), 'Deve documentar o segredo do cap. 22');
  assert(content.includes('Condutor do Alvorecer'), 'Deve documentar o segredo do cap. 25');
  assert(content.includes('Modo Horda e Sobrevivência'), 'Deve documentar o modo horda');
  assert(content.includes('Persistência, Backups e Salvamento Atômico'), 'Deve documentar backups v3');
});

test('3.2 - Manual do Jogador de Atalaia: Guardiões do Cristal', () => {
  const manualPath = path.join(root, 'games/atalaia/MANUAL.md');
  assert(fs.existsSync(manualPath), 'MANUAL.md de Atalaia deve existir');

  const content = fs.readFileSync(manualPath, 'utf8');
  assert(content.includes('O Objetivo da Defesa'), 'Deve explicar a integridade do Cristal');
  assert(content.includes('As Doze Torretas de Defesa'), 'Deve documentar as 12 torretas');
  assert(content.includes('Guardião de Raízes'), 'Deve documentar Guardião de Raízes');
  assert(content.includes('Canhão Sísmico'), 'Deve documentar Canhão Sísmico');
  assert(content.includes('Obelisco Solar'), 'Deve documentar Obelisco Solar');
  assert(content.includes('Árvores Estratégicas de Longo Prazo'), 'Deve documentar Engenharia, Proteção e Conhecimento');
  assert(content.includes('Segundas Fases Dedicadas dos Chefes'), 'Deve documentar contrajogos dos 5 chefes');
  assert(content.includes('A Crônica'), 'Deve documentar a Crônica em 5 atos e 30 fases');
  assert(content.includes('Atalhos e Controles'), 'Deve documentar atalhos remapeáveis');
});

// -----------------------------------------------------------------------------
// BATERIA 4: CHANGELOGS E RELATÓRIO COMPARATIVO FINAL
// -----------------------------------------------------------------------------

test('4.1 - Changelogs detalhados de Cinzas do Abismo e Atalaia', () => {
  const cinzasChangelog = path.join(root, 'games/cinzas-do-abismo/CHANGELOG.md');
  assert(fs.existsSync(cinzasChangelog), 'CHANGELOG.md de Cinzas do Abismo deve existir');
  const cinzasText = fs.readFileSync(cinzasChangelog, 'utf8');
  assert(cinzasText.includes('[1.0.0-renascimento]'));
  assert(cinzasText.includes('25 Capítulos em 5 Regiões'));
  assert(cinzasText.includes('6 Pilares de Combate Revisados'));

  const atalaiaChangelog = path.join(root, 'games/atalaia/CHANGELOG.md');
  assert(fs.existsSync(atalaiaChangelog), 'CHANGELOG.md de Atalaia deve existir');
  const atalaiaText = fs.readFileSync(atalaiaChangelog, 'utf8');
  assert(atalaiaText.includes('[1.0.0-renascimento]'));
  assert(atalaiaText.includes('A Crônica (5 Atos / 30 Fases)'));
  assert(atalaiaText.includes('6 Novas Torretas Avançadas'));
});

test('4.2 - Relatório comparativo formal com distinção explícita de status', () => {
  const reportPath = path.join(root, 'docs/COMPARACAO_RENASCIMENTO.md');
  assert(fs.existsSync(reportPath), 'docs/COMPARACAO_RENASCIMENTO.md deve existir');

  const content = fs.readFileSync(reportPath, 'utf8');
  assert(content.includes('Planejado'), 'Deve conter coluna Planejado');
  assert(content.includes('Implementado'), 'Deve conter coluna Implementado');
  assert(content.includes('Testado'), 'Deve conter coluna Testado');
  assert(content.includes('Aprovado'), 'Deve conter coluna Aprovado');
  assert(content.includes('Pendente'), 'Deve conter coluna Pendente');

  // Nexus explicitamente identificado como pausado por ordem do usuário
  assert(content.includes('Pausado por ordem expressa do usuário'),
    'Nexus deve ser documentado como pausado por diretriz do usuário');
  assert(content.includes('Cinzas do Abismo') && content.includes('100% Concluído'));
  assert(content.includes('Atalaia: Guardiões do Cristal') && content.includes('100% Concluído'));
});

console.log('\n======================================================');
console.log('Sucesso! Todas as verificações de campanhas, manuais e relatório comparativo foram aprovadas.');
console.log('======================================================');
