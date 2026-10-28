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
      await fixture.registerAccount({
        email: 'local-history@example.test',
        nickname: 'Casa Local',
        password: 'Senha12!',
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
        if (
          /\[Throne(?:History|Match|Table|Seats|Effects|Events|Choices|Hand|Controls|Local)\]/.test(
            message.text(),
          )
        )
          warnings.push(message.text());
      });
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      // These helpers issue controller commands rather than clicking visible UI.
      // Account restoration finishes before the initial communication navigation.
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.TronoNetwork.currentRoom)).toBe('chat-livre');
      await require('./throne-local-lifecycle-controls.cjs').exerciseLocalLifecycle(page);
      await require('./court-fullscreen-controls.cjs').exerciseWebCourtFullscreen(page);
      await require('./throne-controls-browser-helper.cjs').exerciseThroneControls(page);
      await require('./throne-tooltip-controls.cjs').exerciseThroneTooltips(page);
      await require('./throne-effects-controls.cjs').exerciseThroneEffects(page);
      await require('./throne-local-hand-controls.cjs').exerciseLocalHand(page);
      await require('./throne-local-choices-controls.cjs').exerciseLocalChoices(page);
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
      // Run a real human round through the shared React hand and existing engine choices.
      await page.evaluate(() => window.TronoThroneLobby.enter('sala-chave'));
      await expect(page.locator('#roomScreen')).toBeVisible();
      await page.locator('#roomScreen details').evaluate((node) => {
        node.open = true;
      });
      // A known first trick makes the human the new Crown under Desafio.
      // Only this disposable fixture controls the shuffle and hands; rules remain unchanged.
      await page.evaluate(() => {
        window.__savedLocalRandom = Math.random;
        window.__savedLocalDecrees = [...window.TronoRules.decrees];
        const challenge = window.TronoRules.decrees.find((d) => d.id === 'desafio');
        const rest = window.TronoRules.decrees.filter((d) => d.id !== 'desafio');
        window.TronoRules.decrees.splice(0, 10, rest[0], challenge, ...rest.slice(1));
        Math.random = () => 0;
      });
      await page.locator('#startHumanBtn').click();
      await expect(page.locator('#throneChoiceDialog')).toBeVisible();
      await page.evaluate(() => {
        Math.random = window.__savedLocalRandom;
        window.TronoRules.decrees.splice(0, 10, ...window.__savedLocalDecrees);
        delete window.__savedLocalRandom;
        delete window.__savedLocalDecrees;
        const g = window.__LeiDoTrono.getState();
        const suits = ['cetro', 'chave', 'lamina', 'mascara'];
        const deck = Array.from({ length: 48 }, (_, id) => ({
          id: `c${id}`,
          suit: suits[Math.floor(id / 12)],
          value: (id % 12) + 1,
          public: false,
          publicReason: null,
        }));
        const hands = [
          [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
          [0, 21, 22, 23, 24, 25, 26, 27, 28, 29],
          [1, 30, 31, 32, 33, 34, 35, 36, 37, 38],
          [2, 3, 4, 5, 6, 7, 8, 9, 10, 39],
        ];
        g.players.forEach((p, seat) => {
          p.hand = hands[seat].map((id) => deck[id]);
        });
        g.undealt = deck.slice(40);
        g.firstRoundStarter = g.leader = 0;
      });
      await page.locator('#throneChoiceDialog .choice-card').filter({ hasText: 'Desafio' }).click();
      let humanPlays = 0,
        humanChallenges = 0;
      const humanDeadline = Date.now() + 45000;
      while (
        !(await page.locator('#throneResultDialog').isVisible()) &&
        !errors.length &&
        !warnings.length &&
        Date.now() < humanDeadline
      ) {
        if (await page.locator('#thronePrivateDialog').isVisible())
          await page.locator('#thronePrivateContinue').click();
        else if (await page.locator('#throneChoiceDialog').isVisible()) {
          const offered = await page.evaluate(() => window.TronoThroneChoices.getSnapshot());
          if (offered.prompt?.kind === 'challenge') {
            assert.equal(offered.context.lastCrown, 0);
            humanChallenges++;
          }
          const choice = page.locator('#throneChoiceDialog .choice-card').first();
          if (await choice.isVisible()) await choice.click();
        } else {
          const card =
            humanPlays === 0
              ? page.locator('#humanHand [data-card="c11"]')
              : page.locator('#humanHand .hand-card:enabled').first();
          if (await card.isVisible()) {
            await card.focus();
            await page.keyboard.press(humanPlays % 2 ? 'Space' : 'Enter');
            humanPlays++;
          }
        }
        await page.waitForTimeout(35);
      }
      assert.deepEqual(errors, [], 'Human local round must not throw page errors');
      assert.deepEqual(warnings, [], 'Human local round must not report controller errors');
      await expect(page.locator('#throneResultDialog')).toBeVisible();
      assert(humanChallenges >= 1, 'The new human Crown must complete Desafio');
      assert(humanPlays >= 9, `Human round must play its hand (played ${humanPlays})`);
      assert.equal(
        await page.evaluate(() => window.TronoThroneHistory.getSnapshot().dialog.round),
        1,
      );
      await page.screenshot({ path: 'artifacts/throne-local-hand-human-round.png' });
      await page.evaluate(() => window.TronoThroneBoard.backToLobby());
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
