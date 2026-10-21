'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'React native picker preserves choices, cancellation and capture ownership',
  { timeout: 60000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const listening = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(listening));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser;
    try {
      fixture = await startFixture({ port: 10921, appOrigin: origin });
      const email = 'capture@example.test';
      await fixture.call('signup', { email, nickname: 'Captura', password: 'Senha12!' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const account = (await fixture.call('login', { email, password: 'Senha12!' })).data;
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        args: ['--mute-audio', '--no-sandbox'],
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript(
        ({ base, account }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(account));
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
          let onCapture,
            onCancel,
            pending,
            next,
            serial = 0;
          const calls = [],
            released = [];
          const nativeCapture = () =>
            new Promise((resolve, reject) => {
              const request = {
                id: 'request-' + ++serial,
                audio: true,
                windows: true,
                applicationAudio: true,
                sources: [
                  {
                    id: 'screen:1:0',
                    name: 'Tela principal',
                    thumbnail: 'https://remote.invalid/image.png',
                  },
                  { id: 'window:2:0', name: '<Jogo & efeitos>', thumbnail: '' },
                ],
                ...next,
              };
              pending = { request, resolve, reject };
              queueMicrotask(() => onCapture(request));
            });
          navigator.mediaDevices.getDisplayMedia = nativeCapture;
          window.__picker = {
            calls,
            released,
            nativeCapture,
            start(patch = {}) {
              next = patch;
              window.__picker.result = navigator.mediaDevices
                .getDisplayMedia({ video: true, audio: patch.audio ?? true })
                .then(
                  (stream) => {
                    window.__picker.stream = stream;
                    return 'active';
                  },
                  (error) => error.name,
                );
            },
            cancel(id) {
              onCancel({ id });
            },
          };
          window.TronoDesktop = {
            version: '0.2.10',
            clipsSuspended: true,
            readSession: async () => null,
            saveSession: async () => {},
            getMediaPermissions: async () => [],
            configureClips: async () => ({ suspended: true }),
            getWindowState: async () => ({ fullscreen: false }),
            onWindowState: () => {},
            toggleFullscreen: async () => ({ fullscreen: false }),
            getUpdateState: async () => ({ status: 'idle' }),
            onUpdateState: () => {},
            checkUpdates: async () => ({ status: 'idle' }),
            installUpdate: async () => ({ pending: false }),
            onCapture(fn) {
              onCapture = fn;
              return () => {
                released.push('capture');
                onCapture = null;
              };
            },
            onCaptureCancel(fn) {
              onCancel = fn;
              return () => {
                released.push('cancel');
                onCancel = null;
              };
            },
            onApplicationAudio() {
              return () => released.push('audio');
            },
            ackApplicationAudio() {},
            async stopApplicationAudio() {},
            async selectCapture(choice) {
              calls.push(choice);
              const current = pending;
              if (!current || current.request.id !== choice.id) return false;
              pending = null;
              if (!choice.source) {
                current.reject(new DOMException('cancelled', 'NotAllowedError'));
                return { selected: false };
              }
              const canvas = document.createElement('canvas');
              canvas.width = 320;
              canvas.height = 180;
              canvas.getContext('2d').fillRect(0, 0, 320, 180);
              current.resolve(canvas.captureStream(1));
              return { selected: true, audio: null };
            },
          };
        },
        { base: fixture.base, account },
      );
      const page = await context.newPage(),
        errors = [];
      page.setDefaultTimeout(8000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await expect(page.locator('#desktopFullscreen')).toBeVisible();
      const picker = page.getByRole('dialog', { name: 'Escolher tela ou janela' });
      await t.test(
        'screen and application are explicit; window selection bypasses the second dropdown',
        async () => {
          await page.evaluate(() => window.__picker.start());
          await expect(picker).toBeVisible();
          await expect(page.locator('#desktopCaptureConfirm')).toBeDisabled();
          assert.equal(await picker.locator('img').first().getAttribute('src'), null);
          await picker.getByRole('button', { name: 'Tela principal' }).click();
          await page.locator('#desktopCaptureConfirm').click();
          await expect(page.locator('#desktopCaptureMessage')).toContainText(
            'Escolha o aplicativo',
          );
          await expect(page.locator('#desktopAudioSource')).toBeFocused();
          await page.locator('#desktopAudioSource').selectOption('window:2:0');
          await page.locator('#desktopCaptureConfirm').click();
          assert.equal(await page.evaluate(() => window.__picker.result), 'active');
          assert.deepEqual(await page.evaluate(() => window.__picker.calls.at(-1)), {
            id: 'request-1',
            source: 'screen:1:0',
            audioMode: 'application',
            audioSource: 'window:2:0',
          });
          await page.evaluate(() =>
            window.__picker.stream.getTracks().forEach((track) => track.stop()),
          );
          await page.evaluate(() => window.__picker.start());
          await picker.getByRole('button', { name: '<Jogo & efeitos>' }).click();
          await expect(page.locator('#desktopAudioSourceLabel')).toBeHidden();
          await page.locator('#desktopCaptureConfirm').click();
          assert.equal(await page.evaluate(() => window.__picker.result), 'active');
          await page.evaluate(() =>
            window.__picker.stream.getTracks().forEach((track) => track.stop()),
          );
        },
      );
      await t.test('system audio stays opt-in and unavailable modes remain disabled', async () => {
        await page.evaluate(() => window.__picker.start());
        await page.locator('#desktopAudioMode').selectOption('system');
        await expect(picker.locator('.desktop-capture-help')).toContainText('causar eco');
        await picker.getByRole('button', { name: 'Tela principal' }).click();
        await page.locator('#desktopCaptureConfirm').click();
        assert.equal(await page.evaluate(() => window.__picker.result), 'active');
        assert.equal(await page.evaluate(() => window.__picker.calls.at(-1).audioMode), 'system');
        await page.evaluate(() =>
          window.__picker.stream.getTracks().forEach((track) => track.stop()),
        );
        await page.evaluate(() =>
          window.__picker.start({ applicationAudio: false, windows: false }),
        );
        await expect(page.locator('#desktopAudioMode')).toHaveValue('none');
        await expect(
          page.locator('#desktopAudioMode option[value="application"]'),
        ).toHaveJSProperty('disabled', true);
        await expect(page.locator('#desktopAudioMode option[value="system"]')).toHaveJSProperty(
          'disabled',
          true,
        );
        await picker.getByRole('button', { name: 'Cancelar captura' }).click();
        assert.equal(await page.evaluate(() => window.__picker.result), 'NotAllowedError');
      });
      await t.test(
        'empty video-only selection, Escape and stale cancellation keep subsequent dialogs usable',
        async () => {
          await page.evaluate(() => window.__picker.start({ audio: false, sources: [] }));
          await expect(picker).toBeVisible();
          await expect(picker.locator('.desktop-audio-options')).toBeHidden();
          await expect(picker).toContainText('Nenhuma tela ou janela disponível');
          await page.keyboard.press('Escape');
          assert.equal(await page.evaluate(() => window.__picker.result), 'NotAllowedError');
          await page.evaluate(() => window.__picker.start({ audio: false }));
          await expect(picker).toBeVisible();
          await page.evaluate(() => window.__picker.cancel('request-5'));
          await expect(picker).toBeVisible();
          await picker.getByRole('button', { name: 'Tela principal' }).click();
          await page.locator('#desktopCaptureConfirm').click();
          assert.equal(await page.evaluate(() => window.__picker.result), 'active');
          assert.equal(await page.evaluate(() => window.__picker.calls.at(-1).audioMode), 'none');
        },
      );
      await t.test(
        'page disposal restores the original method, releases listeners and preserves handed-off video',
        async () => {
          assert.equal(
            await page.evaluate(() => {
              window.dispatchEvent(new Event('pagehide'));
              return navigator.mediaDevices.getDisplayMedia === window.__picker.nativeCapture;
            }),
            true,
          );
          await expect(page.locator('[data-desktop-capture-root]')).toHaveCount(0);
          assert.deepEqual((await page.evaluate(() => window.__picker.released)).sort(), [
            'audio',
            'cancel',
            'capture',
          ]);
          assert.equal(
            await page.evaluate(() => window.__picker.stream.getVideoTracks()[0].readyState),
            'live',
          );
          await page.evaluate(() =>
            window.__picker.stream.getTracks().forEach((track) => track.stop()),
          );
          await page.reload();
          await expect(page.locator('#desktopFullscreen')).toBeVisible();
          assert.equal(
            await page.evaluate(() => {
              const replacement = async () => new MediaStream();
              navigator.mediaDevices.getDisplayMedia = replacement;
              window.dispatchEvent(new Event('pagehide'));
              return navigator.mediaDevices.getDisplayMedia === replacement;
            }),
            true,
          );
        },
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
