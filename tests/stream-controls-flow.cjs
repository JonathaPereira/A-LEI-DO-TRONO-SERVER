'use strict';
const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');

/** Uses a real borrowed player: idle/fullscreen must not replace its video or stop received frames. */
async function exerciseStreamControls(page, tile) {
  const maximize = tile.locator('.media-fullscreen-btn'),
    video = tile.locator('video');
  await expect(tile).toHaveClass(/has-video/);
  await tile.evaluate((element) => {
    const video = element.querySelector('video');
    element.__idleBaseline = {
      video,
      stream: video.srcObject,
      tracks: video.srcObject.getTracks(),
      frames: video.getVideoPlaybackQuality().totalVideoFrames,
      network: window.TronoNetwork,
      id: window.TronoNetwork.clientId,
      mic: window.TronoSocial.getLocalAudioTrack(),
    };
  });
  assert.equal(await page.evaluate(() => window.TronoStreamControls), undefined);
  try {
    await tile.hover();
    await expect(maximize).toBeVisible();
    await page.locator('#screenShareBtn').focus();
    await page.mouse.move(2, 2);
    await expect(tile).toHaveClass(/screen-controls-idle/, { timeout: 5500 });
    await expect(maximize).toBeHidden();
    assert.equal(await tile.evaluate((element) => getComputedStyle(element).cursor), 'none');
    await page.evaluate(() => window.TronoSocial.renderScreenGrid());
    await page.mouse.move(5, 5);
    await page.keyboard.press('Shift');
    await expect(maximize).toBeHidden();

    await tile.focus();
    await expect(maximize).toBeVisible();
    await tile.press('Tab');
    assert(
      await tile.evaluate((element) => element.contains(document.activeElement)),
      JSON.stringify(
        await tile.evaluate((element) => ({
          active: document.activeElement?.outerHTML.slice(0, 500),
          tile: element.outerHTML.slice(0, 350),
          buttons: [...element.querySelectorAll('button')].map((b) => ({
            text: b.textContent,
            hidden: b.hidden,
            visibility: getComputedStyle(b).visibility,
            tabindex: b.tabIndex,
          })),
        })),
      ),
    );
    await page.waitForTimeout(3200);
    await expect(maximize).toBeVisible();
    // A pointer drag remains usable until release outside the player.
    await page.locator('#screenShareBtn').focus();
    await tile.hover();
    await page.mouse.down();
    await page.waitForTimeout(3200);
    await expect(maximize).toBeVisible();
    await page.mouse.move(2, 2);
    await page.mouse.up();
    await expect(tile).toHaveClass(/screen-controls-idle/, { timeout: 5500 });

    await tile.hover();
    await maximize.click();
    await expect
      .poll(() => tile.evaluate((element) => document.fullscreenElement === element))
      .toBe(true);
    await expect(tile).toHaveClass(/screen-controls-idle/, { timeout: 5500 });
    await expect(maximize).toBeHidden();
    await tile.hover();
    await maximize.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);

    await page.evaluate(() => {
      window.__idleRequestFullscreen = Element.prototype.requestFullscreen;
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new DOMException('Fixture denial', 'NotAllowedError'));
    });
    await tile.hover();
    await maximize.click();
    await expect(tile).toHaveClass(/media-maximized/);
    await expect(tile).toHaveClass(/screen-controls-idle/, { timeout: 5500 });
    await expect(maximize).toBeHidden();
    await tile.hover();
    await expect(maximize).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path:
        'artifacts/stream-controls-fallback-' +
        ((await page.evaluate(() => !!window.TronoDesktop)) ? 'desktop' : 'web') +
        '.png',
    });
    await maximize.click();
    await expect(tile).not.toHaveClass(/media-maximized/);
    await expect
      .poll(() => video.evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames))
      .toBeGreaterThan(await tile.evaluate((element) => element.__idleBaseline.frames));
    assert(
      await tile.evaluate((element) => {
        const before = element.__idleBaseline,
          video = element.querySelector('video');
        return (
          video === before.video &&
          video.srcObject === before.stream &&
          before.tracks.every(
            (track) => track.readyState === 'live' && video.srcObject.getTracks().includes(track),
          ) &&
          window.TronoNetwork === before.network &&
          window.TronoNetwork.clientId === before.id &&
          window.TronoSocial.getLocalAudioTrack() === before.mic &&
          before.mic.readyState === 'live'
        );
      }),
      'The same player, received tracks, socket and microphone survive visual transitions',
    );
  } finally {
    await page.mouse.up();
    await tile.evaluate(async (element) => {
      if (window.__idleRequestFullscreen) {
        Element.prototype.requestFullscreen = window.__idleRequestFullscreen;
        delete window.__idleRequestFullscreen;
      }
      await window.TronoCallStage.releaseFocus(element);
      delete element.__idleBaseline;
    });
    await page.locator('#screenShareBtn').focus();
  }
}
module.exports = { exerciseStreamControls };
