'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'Corte desktop preserves native update actions, explicit install and call continuity',
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
        await page.getByRole('button', { name: 'Voz e vídeo', exact: true }).click();
        await page.getByRole('button', { name: 'Aplicativo', exact: true }).click();
        const settings = page.getByRole('dialog', { name: 'Configurações da Corte' });
        const check = settings.getByRole('button', { name: 'Buscar atualizações', exact: true });
        await expect(check).toBeVisible();
        await check.click();
        await expect.poll(() => page.evaluate(() => window.__shellFixture.calls.check)).toBe(1);
        await expect(check).toBeDisabled();
        await page.evaluate(() =>
          window.__shellFixture.finishCheck({
            status: 'downloading',
            version: '0.2.11',
            percent: 42,
          }),
        );
        await expect(settings.getByRole('status')).toContainText('42%');
        await page.evaluate(() =>
          window.__shellFixture.emitUpdate({ status: 'ready', version: '0.2.11' }),
        );
        const restart = settings.getByRole('button', {
          name: 'Instalar 0.2.11 e reiniciar',
          exact: true,
        });
        await expect(restart).toBeVisible();
        assert.equal(
          await page.evaluate(() => window.__shellFixture.calls.install),
          0,
          'Receiving an update never installs it',
        );
        await restart.click();
        await expect.poll(() => page.evaluate(() => window.__shellFixture.calls.install)).toBe(1);
        await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
        const banner = page.getByRole('status', { name: 'Atualização do aplicativo' });
        await expect(banner).toBeVisible();
        await banner.getByRole('button', { name: 'Fechar aviso de atualização' }).click();
        await expect(banner).toBeHidden();
        await page.getByRole('button', { name: 'Entrar na voz de Geral', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        await page.evaluate(() => {
          window.__keptMic = window.TronoSocial.getLocalAudioTrack();
          window.__keptSocket = window.TronoNetwork.clientId;
          window.__keptUpdates = window.TronoDesktopUpdates;
        });
        await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
        await page.getByRole('button', { name: 'Voltar à chamada', exact: true }).click();
        assert(
          await page.evaluate(
            () =>
              window.__keptMic === window.TronoSocial.getLocalAudioTrack() &&
              window.__keptMic.readyState === 'live' &&
              window.__keptSocket === window.TronoNetwork.clientId &&
              window.__keptUpdates === window.TronoDesktopUpdates,
          ),
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
