'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');
async function exerciseThroneControls(page, { responsive = true } = {}) {
  const desktop = await page.evaluate(() => !!window.TronoDesktop);
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
    window.__throneControlNodes = [
      'speedBtn',
      'rulesBtn',
      'restartBtn',
      'manualBtn',
      'versionLabel',
    ].map((id) => document.getElementById(id));
  });
  async function settings(group) {
    if (!desktop) return;
    if (!(await page.evaluate(() => window.TronoCallSettings.getSnapshot().open)))
      await page.locator('#voiceSettingsBtn').click();
    await page.locator('[data-settings-tab="game"]').click();
    const details = page.locator('.game-settings-group').filter({
      has: page.locator(`[data-game-group="${group}"]`),
    });
    if (!(await details.evaluate((node) => node.open))) await details.locator('summary').click();
  }
  await settings('match');
  await expect(page.locator('#speedBtn')).toBeEnabled();
  await expect(page.locator('#restartBtn')).toBeEnabled();
  for (const [text, scale] of [
    ['Rápido', 0.38],
    ['Lento', 1.65],
    ['Normal', 1],
  ]) {
    await page.locator('#speedBtn').click();
    await expect(page.locator('#speedBtn')).toContainText(text);
    assert.equal(await page.evaluate(() => window.TronoThroneControls.getSnapshot().scale), scale);
  }
  await settings('help');
  await page.locator('#rulesBtn').click();
  await expect(page.locator('dialog#rulesDrawer')).toBeVisible();
  await expect(page.locator('#rulesLaws p')).toHaveCount(5);
  await expect(page.locator('#rulesDecrees p')).toHaveCount(10);
  await page.keyboard.press('Escape');
  await expect(page.locator('#rulesDrawer')).toBeHidden();
  if (desktop) await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
  await page.locator('#rulesBtn').click();
  await expect(page.locator('#rulesDrawer')).toBeVisible();
  if (responsive) {
    {
      // Current Corte presentation; retain viewport and interaction coverage.
      const layout = 'corte';
      for (const [width, height] of [
        [480, 800],
        [1080, 1920],
      ]) {
        await page.setViewportSize({ width, height });
        const dialog = page.locator('#rulesDrawer');
        await dialog.evaluate((node) => {
          node.scrollTop = 0;
        });
        const r = await dialog.boundingBox();
        assert(r.x >= 0 && r.y >= 0 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1);
        assert(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
        await page.screenshot({ path: `artifacts/throne-controls-rules-${layout}-${width}.png` });
        await page.locator('#rulesDecrees p').last().scrollIntoViewIfNeeded();
        assert((await page.locator('#rulesDecrees p').last().boundingBox()).y < height);
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  await page.locator('#rulesClose').click();
  await expect(page.locator('#rulesDrawer')).toBeHidden();
  await page.locator('#rulesBtn').click();
  await expect(page.locator('#rulesDrawer')).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(page.locator('#rulesDrawer')).toBeHidden();
  if (desktop) await page.locator('#voiceSettingsClose').click();
  else {
    // Exercise the actual manual destination without opening the user's external browser.
    await page.locator('#rulesBtn').click();
    const opened = page.context().waitForEvent('page');
    await page.locator('#rulesManualBtn').click();
    const manual = await opened;
    await manual.waitForURL('**/manual/index.html');
    await manual.close();
    await page.locator('#rulesClose').click();
  }
  assert(
    await page.evaluate(() =>
      window.__throneControlNodes.every(
        (node) => node && node.isConnected && document.getElementById(node.id) === node,
      ),
    ),
  );
  assert(
    await page.evaluate(() =>
      document
        .getElementById('versionLabel')
        .textContent.includes(window.TronoNetwork.CLIENT_VERSION),
    ),
  );
  await page.evaluate(() => {
    window.TronoThroneMatch.clear();
    window.TronoPortal.showOnly('setupScreen');
    delete window.__throneControlNodes;
  });
  await expect(page.locator('#restartBtn')).toBeDisabled();
}
module.exports = { exerciseThroneControls };
