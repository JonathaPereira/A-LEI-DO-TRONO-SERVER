'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  Bots = require('../src/lib/games/bot-names.ts');
test('all tabletop services use the same names, number extra bots, and keep replacement names after account changes', () => {
  assert.deepEqual(Bots.names, ['Epaminondas', 'Bonifácio', 'Cícero']);
  assert.equal(Bots.at(3), 'Epaminondas 2');
  for (const [file, factory, kind] of [
    ['azul-service', 'createAzulService', 'azul'],
    ['splendor-service', 'createSplendorService', 'splendor'],
    ['love-letter-service.ts', 'createLoveLetterService', 'love-letter'],
  ]) {
    const me = { account: { id: 'me', nickname: 'Pessoa', expiresAt: Date.now() + 60000 } },
      friend = { account: { id: 'friend', nickname: 'Amigo', expiresAt: Date.now() + 60000 } },
      service = require('../server/' + file)[factory]({
        auth: { configured: false },
        wss: { clients: new Set([me, friend]) },
        send() {},
        botDelay: 60000,
      });
    try {
      service.handle(me, { action: 'create', maxPlayers: kind === 'love-letter' ? 6 : 4 });
      const room = [...service.rooms.values()][0];
      service.handle(friend, { action: 'join', roomId: room.id });
      service.handle(me, { action: 'start', fillBots: true });
      assert.deepEqual(
        room.players.filter((p) => p.bot).map((p) => p.name),
        kind === 'love-letter'
          ? ['Epaminondas', 'Bonifácio', 'Cícero', 'Epaminondas 2']
          : ['Epaminondas', 'Bonifácio'],
      );
      service.handle(me, { action: 'leave' });
      const replacement = room.players.find((p) => p.id === 'me');
      assert.equal(replacement.name, kind === 'love-letter' ? 'Bonifácio 2' : 'Cícero');
      assert.equal(room.state.players.find((p) => p.id === 'me').name, replacement.name);
      service.updateAccount({ ...me.account, nickname: 'Nome posterior' });
      assert.notEqual(replacement.name, 'Nome posterior');
    } finally {
      service.stop();
    }
  }
});

test('private download retention keeps 0.2.0 and the most recent 0.1.x across the minor transition', () => {
  const { planBuildRetention, MARKER } = require('../scripts/desktop/publish-build.cjs');
  const releases = ['0.1.16', '0.1.17', '0.2.0'].map((v, i) => ({
    id: i + 1,
    tag_name: 'desktop-v' + v + '-run-' + (100 + i),
    draft: true,
    body: MARKER,
    assets: [
      'MN-Trono-' + v + '-Windows.exe',
      'SHA256SUMS-' + v + '.txt',
      'MN-Trono-Frontend-' + v + '.zip',
    ].map((name) => ({ name, state: 'uploaded' })),
  }));
  assert.deepEqual(planBuildRetention(releases), { keep: [3, 2], remove: [1] });
});
