'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');

async function exerciseThroneHistory(page, { responsive = true } = {}) {
  await page.evaluate(() => {
    window.TronoThroneMatch.setLocal({
      round: 1,
      trick: 10,
      phase: 'round-end',
      turnName: null,
      yourTurn: false,
      deadline: null,
    });
    window.TronoPortal.showOnly('gameScreen');
    window.TronoThroneHistory.toggleLog(false);
    window.TronoThroneHistory.appendPublic(
      'Nome literal <img src=x onerror=alert(1)> & registro público',
      1,
      10,
    );
    window.__historyHosts = [
      'eventLogPanel',
      'eventLog',
      'logBtn',
      'eventDragHandle',
      'logResizeGrip',
    ].map((id) => document.getElementById(id));
  });
  async function toggleLog() {
    if (await page.evaluate(() => !!window.TronoDesktop)) {
      await page.locator('#voiceSettingsBtn').click();
      await page.locator('[data-settings-tab="game"]').click();
      const group = page
        .locator('.game-settings-group')
        .filter({ has: page.locator('[data-game-group="help"]') });
      if (!(await group.evaluate((node) => node.open))) await group.locator('summary').click();
      await page.locator('#logBtn').click();
      await page.locator('#voiceSettingsClose').click();
    } else await page.locator('#logBtn').click();
  }
  await toggleLog();
  await expect(page.locator('#eventLogPanel')).toBeVisible();
  await expect(page.locator('#eventLog')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#eventLog img')).toHaveCount(0);
  await page.locator('#logResetBtn').click();
  const before = await page.locator('#eventLogPanel').boundingBox(),
    handle = await page.locator('#eventDragHandle').boundingBox();
  await page.mouse.move(handle.x + 35, handle.y + 16);
  await page.mouse.down();
  await page.mouse.move(handle.x - 65, handle.y - 44, { steps: 5 });
  await page.mouse.up();
  const moved = await page.locator('#eventLogPanel').boundingBox();
  assert(moved.x < before.x - 20 && moved.y < before.y - 20, JSON.stringify({ before, moved }));
  const grip = await page.locator('#logResizeGrip').boundingBox();
  await page.mouse.move(grip.x + 10, grip.y + 10);
  await page.mouse.down();
  await page.mouse.move(grip.x + 65, grip.y + 40, { steps: 5 });
  await page.mouse.up();
  const resized = await page.locator('#eventLogPanel').boundingBox();
  assert(resized.width > moved.width + 20 && resized.height > moved.height + 10);
  assert(
    await page.evaluate(() => !!(window.TronoStorage || localStorage).getItem('tronoLogGeometry')),
  );
  await page.locator('#logHideBtn').click();
  await expect(page.locator('#eventLogPanel')).toBeHidden();
  await toggleLog();
  assert(
    await page.evaluate(() =>
      window.__historyHosts.every(
        (node) => node && node === document.getElementById(node.id) && node.isConnected,
      ),
    ),
  );
  await page.locator('#clearLogBtn').click();
  await expect(page.locator('#eventLog .event-item')).toHaveCount(0);
  await page.locator('#logHideBtn').click();
  await page.evaluate(() => {
    window.TronoThroneHistory.appendPublic('Crônica final <b>literal</b>', 1, 10);
    window.__historyConfirmed = 0;
    window.__historyRoundScores = [4, 3, 2, 1].map((crowns, seat) => {
      const shadows = 5 - crowns,
        pairs = Math.min(crowns, shadows),
        prestige = crowns + shadows + 2 * pairs;
      return {
        seat,
        name: 'Casa ' + seat,
        crowns,
        shadows,
        pairs,
        prestige,
        roundScore: { crowns, shadows, pairs, gained: prestige },
      };
    });
    window.TronoThroneHistory.showLocal({
      kind: 'round',
      round: 1,
      scores: window.__historyRoundScores,
    }).then(
      () => window.__historyConfirmed++,
      (e) => {
        window.__historyAbort = e.name;
      },
    );
  });
  await expect(page.locator('#throneResultDialog')).toBeVisible();
  await expect(page.locator('#throneResultDialog .score-row')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.locator('#throneResultDialog')).toBeVisible();
  await page.evaluate(() => window.TronoPortal.showOnly('portalScreen'));
  await expect(page.locator('#throneResultDialog')).toBeHidden();
  await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
  await expect(page.locator('#throneResultDialog')).toBeVisible();
  if (responsive) {
    for (const layout of ['original', 'discord']) {
      await page.evaluate((value) => window.TronoAppLayout.apply(value), layout);
      for (const [width, height] of [
        [480, 800],
        [1080, 1920],
      ]) {
        await page.setViewportSize({ width, height });
        const box = await page.locator('#throneResultDialog').evaluate((node) => {
          const r = node.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            scroll: node.scrollWidth,
            width: node.clientWidth,
            vw: innerWidth,
            vh: innerHeight,
          };
        });
        assert(
          box.left >= 0 &&
            box.right <= box.vw + 1 &&
            box.top >= 0 &&
            box.bottom <= box.vh + 1 &&
            box.scroll <= box.width + 1,
          JSON.stringify(box),
        );
        await page.screenshot({ path: `artifacts/throne-history-round-${layout}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => window.TronoAppLayout.apply('original'));
  }
  await page.locator('#throneResultContinue').click();
  await expect.poll(() => page.evaluate(() => window.__historyConfirmed)).toBe(1);
  await page.evaluate(() => {
    window.TronoThroneMatch.setLocal({
      round: 3,
      trick: 10,
      phase: 'game-over',
      turnName: null,
      yourTurn: false,
      deadline: null,
    });
    const scores = window.__historyRoundScores.map((p) => ({
      ...p,
      crowns: p.crowns * 3,
      shadows: p.shadows * 3,
      pairs: p.pairs * 3,
      prestige: p.prestige * 3,
    }));
    window.TronoThroneHistory.showLocal({ kind: 'final', round: 3, scores }).then(
      () => window.__historyConfirmed++,
      (e) => {
        window.__historyAbort = e.name;
      },
    );
  });
  await expect(page.locator('#throneResultDialog .winner-title')).toHaveText(
    'Casa 1 ocupa o Trono.',
  );
  await expect(page.locator('#throneResultDialog .final-log-list')).toContainText('<b>literal</b>');
  await expect(page.locator('#throneResultDialog .final-log-list b')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/throne-history-final.png' });
  await page.locator('#throneResultContinue').click();
  await expect.poll(() => page.evaluate(() => window.__historyConfirmed)).toBe(2);
  await page.evaluate(() => {
    window.TronoThroneHistory.showLocal({
      kind: 'round',
      round: 1,
      scores: window.__historyRoundScores,
    }).catch((e) => {
      window.__historyAbort = e.name;
    });
    window.TronoThroneMatch.clear();
    window.TronoPortal.showOnly('setupScreen');
  });
  await expect.poll(() => page.evaluate(() => window.__historyAbort)).toBe('AbortError');
  await expect(page.locator('#throneResultDialog')).toBeHidden();
}
module.exports = { exerciseThroneHistory };
