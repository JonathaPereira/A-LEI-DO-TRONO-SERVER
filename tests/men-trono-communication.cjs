const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { buildTronoCommunication, isGameAsset } = require('../scripts/build-trono-communication.cjs');

test('isGameAsset correctly flags games assets and protects communication assets', () => {
  assert.equal(isGameAsset('roguelite/core.js'), true);
  assert.equal(isGameAsset('roguelite/assets/creatures.webp'), true);
  assert.equal(isGameAsset('assets/azul/board.webp'), true);
  assert.equal(isGameAsset('assets/cards/cetro_1.webp'), true);
  assert.equal(isGameAsset('manual/manual.pdf'), true);

  // Communication assets must NOT be flagged as game assets
  assert.equal(isGameAsset('index.html'), false);
  assert.equal(isGameAsset('_next/static/chunks/app.js'), false);
  assert.equal(isGameAsset('auth-boot.js'), false);
  assert.equal(isGameAsset('application-audio-worklet.js'), false);
  assert.equal(isGameAsset('clips-pcm-worklet.js'), false);
  assert.equal(isGameAsset('assets/sounds/join.mp3'), false);
});

test('buildTronoCommunication creates a lightweight communication bundle under 15 MB', () => {
  const result = buildTronoCommunication();
  assert.ok(result);
  assert.ok(Number(result.mb) <= 15.0, `Bundle size ${result.mb} MB must be under 15 MB`);

  const distDir = path.join(root, 'artifacts/men-trono-communication');
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'index.html must exist');
  assert.ok(fs.existsSync(path.join(distDir, 'auth-boot.js')), 'auth-boot.js must exist');
  assert.ok(
    fs.existsSync(path.join(distDir, 'application-audio-worklet.js')),
    'audio worklet must exist',
  );

  // Must not contain decoupled game assets
  assert.equal(fs.existsSync(path.join(distDir, 'roguelite/assets')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'assets/azul')), false);
});
