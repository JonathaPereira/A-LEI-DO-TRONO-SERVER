'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '../src/styles');
const imports = [
  ...fs
    .readFileSync(path.join(root, 'index.css'), 'utf8')
    .matchAll(/^@import ['"]([^'"]+)['"];$/gm),
].map((match) => path.resolve(root, match[1]));
test('CSS assets remain local and resolve from the public root in web and the packaged desktop', () => {
  let checked = 0;
  for (const file of imports)
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/url\((['"]?)([^)]*?)\1\)/g)) {
      const value = match[2];
      if (value.startsWith('data:')) continue;
      assert(value.startsWith('/assets/'), file + ': ' + value);
      assert(fs.statSync(path.resolve(__dirname, '../public', '.' + value)).isFile(), value);
      checked++;
    }
  assert(checked > 0);
});
