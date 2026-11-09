'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MEN_GAMES_REGISTRY,
  getAllRegisteredGames,
  getRegisteredGame,
  getGameByDestination,
} = require('../src/lib/men-games/registry.ts');

test('MeN Games Registry exports all 9 canonical games with complete metadata', () => {
  const games = getAllRegisteredGames();
  assert.equal(games.length, 9);
  assert.equal(games, MEN_GAMES_REGISTRY);

  const expectedDestinations = [
    'throne',
    'azul',
    'splendor',
    'similo',
    'love-letter',
    'ticket-to-ride',
    'roguelite',
    'atalaia',
    'nexus',
  ];

  for (const dest of expectedDestinations) {
    const game = games.find((g) => g.destination === dest);
    assert.ok(game, `Missing game in registry for destination: ${dest}`);
    assert.equal(typeof game.id, 'string');
    assert.equal(typeof game.title, 'string');
    assert.equal(typeof game.tag, 'string');
    assert.equal(typeof game.description, 'string');
    assert.equal(typeof game.version, 'string');
    assert.equal(typeof game.entryUrl, 'string');
    assert.equal(typeof game.image, 'string');
    assert.equal(typeof game.authRequired, 'boolean');
    assert.equal(typeof game.fullscreen, 'boolean');
    assert.equal(typeof game.multiplayer, 'boolean');
    assert.equal(game.status, 'available');
  }
});

test('getRegisteredGame finds games by canonical ID or destination', () => {
  const throne = getRegisteredGame('throne');
  assert.ok(throne);
  assert.equal(throne.title, 'A Lei do Trono');
  assert.equal(throne.launchMode, 'embedded-stage');

  const roguelite = getRegisteredGame('roguelite');
  assert.ok(roguelite);
  assert.equal(roguelite.title, 'Cinzas do Abismo');
  assert.equal(roguelite.launchMode, 'isolated-iframe');

  const atalaia = getRegisteredGame('atalaia');
  assert.ok(atalaia);
  assert.equal(atalaia.title, 'Atalaia');
  assert.equal(atalaia.launchMode, 'external-window');

  assert.equal(getRegisteredGame('non-existent-game'), undefined);
});

test('getGameByDestination resolves each destination route correctly', () => {
  assert.equal(getGameByDestination('nexus')?.title, 'Nexus');
  assert.equal(getGameByDestination('similo')?.title, 'Similo');
  assert.equal(getGameByDestination('azul')?.title, 'Azul');
  assert.equal(getGameByDestination('community'), undefined);
});

test('games/registry.json matches TypeScript registry data integrity', () => {
  const jsonPath = path.resolve(__dirname, '../games/registry.json');
  assert.ok(fs.existsSync(jsonPath), 'games/registry.json must exist');
  const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  assert.equal(jsonContent.version, '1.0.0');
  assert.equal(Array.isArray(jsonContent.games), true);
  assert.equal(jsonContent.games.length, MEN_GAMES_REGISTRY.length);

  for (const game of MEN_GAMES_REGISTRY) {
    const fromJson = jsonContent.games.find((g) => g.id === game.id);
    assert.ok(fromJson, `Game ${game.id} missing in games/registry.json`);
    assert.equal(fromJson.title, game.title);
    assert.equal(fromJson.destination, game.destination);
    assert.equal(fromJson.launchMode, game.launchMode);
    assert.equal(fromJson.version, game.version);
    assert.equal(fromJson.authRequired, game.authRequired);
  }
});
