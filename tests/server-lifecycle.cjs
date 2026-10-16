'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApplication } = require('../server/app.ts');

test('independent applications start and close without process listeners or shared channels', async () => {
  const before = process.listenerCount('SIGTERM');
  const first = createApplication();
  const second = createApplication();
  try {
    assert.equal(process.listenerCount('SIGTERM'), before);
    assert.equal(first.server.listening, false);
    assert.notEqual(first.wss, second.wss);
    await Promise.all(
      [first, second].map(
        (backend) => new Promise((resolve) => backend.server.listen(0, '127.0.0.1', resolve)),
      ),
    );
    const address = first.server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await Promise.all([first.close(), first.close(), second.close()]);
  }
  assert.equal(first.server.listening, false);
  assert.equal(second.server.listening, false);
});
