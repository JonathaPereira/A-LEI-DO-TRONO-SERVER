const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/lib/games/similo/rules.ts');
const config = {
  boardThemes: ['animals', 'history'],
  clueThemes: ['monsters', 'myths'],
  narrator: 'informante',
  guessers: ['alice', 'bruno'],
};
function voting() {
  let g = R.createGame(config, () => 0.45);
  return R.playClue(g, g.hand[0], 'like');
}
test('Similo: captain breaks divergence and rotates without blocking the table', () => {
  let g = voting();
  const safe = g.board.filter((id) => id !== g.secretId);
  g = R.confirmVote(R.setVote(g, 0, [safe[0]]), 0);
  g = R.confirmVote(R.setVote(g, 1, [safe[1]]), 1);
  assert.equal(R.consensus(g).disagreement, true);
  const next = R.beginElimination(g, 0, [safe[1]]);
  assert.deepEqual(next.pending, [safe[1]]);
  assert.throws(() => R.beginElimination(g, 1, [safe[1]]));
  g = R.finishElimination(next, next.revision);
  assert.equal(g.round, 1);
  g = R.playClue(g, g.hand[0], 'unlike');
  const remaining = g.board.filter((id) => !g.eliminated.includes(id) && id !== g.secretId);
  for (let i = 0; i < 2; i++) g = R.confirmVote(R.setVote(g, i, remaining.slice(i, i + 2)), i);
  assert.throws(() => R.beginElimination(g, 0, remaining.slice(0, 2)));
  assert.equal(R.beginElimination(g, 1, remaining.slice(0, 2)).pending.length, 2);
});
test('Similo: captain cannot skip votes, exceed quota or override unanimous votes', () => {
  let g = voting();
  const [a, b] = g.board;
  assert.throws(() => R.beginElimination(g, 0, [a]));
  for (let i = 0; i < 2; i++) g = R.confirmVote(R.setVote(g, i, [a]), i);
  assert.throws(() => R.beginElimination(g, 0, [b]));
  assert.throws(() => R.beginElimination(g, 0, [a, b]));
  assert.deepEqual(R.beginElimination(g, 0, [a]).pending, [a]);
});
test('Similo all 225 independent deck combinations preserve 120 unique illustrated cards and complete info', () => {
  const { CARDS, THEME_IDS, getCard } = require('../src/lib/games/similo/catalog.ts'),
    { cardInfo } = require('../src/lib/games/similo/info.ts');
  assert.equal(CARDS.length, 120);
  assert.equal(new Set(CARDS.map((c) => c.id)).size, 120);
  for (const c of CARDS) {
    const info = cardInfo(c.id);
    assert(info.context.length > 5);
    assert(info.summary.length > 30);
    assert.equal(info.traits.length, 3);
    if (c.theme === 'animals') assert.match(info.context, /Espécie de referência/);
  }
  const mixes = THEME_IDS.flatMap((t, i) => [[t], ...THEME_IDS.slice(i + 1).map((u) => [t, u])]);
  let combinations = 0;
  for (const boardThemes of mixes)
    for (const clueThemes of mixes) {
      const g = R.createGame({ ...config, boardThemes, clueThemes }, () => 0.45),
        all = [...g.board, ...g.hand, ...g.drawPile];
      assert.equal(new Set(all).size, all.length);
      assert(g.hand.length + g.drawPile.length >= 9);
      assert(g.board.every((id) => boardThemes.includes(getCard(id).theme)));
      assert([...g.hand, ...g.drawPile].every((id) => clueThemes.includes(getCard(id).theme)));
      combinations++;
    }
  assert.equal(combinations, 225);
});
