'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApplication } = require('../server/app.ts');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('process entry imports without listening or registering signals and rejects invalid ports before creating services', () => {
  const entry = path.resolve(__dirname, '../server/index.ts');
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      `const before=process.listenerCount('SIGTERM');const entry=require(${JSON.stringify(entry)});console.log(JSON.stringify({start:typeof entry.startApplication,signals:process.listenerCount('SIGTERM')-before}));`,
    ],
    { encoding: 'utf8', timeout: 3000 },
  );
  assert.equal(probe.status, 0, probe.stderr);
  assert.deepEqual(JSON.parse(probe.stdout.trim()), { start: 'function', signals: 0 });
  for (const port of ['invalid', '-1', '65536']) {
    const child = spawnSync(process.execPath, [entry], {
      env: { ...process.env, PORT: port },
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /PORT must be an integer between 0 and 65535/);
    assert(!child.stdout.includes('backend '));
  }
});

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
