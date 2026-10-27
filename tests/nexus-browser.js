'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const express = require('express'),
  { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { installCanvasCamera } = require('./camera-fixture');
const config = require('../src/lib/games/nexus-config.ts');

test(
  'Nexus loads only on demand, preserves live media and works in both layouts and launch modes',
  { timeout: 150000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const s = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 10857, appOrigin: origin });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH ||
          (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      await fs.mkdir('artifacts/nexus', { recursive: true });
      for (const mode of ['website', 'embedded', 'desktop'])
        await t.test(mode, async () => {
          const email = `nexus-${mode}@example.test`;
          await fixture.call('signup', { email, nickname: 'Nexus ' + mode, password: 'Senha12!' });
          await fixture.call('verify', {
            token_hash: [...fixture.links.keys()].at(-1),
            type: 'signup',
          });
          const { data } = await fixture.call('login', { email, password: 'Senha12!' });
          const context = await browser.newContext({
            viewport: { width: 1440, height: 960 },
            permissions: ['microphone', 'camera'],
          });
          let remoteRequests = 0;
          await context.route('**/*', async (route) => {
            const url = new URL(route.request().url());
            if (url.hostname === '127.0.0.1') {
              return route.continue();
            }
            if (['itch.io', 'semchakra10.itch.io'].includes(url.hostname)) {
              remoteRequests++;
              return route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><h1>Nexus remoto simulado</h1>',
              });
            }
            return route.abort();
          });
          await context.addInitScript(installCanvasCamera, { display: true });
          await context.addInitScript(
            ({ base, data, mode }) => {
              if (window !== window.top) return;
              window.TRONO_BACKEND_URL = base;
              sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
              localStorage.setItem('tronoMusicEnabled', '0');
              localStorage.setItem('tronoSfxEnabled', '0');
              localStorage.setItem('mnDesktopNoiseMode', 'native');
              if (mode === 'website') window.TronoNexusConfig = { embedUrl: '' };
              if (mode === 'desktop')
                window.TronoDesktop = {
                  version: '0.2.15',
                  clipsSuspended: true,
                  openNexus: async () => {
                    window.__nexusOpened = (window.__nexusOpened || 0) + 1;
                    return { opened: true };
                  },
                  readSession: async () => null,
                  saveSession: async () => {},
                  getMediaPermissions: async () => ['audio', 'video'],
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
            { base: fixture.base, data, mode },
          );
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          page.setDefaultTimeout(12000);
          try {
            await page.goto(origin);
            await page.waitForFunction(() => window.TronoAuth?.ready);
            await page.evaluate(() => window.TronoAuth.ready);
            await page.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
            await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
            await page.evaluate(() => window.TronoCallToolbar.activate('cameraBtn'));
            await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
            await page.evaluate(() => window.TronoSocial.startScreenShare());
            await expect
              .poll(() => page.evaluate(() => window.TronoSocial.screenSharing))
              .toBe(true);
            const snapshot = () =>
              page.evaluate(() => ({
                socket: window.TronoNetwork.clientId,
                room: window.TronoNetwork.primaryRoom,
                voice: window.TronoSocial.voiceJoined,
                audio: window.TronoSocial.getLocalAudioTrack()?.id,
                camera: window.TronoSocial.getMediaSources()
                  .find((s) => s.self)
                  ?.camera?.getVideoTracks()[0]?.id,
                screen: window.TronoSocial.getLocalDisplayStream()?.getVideoTracks()[0]?.id,
              }));
            const before = await snapshot();
            assert(before.audio && before.camera && before.screen);
            await page.evaluate(() => window.TronoGames.openLibrary());
            await expect(page.locator('#gamesScreen [data-game]')).toHaveCount(7);
            await page.locator('#gamesScreen [data-game=nexus]').click();
            await expect(page.locator('#nexusScreen')).toBeVisible();
            assert.equal(remoteRequests, 0);
            await expect(page.locator('#nexusFrame')).toHaveCount(0);
            if (mode === 'website') {
              const popupPromise = context.waitForEvent('page');
              await page.locator('#nexusLaunch').click();
              const popup = await popupPromise;
              await popup.waitForLoadState();
              assert.equal(popup.url(), config.pageUrl);
              assert.equal(await popup.evaluate(() => window.opener), null);
              await popup.close();
            } else if (mode === 'desktop') {
              await page.locator('#nexusLaunch').click();
              await expect(page.locator('#nexusStatus')).toContainText('janela do jogo');
              assert.equal(await page.evaluate(() => window.__nexusOpened), 1);
              assert.equal(remoteRequests, 0);
            } else {
              await page.locator('#nexusLaunch').click();
              await expect(page.frameLocator('#nexusFrame').locator('h1')).toHaveText(
                'Nexus remoto simulado',
              );
              const child = page.frames().find((f) => f.url().includes('embed-upload'));
              assert.equal(await child.evaluate(() => typeof window.TronoDesktop), 'undefined');
              assert.equal(await child.evaluate(() => document.referrer), '');
              await assert.rejects(
                child.evaluate(() => window.parent.localStorage.getItem('mn-auth-session-v1')),
              );
              await page.locator('#nexusFullscreen').click();
              await expect
                .poll(() => page.evaluate(() => document.fullscreenElement?.id))
                .toBe('nexusScreen');
              await page.locator('#nexusFullscreen').click();
              await page.locator('#nexusBack').click();
              await page.locator('#gamesScreen [data-game=nexus]').click();
              assert.equal(remoteRequests, 1); // Returning does not start a second game.
              page.once('dialog', (dialog) => dialog.dismiss());
              await page.locator('#nexusClose').click();
              await expect(page.locator('#nexusFrame')).toHaveCount(1);
              page.once('dialog', (dialog) => dialog.accept());
              await page.locator('#nexusClose').click();
              await expect(page.locator('#nexusFrame')).toHaveCount(0);
            }
            for (const layout of ['corte']) {
              for (const width of [1440, 1024, 720, 480, ...(mode === 'desktop' ? [] : [360])]) {
                await page.setViewportSize({ width, height: 960 });
                assert(
                  await page
                    .locator('#nexusScreen')
                    .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
                  `${mode}/${layout}/${width} overflow`,
                );
              }
              await page.setViewportSize({ width: 1440, height: 960 });
              await page.screenshot({ path: `artifacts/nexus/${mode}-${layout}.png` });
              await page.locator('#nexusBack').click();
              await expect(page.locator('#gamesScreen')).toBeVisible();
              await page.locator('#gamesScreen [data-game=nexus]').click();
              assert.deepEqual(await snapshot(), before);
            }
            await page.evaluate(() => window.TronoGames.openLibrary());
            await expect(page.locator('#nexusScreen')).toBeHidden();
            assert.deepEqual(await snapshot(), before);
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        });
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
