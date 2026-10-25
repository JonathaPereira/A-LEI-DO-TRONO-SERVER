'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

const dimensions = [
  'sidebar-width',
  'sidebar-height',
  'strip-height',
  'chat-width',
  'chat-height',
  'people-width',
  'people-height',
  'center-height',
];
const legacyLayout = JSON.stringify(Object.fromEntries(dimensions.map((name) => [name, 333])));

test(
  'appearance controls survive settings placement and isolate account preferences',
  {
    timeout: 150000,
  },
  async (t) => {
    const server = await new Promise((resolve) => {
      const listening = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(listening));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser;
    try {
      fixture = await startFixture({ port: 10897, appOrigin: origin });
      const accounts = [];
      for (const [email, nickname] of [
        ['appearance-first@example.test', 'Aparência Um'],
        ['appearance-second@example.test', 'Aparência Dois'],
      ]) {
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        accounts.push((await fixture.call('login', { email, password: 'Senha12!' })).data);
      }
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      for (const native of [false, true]) {
        await t.test(native ? 'desktop settings' : 'web profile', async () => {
          const context = await browser.newContext({
            viewport: { width: 1440, height: 1000 },
            permissions: ['microphone'],
          });
          const errors = [];
          try {
            // Each surface needs its own session; the preceding case logs out for real.
            const initialData = (
              await fixture.call('login', {
                email: 'appearance-first@example.test',
                password: 'Senha12!',
              })
            ).data;
            await context.route('**/*', (route) =>
              new URL(route.request().url()).hostname === '127.0.0.1'
                ? route.continue()
                : route.abort(),
            );
            await context.addInitScript(
              ({ base, accounts, native, legacyLayout }) => {
                window.TRONO_BACKEND_URL = base;
                // Seed once: reloads and real logout/login must retain the page's latest account.
                if (!sessionStorage.getItem('appearance-fixture-seeded')) {
                  sessionStorage.setItem('appearance-fixture-seeded', '1');
                  sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(accounts[0]));
                  for (const [index, account] of accounts.entries()) {
                    localStorage.setItem('mnTheme:' + account.user.id, index ? 'green' : 'purple');
                    localStorage.setItem('mnPanelLayout:' + account.user.id, legacyLayout);
                    localStorage.setItem(
                      'mn-personal:' + account.user.id,
                      JSON.stringify({
                        appLayout: 'original',
                        'mute:keep-this-preference': true,
                      }),
                    );
                  }
                  localStorage.setItem('mnPanelLayout:guest', legacyLayout);
                  localStorage.setItem('tronoSfxEnabled', '0');
                  localStorage.setItem('tronoMusicEnabled', '0');
                  localStorage.setItem('tronoNoiseSuppression', '0');
                }
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
                    checkUpdates: async () => ({ status: 'current' }),
                  };
              },
              { base: fixture.base, accounts: [initialData, accounts[1]], native, legacyLayout },
            );
            const page = await context.newPage();
            page.setDefaultTimeout(12000);
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('dialog', (dialog) => dialog.accept());
            const firstId = accounts[0].user.id,
              secondId = accounts[1].user.id;
            async function ready(accountId) {
              await page.waitForFunction(() => window.TronoAuth?.ready);
              await page.evaluate(() => window.TronoAuth.ready);
              await expect
                .poll(() => page.evaluate(() => window.TronoAuth.user?.id))
                .toBe(accountId);
              await expect(page.locator('[data-panel-resize]')).toHaveCount(0);
              assert.deepEqual(
                await page.evaluate(
                  (names) =>
                    names.map((name) =>
                      document.documentElement.style.getPropertyValue('--layout-' + name),
                    ),
                  dimensions,
                ),
                dimensions.map(() => ''),
                'obsolete sizes must not be reapplied on startup or account change',
              );
            }
            async function openAppearance() {
              await page.evaluate(() => window.TronoCallSettings.open('appearance'));
              await expect(page.locator('[name="profileTheme"][value="teal"]')).toBeVisible();
            }
            async function closeAppearance() {
              await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
            }
            async function storage() {
              return page.evaluate(
                ([firstId, secondId]) =>
                  Object.fromEntries(
                    [
                      'mnTheme:' + firstId,
                      'mnTheme:' + secondId,
                      'mn-personal:' + firstId,
                      'mn-personal:' + secondId,
                      'mnPanelLayout:' + firstId,
                      'mnPanelLayout:' + secondId,
                      'mnPanelLayout:guest',
                    ].map((key) => [key, localStorage.getItem(key)]),
                  ),
                [firstId, secondId],
              );
            }
            await page.goto(origin);
            await ready(firstId);
            await page.locator('button[data-voice-channel]').first().click();
            await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
            await page.evaluate(() => {
              window.__appearanceCall = {
                microphone: window.TronoSocial.getLocalAudioTrack(),
                network: window.TronoNetwork,
                clientId: window.TronoNetwork.clientId,
              };
            });
            await openAppearance();
            await page.evaluate(() => {
              window.__appearanceControls = [...document.querySelectorAll('[name="profileTheme"]')];
            });
            await page.locator('[name="profileTheme"][value="teal"]').check();
            await expect(page.locator('html')).toHaveAttribute('data-theme', 'teal');
            await expect(page.locator('#appearanceMessage')).toHaveText('Tema aplicado.');
            await expect(page.locator('#gameSurface')).toHaveAttribute('data-theme', 'teal');
            assert.equal(
              await page
                .locator('#gameSurface')
                .evaluate((el) => getComputedStyle(el).getPropertyValue('--theme-accent').trim()),
              '#5fddcc',
            );
            await page.locator('[data-settings-tab=audio]').click();
            await page.locator('[data-settings-tab=appearance]').click();
            await closeAppearance();
            await openAppearance();
            assert.equal(
              await page.evaluate(() => {
                const current = [...document.querySelectorAll('[name="profileTheme"]')];
                return (
                  current.length === window.__appearanceControls.length &&
                  current.every((node, index) => node === window.__appearanceControls[index])
                );
              }),
              true,
              'theme and layout radios retain their nodes when settings move their containers',
            );
            await expect(page.locator('[name="profileTheme"][value="teal"]')).toBeChecked();
            assert.equal((await storage())['mnTheme:' + firstId], 'teal');
            assert.equal((await storage())['mnTheme:' + secondId], 'green');
            assert.equal(
              await page.evaluate(() => {
                const call = window.__appearanceCall;
                return (
                  window.TronoSocial.voiceJoined &&
                  window.TronoSocial.getLocalAudioTrack() === call.microphone &&
                  call.microphone.readyState === 'live' &&
                  window.TronoNetwork === call.network &&
                  window.TronoNetwork.connected &&
                  window.TronoNetwork.clientId === call.clientId
                );
              }),
              true,
              'changing appearance and resetting geometry must preserve the existing call',
            );
            await closeAppearance();
            await page.reload();
            await ready(firstId);
            await expect(page.locator('html')).toHaveAttribute('data-theme', 'teal');
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#authEmail')).toBeVisible();
            await page.locator('#authEmail').fill('appearance-second@example.test');
            await page.locator('#authPassword').fill('Senha12!');
            await page.locator('#authSubmit').click();
            await expect
              .poll(() => page.evaluate(() => window.TronoAuth.user?.email))
              .toBe('appearance-second@example.test');
            await ready(secondId);
            await expect(page.locator('html')).toHaveAttribute('data-theme', 'green');
            await openAppearance();
            await expect(page.locator('[name="profileTheme"][value="green"]')).toBeChecked();
            assert.equal((await storage())['mnPanelLayout:' + secondId], legacyLayout);
            await page.locator('[name="profileTheme"][value="rose"]').check();
            assert.equal((await storage())['mnTheme:' + firstId], 'teal');
            assert.equal((await storage())['mnTheme:' + secondId], 'rose');
            await closeAppearance();
            await page.reload();
            await ready(secondId);
            await expect(page.locator('html')).toHaveAttribute('data-theme', 'rose');
            assert.equal((await storage())['mnPanelLayout:' + secondId], legacyLayout);
            if (native) {
              await page.evaluate(() => window.TronoAuth.logout());
              await page.evaluate(() => window.TronoCallSettings.open('appearance'));
              await expect(page.locator('[name="profileTheme"][value="purple"]')).toBeChecked();
              assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
              assert.equal((await storage())['mnTheme:' + secondId], 'rose');
            }
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        });
      }
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
