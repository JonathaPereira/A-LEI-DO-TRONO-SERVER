'use strict';
const assert = require('node:assert/strict');

/** Compare the actual public table with the visible seats, never private engine data. */
async function assertThroneSeats(page, remember = false) {
  const result = await page.evaluate((remember) => {
    const s = window.TronoThroneSeats.getSnapshot(),
      nodes = s.players.flatMap((p) => [
        document.getElementById(`player${p.id}`),
        document.querySelector(`#player${p.id} .player-name`),
        document.getElementById(`coinBank${p.id}`),
        document.getElementById(`playerEffects${p.id}`),
      ]);
    if (remember) {
      window.__publicSeatNodes = nodes;
      const effect = document.createElement('span');
      effect.hidden = true;
      window.__publicSeatEffect = effect;
      document.getElementById('playerEffects0').append(effect);
    }
    return {
      four: s.players.length === 4,
      content: s.players.every((p) => {
        const panel = document.getElementById(`player${p.id}`),
          bank = document.getElementById(`coinBank${p.id}`);
        return (
          panel.querySelector('.player-name > span').textContent === p.name &&
          panel.querySelector('.crown-score strong').textContent === String(p.totalCrowns) &&
          panel.querySelector('.shadow-score strong').textContent === String(p.totalShadows) &&
          panel.querySelector('.prestige-score strong').textContent ===
            String(p.totalCrowns + p.totalShadows + 2 * Math.min(p.totalCrowns, p.totalShadows)) &&
          panel
            .querySelector('.player-meta')
            .textContent.includes(`${p.handCount + (p.reservePresent ? 1 : 0)} cartas`) &&
          panel.classList.contains('active') === (s.turn === p.id) &&
          panel.classList.contains('local-player') === (s.localSeat === p.id) &&
          panel.querySelectorAll('.influence-pip.on').length === p.influence &&
          bank.querySelectorAll('.influence-coin:not(.empty)').length === p.influence &&
          panel.querySelectorAll('.public-card-chip').length === p.publicCards.length
        );
      }),
      stable:
        !window.__publicSeatNodes ||
        nodes.every((node, i) => node && node === window.__publicSeatNodes[i] && node.isConnected),
      effects:
        !window.__publicSeatEffect ||
        window.__publicSeatEffect.parentElement === document.getElementById('playerEffects0'),
      private: s.players.every(
        (p) => !('hand' in p) && !('reserve' in p) && !('intelligence' in p),
      ),
    };
  }, remember);
  assert.deepEqual(result, {
    four: true,
    content: true,
    stable: true,
    effects: true,
    private: true,
  });
}
module.exports = { assertThroneSeats };
