'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { _electron, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'real desktop restores encrypted account sessions and respects remember removal and the moved logout button',
  { timeout: 60000, skip: process.platform !== 'win32' },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-auth-owner-'));
    let app,
      fixture,
      finished = false;
    t.signal.addEventListener(
      'abort',
      () => {
        if (!finished) killTestApp(app);
      },
      { once: true },
    );
    try {
      fixture = await startFixture({
        port: 10924,
        allowedOrigins: ['https://a-lei-do-trono.surge.sh'],
      });
      const email = 'native-auth-owner@example.test';
      await fixture.call('signup', { email, nickname: 'Conta Nativa', password: 'NativeAuth12!' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [
          path.resolve('electron'),
          '--user-data-dir=' + directory,
          '--mute-audio',
          '--desktop-api-test-origin=' + fixture.base,
        ],
        timeout: 30000,
      });
      const page = await app.firstWindow(),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://a-lei-do-trono-server.onrender.com/**', (route) => route.abort());
      await page.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('tronoSfxEnabled', '0');
      }, fixture.base);
      const ready = async () => {
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
      };
      await page.waitForURL('https://a-lei-do-trono.surge.sh/');
      await page.waitForLoadState('load');
      await ready();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      const login = async (remember) => {
        await expect(page.locator('#authDialog')).toBeVisible();
        await page.locator('#authEmail').fill(email);
        await page.locator('#authPassword').fill('NativeAuth12!');
        await page.locator('#authRemember').setChecked(remember);
        await page.locator('#authSubmitBtn').click();
        await expect(page.locator('#authDialog')).toBeHidden();
        assert.equal(await page.evaluate(() => window.TronoAuth.user.nickname), 'Conta Nativa');
        assert.equal(await page.locator('#authPassword').inputValue(), '');
      };
      await login(true);
      const saved = await page.evaluate(() => window.TronoDesktop.readSession());
      assert(saved.session.refresh_token);
      const bytes = await fs.readFile(path.join(directory, 'remembered-session.bin'));
      assert(!bytes.includes(Buffer.from(saved.session.refresh_token)));
      await page.evaluate(() => sessionStorage.clear());
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      assert.equal(await page.evaluate(() => window.TronoAuth.user.nickname), 'Conta Nativa');
      await expect(page.locator('#authDialog')).toBeHidden();
      await page.evaluate(() => window.TronoAuth.setRemember(false));
      assert.equal(await page.evaluate(() => window.TronoDesktop.readSession()), null);
      await page.evaluate(() => sessionStorage.clear());
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
      await login(false);
      assert.equal(await page.evaluate(() => window.TronoDesktop.readSession()), null);
      await page.locator('#voiceSettingsBtn').click();
      await page.locator('[data-settings-tab="account"]').click();
      await expect(page.locator('#accountLogoutBtn')).toBeVisible();
      await page.locator('#accountLogoutBtn').click();
      await expect(page.locator('#authDialog')).toBeVisible();
      assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('mn-auth-session-v1')), null);
      assert.deepEqual(errors, []);
    } finally {
      await closeTestApp(app);
      finished = true;
      await fixture?.stop();
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
);
