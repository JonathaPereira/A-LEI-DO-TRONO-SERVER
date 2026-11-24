'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { CREATOR_EMAIL, accountRole, permissions } = require('../server/roles.ts');
const registeredAccountsMod = require('../src/lib/profiles/registered-accounts.ts');

test('only verified creator role receives viewEmails permission', () => {
  assert.equal(permissions('creator').viewEmails, true);
  assert.equal(permissions('admin').viewEmails, false);
  assert.equal(permissions('member').viewEmails, false);
  assert.equal(permissions('guest').viewEmails, false);

  assert.equal(
    accountRole({ email: CREATOR_EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z' }),
    'creator',
  );
  assert.equal(accountRole({ email: CREATOR_EMAIL, email_confirmed_at: null }), 'member');
  assert.equal(
    accountRole(
      { email: 'admin@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' },
      { community_role: 'admin' },
    ),
    'admin',
  );
});

test('filterRegisteredAccounts matches nickname or email case-insensitively without mutating rows', () => {
  const { filterRegisteredAccounts } = registeredAccountsMod;
  assert.equal(typeof filterRegisteredAccounts, 'function');
  const rows = Object.freeze([
    { id: '1', nickname: 'Alice Corte', email: 'alice@trono.test', confirmed: true, created_at: null },
    { id: '2', nickname: 'Bruno Silva', email: 'bruno.silva@mail.test', confirmed: false, created_at: null },
    { id: '3', nickname: 'Carla', email: 'carla@trono.test', confirmed: true, created_at: null },
  ]);

  assert.equal(filterRegisteredAccounts(rows, '').length, 3);
  assert.equal(filterRegisteredAccounts(rows, '   ').length, 3);
  assert.deepEqual(
    filterRegisteredAccounts(rows, 'TRONO.TEST').map((r) => r.id),
    ['1', '3'],
  );
  assert.deepEqual(
    filterRegisteredAccounts(rows, '  bruno ').map((r) => r.id),
    ['2'],
  );
  assert.deepEqual(filterRegisteredAccounts(rows, 'nao-existe'), []);
});
