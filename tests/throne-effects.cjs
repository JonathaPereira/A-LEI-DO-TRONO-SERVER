'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const modules = Promise.all([
  import('../src/lib/games/throne-effect-lifetime.ts'),
  import('../src/lib/games/throne-effect-protocol.ts'),
]);
async function clock() {
  const [{ createThroneEffectLifetime }] = await modules;
  const timers = [],
    warnings = [],
    controller = createThroneEffectLifetime(
      (fn) => {
        const timer = { fn, stopped: false };
        timers.push(timer);
        return () => {
          timer.stopped = true;
        };
      },
      (error) => warnings.push(error),
    );
  return { controller, timers, warnings };
}
test('one failing cleanup cannot leave other timers or visual resources alive', async () => {
  const { controller: c, warnings } = await clock();
  let cleaned = false;
  const task = c.begin('card');
  task.own(() => {
    cleaned = true;
  });
  const pending = task.wait(100);
  task.own(() => {
    throw new Error('cleanup failed');
  });
  c.clear();
  assert.equal(await pending, false);
  assert(cleaned);
  assert.equal(warnings.length, 1);
});
test('replacing a channel releases old waits and resources before painting its replacement', async () => {
  const { controller: c, timers } = await clock(),
    events = [];
  const first = c.begin('card');
  first.own(() => events.push('old removed'));
  const pending = first.wait(1000),
    second = c.begin('card');
  events.push('new painted');
  second.own(() => events.push('new removed'));
  assert.equal(await pending, false);
  assert(timers[0].stopped);
  timers[0].fn();
  first.finish();
  assert(second.active());
  assert.deepEqual(events, ['old removed', 'new painted']);
  second.finish();
  second.finish();
  assert.deepEqual(events, ['old removed', 'new painted', 'new removed']);
});
test('clearing settles every channel immediately and late callbacks cannot revive an effect', async () => {
  const { controller: c, timers } = await clock(),
    cleaned = [];
  const tasks = ['notice', 'exchange', 'ghost'].map((key) => {
    const task = c.begin(key);
    task.own(() => cleaned.push(key));
    return task;
  });
  const waits = tasks.map((task) => task.wait(3000));
  c.clear();
  assert.deepEqual(await Promise.all(waits), [false, false, false]);
  timers.forEach((timer) => {
    assert(timer.stopped);
    timer.fn();
  });
  assert.equal(cleaned.length, 3);
  assert(tasks.every((task) => !task.active()));
  assert(c.begin('new match').active());
});
test('normal completion is distinct from cancellation and disposal blocks new effects', async () => {
  const { controller: c, timers } = await clock();
  const task = c.begin('outcome'),
    wait = task.wait(20);
  timers[0].fn();
  assert.equal(await wait, true);
  assert(task.active());
  task.finish();
  assert.equal(await task.wait(20), false);
  c.dispose();
  const next = c.begin('next');
  let cleaned = 0;
  next.own(() => cleaned++);
  assert.equal(cleaned, 1);
  assert.equal(await next.wait(100), false);
  assert.equal(timers.length, 1);
});
const players = () =>
  [0, 1, 2, 3].map((id) => ({ id, name: `Casa ${id}`, hand: ['private'], intelligence: 'secret' }));
const card = {
  id: 'c0',
  suit: 'cetro',
  value: 1,
  public: true,
  publicReason: 'Desafio',
  secret: 'ignore',
};
test('effects project only public names, canonical cards and bounded exchange moves', async () => {
  const [, p] = await modules;
  const input = {
    kind: 'usurpacao',
    title: 'Troca',
    players: players(),
    shadow: 0,
    crown: 1,
    moves: [
      { from: 0, to: 1, role: 'shadow' },
      { from: 1, to: 0, role: 'crown', delay: 220 },
    ],
  };
  const parsed = p.effectExchange(input);
  input.players[0].name = 'changed';
  assert.deepEqual(parsed.players[0], { id: 0, name: 'Casa 0' });
  assert.equal(parsed.moves[1].delay, 220);
  assert(!JSON.stringify(parsed).includes('private'));
  assert.deepEqual(p.effectChallenge({ seat: 0, card }), {
    seat: 0,
    card: { id: 'c0', suit: 'cetro', value: 1, public: true, publicReason: 'Desafio' },
  });
  for (const bad of [
    { ...input, moves: [{ from: 4, to: 0 }] },
    { ...input, moves: [{ from: 0, to: 0 }] },
    {
      ...input,
      moves: [
        { from: 0, to: 1 },
        { from: 0, to: 2 },
      ],
    },
    { ...input, moves: [{ from: 0, to: 1, delay: Infinity }] },
    { ...input, players: [input.players[0], ...input.players.slice(0, 3)] },
  ])
    assert.throws(() => p.effectExchange(bad));
});
test('invalid or private challenge cards, image sources and influence values are rejected', async () => {
  const [, p] = await modules;
  for (const changed of [
    { public: false },
    { publicReason: 'Corte Aberta' },
    { id: 'c47' },
    { suit: 'unknown' },
    { value: 99 },
  ])
    assert.throws(() => p.effectChallenge({ seat: 1, card: { ...card, ...changed } }));
  assert.throws(() =>
    p.effectCardArrival({ seat: 0, card, from: { left: 0, top: 0, width: 0, height: 10 } }),
  );
  const arrival = p.effectCardArrival({
    seat: 0,
    card,
    src: 'javascript:bad',
    from: { left: 0, top: 0, width: 10, height: 20 },
  });
  assert.equal(arrival.src, undefined);
  assert.equal(arrival.card.secret, undefined);
  assert.throws(() => p.effectInfluence({ name: 'Casa', action: 'plus', cost: 1, modifier: 3 }));
  assert.throws(() => p.effectInfluence({ name: 'Casa', action: 'minus', modifier: 3 }));
  assert.throws(() => p.effectInfluence({ name: 'Casa', action: { toString: () => 'sigilo' } }));
  assert.throws(() =>
    p.effectInfluence({ name: 'Casa', action: 'sigilo', declaredSuit: 'unknown' }),
  );
  assert.equal(p.effectInfluence({ name: 'Casa', action: 'sigilo' }).cost, 1);
});
test('online results validate winners and gains together without retaining hands or revealed plays', async () => {
  const [, p] = await modules;
  const result = {
    players: players(),
    crownId: 0,
    shadowId: 1,
    influenceGains: [{ seat: 2, after: 2 }],
    revealedPlays: ['secret'],
  };
  assert.deepEqual(p.effectResult(result), {
    crown: { id: 0, name: 'Casa 0' },
    shadow: { id: 1, name: 'Casa 1' },
    gains: [{ player: { id: 2, name: 'Casa 2' }, after: 2 }],
  });
  for (const bad of [
    { ...result, shadowId: 0 },
    { ...result, crownId: -1 },
    { ...result, influenceGains: null },
    ...[
      [{ seat: 0, after: 1 }],
      [{ seat: 2, after: 0 }],
      [
        { seat: 2, after: 1 },
        { seat: 2, after: 2 },
      ],
      [null],
    ].map((influenceGains) => ({ ...result, influenceGains })),
  ])
    assert.throws(() => p.effectResult(bad));
});
