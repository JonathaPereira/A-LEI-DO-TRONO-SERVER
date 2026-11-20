'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'out');
const targetDir = path.join(root, 'artifacts/men-trono-communication');

function isGameAsset(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return (
    normalized.startsWith('roguelite/') ||
    normalized.startsWith('assets/azul/') ||
    normalized.startsWith('assets/cards/') ||
    normalized.startsWith('assets/ticket-to-ride/') ||
    normalized.startsWith('assets/splendor/') ||
    normalized.startsWith('assets/love-letter/') ||
    normalized.startsWith('manual/')
  );
}

function copyFiltered(src, dest, rel = '') {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    for (const child of fs.readdirSync(src)) {
      const childRel = rel ? `${rel}/${child}` : child;
      if (!isGameAsset(childRel)) {
        copyFiltered(path.join(src, child), path.join(dest, child), childRel);
      }
    }
  } else {
    if (!isGameAsset(rel)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

function buildTronoCommunication() {
  console.log('Building standalone MeN Trono Communication package (lightweight)...');

  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    throw new Error('out/index.html not found! Run npm run build first.');
  }

  // Clean and prepare output
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  copyFiltered(outDir, targetDir);

  // Measure total size
  let totalBytes = 0;
  function measure(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) measure(full);
      else totalBytes += fs.statSync(full).size;
    }
  }
  measure(targetDir);

  const mb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(`MeN Trono Communication package generated successfully: ${mb} MB (target: ~14 MB)`);
  return { totalBytes, mb };
}

if (require.main === module) {
  buildTronoCommunication();
}

module.exports = { buildTronoCommunication, isGameAsset };
