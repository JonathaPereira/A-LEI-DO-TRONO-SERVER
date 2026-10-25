'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');
async function exerciseThroneTooltips(page, { responsive = true } = {}) {
  await page.evaluate(() => {
    window.TronoThroneMatch.setLocal({
      round: 1,
      trick: 1,
      phase: 'round-start',
      turnName: null,
      yourTurn: false,
      deadline: null,
    });
    window.TronoPortal.showOnly('gameScreen');
    window.__tooltipTable = {
      round: 1,
      trick: 1,
      phase: 'round-start',
      currentLaw: 'ordem',
      lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
      trump: null,
      declaredLeadSuit: null,
      previousWinningSuit: null,
      decree: { id: 'silencio' },
      localSeat: 0,
      names: ['Casa 0', 'Casa 1', 'Casa 2', 'Casa 3'],
      plays: [],
    };
    window.TronoThroneTable.setLocal(window.__tooltipTable);
  });
  const tip = page.locator('#hoverTooltip'),
    law = page.locator('.law-mini');
  await page.mouse.move(1, 1);
  await law.evaluate((node) => node.setAttribute('aria-describedby', 'existing-help'));
  await law.focus();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Ordem:');
  await expect(law).toHaveAttribute('aria-describedby', 'existing-help hoverTooltip');
  await page.evaluate(() =>
    window.TronoThroneTable.setLocal({
      ...window.__tooltipTable,
      currentLaw: 'estandarte',
      trump: 'chave',
    }),
  );
  await expect(tip).toContainText('Trunfo atual: Chave');
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await expect(law).toHaveAttribute('aria-describedby', 'existing-help');
  await law.evaluate((node) => node.blur());
  await law.focus();
  await expect(tip).toBeVisible();
  await page.evaluate(() => window.TronoPortal.showOnly('setupScreen'));
  await expect(tip).toBeHidden();
  await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
  await expect(tip).toBeHidden();
  await law.focus();
  await page.evaluate(() => window.TronoThroneControls.rules(true));
  await expect(page.locator('#rulesDrawer')).toBeVisible();
  await expect(tip).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#rulesDrawer')).toBeHidden();
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'tooltipFixture';
    button.textContent = 'Regras';
    button.dataset.tooltip =
      '<img src=x onerror=alert(1)> Texto literal & descrição da Lei perto da borda.';
    button.style.cssText = 'position:fixed;right:4px;top:4px;z-index:200;padding:10px';
    if (window.TronoDesktop) {
      // Keep the temporary edge target clear of the desktop toolbar.
      button.style.top = '120px';
      button.style.zIndex = '2147483646';
    }
    document.body.append(button);
  });
  const button = page.locator('#tooltipFixture');
  await button.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('<img src=x onerror=alert(1)>');
  await expect(tip.locator('img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await page.mouse.move(1, 400);
  await button.hover();
  await expect(tip).toBeVisible();
  if (responsive) {
    {
      // Current Corte shell, same responsive contracts.
      const layout = 'corte';
      for (const [width, height] of [
        [480, 800],
        [1080, 1920],
      ]) {
        await page.setViewportSize({ width, height });
        await button.hover();
        await expect(tip).toBeVisible();
        await expect
          .poll(async () => {
            const r = await tip.boundingBox();
            return (
              !!r &&
              r.x >= 0 &&
              r.y >= 0 &&
              r.width >= 200 &&
              r.x + r.width <= width &&
              r.y + r.height <= height
            );
          })
          .toBe(true);
        await page.screenshot({ path: `artifacts/throne-tooltips-${layout}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  await button.hover();
  await expect(tip).toBeVisible();
  await button.evaluate((node) => node.remove());
  await expect(tip).toBeHidden();
  await page.waitForTimeout(180);
  await expect(tip).toBeHidden();
  assert.equal(await page.locator('#hoverTooltip').count(), 1);
  await page.evaluate(() => {
    document.querySelector('.law-mini').removeAttribute('aria-describedby');
    window.TronoThroneMatch.clear();
    window.TronoPortal.showOnly('setupScreen');
    delete window.__tooltipTable;
  });
}
module.exports = { exerciseThroneTooltips };
