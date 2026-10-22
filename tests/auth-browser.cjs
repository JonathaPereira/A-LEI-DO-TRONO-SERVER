'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const path = require('node:path'),
  express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'account forms preserve signup, one-use confirmation, login, recovery and guest restoration',
  { timeout: 90000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const listening = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(listening));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser;
    try {
      fixture = await startFixture({ port: 10923, appOrigin: origin });
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        args: ['--no-sandbox', '--mute-audio'],
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('tronoSfxEnabled', '0');
      }, fixture.base);
      const page = await context.newPage(),
        errors = [],
        secrets = [],
        leaked = [];
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (request.resourceType() === 'document') return;
        if (
          secrets.some(
            (secret) =>
              request.url().includes(secret) || request.headers().referer?.includes(secret),
          )
        )
          leaked.push(request.resourceType());
      });
      const ready = async () => {
        await page
          .waitForFunction(() => window.TronoAuth?.ready)
          .catch(async (error) => {
            throw new Error(
              'Account startup: ' +
                JSON.stringify({
                  errors,
                  notice: await page.locator('.application-load-error').allTextContents(),
                }),
              { cause: error },
            );
          });
        await page.evaluate(() => window.TronoAuth.ready);
      };
      const email = 'migration-auth@example.test';
      await page.goto(origin);
      await ready();
      const { version } = require('../electron/package.json');
      const installer = `MN-Trono-${version}-Windows.exe`;
      await expect(page.locator('meta[name="mn-desktop-version"]')).toHaveAttribute(
        'content',
        version,
      );
      await expect(page.locator('#authDesktopDownload')).toHaveAttribute('download', installer);
      await expect(page.locator('#authDesktopDownload')).toHaveAttribute(
        'href',
        `https://a-lei-do-trono.surge.sh/downloads/${installer}`,
      );
      await t.test(
        'signup checks the password and requires email confirmation before login',
        async () => {
          await page.locator('#authSignupBtn').click();
          await page.locator('#authNickname').fill('Conta Teste');
          await page.locator('#authEmail').fill(email);
          await page.locator('#authPassword').fill('Senha123');
          await page.locator('#authConfirm').fill('Senha123');
          await page.locator('#authSubmitBtn').click();
          await expect(page.locator('#authMessage')).toContainText('todos os requisitos');
          await page.locator('#authPassword').fill('Senha12!');
          await page.locator('#authConfirm').fill('Senha12!');
          await page.locator('#authSubmitBtn').click();
          await expect(page.locator('#authTitle')).toHaveText('Bem-vindo de volta');
          await expect(page.locator('#authEmail')).toHaveValue(email);
          assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
          assert.equal((await fixture.call('login', { email, password: 'Senha12!' })).status, 403);
        },
      );
      await t.test(
        'query token is sanitized, kept out of asset referrers and verified exactly once',
        async () => {
          const token = [...fixture.links].find(
            ([, link]) => link.type === 'signup' && link.user.email === email,
          )[0];
          secrets.push(token);
          await page.goto(
            origin + '/?keep=1&token_hash=' + encodeURIComponent(token) + '&type=signup',
          );
          await ready();
          assert.equal(page.url(), origin + '/?keep=1');
          await expect(page.locator('#authTitle')).toHaveText('Bem-vindo de volta');
          assert.equal(await page.evaluate(() => window.TronoAuthCallback), undefined);
          assert.equal(
            await page.evaluate(() => sessionStorage.getItem('mn-auth-session-v1')),
            null,
          );
          assert.equal(
            (await fixture.call('verify', { token_hash: token, type: 'signup' })).status,
            401,
          );
          assert.deepEqual(leaked, []);
        },
      );
      await t.test(
        'login and logout keep the current session in the tab and revoke the refresh token',
        async () => {
          await page.locator('#authEmail').fill(email);
          await page.locator('#authPassword').fill('Senha12!');
          await page.locator('#authSubmitBtn').click();
          await expect(page.locator('#authDialog')).toBeHidden();
          assert.equal(await page.evaluate(() => window.TronoAuth.user.nickname), 'Conta Teste');
          const saved = await page.evaluate(() =>
            JSON.parse(sessionStorage.getItem('mn-auth-session-v1')),
          );
          await page.evaluate(() => window.TronoAuth.logout());
          await expect(page.locator('#authDialog')).toBeVisible();
          assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
          assert.equal(
            (await fixture.call('refresh', { refresh_token: saved.session.refresh_token })).status,
            401,
          );
        },
      );
      await t.test(
        'recovery link opens reset, clears credentials and accepts only the new password',
        async () => {
          await page.locator('#authForgotBtn').click();
          await page.locator('#authEmail').fill(email);
          await page.locator('#authSubmitBtn').click();
          await expect(page.locator('#authMessage')).not.toHaveText('Aguarde…');
          const token = [...fixture.links].find(
            ([, link]) => link.type === 'recovery' && link.user.email === email,
          )[0];
          secrets.push(token);
          await page.goto(origin + '/?token_hash=' + encodeURIComponent(token) + '&type=recovery');
          await ready();
          assert.equal(page.url(), origin + '/');
          await expect(page.locator('#authTitle')).toHaveText('Crie uma nova senha');
          await expect(page.locator('#authEmail')).toBeDisabled();
          await page.locator('#authPassword').fill('NovaSenha34!');
          await page.locator('#authConfirm').fill('NovaSenha34!');
          await page.locator('#authSubmitBtn').click();
          await expect(page.locator('#authTitle')).toHaveText('Bem-vindo de volta');
          assert.equal((await fixture.call('login', { email, password: 'Senha12!' })).status, 401);
          await page.locator('#authEmail').fill(email);
          await page.locator('#authPassword').fill('NovaSenha34!');
          await page.locator('#authSubmitBtn').click();
          await expect(page.locator('#authDialog')).toBeHidden();
          await page.evaluate(() => window.TronoAuth.logout());
          assert.deepEqual(leaked, []);
        },
      );
      await t.test(
        'error callbacks are sanitized and normal navigation hashes are preserved',
        async () => {
          await page.goto(origin + '/?error=expired&error_code=fixture&error_description=private');
          await ready();
          assert.equal(page.url(), origin + '/');
          await expect(page.locator('#authTitle')).toHaveText('Recupere sua senha');
          await expect(page.locator('#authMessage')).toContainText('link expirou');
          await page.goto(origin + '/#normal-navigation');
          await ready();
          assert.equal(new URL(page.url()).hash, '#normal-navigation');
        },
      );
      await t.test('guest ticket survives reload without creating a member session', async () => {
        await page.evaluate(() => window.TronoAuth.open('login'));
        await page.locator('#authGuestBtn').click();
        await page.locator('#guestNickname').fill('Convidado Teste');
        await page.locator('#guestSubmit').click();
        await expect(page.locator('#guestDialog')).toBeHidden();
        await expect(page.locator('#gamesScreen')).toBeVisible();
        const guest = await page.evaluate(() => window.TronoAuth.guest);
        assert(guest.ticket && guest.id);
        assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
        await page.reload();
        await ready();
        await expect(page.locator('#gamesScreen')).toBeVisible();
        assert.equal(await page.evaluate(() => window.TronoAuth.guest.id), guest.id);
        assert.equal(await page.evaluate(() => sessionStorage.getItem('mn-auth-session-v1')), null);
      });
      assert.deepEqual(errors, []);
      await page.evaluate(async () => {
        dispatchEvent(new Event('pagehide'));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.deepEqual(
        await page.evaluate(() => ({ user: window.TronoAuth.user, guest: window.TronoAuth.guest })),
        { user: null, guest: null },
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
