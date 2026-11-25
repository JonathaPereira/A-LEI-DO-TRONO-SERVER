'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAuth } = require('../server/auth.ts');
const { createApplication } = require('../server/app.ts');

test('createAuth.keepalive touches Supabase PostgREST and throttles repeated pings within 60s', async () => {
  const hits = [];
  let now = 1_000_000;
  const auth = createAuth({
    env: {
      SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_ANON_KEY: 'anon-test-key',
      APP_URL: 'https://trono.example.test',
    },
    now: () => now,
    fetchImpl: async (url, init) => {
      hits.push({ url: String(url), headers: init?.headers || {} });
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  try {
    assert.equal(typeof auth.keepalive, 'function');
    const first = await auth.keepalive();
    assert.deepEqual(first, { ok: true, throttled: false, touchedAt: 1_000_000 });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, 'https://proj.supabase.co/rest/v1/profiles?select=id&limit=1');
    assert.equal(hits[0].headers.apikey, 'anon-test-key');
    assert.equal(JSON.stringify(first).includes('anon-test-key'), false);

    now += 30_000;
    const second = await auth.keepalive();
    assert.deepEqual(second, { ok: true, throttled: true, touchedAt: 1_000_000 });
    assert.equal(hits.length, 1, 'Repeated keepalive within 60s must not hit Supabase again');

    now += 31_000;
    const third = await auth.keepalive();
    assert.deepEqual(third, { ok: true, throttled: false, touchedAt: 1_061_000 });
    assert.equal(hits.length, 2, 'Keepalive after 60s cooldown touches Supabase again');
  } finally {
    auth.stop();
  }
});

test('GET /health?keepalive=1 returns keepalive status without breaking plain /health', async () => {
  const app = createApplication();
  try {
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const port = app.server.address().port;

    const plain = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(plain.ok, true);
    assert.equal(plain.keepalive, undefined);

    const keep = await (await fetch(`http://127.0.0.1:${port}/health?keepalive=1`)).json();
    assert.equal(keep.ok, true);
    assert.equal(typeof keep.keepalive, 'object');
    assert.equal(typeof keep.keepalive.ok, 'boolean');
  } finally {
    await app.close();
  }
});

test('keepalive workflow is scheduled every 10 minutes and pings Render + Supabase keepalive endpoint', () => {
  const workflowPath = path.resolve(__dirname, '../.github/workflows/keepalive.yml');
  assert.equal(fs.existsSync(workflowPath), true, 'keepalive.yml workflow must exist');
  const content = fs.readFileSync(workflowPath, 'utf8');
  assert.match(content, /cron:\s*['"]\*\/10 \* \* \* \*['"]/);
  assert.match(content, /workflow_dispatch:/);
  assert.match(content, /permissions:\s*\{\}/);
  assert.match(content, /https:\/\/a-lei-do-trono-server\.onrender\.com\/health\?keepalive=1/);
});
