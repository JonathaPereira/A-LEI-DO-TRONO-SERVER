'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'desktop shell keeps native controls and updater actions while moving containers',
  {
    timeout: 120000,
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
      fixture = await startFixture({ port: 10898, appOrigin: origin, soundboard: true });
      const email = 'desktop-shell@example.test';
      await fixture.call('signup', { email, nickname: 'Shell', password: 'Senha12!' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const account = (await fixture.call('login', { email, password: 'Senha12!' })).data;
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
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        permissions: ['microphone'],
      });
      try {
        await context.route('**/*', (route) =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort(),
        );
        await context.addInitScript(
          ({ base, account }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(account));
            localStorage.setItem(
              'mn-personal:' + account.user.id,
              JSON.stringify({ appLayout: 'original' }),
            );
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('mnDesktopNoiseMode', 'off');
            const calls = { toggle: 0, check: 0, install: 0 };
            let windowListener, updateListener, resolveWindow, resolveToggle, rejectToggle;
            let resolveCheck;
            let update = { status: 'idle' };
            // Every native action stays inside this page. No Electron IPC or installer is used.
            window.__shellFixture = {
              calls,
              emitWindow(value) {
                windowListener(value);
              },
              resolveInitialWindow(value) {
                resolveWindow(value);
              },
              finishToggle(value) {
                resolveToggle(value);
              },
              failToggle() {
                rejectToggle(new Error('Synthetic fullscreen failure'));
              },
              emitUpdate(value) {
                update = value;
                updateListener(value);
              },
              finishCheck(value) {
                update = value;
                resolveCheck(value);
              },
            };
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
              getWindowState: () =>
                new Promise((resolve) => {
                  resolveWindow = resolve;
                }),
              onWindowState: (listener) => {
                windowListener = listener;
              },
              toggleFullscreen: () => {
                calls.toggle++;
                return new Promise((resolve, reject) => {
                  resolveToggle = resolve;
                  rejectToggle = reject;
                });
              },
              getUpdateState: async () => update,
              onUpdateState: (listener) => {
                updateListener = listener;
              },
              checkUpdates: () => {
                calls.check++;
                return new Promise((resolve) => {
                  resolveCheck = resolve;
                });
              },
              installUpdate: async () => {
                calls.install++;
                return { pending: false };
              },
            };
          },
          { base: fixture.base, account },
        );
        const page = await context.newPage();
        const errors = [];
        page.setDefaultTimeout(12000);
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('dialog', (dialog) => dialog.accept());
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await expect(page.locator('#desktopFullscreen')).toBeVisible();

        await t.test(
          'fullscreen events supersede the initial read and pending toggles settle',
          async () => {
            const fullscreen = page.locator('#desktopFullscreen');
            await page.evaluate(() => window.__shellFixture.emitWindow({ fullscreen: true }));
            await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
            await page.evaluate(() =>
              window.__shellFixture.resolveInitialWindow({ fullscreen: false }),
            );
            // Flush the settled native read and its React projection before checking the newer event.
            await page.evaluate(() => new Promise(requestAnimationFrame));
            await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
            await fullscreen.click();
            await expect(fullscreen).toBeDisabled();
            await page.evaluate(() => window.__shellFixture.finishToggle({ fullscreen: false }));
            await expect(fullscreen).toBeEnabled();
            await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
            await fullscreen.click();
            await expect(fullscreen).toBeDisabled();
            await page.evaluate(() => window.__shellFixture.failToggle());
            await expect(fullscreen).toBeEnabled();
            await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
            await expect(fullscreen).toHaveAttribute('title', /Não foi possível/);
            assert.equal(await page.evaluate(() => window.__shellFixture.calls.toggle), 2);
          },
        );

        await page.locator('#openVoicePortalBtn').click();
        await expect(page.locator('#callWorkspace')).toBeVisible();
        if (!(await page.evaluate(() => window.TronoSocial.voiceJoined)))
          await page.locator('#joinVoiceBtn').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        await page.evaluate(() => {
          window.__shellIdentity = {
            microphone: window.TronoSocial.getLocalAudioTrack(),
            network: window.TronoNetwork,
            clientId: window.TronoNetwork.clientId,
            nodes: new Map(
              [
                'desktopFullscreen',
                'desktopChannelsToggle',
                'desktopSidebarShade',
                'desktopUpdateCheck',
                'desktopUpdateCheckHost',
                'desktopRail',
                'desktopTopBar',
                'desktopCallDock',
              ].map((id) => [id, document.getElementById(id)]),
            ),
          };
        });
        async function assertIdentity() {
          assert.equal(
            await page.evaluate(() => {
              const original = window.__shellIdentity;
              return (
                [...original.nodes].every(
                  ([id, node]) => node && document.getElementById(id) === node,
                ) &&
                window.TronoSocial.voiceJoined &&
                window.TronoSocial.getLocalAudioTrack() === original.microphone &&
                original.microphone.readyState === 'live' &&
                window.TronoNetwork === original.network &&
                window.TronoNetwork.connected &&
                window.TronoNetwork.clientId === original.clientId
              );
            }),
            true,
            'navigation must retain each shell node, microphone and network identity',
          );
        }

        await t.test('layout and area changes keep the same shell and current call', async () => {
          for (const [layout, width] of [
            ['original', 1280],
            ['discord', 720],
          ]) {
            await page.setViewportSize({ width, height: 900 });
            await page.evaluate(
              (layout) => window.TronoAppLayout.apply(layout, { save: true }),
              layout,
            );
            await expect(page.locator('body')).toHaveAttribute('data-app-layout', layout);
            for (const route of ['home', 'game', 'community']) {
              await page.evaluate((route) => window.TronoDesktopShell.navigate(route), route);
              await expect(page.locator('body')).toHaveAttribute('data-desktop-view', route);
              await assertIdentity();
            }
          }
          await expect(page.locator('[data-desktop-route="clips"]')).toBeDisabled();
          await page.evaluate(() => window.TronoDesktopShell.navigate('clips'));
          await expect(page.locator('body')).toHaveAttribute('data-desktop-view', 'community');
          assert.equal(await page.locator('#clipsDialog').evaluate((dialog) => dialog.open), false);
          await assertIdentity();
        });

        await t.test(
          'the compact updater host retains React actions and banner controls',
          async () => {
            const check = page.locator('#desktopUpdateCheck');
            const banner = page.locator('.desktop-update-banner');
            await expect(page.locator('#callWorkspace > #desktopUpdateCheckHost')).toHaveCount(1);
            await expect(check).toBeVisible();
            await check.click();
            await expect.poll(() => page.evaluate(() => window.__shellFixture.calls.check)).toBe(1);
            await page.evaluate(() =>
              window.__shellFixture.finishCheck({
                status: 'downloading',
                version: '0.2.11',
                percent: 42,
              }),
            );
            await expect(check).toContainText('Baixando · 42%');
            await expect(banner).toBeVisible();
            await expect(banner).toContainText('42%');
            await page.evaluate(() =>
              window.__shellFixture.emitUpdate({ status: 'ready', version: '0.2.11' }),
            );
            await expect(check).toContainText('Atualização pronta');
            const restart = banner.getByRole('button', {
              name: 'Instalar 0.2.11 e reiniciar',
              exact: true,
            });
            await expect(restart).toBeVisible();
            await banner.getByRole('button', { name: 'Fechar aviso de atualização' }).click();
            await expect(banner).toBeHidden();
            await check.click();
            await expect.poll(() => page.evaluate(() => window.__shellFixture.calls.check)).toBe(2);
            await page.evaluate(() =>
              window.__shellFixture.finishCheck({ status: 'ready', version: '0.2.11' }),
            );
            await expect(banner).toBeVisible();
            await banner.getByRole('button', { name: 'Buscar última versão', exact: true }).click();
            await expect.poll(() => page.evaluate(() => window.__shellFixture.calls.check)).toBe(3);
            await page.evaluate(() =>
              window.__shellFixture.finishCheck({ status: 'ready', version: '0.2.11' }),
            );
            await restart.click();
            await expect
              .poll(() => page.evaluate(() => window.__shellFixture.calls.install))
              .toBe(1);
            await expect(restart).toBeEnabled();
            await page.setViewportSize({ width: 1280, height: 900 });
            await expect(page.locator('#desktopRail #desktopUpdateCheckHost')).toHaveCount(1);
            await expect(check).toContainText('Atualização pronta');
            await assertIdentity();
            await banner.getByRole('button', { name: 'Fechar aviso de atualização' }).click();
          },
        );
        await t.test(
          'soundboard keeps one label and fits after changing layout and window size',
          async () => {
            for (const size of [
              { width: 1280, height: 900 },
              { width: 390, height: 844 },
            ]) {
              await page.setViewportSize(size);
              for (const layout of ['original', 'discord']) {
                await page.evaluate((layout) => window.TronoAppLayout.apply(layout), layout);
                await page.locator('#soundboardToggle').click();
                const menu = page.locator('#soundboardDialog');
                await expect(menu).toBeVisible();
                await expect
                  .poll(() =>
                    menu.evaluate((node) => {
                      const top = parseFloat(node.style.getPropertyValue('--desktop-effects-top'));
                      const height = parseFloat(
                        node.style.getPropertyValue('--desktop-effects-height'),
                      );
                      return (
                        Number.isFinite(top) &&
                        top >= 12 &&
                        Number.isFinite(height) &&
                        height >= 120
                      );
                    }),
                  )
                  .toBe(true);
                await expect(
                  page.locator('#soundboardToggle > .workspace-control-icon'),
                ).toHaveCount(1);
                await expect
                  .poll(() =>
                    menu.evaluate((node) => {
                      const visible = (id) => {
                        const rect = document.getElementById(id)?.getBoundingClientRect();
                        return rect?.width && rect?.height ? rect : null;
                      };
                      const rect = node.getBoundingClientRect(),
                        header = visible('workspaceHeader') ?? visible('desktopTopBar'),
                        controls =
                          visible('callFocusDock') ??
                          visible('layoutVoicePanel') ??
                          visible('desktopCallDock');
                      return (
                        rect.top >= (header?.bottom ?? 0) + 11 &&
                        rect.bottom <= (controls?.top ?? innerHeight) - 11 &&
                        rect.left >= 0 &&
                        rect.right <= innerWidth
                      );
                    }),
                  )
                  .toBe(true);
                await page.locator('#soundboardClose').click();
                await expect(menu).toBeHidden();
                await assertIdentity();
              }
            }
          },
        );
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }

      await t.test('the web renderer does not expose native shell controls', async () => {
        const context = await browser.newContext();
        try {
          await context.route('**/*', (route) =>
            new URL(route.request().url()).hostname === '127.0.0.1'
              ? route.continue()
              : route.abort(),
          );
          await context.addInitScript((base) => {
            window.TRONO_BACKEND_URL = base;
          }, fixture.base);
          const page = await context.newPage();
          await page.goto(origin);
          await page.waitForFunction(() => window.TronoAuth?.ready);
          await page.evaluate(() => window.TronoAuth.ready);
          await expect(page.locator('body')).not.toHaveClass(/desktop-app/);
          await expect(
            page.locator('#desktopFullscreen, #desktopUpdateCheck, .desktop-update-banner'),
          ).toHaveCount(0);
          assert.equal(await page.evaluate(() => typeof window.TronoDesktopShell), 'undefined');
        } finally {
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
