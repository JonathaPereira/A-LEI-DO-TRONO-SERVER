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
            await page.evaluate(() => window.TronoPortal.showPortal());
            await expect(page.locator('#portalIdentity')).toHaveValue('Portal Humano');
            await expect(page.locator('#portalIdentity')).toHaveAttribute('readonly', '');
            await expect(page.locator('#portalPlayerLabel')).toHaveText('Portal Humano');
            await page.evaluate(() => {
              window.__portalHosts = [
                'portalScreen',
                'portalIdentity',
                'portalMusicVolume',
                'portalMusicBtn',
                'portalCreditsDialog',
              ].map((id) => document.getElementById(id));
              window.__portalOwner = window.TronoPortal;
            });
            if (!desktop) await page.locator('#portalScreen .track-btn[data-track="rock"]').click();
            else
              await page.evaluate(() =>
                document.querySelector('#portalScreen .track-btn[data-track=rock]').click(),
              );
            await expect(page.locator('#portalNowPlaying')).toContainText('Kistol');
            if (!desktop) await page.locator('#portalMusicVolume').fill('17');
            else
              await page.evaluate(() => {
                document.getElementById('portalMusicVolume').value = '17';
              });
            await page.locator('#portalMusicVolume').dispatchEvent('input');
            await expect(page.locator('#portalMusicVolumeValue')).toHaveText('17%');
            for (const key of ['Escape', 'button']) {
              if (!desktop) await page.locator('#portalCreditsBtn').click();
              else await page.evaluate(() => window.TronoPortal.setCredits(true));
              await expect(page.locator('#portalCreditsDialog')).toBeVisible();
              if (key === 'Escape') await page.keyboard.press('Escape');
              else await page.locator('#portalCreditsDialog button').click();
              await expect(page.locator('#portalCreditsDialog')).toBeHidden();
            }
            await page.locator('#gamePortalCard').focus();
            await page.keyboard.press('Enter');
            await expect(page.locator('#gamesScreen')).toBeVisible();
            await page.evaluate(() => window.TronoPortal.openGame(true));
            await expect(page.locator('#setupScreen')).toBeVisible();
            await expect(page.locator('#playerIdentity')).toHaveValue('Portal Humano');
            await page.locator('#backFromLobbyBtn').click();
            await expect(page.locator('#portalScreen')).toBeVisible();
            await page.locator('#openVoicePortalBtn').click();
            await expect(page.locator('body')).toHaveClass(/chat-only-active/);
            await expect(page.locator('#callWorkspace')).toBeVisible();
            await page.evaluate(() => window.TronoPortal.showPortal());
            // Cancel the real chat entry while its channel refresh is still waiting.
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
            assert(
              await page.evaluate(
                () =>
                  window.TronoPortal === window.__portalOwner &&
                  window.__portalHosts.every(
                    (node) =>
                      node.isConnected &&
                      document.getElementById(node.id) === node &&
                      document.querySelectorAll('#' + node.id).length === 1,
                  ),
              ),
            );
            await page.evaluate(() => window.TronoPortal.showPortal());
            await expect(page.locator('#portalMusicVolume')).toHaveValue('17');
            await expect(page.locator('#portalNowPlaying')).toContainText('Kistol');
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#authDialog')).toBeVisible();
            await page.locator('#authCloseBtn').click();
            await expect(page.locator('#portalPlayerLabel')).toHaveText('Visitante');
            await page.locator('#openGuestGameBtn').click();
            await expect(page.locator('#guestDialog')).toBeVisible();
            await page.locator('#guestNickname').fill(desktop ? 'Visita Desktop' : 'Visita Web');
            await page.locator('#guestSubmit').click();
            await expect(page.locator('#guestDialog')).toBeHidden();
            await expect(page.locator('#gamesScreen')).toBeVisible();
            await page.evaluate(() => window.TronoPortal.showPortal());
            await expect(page.locator('#portalPlayerLabel')).toContainText('Convidado');
            await expect(page.locator('#portalIdentity')).not.toHaveAttribute('readonly', '');
            await page.locator('#openVoicePortalBtn').click();
            await expect(page.locator('#authDialog')).toBeVisible();
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
