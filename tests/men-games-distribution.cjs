const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { buildMenGamesDistribution } = require('../scripts/build-men-games.cjs');

test('buildMenGamesDistribution generates decoupled registry and index hub', () => {
  buildMenGamesDistribution();

  const distRoot = path.join(root, 'artifacts/men-games-distribution');
  assert.ok(fs.existsSync(distRoot), 'Distribution directory must exist');

  const indexPath = path.join(distRoot, 'index.html');
  const registryPath = path.join(distRoot, 'registry.json');
  assert.ok(fs.existsSync(indexPath), 'Launcher index.html must exist');
  assert.ok(fs.existsSync(registryPath), 'registry.json must exist');

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.equal(registry.games.length, 9);

  for (const game of registry.games) {
    assert.ok(html.includes(game.title), `Expected ${game.title} in index.html`);
    assert.ok(html.includes('https://'), `Expected remote URL for ${game.id} in index.html`);
  }
});
