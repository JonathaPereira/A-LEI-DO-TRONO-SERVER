'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
test('headless native window ignores stale reads, deduplicates IPC and releases its one subscription', async () => {
  const { createDesktopWindow } = require('../src/lib/desktop/window.ts');
  const initial = deferred(),
    toggle = deferred();
  let listener,
    calls = 0,
    released = 0;
  const client = createDesktopWindow({
    getWindowState: () => initial.promise,
    onWindowState: (fn) => {
      listener = fn;
      return () => released++;
    },
    toggleFullscreen: () => {
      calls++;
      return toggle.promise;
    },
  });
  client.start();
  client.start();
  listener({ fullscreen: true });
  initial.resolve({ fullscreen: false });
  await new Promise(setImmediate);
  assert.equal(client.getSnapshot().fullscreen, true);
  const first = client.toggleFullscreen(),
    second = client.toggleFullscreen();
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert(client.getSnapshot().fullscreenPending);
  listener({ fullscreen: false });
  toggle.resolve({ fullscreen: true });
  await first;
  assert.equal(client.getSnapshot().fullscreen, false);
  assert.equal(client.getSnapshot().fullscreenPending, false);
  client.dispose();
  client.dispose();
  listener({ fullscreen: true });
  assert.equal(released, 1);
  assert.equal(client.getSnapshot().fullscreen, false);
});
