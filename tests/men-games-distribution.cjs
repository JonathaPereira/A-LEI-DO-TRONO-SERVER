const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { buildMenGamesDistribution } = require('../scripts/build-men-games.cjs');

test('buildMenGamesDistribution packages independent games and central launcher hub', () => {
  buildMenGamesDistribution();

  const distRoot = path.join(root, 'artifacts/men-games-distribution');
  assert.ok(fs.existsSync(distRoot), 'Distribution directory must exist');

  // Hub index and registry
  assert.ok(fs.existsSync(path.join(distRoot, 'index.html')), 'Launcher index.html must exist');
  assert.ok(fs.existsSync(path.join(distRoot, 'registry.json')), 'registry.json must exist');

  // A Lei do Trono package
  const leiDoTrono = path.join(distRoot, 'lei-do-trono');
  assert.ok(fs.existsSync(path.join(leiDoTrono, 'index.html')), 'lei-do-trono index.html must exist');
  assert.ok(fs.existsSync(path.join(leiDoTrono, 'style.css')), 'lei-do-trono style.css must exist');
  assert.ok(fs.existsSync(path.join(leiDoTrono, 'app.js')), 'lei-do-trono app.js must exist');
  assert.ok(fs.existsSync(path.join(leiDoTrono, 'documentation/manual.pdf')), 'lei-do-trono manual.pdf must exist');

  // Cinzas do Abismo package
  const cinzas = path.join(distRoot, 'cinzas-do-abismo');
  assert.ok(fs.existsSync(path.join(cinzas, 'index.html')), 'cinzas index.html must exist');
  assert.ok(fs.existsSync(path.join(cinzas, 'core/core.js')), 'cinzas core.js must exist');
  assert.ok(fs.existsSync(path.join(cinzas, 'manifest.json')), 'cinzas manifest.json must exist');
  assert.ok(fs.existsSync(path.join(cinzas, 'assets/catalogue-cover.png')), 'cinzas catalogue cover must exist');
});
