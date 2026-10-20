'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/legacy');
const target = path.join(root, 'public');

// Every root JS/CSS in public is generated; keep only current sources and typed outputs.
const outputs = new Map(
  fs
    .readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(js|css)$/.test(entry.name))
    .map((entry) => [entry.name, path.join(source, entry.name)]),
);
outputs.set(
  'call-controls-layout.js',
  path.join(root, 'artifacts/renderer/lib/voice/control-layout.js'),
);
outputs.set(
  'application-audio-worklet.js',
  path.join(root, 'artifacts/renderer/lib/voice/worklets/application-audio.js'),
);
outputs.set(
  'light-noise-worklet.js',
  path.join(root, 'artifacts/renderer/lib/voice/worklets/light-noise.js'),
);
const compilerPackage = require.resolve('typescript/package.json');
const compiler = path.resolve(path.dirname(compilerPackage), require(compilerPackage).bin.tsc);
const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.renderer.json'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
// Wait for a successful compile before replacing or pruning generated files.
for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
  if (entry.isFile() && /\.(js|css)$/.test(entry.name) && !outputs.has(entry.name))
    fs.unlinkSync(path.join(target, entry.name));
}
for (const [filename, input] of outputs) fs.copyFileSync(input, path.join(target, filename));
console.log('Renderer compatibility assets prepared.');
