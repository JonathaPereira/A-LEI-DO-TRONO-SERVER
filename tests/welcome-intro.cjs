'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('welcome intro helpers build stable keys, greetings, roles, load states, and replay events', async () => {
  const {
    WELCOME_INTRO_DURATION_MS,
    WELCOME_INTRO_EVENT,
    WELCOME_INTRO_EXIT_DELAY_MS,
    WELCOME_INTRO_MIN_READY_DURATION_MS,
    WELCOME_INTRO_MIN_READY_EXIT_MS,
    buildWelcomeIdentityKey,
    getWelcomeGreeting,
    getWelcomeLoadStatus,
    getWelcomeRoleLabel,
    triggerWelcomeIntroReplay,
  } = await import('../src/lib/application/welcome-intro.ts');

  assert(
    WELCOME_INTRO_MIN_READY_EXIT_MS > 0 &&
      WELCOME_INTRO_MIN_READY_EXIT_MS < WELCOME_INTRO_EXIT_DELAY_MS,
  );
  assert(
    WELCOME_INTRO_MIN_READY_DURATION_MS > WELCOME_INTRO_MIN_READY_EXIT_MS &&
      WELCOME_INTRO_MIN_READY_DURATION_MS < WELCOME_INTRO_DURATION_MS,
  );

  assert.equal(buildWelcomeIdentityKey(null, false), null);
  assert.equal(buildWelcomeIdentityKey({ id: 'u-1', role: 'creator' }, false), 'user:u-1');
  assert.equal(
    buildWelcomeIdentityKey({ id: 'u-1', role: 'admin' }, false),
    'user:u-1',
    'Same account ID must stay stable across silent role syncs so the overlay never hijacks an open session',
  );
  assert.equal(buildWelcomeIdentityKey({ id: 'g-1', role: 'guest' }, true), 'guest:g-1');

  assert.equal(
    getWelcomeGreeting({ nickname: '  Jonatha Pereira  ' }),
    'Bem vindo, Jonatha Pereira',
  );
  assert.equal(getWelcomeGreeting({ nickname: '' }), 'Bem vindo à Corte');
  assert.equal(getWelcomeGreeting(null), 'Bem vindo à Corte');

  assert.equal(getWelcomeRoleLabel({ role: 'creator' }, false), 'Criador da Corte');
  assert.equal(getWelcomeRoleLabel({ role: 'admin' }, false), 'Administrador da Corte');
  assert.equal(getWelcomeRoleLabel({ role: 'member' }, false), 'Membro da Corte');
  assert.equal(getWelcomeRoleLabel({ role: 'member' }, true), 'Convidado da Mesa');

  assert.equal(
    getWelcomeLoadStatus({
      connected: false,
      channelsReady: false,
      membersReady: false,
      isGuest: false,
    }),
    'Conectando aos servidores da Corte…',
  );
  assert.equal(
    getWelcomeLoadStatus({
      connected: true,
      channelsReady: false,
      membersReady: false,
      isGuest: false,
    }),
    'Carregando canais, mensagens e avatar…',
  );
  assert.equal(
    getWelcomeLoadStatus({
      connected: true,
      channelsReady: true,
      membersReady: false,
      isGuest: false,
    }),
    'Sincronizando membros e presença…',
  );
  assert.equal(
    getWelcomeLoadStatus({
      connected: true,
      channelsReady: true,
      membersReady: true,
      isGuest: false,
    }),
    'Corte sincronizada · Abrindo sua mesa…',
  );
  assert.equal(
    getWelcomeLoadStatus({
      connected: true,
      channelsReady: false,
      membersReady: false,
      isGuest: true,
    }),
    'Mesa pronta · Bem-vindo à Corte',
  );

  let fired = 0;
  const target = new EventTarget();
  target.addEventListener(WELCOME_INTRO_EVENT, () => {
    fired += 1;
  });
  triggerWelcomeIntroReplay(target);
  assert.equal(fired, 1);
});
