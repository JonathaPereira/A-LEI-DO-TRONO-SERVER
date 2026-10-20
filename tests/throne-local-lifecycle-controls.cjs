'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');
async function exerciseLocalLifecycle(page) {
  const roomId = await page.evaluate(() => (window.TronoDesktop ? 'sala-cetro' : 'sala-chave'));
  async function room() {
    // Local prototypes never start an authoritative match or consume its decree fixture.
    await page.evaluate((id) => window.TronoThroneLobby.enter(id), roomId);
    await expect(page.locator('#roomScreen')).toBeVisible();
    await page.locator('#roomScreen details').evaluate((node) => {
      node.open = true;
    });
  }
  async function holdAudio() {
    await page.evaluate(() => {
      const original = window.TronoAudio.ensureAudio;
      window.__localPrepareCalls = 0;
      window.TronoAudio.ensureAudio = () => {
        window.__localPrepareCalls++;
        return new Promise((resolve) => {
          window.__releaseLocalPreparation = () => {
            window.TronoAudio.ensureAudio = original;
            resolve(true);
          };
        });
      };
    });
  }
  async function leave() {
    await page.evaluate(() => window.TronoThroneBoard.backToLobby());
    await expect(page.locator('#setupScreen')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.TronoNetwork.gameRoom)).toBe(null);
    assert.equal(await page.evaluate(() => window.TronoThroneLocal.getSnapshot().phase), 'idle');
  }
  await room();
  await holdAudio();
  await page.evaluate(() => {
    window.__localStartNodes = ['startHumanBtn', 'startDemoBtn'].map((id) =>
      document.getElementById(id),
    );
    document.getElementById('startDemoBtn').click();
    window.__localLaunch = window.TronoThroneLocal.start(false);
  });
  await expect(page.locator('#startDemoBtn')).toBeDisabled();
  await expect(page.locator('#startHumanBtn')).toBeDisabled();
  assert.equal(await page.evaluate(() => window.__localPrepareCalls), 1);
  assert.equal(await page.evaluate(() => window.__LeiDoTrono.getState()), null);
  await leave();
  await page.evaluate(() => {
    window.__releaseLocalPreparation();
  });
  await page.evaluate(() => window.__localLaunch);
  await expect(page.locator('#gameScreen')).toBeHidden();
  assert.equal(await page.evaluate(() => window.__LeiDoTrono.getState()), null);

  await room();
  await holdAudio();
  await page.evaluate(() => window.__LeiDoTrono.setFast());
  await page.locator('#startDemoBtn').click();
  await page.evaluate(() => {
    window.__releaseLocalPreparation();
  });
  await expect(page.locator('#gameScreen')).toBeVisible();
  await page.evaluate(() => {
    const old = window.__LeiDoTrono.getState().localSession;
    window.__oldLocalRun = old;
    window.__localOldResult = null;
    old
      .wait(
        new Promise((resolve) => {
          window.__finishOldLocalWork = resolve;
        }),
      )
      .then(
        () => {
          window.__localOldResult = 'accepted';
        },
        (error) => {
          window.__localOldResult = error.name;
        },
      );
  });
  await leave();
  await expect.poll(() => page.evaluate(() => window.__localOldResult)).toBe('AbortError');

  await room();
  await holdAudio();
  await page.locator('#startDemoBtn').click();
  await page.evaluate(() => {
    window.__finishOldLocalWork();
  });
  assert.equal(await page.evaluate(() => window.TronoThroneLocal.getSnapshot().phase), 'preparing');
  assert.equal(
    await page.evaluate(() => {
      try {
        window.__oldLocalRun.assert();
        return 'accepted';
      } catch (error) {
        return error.name;
      }
    }),
    'AbortError',
  );
  assert(
    await page.evaluate(() =>
      window.__localStartNodes.every(
        (node) => node.isConnected && node === document.getElementById(node.id),
      ),
    ),
  );
  await leave();
  await page.evaluate(() => {
    window.__releaseLocalPreparation();
    // Restore the speed selected by this fixture before the shared controls checks.
    if (window.TronoThroneControls.getSnapshot().scale === 0.05)
      window.TronoThroneControls.cycleSpeed();
    for (const key of [
      '__localPrepareCalls',
      '__localLaunch',
      '__localStartNodes',
      '__releaseLocalPreparation',
      '__oldLocalRun',
      '__localOldResult',
      '__finishOldLocalWork',
    ])
      delete window[key];
  });
  await expect(page.locator('#throneChoiceDialog')).toBeHidden();
  await expect(page.locator('#throneLocalHandDialog')).toBeHidden();
}
module.exports = { exerciseLocalLifecycle };
