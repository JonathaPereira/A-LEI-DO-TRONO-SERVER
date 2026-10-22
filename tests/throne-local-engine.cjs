'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createThroneLocalEngine } = require('../src/lib/games/throne-local-engine.ts');
const { createThroneLocalLifecycle } = require('../src/lib/games/throne-local-lifecycle.ts');
const { throneRules } = require('../src/lib/games/throne-rules.ts');
const {
  readThronePrompt,
  readThroneLocalChoiceContext,
} = require('../src/lib/games/throne-choice-protocol.ts');
const { readThroneLocalHand } = require('../src/lib/games/throne-local-hand-protocol.ts');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(seed, { holdArrival = false, human = false } = {}) {
  let lifecycle,
    engine,
    online = false,
    sourceChanged,
    mode = null,
    shown = 0,
    left = 0,
    cleared = 0,
    publications = 0;
  const errors = [],
    results = [],
    rounds = new Map(),
    gates = new Map(),
    logs = [],
    timers = new Set();
  const prompts = new Set();
  let handContext = null,
    promptNumber = 0;
  const clear = () => {
    cleared++;
  };
  function round() {
    const game = engine.getState();
    if (!rounds.has(game.round)) rounds.set(game.round, { plays: new Map(), decree: null });
    return rounds.get(game.round);
  }
  function conservation(game) {
    const resolved = [...round().plays]
      .flatMap(([, plays]) => plays.map((p) => p.card))
      .filter((card) => !game.plays.some((play) => play.card.id === card.id));
    const cards = [
      ...game.undealt,
      ...resolved,
      ...game.plays.map((p) => p.card),
      ...game.players.flatMap((p) => [...p.hand, ...(p.reserve ? [p.reserve] : [])]),
    ];
    assert.equal(cards.length, 48);
    assert.equal(new Set(cards.map((c) => c.id)).size, 48);
    for (const card of cards) {
      const id = Number(card.id.slice(1)),
        suit = ['cetro', 'chave', 'lamina', 'mascara'][Math.floor(id / 12)];
      assert.equal(card.suit, suit);
      assert.equal(card.value, (id % 12) + 1);
    }
  }
  engine = createThroneLocalEngine({
    random: () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    },
    botName: (i) => 'Bot ' + i,
    scale: () => 1,
    show() {
      shown++;
    },
    leave() {
      left++;
      lifecycle.cancel();
    },
    choices: {
      beginLocal: () => ({}),
      clear,
      async showLocal(token, value, input) {
        assert(human);
        const context = readThroneLocalChoiceContext(value),
          prompt = readThronePrompt({ ...input, id: `p${++promptNumber}` });
        assert.equal(context.you, 0);
        prompts.add(prompt.kind);
        switch (prompt.kind) {
          case 'choose-decree':
          case 'choose-law':
          case 'choose-trump':
            return prompt.options[0];
          case 'usurp-target':
            return prompt.options[0].seat;
          case 'usurp-pick':
            return 0;
          default:
            return prompt.cardIds[0];
        }
      },
    },
    hand: {
      beginLocal: () => ({}),
      waitingLocal: false,
      clear,
      presentLocal(token, value, demo) {
        publications++;
        readThroneLocalHand(value, demo);
        if (!human) {
          assert(demo);
          assert.deepEqual(value.hand, []);
          assert.equal(value.reserve, null);
          assert.deepEqual(value.legal, []);
        } else {
          assert(!demo);
          assert.deepEqual(
            value.hand.map((c) => c.id),
            engine.getState().players[0].hand.map((c) => c.id),
          );
        }
      },
      async waitLocal(token, value) {
        assert(human);
        handContext = readThroneLocalHand(value, false);
        return {
          cardId: handContext.legal[0],
          influenceAction: 'none',
          declaredSuit: null,
          origin: null,
        };
      },
      getSnapshot() {
        return { context: handContext };
      },
      timeoutLocal() {
        throw Error('Demo cannot time out');
      },
    },
    match: {
      getSnapshot: () => ({ mode }),
      setLocal() {
        mode = 'local';
        publications++;
      },
      clear() {
        clear();
        mode = null;
      },
    },
    seats: {
      setLocal(value) {
        publications++;
        for (const player of value.players) {
          assert(player.influence >= 0 && player.influence <= 2);
          assert(!('hand' in player));
          assert(!('reserve' in player));
          assert(player.publicCards.every((c) => c.public));
        }
      },
    },
    table: {
      setLocal(value) {
        publications++;
        assert.equal(value.localSeat, human ? 0 : null);
        for (const play of value.plays)
          if (play.hidden && play.playerId !== value.localSeat) assert.equal(play.card, null);
        const game = engine.getState();
        if (game.decree) round().decree = game.decree.id;
        // Exchanges have their own atomicity checks. At play boundaries all 48 cards must be accounted for.
        if (game.phase === 'await-play' || game.phase === 'resolve') conservation(game);
        if (game.phase === 'resolve') {
          assert.equal(game.plays.length, 4);
          // The previous trick remains on the table briefly while the next law is announced.
          const retained = [...round().plays.values()].some((plays) =>
            plays.every((play, i) => play.card.id === game.plays[i].card.id),
          );
          if (!retained) round().plays.set(game.trick, structuredClone(game.plays));
        }
      },
    },
    private: {
      clear,
      async showLocal(value) {
        assert(human);
        assert(['intelligence', 'usurpation'].includes(value.kind));
      },
    },
    history: {
      clear,
      clearEntries() {},
      appendPublic(message) {
        publications++;
        logs.push(message);
      },
      async showLocal(value) {
        const game = engine.getState();
        conservation(game);
        assert.deepEqual(Object.values(game.lawUsage), [2, 2, 2, 2, 2]);
        assert(
          game.players.every((p) => p.hand.length === 0 && p.reserve === null && p.influence === 0),
        );
        assert.equal(
          game.players.reduce((sum, p) => sum + p.totalCrowns, 0),
          10 * game.round,
        );
        assert.equal(
          game.players.reduce((sum, p) => sum + p.totalShadows, 0),
          10 * game.round,
        );
        for (const player of value.scores)
          assert.equal(
            player.prestige,
            player.crowns + player.shadows + 2 * Math.min(player.crowns, player.shadows),
          );
        assert.equal(round().plays.size, 10);
        assert.equal(
          new Set([...round().plays.values()].flatMap((plays) => plays.map((play) => play.card.id)))
            .size,
          40,
        );
        results.push(structuredClone(value));
      },
    },
    effects: {
      clear,
      toast() {},
      influence() {},
      turn() {
        assert(human);
      },
      async exchange() {},
      async outcome() {},
      gains() {},
      challenge() {},
      arrival() {
        if (!holdArrival) return Promise.resolve();
        const token = engine.getState().localSession;
        if (!gates.has(token)) {
          const gate = deferred();
          gates.set(token, gate);
          return gate.promise;
        }
        return Promise.resolve();
      },
    },
  });
  lifecycle = createThroneLocalLifecycle({
    source: () => ({ key: 'player:room', online, allowed: true }),
    subscribeSource(fn) {
      sourceChanged = fn;
      return () => {
        sourceChanged = null;
      };
    },
    prepare: async () => {},
    reset() {},
    execute: (run, demo) =>
      engine.start(run, demo, ['Human', 'Two', 'Three', 'Four'], {
        id: 'sala-cetro',
        name: 'Cetro',
      }),
    cancelled: (run) => engine.cancel(run),
    error: (error) => errors.push(error),
    now: () => 0,
    schedule(fn, milliseconds) {
      const ticket = {};
      timers.add(ticket);
      if (milliseconds !== 60000)
        queueMicrotask(() => {
          if (timers.delete(ticket)) fn();
        });
      return () => {
        timers.delete(ticket);
      };
    },
  });
  lifecycle.initialize();
  return {
    engine,
    lifecycle,
    prompts,
    results,
    rounds,
    gates,
    errors,
    timers,
    logs,
    get publications() {
      return publications;
    },
    get cleared() {
      return cleared;
    },
    get shown() {
      return shown;
    },
    get left() {
      return left;
    },
    online() {
      online = true;
      mode = 'online';
      sourceChanged();
    },
  };
}
test('the DOM-free local engine completes deterministic three-round games across all ten decrees, preserving cards, privacy and cumulative scores', async () => {
  const seen = new Set();
  for (let seed = 1; seed <= 32; seed++) {
    const f = fixture(seed);
    await f.lifecycle.start(true);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(
      f.results.map((r) => r.kind),
      ['round', 'round', 'round', 'final'],
    );
    assert.equal(f.shown, 1);
    assert.equal(f.left, 1);
    assert.equal(f.engine.getState(), null);
    assert.equal(f.lifecycle.getSnapshot().phase, 'idle');
    assert.equal(f.timers.size, 0);
    for (const round of f.rounds.values()) {
      seen.add(round.decree);
      if (round.decree === 'reserva')
        assert(round.plays.get(10).every((p) => p.influenceAction === 'none'));
    }
    f.lifecycle.dispose();
  }
  assert.deepEqual([...seen].sort(), throneRules.decrees.map((d) => d.id).sort());
});
test('a cancelled engine execution cannot publish after its delayed animation settles during the next game', async () => {
  const f = fixture(5, { holdArrival: true }),
    first = f.lifecycle.start(true);
  await flush();
  const old = f.engine.getState(),
    oldGate = f.gates.get(old.localSession);
  assert(oldGate);
  f.lifecycle.cancel();
  await first;
  f.rounds.clear();
  const second = f.lifecycle.start(true);
  await flush();
  const current = f.engine.getState(),
    gate = f.gates.get(current.localSession);
  assert(gate);
  assert.notEqual(current, old);
  const count = f.publications;
  oldGate.resolve();
  await flush();
  assert.equal(f.engine.getState(), current);
  assert.equal(f.publications, count);
  assert.equal(current.plays.length, 1);
  gate.resolve();
  await second;
  assert.deepEqual(f.errors, []);
  assert.equal(f.results.length, 4);
  assert.equal(f.timers.size, 0);
  f.lifecycle.dispose();
});
test('an authoritative game preempting a held local play keeps its new owners untouched', async () => {
  const f = fixture(3, { holdArrival: true }),
    pending = f.lifecycle.start(true);
  await flush();
  const state = f.engine.getState(),
    gate = f.gates.get(state.localSession),
    clears = f.cleared;
  f.online();
  await pending;
  assert.equal(f.engine.getState(), null);
  assert.equal(f.cleared, clears);
  const count = f.publications;
  gate.resolve();
  await flush();
  assert.equal(f.publications, count);
  assert.equal(f.cleared, clears);
  assert.deepEqual(f.errors, []);
  f.lifecycle.dispose();
});

test('human local choices and hands satisfy the real parsers across complete games, including unnamed card prompts', async () => {
  const seen = new Set();
  for (let seed = 1; seed <= 32; seed++) {
    const f = fixture(seed, { human: true });
    await f.lifecycle.start(false);
    assert.deepEqual(f.errors, []);
    assert.equal(f.results.length, 4);
    for (const prompt of f.prompts) seen.add(prompt);
    assert.equal(f.timers.size, 0);
    f.lifecycle.dispose();
  }
  for (const kind of [
    'choose-reserva',
    'choose-corte',
    'choose-conselho',
    'rotation',
    'challenge',
    'usurp-give',
    'usurp-pick',
    'usurp-target',
    'choose-trump',
    'choose-law',
    'choose-decree',
  ])
    assert(seen.has(kind), `Missing human prompt ${kind}`);
});
