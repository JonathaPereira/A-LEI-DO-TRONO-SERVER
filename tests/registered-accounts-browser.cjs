'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { presentAccount, restoreAccount } = require('./auth-presentation-fixture.cjs');

test(
  'the creator directory preserves pagination and clears private rows on close, permission loss and logout in both hosts',
  { timeout: 150000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const listener = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser;
    try {
      fixture = await startFixture({ port: 10963, appOrigin: origin });
      const creator = 'jonathapereira.jj@gmail.com',
        member = 'directory-member@example.test';
      for (const [email, nickname] of [
        [creator, 'Criador'],
        [member, 'Membro'],
      ]) {
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
      }
      const rows = Array.from({ length: 51 }, (_, index) => ({
        id: '23000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
        nickname: index ? 'Conta ' + index : '<img src=x onerror=alert(1)>',
        email: 'private-' + index + '@example.test',
        confirmed: index % 2 === 0,
      }));
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--mute-audio'],
      });
      for (const native of [false, true])
        await t.test(native ? 'desktop directory' : 'web directory', async () => {
          const initial = (await fixture.call('login', { email: creator, password: 'Senha12!' }))
            .data;
          const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
          const errors = [],
            requests = [];
          let held = null,
            hold = false,
            failPage = false;
          try {
            await context.route('**/*', (route) =>
              new URL(route.request().url()).hostname === '127.0.0.1'
                ? route.continue()
                : route.abort(),
            );
            await context.route('**/community/registered-accounts?*', (route) => {
              const offset = Number(new URL(route.request().url()).searchParams.get('offset'));
              requests.push(offset);
              if (hold) {
                hold = false;
                held = route;
                return;
              }
              if (failPage && offset)
                return route.fulfill({
                  status: 503,
                  json: { error: { message: 'Página indisponível' } },
                });
              return route.fulfill({
                json: {
                  accounts: rows.slice(offset, offset + 50),
                  hasMore: offset === 0,
                  nextOffset: Math.min(51, offset + 50),
                },
              });
            });
            await context.addInitScript(
              ({ base, initial, native }) => {
                window.TRONO_BACKEND_URL = base;
                sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
                localStorage.setItem('tronoSfxEnabled', '0');
                localStorage.setItem('tronoMusicEnabled', '0');
                if (native)
                  window.TronoDesktop = {
                    version: '0.2.10',
                    clipsSuspended: true,
                    readSession: async () => null,
                    saveSession: async () => {},
                    getMediaPermissions: async () => ['audio', 'video'],
                    onCapture: () => {},
                    onCaptureCancel: () => {},
                    onApplicationAudio: () => {},
                    configureClips: async () => ({ suspended: true }),
                    getWindowState: async () => ({ fullscreen: false }),
                    onWindowState: () => {},
                    getUpdateState: async () => ({ status: 'idle' }),
                    onUpdateState: () => {},
                  };
              },
              { base: fixture.base, initial, native },
            );
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(origin);
            await page.waitForFunction(() => window.TronoAuth?.ready && window.TronoProfile);
            await page.evaluate(() => window.TronoAuth.ready);
            await page.evaluate(() => window.TronoProfile.open());
            await expect(page.locator('#profileNickname')).toBeEnabled();
            const profileButton = page.locator('#profileCreatorHost button');
            await expect(profileButton).toBeVisible();
            await profileButton.click();
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(50);
            await expect(
              page.locator('#creatorAccountsList tr').first().locator('td').first(),
            ).toHaveText('<img src=x onerror=alert(1)>');
            await expect(page.locator('#creatorAccountsList img')).toHaveCount(0);
            failPage = true;
            await page.locator('#creatorAccountsMore').click();
            await expect(page.locator('#creatorAccountsStatus')).toHaveText('Página indisponível');
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(50);
            failPage = false;
            await page.locator('#creatorAccountsMore').click();
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(51);
            await expect(page.locator('#creatorAccountsMore')).toBeHidden();
            assert.deepEqual(requests, [0, 50, 50]);
            await page.keyboard.press('Escape');
            await expect(page.locator('#creatorAccountsDialog')).toBeHidden();
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(0);
            await expect(
              page.locator(native ? '#desktopSettingsDialog' : '#profileDialog'),
            ).toBeVisible();
            await profileButton.click();
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(50);
            hold = true;
            await page.locator('#creatorAccountsMore').click();
            await expect.poll(() => !!held).toBe(true);
            await presentAccount(page, { permissions: { viewEmails: false } });
            await expect(page.locator('#creatorAccountsDialog')).toBeHidden();
            await expect(profileButton).toBeHidden();
            await expect(page.locator('#creatorAccountsBtn')).toBeHidden();
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(0);
            await held
              .fulfill({ json: { accounts: rows.slice(50), hasMore: false, nextOffset: 51 } })
              .catch(() => {});
            held = null;
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(0);
            await restoreAccount(page);
            await expect(profileButton).toBeVisible();
            // The header launcher lives in a moved host and shares the same dialog/controller.
            await page.evaluate(
              (native) =>
                native
                  ? window.TronoDesktopSettings.close()
                  : document.getElementById('profileDialog').close(),
              native,
            );
            await page.evaluate(() => window.TronoAppLayout.navigate('community'));
            await page.locator('#workspaceTools summary').click();
            await page.locator('#creatorAccountsBtn').click();
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(50);
            assert.equal(await page.locator('#creatorAccountsDialog').count(), 1);
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#creatorAccountsList tr')).toHaveCount(0);
            await expect(page.locator('#creatorAccountsDialog')).toBeHidden();
            await page.locator('#authEmail').fill(member);
            await page.locator('#authPassword').fill('Senha12!');
            await page.locator('#authSubmitBtn').click();
            await expect(page.locator('#authDialog')).toBeHidden();
            await page.evaluate(() => window.TronoProfile.open());
            await expect(profileButton).toBeHidden();
            assert.deepEqual(errors, []);
          } finally {
            if (held) await held.abort().catch(() => {});
            await context.close();
          }
        });
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
