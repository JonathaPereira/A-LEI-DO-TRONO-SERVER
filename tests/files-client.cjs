'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/files/client.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const file = (extra = {}) => ({
  id: 'file',
  name: 'arquivo.pdf',
  mime: 'application/pdf',
  bytes: 8,
  ownerId: 'a',
  kind: 'chat',
  ...extra,
});
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function setup(t) {
  const { createFiles } = await modulePromise;
  let account = { id: 'a', permissions: { moderateFiles: false } },
    token = async () => 'token-a',
    now = 1000;
  let fetcher = async () => response({ url: 'https://files.test/preview', expiresAt: 1000000 });
  const identities = new Set(),
    messages = new Set(),
    requests = [],
    uploads = [],
    warnings = [];
  const subscribe = (set) => (fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };
  const client = createFiles({
    backendHttp: 'https://backend.test',
    getAccount: () => account,
    getAccessToken: () => token(),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return fetcher(url, options);
    },
    createUpload: () => {
      const xhr = {
        upload: {},
        headers: {},
        open(method, url) {
          this.method = method;
          this.url = url;
        },
        setRequestHeader(key, value) {
          this.headers[key] = value;
        },
        send(blob) {
          this.body = blob;
        },
        abort() {
          this.aborted = true;
          this.onabort?.();
        },
        complete(data, status = 200) {
          this.responseText = JSON.stringify(data);
          this.status = status;
          this.onload?.();
        },
      };
      uploads.push(xhr);
      return xhr;
    },
    subscribeIdentity: subscribe(identities),
    subscribeMessages: subscribe(messages),
    now: () => now,
    warn: (error) => warnings.push(error),
  });
  t.after(() => client.dispose());
  return {
    client,
    requests,
    uploads,
    warnings,
    fetcher(fn) {
      fetcher = fn;
    },
    token(fn) {
      token = fn;
    },
    time(value) {
      now = value;
    },
    identity(id, moderateFiles = false) {
      account = id ? { id, permissions: { moderateFiles } } : null;
      identities.forEach((fn) => fn());
    },
    receive(message) {
      messages.forEach((fn) => fn(message));
    },
    listenerCounts: () => [identities.size, messages.size],
  };
}

test('canceling a channel read during token lookup prevents a late HTTP request', async (t) => {
  const h = await setup(t),
    held = deferred(),
    controller = new AbortController();
  h.token(() => held.promise);
  const read = h.client.api('/channel/room?offset=0', { signal: controller.signal });
  controller.abort();
  held.resolve('token-a');
  await assert.rejects(read, { name: 'AbortError' });
  assert.equal(h.requests.length, 0);
});

test('concurrent preview requests share a signed URL; downloads and expiration are independent', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.fetcher(() => held.promise);
  const a = h.client.url('file'),
    b = h.client.url('file');
  await tick();
  assert.equal(h.requests.length, 1);
  held.resolve(response({ url: 'https://files.test/p', expiresAt: 100000 }));
  assert.equal(await a, await b);
  assert.equal(await h.client.url('file'), 'https://files.test/p');
  assert.equal(h.requests.length, 1);
  h.fetcher(async () => response({ url: 'https://files.test/download', expiresAt: 200000 }));
  await h.client.url('file', true);
  assert.match(h.requests[1].url, /download=1$/);
  h.time(80000);
  await h.client.url('file');
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer token-a');
});

test('an account change clears cached links and rejects a late response even after returning to the same account', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.fetcher(() => held.promise);
  const pending = h.client.url('file');
  const rejected = assert.rejects(pending, /conta mudou/);
  await tick();
  h.identity('b');
  h.identity('a');
  held.resolve(response({ url: 'https://files.test/old', expiresAt: 100000 }));
  await rejected;
  h.fetcher(async () => response({ url: 'https://files.test/new', expiresAt: 100000 }));
  assert.equal(await h.client.url('file'), 'https://files.test/new');
  assert.equal(h.requests.length, 2);
});

test('an old request cannot remove a newer account pending URL or poison its cache', async (t) => {
  const h = await setup(t),
    old = deferred(),
    next = deferred();
  h.fetcher(() => old.promise);
  const first = h.client.url('file');
  const rejection = assert.rejects(first, /conta mudou/);
  await tick();
  h.identity('b');
  h.fetcher(() => next.promise);
  const second = h.client.url('file');
  await tick();
  old.resolve(response({ url: 'https://files.test/old', expiresAt: 100000 }));
  await rejection;
  const shared = h.client.url('file');
  await tick();
  assert.equal(h.requests.length, 2);
  next.resolve(response({ url: 'https://files.test/new', expiresAt: 100000 }));
  assert.equal(await second, await shared);
});

test('changing identity while resolving a token prevents any HTTP or upload under that token', async (t) => {
  const h = await setup(t),
    token = deferred();
  h.token(() => token.promise);
  const api = h.client.api('/mine'),
    upload = h.client.upload(new File(['data'], 'a.pdf'));
  const failures = [assert.rejects(api, /conta mudou/), assert.rejects(upload, /conta mudou/)];
  h.identity('b');
  token.resolve('old-token');
  await Promise.all(failures);
  assert.equal(h.requests.length, 0);
  assert.equal(h.uploads.length, 0);
});

test('deletion invalidates cached and in-flight links and publishes an immutable tombstone', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.fetcher(() => held.promise);
  const pending = h.client.url('file');
  const failure = assert.rejects(pending, { code: 'FILE_NOT_FOUND' });
  await tick();
  h.receive({ type: 'attachment-deleted', id: 'file' });
  held.resolve(response({ url: 'https://files.test/old', expiresAt: 100000 }));
  await failure;
  await assert.rejects(h.client.url('file'), { code: 'FILE_NOT_FOUND' });
  assert.equal(h.requests.length, 1);
  assert(Object.isFrozen(h.client.getSnapshot()));
  assert(Object.isFrozen(h.client.getSnapshot().deleted));
  h.identity('b');
  assert.deepEqual(h.client.getSnapshot().deleted, {});
});

test('not-found responses become tombstones; authorization errors do not mark another owner’s file deleted', async (t) => {
  const h = await setup(t);
  h.fetcher(async () => response({ error: { message: 'Privado', code: 'FILE_FORBIDDEN' } }, 403));
  await assert.rejects(h.client.url('private'), { code: 'FILE_FORBIDDEN' });
  assert.equal(h.client.getSnapshot().deleted.private, undefined);
  h.fetcher(async () => response({ error: { message: 'Ausente', code: 'FILE_NOT_FOUND' } }, 404));
  await assert.rejects(h.client.url('missing'), { code: 'FILE_NOT_FOUND' });
  assert.equal(h.client.getSnapshot().deleted.missing, true);
});

test('malformed, expired or executable signed URLs are never cached', async (t) => {
  const h = await setup(t);
  for (const value of [
    { url: 'javascript:alert(1)', expiresAt: 100000 },
    { url: 'https://a:b@files.test/a', expiresAt: 100000 },
    { url: 'https://files.test/a', expiresAt: 1 },
    null,
  ]) {
    h.fetcher(async () => response(value));
    await assert.rejects(h.client.url('file'), /inválid/);
  }
  assert.equal(h.requests.length, 4);
});

test('remove publishes deletion only after authorization succeeds for the initiating account', async (t) => {
  const h = await setup(t),
    held = deferred();
  h.fetcher(() => held.promise);
  const pending = h.client.remove('file');
  const failure = assert.rejects(pending, /conta mudou/);
  await tick();
  h.identity('b');
  held.resolve(response({ ok: true }));
  await failure;
  assert.deepEqual(h.client.getSnapshot().deleted, {});
  h.fetcher(async () => response({ ok: true }));
  await h.client.remove('file');
  assert.equal(h.client.getSnapshot().deleted.file, true);
  assert.equal(h.requests.at(-1).options.method, 'DELETE');
});

test('upload retains routing, progress, timeout and validated immutable file metadata', async (t) => {
  const h = await setup(t),
    progress = [],
    signal = new AbortController();
  const pending = h.client.upload(new File(['test'], 'vídeo.webm'), {
    kind: 'direct',
    peerId: 'peer',
    signal: signal.signal,
    onProgress: (n) => progress.push(n),
  });
  await tick();
  const xhr = h.uploads[0];
  assert.equal(xhr.headers['X-Peer-Id'], 'peer');
  assert.equal(xhr.headers['X-File-Kind'], 'direct');
  assert.equal(xhr.headers['X-File-Name'], encodeURIComponent('vídeo.webm'));
  assert.equal(xhr.timeout, 300000);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 2, total: 4 });
  assert.deepEqual(progress, [50]);
  xhr.complete({ file: file({ kind: 'direct', peerId: 'peer' }) });
  const uploaded = await pending;
  assert(Object.isFrozen(uploaded));
  assert.equal(uploaded.peerId, 'peer');
  assert.equal(xhr.onload, null);
  assert.equal(xhr.upload.onprogress, null);
  signal.abort();
  assert.equal(xhr.aborted, undefined);
});

test('abort, identity changes and disposal settle active uploads once and ignore late callbacks', async (t) => {
  const h = await setup(t),
    signal = new AbortController();
  let pending = h.client.upload(new File(['data'], 'a.pdf'), { signal: signal.signal });
  let failure = assert.rejects(pending, /cancelado/);
  await tick();
  const old = h.uploads[0].onload;
  signal.abort();
  await failure;
  old();
  pending = h.client.upload(new File(['data'], 'b.pdf'));
  failure = assert.rejects(pending, /conta mudou/);
  await tick();
  h.identity('b');
  await failure;
  assert.equal(h.uploads[1].aborted, true);
  pending = h.client.upload(new File(['data'], 'c.pdf'));
  failure = assert.rejects(pending, /conta mudou/);
  await tick();
  h.client.dispose();
  await failure;
  assert.equal(h.uploads[2].aborted, true);
});

test('already aborted uploads and invalid sizes never create an XHR or ask for a token', async (t) => {
  const h = await setup(t),
    signal = new AbortController();
  signal.abort();
  let tokens = 0;
  h.token(async () => {
    tokens++;
    return 'token';
  });
  await assert.rejects(
    h.client.upload(new File(['x'], 'a.pdf'), { signal: signal.signal }),
    /cancelado/,
  );
  await assert.rejects(h.client.upload({ name: 'large.pdf', size: 10000001 }), /Limite/);
  await assert.rejects(h.client.upload({ name: 'large.webm', size: 100000001 }), /Limite/);
  await assert.rejects(
    h.client.upload({ name: 'sound.wav', size: 2880045 }, { kind: 'soundboard' }),
    /Limite/,
  );
  await assert.rejects(h.client.upload(new File([], 'empty.pdf')), /Limite/);
  assert.equal(tokens, 0);
  assert.equal(h.uploads.length, 0);
});

test('malformed upload success, network failure and timeout all release upload handlers', async (t) => {
  const h = await setup(t);
  for (const mode of ['invalid', 'error', 'timeout']) {
    const pending = h.client.upload(new File(['data'], 'a.pdf'));
    const failure = assert.rejects(pending);
    await tick();
    const xhr = h.uploads.at(-1);
    if (mode === 'invalid') xhr.complete({ file: { id: 'only-an-id' } });
    else if (mode === 'error') xhr.onerror();
    else xhr.ontimeout();
    await failure;
    assert.equal(xhr.onload, null);
    assert.equal(xhr.upload.onprogress, null);
  }
});

test('role changes refresh moderation; observer failures cannot stop cleanup or upload progress', async (t) => {
  const h = await setup(t);
  h.client.subscribe(() => {
    throw Error('observer');
  });
  h.identity('a', true);
  assert.equal(h.client.getSnapshot().moderateFiles, true);
  const pending = h.client.upload(new File(['data'], 'a.pdf'), {
    onProgress: () => {
      throw Error('progress');
    },
  });
  await tick();
  const xhr = h.uploads[0];
  xhr.upload.onprogress({ lengthComputable: true, loaded: 1, total: 4 });
  xhr.complete({ file: file() });
  await pending;
  assert.equal(h.warnings.length, 2);
  h.client.dispose();
  assert.deepEqual(h.listenerCounts(), [0, 0]);
  await assert.rejects(h.client.api('/mine'), /encerrada/);
});

test('avatar presets and file IDs cannot inject arbitrary markup or inherited properties', async () => {
  const { avatarIcon, normalizePreset, AVATAR_PRESETS } =
    await import('../src/lib/profiles/icons.ts');
  const { avatarFile } = await import('../src/lib/profiles/avatar.ts');
  assert.equal(Object.keys(AVATAR_PRESETS).length, 16);
  for (const value of ['constructor', '__proto__', '<img onerror=alert(1)>', undefined]) {
    assert.equal(normalizePreset(value), 'crown');
    assert.equal(avatarIcon(value), avatarIcon('crown'));
  }
  assert.equal(avatarFile({ avatar_file_id: '" onerror="alert(1)' }), null);
  assert.equal(
    avatarFile({ avatar_file_id: '20000000-0000-4000-8000-000000000001' }),
    '20000000-0000-4000-8000-000000000001',
  );
});
