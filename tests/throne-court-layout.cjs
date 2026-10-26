'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express'),
  path = require('node:path'),
  { chromium, expect } = require('@playwright/test');

test(
  'court reserves separate hit targets for decrees and cards at shell breakpoints',
  { timeout: 30000 },
  async (t) => {
    const server = express()
      .use(express.static(path.resolve(__dirname, '../out')))
      .listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const fixture = await require('./auth-fixture').startFixture({
      port: 11959,
      appOrigin: origin,
    });
    await fixture.call('signup', {
      email: 'court-layout@example.test',
      nickname: 'Casa Layout',
      password: 'Senha12!',
    });
    await fixture.call('verify', { token_hash: [...fixture.links.keys()].at(-1), type: 'signup' });
    const data = (
      await fixture.call('login', { email: 'court-layout@example.test', password: 'Senha12!' })
    ).data;
    let browser;
    t.signal.addEventListener(
      'abort',
      () => {
        void browser?.close();
      },
      { once: true },
    );
    try {
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      });
      const page = await browser.newPage();
      await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      await page.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
        },
        { base: fixture.base, data },
      );
      await page.goto(origin);
      await page.waitForFunction(
        () =>
          window.TronoThroneTable &&
          window.TronoThronePrivate &&
          window.TronoThroneSeats &&
          window.TronoThroneHistory &&
          window.TronoAuth?.ready,
      );
      await page.evaluate(() => window.TronoAuth.ready);
      await page.evaluate(() => {
        document.body.classList.add('desktop-app');
        document.querySelectorAll('dialog[open]').forEach((d) => d.close());
        window.TronoThroneMatch.setLocal({
          round: 1,
          trick: 1,
          phase: 'await-play',
          turnName: null,
          yourTurn: false,
          deadline: null,
        });
        window.TronoThroneSeats.setLocal({
          localSeat: 0,
          turn: 0,
          players: [0, 1, 2, 3].map((id) => ({
            id,
            seat: id,
            name: `Casa ${id}`,
            ai: id !== 0,
            handCount: 10,
            reservePresent: false,
            publicCards: [],
            totalCrowns: 0,
            totalShadows: 0,
            roundCrowns: 0,
            roundShadows: 0,
            influence: 0,
            prestige: 0,
            pairs: 0,
          })),
        });
        window.TronoThroneTable.setLocal({
          round: 1,
          trick: 1,
          phase: 'await-play',
          currentLaw: 'ordem',
          lawUsage: { ordem: 1, estandarte: 0, revolta: 0, anarquia: 0, usurpacao: 0 },
          trump: null,
          declaredLeadSuit: null,
          previousWinningSuit: null,
          decree: { id: 'espionagem' },
          names: ['Casa 0', 'Casa 1', 'Casa 2', 'Casa 3'],
          localSeat: 0,
          plays: [],
        });
        window.TronoPortal.showOnly('gameScreen');
        void window.TronoThronePrivate.showLocal({
          kind: 'intelligence',
          clue: {
            target: 3,
            name: 'Casa 3',
            card: { id: 'c0', suit: 'cetro', value: 1, public: false, publicReason: null },
          },
        });
      });
      await page.locator('#thronePrivateContinue').click();
      for (const layout of ['corte']) {
        for (const [width, height] of [
          [1440, 900],
          [1280, 720],
          [1100, 700],
          [1024, 740],
          [1008, 651],
          [1000, 700],
          [800, 600],
          [480, 700],
          [480, 520],
        ]) {
          await page.setViewportSize({ width, height });
          await page.locator('#decreeBadge').scrollIntoViewIfNeeded();
          const overlap = await page.locator('#decreeBadge').evaluate((badge) => {
            const b = badge.getBoundingClientRect();
            return [...document.querySelectorAll('.table-card-slot, .coin-bank')]
              .filter((slot) => {
                const r = slot.getBoundingClientRect();
                return (
                  Math.min(b.right, r.right) - Math.max(b.left, r.left) > 0.5 &&
                  Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 0.5
                );
              })
              .map((slot) => slot.id || slot.className);
          });
          assert.deepEqual(overlap, [], `${layout} ${width}x${height}: card covers decree`);
          await page.locator('#decreeBadge').click();
          await expect(page.locator('#thronePrivateDialog')).toBeVisible();
          await page.locator('#thronePrivateContinue').click();
          for (const id of [0, 1, 2, 3]) await page.locator(`#tableCard${id}`).click();
          if (width === 480 && height === 520)
            await page.screenshot({ path: `artifacts/court-hit-targets-${layout}-compact.png` });
        }
      }
      await page.setViewportSize({ width: 1024, height: 740 });
      await page.evaluate(() => window.TronoThroneHistory.toggleLog(true));
      await expect(page.locator('#eventLogPanel')).toBeVisible();
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
