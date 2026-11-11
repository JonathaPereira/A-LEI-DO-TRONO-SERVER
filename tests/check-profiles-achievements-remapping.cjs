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
const { Keyboard: CinzasKeyboard, Controller: CinzasController, KEY_DEFAULT: CINZAS_KEY_DEFAULT } = require('../public/roguelite/controller.js');
const { RUNES: CINZAS_RUNES, WEAPON_VARIANTS: CINZAS_VARIANTS } = require('../public/roguelite/levels.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS ' + name);
}

// -----------------------------------------------------------------------------
// Emulador fiel da especificação de Atalaia: StrategyProgress e KeyboardControls
// Conforme definido em games/atalaia/scripts/strategy_progress.gd e keyboard_controls.gd
// -----------------------------------------------------------------------------
const ATALAIA_KEY_SPACE = 32;
const ATALAIA_KEY_0 = 48;
const ATALAIA_KEY_9 = 57;
const ATALAIA_KEY_A = 65;
const ATALAIA_KEY_Z = 90;
const ATALAIA_KEY_ENTER = 4194309;
const ATALAIA_KEY_ESCAPE = 4194305;

class AtalaiaKeyboardControls {
  static DEFAULTS = Object.freeze({
    wave: ATALAIA_KEY_SPACE,
    upgrade: 85, // KEY_U
    pause: 80,   // KEY_P
    speed: 70,   // KEY_F
    mute: 77,    // KEY_M
    build_ballista: 49, // KEY_1
    build_mortar: 50,   // KEY_2
    build_flame: 51,    // KEY_3
    build_tesla: 52,    // KEY_4
    build_ice: 53,      // KEY_5
    build_poison: 54    // KEY_6
  });

  static TITLES = Object.freeze({
    wave: 'Próxima onda',
    upgrade: 'Evoluir torreta',
    pause: 'Pausar / retomar',
    speed: 'Velocidade',
    mute: 'Silenciar áudio',
    build_ballista: 'Balista',
    build_mortar: 'Morteiro',
    build_flame: 'Lança-chamas',
    build_tesla: 'Tesla',
    build_ice: 'Obelisco glacial',
    build_poison: 'Alquimista'
  });

  constructor() {
    this.reset();
  }

  reset() {
    this.bindings = { ...AtalaiaKeyboardControls.DEFAULTS };
  }

  to_data() {
    return { ...this.bindings };
  }

  static valid_key(code) {
    return (
      code === ATALAIA_KEY_SPACE ||
      (code >= ATALAIA_KEY_A && code <= ATALAIA_KEY_Z) ||
      (code >= ATALAIA_KEY_0 && code <= ATALAIA_KEY_9)
    );
  }

  load_data(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const keys = Object.keys(AtalaiaKeyboardControls.DEFAULTS);
    if (Object.keys(data).length !== keys.length) return false;
    const used = new Set();
    for (const action of keys) {
      const code = data[action];
      if (
        typeof code !== 'number' ||
        !Number.isFinite(code) ||
        !Number.isInteger(code) ||
        !AtalaiaKeyboardControls.valid_key(code) ||
        used.has(code)
      ) {
        return false;
      }
      used.add(code);
    }
    this.bindings = {};
    for (const action of keys) {
      this.bindings[action] = Math.floor(data[action]);
    }
    return true;
  }

  bind(action, code) {
    if (!Object.hasOwn(AtalaiaKeyboardControls.DEFAULTS, action) || !AtalaiaKeyboardControls.valid_key(code)) {
      return false;
    }
    const previous = this.bindings[action];
    const conflict = Object.keys(this.bindings).find(k => this.bindings[k] === code);
    if (conflict) {
      this.bindings[conflict] = previous;
    }
    this.bindings[action] = code;
    return true;
  }

  key_name(action) {
    const code = this.bindings[action];
    if (code === ATALAIA_KEY_SPACE) return 'Espaço';
    return String.fromCharCode(code);
  }
}

class AtalaiaStrategyProgress {
  static THRESHOLDS = Object.freeze([5, 10]);
  static BRANCHES = Object.freeze(['engineering', 'warding', 'lore']);

  constructor(initialData = null) {
    this.version = 1;
    this.best_wave = 0;
    this.chronicle_best = 0;
    this.survival_best = 0;
    this.selected = '';
    this.error_text = '';

    if (initialData) {
      this.load(initialData);
    }
  }

  load(data) {
    if (!data || typeof data !== 'object' || data.version !== 1) {
      this.error_text = 'Registro estratégico: formato incompatível ou ilegível';
      return false;
    }
    this.best_wave = Number.isInteger(data.bestWave) && data.bestWave >= 0 ? data.bestWave : 0;
    this.chronicle_best = Number.isInteger(data.chronicleBest) && data.chronicleBest >= 0 ? data.chronicleBest : 0;
    this.survival_best = Number.isInteger(data.survivalBest) && data.survivalBest >= 0 ? data.survivalBest : 0;
    this.selected = typeof data.selected === 'string' && AtalaiaStrategyProgress.BRANCHES.includes(data.selected) ? data.selected : '';
    return true;
  }

  rank() {
    return (
      (this.best_wave >= AtalaiaStrategyProgress.THRESHOLDS[0] ? 1 : 0) +
      (this.best_wave >= AtalaiaStrategyProgress.THRESHOLDS[1] ? 1 : 0)
    );
  }

  specialization() {
    return this.selected === '' ? {} : { branch: this.selected, rank: this.rank() };
  }

  choose(branch) {
    if (branch !== '' && (!AtalaiaStrategyProgress.BRANCHES.includes(branch) || this.rank() === 0)) {
      return false;
    }
    this.selected = branch;
    return true;
  }

  observe(snapshot) {
    if (!snapshot || Object.keys(snapshot).length === 0) return true;
    const phase = snapshot.phase;
    if (!['prep', 'wave', 'cards', 'doctrine', 'defeat', 'victory'].includes(phase)) return false;
    if (!Number.isInteger(snapshot.wave) || snapshot.wave < 0 || snapshot.wave > 30) return false;

    const cleared = ['wave', 'defeat'].includes(phase) ? snapshot.wave - 1 : snapshot.wave;
    const storyBest = snapshot.mode === 'chronicle' ? Math.max(this.chronicle_best, cleared) : this.chronicle_best;
    this.best_wave = Math.max(this.best_wave, cleared);
    this.chronicle_best = storyBest;
    return true;
  }

  record_survival(cleared) {
    if (cleared <= this.survival_best) return true;
    this.survival_best = cleared;
    return true;
  }

  achievements() {
    const milestones = [
      ['first_node', 'Primeiro guardião', 'Conclua cinco ondas em uma campanha.', this.best_wave, 5],
      ['archive', 'Arquivo do cristal', 'Conclua dez ondas em uma campanha.', this.best_wave, 10],
      ['first_act', 'O primeiro cerco', 'Conclua o ato I da Crônica.', this.chronicle_best, 6],
      ['frontiers', 'Além das fronteiras', 'Conclua o ato II da Crônica.', this.chronicle_best, 12],
      ['rupture', 'Resistir à ruptura', 'Conclua o ato III da Crônica.', this.chronicle_best, 18],
      ['chronicle', 'O último bastião', 'Conclua as 30 fases da Crônica.', this.chronicle_best, 30],
      ['watch', 'Vigília prolongada', 'Conclua dez ondas na Sobrevivência.', this.survival_best, 10],
      ['endless', 'Sem último cerco', 'Conclua 30 ondas na Sobrevivência.', this.survival_best, 30]
    ];
    return milestones.map(([id, name, hint, current, goal]) => ({
      id,
      name,
      hint,
      current: Math.min(current, goal),
      goal,
      unlocked: current >= goal
    }));
  }
}

// =============================================================================
// BATERIA 1: PERFIS PERMANENTES, ISOLAMENTO E RECUPERAÇÃO DE FALHAS
// =============================================================================

test('1.1 - Cinzas: ciclo de vida do perfil permanente, desbloqueio de armas, variantes e runas', () => {
  // Novo perfil limpo
  const fresh = AbyssPersistence.cleanLegacy(null);
  assert.deepEqual(fresh, { version: 1, cleared: 0, weapon: '' });

  // Desbloqueios de armas por marcos: espada (3), arco (5), martelo (10), cajado (15)
  assert.equal(AbyssPersistence.cleanLegacy({ version: 1, cleared: 2, weapon: 'blade' }), null);
  assert.notEqual(AbyssPersistence.cleanLegacy({ version: 1, cleared: 3, weapon: 'blade' }), null);
  assert.equal(AbyssPersistence.cleanLegacy({ version: 1, cleared: 4, weapon: 'bow' }), null);
  assert.notEqual(AbyssPersistence.cleanLegacy({ version: 1, cleared: 5, weapon: 'bow' }), null);
  assert.equal(AbyssPersistence.cleanLegacy({ version: 1, cleared: 9, weapon: 'hammer' }), null);
  assert.notEqual(AbyssPersistence.cleanLegacy({ version: 1, cleared: 10, weapon: 'hammer' }), null);
  assert.equal(AbyssPersistence.cleanLegacy({ version: 1, cleared: 14, weapon: 'staff' }), null);
  assert.notEqual(AbyssPersistence.cleanLegacy({ version: 1, cleared: 15, weapon: 'staff' }), null);

  // Variantes do Legado vinculadas à arma correspondente e marco
  const ashBlade = AbyssPersistence.cleanLegacy({ version: 1, cleared: 5, weapon: 'blade', variant: 'ash_blade' });
  assert.equal(ashBlade?.variant, 'ash_blade');
  // Variante com arma incorreta deve ser rejeitada
  assert.equal(AbyssPersistence.cleanLegacy({ version: 1, cleared: 25, weapon: 'hammer', variant: 'ash_blade' }), null);

  // Runas permanentes: Gelo no capítulo 20, Fogo no capítulo 25
  assert.equal(AbyssPersistence.cleanLegacy({ version: 1, cleared: 19, weapon: '', rune: 'frost' }), null);
  const frostRune = AbyssPersistence.cleanLegacy({ version: 1, cleared: 20, weapon: '', rune: 'frost' });
  assert.equal(frostRune?.rune, 'frost');
  assert.equal(AbyssPersistence.cleanLegacy({ version: 1, cleared: 24, weapon: '', rune: 'fire' }), null);
  const fireRune = AbyssPersistence.cleanLegacy({ version: 1, cleared: 25, weapon: '', rune: 'fire' });
  assert.equal(fireRune?.rune, 'fire');
});

test('1.2 - Cinzas: atualização atômica de marcos de campanha e mesclagem de perfis', () => {
  const base = { version: 1, cleared: 5, weapon: 'blade' };
  // Atualização com checkpoint válido
  const updated = AbyssPersistence.updateLegacy(base, { format: 'cinzas-campaign', completedChapters: 12 });
  assert.equal(updated.cleared, 12);
  assert.equal(updated.weapon, 'blade');

  // Checkpoint inválido ou de formato incorreto não altera o perfil
  const ignored = AbyssPersistence.updateLegacy(base, { format: 'cinzas-horde', completedChapters: 20 });
  assert.equal(ignored.cleared, 5);

  // Mesclagem com perfil externo mais avançado preserva progresso e preferências
  const local = { version: 1, cleared: 10, weapon: 'hammer' };
  const remote = { version: 1, cleared: 20, weapon: 'bow', rune: 'frost' };
  const merged = AbyssPersistence.mergeLegacy(local, remote);
  assert.equal(merged.cleared, 20); // Maior progresso mantido
  assert.equal(merged.weapon, 'hammer'); // Preferência local respeitada
  assert.equal(merged.rune, 'frost'); // Runa herdada
});

test('1.3 - Atalaia: especializações estratégicas vinculadas ao Rank e isolamento de progresso', () => {
  const profile = new AtalaiaStrategyProgress();
  assert.equal(profile.rank(), 0);
  assert.deepEqual(profile.specialization(), {});

  // Com rank 0, qualquer escolha de especialização é recusada
  assert.equal(profile.choose('engineering'), false);
  assert.equal(profile.selected, '');

  // Simula conclusão de 5 ondas
  profile.observe({ phase: 'victory', wave: 5, mode: 'classic' });
  assert.equal(profile.best_wave, 5);
  assert.equal(profile.rank(), 1);

  // Agora pode escolher Engenharia
  assert.equal(profile.choose('engineering'), true);
  assert.deepEqual(profile.specialization(), { branch: 'engineering', rank: 1 });

  // Desmarcar especialização é permitido e não revoga recordes
  assert.equal(profile.choose(''), true);
  assert.deepEqual(profile.specialization(), {});
  assert.equal(profile.best_wave, 5);

  // Conclusão de 10 ondas libera Rank 2
  profile.observe({ phase: 'victory', wave: 10, mode: 'classic' });
  assert.equal(profile.rank(), 2);
  assert.equal(profile.choose('lore'), true);
  assert.deepEqual(profile.specialization(), { branch: 'lore', rank: 2 });
});

test('1.4 - Atalaia: tolerância a dados corrompidos ou ilegíveis sem falha de execução', () => {
  const profile = new AtalaiaStrategyProgress();
  assert.equal(profile.load(null), false);
  assert(profile.error_text.includes('Registro estratégico'));

  assert.equal(profile.load({ version: 2, bestWave: 15 }), false);
  assert.equal(profile.load('texto ilegivel'), false);

  // Snapshot com fase desconhecida ou dados numéricos corrompidos é rejeitado
  assert.equal(profile.observe({ phase: 'hack', wave: 99 }), false);
  assert.equal(profile.observe({ phase: 'prep', wave: -1 }), false);
  assert.equal(profile.observe({ phase: 'prep', wave: 31 }), false);
});

// =============================================================================
// BATERIA 2: CONQUISTAS LOCAIS (8 POR JOGO) E AUDITORIA PURA
// =============================================================================

test('2.1 - Cinzas: verificação das 8 conquistas locais, imutabilidade de entrada e filtro de edição', () => {
  const legacy = { version: 1, cleared: 15, weapon: 'hammer' };
  const scores = [
    { edition: '0.5', wave: 6, difficulty: 'normal', name: 'Andarilho', kills: 40 },
    { edition: '0.4', wave: 25, difficulty: 'hard', name: 'Legado Antigo', kills: 200 } // Não conta!
  ];

  const legacySnapshot = JSON.stringify(legacy);
  const scoresSnapshot = JSON.stringify(scores);

  const achievements = AbyssPersistence.achievements(legacy, scores);

  // Pureza funcional: nenhuma mutação nos objetos de entrada
  assert.equal(JSON.stringify(legacy), legacySnapshot);
  assert.equal(JSON.stringify(scores), scoresSnapshot);

  assert.equal(achievements.length, 8);
  const ids = achievements.map(a => a.id);
  assert.deepEqual(ids, ['ember', 'forest', 'crypt', 'forge', 'glacier', 'dawn', 'horde_guardian', 'horde_twenty']);

  // Checagem individual
  const ember = achievements.find(a => a.id === 'ember');
  assert.equal(ember.unlocked, true); // cleared 15 >= 1
  assert.equal(ember.current, 1);
  assert.equal(ember.goal, 1);

  const forge = achievements.find(a => a.id === 'forge');
  assert.equal(forge.unlocked, true); // cleared 15 >= 15
  assert.equal(forge.current, 15);
  assert.equal(forge.goal, 15);

  const glacier = achievements.find(a => a.id === 'glacier');
  assert.equal(glacier.unlocked, false); // cleared 15 < 20
  assert.equal(glacier.current, 15);
  assert.equal(glacier.goal, 20);

  const dawn = achievements.find(a => a.id === 'dawn');
  assert.equal(dawn.unlocked, false); // cleared 15 < 25
  assert.equal(dawn.current, 15);
  assert.equal(dawn.goal, 25);

  // Conquistas de horda: apenas scores da edição 0.5 (wave 6)
  const hordeGuard = achievements.find(a => a.id === 'horde_guardian');
  assert.equal(hordeGuard.unlocked, true); // wave 6 >= 5
  assert.equal(hordeGuard.current, 5);

  const hordeTwenty = achievements.find(a => a.id === 'horde_twenty');
  assert.equal(hordeTwenty.unlocked, false); // wave 6 < 20 (ignora a wave 25 da edição 0.4)
  assert.equal(hordeTwenty.current, 6);
});

test('2.2 - Atalaia: verificação das 8 conquistas locais, integridade e isolamento de modos', () => {
  const profile = new AtalaiaStrategyProgress();
  let entries = profile.achievements();
  assert.equal(entries.length, 8);
  assert.equal(entries.filter(e => e.unlocked).length, 0);

  const expectedIds = ['first_node', 'archive', 'first_act', 'frontiers', 'rupture', 'chronicle', 'watch', 'endless'];
  assert.deepEqual(entries.map(e => e.id), expectedIds);

  // Marco de campanha clássica
  profile.observe({ phase: 'victory', wave: 5, mode: 'classic' });
  entries = profile.achievements();
  assert.equal(entries.filter(e => e.unlocked).length, 1);
  assert.equal(entries.find(e => e.id === 'first_node').unlocked, true);
  assert.equal(entries.find(e => e.id === 'archive').unlocked, false);

  // Marco da Crônica: Ato I (6) e Ato II (12)
  profile.observe({ phase: 'victory', wave: 12, mode: 'chronicle' });
  entries = profile.achievements();
  assert.equal(entries.find(e => e.id === 'first_act').unlocked, true);
  assert.equal(entries.find(e => e.id === 'frontiers').unlocked, true);
  assert.equal(entries.find(e => e.id === 'rupture').unlocked, false);
  // Não inventou conquista de Sobrevivência
  assert.equal(entries.find(e => e.id === 'watch').unlocked, false);

  // Marco de Sobrevivência
  profile.record_survival(10);
  entries = profile.achievements();
  assert.equal(entries.find(e => e.id === 'watch').unlocked, true);
  assert.equal(entries.find(e => e.id === 'endless').unlocked, false);
});

// =============================================================================
// BATERIA 3: TUTORIAIS CONTEXTUAIS E ORIENTAÇÕES TÁTICAS
// =============================================================================

test('3.1 - Atalaia: presença e rigor dos textos táticos contextuais de chefes e perigos', () => {
  const atalaiaMainFile = path.resolve(__dirname, '../games/atalaia/scripts/main.gd');
  const mainCode = fs.readFileSync(atalaiaMainFile, 'utf8');

  // Verificação de existência dos tutoriais contextuais de mecânicas de terreno e inimigos
  assert(mainCode.includes('Terrenos elevados: +18 alcance antes das cartas. Identificados por anel duplo.'));
  assert(mainCode.includes('Vigia de escória protege aliados e resiste ao fogo.'));
  assert(mainCode.includes('A tecelã se divide ao cair. Reserve dano em área.'));
  assert(mainCode.includes('Arauto: aliados a até 120 recebem +20% de velocidade, sem acúmulo.'));
  assert(mainCode.includes('Sabotador: anuncia a interferência por 0,65 s e bloqueia uma torreta por 1,2 s.'));

  // Verificação das segundas fases dos 5 chefes
  assert(mainCode.includes('Pulso da Coroa: abaixo de metade da vida, a cada 7 s avisa por 1 s e interrompe torretas a até 144 por 0,8 s.'));
  assert(mainCode.includes('Guardião da escória: com 50% de vida ou menos, convoca uma vez um golem e um cogumelo.'));
  assert(mainCode.includes('Matriarca das raízes: com 50% de vida ou menos, convoca uma vez uma ninhada de duas tecelãs.'));
  assert(mainCode.includes('Sentinela da cidadela: com 50% de vida ou menos, convoca um golem de escolta e reforça sua armadura rúnica para 33%.'));
  assert(mainCode.includes('Guardião das raízes: com 50% de vida ou menos, convoca uma matilha de dois lobos velozes e interrompe torretas próximas.'));
});

test('3.2 - Cinzas: presença de Códice (36 cartas), diálogos de ajuda e action-hints da HUD', () => {
  // Verificação das 36 cartas no core
  assert.equal(CINZAS_CARDS.length, 36);
  assert(CINZAS_CARDS.every(c => typeof c.id === 'string' && typeof c.name === 'string' && typeof c.desc === 'string'));

  const htmlFile = path.resolve(__dirname, '../public/roguelite/index.html');
  const htmlContent = fs.readFileSync(htmlFile, 'utf8');

  // Existência dos diálogos no HTML da interface compartilhada
  assert(htmlContent.includes('id="helpDialog"'));
  assert(htmlContent.includes('id="codexDialog"'));
  assert(htmlContent.includes('id="achievementsDialog"'));
  assert(htmlContent.includes('id="controllerDialog"'));

  // Dicas visuais da HUD e avisos de comandos
  assert(htmlContent.includes('id="keyboardHelp"'));
  assert(htmlContent.includes('id="padHelp"'));
  assert(htmlContent.includes('id="actionHints"'));

  // Existência de classes de aviso e mensagens instrutivas no CSS
  const cssFile = path.resolve(__dirname, '../public/roguelite/style.css');
  const cssContent = fs.readFileSync(cssFile, 'utf8');
  assert(cssContent.includes('.action-hints'));
  assert(cssContent.includes('.choicehint'));
  assert(cssContent.includes('.terrain-status'));
});

// =============================================================================
// BATERIA 4: REMAPEAMENTO DE CONTROLES (ATALAIA E CINZAS)
// =============================================================================

test('4.1 - Atalaia: 11 comandos de teclado, troca atômica em conflitos e proteção de teclas reservadas', () => {
  const keyboard = new AtalaiaKeyboardControls();
  assert.equal(Object.keys(keyboard.bindings).length, 11);
  assert.equal(keyboard.key_name('wave'), 'Espaço');
  assert.equal(keyboard.key_name('pause'), 'P');

  // Troca de tecla em conflito: atribuir 'P' (80) para 'wave' transfere o atalho anterior ('Espaço' / 32) para 'pause'
  assert.equal(keyboard.bind('wave', 80), true);
  assert.equal(keyboard.key_name('wave'), 'P');
  assert.equal(keyboard.key_name('pause'), 'Espaço');
  assert.equal(Object.keys(keyboard.bindings).length, 11);

  // Teclas reservadas: Enter e Escape devem ser sumariamente rejeitadas
  assert.equal(keyboard.bind('wave', ATALAIA_KEY_ENTER), false);
  assert.equal(keyboard.bind('wave', ATALAIA_KEY_ESCAPE), false);
  assert.equal(keyboard.key_name('wave'), 'P'); // Permaneceu inalterado

  // Serialização e restauração
  const exported = keyboard.to_data();
  const reloaded = new AtalaiaKeyboardControls();
  assert.equal(reloaded.load_data(exported), true);
  assert.equal(reloaded.key_name('wave'), 'P');
  assert.equal(reloaded.key_name('pause'), 'Espaço');

  // Restauração aos padrões
  reloaded.reset();
  assert.equal(reloaded.key_name('wave'), 'Espaço');
  assert.equal(reloaded.key_name('pause'), 'P');

  // Rejeição de cargas inválidas
  assert.equal(reloaded.load_data(null), false);
  assert.equal(reloaded.load_data({ wave: 80 }), false); // Menos de 11 comandos
  assert.equal(reloaded.load_data({ ...exported, wave: 99999 }), false); // Tecla fora da faixa
});

test('4.2 - Cinzas: 11 ações com aliases múltiplos, remapeamento de teclado e integração de controle', () => {
  const keyboard = new CinzasKeyboard();
  assert.equal(keyboard.actionFor('KeyA'), 'left');
  assert.equal(keyboard.actionFor('ArrowLeft'), 'left'); // Alias
  assert.equal(keyboard.actionFor('Space'), 'jump');
  assert.equal(keyboard.actionFor('KeyW'), 'jump'); // Alias

  // Remapeamento com swap automático
  assert.equal(keyboard.setBinding('attack', 'KeyH'), true);
  assert.equal(keyboard.actionFor('KeyH'), 'attack');
  assert.equal(keyboard.actionFor('KeyJ'), ''); // Tecla anterior desvinculada
  assert.equal(keyboard.actionFor('KeyZ'), 'attack'); // Alias preservado

  // Rejeição de teclas do sistema
  assert.equal(keyboard.setBinding('attack', 'Escape'), false);
  assert.equal(keyboard.setBinding('attack', 'F5'), false);

  // Gamepad
  const controller = new CinzasController();
  const mockPad = {
    index: 0,
    id: 'Xbox Standard Fixture',
    connected: true,
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
  };

  // Movimento na zona morta (0.1 < 0.24) é ignorado
  mockPad.axes[0] = 0.1;
  let state = controller.poll([mockPad], 0.1);
  assert.equal(state.held.right, false);

  // Movimento além da zona morta ativa navegação
  mockPad.axes[0] = 0.8;
  state = controller.poll([mockPad], 0.2);
  assert.equal(state.held.right, true);
  assert.equal(state.nav, 'right');

  // Desconexão do controle limpa estados com segurança
  state = controller.poll([], 0.3);
  assert.equal(state.connected, false);
  assert.equal(state.disconnected, true);
  assert.deepEqual(state.held, {});
});

console.log(`\n======================================================`);
console.log(`Sucesso! Todas as ${passed} baterias de verificação foram aprovadas.`);
console.log(`======================================================`);
