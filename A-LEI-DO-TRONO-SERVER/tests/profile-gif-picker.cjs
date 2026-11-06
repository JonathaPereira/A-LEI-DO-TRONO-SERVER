'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = import('../src/lib/profiles/gif-picker.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const gif = (id) => ({
  id,
  type: 'gif',
  rating: 'g',
  title: 'GIF ' + id,
  url: 'https://giphy.com/gifs/' + id,
  images: {
    original: {
      url: 'https://media.giphy.com/media/' + id + '/giphy.gif',
      size: '20',
      width: '1',
      height: '1',
    },
  },
});
const page = (ids, offset = 0, total = ids.length) =>
  response({
    data: ids.map(gif),
    pagination: { offset, count: ids.length, total_count: total },
    meta: { status: 200 },
  });
async function setup(t) {
  const { createGifPicker } = await modules;
  let account = 'alice',
    token = async () => 'private-app-token';
  let fetcher = async (url) =>
    url.endsWith('/community/gif-provider')
      ? response({ provider: 'giphy', configured: true, apiKey: 'public-client-key' })
      : url.startsWith('https://api.giphy.com')
        ? page(['abc123'])
        : new Response('GIF89aTEST');
  const listeners = new Set(),
    requests = [],
    selections = [],
    deadlines = [];
  const picker = createGifPicker({
    backendHttp: 'https://backend.test',
    getAccountId: () => account,
    getAccessToken: () => token(),
    fetch: (url, init) => {
      requests.push({ url: String(url), init });
      return fetcher(String(url), init);
    },
    subscribeIdentity(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    timeout(ms) {
      const controller = new AbortController();
      deadlines.push({ ms, controller });
      return controller.signal;
    },
  });
  t.after(() => picker.dispose());
  return {
    picker,
    requests,
    selections,
    listeners,
    deadlines,
    account(value) {
      account = value;
      for (const listener of listeners) listener();
    },
    token(value) {
      token = value;
    },
    fetch(value) {
      fetcher = value;
    },
    async open(
      target = 'avatar',
      callback = async (file, credit) => selections.push({ file, credit }),
    ) {
      picker.open({ target, onSelect: callback });
      await tick();
    },
  };
}

test('trending and search keep app authentication confined to configuration and paginate the submitted term', async (t) => {
  const f = await setup(t);
  await f.open('cover');
  assert.equal(f.picker.getSnapshot().items.length, 1);
  assert.equal(f.picker.getSnapshot().target, 'cover');
  f.fetch(async (url) =>
    url.includes('/community/')
      ? response({ provider: 'giphy', configured: true, apiKey: 'public-client-key' })
      : page(['abc123', 'def456'], Number(new URL(url).searchParams.get('offset')), 20),
  );
  f.picker.setQuery('stars & sky');
  await f.picker.search();
  f.picker.setQuery('unsent query');
  await f.picker.more();
  const publicRequests = f.requests.filter((request) =>
    request.url.startsWith('https://api.giphy.com'),
  );
  assert.equal(new URL(publicRequests[0].url).pathname, '/v1/gifs/trending');
  assert.equal(new URL(publicRequests.at(-1).url).searchParams.get('q'), 'stars & sky');
  assert.equal(new URL(publicRequests.at(-1).url).searchParams.get('offset'), '2');
  assert.deepEqual(
    f.picker.getSnapshot().items.map((item) => item.id),
    ['abc123', 'def456'],
  );
  for (const { url, init } of f.requests) {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.referrerPolicy, 'no-referrer');
    if (url.startsWith('https://backend.test'))
      assert.equal(init.headers.Authorization, 'Bearer private-app-token');
    else {
      assert.equal(init.headers, undefined);
      assert(!url.includes('private-app-token'));
    }
  }
});

test('unconfigured and old backends preserve external search and official-link selection', async (t) => {
  for (const status of [200, 404]) {
    const f = await setup(t);
    f.fetch(async () => response({ provider: 'giphy', configured: false }, status));
    await f.open();
    assert.match(f.picker.getSnapshot().message, /cole o link/);
    assert.equal(f.requests.length, 1);
    f.picker.setLink('https://giphy.com/gifs/hello-abc123');
    f.picker.previewLink();
    assert.equal(f.picker.getSnapshot().items[0].id, 'abc123');
    f.fetch(async () => new Response('GIF89aTEST'));
    await f.picker.select('abc123');
    assert.equal(f.selections.length, 1);
    assert.equal(await f.selections[0].file.text(), 'GIF89aTEST');
    assert.equal(f.selections[0].credit.source, 'https://giphy.com/gifs/abc123');
    assert.equal(f.picker.getSnapshot().open, false);
  }
});

test('a newer search wins and an old failure cannot overwrite the results or loading state', async (t) => {
  const f = await setup(t);
  await f.open();
  const pending = deferred();
  f.fetch(async (url) =>
    url.includes('/community/')
      ? response({ provider: 'giphy', configured: true, apiKey: 'key' })
      : new URL(url).searchParams.get('q') === 'old'
        ? pending.promise
        : page(['new456']),
  );
  f.picker.setQuery('old');
  const old = f.picker.search();
  await tick();
  f.picker.setQuery('new');
  await f.picker.search();
  pending.reject(Error('Old failure'));
  await old;
  assert.deepEqual(
    f.picker.getSnapshot().items.map((item) => item.id),
    ['new456'],
  );
  assert.equal(f.picker.getSnapshot().loading, false);
  assert(!f.picker.getSnapshot().message.includes('Old failure'));
});

test('closing or account ABA changes abort token waits before authenticated requests start', async (t) => {
  for (const change of ['close', 'account']) {
    const f = await setup(t),
      token = deferred();
    f.token(() => token.promise);
    await f.open();
    assert.equal(f.picker.getSnapshot().loading, true);
    if (change === 'close') f.picker.close();
    else {
      f.account('bob');
      f.account('alice');
    }
    token.resolve('old-token');
    await tick();
    assert.equal(f.requests.length, 0);
    assert.equal(f.picker.getSnapshot().open, false);
    f.token(async () => 'new-token');
    await f.open('background');
    assert.equal(f.picker.getSnapshot().target, 'background');
    assert.equal(f.picker.getSnapshot().items.length, 1);
  }
});

test('search timeout includes authentication and leaves link fallback usable', async (t) => {
  const f = await setup(t);
  f.token(() => new Promise(() => {}));
  await f.open();
  assert.equal(f.deadlines[0].ms, 20000);
  f.deadlines[0].controller.abort(new DOMException('Timed out', 'TimeoutError'));
  await tick();
  assert.equal(f.picker.getSnapshot().loading, false);
  assert.match(f.picker.getSnapshot().message, /busca demorou/);
  f.picker.setLink('https://giphy.com/gifs/abc123');
  f.picker.previewLink();
  assert.equal(f.picker.getSnapshot().items.length, 1);
});

test('manual preview supersedes pending search and invalid links never replace valid results', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.fetch(() => pending.promise);
  await f.open();
  f.picker.setLink('https://giphy.com/gifs/manual123');
  f.picker.previewLink();
  f.picker.setLink('https://evil.test/a.gif');
  f.picker.previewLink();
  pending.resolve(response({ provider: 'giphy', configured: true, apiKey: 'key' }));
  await tick();
  assert.deepEqual(
    f.picker.getSnapshot().items.map((item) => item.id),
    ['manual123'],
  );
  assert.match(f.picker.getSnapshot().message, /não identifica/);
  assert.equal(f.picker.getSnapshot().loading, false);
});

test('an unfinished selection cannot close a newer picker or release its busy state', async (t) => {
  const f = await setup(t);
  await f.open();
  const pending = deferred();
  f.fetch(() => pending.promise);
  const old = f.picker.select('abc123');
  await tick();
  f.picker.open({ target: 'cover', onSelect: async () => {} });
  f.picker.setLink('https://giphy.com/gifs/new456');
  f.picker.previewLink();
  const latestDownload = deferred();
  f.fetch(() => latestDownload.promise);
  const latest = f.picker.select('new456');
  pending.resolve(new Response('GIF89aOLD'));
  await old;
  assert.equal(f.picker.getSnapshot().busy, true);
  assert.equal(f.picker.getSnapshot().target, 'cover');
  assert.equal(f.selections.length, 0);
  latestDownload.resolve(new Response('GIF89aNEW'));
  await latest;
  assert.equal(f.picker.getSnapshot().open, false);
});

test('duplicate selections are blocked; failed downloads and callbacks keep the picker usable', async (t) => {
  const f = await setup(t),
    pending = deferred();
  await f.open();
  f.fetch(() => pending.promise);
  const selecting = f.picker.select('abc123');
  await f.picker.select('abc123');
  assert.equal(f.requests.filter(({ url }) => url.startsWith('https://media.giphy.com')).length, 1);
  pending.resolve(new Response('invalid'));
  await selecting;
  assert.equal(f.picker.getSnapshot().busy, false);
  assert.match(f.picker.getSnapshot().message, /GIF válido/);
  await f.open('avatar', async () => {
    throw Error('Editor rejected');
  });
  // This fixture remains on an invalid response; use a manual item for the callback case.
  f.picker.setLink('https://giphy.com/gifs/abc123');
  f.picker.previewLink();
  f.fetch(async () => new Response('GIF89aVALID'));
  await f.picker.select('abc123');
  assert.match(f.picker.getSnapshot().message, /Editor rejected/);
  assert.equal(f.picker.getSnapshot().open, true);
});

test('failed preview images cannot be selected and closing clears media records', async (t) => {
  const f = await setup(t);
  await f.open();
  f.picker.imageFailed('abc123');
  await f.picker.select('abc123');
  assert.equal(f.selections.length, 0);
  assert.deepEqual(f.picker.getSnapshot().failed, ['abc123']);
  f.picker.close();
  assert.deepEqual(f.picker.getSnapshot().items, []);
  assert.deepEqual(f.picker.getSnapshot().failed, []);
});

test('disposal releases the identity listener and suppresses in-flight work', async (t) => {
  const f = await setup(t),
    pending = deferred();
  f.fetch(() => pending.promise);
  await f.open();
  f.picker.dispose();
  pending.resolve(response({ provider: 'giphy', configured: true, apiKey: 'key' }));
  await tick();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.picker.getSnapshot().open, false);
  f.picker.open({ target: 'avatar', onSelect: async () => {} });
  assert.equal(f.picker.getSnapshot().open, false);
  assert.equal(f.requests.length, 1);
});

test('a failed page can be retried without duplicates or resetting the submitted search', async (t) => {
  const f = await setup(t);
  let fail = false;
  f.fetch(async (url) => {
    if (url.includes('/community/'))
      return response({ provider: 'giphy', configured: true, apiKey: 'key' });
    if (Number(new URL(url).searchParams.get('offset')) === 0) return page(['abc123'], 0, 3);
    if (fail) return response({}, 503);
    return page(['abc123', 'def456'], 1, 3);
  });
  await f.open();
  fail = true;
  await f.picker.more();
  assert.equal(f.picker.getSnapshot().next, 1);
  assert.deepEqual(
    f.picker.getSnapshot().items.map((item) => item.id),
    ['abc123'],
  );
  fail = false;
  await f.picker.more();
  assert.deepEqual(
    f.picker.getSnapshot().items.map((item) => item.id),
    ['abc123', 'def456'],
  );
  assert.equal(f.picker.getSnapshot().next, null);
});

test('selection timeout releases controls; a late download cannot select a file after account change', async (t) => {
  const f = await setup(t);
  await f.open();
  const pending = deferred();
  f.fetch(() => pending.promise);
  const selecting = f.picker.select('abc123');
  assert.equal(f.deadlines.at(-1).ms, 30000);
  f.deadlines.at(-1).controller.abort(new DOMException('Timed out', 'TimeoutError'));
  await selecting;
  assert.equal(f.picker.getSnapshot().busy, false);
  assert.match(f.picker.getSnapshot().message, /download demorou/);
  const second = f.picker.select('abc123');
  f.account('bob');
  pending.resolve(new Response('GIF89aLATE'));
  await second;
  assert.equal(f.picker.getSnapshot().open, false);
  assert.equal(f.selections.length, 0);
});

test('disposal cannot be reentered by a subscriber opening another picker', async (t) => {
  const f = await setup(t);
  await f.open();
  f.picker.subscribe(() => {
    if (!f.picker.getSnapshot().open) f.picker.open({ target: 'cover', onSelect: async () => {} });
  });
  const requests = f.requests.length;
  f.picker.dispose();
  await tick();
  assert.equal(f.picker.getSnapshot().open, false);
  assert.equal(f.requests.length, requests);
});
