'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const ready = import('../src/lib/games/roguelite.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const manifest = (
  files = [
    { path: 'assets/one.png', bytes: 2 },
    { path: 'assets/two.png', bytes: 3 },
  ],
) => ({
  schema: 1,
  id: 'cinzas-do-abismo',
  files,
  bytes: files.reduce((sum, file) => sum + file.bytes, 0),
});
async function setup(t, desktop = false) {
  const { createRoguelite } = await ready;
  let active = false,
    fullscreen = false;
  const visibility = new Set(),
    requests = [],
    jobs = [],
    exits = [];
  let fetcher = async (url) =>
    url.endsWith('.json')
      ? new Response(JSON.stringify(manifest()))
      : new Response(new Uint8Array(url.includes('one') ? 2 : 3));
  let enter = async () => {
    fullscreen = true;
  };
  let exit = async () => {
    fullscreen = false;
    exits.push(1);
  };
  const controller = createRoguelite({
    desktop,
    fetch: (url, options) => {
      requests.push({ url, options });
      return fetcher(url, options);
    },
    readActive: () => active,
    subscribeVisibility(fn) {
      visibility.add(fn);
      return () => visibility.delete(fn);
    },
    fullscreenOwned: () => fullscreen,
    requestFullscreen: () => enter(),
    exitFullscreen: () => exit(),
    schedule(callback, delay) {
      const job = { callback, delay, canceled: false };
      jobs.push(job);
      return () => {
        job.canceled = true;
      };
    },
  });
  controller.start();
  t.after(() => controller.dispose());
  return {
    controller,
    requests,
    jobs,
    exits,
    visibility,
    active(value) {
      active = value;
      visibility.forEach((fn) => fn());
    },
    fetcher(fn) {
      fetcher = fn;
    },
    enter(fn) {
      enter = fn;
    },
    exit(fn) {
      exit = fn;
    },
    fullscreen(value) {
      fullscreen = value;
    },
  };
}
test('a ready frame survives hide/show while loading frames are canceled and replaced', async (t) => {
  const f = await setup(t);
  f.active(true);
  const first = f.controller.getSnapshot().frameId;
  assert.ok(first);
  assert.equal(f.controller.getSnapshot().loading, true);
  f.active(false);
  assert.equal(f.controller.getSnapshot().frameId, null);
  f.active(true);
  const second = f.controller.getSnapshot().frameId;
  assert.notEqual(first, second);
  f.controller.ready(first);
  assert.equal(f.controller.getSnapshot().ready, false);
  f.controller.ready(second);
  assert.equal(f.controller.getSnapshot().ready, true);
  f.active(false);
  f.active(true);
  assert.equal(f.controller.getSnapshot().frameId, second);
  assert.equal(f.controller.getSnapshot().loading, false);
  assert.equal(f.requests.length, 0);
});
test('desktop preparation downloads two workers, reports progress and creates only one frame', async (t) => {
  const f = await setup(t, true);
  f.active(true);
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.controller.getSnapshot().progress, 100);
  const id = f.controller.getSnapshot().frameId;
  assert.ok(id);
  await f.controller.prepare();
  assert.equal(f.requests.length, 3);
  f.controller.ready(id);
  assert.equal(f.controller.getSnapshot().loading, false);
  assert.equal(f.jobs[0].canceled, true);
});
test('malformed or escaping manifests are rejected before asset fetch and retry accepts a valid one', async (t) => {
  const f = await setup(t, true);
  for (const value of [
    manifest([{ path: '../secret', bytes: 1 }]),
    manifest([{ path: 'assets/%2e%2e/data', bytes: 1 }]),
    manifest([
      { path: 'assets/one', bytes: 1 },
      { path: 'assets/one', bytes: 1 },
    ]),
    { ...manifest(), bytes: 999 },
  ]) {
    f.fetcher(async () => new Response(JSON.stringify(value)));
    f.active(true);
    await f.controller.prepare();
    await tick();
    assert.equal(f.controller.getSnapshot().error, true);
    assert.equal(f.controller.getSnapshot().frameId, null);
    assert.ok(f.requests.every((request) => request.url.endsWith('.json')));
    f.active(false);
  }
  f.fetcher(async (url) =>
    url.endsWith('.json')
      ? new Response(JSON.stringify(manifest()))
      : new Response(new Uint8Array(url.includes('one') ? 2 : 3)),
  );
  f.active(true);
  await f.controller.prepare();
  assert.ok(f.controller.getSnapshot().frameId);
});
test('canceled preparation cannot publish progress or an iframe after leaving and returning', async (t) => {
  const f = await setup(t, true),
    held = deferred();
  f.fetcher(() => held.promise);
  f.active(true);
  const old = f.requests[0].options.signal;
  f.active(false);
  assert.equal(old.aborted, true);
  f.fetcher(async (url) =>
    url.endsWith('.json')
      ? new Response(JSON.stringify(manifest()))
      : new Response(new Uint8Array(url.includes('one') ? 2 : 3)),
  );
  f.active(true);
  await tick();
  const id = f.controller.getSnapshot().frameId;
  held.resolve(new Response(JSON.stringify(manifest())));
  await tick();
  assert.equal(f.controller.getSnapshot().frameId, id);
  assert.equal(f.controller.getSnapshot().error, false);
});
test('truncated assets fail preparation and a missing ready event times out safely', async (t) => {
  const f = await setup(t, true);
  f.fetcher(async (url) =>
    url.endsWith('.json')
      ? new Response(JSON.stringify(manifest()))
      : new Response(new Uint8Array(1)),
  );
  f.active(true);
  await tick();
  assert.equal(f.controller.getSnapshot().error, true);
  assert.equal(f.controller.getSnapshot().loading, false);
  const web = await setup(t);
  web.active(true);
  const id = web.controller.getSnapshot().frameId;
  assert.equal(web.jobs[0].delay, 20000);
  web.jobs[0].callback();
  assert.equal(web.controller.getSnapshot().frameId, null);
  assert.equal(web.controller.getSnapshot().error, true);
  web.controller.ready(id);
  assert.equal(web.controller.getSnapshot().ready, false);
  await web.controller.prepare();
  assert.notEqual(web.controller.getSnapshot().frameId, id);
});
test('fullscreen fallback exits with Escape and late fullscreen cannot reopen a hidden game', async (t) => {
  const f = await setup(t);
  f.active(true);
  f.enter(async () => {
    throw new Error('Denied');
  });
  await f.controller.toggleFullscreen();
  assert.equal(f.controller.getSnapshot().immersive, true);
  f.controller.escape();
  assert.equal(f.controller.getSnapshot().immersive, false);
  const held = deferred();
  f.enter(async () => {
    await held.promise;
    f.fullscreen(true);
  });
  const entering = f.controller.toggleFullscreen();
  f.active(false);
  held.resolve();
  await entering;
  assert.equal(f.controller.getSnapshot().fullscreen, false);
  assert.equal(f.exits.length, 1);
});
test('disposal aborts preparation, timers and subscriptions even when a subscriber tries to restart', async (t) => {
  const f = await setup(t),
    controller = f.controller;
  f.active(true);
  controller.subscribe(() => {
    void controller.prepare();
  });
  controller.dispose();
  assert.equal(f.jobs[0].canceled, true);
  assert.equal(f.visibility.size, 0);
  assert.equal(controller.getSnapshot().frameId, null);
  f.jobs[0].callback();
  assert.equal(controller.getSnapshot().frameId, null);
});
test('a rejected fullscreen exit releases the pending action and reflects the actual fullscreen owner', async (t) => {
  const f = await setup(t);
  f.active(true);
  f.fullscreen(true);
  f.exit(async () => {
    throw new Error('Fullscreen exit denied');
  });
  await assert.doesNotReject(f.controller.toggleFullscreen());
  assert.equal(f.controller.getSnapshot().fullscreenPending, false);
  assert.equal(f.controller.getSnapshot().fullscreen, true);
});
