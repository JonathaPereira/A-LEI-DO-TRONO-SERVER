'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createThroneService } = require('../server/throne-service.ts');
const { readThroneCommand } = require('../server/throne-protocol.ts');
const { throneRules } = require('../src/lib/games/throne-rules.ts');
const { fixture, withClock, runMatch } = require('./throne-service-fixture.cjs');
const act = (f, seat, action, payload) =>
  f.service.handle(f.sockets[seat], {
    type: 'game-action',
    action,
    ...(payload ? { payload } : {}),
  });
const gameJson = (f) => JSON.stringify(f.room.game);
const selectDecree = (f, decree) => {
  f.service.start(f.sockets[0]);
  const chooser = f.room.game.pending.seat;
  assert(!f.room.game.players[chooser].bot);
  act(f, chooser, 'choose-decree', { value: decree });
};

test('Throne commands validate every selection, numeric input and influence field before projecting known values', () => {
  for (const input of [
    null,
    [],
    {},
    { action: 'invalid' },
    { type: 'game-action', action: 'play-card', payload: [] },
    { action: 'usurp-target', payload: { targetSeat: 4 } },
    { action: 'usurp-pick', payload: { index: '0' } },
    { action: 'usurp-pick', payload: { index: NaN } },
    { action: 'choose-decree', payload: { value: 'unknown' } },
    { action: 'choose-law', payload: { value: '__proto__' } },
    { action: 'choose-trump', payload: { value: 'order' } },
    { action: 'rotation', payload: { cardId: 'c48' } },
    { action: 'play-card', payload: { cardId: 'c1', hidden: 1 } },
    { action: 'play-card', payload: { cardId: 'c1', influenceAction: 'free' } },
    { action: 'play-card', payload: { cardId: 'c1', declaredSuit: {} } },
  ]) {
    assert.equal(
      readThroneCommand(input && !Array.isArray(input) ? { type: 'game-action', ...input } : input),
      null,
      JSON.stringify(input),
    );
  }
  assert.deepEqual(
    readThroneCommand({
      type: 'game-action',
      action: 'play-card',
      payload: {
        cardId: 'c47',
        hidden: true,
        influenceAction: 'sigilo',
        declaredSuit: 'cetro',
        seat: 3,
        modifier: 500,
        influence: 99,
      },
    }),
    {
      action: 'play-card',
      payload: { cardId: 'c47', hidden: true, influenceAction: 'sigilo', declaredSuit: 'cetro' },
    },
  );
  assert.deepEqual(readThroneCommand({ type: 'game-action', action: 'usurp-ack' }), {
    action: 'usurp-ack',
    payload: {},
  });
});

test('match readiness and start belong to the current member and host, with at least two ready humans', () =>
  withClock(() => {
    const f = fixture({ humans: 2 });
    try {
      const stale = { ...f.sockets[0] };
      f.service.setReady(stale, false);
      f.service.start(stale);
      assert.equal(f.room.players.get('human-0').ready, true);
      assert.equal(f.room.game, null);
      f.service.setReady(f.sockets[0], 'true');
      assert.equal(f.messages.at(-1).message.code, 'INVALID_ACTION');
      f.service.start(f.sockets[1]);
      assert.equal(f.messages.at(-1).message.code, 'NOT_HOST');
      f.service.setReady(f.sockets[1], false);
      f.service.start(f.sockets[0]);
      assert.equal(f.messages.at(-1).message.code, 'PLAYERS_NOT_READY');
      f.room.players.delete('human-1');
      f.service.start(f.sockets[0]);
      assert.equal(f.messages.at(-1).message.code, 'NOT_ENOUGH_PLAYERS');
      f.room.kind = 'chat';
      f.service.start(f.sockets[0]);
      assert.equal(f.messages.at(-1).message.code, 'CHAT_ONLY_ROOM');
      assert.equal(f.room.game, null);
    } finally {
      f.service.stop();
    }
  }));

test('all ten decrees finish three authoritative rounds with bots, private hands, hidden plays and legal influence', () => {
  let actions = 0;
  for (const [seed, decree] of throneRules.decrees.entries()) {
    const result = runMatch(createThroneService, {
      decree: decree.id,
      seed: seed + 1,
      humans: seed % 2 ? 2 : 4,
    });
    actions += result.count.actions;
    const events = result.messages
      .filter(({ seat, message }) => seat === 0 && message?.type === 'game-event')
      .map(({ message }) => message);
    assert.equal(events.filter((event) => event.event === 'round-ended').length, 3, decree.id);
    assert.equal(events.filter((event) => event.event === 'trick-result').length, 30, decree.id);
    assert.equal(events.at(-1).event, 'game-ended');
    assert.equal(
      events.at(-1).scores.reduce((sum, score) => sum + score.crowns + score.shadows, 0),
      60,
    );
  }
  assert(actions > 1000);
});

test('malformed, stale-socket, foreign-card and out-of-phase actions cannot mutate a match', () =>
  withClock(() => {
    const f = fixture();
    try {
      selectDecree(f, 'favor');
      const turn = f.room.game.turn,
        before = gameJson(f);
      const card = f.room.game.players[turn].hand[0];
      f.service.handle(
        { ...f.sockets[turn] },
        { type: 'game-action', action: 'play-card', payload: { cardId: card.id } },
      );
      act(f, (turn + 1) % 4, 'play-card', { cardId: card.id });
      act(f, turn, 'usurp-pick', { index: 0 });
      act(f, turn, 'play-card', { cardId: card.id, influenceAction: 'free' });
      const foreign = f.room.game.players[(turn + 1) % 4].hand[0];
      act(f, turn, 'play-card', { cardId: foreign.id });
      assert.equal(f.messages.at(-1).message.code, 'ILLEGAL_CARD');
      assert.equal(gameJson(f), before);
    } finally {
      f.service.stop();
    }
  }));

test('a hidden lead remains visible only to its owner until the authoritative result', () =>
  withClock(() => {
    const f = fixture();
    try {
      selectDecree(f, 'favor');
      const seat = f.room.game.turn,
        card = f.room.game.players[seat].hand[0];
      act(f, seat, 'play-card', {
        cardId: card.id,
        influenceAction: 'sigilo',
        declaredSuit: card.suit,
      });
      assert.equal(f.room.game.players[seat].influence, 0);
      for (let viewer = 0; viewer < 4; viewer++) {
        const state = f.service.privateState(f.room, viewer);
        assert.equal(state.plays[0].hidden, true);
        assert.equal(state.plays[0].card?.id || null, viewer === seat ? card.id : null);
      }
      const played = f.messages.find(({ message }) => message?.event === 'card-played').message;
      assert.equal(played.card, null);
    } finally {
      f.service.stop();
    }
  }));

test('disconnect transfers a pending private acknowledgement to a bot exactly once without revealing the clue', () =>
  withClock((clock) => {
    const f = fixture({ decree: 'espionagem' });
    try {
      selectDecree(f, 'espionagem');
      const leaving = f.room.players.get('human-0');
      f.room.players.delete(leaving.id);
      f.service.disconnect(f.room, leaving, 'disconnect');
      const count = f.messages.length;
      f.service.disconnect(f.room, leaving, 'disconnect');
      assert.equal(f.messages.length, count);
      assert.equal(f.room.game.players[0].bot, true);
      assert.equal(f.room.game.players[0].clientId, null);
      assert(!f.room.game.pending.waiting.has(0));
      for (let seat = 1; seat < 4; seat++) act(f, seat, 'intelligence-ack');
      clock.next();
      assert.equal(f.room.game.phase, 'await-play');
      const replacement = f.messages.filter(
        ({ message }) => message?.event === 'player-replaced-by-bot',
      );
      assert.equal(replacement.length, 3);
      assert(!JSON.stringify(replacement).includes('intelligence'));
    } finally {
      f.service.stop();
    }
  }));

test('stop releases pending transitions, turn deadlines and private state, and suppresses callbacks already dequeued', () =>
  withClock((clock) => {
    const f = fixture();
    selectDecree(f, 'favor');
    const oldTimeout = clock.snapshot();
    assert(clock.pending > 0);
    f.service.stop();
    f.service.stop();
    const count = f.messages.length;
    for (const fn of oldTimeout) fn();
    f.service.start(f.sockets[0]);
    f.service.setReady(f.sockets[0], true);
    act(f, 0, 'usurp-ack');
    f.service.broadcastState(f.room);
    assert.equal(clock.pending, 0);
    assert.equal(f.room.game, null);
    assert.equal(f.service.privateState(f.room, 0), null);
    assert.equal(f.messages.length, count);
  }));

test('replacing a finished match invalidates old callbacks and stopping another instance preserves the live match', () =>
  withClock((clock) => {
    const f = fixture(),
      other = fixture();
    try {
      selectDecree(f, 'favor');
      const seat = f.room.game.turn;
      act(f, seat, 'play-card', { cardId: f.room.game.players[seat].hand[0].id });
      const oldCallbacks = clock.snapshot();
      f.room.game.phase = 'game-over';
      for (const member of f.room.players.values()) member.ready = true;
      f.service.start(f.sockets[0]);
      const before = gameJson(f),
        count = f.messages.length;
      for (const fn of oldCallbacks) fn();
      assert.equal(gameJson(f), before);
      assert.equal(f.messages.length, count);
      selectDecree(other, 'favor');
      f.service.stop();
      assert(other.room.game);
      assert(clock.pending > 0);
      assert.equal(
        other.service.privateState(other.room, other.room.game.turn).phase,
        'await-play',
      );
    } finally {
      f.service.stop();
      other.service.stop();
    }
  }));
