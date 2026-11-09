'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const suits = ['cetro', 'chave', 'lamina', 'mascara'];
const laws = ['ordem', 'estandarte', 'revolta', 'anarquia', 'usurpacao'];

test('A Lei do Trono assets contains all 48 suit cards and 5 laws', () => {
  const cardsDir = path.join(root, 'assets/cards');
  assert.ok(fs.existsSync(cardsDir), 'assets/cards must exist');

  let cardCount = 0;
  for (const suit of suits) {
    for (let i = 1; i <= 12; i++) {
      const num = String(i).padStart(2, '0');
      const filename = `${suit}_${num}.webp`;
      const p = path.join(cardsDir, filename);
      assert.ok(fs.existsSync(p), `Missing card asset: ${filename}`);
      assert.ok(fs.statSync(p).size > 1000, `Card asset too small: ${filename}`);
      cardCount++;
    }
  }
  assert.equal(cardCount, 48, 'Must have exactly 48 playing cards');

  const lawsDir = path.join(root, 'assets/laws');
  assert.ok(fs.existsSync(lawsDir), 'assets/laws must exist');

  for (const law of laws) {
    const filename = `${law}.svg`;
    const p = path.join(lawsDir, filename);
    assert.ok(fs.existsSync(p), `Missing law asset: ${filename}`);
  }
});

test('A Lei do Trono documentation contains official PDF manual', () => {
  const manualPath = path.join(root, 'documentation/manual.pdf');
  assert.ok(fs.existsSync(manualPath), 'documentation/manual.pdf must exist');
  assert.ok(fs.statSync(manualPath).size > 1000000, 'manual.pdf must be full version');
});

test('A Lei do Trono package metadata has valid descriptor', () => {
  const pkgPath = path.join(root, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.name, '@men-games/lei-do-trono');
  assert.equal(pkg.version, '0.14.0-alpha');
});
