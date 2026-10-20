'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');
async function exerciseWebCourtFullscreen(page) {
  const original = await page.evaluate(
    () =>
      [...document.querySelectorAll('.screen')].find((node) => !node.classList.contains('hidden'))
        ?.id,
  );
  await page.evaluate(() => {
    window.__courtButton = document.getElementById('courtFullscreen');
    window.__courtMic = window.TronoSocial.getLocalAudioTrack();
    window.__courtStream = window.TronoSocial.getLocalDisplayStream();
    window.__courtRequest = document.documentElement.requestFullscreen;
    window.TronoPortal.showOnly('gameScreen');
  });
  try {
    await page.locator('#courtFullscreen').click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement))
      .toBe(true);
    await expect(page.locator('body')).toHaveClass(/court-fullscreen/);
    await expect(page.locator('#courtFullscreen')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.TronoPortal.showOnly('setupScreen'));
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(page.locator('body')).not.toHaveClass(/court-fullscreen/);
    await page.evaluate(() => {
      window.TronoPortal.showOnly('gameScreen');
      document.documentElement.requestFullscreen = () => {
        window.__courtGesture = navigator.userActivation.isActive;
        return window.__courtRequest.call(document.documentElement).then(
          () =>
            new Promise((resolve) => {
              window.__releaseCourt = resolve;
            }),
        );
      };
    });
    await page.locator('#courtFullscreen').click();
    await expect(page.locator('#courtFullscreen')).toBeDisabled();
    await page.waitForFunction(() => !!window.__releaseCourt);
    assert.equal(await page.evaluate(() => window.__courtGesture), true);
    await page.evaluate(() => window.TronoPortal.showOnly('setupScreen'));
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await page.evaluate(() => {
      window.__releaseCourt();
      document.documentElement.requestFullscreen = window.__courtRequest;
    });
    await page.waitForFunction(() => !window.TronoCourtFullscreen.getSnapshot().pending);
    await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    // A different feature owns this root request. Hiding the court must leave it alone.
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'externalCourtFullscreen';
      button.textContent = 'Other fullscreen';
      button.style.cssText = 'position:fixed;top:5px;left:5px;z-index:2147483647';
      button.onclick = () => document.documentElement.requestFullscreen();
      document.body.append(button);
    });
    await page.locator('#externalCourtFullscreen').click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement))
      .toBe(true);
    await page.evaluate(() => window.TronoPortal.showOnly('setupScreen'));
    assert.equal(
      await page.evaluate(() => document.fullscreenElement === document.documentElement),
      true,
    );
    await page.evaluate(async () => {
      await document.exitFullscreen();
      document.getElementById('externalCourtFullscreen').remove();
      window.TronoPortal.showOnly('gameScreen');
      document.documentElement.requestFullscreen = () =>
        Promise.reject(new DOMException('Denied fixture', 'NotAllowedError'));
    });
    await page.locator('#courtFullscreen').click();
    await expect(page.locator('#courtFullscreen')).toBeEnabled();
    await expect(page.locator('#courtFullscreen')).toHaveAttribute('title', /F11/);
    assert(
      await page.evaluate(
        () =>
          window.__courtButton === document.getElementById('courtFullscreen') &&
          document.querySelectorAll('#courtFullscreen').length === 1 &&
          window.TronoSocial.getLocalAudioTrack() === window.__courtMic &&
          window.TronoSocial.getLocalDisplayStream() === window.__courtStream,
      ),
    );
  } finally {
    await page.evaluate(async (id) => {
      document.documentElement.requestFullscreen = window.__courtRequest;
      if (document.fullscreenElement) await document.exitFullscreen();
      document.getElementById('externalCourtFullscreen')?.remove();
      if (id) window.TronoPortal.showOnly(id);
      for (const key of [
        '__courtButton',
        '__courtMic',
        '__courtStream',
        '__courtRequest',
        '__releaseCourt',
        '__courtGesture',
      ])
        delete window[key];
    }, original);
  }
}
module.exports = { exerciseWebCourtFullscreen };
