'use strict';
const assert = require('node:assert/strict');
function inspectThroneTable(remember = false) {
  const s = window.TronoThroneTable.getSnapshot(),
    rules = window.TronoRules;
  const slots = [0, 1, 2, 3].map((id) => document.getElementById(`tableCard${id}`));
  const nodes = [
    ...slots,
    ...['currentLawImg', 'currentLawName', 'lawUsesText', 'decreeBadge', 'lawTrackerList'].map(
      (id) => document.getElementById(id),
    ),
  ];
  if (remember) window.__tableNodes = nodes;
  if (!s)
    return slots.every(
      (slot) =>
        !slot.querySelector('img') &&
        !slot.classList.contains('winner-crown') &&
        !slot.classList.contains('winner-shadow'),
    );
  const law = rules.laws[s.currentLaw],
    decree = rules.decrees.find((d) => d.id === s.decree);
  return (
    nodes.every((n) => n && n.isConnected) &&
    (!window.__tableNodes || nodes.every((n, i) => n === window.__tableNodes[i])) &&
    document.getElementById('currentLawName').textContent === law.name.toUpperCase() &&
    document.getElementById('currentLawImg').getAttribute('src') === law.img &&
    document.getElementById('lawUsesText').textContent ===
      `Uso ${Math.min(2, s.lawUsage[s.currentLaw] || 1)} de 2` &&
    document.getElementById('decreeBadge').textContent ===
      'DECRETO' + (decree ? `${decree.icon} ${decree.name}` : 'Escolhendo...') &&
    document.getElementById('decreeBadge').tabIndex === (s.decree === 'espionagem' ? 0 : -1) &&
    document.getElementById('trumpInfo').classList.contains('hidden') === !s.trump &&
    document.getElementById('leadSuitInfo').classList.contains('hidden') === !s.declaredLeadSuit &&
    [...document.querySelectorAll('#lawTrackerList .law-track-row')].every(
      (row, i) => row.querySelectorAll('.law-pip.used').length === s.lawUsage[rules.lawOrder[i]],
    ) &&
    slots.every((slot, id) => {
      const play = s.plays.find((p) => p.playerId === id);
      if (
        slot.classList.contains('winner-crown') !== (s.winners?.crown === id) ||
        slot.classList.contains('winner-shadow') !== (s.winners?.shadow === id)
      )
        return false;
      if (!play) return !slot.querySelector('img') && slot.textContent === s.names[id];
      if (play.hidden)
        return (
          !!slot.querySelector('.card-back') &&
          slot.querySelectorAll('img').length === (id === s.localSeat && play.card ? 1 : 0) &&
          !slot.querySelector('.card-face')
        );
      return (
        !!play.card &&
        slot.querySelector('.card-face')?.getAttribute('src') ===
          `assets/cards/${play.card.suit}_${String(play.card.value).padStart(2, '0')}.webp` &&
        !slot.querySelector('.card-back')
      );
    })
  );
}
async function assertThroneTable(page, remember = false) {
  assert(
    await page.evaluate(inspectThroneTable, remember),
    'Public cards, rule metadata and stable table hosts must agree',
  );
}
async function watchThroneTable(page) {
  await page.evaluate(`window.__inspectThroneTable = (${String(inspectThroneTable)})`);
  await page.evaluate(() => {
    const inspect = window.__inspectThroneTable;
    window.__tableFailures = [];
    window.__tableStates = new Set();
    window.TronoThroneTable.subscribe(() => {
      if (!inspect()) window.__tableFailures.push('Visible table disagrees with its snapshot');
      const s = window.TronoThroneTable.getSnapshot();
      if (s?.plays.some((p) => p.hidden && p.playerId === s.localSeat))
        window.__tableStates.add('own-hidden');
      if (s?.plays.some((p) => p.hidden && p.playerId !== s.localSeat))
        window.__tableStates.add('opponent-hidden');
      if (s?.winners) window.__tableStates.add('result');
    });
  });
}
async function exerciseThroneTableControls(page) {
  // Drive the same local presentation interface, after the real game has ended.
  // No engine or socket is replaced, and no opponent's hidden identity is supplied.
  await page.evaluate(() => {
    window.TronoThroneMatch.setLocal({
      round: 2,
      trick: 8,
      phase: 'await-play',
      turnName: null,
      yourTurn: false,
      deadline: null,
    });
    window.__tableControlProjection = {
      round: 2,
      trick: 8,
      phase: 'await-play',
      currentLaw: 'estandarte',
      lawUsage: { ordem: 2, estandarte: 1, revolta: 2, anarquia: 2, usurpacao: 1 },
      trump: 'chave',
      declaredLeadSuit: 'mascara',
      previousWinningSuit: 'lamina',
      decree: { id: 'rotacao' },
      names: ['<b>Casa & Humana</b>', 'Casa 1', 'Casa 2', 'Casa 3'],
      localSeat: 0,
      plays: [0, 1, 2, 3].map((id) => ({
        playerId: id,
        order: id,
        hidden: id !== 3,
        card:
          id === 0
            ? { id: 'c0', suit: 'cetro', value: 1, public: false, publicReason: null }
            : id === 3
              ? { id: 'c11', suit: 'cetro', value: 12, public: false, publicReason: null }
              : null,
        modifier: id === 0 ? 3 : id === 1 ? -3 : 0,
        influenceAction: ['plus', 'minus', 'sigilo', 'none'][id],
      })),
    };
    window.TronoThroneTable.setLocal(window.__tableControlProjection);
    window.TronoPortal.showOnly('gameScreen');
  });
  const { expect } = require('@playwright/test'),
    own = page.locator('#tableCard0 .private-hidden-card');
  await assertThroneTable(page, true);
  await expect(own).toHaveAttribute('aria-pressed', 'false');
  await own.click();
  await expect(own).toHaveAttribute('aria-pressed', 'true');
  await own.press('Enter');
  await expect(own).toHaveAttribute('aria-pressed', 'false');
  await own.press('Space');
  await expect(own).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tableCard1 img, #tableCard2 img')).toHaveCount(0);
  await expect(page.locator('#leadSuitText')).toHaveText('Máscara');
  await expect(page.locator('#trumpSuitText')).toHaveText('⚿');
  await page.evaluate(() => {
    window.__tableControlProjection.names[1] = 'Casa renomeada';
    window.TronoThroneTable.setLocal(window.__tableControlProjection);
  });
  await expect(own).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    const s = window.__tableControlProjection;
    s.phase = 'resolve';
    s.plays = s.plays.map((p) => ({
      ...p,
      hidden: false,
      card: p.card || {
        id: `c${p.playerId}`,
        suit: 'cetro',
        value: p.playerId + 1,
        public: false,
        publicReason: null,
      },
    }));
    window.TronoThroneTable.setLocal(s, { crown: 3, shadow: 0 });
  });
  await assertThroneTable(page);
  await expect(page.locator('.table-card-slot .card-face')).toHaveCount(4);
  await expect(page.locator('#tableCard0 .maneuver-badge')).toHaveText('+3 → 4');
  await expect(page.locator('#tableCard1 .maneuver-badge')).toHaveText('-3 → 1');
  await page.screenshot({ path: 'artifacts/throne-table-local-controls.png' });
  await page.evaluate(() => {
    const s = window.__tableControlProjection;
    s.trick = 9;
    s.plays = [];
    window.TronoThroneTable.setLocal(s, null);
  });
  await assertThroneTable(page);
  await expect(page.locator('#tableCard0')).toHaveText('<b>Casa & Humana</b>');
  await expect(page.locator('#tableCard0 b')).toHaveCount(0);
  await page.evaluate(() => window.TronoThroneMatch.clear());
  await assertThroneTable(page);
}
module.exports = { assertThroneTable, watchThroneTable, exerciseThroneTableControls };
