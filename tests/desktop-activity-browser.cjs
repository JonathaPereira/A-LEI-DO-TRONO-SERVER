'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'desktop activity shares only opted-in names and keeps React fields stable',
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
      fixture = await startFixture({ port: 10903, appOrigin: origin });
      async function account(email, nickname) {
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        return (await fixture.call('login', { email, password: 'Senha12!' })).data;
      }
      const desktopAccount = await account('activity@example.test', 'Atividade Desktop');
      const readerAccount = await account('activity-reader@example.test', 'Leitor Atividade');
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
      const errors = [];
      let phase = 'startup';
      async function contextFor(session, desktop) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.route('**/*', (route) =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort(),
        );
        await context.addInitScript(
          ({ base, session, desktop }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(session));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            if (!desktop) return;
            const appId = 'a'.repeat(64);
            const listeners = [];
            let resolveInitial;
            const native = {
              appId,
              state: {
                available: true,
                enabled: false,
                game: null,
                apps: [{ id: appId, name: 'Meu jogo' }],
                error: null,
              },
              configurations: [],
              pending: [],
              hold: false,
              reads: 0,
              emit(state) {
                this.state = state;
                for (const listener of listeners) listener(state);
              },
              resolveInitial(state) {
                resolveInitial(state);
              },
              finish(state) {
                this.pending.shift()(state);
              },
              get listenerCount() {
                return listeners.length;
              },
            };
            window.__activityFixture = native;
            window.TronoDesktop = {
              version: '0.2.10',
              clipsSuspended: true,
              readSession: async () => null,
              saveSession: async () => {},
              getMediaPermissions: async () => [],
              onCapture: () => {},
              onCaptureCancel: () => {},
              onApplicationAudio: () => {},
              configureClips: async () => ({ suspended: true }),
              getWindowState: async () => ({ fullscreen: false }),
              onWindowState: () => {},
              getUpdateState: async () => ({ status: 'idle' }),
              onUpdateState: () => {},
              getActivityState: () => {
                native.reads++;
                return new Promise((resolve) => {
                  resolveInitial = resolve;
                });
              },
              onActivity: (listener) => {
                listeners.push(listener);
                return () => {
                  const index = listeners.indexOf(listener);
                  if (index >= 0) listeners.splice(index, 1);
                };
              },
              configureActivity: (config) => {
                native.configurations.push(config);
                if (native.hold) return new Promise((resolve) => native.pending.push(resolve));
                const state = {
                  ...native.state,
                  enabled: config.enabled,
                  game: config.enabled
                    ? {
                        name: config.preferredAppId
                          ? config.name || 'Meu jogo'
                          : 'Counter-Strike 2',
                        startedAt: 123456,
                      }
                    : null,
                };
                native.emit(state);
                return Promise.resolve(state);
              },
            };
          },
          { base: fixture.base, session, desktop },
        );
        return context;
      }
      const desktopContext = await contextFor(desktopAccount, true);
      const readerContext = await contextFor(readerAccount, false);
      try {
        const page = await desktopContext.newPage();
        page.setDefaultTimeout(12000);
        page.on('pageerror', (error) =>
          errors.push({ page: 'desktop', phase, message: error.message, stack: error.stack }),
        );
        const web = await readerContext.newPage();
        web.on('pageerror', (error) =>
          errors.push({ page: 'web', phase, message: error.message, stack: error.stack }),
        );
        for (const target of [page, web]) {
          await target.goto(origin);
          await target.waitForFunction(() => window.TronoAuth?.ready);
          await target.evaluate(() => window.TronoAuth.ready);
        }
        await expect(web.getByRole('complementary', { name: 'Membros online' })).toBeVisible();
        await page.evaluate(() => window.TronoCallSettings.open('activity'));
        await page.locator('[data-settings-tab="activity"]').click();
        const enabled = page.locator('#desktopActivityEnabled');
        const app = page.locator('#desktopActivityApp');
        const name = page.locator('#desktopActivityName');
        const status = page.locator('#desktopActivityStatus');
        const presence = web
          .getByRole('complementary', { name: 'Membros online' })
          .getByRole('button')
          .filter({
            hasText: /Counter-Strike 2|Meu jogo|Jogo escolhido|Resposta antiga|Evento sem conta/,
          });

        await t.test(
          'a native event supersedes the pending initial read and starting remains idempotent',
          async () => {
            phase = 'initial read and repeated start';
            await expect.poll(() => page.evaluate(() => window.__activityFixture.reads)).toBe(1);
            await page.evaluate(() => {
              const native = window.__activityFixture;
              native.emit(native.state);
              native.resolveInitial({
                available: false,
                enabled: false,
                game: null,
                apps: [],
                error: null,
              });
              window.TronoDesktopActivity.start();
              window.TronoDesktopActivity.start();
            });
            await expect(enabled).toBeEnabled();
            await expect(enabled).not.toBeChecked();
            await expect(app.locator('option')).toHaveCount(2);
            await expect(presence).toHaveCount(0);
            assert.equal(await page.evaluate(() => window.__activityFixture.listenerCount), 1);
          },
        );

        await t.test(
          'automatic and manual activity reach website presence and name edits commit on blur',
          async () => {
            phase = 'opt-in and focused draft';
            await enabled.check();
            await expect(status).toContainText('Jogando Counter-Strike 2');
            await expect(presence).toContainText('Counter-Strike 2');
            await app.selectOption('a'.repeat(64));
            await expect(page.locator('#desktopActivityNameLabel')).toBeVisible();
            await name.fill('Jogo escolhido');
            await expect(presence).toContainText('Meu jogo');
            await page.evaluate(() => {
              const native = window.__activityFixture;
              native.emit({ ...native.state, apps: [] });
            });
            await expect(name).toHaveValue('Jogo escolhido');
            await name.press('Tab');
            await expect(status).toContainText('Jogando Jogo escolhido');
            await expect(presence).toContainText('Jogo escolhido');
            await expect(app.locator('option:checked')).toHaveText(
              'Aplicativo selecionado · não está aberto',
            );
            assert.equal(
              await page.evaluate(() => window.__activityFixture.configurations.at(-1).name),
              'Jogo escolhido',
            );
          },
        );

        await t.test(
          'layout changes retain the fields, controller and shared network without duplicating native listeners',
          async () => {
            phase = 'layout identity';
            await page.evaluate(() => {
              window.__activityIdentity = {
                owner: window.TronoDesktopActivity,
                network: window.TronoNetwork,
                fields: ['desktopActivityEnabled', 'desktopActivityApp', 'desktopActivityName'].map(
                  (id) => document.getElementById(id),
                ),
              };
            });
            for (const topic of ['audio', 'activity', 'notifications', 'activity']) {
              await page.evaluate((value) => window.TronoCallSettings.select(value), topic);
              await page.evaluate(() => window.TronoCallSettings.select('activity'));
              await expect(enabled).toBeChecked();
              await expect(name).toHaveValue('Jogo escolhido');
              assert.equal(
                await page.evaluate(() => {
                  const identity = window.__activityIdentity;
                  return (
                    identity.owner === window.TronoDesktopActivity &&
                    identity.network === window.TronoNetwork &&
                    identity.fields.every((field) => field === document.getElementById(field.id)) &&
                    window.__activityFixture.listenerCount === 1
                  );
                }),
                true,
              );
            }
            await enabled.uncheck();
            await expect(status).toContainText('Sua atividade está oculta.');
            await expect(presence).toHaveCount(0);
          },
        );

        await t.test('a late configuration cannot restore activity after logout', async () => {
          phase = 'logout';
          await enabled.check();
          await expect(presence).toContainText('Jogo escolhido');
          await page.evaluate(() => {
            window.__activityFixture.hold = true;
          });
          await name.fill('Resposta antiga');
          await name.press('Tab');
          await expect
            .poll(() => page.evaluate(() => window.__activityFixture.pending.length))
            .toBe(1);
          await page.locator('[data-settings-tab="account"]').click();
          await page.evaluate(() => window.TronoAuth.logout());
          await expect(page.locator('#portalScreen')).toBeVisible();
          await expect(presence).toHaveCount(0);
          await page.evaluate(() => {
            const native = window.__activityFixture;
            native.finish({
              ...native.state,
              enabled: true,
              game: { name: 'Resposta antiga', startedAt: 123456 },
            });
            native.emit({
              ...native.state,
              enabled: true,
              game: { name: 'Evento sem conta', startedAt: 123456 },
            });
          });
          await expect(presence).toHaveCount(0);
          assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
          await expect(enabled).toBeDisabled();
          await expect(status).toContainText('Entre na conta para compartilhar sua atividade.');
        });
        assert.deepEqual(errors, []);
      } finally {
        await desktopContext.close();
        await readerContext.close();
      }
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
