'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../src/lib/mobile/android-host.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => resolve = yes); return { promise, resolve }; };

test('Android call lease is released on cancellation even if native permission completes later', async () => {
  const { createAndroidHost } = await load();
  const permission = deferred(), events = [];
  const host = createAndroidHost({
    prepareVoice: async ({ lease }) => { events.push(['prepare', lease]); await permission.promise; },
    endVoice: async ({ lease }) => events.push(['end', lease]),
  });
  const first = new AbortController();
  const ready = host.prepareVoice({ signal: first.signal, generation: 1 });
  await tick();
  first.abort();
  await assert.rejects(ready, { name: 'AbortError' });
  permission.resolve(); await tick();
  assert(events.some(([kind, lease]) => kind === 'end' && lease === events[0][1]));
  assert.equal(events.filter(([kind]) => kind === 'prepare').length, 1);
});

test('Android keeps the same call lease across navigation and stops only the matching call', async () => {
  const { createAndroidHost } = await load();
  const events = [];
  const host = createAndroidHost({
    prepareVoice: async ({ lease }) => events.push(['prepare', lease]),
    endVoice: async ({ lease }) => events.push(['end', lease]),
  });
  const first = new AbortController();
  await host.prepareVoice({ signal: first.signal, generation: 1 });
  host.stopVoice(); await tick();
  const second = new AbortController();
  await host.prepareVoice({ signal: second.signal, generation: 2 });
  first.abort(); await tick();
  assert.equal(events.filter(([kind]) => kind === 'end').length, 1);
  assert.notEqual(events[0][1], events[2][1]);
  second.abort(); await tick();
  assert.equal(events.filter(([kind]) => kind === 'end').length, 2);
});

test('denied Android microphone permission does not leave a running call service', async () => {
  const { createAndroidHost } = await load();
  const stopped = [];
  const host = createAndroidHost({
    prepareVoice: async () => { throw Error('Microfone negado'); },
    endVoice: async value => stopped.push(value),
  });
  await assert.rejects(host.prepareVoice({ signal: new AbortController().signal, generation: 3 }), /Microfone negado/);
  assert.equal(stopped.length, 1);
});

test('bundled Android assets connect to production rather than a localhost development server', async () => {
  const { resolveBackendHttp } = await import('../src/lib/socket/browser.ts');
  assert.equal(resolveBackendHttp('localhost', undefined, true), 'https://a-lei-do-trono-server.onrender.com');
  assert.equal(resolveBackendHttp('localhost'), 'http://localhost:10000');
  assert.equal(resolveBackendHttp('localhost', 'https://fixture.example', true), 'https://fixture.example');
});
