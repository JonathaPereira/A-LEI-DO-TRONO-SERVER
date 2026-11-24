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

test('GET /community/registered-accounts falls back to Supabase Admin API for Creator on 503 PROFILE_UNAVAILABLE and still blocks non-creators', async () => {
  const express = require('express');
  const { createCommunityManagement } = require('../server/community-management.ts');
  const creatorId = '10000000-0000-4000-8000-000000000001';
  const memberId = '10000000-0000-4000-8000-000000000002';
  const fetchCalls = [];
  const auth = {
    configured: true,
    allowedOrigins: new Set(['https://app.example.test']),
    tokenFrom(req) {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token)
        throw Object.assign(new Error('Entre na conta.'), { code: 'AUTH_REQUIRED', status: 401 });
      return token;
    },
    identity: async (token) =>
      token === 'creator-token'
        ? {
            id: creatorId,
            nickname: 'Criador',
            role: 'creator',
            permissions: permissions('creator'),
            expiresAt: Date.now() + 60_000,
          }
        : {
            id: memberId,
            nickname: 'Membro',
            role: 'member',
            permissions: permissions('member'),
            expiresAt: Date.now() + 60_000,
          },
    request: async () => {
      const err = new Error('Perfil indisponível. Confira a atualização do servidor.');
      err.status = 503;
      err.code = 'PROFILE_UNAVAILABLE';
      throw err;
    },
  };
  const mgmt = createCommunityManagement({
    auth,
    rooms: new Map(),
    createRoom: (c) => ({ id: c.id, kind: 'chat', name: c.name }),
    env: {
      SUPABASE_URL: 'https://proj.supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'svc-secret-key',
    },
    fetchImpl: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).includes('/auth/v1/admin/users')) {
        return {
          ok: true,
          json: async () => ({
            users: [
              {
                id: creatorId,
                email: CREATOR_EMAIL,
                email_confirmed_at: '2026-01-01T00:00:00Z',
                created_at: '2026-01-01T00:00:00Z',
                user_metadata: { nickname: 'MetaCriador' },
              },
              {
                id: memberId,
                email: 'membro@example.test',
                email_confirmed_at: null,
                created_at: '2026-01-02T00:00:00Z',
                user_metadata: { nickname: 'MembroMeta' },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => [
          { id: creatorId, nickname: 'CriadorReal', created_at: '2026-01-01T00:00:00Z' },
        ],
      };
    },
  });
  const app = express();
  mgmt.install(app, express);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const forbidden = await fetch(`${base}/community/registered-accounts?offset=0`, {
      headers: { Authorization: 'Bearer member-token' },
    });
    assert.equal(forbidden.status, 403);
    assert.equal(fetchCalls.length, 0);

    const ok = await fetch(`${base}/community/registered-accounts?offset=0`, {
      headers: { Authorization: 'Bearer creator-token' },
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.accounts.length, 2);
    assert.equal(body.accounts[0].nickname, 'CriadorReal');
    assert.equal(body.accounts[0].email, CREATOR_EMAIL);
    assert.equal(body.accounts[0].confirmed, true);
    assert.equal(body.accounts[1].nickname, 'MembroMeta');
    assert.equal(body.accounts[1].email, 'membro@example.test');
    assert.equal(body.accounts[1].confirmed, false);
    assert.equal(body.hasMore, false);
    assert.equal(body.nextOffset, 2);
  } finally {
    mgmt.stop?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
