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
  'real desktop keeps account modals usable, returns from the Court signed in, and restores encrypted sessions',
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
        await expect(page.locator('#portalScreen')).toBeVisible();
        await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
        const modal = page.getByRole('dialog', { name: 'Acesso à conta', exact: true });
        await expect(modal).toBeVisible();
        const bounds = await modal.evaluate((node) => {
          const input = node.querySelector('input[type=email]').getBoundingClientRect(),
            box = node.getBoundingClientRect();
          return {
            width: box.width,
            client: node.clientWidth,
            scroll: node.scrollWidth,
            left: box.left,
            right: box.right,
            inputLeft: input.left,
            inputRight: input.right,
          };
        });
        assert(
          bounds.width >= 400 &&
            bounds.scroll <= bounds.client + 1 &&
            bounds.inputLeft >= bounds.left + 12 &&
            bounds.inputRight <= bounds.right - 12,
          JSON.stringify(bounds),
        );
        await fs.mkdir('artifacts/frontend-reset/auth-regression', { recursive: true });
        await page.screenshot({
          path: 'artifacts/frontend-reset/auth-regression/modal-electron.png',
        });
        await page.locator('#authEmail').fill(email);
        await page.locator('#authPassword').fill('NativeAuth12!');
        await page.getByLabel('Lembrar neste computador', { exact: true }).setChecked(remember);
        await page.locator('#authSubmit').click();
        await expect(
          page.getByRole('dialog', { name: 'Acesso à conta', exact: true }),
        ).toBeHidden();
        await expect(page.locator('#chatOnlyScreen')).toBeVisible();
        assert.equal(await page.evaluate(() => window.TronoAuth.user.nickname), 'Conta Nativa');
        await expect(page.locator('#authPassword')).toHaveCount(0);
      };
      await login(true);
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await page.locator('button[data-game="throne"]').click();
      await expect(page.locator('#setupScreen')).toBeVisible();
      await page.locator('#backFromLobbyBtn').click();
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      assert.equal(await page.evaluate(() => window.TronoAuth.user.nickname), 'Conta Nativa');
      await page.screenshot({
        path: 'artifacts/frontend-reset/auth-regression/court-return-electron.png',
      });
      const saved = await page.evaluate(() => window.TronoDesktop.readSession());
      assert(saved.session.refresh_token);
      const bytes = await fs.readFile(path.join(directory, 'remembered-session.bin'));
      assert(!bytes.includes(Buffer.from(saved.session.refresh_token)));
      // Clear in the new document: a late role response in the old page may
      // legitimately persist its tab snapshot before navigation commits.
      await page.addInitScript(() => sessionStorage.removeItem('mn-auth-session-v1'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      assert.equal(await page.evaluate(() => window.TronoAuth.user.nickname), 'Conta Nativa');
      await expect(page.getByRole('dialog', { name: 'Acesso à conta', exact: true })).toBeHidden();
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      await page.evaluate(() => window.TronoAuth.setRemember(false));
      assert.equal(await page.evaluate(() => window.TronoDesktop.readSession()), null);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
      await login(false);
      assert.equal(await page.evaluate(() => window.TronoDesktop.readSession()), null);
      await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
      await expect(page.locator('#portalScreen')).toBeVisible();
      assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('mn-auth-session-v1')), null);
      assert.deepEqual(errors, []);
    } finally {
      await closeTestApp(app);
      finished = true;
      await fixture?.stop();
      const owned = path.resolve(directory);
      if (
        path.dirname(owned) !== path.resolve(os.tmpdir()) ||
        !path.basename(owned).startsWith('mn-auth-owner-')
      )
        throw new Error('Refusing cleanup outside this test profile');
      await fs.rm(owned, { recursive: true, force: true }).catch(() => {});
    }
  },
);
