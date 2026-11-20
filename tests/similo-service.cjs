const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createSimiloService } = require('../server/similo-service.ts');
const { readSimiloCommand } = require('../server/similo-protocol.ts');
const { readSimiloRoom } = require('../src/lib/games/similo/protocol.ts');
const R = require('../src/lib/games/similo/rules.ts');
function fixture(options = {}) {
  const clients = [0, 1, 2, 3].map((i) => ({
    account: { id: 'person-' + i, nickname: 'Pessoa ' + i, expiresAt: Date.now() + 1000000 },
    out: [],
  }));
  const service = createSimiloService({
    wss: { clients },
    send: (ws, m) => ws.out.push(m),
    createRandom: () => () => 0.45,
    ...options,
  });
  const send = (i, m) => {
    service.handle(clients[i], m);
    return clients[i].out.at(-1);
  };
  return {
    clients,
    service,
    send,
    start() {
      send(0, {
        action: 'create',
        settings: {
          maxPlayers: 3,
          boardThemes: ['animals', 'history'],
          clueThemes: ['tales', 'myths'],
        },
      });
      const id = clients[0].similoRoomId;
      send(1, { action: 'join', roomId: id });
      send(2, { action: 'join', roomId: id });
      const room = service.rooms.get(id);
      send(0, { action: 'start', revision: room.revision });
      assert(room.state);
      return room;
    },
  };
}
test('Similo service authorizes authenticated actors, projections and revision before moves', () => {
  const f = fixture();
  try {
    const room = f.start(),
      [a, b, c, out] = f.clients;
    for (const ws of [a, b, c]) {
      const view = ws.out.findLast((e) => e.type === 'similo-state').room;
      const read = readSimiloRoom(view, ws.account.id);
      assert(!('drawPile' in view.state));
      assert.equal(read.state.secretId, ws === a ? room.state.secretId : null);
      assert.equal(read.state.hand.length, ws === a ? 5 : 0);
      assert(!JSON.stringify(view).includes('access_token'));
    }
    assert(!out.out.some((e) => e.type === 'similo-state'));
    const before = structuredClone(room.state),
      revision = room.revision;
    assert.equal(
      f.send(1, {
        action: 'move',
        revision,
        role: 'narrator',
        move: { kind: 'clue', cardId: room.state.hand[0], relation: 'like' },
      }).code,
      'SIMILO_FORBIDDEN',
    );
    assert.deepEqual(room.state, before);
    assert.equal(
      f.send(0, {
        action: 'move',
        revision: revision - 1,
        move: { kind: 'clue', cardId: room.state.hand[0], relation: 'like' },
      }).code,
      'SIMILO_STALE',
    );
    assert.deepEqual(room.state, before);
    assert.equal(f.send(3, { action: 'state' }).code, 'SIMILO_NOT_MEMBER');
    assert(!out.out.some((e) => e.type === 'similo-state'));
    f.send(0, {
      action: 'move',
      revision,
      move: { kind: 'clue', cardId: room.state.hand[0], relation: 'like' },
    });
    assert.equal(room.state.phase, 'vote');
    assert.equal(room.revision, revision + 1);
    assert.equal(
      f.send(0, {
        action: 'move',
        revision: room.revision,
        move: { kind: 'vote', selected: [room.state.board[0]], confirmed: true },
      }).code,
      'SIMILO_FORBIDDEN',
    );
    const leaked = structuredClone(b.out.findLast((e) => e.type === 'similo-state').room);
    leaked.state.secretId = room.state.secretId;
    assert.throws(() => readSimiloRoom(leaked, b.account.id));
    leaked.state.secretId = null;
    leaked.state.hand = [room.state.hand[0]];
    assert.throws(() => readSimiloRoom(leaked, b.account.id));
  } finally {
    f.service.stop();
  }
});
test('Similo actual service completes all rounds with a rotating captain and disagreement', async () => {
  const f = fixture({ revealDelay: 8 });
  try {
    const room = f.start();
    for (let round = 0; round < 5; round++) {
      const g = room.state;
      assert.equal(g.round, round);
      f.send(0, {
        action: 'move',
        revision: room.revision,
        move: { kind: 'clue', cardId: g.hand[0], relation: round % 2 ? 'unlike' : 'like' },
      });
      const safe = g.board.filter((id) => id !== g.secretId && !g.eliminated.includes(id)),
        quota = R.ELIMINATIONS[round];
      for (let i = 1; i <= 2; i++)
        f.send(i, {
          action: 'move',
          revision: room.revision,
          move: {
            kind: 'vote',
            selected: safe.slice(
              safe.length > quota ? i - 1 : 0,
              (safe.length > quota ? i - 1 : 0) + quota,
            ),
            confirmed: true,
          },
        });
      const captain = (round % 2) + 1,
        wrong = captain === 1 ? 2 : 1;
      const before = room.state;
      f.send(wrong, {
        action: 'move',
        revision: room.revision,
        move: { kind: 'resolve', selected: safe.slice(0, quota) },
      });
      assert.equal(room.state, before);
      f.send(captain, {
        action: 'move',
        revision: room.revision,
        move: { kind: 'resolve', selected: safe.slice(0, quota) },
      });
      assert.equal(room.state.phase, 'resolving');
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(room.state.phase, 'finished');
    assert.equal(room.state.won, true);
    for (const c of f.clients.slice(0, 3))
      assert.equal(
        c.out.findLast((e) => e.type === 'similo-state').room.state.secretId,
        room.state.secretId,
      );
    f.send(0, { action: 'rematch', revision: room.revision });
    assert.equal(room.state.phase, 'clue');
    assert.equal(room.state.eliminated.length, 0);
    assert.equal(
      f.clients[1].out.findLast((e) => e.type === 'similo-state').room.state.secretId,
      null,
    );
  } finally {
    f.service.stop();
  }
});
test('Similo reconnect preserves votes; explicit leave/timeout closes an active table and stale timer cannot advance it', async () => {
  const f = fixture({ disconnectDelay: 20, revealDelay: 25 });
  try {
    let room = f.start();
    const [a, b] = f.clients;
    f.send(0, {
      action: 'move',
      revision: room.revision,
      move: { kind: 'clue', cardId: room.state.hand[0], relation: 'like' },
    });
    const safe = room.state.board.find((id) => id !== room.state.secretId);
    for (const i of [1, 2])
      f.send(i, {
        action: 'move',
        revision: room.revision,
        move: { kind: 'vote', selected: [safe], confirmed: true },
      });
    f.send(1, {
      action: 'move',
      revision: room.revision,
      move: { kind: 'resolve', selected: [safe] },
    });
    const abandoned = room,
      stateBeforeLeave = room.state;
    assert.equal(stateBeforeLeave.phase, 'resolving');
    f.service.disconnect(b);
    const restored = { account: b.account, out: [] };
    f.clients.push(restored);
    f.service.handle(restored, { action: 'resume', roomId: room.id });
    assert.equal(room.players[1].ws, restored);
    assert.deepEqual(room.state.votes, stateBeforeLeave.votes);
    assert.equal(f.send(1, { action: 'resume', roomId: room.id }).code, 'SIMILO_OTHER_SESSION');
    f.service.handle(restored, { action: 'leave' });
    assert(!f.service.rooms.has(room.id));
    assert.equal(a.similoRoomId, null);
    f.send(0, {
      action: 'create',
      settings: { maxPlayers: 2, boardThemes: ['animals'], clueThemes: ['animals'] },
    });
    room = f.service.rooms.get(a.similoRoomId);
    f.service.handle(restored, { action: 'join', roomId: room.id });
    f.send(0, { action: 'start', revision: room.revision });
    f.service.disconnect(a);
    await new Promise((r) => setTimeout(r, 40));
    assert(!f.service.rooms.has(room.id));
    assert(restored.out.some((e) => e.type === 'similo-left'));
    assert.equal(
      abandoned.state,
      stateBeforeLeave,
      'Cancelled reveal cannot mutate an abandoned room',
    );
  } finally {
    f.service.stop();
  }
});
test('Similo malformed commands cannot coerce roles, themes, votes, counts or revisions', () => {
  for (const v of [
    null,
    [],
    {},
    {
      action: 'create',
      settings: { maxPlayers: '4', boardThemes: ['animals'], clueThemes: ['animals'] },
    },
    {
      action: 'create',
      settings: { maxPlayers: 9, boardThemes: ['animals'], clueThemes: ['animals'] },
    },
    {
      action: 'create',
      settings: { maxPlayers: 4, boardThemes: ['animals', 'animals'], clueThemes: ['animals'] },
    },
    {
      action: 'move',
      revision: 0,
      move: { kind: 'vote', selected: ['animals-0'], confirmed: 'true' },
    },
    { action: 'move', revision: -1, move: { kind: 'resolve', selected: [] } },
    {
      action: 'configure',
      revision: 0,
      settings: {
        maxPlayers: 3,
        boardThemes: ['animals'],
        clueThemes: ['history'],
        narratorId: {},
      },
    },
  ])
    assert.throws(() => readSimiloCommand(v));
  assert.deepEqual(
    readSimiloCommand({
      action: 'move',
      revision: 1,
      actor: 'forged',
      secretId: 'animals-0',
      move: { kind: 'vote', selected: ['animals-0'], confirmed: true, role: 'captain' },
    }),
    {
      action: 'move',
      revision: 1,
      move: { kind: 'vote', selected: ['animals-0'], confirmed: true },
    },
  );
});
