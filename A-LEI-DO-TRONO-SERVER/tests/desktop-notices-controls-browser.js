'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const path = require('node:path'),
  express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'Windows message notices, call alert mute and compact PC control survive settings and layout changes',
  { timeout: 120000 },
  async () => {
    const server = await new Promise((resolve) => {
      const s = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 10863, appOrigin: origin });
    let browser;
    try {
      await fixture.call('signup', {
        email: 'desktop-notices@example.test',
        nickname: 'Avisos',
        password: 'Senha12!',
      });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (
        await fixture.call('login', { email: 'desktop-notices@example.test', password: 'Senha12!' })
      ).data;
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH ||
          (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
      });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '1');
          window.__notices = [];
          window.__notes = [];
          window.__gains = [];
          const oscillator = AudioContext.prototype.createOscillator,
            gain = AudioContext.prototype.createGain;
          AudioContext.prototype.createOscillator = function () {
            const node = oscillator.call(this),
              set = node.frequency.setValueAtTime.bind(node.frequency);
            node.frequency.setValueAtTime = (value, at) => {
              __notes.push(value);
              return set(value, at);
            };
            return node;
          };
          AudioContext.prototype.createGain = function () {
            const node = gain.call(this),
              ramp = node.gain.exponentialRampToValueAtTime.bind(node.gain);
            node.gain.exponentialRampToValueAtTime = (value, at) => {
              __gains.push(value);
              return ramp(value, at);
            };
            return node;
          };
          window.TronoDesktop = {
            version: '0.2.15',
            clipsSuspended: true,
            notify: async (value) => {
              __notices.push(value);
              return { shown: true };
            },
            onNotificationClick: (callback) => (window.__noticeClick = callback),
            readSession: async () => null,
            saveSession: async () => {},
            getMediaPermissions: async () => [],
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
        { base: fixture.base, data },
      );
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.setDefaultTimeout(10000);
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.evaluate(() => {
        window.TronoSocial.toggleVoiceSettings(true);
        window.TronoSocial.setSettingsTab('notifications');
      });
      await expect(page.locator('#windowsNotifications')).toBeChecked();
      await page.locator('#testWindowsNotification').click();
      assert.equal(await page.evaluate(() => __notices.length), 1);
      assert.equal(await page.evaluate(() => __notices[0].preview), true);
      await page.locator('#notificationMode').selectOption('all');
      const send = () =>
        page.evaluate(() =>
          window.TronoNotifications.notify({
            key: crypto.randomUUID(),
            title: 'Amigo',
            body: 'Nova mensagem',
            target: { type: 'channel', id: 'chat-livre' },
          }),
        );
      await send();
      assert.equal(await page.evaluate(() => __notices.length), 2);
      await page.locator('#windowsNotifications').uncheck();
      await send();
      assert.equal(
        await page.evaluate(() => __notices.length),
        2,
        'Disabled Windows notices suppress native IPC without disabling unread badges',
      );
      await page.locator('#windowsNotifications').check();
      await page.locator('#notificationMode').selectOption('off');
      await send();
      assert.equal(
        await page.evaluate(() => __notices.length),
        2,
        'The message filter also applies to native notices',
      );
      await page.evaluate(() => window.TronoSocial.setSettingsTab('audio'));
      await expect(page.locator('#callAlertVolume')).toHaveValue('45');
      await page.evaluate(() => {
        __notes.length = 0;
        __gains.length = 0;
      });
      await page.locator('#testCallAlert').click();
      assert.deepEqual(await page.evaluate(() => __notes), [659, 784, 1047]);
      assert(
        Math.abs((await page.evaluate(() => Math.max(...__gains))) - 0.144) < 0.00001,
        'Default call alert is quieter than the previous .442 peak',
      );
      await page.locator('#muteCallAlerts').check();
      await page.waitForTimeout(800);
      await page.evaluate(() => (__notes.length = 0));
      await page.locator('#testCallAlert').click();
      assert.equal(
        await page.evaluate(() => __notes.length),
        0,
        'Dedicated mute creates no call tones',
      );
      assert.equal(
        await page.evaluate(() => TronoAudio.sfxEnabled),
        true,
        'Other effects remain enabled',
      );
      await page.reload();
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.evaluate(() => {
        window.TronoSocial.toggleVoiceSettings(true);
        window.TronoSocial.setSettingsTab('audio');
      });
      await expect(page.locator('#muteCallAlerts')).toBeChecked();
      await expect(page.locator('#callAlertVolume')).toHaveValue('45');
      await page.evaluate(() => window.TronoSocial.setSettingsTab('notifications'));
      await expect(page.locator('#notificationMode')).toHaveValue('off');
      await expect(page.locator('#windowsNotifications')).toBeChecked();
      await page.evaluate(() => window.TronoSocial.toggleVoiceSettings(false));
      // Geometry and hit targets now live in the shared Corte fixture; retain IPC/filter/tone wiring here.
      await page.evaluate(() => window.TronoCallSettings.open('resources'));
      await expect(page.getByRole('region', { name: 'Recursos', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
