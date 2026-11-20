'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { earlyReferrerPolicy } = require('../scripts/prepare-static-html.cjs');
test('exported referrer policy precedes hoisted resources while preserving metadata and scripts', () => {
  const input =
    '<html><head><meta charSet="utf-8"/><link rel="preload" href="cover.webp"/><script src="app.js"></script><meta name="referrer" content="no-referrer"/><meta name="description" content="App"/></head><body>hello</body></html>';
  const output = earlyReferrerPolicy(input);
  assert(output.indexOf('name="referrer"') < output.indexOf('<link'));
  assert(output.indexOf('name="referrer"') < output.indexOf('<script'));
  assert(output.indexOf('charSet') < output.indexOf('name="referrer"'));
  assert.equal((output.match(/name="referrer"/g) ?? []).length, 1);
  assert(output.includes('<script src="app.js"></script>'));
  assert(output.includes('<meta name="description" content="App"/>'));
  assert(output.endsWith('<body>hello</body></html>'));
  assert.equal(earlyReferrerPolicy(output), output);
});
test('missing policy is inserted and broken exports fail instead of being published as prepared', () => {
  assert.equal(
    earlyReferrerPolicy('<html><head></head></html>'),
    '<html><head><meta name="referrer" content="no-referrer"/></head></html>',
  );
  assert.throws(() => earlyReferrerPolicy('<html><body>wrong</body></html>'), /head/);
  assert.throws(() => earlyReferrerPolicy('<html><head>wrong'), /head/);
});
