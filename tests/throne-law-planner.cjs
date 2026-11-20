'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { safeThroneLawChoices } = require('../src/lib/games/throne-law-planner.ts');
const laws = ['ordem', 'estandarte', 'revolta', 'anarquia', 'usurpacao'];
// Independent oracle: enumerate complete histories, then collect their viable next laws.
function histories(reserve) {
  const states = new Map(),
    counts = Object.fromEntries(laws.map((law) => [law, 0]));
  counts.ordem = 1;
  function visit(last, trick) {
    const key = `${last}:${trick}:${laws.map((law) => counts[law]).join(',')}`;
    if (!states.has(key)) states.set(key, { used: { ...counts }, last, trick, choices: new Set() });
    if (trick === 11) return laws.every((law) => counts[law] === 2);
    const record = states.get(key);
    let complete = false;
    for (const law of laws) {
      // Reserva is absent for tricks 1–9; Usurpação needs four cards before play.
      const available = 11 - trick - (reserve && trick !== 10 ? 1 : 0);
      if (counts[law] === 2 || law === last || (law === 'usurpacao' && available < 4)) continue;
      counts[law]++;
      if (visit(law, trick + 1)) {
        record.choices.add(law);
        complete = true;
      }
      counts[law]--;
    }
    return complete;
  }
  visit('ordem', 2);
  return [...states.values()];
}
for (const reserve of [false, true])
  test(`planner matches all reachable histories, including dead ends (Reserva=${reserve})`, () => {
    const cases = histories(reserve);
    assert(cases.length > 100);
    for (const { used, last, trick, choices } of cases) {
      const game = Object.freeze({
        currentLaw: last,
        lawUsage: Object.freeze(used),
        decree: Object.freeze({ id: reserve ? 'reserva' : 'rotacao' }),
      });
      assert.deepEqual(
        safeThroneLawChoices(game, trick),
        laws.filter((law) => choices.has(law)),
        JSON.stringify({ reserve, last, trick, used }),
      );
    }
  });
test('all decrees except Reserva retain the same plan, and impossible counters fail explicitly', () => {
  const game = {
    currentLaw: 'ordem',
    lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
    decree: null,
  };
  const before = structuredClone(game),
    expected = safeThroneLawChoices(game, 2);
  for (const id of [
    'rotacao',
    'corte',
    'desafio',
    'silencio',
    'sucessao',
    'conselho',
    'favor',
    'espionagem',
    'peso',
  ])
    assert.deepEqual(safeThroneLawChoices({ ...game, decree: { id } }, 2), expected);
  assert.deepEqual(game, before);
  for (const trick of [0, 1, 12, 2.5]) assert.throws(() => safeThroneLawChoices(game, trick));
  for (const value of [-1, 3, 1.5, undefined])
    assert.throws(() =>
      safeThroneLawChoices({ ...game, lawUsage: { ...game.lawUsage, ordem: value } }, 2),
    );
});
