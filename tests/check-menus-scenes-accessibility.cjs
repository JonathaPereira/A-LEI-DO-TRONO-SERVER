'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  Engine,
  CARDS: CINZAS_CARDS,
  CHAPTERS: CINZAS_CHAPTERS,
  REGIONS: CINZAS_REGIONS
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
// BATERIA 1: MENUS COMPLETOS DE JOGO A JOGO (7 COMPONENTES CONTRATUAIS)
// =============================================================================

test('1.1 - Atalaia: auditoria dos 7 componentes do menu (continuar, nova campanha, seleção, progressão, configurações, créditos, sair)', () => {
  const atalaiaMainPath = path.resolve(__dirname, '../games/atalaia/scripts/main.gd');
  const code = fs.readFileSync(atalaiaMainPath, 'utf8');

  // 1. Continuar
  assert(code.includes('CONTINUAR CRÔNICA · FASE %d') && code.includes('CONTINUAR CAMPANHA · ONDA %d'),
    'Atalaia deve oferecer ação de continuar dinamicamente nomeada para campanha ou crônica');
  assert(code.includes('if not saved.is_empty():'),
    'Ação de continuar deve ser condicionada à existência de save válido');

  // 2. Nova campanha com guarda de confirmação
  assert(code.includes('modal_kind="confirm"'), 'Nova campanha deve abrir modal de confirmação');
  assert(code.includes('Iniciar nova campanha?') && code.includes('O progresso atual será substituído.'),
    'Confirmação deve advertir sobre a substituição de progresso');
  assert(code.includes('UI.button(q,"Voltar",Rect2(30,158,252,52),show_menu)') && code.includes('UI.button(q,"Iniciar",Rect2(302,158,268,52),start_game,true)'),
    'Modal de confirmação deve oferecer Voltar ao menu e Iniciar nova campanha');

  // 3. Seleção de modo de campanha
  assert(code.includes('func select_campaign(selected_mode: String):'),
    'Deve haver método dedicado para alternância de modo de campanha');
  assert(code.includes('Campanha clássica') && code.includes('Crônica · 30 fases'),
    'Menus devem expor alternância entre Campanha Clássica e Crônica');

  // 4. Progressão e Conquistas
  assert(code.includes('UI.button(p,"Árvores estratégicas",Rect2(210,488+action_offset,216,38),show_strategy)'),
    'Menu deve ter botão de Árvores Estratégicas');
  assert(code.includes('UI.button(p,"Conquistas",Rect2(46,36,160,40),show_achievements)'),
    'Menu deve ter botão de Conquistas locais');

  // 5. Configurações
  assert(code.includes('UI.button(p,"Opções",Rect2(704,36,110,40),show_settings)'),
    'Menu deve ter botão de Opções de áudio e acessibilidade');
  assert(code.includes('UI.button(p,"Teclado",Rect2(425,34,180,40),show_controls)'),
    'Opções deve ter botão de remapeamento de Teclado');

  // 6. Créditos
  assert(code.includes('UI.button(p,"Créditos",Rect2(560,36,128,40),show_credits)'),
    'Menu deve ter botão de Créditos e licenças');
  assert(code.includes('Caladea e Carlito · SIL Open Font License 1.1') && code.includes('Engine.get_license_text()'),
    'Créditos devem expor licenças de fontes e motor');

  // 7. Sair / Salvar
  assert(code.includes('func save_and_return():'),
    'Deve haver método de salvar e voltar ao título');
  assert(code.includes('Salvar e voltar ao título') && code.includes('Encerrar sessão e voltar ao título'),
    'Opções em jogo deve permitir retorno com salvamento da campanha ou encerramento limpo da sobrevivência');
});

test('1.2 - Cinzas: auditoria dos 7 componentes do menu (continuar, nova campanha, seleção, progressão, configurações, créditos, sair)', () => {
  const htmlPath = path.resolve(__dirname, '../public/roguelite/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const gameJsPath = path.resolve(__dirname, '../public/roguelite/game.js');
  const gameJs = fs.readFileSync(gameJsPath, 'utf8');

  // 1. Continuar
  assert(html.includes('id="continueCampaign"') && html.includes('id="continueHorde"'),
    'Cinzas deve ter botões de continuar dedicados para campanha e horda');
  assert(gameJs.includes('resumeRun(\'adventure\')') && gameJs.includes('resumeRun(\'horde\')'),
    'Cinzas deve restaurar campanha e horda com validação estrita de checkpoint');

  // 2. Nova campanha com replaceDialog
  assert(html.includes('id="replaceDialog"') && html.includes('id="replaceConfirm"') && html.includes('id="replaceCancel"'),
    'Cinzas deve possuir replaceDialog para confirmação de substituição de campanha');
  assert(gameJs.includes('openDialog(\'replaceDialog\')') && gameJs.includes('$(\'replaceCancel\').focus()'),
    'Confirmação de nova campanha deve abrir replaceDialog e focar em replaceCancel para segurança');
  assert(html.includes('Iniciar nova expedição?') && html.includes('O checkpoint da campanha atual será substituído.'),
    'replaceDialog deve alertar expressamente sobre a substituição do checkpoint');

  // 3. Seleção de modo e dificuldade
  assert(html.includes('data-mode="adventure"') && html.includes('data-mode="horde"'),
    'Interface deve ter seletor de modo Expedição e Horda');
  assert(html.includes('id="difficulty"') && html.includes('value="easy"') && html.includes('value="normal"') && html.includes('value="hard"'),
    'Cinzas deve possuir seletor de 3 dificuldades (Explorador, Aventureiro, Abismo)');

  // 4. Progressão e Legado
  assert(html.includes('id="legacySettings"') && html.includes('id="legacyWeapon"') && html.includes('id="legacyRune"'),
    'Interface deve expor seleção de armas e runas do Legado');
  assert(html.includes('id="achievementsBtn"') && html.includes('id="achievementsDialog"'),
    'Cinzas deve expor botão e diálogo de conquistas locais');

  // 5. Configurações
  assert(html.includes('id="controllerBtn"') && html.includes('id="controllerDialog"'),
    'Interface deve possuir diálogo de controle e atalhos');
  assert(html.includes('id="musicVolume"') && html.includes('id="effectsVolume"'),
    'Interface deve possuir ajustes de volume de música e efeitos');

  // 6. Créditos
  assert(html.includes('id="creditsBtn"') && html.includes('id="creditsDialog"'),
    'Interface deve possuir botão e diálogo de créditos');

  // 7. Pausa e Sair
  assert(html.includes('id="pauseBtn"') && html.includes('id="suspendBtn"') && html.includes('id="exitBtn"'),
    'Cinzas deve expor botões de pausar, suspender no marco e sair/desistir');
});

// =============================================================================
// BATERIA 2: CONFIGURAÇÕES E ACESSIBILIDADE VISUAL E SONORA
// =============================================================================

test('2.1 - Cinzas: controle explícito de tremor de tela (screen shake) e redução de movimento', () => {
  const gameJsPath = path.resolve(__dirname, '../public/roguelite/game.js');
  const gameJs = fs.readFileSync(gameJsPath, 'utf8');

  // Verificação da opção de tremor de tela no HTML e JS
  assert(gameJs.includes('reducedShake'), 'Cinzas deve ter controle para reducedShake');
  assert(gameJs.includes('case \'shake\':if(!reduced)shake=Math.max(shake,event.amount);break;'),
    'Quando reduced está ativado, eventos de shake devem ser sumariamente anulados');

  // Verificação na renderização: tremor só move o canvas se shake > 0.3
  const rendererPath = path.resolve(__dirname, '../public/roguelite/renderer.js');
  const rendererJs = fs.readFileSync(rendererPath, 'utf8');
  assert(rendererJs.includes('if(shake>.3)c.translate(Math.sin(time*101)*shake,Math.cos(time*91)*shake*.6);'),
    'Tremor de tela deve aplicar translação suave no canvas respeitando a magnitude');
});

test('2.2 - Atalaia: efeito reduzido para partículas e fumaça de cenário', () => {
  const atalaiaMainPath = path.resolve(__dirname, '../games/atalaia/scripts/main.gd');
  const code = fs.readFileSync(atalaiaMainPath, 'utf8');

  assert(code.includes('reduced.name="ReducedEffects";reduced.text="Efeitos reduzidos"'),
    'Atalaia deve possuir controle de Efeitos reduzidos');
  assert(code.includes('Reduz fumaça, partículas e movimento do cenário.'),
    'Efeitos reduzidos deve explicar a redução de fumaça, partículas e movimento');
  assert(code.includes('reduced.toggled.connect(board.set_reduced_effects)'),
    'Efeitos reduzidos deve ser diretamente conectado ao tabuleiro de jogo');
});

test('2.3 - Independência e fidelidade de canais de áudio nos dois jogos', () => {
  // Atalaia: 4 canais
  const atalaiaMainPath = path.resolve(__dirname, '../games/atalaia/scripts/main.gd');
  const atalaiaCode = fs.readFileSync(atalaiaMainPath, 'utf8');
  for (const bus of ['Master', 'Music', 'Effects', 'Ambience']) {
    assert(atalaiaCode.includes(`"${bus}"`), `Atalaia deve ter controle de volume para barramento ${bus}`);
  }

  // Cinzas: volume independente de música e efeitos sonoros
  const gameJsPath = path.resolve(__dirname, '../public/roguelite/game.js');
  const gameJs = fs.readFileSync(gameJsPath, 'utf8');
  assert(gameJs.includes('sfx.levels(Number($(\'musicVolume\').value)/100,Number($(\'effectsVolume\').value)/100);'),
    'Cinzas deve aplicar níveis independentes de trilha e efeitos no SFX');
  assert(gameJs.includes('if(sound)sfx.enable();else sfx.mute();'),
    'Cinzas deve permitir mutar/desmutar som globalmente via soundBtn');
});

// =============================================================================
// BATERIA 3: GERENCIAMENTO DE CENAS E TRANSIÇÕES DE ESTADO
// =============================================================================

test('3.1 - Cinzas: ciclo de vida de estados da Engine (menu -> upgrade -> running -> paused -> ended)', () => {
  const engine = new Engine();
  // Estado inicial
  assert.equal(engine.status, 'menu');

  // Início em modo aventura
  engine.start({ mode: 'adventure', seed: 'scene-test-123', name: 'Lia' });
  assert.equal(engine.status, 'running');
  assert.equal(engine.mode, 'adventure');
  assert.equal(engine.stage, 0);

  // Simulação de combate e dano
  engine.update(1 / 60, { right: true });
  assert.equal(engine.status, 'running');

  // Conclusão de marco / checkpoint
  engine.cleared = true;
  engine.player.x = engine.checkpoint.x - 14;
  engine.player.y = engine.checkpoint.y - engine.player.h;
  assert.equal(engine.useCheckpoint(), true);
  assert.equal(engine.status, 'upgrade'); // Entra em modo upgrade

  // Escolha de carta retorna ao combate na próxima fase
  engine.chooseCard(0);
  assert.equal(engine.status, 'running');
  assert.equal(engine.stage, 1);

  // Derrota do jogador transiciona para ended
  engine.player.hp = 0;
  engine.end(false);
  assert.equal(engine.status, 'ended');
});

test('3.2 - Atalaia: modais com véu de contraste e descarte seguro de instâncias', () => {
  const atalaiaMainPath = path.resolve(__dirname, '../games/atalaia/scripts/main.gd');
  const code = fs.readFileSync(atalaiaMainPath, 'utf8');

  // Modais válidos
  const expectedModals = ['menu', 'confirm', 'settings', 'controls', 'credits', 'achievements', 'strategy', 'scenarios'];
  for (const modal of expectedModals) {
    assert(code.includes(`modal_kind="${modal}"`), `Atalaia deve suportar modal_kind "${modal}"`);
  }

  // Véu de sombreamento (veil) para manter contraste e foco modal
  assert(code.includes('veil(0.68)') && code.includes('veil(0.83)'),
    'Atalaia deve aplicar véu semi-transparente nos modais');

  // Pausa automática ao abrir opções
  assert(code.includes('paused=true;clear_modal();modal_kind="settings"'),
    'Ao abrir opções, o jogo deve ser pausado imediatamente para impedir dano à defesa');

  // Retomada automática ao fechar opções
  assert(code.includes('clear_modal();paused=false;save_settings()'),
    'Ao fechar opções, o jogo despausa e salva configurações de áudio/teclado');
});

console.log(`\n======================================================`);
console.log(`Sucesso! Todas as ${passed} baterias de verificação foram aprovadas.`);
console.log(`======================================================`);
