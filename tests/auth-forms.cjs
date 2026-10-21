'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createAuthForms } = require('../src/lib/auth/forms.ts');
const { createAccountSession } = require('../src/lib/auth/session.ts');
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(ports = {}) {
  const calls = [],
    values = new Map(),
    listeners = [],
    native = [];
  let callback = ports.callback,
    entered = 0,
    disconnected = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const api = async (...args) => {
    calls.push(args);
    if (ports.api) return ports.api(...args);
    if (args[0] === 'login')
      return {
        user: {
          id: 'a',
          nickname: 'Conta',
          email: 'a@example.test',
          role: 'member',
          permissions: {},
        },
        session: { access_token: 'access', refresh_token: 'refresh', expires_at: 9999999999 },
      };
    return { message: 'Confira seu e-mail.', recovery_token: 'private-recovery' };
  };
  let forms;
  const session = createAccountSession({
    api,
    storage,
    preferences: storage,
    native: ports.native
      ? {
          readSession: async () => null,
          saveSession: async (value) => {
            native.push(value);
          },
        }
      : undefined,
    authenticate: async () => {},
    authenticateGuest:
      ports.guest ??
      (async (name) => ({
        id: 'guest',
        nickname: name,
        ticket: 'ticket',
        expiresAt: Date.now() + 100000,
      })),
    disconnect: () => disconnected++,
    leaveIdentity: async () => {},
    showPortal: () => {},
    needLogin: () => forms.open(),
    needGuest: () => forms.openGuest(),
    offline: () => {},
    changed: () => {},
    setTimer: () => 1,
    clearTimer: () => {},
  });
  forms = createAuthForms({
    session,
    api,
    takeCallback: () => {
      const value = callback;
      callback = undefined;
      return value;
    },
    disconnect: () => disconnected++,
    enterGame: () => entered++,
  });
  forms.subscribe(() => listeners.push(forms.getSnapshot()));
  return {
    forms,
    session,
    calls,
    native,
    values,
    listeners,
    get entered() {
      return entered;
    },
    get disconnected() {
      return disconnected;
    },
    dispose() {
      forms.dispose();
      session.dispose();
    },
  };
}
const callback = (patch = {}) => ({
  token_hash: 'one-use',
  type: 'recovery',
  access_token: null,
  refresh_token: null,
  expires_at: null,
  hashType: null,
  error: null,
  ...patch,
});
test('signup policy and confirmation are checked before transport and mode changes clear passwords', async () => {
  const f = fixture();
  try {
    f.forms.open('signup');
    f.forms.setField('password', 'weak');
    await f.forms.submit();
    assert.equal(f.calls.length, 0);
    assert.equal(f.forms.getSnapshot().focus, 'password');
    f.forms.setField('password', 'Senha12!');
    f.forms.setField('confirm', 'Other12!');
    await f.forms.submit();
    assert.equal(f.forms.getSnapshot().message, 'As senhas não são iguais.');
    f.forms.setField('confirm', 'Senha12!');
    assert.equal(f.forms.getSnapshot().message, '');
    f.forms.setField('email', ' a@example.test ');
    await f.forms.submit();
    assert.equal(f.calls[0][0], 'signup');
    assert.equal(f.calls[0][1].email, 'a@example.test');
    assert.equal(f.forms.getSnapshot().mode, 'login');
    assert.equal(f.forms.getSnapshot().fields.email, 'a@example.test');
    assert.equal(f.forms.getSnapshot().fields.password, '');
    f.forms.open('signup');
    f.forms.setField('password', 'Aa1!' + 'é'.repeat(40));
    await f.forms.submit();
    assert.match(f.forms.getSnapshot().message, /72 bytes/);
    assert.equal(f.calls.length, 1);
  } finally {
    f.dispose();
  }
});
test('a late recovery request cannot replace a newer mode or retain the entered password after close', async () => {
  const pending = deferred(),
    f = fixture({ api: () => pending.promise });
  try {
    f.forms.open('recover');
    f.forms.setField('email', 'a@example.test');
    const work = f.forms.submit();
    assert.equal(f.forms.getSnapshot().busy, true);
    f.forms.close();
    assert.equal(f.forms.getSnapshot().open, true);
    f.forms.open('signup');
    pending.resolve({ message: 'Old result' });
    await work;
    assert.equal(f.forms.getSnapshot().mode, 'signup');
    assert.equal(f.forms.getSnapshot().message, '');
    f.forms.setField('password', 'Senha12!');
    f.forms.close();
    assert.equal(f.forms.getSnapshot().fields.password, '');
  } finally {
    f.dispose();
  }
});
test('callback recovery token is consumed once, stays private and is cleared after successful reset', async () => {
  const f = fixture({ callback: callback() });
  try {
    await f.forms.start();
    assert.equal(f.forms.getSnapshot().mode, 'reset');
    assert.equal(await f.forms.callback(), false);
    assert.equal(JSON.stringify([...f.values]), '[]');
    assert.equal(JSON.stringify(f.listeners).includes('private-recovery'), false);
    f.forms.setField('password', 'Senha12!');
    f.forms.setField('confirm', 'Senha12!');
    await f.forms.submit();
    const reset = f.calls.find(([path]) => path === 'reset');
    assert.equal(reset[2], 'private-recovery');
    assert.equal(f.forms.getSnapshot().mode, 'login');
    f.forms.open('reset');
    f.forms.setField('password', 'Senha12!');
    f.forms.setField('confirm', 'Senha12!');
    await f.forms.submit();
    assert.match(f.forms.getSnapshot().message, /expirou/);
    assert.equal(f.calls.filter(([path]) => path === 'reset').length, 1);
  } finally {
    f.dispose();
  }
});
test('late verification and disposal cannot reopen a replaced dialog', async () => {
  const gate = deferred(),
    f = fixture({ callback: callback(), api: () => gate.promise });
  const work = f.forms.start();
  await tick();
  f.forms.open('login');
  gate.resolve({ recovery_token: 'late' });
  await work;
  assert.equal(f.forms.getSnapshot().mode, 'login');
  assert.equal(f.forms.getSnapshot().busy, false);
  f.forms.dispose();
  f.forms.open('signup');
  assert.equal(f.forms.getSnapshot().open, false);
  f.session.dispose();
});
test('implicit confirmation checks the access token then revokes it without persisting a member session', async () => {
  const f = fixture({
    callback: callback({ token_hash: null, type: 'signup', access_token: 'implicit' }),
  });
  try {
    await f.forms.start();
    assert.deepEqual(
      f.calls.map((call) => [call[0], call[2]]),
      [
        ['me', 'implicit'],
        ['logout', 'implicit'],
      ],
    );
    assert.equal(f.forms.getSnapshot().mode, 'login');
    assert.equal(f.session.getSnapshot().user, null);
    assert.equal(f.values.size, 0);
  } finally {
    f.dispose();
  }
});
test('closing a pending guest submission cancels identity and prevents entering the game later', async () => {
  const gate = deferred(),
    f = fixture({ guest: () => gate.promise });
  try {
    f.forms.openGuest();
    f.forms.setGuestName('Convidado');
    const work = f.forms.submitGuest();
    f.forms.closeGuest();
    await work;
    gate.resolve({
      id: 'guest',
      nickname: 'Old guest',
      ticket: 'old',
      expiresAt: Date.now() + 100000,
    });
    await tick();
    assert.equal(f.entered, 0);
    assert.equal(f.session.getSnapshot().guest, null);
    assert.equal(f.forms.getSnapshot().guestOpen, false);
  } finally {
    f.dispose();
  }
});
test('login serializes submission, clears password and reflects the desktop remember choice', async () => {
  const f = fixture({ native: true });
  try {
    await f.forms.start();
    assert.equal(f.forms.getSnapshot().remembered, true);
    await f.forms.setRemember(false);
    f.forms.setField('email', 'a@example.test');
    f.forms.setField('password', 'legacy-password');
    const work = f.forms.submit();
    await f.forms.submit();
    await work;
    assert.equal(f.calls.filter(([path]) => path === 'login').length, 1);
    assert.equal(f.forms.getSnapshot().open, false);
    assert.equal(f.forms.getSnapshot().fields.password, '');
    assert.equal(f.forms.getSnapshot().remembered, false);
    assert.equal(f.native.at(-1), null);
  } finally {
    f.dispose();
  }
});
