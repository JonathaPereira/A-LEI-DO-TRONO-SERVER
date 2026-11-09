const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { Engine, CARDS, CHAPTERS, FLOOR } = require(path.join(root, 'core/core.js'));
const Ledger = require(path.join(root, 'core/persistence.js'));

test('Cinzas do Abismo standalone package provides valid engine, cards and chapters', () => {
  assert.ok(Engine, 'Engine must be exported');
  assert.ok(Array.isArray(CARDS), 'CARDS must be an array');
  assert.equal(CARDS.length, 36, 'Must have exactly 36 authored cards');
  assert.ok(Array.isArray(CHAPTERS), 'CHAPTERS must be an array');
  assert.equal(CHAPTERS.length, 15, 'Must have exactly 15 campaign chapters');

  // Verify first chapter structure
  const chapter1 = CHAPTERS[0];
  assert.ok(chapter1.name, 'Chapter must have a name');
  assert.equal(typeof chapter1.biome, 'number', 'Chapter must declare a numeric biome');
  assert.ok(Array.isArray(chapter1.sections), 'Chapter must declare authored sections');
});

test('Cinzas do Abismo persistence Ledger handles saves and campaign storage', () => {
  assert.equal(typeof Ledger.backup, 'function', 'Ledger must export backup function');
  assert.equal(typeof Ledger.parseBackup, 'function', 'Ledger must export parseBackup function');

  const scores = [{ edition: '0.5', name: 'Lia', difficulty: 'normal', wave: 4, kills: 12 }];
  const raw = Ledger.backup(scores, null, null);
  assert.ok(typeof raw === 'string', 'backup must serialize to string');

  const parsed = Ledger.parseBackup(raw);
  assert.ok(parsed, 'Backup must parse cleanly');
  assert.equal(parsed.scores.length, 1);
  assert.equal(parsed.scores[0].name, 'Lia');
  assert.equal(parsed.scores[0].kills, 12);
  assert.equal(parsed.scores[0].difficulty, 'normal');
});

test('Cinzas do Abismo package contains essential frontend files and manifest', () => {
  const manifestPath = path.join(root, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.id, 'cinzas-do-abismo');
  assert.ok(Array.isArray(manifest.files), 'manifest must declare files');

  const frontendFiles = ['index.html', 'style.css', 'embedded.css', 'icon.svg'];
  for (const file of frontendFiles) {
    const filePath = path.join(root, 'frontend', file);
    assert.ok(fs.existsSync(filePath), `Frontend file ${file} must exist`);
  }
});
