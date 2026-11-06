'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  https = require('node:https');
const { Readable, Writable } = require('node:stream');
const { signedUrl, r2Adapter } = require('../server/storage-r2.ts');
const { detectMime } = require('../server/file-upload.ts');
const env = {
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_BUCKET: 'fixture',
  R2_ACCESS_KEY_ID: 'fixture-access',
  R2_SECRET_ACCESS_KEY: 'fixture-secret',
};
function transport(t, { status = 200, xml = '', pending = false, aborted = false } = {}) {
  const requests = [];
  t.mock.method(https, 'request', (url, options, callback) => {
    const chunks = [],
      request = new Writable({
        write(chunk, _encoding, next) {
          chunks.push(Buffer.from(chunk));
          next();
        },
      });
    request.setTimeout = () => request;
    options.signal?.addEventListener('abort', () => request.destroy(options.signal.reason), {
      once: true,
    });
    if (options.signal?.aborted) process.nextTick(() => request.destroy(options.signal.reason));
    requests.push({ url, options, request, chunks });
    if (!pending)
      request.once('finish', () => {
        const response = Readable.from([xml]);
        response.statusCode = status;
        callback(response);
        if (aborted) process.nextTick(() => response.emit('aborted'));
      });
    return request;
  });
  return requests;
}
test('R2 signing preserves the existing canonical fixture, escaped object path and five-minute capability', () => {
  const result = new URL(
    signedUrl(
      env,
      'GET',
      "direct/space !'()*",
      {
        'response-content-type': 'application/pdf',
        'response-content-disposition': "attachment; filename*=UTF-8''x%20y.pdf",
      },
      new Date('2026-10-21T12:34:56Z'),
    ),
  );
  assert.equal(
    result.searchParams.get('X-Amz-Signature'),
    '7be30636988c5f0fb3a883d8ef6d3fa363959672a9aaf6714efc4e029d2eb5c5',
  );
  assert.equal(result.pathname, '/fixture/direct/space%20%21%27%28%29%2A');
  assert.equal(result.searchParams.get('X-Amz-Expires'), '300');
  assert.equal(result.searchParams.get('X-Amz-SignedHeaders'), 'host');
});
test('native R2 upload streams exactly the body and keeps content length, disposition and service signal', async (t) => {
  const seen = transport(t),
    scope = new AbortController();
  await r2Adapter(env).put(
    'chat/file',
    Readable.from([Buffer.from('abc'), Buffer.from('def')]),
    6,
    'application/pdf',
    'um arquivo.pdf',
    scope.signal,
  );
  assert.equal(seen.length, 1);
  const call = seen[0];
  assert.equal(Buffer.concat(call.chunks).toString(), 'abcdef');
  assert.equal(call.options.headers['Content-Length'], '6');
  assert.equal(call.options.headers['Content-Type'], 'application/pdf');
  assert.equal(
    call.options.headers['Content-Disposition'],
    "inline; filename*=UTF-8''um%20arquivo.pdf",
  );
  assert.equal(call.options.signal, scope.signal);
});
test('R2 failure reports only allowlisted status/code and never XML, signed URL or provider secrets', async (t) => {
  const logs = [];
  t.mock.method(console, 'warn', (...args) => logs.push(args));
  transport(t, {
    status: 403,
    xml: '<Error><Code>SignatureDoesNotMatch</Code><Message>private credential</Message><Key>secret-object</Key></Error>',
  });
  await assert.rejects(
    r2Adapter(env).put(
      'secret-object',
      Readable.from(['abc']),
      3,
      'application/octet-stream',
      'arquivo',
    ),
    (error) =>
      error.code === 'STORAGE_UNAVAILABLE' &&
      error.status === 503 &&
      error.message.includes('SignatureDoesNotMatch') &&
      !/private|secret-object|X-Amz/.test(error.message),
  );
  assert.deepEqual(logs, [
    ['[R2 upload]', JSON.stringify({ status: 403, code: 'SignatureDoesNotMatch' })],
  ]);
});
test('unknown XML error codes stay private and a broken response rejects the native upload', async (t) => {
  const logs = [];
  t.mock.method(console, 'warn', (...args) => logs.push(args));
  transport(t, { status: 503, xml: '<Code>PrivateCredential</Code>' });
  await assert.rejects(
    r2Adapter(env).put('object', Readable.from(['abc']), 3, 'application/octet-stream', 'arquivo'),
    (error) =>
      error.message.includes('UnknownError') && !error.message.includes('PrivateCredential'),
  );
  assert(!JSON.stringify(logs).includes('PrivateCredential'));
  t.mock.restoreAll();
  transport(t, { aborted: true });
  await assert.rejects(
    r2Adapter(env).put('object', Readable.from(['abc']), 3, 'application/pdf', 'arquivo'),
    { code: 'STORAGE_UNAVAILABLE' },
  );
});
test('service cancellation destroys the native writable and settles both upload promises', async (t) => {
  const seen = transport(t, { pending: true }),
    scope = new AbortController();
  const work = r2Adapter(env).put(
      'object',
      Readable.from(['abc']),
      3,
      'application/pdf',
      'arquivo',
      scope.signal,
    ),
    rejected = assert.rejects(work);
  scope.abort();
  await rejected;
  assert.equal(seen[0].request.destroyed, true);
});
test('R2 removal keeps idempotent 404, bounded cancellation and preview/download disposition', async (t) => {
  let status = 404,
    options;
  t.mock.method(global, 'fetch', async (_url, value) => {
    options = value;
    return new Response(null, { status });
  });
  const storage = r2Adapter(env),
    scope = new AbortController();
  await storage.remove('object', scope.signal);
  assert.equal(options.method, 'DELETE');
  scope.abort();
  assert.equal(options.signal.aborted, true);
  status = 500;
  await assert.rejects(storage.remove('object'), { code: 'STORAGE_UNAVAILABLE' });
  const row = { object_key: 'chat/object', mime: 'image/png', name: 'foto.png' };
  assert(
    new URL(storage.url(row)).searchParams
      .get('response-content-disposition')
      .startsWith('inline;'),
  );
  assert(
    new URL(storage.url(row, true)).searchParams
      .get('response-content-disposition')
      .startsWith('attachment;'),
  );
  assert(
    new URL(storage.url({ ...row, mime: 'application/octet-stream' })).searchParams
      .get('response-content-disposition')
      .startsWith('attachment;'),
  );
  assert.equal(detectMime(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(detectMime(Buffer.from('<script>untrusted</script>')), 'application/octet-stream');
});
