'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'portal React controls preserve identity, audio hosts, navigation and guest access',
  { timeout: 120000 },
  async (t) => {
    const server = express()
      .use(express.static(path.resolve(__dirname, '../out')))
      .listen(10894, '127.0.0.1');
    const origin = 'http://127.0.0.1:10894';
    let fixture, browser;
    const errors = [];
    try {
      fixture = await startFixture({ port: 10893, appOrigin: origin });
      await fixture.call('signup', {
        email: 'portal@example.test',
        nickname: 'Portal Humano',
        password: 'Senha12!',
      });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
      });
      for (const desktop of [false, true])
        await t.test(desktop ? 'desktop adapter' : 'website', async () => {
          const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
          try {
            await context.route('**/*', (route) =>
              new URL(route.request().url()).hostname === '127.0.0.1'
                ? route.continue()
                : route.abort(),
            );
            const data = (
              await fixture.call('login', { email: 'portal@example.test', password: 'Senha12!' })
            ).data;
            await context.addInitScript(
              ({ base, data, desktop }) => {
                window.TRONO_BACKEND_URL = base;
                if (data) sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
                localStorage.setItem('tronoMusicEnabled', '0');
                localStorage.setItem('tronoSfxEnabled', '0');
                if (desktop)
                  window.TronoDesktop = {
                    version: '0.13.0-alpha',
                    clipsSuspended: true,
                    readSession: async () => null,
                    saveSession: async () => {},
                    getWindowState: async () => ({ fullscreen: false }),
                    onWindowState: () => {},
                    onUpdateState: () => {},
                    getUpdateState: async () => ({ status: 'idle' }),
                    onApplicationAudio: () => {},
                    configureClips: async () => ({ suspended: true }),
                    onCapture: () => {},
                    onCaptureCancel: () => {},
                  };
              },
              { base: fixture.base, data, desktop },
            );
            const page = await context.newPage();
            page.on('pageerror', (e) => errors.push(e.message));
            await page.goto(origin);
            await page.waitForFunction(() => window.TronoAuth?.ready);
            await page.evaluate(() => window.TronoAuth.ready);
            await expect(page.locator('#chatOnlyScreen')).toBeVisible();
            assert.equal(
              await page.evaluate(() => window.TronoAuth.user.nickname),
              'Portal Humano',
            );
            await page.evaluate(() => {
              window.__portalOwner = window.TronoPortal;
              window.__networkOwner = window.TronoNetwork;
            });
            await page.getByRole('button', { name: 'Biblioteca de jogos', exact: false }).click();
            await expect(page.locator('#gamesScreen [data-game]')).toHaveCount(9);
            await page.locator('[data-game=throne]').click();
            await expect(page.locator('#setupScreen')).toBeVisible();
            await expect(page.locator('#playerIdentity')).toHaveValue('Portal Humano');
            await page.locator('#backFromLobbyBtn').click();
            await expect(page.locator('#chatOnlyScreen')).toBeVisible();
            assert.equal(
              await page.evaluate(() => window.TronoAuth.user.nickname),
              'Portal Humano',
            );
            await page.evaluate(() => window.TronoCallSettings.open('game'));
            await page.getByLabel('Trilha sonora').selectOption('rock');
            await expect(page.getByLabel('Trilha sonora')).toHaveValue('rock');
            await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
            await page.evaluate(() => {
              const original = window.TronoCommunityAdmin.refresh;
              window.TronoCommunityAdmin.refresh = () =>
                new Promise((resolve) => {
                  window.__releasePortal = () => {
                    window.TronoCommunityAdmin.refresh = original;
                    resolve();
                  };
                });
              window.__openingPortal = window.TronoPortal.openVoice();
            });
            await page.waitForFunction(() => window.__releasePortal);
            await page.evaluate(() => window.TronoPortal.showOnly('gamesScreen'));
            assert.equal(
              await page.evaluate(async () => {
                window.__releasePortal();
                return window.__openingPortal;
              }),
              false,
            );
            await expect(page.locator('#gamesScreen')).toBeVisible();
            assert.equal(
              await page.evaluate(
                () =>
                  window.__portalOwner === window.TronoPortal &&
                  window.__networkOwner === window.TronoNetwork,
              ),
              true,
            );
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#portalScreen')).toBeVisible();
            await expect(page.locator('#authEmail')).toBeVisible();
            await page.getByRole('button', { name: 'Jogar como convidado' }).click();
            await page.locator('#guestNickname').fill(desktop ? 'Visita Desktop' : 'Visita Web');
            await page.getByRole('button', { name: 'Escolher um jogo', exact: true }).click();
            await expect(page.locator('#gamesScreen')).toBeVisible();
            assert.equal(await page.evaluate(() => !!window.TronoAuth.guest), true);
            await page.evaluate(() => window.TronoPortal.openVoice());
            await expect(page.getByRole('dialog', { name: 'Acesso à conta' })).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(page.locator('#gamesScreen')).toBeVisible();
          } finally {
            await context.close();
          }
        });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
