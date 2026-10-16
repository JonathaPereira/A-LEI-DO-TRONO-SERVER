'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/legacy');
const target = path.join(root, 'public');

// These are build inputs, never a second editable copy of the controllers.
for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
  if (entry.isFile() && /\.(js|css)$/.test(entry.name)) {
    fs.copyFileSync(path.join(source, entry.name), path.join(target, entry.name));
  }
}
const compilerPackage = require.resolve('typescript/package.json');
const compiler = path.resolve(path.dirname(compilerPackage), require(compilerPackage).bin.tsc);
const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.renderer.json'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
fs.copyFileSync(
  path.join(root, 'artifacts/renderer/lib/voice/control-layout.js'),
  path.join(target, 'call-controls-layout.js'),
);
console.log('Renderer compatibility assets prepared.');
