'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');

/** Runs the installed presentation owner, with real timers, CSS and Web Animations. */
async function exerciseThroneEffects(page) {
  await page.evaluate(() => {
    window.__effectHosts = ['turnNoticeClock', 'tableCard0', 'exchangeStage', 'playerEffects0'].map(
      (id) => document.getElementById(id),
    );
    window.__effectStatus = {
      round: 1,
      trick: 1,
      phase: 'resolve',
      turnName: null,
      yourTurn: false,
      deadline: null,
    };
    window.TronoThroneMatch.setLocal(window.__effectStatus);
    window.TronoPortal.showOnly('gameScreen');
    window.__effectPlayers = [0, 1, 2, 3].map((id) => ({
      id,
      name: id === 0 ? 'Casa <img src=x onerror=alert(1)>' : `Casa ${id}`,
    }));
    window.__effectCard = {
      id: 'c0',
      suit: 'cetro',
      value: 1,
      public: true,
      publicReason: 'Desafio',
    };
    const fx = window.TronoThroneEffects;
    fx.toast('Aviso antigo', 500);
    fx.toast('Aviso atual', 2500);
    fx.connection(window.__effectPlayers[0].name, 'Bot <b>literal</b>');
    fx.influence({ name: window.__effectPlayers[0].name, action: 'plus', cost: 2, modifier: 3 });
    fx.turn('Ordem');
    fx.challenge({ seat: 0, card: window.__effectCard });
    fx.gains([{ player: window.__effectPlayers[2], after: 1 }]);
    fx.arrival(
      { seat: 0, card: window.__effectCard, from: { left: 30, top: 300, width: 80, height: 110 } },
      2,
    ).then((value) => {
      window.__effectArrival = value;
    });
    fx.exchange({
      kind: 'rotation',
      title: 'Troca <b>literal</b>',
      players: window.__effectPlayers,
      moves: [{ from: 0, to: 1 }],
    }).then((value) => {
      window.__effectExchange = value;
    });
    fx.result(
      {
        players: window.__effectPlayers,
        crownId: 0,
        shadowId: 1,
        influenceGains: [{ seat: 3, after: 2 }],
      },
      2,
    ).then(() => {
      window.__effectResult = true;
    });
    window.__effectRecords = window.TronoThroneHistory.getSnapshot().entries.length;
  });
  await expect(page.locator('#exchangeCinematic')).toBeVisible();
  await expect(page.locator('#exchangeTitle')).toHaveText('Troca <b>literal</b>');
  await expect(
    page.locator('#exchangeTitle b, #connectionNotice img, #influencePublicNotice img'),
  ).toHaveCount(0);
  await expect(page.locator('#connectionNotice')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.challenge-reveal-float')).toHaveCount(1);
  await expect(page.locator('.throne-card-ghost')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/throne-effects-active.png' });
  // Cancelling the stage must settle awaited effects, remove WAAPI ghosts and suppress delayed gains.
  await page.evaluate(() =>
    window.TronoThroneMatch.setLocal({ ...window.__effectStatus, trick: 2 }),
  );
  await expect.poll(() => page.evaluate(() => window.__effectArrival)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__effectExchange)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__effectResult)).toBe(true);
  for (const selector of [
    '#exchangeCinematic',
    '#trickOutcome',
    '#turnNotice',
    '#influencePublicNotice',
    '#connectionNotice',
    '#toast',
  ])
    await expect(page.locator(selector)).toBeHidden();
  await expect(
    page.locator('.challenge-reveal-float, .throne-card-ghost, .influence-gain-float'),
  ).toHaveCount(0);
  assert(
    await page.evaluate(
      () => window.TronoThroneHistory.getSnapshot().entries.length === window.__effectRecords,
    ),
  );
  assert(
    await page.evaluate(
      () => !document.querySelector('.receiving-card, .settling-card, .active-drop, .gain-flash'),
    ),
  );
  // An old notice timeout cannot hide its replacement; hiding a view cancels its remaining effects.
  await page.evaluate(() => {
    window.TronoThroneEffects.toast('Antigo', 0);
    window.TronoThroneEffects.toast('Substituto', 2000);
    window.TronoThroneEffects.turn('Ordem');
  });
  await page.waitForTimeout(350);
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Substituto');
  await page.evaluate(() => window.TronoPortal.showOnly('portalScreen'));
  await expect(page.locator('#turnNotice')).toBeHidden();
  // A hidden view still records a public gain, without showing or replaying its animation.
  await page.evaluate(async () => {
    await window.TronoThroneEffects.result({
      players: window.__effectPlayers,
      crownId: 0,
      shadowId: 1,
      influenceGains: [{ seat: 2, after: 1 }],
    });
    window.__effectRecords++;
  });
  assert(
    await page.evaluate(
      () => window.TronoThroneHistory.getSnapshot().entries.length === window.__effectRecords,
    ),
  );
  await expect(page.locator('#trickOutcome')).toBeHidden();
  await expect(page.locator('.influence-gain-float')).toHaveCount(0);
  await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
  await expect(page.locator('#turnNotice')).toBeHidden();
  // Normal crown → shadow sequencing still completes and appends exactly one gain.
  await page.evaluate(() => {
    window.__effectResult = false;
    window.TronoThroneEffects.result(
      {
        players: window.__effectPlayers,
        crownId: 0,
        shadowId: 1,
        influenceGains: [{ seat: 3, after: 2 }],
      },
      0.001,
    ).then(() => {
      window.__effectResult = true;
    });
  });
  await expect.poll(() => page.evaluate(() => window.__effectResult)).toBe(true);
  await expect(page.locator('#playerEffects3 .influence-gain-float')).toHaveCount(1);
  assert(
    await page.evaluate(
      () => window.TronoThroneHistory.getSnapshot().entries.length === window.__effectRecords + 1,
    ),
  );
  // A real leave goes through the adapter and clears all pending presentation.
  await page.evaluate(() => {
    window.TronoThroneEffects.challenge({ seat: 0, card: window.__effectCard });
    window.TronoThroneBoard.backToLobby();
  });
  await expect(
    page.locator('.challenge-reveal-float, .throne-card-ghost, .influence-gain-float'),
  ).toHaveCount(0);
  assert(
    await page.evaluate(() =>
      window.__effectHosts.every(
        (node) => node === document.getElementById(node.id) && node.isConnected,
      ),
    ),
  );
  await page.screenshot({ path: 'artifacts/throne-effects-cancelled.png' });
}
module.exports = { exerciseThroneEffects };
