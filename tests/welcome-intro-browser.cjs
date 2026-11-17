'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

// Minimal valid 1x1 animated GIF payload served locally by the test HTTP server.
const TINY_GIF_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

test(
  'welcome intro renders user name, animated GIF avatar, background sync, skip, and replay',
  { timeout: 60000 },
  async () => {
    const avatarFileId = '23000000-0000-4000-8000-000000000099';
    let appOrigin = '';
    const server = await new Promise((resolve) => {
      const app = express();
      app.get('/test-avatar.gif', (_req, res) => {
        res.type('image/gif').send(TINY_GIF_BYTES);
      });
      app.use(express.static(path.resolve(__dirname, '../out')));
      const listener = app.listen(0, '127.0.0.1', () => {
        appOrigin = 'http://127.0.0.1:' + listener.address().port;
        resolve(listener);
      });
    });

    const fixture = await startFixture({ port: 11993, appOrigin });
    let browser;
    const errors = [];

    try {
      await fixture.registerAccount({
        email: 'jonathapereira.jj@gmail.com',
        nickname: 'Rei do Trono',
        password: 'Senha12!',
      });
      fixture.users.get('jonathapereira.jj@gmail.com').avatar_file_id = avatarFileId;
      const loginData = (
        await fixture.call('login', {
          email: 'jonathapereira.jj@gmail.com',
          password: 'Senha12!',
        })
      ).data;

      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await context.route('**/files/' + avatarFileId + '/url', (route) =>
        route.fulfill({
          json: {
            url: appOrigin + '/test-avatar.gif',
            expiresAt: Date.now() + 3600000,
          },
        }),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
        },
        { base: fixture.base, data: loginData },
      );

      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(appOrigin, { waitUntil: 'domcontentloaded' });

      const intro = page.locator('[data-welcome-intro]');
      await expect(intro).toBeVisible();
      await expect(intro).toContainText('M&N · A Lei do Trono');
      await expect(intro).toContainText('Bem vindo, Rei do Trono');
      await expect(intro).toContainText('Criador da Corte');

      const gifAvatar = intro.locator('img.profile-avatar-photo');
      await expect(gifAvatar).toBeVisible();
      const src = await gifAvatar.getAttribute('src');
      assert(
        src && src.endsWith('/test-avatar.gif'),
        'Expected animated GIF avatar URL, got: ' + src,
      );

      // Underlying app stays mounted so channels/chat finish loading behind the overlay.
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();

      // Dismiss early via button and verify replay inside user menu.
      await intro.getByRole('button', { name: 'Entrar agora' }).click();
      await expect(intro).toHaveCount(0);

      await page.getByRole('button', { name: 'Meu perfil', exact: true }).click();
      await page.getByRole('button', { name: 'Rever boas-vindas', exact: true }).click();
      await expect(intro).toBeVisible();
      await expect(intro).toContainText('Bem vindo, Rei do Trono');

      // Escape key also dismisses immediately.
      await page.keyboard.press('Escape');
      await expect(intro).toHaveCount(0);

      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
