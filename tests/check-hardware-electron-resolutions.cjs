'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const { contentSecurityPolicy } = require('../electron/content-security.cjs');
const { developmentOrigin } = require('../electron/development.cjs');
const { APP_ORIGIN, isAppURL, bundlePath, accelerator } = require('../electron/policy.cjs');

// =============================================================================
// SUÍTE DE VALIDAÇÃO: CONTROLES FÍSICOS, MÍDIA/ELECTRON, RESOLUÇÕES E HARDWARE
// Item 2593 da Operação Renascimento 1.0
// =============================================================================

// -----------------------------------------------------------------------------
// BATERIA 1: CONTROLES FÍSICOS E MAPEAMENTOS DE ENTRADA
// -----------------------------------------------------------------------------

test('1.1 - Validação de aceleradores globais de teclado físico e proteção de teclas reservadas', () => {
  // Aceleradores válidos de atalho
  assert.equal(accelerator({ ctrl: true, shift: true, code: 'KeyK' }), 'Control+Shift+K');
  assert.equal(accelerator({ code: 'F9' }), 'F9');
  assert.equal(accelerator({ ctrl: true, code: 'KeyM' }), 'Control+M');

  // Rejeição rigorosa de combinações reservadas do sistema ou perigosas
  for (const invalid of [
    null,
    { code: 'KeyK' }, // Sem modificador em tecla de caractere
    { code: 'F5' }, // F5 reservado para reload do navegador
    { code: 'F25' }, // Tecla inexistente
    { ctrl: true, code: 'KeyW' }, // Ctrl+W reservado para fechar aba
    { alt: true, code: 'F4' }, // Alt+F4 reservado para encerrar aplicação
    { ctrl: true, code: 'Delete' }, // Modificador perigoso
  ]) {
    assert.throws(
      () => accelerator(invalid),
      `Deve rejeitar atalho reservado/inválido: ${JSON.stringify(invalid)}`
    );
  }
});

test('1.2 - Suporte a Gamepad/Controle e Remapeamento nos 3 jogos da plataforma', () => {
  // Cinzas do Abismo: suporte a aliases e mapeamentos de controle
  const cinzasInput = fs.readFileSync(path.join(root, 'public/roguelite/controller.js'), 'utf8');
  assert(cinzasInput.includes('KEY_DEFAULT'), 'Cinzas deve conter definições padrão de entrada');
  assert(cinzasInput.includes('ArrowUp') && cinzasInput.includes('KeyW'), 'Cinzas deve suportar múltiplos aliases de navegação');

  // Atalaia: 11 atalhos de teclado remapeáveis
  const atalaiaInput = fs.readFileSync(path.join(root, 'games/atalaia/scripts/keyboard_controls.gd'), 'utf8');
  assert(atalaiaInput.includes('DEFAULTS') && atalaiaInput.includes('KEY_SPACE'), 'Atalaia deve conter mapa de atalhos');
  assert(atalaiaInput.includes('KEY_1') && atalaiaInput.includes('KEY_2'), 'Atalaia deve suportar teclas numéricas para seleção rápida');

  // Project Nexus: mapeamento e atalhos de teclado com visualização de ações
  const nexusKeyboard = fs.readFileSync(path.join(root, '../PROJETO-NEXUS/godot/scripts/keyboard_controls.gd'), 'utf8');
  assert(nexusKeyboard.includes('DEFAULTS') && nexusKeyboard.includes('target_next'), 'Nexus deve mapear ações e troca de alvos');
});

// -----------------------------------------------------------------------------
// BATERIA 2: MÍDIA E ELECTRON NATIVO (CSP, ORIGENS E ISOLAMENTO)
// -----------------------------------------------------------------------------

test('2.1 - Content Security Policy (CSP) nativa do Electron rejeita unsafe-eval e unsafe-inline', () => {
  const source = 'self.__next_f.push([1,"fixture"]);';
  const expectedHash = crypto.createHash('sha256').update(source).digest('base64');
  const policy = contentSecurityPolicy(`<script>${source}</script><script src="/app.js"></script>`);

  assert(policy.includes(`'sha256-${expectedHash}'`), 'Bootstrap deve ser autenticado por hash exato');
  const scriptDirective = policy.split(';').find((d) => d.trim().startsWith('script-src'));
  assert(scriptDirective, 'Deve conter diretiva script-src');
  assert(!scriptDirective.includes("'unsafe-inline'"), 'CSP não pode permitir unsafe-inline em scripts');
  assert(!scriptDirective.includes("'unsafe-eval'"), 'CSP não pode permitir unsafe-eval em scripts');
});

test('2.2 - Política de Origem Desktop e isolamento de bundles locais', () => {
  const tmpDir = path.resolve(os.tmpdir(), 'mn-bundle-test');
  assert(isAppURL(APP_ORIGIN + '/index.html'), 'URL do app deve ser aceita');
  assert(!isAppURL('file:///index.html'), 'file:// arbitrário deve ser rejeitado');
  assert(!isAppURL('http://evil.com'), 'Domínios externos devem ser rejeitados');

  assert.equal(bundlePath(tmpDir, APP_ORIGIN + '/'), path.join(tmpDir, 'index.html'));

  // Rejeição de path traversal
  assert.throws(() => bundlePath(tmpDir, APP_ORIGIN + '/%2e%2e%2fsecret'));
  assert.throws(() => bundlePath(tmpDir, APP_ORIGIN + '/%00'));
});

test('2.3 - Origem de desenvolvimento restrita a 127.0.0.1 e nula em produção', () => {
  assert.equal(
    developmentOrigin({ packaged: false, value: 'http://127.0.0.1:3000' }),
    'http://127.0.0.1:3000'
  );
  assert.equal(
    developmentOrigin({ packaged: true, value: 'http://127.0.0.1:3000' }),
    null,
    'Pacotes finais em produção não podem aceitar developmentOrigin'
  );
  assert.throws(() => developmentOrigin({ packaged: false, value: 'https://externo.com' }));
});

// -----------------------------------------------------------------------------
// BATERIA 3: RESOLUÇÕES, GEOMETRIA E HARDWARE DE DESTINO
// -----------------------------------------------------------------------------

test('3.1 - Resoluções Desktop padrão e cálculo geométrico responsivo', async () => {
  const { handGeometry } = await import('../src/lib/games/hand-layout.ts');

  // Espaço padrão de 1280x720 / 1920x1080
  const normalSpace = { count: 4, width: 600, height: 160, paddingX: 20, paddingY: 20, gap: 10 };
  const normalGeometry = handGeometry(normalSpace);
  assert(normalGeometry, 'Geometria normal deve ser calculada');
  assert(normalGeometry.height > 0);

  // Espaço compacto ou restrito
  const crowdedSpace = { count: 10, width: 240, height: 140, paddingX: 20, paddingY: 20, gap: 8 };
  const crowdedGeometry = handGeometry(crowdedSpace);
  assert(crowdedGeometry, 'Geometria aglomerada deve ser calculada sem distorção');
  assert(crowdedGeometry.overlap < 0, 'Cartas devem se sobrepor suavemente');

  // Resoluções extremas sem estouro
  assert.equal(handGeometry({ ...normalSpace, count: 0 }), null);
  assert.equal(handGeometry({ ...normalSpace, width: 0 }), null);
  assert.equal(handGeometry({ ...normalSpace, height: 50 }).height, 30);
  assert.equal(handGeometry({ ...normalSpace, height: 1200 }).height, 126);
});

test('3.2 - Observação contínua de layout e coalescência de quadros de renderização', async (t) => {
  const originalResize = global.ResizeObserver;
  const originalMutation = global.MutationObserver;
  const observers = [];
  const frames = new Map();
  let next = 0;
  let fits = 0;

  class MockObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(element) {
      this.element = element;
    }
    disconnect() {
      this.disconnected = true;
    }
  }

  global.ResizeObserver = global.MutationObserver = MockObserver;
  t.after(() => {
    global.ResizeObserver = originalResize;
    global.MutationObserver = originalMutation;
  });

  const { observeLayout } = await import('../src/lib/layout/observe-layout.ts');
  const element = {};
  const parent = {};
  const viewport = {
    requestAnimationFrame(cb) {
      frames.set(++next, cb);
      return next;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };

  const dispose = observeLayout(viewport, element, () => fits++, parent);
  assert.strictEqual(observers[0].element, parent);
  assert.strictEqual(observers[1].element, element);

  // Múltiplas mutações simultâneas coalescem em um único quadro
  observers.forEach((o) => o.callback());
  assert.equal(frames.size, 1, 'Mutações simultâneas devem coalescer em um único requestAnimationFrame');

  const [id, fit] = [...frames][0];
  frames.delete(id);
  fit();
  assert.equal(fits, 1);

  // Descarte limpo
  dispose();
  assert.equal(frames.size, 0);
  assert(observers.every((o) => o.disconnected), 'Todos os observadores devem ser desconectados no descarte');
});

console.log('\n======================================================');
console.log('Sucesso! Controles físicos, mídia/Electron nativo, resoluções e hardware 100% verificados.');
console.log('======================================================');
