'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');

async function exerciseLocalChoices(page, { responsive = true } = {}) {
  await page.evaluate(() => {
    window.TronoThroneMatch.setLocal({
      round: 1,
      trick: 1,
      phase: 'round-start',
      turnName: '',
      yourTurn: false,
      deadline: null,
    });
    window.TronoPortal.showOnly('gameScreen');
    window.__localChoiceSession = window.TronoThroneChoices.beginLocal();
    window.__localChoiceOffer = (prompt) => {
      window.__localChoiceResult = null;
      window.__localChoiceError = null;
      window.TronoThroneChoices.showLocal(
        window.__localChoiceSession,
        {
          you: 0,
          round: 1,
          trick: 1,
          phase: prompt.kind,
          lastCrown: 0,
          lastShadow: 0,
          hand: [
            { id: 'c0', suit: 'cetro', value: 1, public: false, publicReason: null },
            { id: 'c12', suit: 'chave', value: 1, public: true, publicReason: 'Corte Aberta' },
          ],
          reserve: { id: 'c24', suit: 'lamina', value: 1, public: false, publicReason: null },
          players: [0, 1, 2, 3].map((seat) => ({ seat, name: `Casa ${seat}` })),
          lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
        },
        prompt,
      ).then(
        (value) => {
          window.__localChoiceResult = value;
        },
        (error) => {
          window.__localChoiceError = error.name;
        },
      );
    };
    window.__localChoiceOffer({ kind: 'choose-law', options: ['ordem', 'estandarte'] });
  });
  await expect(page.locator('#modal')).toHaveCount(0);
  await expect(page.locator('#throneChoiceDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#throneChoiceDialog')).toBeVisible();
  await page.locator('#throneChoiceHand').click();
  await expect(page.locator('#throneChoiceDialog .deck-preview-card')).toHaveCount(3);
  await expect(page.locator('#throneChoiceDialog .corte-open')).toHaveCount(1);
  await expect(page.locator('#throneChoiceDialog .reserve-preview')).toHaveCount(1);
  await page.evaluate(() => window.TronoPortal.showOnly('portalScreen'));
  await expect(page.locator('#throneChoiceDialog')).toBeHidden();
  assert.equal(await page.evaluate(() => window.__localChoiceResult), null);
  await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
  await expect(page.locator('#throneChoiceBack')).toBeVisible();
  if (responsive) {
    {
      // Current Corte shell, same responsive contracts.
      const layout = 'corte';
      for (const [width, height] of [
        [480, 800],
        [1080, 1920],
      ]) {
        await page.setViewportSize({ width, height });
        const r = await page.locator('#throneChoiceDialog .modal-card').boundingBox();
        assert(r.x >= 0 && r.x + r.width <= width + 1 && r.y >= 0 && r.y + r.height <= height + 1);
        for (const card of await page.locator('#throneChoiceDialog .deck-preview-card').all()) {
          const c = await card.boundingBox();
          assert(
            c.x >= r.x && c.x + c.width <= r.x + r.width + 1,
            'Each own card, including the reserve, must fit inside the preview',
          );
        }
        assert(
          await page
            .locator('#throneChoiceDialog .deck-preview')
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          'The preview must wrap rather than clip cards in a narrow grid cell',
        );
        await page.screenshot({ path: `artifacts/throne-local-choices-${layout}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  await page.locator('#throneChoiceBack').click();
  await page.locator('#throneChoiceDialog [data-law="estandarte"]').click();
  await expect.poll(() => page.evaluate(() => window.__localChoiceResult)).toBe('estandarte');
  const stages = [
    [{ kind: 'choose-decree', options: ['reserva', 'conselho'] }, 'reserva', 2],
    [{ kind: 'choose-trump', options: ['chave', 'cetro'] }, 'chave', 2],
    [{ kind: 'usurp-target', options: [{ seat: 1, name: 'Casa 1' }] }, 1, 1],
    [{ kind: 'usurp-pick', count: 3, otherName: 'Casa 1' }, 0, 3],
    ...[
      'choose-reserva',
      'choose-corte',
      'choose-conselho',
      'rotation',
      'challenge',
      'usurp-give',
    ].map((kind) => [{ kind, cardIds: ['c0'], otherName: 'Casa 1' }, 'c0', 1]),
  ];
  for (const [prompt, value, count] of stages) {
    await page.evaluate((p) => window.__localChoiceOffer(p), prompt);
    await expect(page.locator('#throneChoiceDialog')).toBeVisible();
    await expect(page.locator('#throneChoiceDialog .choice-card')).toHaveCount(count);
    if (prompt.kind === 'usurp-pick') {
      await expect(page.locator('#throneChoiceDialog img')).toHaveCount(0);
      await expect(page.locator('#throneChoiceDialog .hidden-card-choice')).toHaveCount(3);
    }
    const button = page.locator('#throneChoiceDialog .choice-card').first();
    await button.focus();
    await page.keyboard.press(prompt.kind === 'choose-trump' ? 'Space' : 'Enter');
    await expect.poll(() => page.evaluate(() => window.__localChoiceResult)).toBe(value);
    await expect(page.locator('#throneChoiceDialog')).toBeHidden();
    assert.equal(await page.evaluate(() => window.__localChoiceError), null);
  }
  await page.evaluate(() => {
    window.__localChoiceOffer({ kind: 'choose-decree', options: ['favor'] });
    window.TronoThroneChoices.clear();
  });
  await expect.poll(() => page.evaluate(() => window.__localChoiceError)).toBe('AbortError');
  await expect(page.locator('#throneChoiceDialog')).toBeHidden();
  await page.evaluate(() => {
    window.TronoThroneMatch.clear();
    window.TronoPortal.showOnly('setupScreen');
    delete window.__localChoiceOffer;
    delete window.__localChoiceSession;
    delete window.__localChoiceResult;
    delete window.__localChoiceError;
  });
}
module.exports = { exerciseLocalChoices };
