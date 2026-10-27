'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express'),
  path = require('node:path'),
  fs = require('node:fs/promises');
const { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');

test(
  'desktop settings fill their dialog across portrait and short monitors',
  { timeout: 120000 },
  async () => {
    const host = express().use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((resolve) => {
      const listening = host.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 10721, appOrigin: origin });
    let browser;
    const errors = [];
    try {
      await fixture.call('signup', {
        email: 'portrait-settings@example.test',
        nickname: 'Monitor vertical',
        password: 'Senha12!',
      });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (
        await fixture.call('login', {
          email: 'portrait-settings@example.test',
          password: 'Senha12!',
        })
      ).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      const context = await browser.newContext({
        viewport: { width: 1080, height: 1920 },
        permissions: ['microphone', 'camera'],
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
          window.TronoDesktop = {
            version: '0.1.8',
            clipsSuspended: true,
            readSession: async () => null,
            saveSession: async () => {},
            getMediaPermissions: async () => ['audio', 'video'],
            resetMediaPermissions: async () => {
              window.__permissionResets = (window.__permissionResets || 0) + 1;
            },
            onCapture: () => {},
            onCaptureCancel: () => {},
            getWindowState: async () => ({ fullscreen: false }),
            onWindowState: () => {},
            onUpdateState: () => {},
            getUpdateState: async () => ({ status: 'idle' }),
            onApplicationAudio: () => {},
            configureClips: async () => ({ suspended: true }),
          };
        },
        { base: fixture.base, data },
      );
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.evaluate(() => window.TronoCallSettings.open('audio'));
      const dialog = page.locator('dialog[data-topic]');
      await expect(dialog).toBeVisible();
      const topics = await dialog
        .locator('[data-settings-tab]')
        .evaluateAll((tabs) => tabs.map((tab) => tab.dataset.settingsTab));
      const fields = await page.evaluateHandle(() => ({
        input: document.getElementById('voiceInputSelect'),
        form: document.getElementById('profileForm'),
        files: document.getElementById('profileFiles'),
      }));
      await fs.mkdir(path.resolve('artifacts/settings'), { recursive: true });
      for (const size of [
        { width: 1080, height: 1920 },
        { width: 720, height: 1280 },
        { width: 480, height: 520 },
        { width: 900, height: 600 },
        { width: 1280, height: 720 },
      ]) {
        await page.setViewportSize(size);
        for (const topic of topics) {
          await page.evaluate((topic) => window.TronoCallSettings.select(topic), topic);
          await expect(dialog).toHaveAttribute('data-topic', topic);
          const layout = await dialog.evaluate((dialog) => {
            const r = dialog.getBoundingClientRect(),
              fields = dialog.querySelector('[data-settings-fields]'),
              close = dialog
                .querySelector('button[aria-label="Fechar configurações"]')
                .getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              close: { right: close.right, bottom: close.bottom },
              overflow: fields.scrollWidth - fields.clientWidth,
              documentOverflow: document.documentElement.scrollWidth - innerWidth,
            };
          });
          assert(
            layout.x >= 0 &&
              layout.right <= size.width + 1 &&
              layout.y >= 0 &&
              layout.bottom <= size.height + 1,
            JSON.stringify({ size, topic, layout }),
          );
          assert(
            layout.overflow <= 1 && layout.documentOverflow <= 1,
            JSON.stringify({ size, topic, layout }),
          );
          await expect(
            dialog.getByRole('button', { name: 'Fechar configurações', exact: true }),
          ).toBeInViewport();
        }
        await page.screenshot({
          path: 'artifacts/settings/corte-' + size.width + 'x' + size.height + '.png',
        });
      }
      await page.evaluate(() => window.TronoCallSettings.select('privacy'));
      await expect(
        page.getByRole('region', { name: 'Privacidade', exact: true }).getByRole('status'),
      ).toContainText('Microfone: permitido');
      await page
        .getByRole('button', { name: 'Redefinir permissões de microfone e câmera' })
        .click();
      await expect(
        page.getByRole('region', { name: 'Privacidade', exact: true }).getByRole('status'),
      ).toContainText('Permissões redefinidas');
      assert.equal(await page.evaluate(() => window.__permissionResets), 1);
      assert.equal(
        await page.evaluate(
          (fields) =>
            fields.input === document.getElementById('voiceInputSelect') &&
            fields.form === document.getElementById('profileForm') &&
            fields.files === document.getElementById('profileFiles'),
          fields,
        ),
        true,
      );
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await page.evaluate(() => window.TronoCallSettings.open('account'));
      await page.locator('#settingsRemember').check();
      await expect.poll(() => page.evaluate(() => window.TronoAuth.remembered)).toBe(true);
      await page.locator('#settingsRemember').uncheck();
      await expect.poll(() => page.evaluate(() => window.TronoAuth.remembered)).toBe(false);
      await dialog.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      await expect(dialog).toBeHidden();
      await fields.dispose();
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
