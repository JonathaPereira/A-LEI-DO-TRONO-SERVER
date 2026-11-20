'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClipWorkerHandler } = require('../src/lib/clips/worker-runtime.ts');
const { ClipBuffer } = require('../src/lib/clips/buffer.ts');
function fixture() {
  const replies = [];
  return {
    replies,
    receive: createClipWorkerHandler((reply) => replies.push(reply)),
    last: () => replies.at(-1),
  };
}
test('worker rejects invalid commands and uninitialized requests with correlated errors', () => {
  const f = fixture();
  for (const value of [
    null,
    [],
    4,
    {},
    { type: 'other' },
    { type: 'clip', id: '' },
    { type: 'clip', id: 7 },
  ]) {
    assert.doesNotThrow(() => f.receive(value));
    assert.equal(f.last().type, 'error');
    assert.equal(f.last().id, undefined);
  }
  f.receive({ type: 'clip', id: 'pending' });
  assert.equal(f.last().id, 'pending');
  assert.match(f.last().message, /Inicie/);
  f.receive({ type: 'chunk', data: new ArrayBuffer(0) });
  assert.match(f.last().message, /Inicie/);
});
test('worker validates its configuration without accepting unbounded or non-finite memory limits', () => {
  const f = fixture();
  for (const values of [
    { seconds: 0 },
    { seconds: 121 },
    { fps: Infinity },
    { fps: NaN },
    { fps: '60' },
    { fps: 241 },
    { maxBytes: 0 },
    { maxBytes: 256 * 1048576 + 1 },
    { maxBytes: 1.5 },
  ]) {
    f.receive({ type: 'init', ...values });
    assert.equal(f.last().type, 'error');
  }
  f.receive({ type: 'init' });
  assert.deepEqual(f.last(), { type: 'ready' });
  f.receive({ type: 'init', seconds: 120, fps: 240, maxBytes: 256 * 1048576 });
  assert.deepEqual(f.last(), { type: 'ready' });
});
test('an early clip error keeps buffering, while malformed chunks invalidate the buffer until initialization', () => {
  const f = fixture();
  f.receive({ type: 'init' });
  f.receive({ type: 'clip', id: 'too-early' });
  assert.equal(f.last().id, 'too-early');
  assert.match(f.last().message, /Aguarde/);
  f.receive({ type: 'chunk', data: new ArrayBuffer(0) });
  assert.deepEqual(f.last(), { type: 'status', ready: false, seconds: 0, bytes: 0 });
  f.receive({ type: 'chunk', data: new Uint8Array([0]).buffer });
  assert.equal(f.last().type, 'error');
  f.receive({ type: 'clip', id: 'corrupt' });
  assert.equal(f.last().id, 'corrupt');
  assert.match(f.last().message, /Inicie/);
  f.receive({ type: 'init' });
  f.receive({ type: 'chunk', data: new ArrayBuffer(0) });
  assert.equal(f.last().type, 'status');
  f.receive({ type: 'chunk', data: new Uint8Array(1) });
  assert.match(f.last().message, /Fragmento/);
  f.receive({ type: 'clip', id: 'invalid-chunk' });
  assert.match(f.last().message, /Inicie/);
});
test('invalid core limits fail before parsing or allocating an encoded buffer', () => {
  for (const options of [
    { seconds: 0 },
    { seconds: NaN },
    { fps: -1 },
    { fps: Infinity },
    { maxBytes: 0 },
    { maxBytes: 1.2 },
  ])
    assert.throws(() => new ClipBuffer(options), /Configuração/);
});
