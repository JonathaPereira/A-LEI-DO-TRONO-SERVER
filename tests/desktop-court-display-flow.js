'use strict';
const assert = require('node:assert/strict'),
  { expect } = require('@playwright/test');
async function exerciseCourtFullscreen({ app, page }) {
  const original = await page.evaluate(
    () =>
      [...document.querySelectorAll('.screen')].find((n) => !n.classList.contains('hidden'))?.id,
  );
  const before = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isFullScreen(),
  );
  await page.evaluate(() => {
    window.__nativeCourtButton = document.getElementById('courtFullscreen');
    window.__nativeCourtMic = window.TronoSocial.getLocalAudioTrack();
    window.__nativeCourtScreen = window.TronoSocial.getLocalDisplayStream();
  });
  try {
    await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
    if (before) await page.evaluate(() => window.TronoDesktop.toggleFullscreen());
    await page.locator('#courtFullscreen').click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      )
      .toBe(true);
    try {
      await expect(page.locator('body')).toHaveClass(/court-fullscreen/);
    } catch (error) {
      await require('node:fs/promises').writeFile(
        'artifacts/court-fullscreen-native-state.json',
        JSON.stringify(
          await page.evaluate(async () => ({
            court: window.TronoCourtFullscreen.getSnapshot(),
            navigation: window.TronoPortal.getSnapshot(),
            native: await window.TronoDesktop.getWindowState(),
            hidden: document.getElementById('gameScreen').classList.contains('hidden'),
          })),
          null,
          2,
        ),
      );
      throw error;
    }
    await expect(page.locator('#courtFullscreen')).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.fullscreenElement),
      null,
      'Desktop uses the native window',
    );
    await expect(page.locator('#courtFullscreen')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.TronoPortal.showOnly('setupScreen'));
    await expect(page.locator('body')).not.toHaveClass(/court-fullscreen/);
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      true,
      'Native fullscreen belongs to the app and survives leaving the court',
    );
    await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
    await expect(page.locator('body')).toHaveClass(/court-fullscreen/);
    await page.locator('#courtFullscreen').click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      )
      .toBe(false);
    await expect(page.locator('body')).not.toHaveClass(/court-fullscreen/);
    // The table and shell share the pending IPC, so this requests one transition.
    await page.evaluate(() =>
      Promise.all([window.TronoCourtFullscreen.toggle(), window.TronoCourtFullscreen.toggle()]),
    );
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
      )
      .toBe(true);
    await expect(page.locator('#courtFullscreen')).toHaveAttribute('aria-pressed', 'true');
    // A window change outside the table controller follows the same native subscription.
    await page.evaluate(() => window.TronoDesktop.toggleFullscreen());
    await expect(page.locator('#courtFullscreen')).toHaveAttribute('aria-pressed', 'false');
    assert(
      await page.evaluate(
        () =>
          window.__nativeCourtButton === document.getElementById('courtFullscreen') &&
          document.querySelectorAll('#courtFullscreen').length === 1 &&
          window.TronoSocial.getLocalAudioTrack() === window.__nativeCourtMic &&
          window.TronoSocial.getLocalDisplayStream() === window.__nativeCourtScreen,
      ),
    );
  } finally {
    const current = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isFullScreen(),
    );
    if (current !== before) await page.evaluate(() => window.TronoDesktop.toggleFullscreen());
    if (original) await page.evaluate((id) => window.TronoPortal.showOnly(id), original);
    await page.evaluate(() => {
      for (const key of ['__nativeCourtButton', '__nativeCourtMic', '__nativeCourtScreen'])
        delete window[key];
    });
  }
}
module.exports = { exerciseCourtFullscreen };
