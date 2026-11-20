'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'Christmas update presentation, instant live activation, voice call continuity, and appearance toggles work end-to-end',
  { timeout: 120000 },
  async () => {
    const server = await new Promise((resolve) => {
      const app = express().use(express.static(path.resolve(__dirname, '../out')));
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 10961, appOrigin: origin });
    let browser, ctx1, ctx2;
    const errors = [];

    try {
      await fixture.registerAccount({
        email: 'natal-one@example.test',
        nickname: 'Guardião Um',
        password: 'Senha12!',
      });
      await fixture.registerAccount({
        email: 'natal-two@example.test',
        nickname: 'Guardiã Dois',
        password: 'Senha12!',
      });

      const firstLogin = (
        await fixture.call('login', { email: 'natal-one@example.test', password: 'Senha12!' })
      ).data;
      const secondLogin = (
        await fixture.call('login', { email: 'natal-two@example.test', password: 'Senha12!' })
      ).data;

      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        headless: true,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });

      // Scenario 1: First launch promo dismiss ("Agora não") keeps original theme and stays dismissed across reloads
      ctx1 = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        permissions: ['microphone', 'camera'],
      });
      await ctx1.route('**/*', (r) =>
        ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      await ctx1.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
        },
        { base: fixture.base, data: firstLogin },
      );

      const page1 = await ctx1.newPage();
      page1.on('pageerror', (err) => errors.push(err.message));
      await page1.goto(origin);
      await page1.waitForFunction(() => window.TronoAuth?.ready);
      await page1.evaluate(() => window.TronoAuth.ready);

      const promo = page1.locator('[data-christmas-promo]');
      await expect(promo).toBeVisible();
      await expect(promo).toContainText('O Natal chegou à Corte! 🎄');
      await expect(promo).toContainText(
        'Experimente nosso novo tema natalino e transforme sua experiência na Corte. Entre no clima das festividades!',
      );

      await promo.getByRole('button', { name: 'Agora não', exact: true }).click();
      await expect(promo).toHaveCount(0);
      assert.equal(
        await page1.evaluate(() => document.documentElement.dataset.theme),
        'purple',
      );

      await page1.reload();
      await page1.waitForFunction(() => window.TronoAuth?.ready);
      await page1.evaluate(() => window.TronoAuth.ready);
      await expect(promo).toHaveCount(0);
      await ctx1.close();

      // Scenario 2: User enters a live call + chat, accepts promo without reload or call drop,
      // verifies proportional button geometry, then toggles off/on and reduced motion in settings.
      ctx2 = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        permissions: ['microphone', 'camera'],
      });
      await ctx2.route('**/*', (r) =>
        ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      await ctx2.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          if (localStorage.getItem('mnTheme:' + data.user.id) === null) {
            localStorage.setItem('mnTheme:' + data.user.id, 'teal');
          }
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
        },
        { base: fixture.base, data: secondLogin },
      );

      const page2 = await ctx2.newPage();
      page2.on('pageerror', (err) => errors.push(err.message));
      await page2.goto(origin);
      await page2.waitForFunction(() => window.TronoAuth?.ready);
      await page2.evaluate(() => window.TronoAuth.ready);

      await page2.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
      await expect.poll(() => page2.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await page2.evaluate(() => window.TronoCallNavigation.showCall());

      const joinBtn = page2.locator('[data-control="joinVoiceBtn"]');
      const sizeBefore = await joinBtn.boundingBox();
      await page2.evaluate(() => {
        window.__noPageReloadSentinel = true;
      });

      const promo2 = page2.locator('[data-christmas-promo]');
      await expect(promo2).toBeVisible();
      await promo2.getByRole('button', { name: 'Experimentar tema natalino', exact: true }).click();

      await expect(promo2).toHaveCount(0);
      assert.equal(
        await page2.evaluate(() => document.documentElement.dataset.theme),
        'natal',
      );
      assert.equal(
        await page2.evaluate(() => window.__noPageReloadSentinel === true),
        true,
      );
      assert.equal(
        await page2.evaluate(() => window.TronoSocial.voiceJoined),
        true,
      );

      const sizeAfter = await joinBtn.boundingBox();
      assert(Math.abs(sizeAfter.width - sizeBefore.width) <= 2);
      assert(Math.abs(sizeAfter.height - sizeBefore.height) <= 2);

      // Verify LED pseudo-element glow renders cleanly on primary CTA button without altering layout
      const ledContent = await page2.evaluate(() => {
        const btn = document.querySelector('[data-control="joinVoiceBtn"]');
        return btn ? getComputedStyle(btn, '::before').content : '';
      });
      assert.notEqual(ledContent, 'none');

      // Reload confirms persisted natal theme and keeps promo hidden
      await page2.reload();
      await page2.waitForFunction(() => window.TronoAuth?.ready);
      await page2.evaluate(() => window.TronoAuth.ready);
      assert.equal(
        await page2.evaluate(() => document.documentElement.dataset.theme),
        'natal',
      );
      await expect(promo2).toHaveCount(0);

      // Open settings -> Aparência -> Toggle "Tema de Natal" off (restores 'teal'), then on, and "Reduzir animações decorativas"
      await page2.getByRole('button', { name: /Meu perfil/i }).click();
      await page2.getByRole('button', { name: 'Configurações da Corte', exact: true }).click();
      await page2.locator('[data-settings-tab="appearance"]').click();

      const christmasSwitch = page2.getByRole('switch', { name: 'Tema de Natal' });
      await expect(christmasSwitch).toBeChecked();
      await christmasSwitch.uncheck();
      assert.equal(
        await page2.evaluate(() => document.documentElement.dataset.theme),
        'teal',
      );
      await christmasSwitch.check();
      assert.equal(
        await page2.evaluate(() => document.documentElement.dataset.theme),
        'natal',
      );

      const reducedToggle = page2.getByRole('checkbox', {
        name: 'Reduzir animações decorativas',
      });
      await expect(reducedToggle).not.toBeChecked();
      await reducedToggle.check();
      assert.equal(
        await page2.evaluate(() => document.documentElement.dataset.reducedMotion),
        'true',
      );

      await ctx2.close();
      assert.deepEqual(errors, []);
    } catch (err) {
      console.error('TEST FAILURE:', err);
      throw err;
    } finally {
      await ctx1?.close().catch(() => {});
      await ctx2?.close().catch(() => {});
      await browser?.close().catch(() => {});
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await fixture.stop();
    }
  },
);
