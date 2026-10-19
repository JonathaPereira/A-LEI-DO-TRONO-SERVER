'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const path = require('node:path'),
  express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'the real local simulation completes three rounds and final standings through React confirmations',
  { timeout: 120000 },
  async (t) => {
    const origin = 'http://127.0.0.1:10964',
      server = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(10964, '127.0.0.1');
    let fixture, browser, context;
    const errors = [],
      warnings = [],
      rounds = new Set();
    t.signal.addEventListener(
      'abort',
      () => {
        void context?.close();
      },
      { once: true },
    );
    try {
      fixture = await startFixture({ port: 10963, appOrigin: origin });
      await fixture.call('signup', {
        email: 'local-history@example.test',
        nickname: 'Casa Local',
        password: 'Senha12!',
      });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (
        await fixture.call('login', { email: 'local-history@example.test', password: 'Senha12!' })
      ).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
      });
      context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
        },
        { base: fixture.base, data },
      );
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (message) => {
        if (/\[Throne(?:History|Match|Table|Seats)\]/.test(message.text()))
          warnings.push(message.text());
      });
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.evaluate(() => window.TronoThroneLobby.enter('sala-chave'));
      await expect(page.locator('#roomScreen')).toBeVisible();
      await page.locator('#roomScreen details').evaluate((node) => {
        node.open = true;
      });
      await page.evaluate(() => window.__LeiDoTrono.setFast());
      await page.locator('#startDemoBtn').click();
      await expect(page.locator('#gameScreen')).toBeVisible();
      let final = false;
      const deadline = Date.now() + 100000;
      while (!final && Date.now() < deadline) {
        const result = await page.evaluate(() => window.TronoThroneHistory.getSnapshot().dialog);
        if (!result) {
          await page.waitForTimeout(100);
          continue;
        }
        await expect(page.locator('#throneResultDialog')).toBeVisible();
        await expect(page.locator('#throneResultDialog .score-row')).toHaveCount(4);
        assert.equal(result.mode, 'local');
        assert.equal(
          result.scores.reduce((n, p) => n + p.crowns, 0),
          result.round * 10,
        );
        assert(
          await page.evaluate(
            () => !Object.isFrozen(window.__LeiDoTrono.getState().players[0].hand),
          ),
        );
        if (result.kind === 'round') {
          rounds.add(result.round);
          assert(result.scores.every((p) => p.roundScore));
        } else {
          final = true;
          assert(result.winners.length > 0);
          assert(result.entries.length > 30);
          await page.screenshot({ path: 'artifacts/throne-history-local-simulation.png' });
        }
        await page.locator('#throneResultContinue').click();
      }
      assert(final, 'Local simulation must reach its final result');
      assert.deepEqual([...rounds], [1, 2, 3]);
      await expect(page.locator('#setupScreen')).toBeVisible();
      assert.equal(await page.evaluate(() => window.__LeiDoTrono.getState()), null);
      assert.equal(await page.evaluate(() => window.TronoThroneHistory.getSnapshot().dialog), null);
      assert.deepEqual(errors, []);
      assert.deepEqual(warnings, []);
    } finally {
      await context?.close();
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
