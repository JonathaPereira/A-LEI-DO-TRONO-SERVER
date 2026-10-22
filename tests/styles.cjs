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
function files(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
test('one explicit cascade includes every global domain stylesheet exactly once within the style root', () => {
  assert(imports.length > 0);
  assert.equal(new Set(imports).size, imports.length);
  for (const file of imports) {
    assert(file.startsWith(root + path.sep));
    assert(fs.statSync(file).isFile());
  }
  const sources = files(root).filter(
    (file) =>
      file.endsWith('.css') &&
      !file.endsWith('.module.css') &&
      file !== path.join(root, 'index.css'),
  );
  assert.deepEqual([...imports].sort(), sources.sort());
});
test('global CSS enters through the root layout while component CSS Modules remain independently usable', () => {
  const sourceRoot = path.resolve(root, '..'),
    found = [];
  for (const file of files(sourceRoot).filter((file) => /\.tsx?$/.test(file))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^import\s+(?:[^;\n]+?\s+from\s+)?['"]([^'"]+\.css)['"];$/gm))
      if (!match[1].endsWith('.module.css')) found.push({ file, import: match[1] });
  }
  assert.equal(found.length, 2);
  assert(found.every((item) => item.file === path.join(sourceRoot, 'app/layout.tsx')));
  assert.equal(found[0].import, './globals.css');
  assert.equal(found[1].import, '@/styles/index.css');
});
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
