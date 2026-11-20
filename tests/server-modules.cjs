'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGuestSessions } = require('../server/sessions.ts');
const { createIceProvider } = require('../server/ice.ts');

test('guest tickets restore server identities and cannot rename an active player', () => {
  const sessions = createGuestSessions({
    validNickname: (name) => name.length >= 2,
    nameReserved: (name) => name === 'Reservado',
  });
  const first = sessions.authenticate({}, { name: 'Visitante' });
  assert.match(first.ticket, /^[a-f0-9]{64}$/);
  const resumed = sessions.authenticate({}, { ticket: first.ticket, name: 'Visitante' });
  assert.equal(resumed.id, first.id);
  assert.throws(
    () =>
      sessions.authenticate(
        { guest: first, roomId: 'sala-cetro' },
        { ticket: first.ticket, name: 'Outro' },
      ),
    { code: 'GUEST_IN_ROOM' },
  );
  assert.throws(() => sessions.authenticate({}, { name: 'Reservado' }), { code: 'NAME_TAKEN' });
  const forged = sessions.authenticate({}, { ticket: 'untrusted-client-value', name: 'Visitante' });
  assert.notEqual(forged.id, first.id);
  assert.notEqual(forged.ticket, 'untrusted-client-value');
});

test('ICE credentials stay behind the provider and reuse a valid cache', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      iceServers: [
        { urls: ['turn:fixture.test:3478'], username: 'temporary', credential: 'fixture' },
      ],
    });
  });
  const disabled = createIceProvider({ enabled: false, keyId: '', token: '', ttl: 600 });
  assert.equal((await disabled.configuration()).turn, false);
  assert.equal(calls.length, 0);
  const provider = createIceProvider({
    enabled: true,
    keyId: 'fixture-key',
    token: 'fixture-token',
    ttl: 3600,
  });
  const first = await provider.configuration();
  assert.deepEqual(await provider.configuration(), first);
  assert.equal(first.turn, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { ttl: 3600 });
});
