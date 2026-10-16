'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { contentSecurityPolicy } = require('../electron/content-security.cjs');
const { developmentOrigin } = require('../electron/development.cjs');

test('installed Next bootstrap is authorized by exact content hashes', () => {
  const source = 'self.__next_f.push([1,"fixture"]);';
  const expected = crypto.createHash('sha256').update(source).digest('base64');
  const policy = contentSecurityPolicy(`<script>${source}</script><script src="/app.js"></script>`);
  assert(policy.includes(`'sha256-${expected}'`));
  const scripts = policy.split(';').find((directive) => directive.trim().startsWith('script-src'));
  assert(!scripts.includes("'unsafe-inline'"));
  assert(!scripts.includes("'unsafe-eval'"));
  assert(!contentSecurityPolicy(source + 'changed').includes(expected));
});

test('Next development origin is loopback-only and ignored in packaged apps', () => {
  assert.equal(
    developmentOrigin({ packaged: false, value: 'http://127.0.0.1:3000' }),
    'http://127.0.0.1:3000',
  );
  assert.equal(developmentOrigin({ packaged: true, value: 'http://127.0.0.1:3000' }), null);
  for (const value of [
    'https://example.test',
    'http://127.0.0.1:3000/path',
    'http://user@127.0.0.1:3000',
    'http://localhost:3000',
  ]) {
    assert.throws(() => developmentOrigin({ packaged: false, value }));
  }
});
