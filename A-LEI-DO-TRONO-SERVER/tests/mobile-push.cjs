'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { generateKeyPairSync, verify } = require('node:crypto');
const { createMobilePush, createFcmSender } = require('../server/mobile-push.ts');
const account = '10000000-0000-4000-8000-000000000001';
const peer = '10000000-0000-4000-8000-000000000002';
const device = '10000000-0000-4000-8000-000000000003';
const token = 'fixture-device-token-at-least-twenty';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Android push registration requires account authentication and never accepts a claimed recipient', async t => {
  const writes = [];
  const auth = {
    allowedOrigins: new Set(['https://localhost']),
    tokenFrom: req => req.headers.authorization,
    identity: async bearer => { if (bearer !== 'Bearer valid') throw Object.assign(Error('Unauthorized'), { status: 401 }); return { id: account }; },
  };
  const push = createMobilePush({ auth, db: async (...args) => { writes.push(args); return []; }, sender: { configured: true, send: async () => 'sent' } });
  const app = express(); push.install(app, express);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { push.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const send = (body, authorization = 'Bearer valid', origin = 'https://localhost') => fetch(base + '/mobile-push/register', { method: 'POST', headers: { Origin: origin, Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = { deviceId: device, token, enabled: true, accountId: peer };
  assert.equal((await send(payload, 'Bearer forged')).status, 401);
  assert.equal((await send(payload, 'Bearer valid', 'https://attacker.invalid')).status, 403);
  assert.equal((await send({ ...payload, token: 'bad' })).status, 400);
  assert.equal(writes.length, 0);
  const response = await send(payload);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(writes[0][2].p_account, account);
  assert.match(writes[0][2].p_id, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(await (await send(payload)).json()).includes(token), false);
});

test('push delivery scopes devices, removes expired FCM endpoints and isolates provider failure', async () => {
  const database = [], messages = [];
  let failing = false;
  const push = createMobilePush({ auth: {}, db: async (...args) => { database.push(args); return [{ id: 'a'.repeat(64), token }]; }, sender: { configured: true, send: async (value, target) => { if (failing) throw Error('Provider unavailable'); messages.push({ value, target }); return 'expired'; } } });
  await push.deliver(account, 'direct', peer, 'message-id');
  assert.match(database[0][0], new RegExp('account_id=eq.' + account));
  assert.match(database[0][0], /enabled=eq.true/);
  assert.deepEqual(messages[0].target, { accountId: account, type: 'direct', id: peer, key: account + ':message-id' });
  assert.equal(database[1][1], 'DELETE');
  failing = true;
  await push.deliver(account, 'friends', peer, 'friend');
  assert.equal(push.health().failed, 1);
  push.stop();
  const count = database.length;
  await push.deliver(account, 'direct', peer, 'late');
  assert.equal(database.length, count);
});

test('FCM signs short-lived credentials on the backend and sends only an account-scoped generic notice', async () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const requests = [];
  const sender = createFcmSender({ env: { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'fixture-project', client_email: 'service@fixture.invalid', private_key: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }) }) }, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (url.includes('oauth2.')) {
      const jwt = options.body.get('assertion').split('.');
      assert(verify('RSA-SHA256', Buffer.from(jwt.slice(0, 2).join('.')), keys.publicKey, Buffer.from(jwt[2], 'base64url')));
      const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
      assert.equal(claims.exp - claims.iat, 3600);
      return Response.json({ access_token: 'short-lived-test-token' });
    }
    return Response.json({ name: 'projects/fixture/messages/one' });
  } });
  const target = { accountId: account, type: 'direct', id: peer, key: 'test' };
  await sender.send(token, target, new AbortController().signal);
  await sender.send(token, target, new AbortController().signal);
  assert.equal(requests.length, 3);
  const body = JSON.parse(requests[1].options.body);
  assert.deepEqual(body.message.data, target);
  assert.equal('notification' in body.message, false);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer short-lived-test-token');
  assert.equal(createFcmSender({ env: {} }).configured, false);
  await tick();
});
