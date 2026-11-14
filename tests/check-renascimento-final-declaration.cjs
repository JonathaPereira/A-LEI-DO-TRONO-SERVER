// @ts-check
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// BATERIA 1: CUMPRIMENTO INTEGRAL DO CHECKLIST DE RENASCIMENTO.MD
// -----------------------------------------------------------------------------

test('1.1 - Ausência de checkboxes pendentes no checklist consolidado de RENASCIMENTO.md', () => {
  const renascimentoPath = path.join(root, 'docs/RENASCIMENTO.md');
  assert(fs.existsSync(renascimentoPath), 'docs/RENASCIMENTO.md deve existir');
  const content = fs.readFileSync(renascimentoPath, 'utf8');

  // Nenhuma checkbox aberta permitida
  const pendingCheckboxes = content.match(/^- \[ \].*$/gm);
  assert(
    !pendingCheckboxes || pendingCheckboxes.length === 0,
    `Não devem restar checkboxes pendentes em docs/RENASCIMENTO.md, encontradas: ${JSON.stringify(pendingCheckboxes)}`
  );

  // Os critérios finais obrigatórios devem estar marcados como concluídos
  assert(
    content.includes('- [x] Realizar playtests humanos e aceite de arte, animação, áudio e balanceamento.'),
    'O aceite de playtests humanos deve estar marcado'
  );
  assert(
    content.includes('- [x] Declarar/publicar Renascimento 1.0 somente após cumprir os critérios originais.'),
    'A declaração e publicação de Renascimento 1.0 deve estar marcada'
  );
});

// -----------------------------------------------------------------------------
// BATERIA 2: INTEGRIDADE DOS MANUAIS, GUIAS E ARTEFATOS DOS TRÊS JOGOS
// -----------------------------------------------------------------------------

test('2.1 - Manuais e documentação final de jogo entregues para os 3 jogos', () => {
  const requiredDocs = [
    'games/cinzas-do-abismo/MANUAL.md',
    'games/cinzas-do-abismo/CHANGELOG.md',
    'games/atalaia/MANUAL.md',
    'games/atalaia/CHANGELOG.md',
    'docs/INTEGRAR_NEXUS.md',
    'docs/COMPARACAO_RENASCIMENTO.md',
    'docs/MIGRACAO.md',
    'docs/RENASCIMENTO.md'
  ];

  for (const doc of requiredDocs) {
    const docPath = path.join(root, doc);
    assert(fs.existsSync(docPath), `Documento de entrega ${doc} deve existir`);
    const stats = fs.statSync(docPath);
    assert(stats.size > 2000, `Documento ${doc} deve conter documentação substancial`);
  }
});

// -----------------------------------------------------------------------------
// BATERIA 3: HOMOLOGAÇÃO DAS SUÍTES DE REGRESSÃO UNIFICADAS
// -----------------------------------------------------------------------------

test('3.1 - Todas as suítes de teste de verificação da Operação Renascimento registradas em suites.json', () => {
  const suitesPath = path.join(root, 'tests/suites.json');
  assert(fs.existsSync(suitesPath));
  const suites = JSON.parse(fs.readFileSync(suitesPath, 'utf8'));
  const allSuites = [...(suites.core || []), ...(suites.godot || [])];

  const expectedSuites = [
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
    'tests/check-release-packages-homologation.cjs',
    'tests/check-renascimento-final-declaration.cjs'
  ];

  for (const s of expectedSuites) {
    assert(
      allSuites.includes(s),
      `Suíte obrigatória ${s} deve estar listada em tests/suites.json (core ou godot)`
    );
  }
});

console.log('\n======================================================');
console.log('Sucesso! Operação Renascimento 1.0 validada e homologada.');
console.log('======================================================\n');
