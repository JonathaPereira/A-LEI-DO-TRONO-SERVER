'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');
async function exerciseLocalHand(page, { responsive = true } = {}) {
  await page.evaluate(() => {
    window.TronoThroneMatch.setLocal({
      round: 1,
      trick: 1,
      phase: 'await-play',
      turnName: 'Casa Local',
      yourTurn: true,
      deadline: null,
    });
    window.TronoPortal.showOnly('gameScreen');
    window.__localHandSession = window.TronoThroneHand.beginLocal();
    window.__localHandInput = {
      you: 0,
      round: 1,
      trick: 1,
      phase: 'await-play',
      turn: 0,
      opening: true,
      automaticReserve: false,
      hand: [
        { id: 'c0', suit: 'cetro', value: 1, public: false, publicReason: null },
        { id: 'c12', suit: 'chave', value: 1, public: true, publicReason: 'Corte Aberta' },
      ],
      reserve: null,
      influence: 2,
      legal: ['c0', 'c12'],
      hiddenLegal: ['c0'],
      canUseInfluence: true,
      canUseManeuver: true,
      influenceBlocked: false,
      decreeName: 'Favor',
    };
    window.__localHandOffer = () => {
      window.__localHandMove = null;
      window.__localHandAbort = null;
      window.TronoThroneHand.waitLocal(window.__localHandSession, window.__localHandInput).then(
        (move) => {
          window.__localHandMove = move;
        },
        (error) => {
          window.__localHandAbort = error.name;
        },
      );
    };
    window.__localHandOffer();
    window.__localHandHosts = ['humanHand', 'influenceToggle', 'sortHandBtn'].map((id) =>
      document.getElementById(id),
    );
  });
  await expect(page.locator('#throneLocalHand')).toBeVisible();
  await expect(page.locator('#throneOnlineHand')).toBeHidden();
  await expect(page.locator('#throneOnlineHandCards .hand-card')).toHaveCount(0);
  await expect(page.locator('#humanHand button.hand-card')).toHaveCount(2);
  await page.locator('#sortHandBtn').click();
  await page.locator('#influenceToggleWrap').click();
  await expect(page.locator('#throneLocalHandDialog')).toBeVisible();
  await page.locator('#throneLocalHandDialog [data-influence="plus"]').click();
  await expect(page.locator('#throneLocalHandDialog [data-suit]')).toHaveCount(1);
  await page.evaluate(() => window.TronoPortal.showOnly('portalScreen'));
  await expect(page.locator('#throneLocalHandDialog')).toBeHidden();
  assert(
    !(await page.evaluate(() =>
      window.TronoThroneHand.play(window.TronoThroneHand.getSnapshot().context, 'c0'),
    )),
  );
  await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
  await expect(page.locator('#throneLocalHandDialog')).toBeVisible();
  if (responsive) {
    for (const layout of ['original', 'discord']) {
      await page.evaluate((value) => window.TronoAppLayout.apply(value), layout);
      for (const [width, height] of [
        [480, 800],
        [1080, 1920],
      ]) {
        await page.setViewportSize({ width, height });
        const r = await page.locator('#throneLocalHandDialog .modal-card').boundingBox();
        assert(r.x >= 0 && r.x + r.width <= width + 1 && r.y >= 0 && r.y + r.height <= height + 1);
        await page.screenshot({ path: `artifacts/throne-local-hand-${layout}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => window.TronoAppLayout.apply('original'));
  }
  await page.locator('#throneLocalHandDialog [data-suit="cetro"]').click();
  await expect(page.locator('#humanHand [data-card="c12"]')).toBeDisabled();
  await page.locator('#humanHand [data-card="c0"]').focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__localHandMove?.influenceAction))
    .toBe('plus');
  const move = await page.evaluate(() => window.__localHandMove);
  assert.equal(move.declaredSuit, 'cetro');
  assert(move.origin.width > 0 && move.origin.height > 0);
  await page.evaluate(() => {
    window.__localHandInput = {
      ...window.__localHandInput,
      trick: 2,
      opening: false,
      influence: 1,
      canUseManeuver: false,
    };
    window.__localHandOffer();
  });
  await page.locator('#influenceToggleWrap').click();
  await expect(page.locator('#throneLocalHandDialog [data-influence]')).toHaveCount(1);
  await page.locator('#throneLocalHandDialog [data-influence="sigilo"]').click();
  await page.locator('#humanHand [data-card="c0"]').focus();
  await page.keyboard.press('Space');
  await expect
    .poll(() => page.evaluate(() => window.__localHandMove?.influenceAction))
    .toBe('sigilo');
  assert.equal(await page.evaluate(() => window.__localHandMove.declaredSuit), null);
  await page.evaluate(() => {
    window.__localHandInput = {
      ...window.__localHandInput,
      trick: 3,
      influence: 2,
      canUseManeuver: true,
    };
    window.__localHandOffer();
  });
  await page.locator('#influenceToggleWrap').click();
  await page.locator('#throneLocalHandDialog [data-influence="minus"]').click();
  await page.locator('#humanHand [data-card="c0"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__localHandMove?.influenceAction))
    .toBe('minus');
  await page.screenshot({ path: 'artifacts/throne-local-hand-selected.png' });
  await page.evaluate(() => {
    window.__localHandOffer();
    window.TronoThroneBoard.backToLobby();
  });
  await expect.poll(() => page.evaluate(() => window.__localHandAbort)).toBe('AbortError');
  await expect(page.locator('#throneLocalHand')).toBeHidden();
  await expect(page.locator('#throneLocalHandDialog')).toBeHidden();
  await expect(page.locator('#humanHand .hand-card')).toHaveCount(0);
  assert(
    await page.evaluate(() =>
      window.__localHandHosts.every(
        (node) => node === document.getElementById(node.id) && node.isConnected,
      ),
    ),
  );
}
module.exports = { exerciseLocalHand };
