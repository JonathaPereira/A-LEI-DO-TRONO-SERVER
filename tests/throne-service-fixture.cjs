'use strict';
const assert = require('node:assert/strict');
const { createThroneService } = require('../server/throne-service.ts');

const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
function fixture({
  factory = createThroneService,
  humans = 4,
  seed = 17,
  decree = 'favor',
  ...options
} = {}) {
  const messages = [],
    prompts = [];
  const room = { id: 'sala-cetro', kind: 'game', name: 'Cetro', players: new Map(), game: null };
  const rooms = new Map([[room.id, room]]);
  const sockets = Array.from({ length: humans }, (_, seat) => ({
    clientId: `human-${seat}`,
    roomId: room.id,
  }));
  for (const [seat, ws] of sockets.entries())
    room.players.set(ws.clientId, { id: ws.clientId, ws, seat, name: `Casa ${seat}`, ready: true });
  const send = (ws, value) => {
    const message = JSON.parse(JSON.stringify(value));
    messages.push({ seat: Number(ws.clientId.split('-')[1]), message });
    if (message.type === 'game-prompt') prompts.push({ ws, prompt: message.prompt });
    if (message.type === 'private-intelligence') prompts.push({ ws, ack: 'intelligence-ack' });
    if (message.type === 'private-usurpation') prompts.push({ ws, ack: 'usurp-ack' });
    if (message.type === 'game-state' && message.state) {
      const state = message.state;
      for (const player of state.players)
        if (player.id !== state.youSeat) {
          assert.equal(player.hand, undefined);
          assert.equal(player.reserve, undefined);
          assert.equal(player.intelligence, undefined);
        }
      for (const play of state.plays)
        if (play.hidden && play.playerId !== state.youSeat) assert.equal(play.card, null);
    }
    if (message.type === 'game-event')
      assert.notEqual(message.event, 'server-error', message.message);
  };
  const safeRoom = (r) => ({
    id: r.id,
    players: [...r.players.values()].map(({ id, seat, ready }) => ({ id, seat, ready })),
  });
  const service = factory({
    rooms,
    send,
    safeRoom,
    broadcastRoom: () => messages.push({ room: safeRoom(room) }),
    broadcastRooms: () => {},
    version: 'fixture',
    chooseDecrees: () => [decree],
    random: seeded(seed),
    ...options,
  });
  return { service, sockets, rooms, room, messages, prompts };
}

/** A synchronous clock keeps parity replays independent from machine timing. */
function withClock(run) {
  const original = { setTimeout, clearTimeout, now: Date.now };
  const timers = new Map();
  let now = 1_000_000,
    serial = 0;
  global.setTimeout = (fn, ms) => {
    const timer = {
      id: ++serial,
      unref() {
        return this;
      },
    };
    timers.set(timer, { fn, at: now + ms });
    return timer;
  };
  global.clearTimeout = (timer) => timers.delete(timer);
  Date.now = () => now;
  const clock = {
    get pending() {
      return timers.size;
    },
    next() {
      const [timer, job] = [...timers].sort(([, a], [, b]) => a.at - b.at)[0] || [];
      assert(job, 'match must have a pending transition or turn timeout');
      timers.delete(timer);
      now = job.at;
      job.fn();
    },
    snapshot: () => [...timers.values()].map(({ fn }) => fn),
  };
  try {
    return run(clock);
  } finally {
    global.setTimeout = original.setTimeout;
    global.clearTimeout = original.clearTimeout;
    Date.now = original.now;
  }
}

function runMatch(factory, options) {
  return withClock((clock) => {
    const f = fixture({ factory, ...options });
    const decision = seeded(options.seed + 239),
      count = { actions: 0, views: 0, ticks: 0 };
    const act = (ws, action, payload) => {
      count.actions++;
      f.service.handle(ws, { type: 'game-action', action, ...(payload ? { payload } : {}) });
    };
    const pick = (items) => items[Math.floor(decision() * items.length)];
    try {
      f.service.start(f.sockets[0]);
      for (let step = 0; step < 6000 && f.room.game.phase !== 'game-over'; step++) {
        while (f.prompts.length) {
          const { ws, prompt, ack } = f.prompts.shift();
          if (ack) {
            act(ws, ack);
            continue;
          }
          let payload;
          if (
            prompt.kind === 'choose-decree' ||
            prompt.kind === 'choose-trump' ||
            prompt.kind === 'choose-law'
          )
            payload = { value: pick(prompt.options) };
          else if (prompt.kind === 'usurp-target')
            payload = { targetSeat: pick(prompt.options).seat };
          else if (prompt.kind === 'usurp-pick')
            payload = { index: Math.floor(decision() * prompt.count) };
          else payload = { cardId: pick(prompt.cardIds) };
          act(ws, prompt.kind, payload);
        }
        const game = f.room.game;
        if (
          game.phase === 'await-play' &&
          game.turn !== null &&
          !game.players[game.turn].bot &&
          !(game.decree.id === 'reserva' && game.trick === 10)
        ) {
          const ws = f.sockets[game.turn],
            state = f.service.privateState(f.room, game.turn);
          const influenceAction =
            state.canUseManeuver && decision() < 0.5
              ? pick(['plus', 'minus'])
              : state.canUseInfluence && decision() < 0.5
                ? 'sigilo'
                : 'none';
          const cardId = pick(
            influenceAction === 'none' ? state.legalCardIds : state.influenceLegalCardIds,
          );
          const card = state.players[game.turn].hand.find((card) => card.id === cardId);
          act(ws, 'play-card', {
            cardId,
            influenceAction,
            ...(influenceAction !== 'none' && !state.plays.length
              ? { declaredSuit: card.suit }
              : {}),
          });
        } else {
          clock.next();
          count.ticks++;
        }
      }
      assert.equal(f.room.game.phase, 'game-over');
      const failures = f.messages.filter(({ message }) => message?.type === 'error');
      assert.deepEqual(failures, []);
      count.views = f.messages.filter(({ message }) => message?.type === 'game-state').length;
      return { messages: f.messages, count };
    } finally {
      f.service.stop();
      assert.equal(clock.pending, 0, 'stop owns all match timers');
    }
  });
}
module.exports = { fixture, withClock, runMatch, seeded };
