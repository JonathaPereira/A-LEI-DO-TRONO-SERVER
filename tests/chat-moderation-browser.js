'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  express = require('express');
const { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
test(
  'creator message controls confirm deletion, show full dates and preserve a live call; members cannot moderate',
  { timeout: 60000 },
  async () => {
    const host = express();
    host.use(express.static(path.resolve(__dirname, '../out')));
    const http = await new Promise((resolve) => {
        const s = host.listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + http.address().port;
    const fixture = await startFixture({ port: 10709, appOrigin: origin });
    let browser;
    const errors = [];
    try {
      async function account(email, nickname) {
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        return (await fixture.call('login', { email, password: 'Senha12!' })).data;
      }
      const owner = await account('jonathapereira.jj@gmail.com', 'Criador'),
        member = await account('member@example.test', 'Membro');
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        headless: true,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      async function client(data) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ['camera', 'microphone'],
        });
        await context.route('**/*', (route) =>
          ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
            ? route.continue()
            : route.abort(),
        );
        await context.addInitScript(
          ({ backend, data }) => {
            window.TRONO_BACKEND_URL = backend;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
          },
          { backend: fixture.base, data },
        );
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await page.evaluate(() => window.TronoPortal.openVoice());
        await expect
          .poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom))
          .toBe('chat-livre');
        if (!(await page.evaluate(() => window.TronoSocial.voiceJoined)))
          await page.locator('[data-voice-channel=chat-livre]').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        await page.evaluate(() => {
          window.TronoCallNavigation.showChat(true);
          window.__mic = window.TronoSocial.getLocalAudioTrack();
          window.__primary = window.TronoNetwork.primaryRoom;
        });
        return page;
      }
      const a = await client(owner),
        b = await client(member);
      await expect(a.getByRole('button', { name: 'Limpar histórico' })).toBeVisible();
      await expect(b.getByRole('button', { name: 'Limpar histórico' })).toBeHidden();
      await a.evaluate(() => window.TronoNetwork.sendChat('Mensagem com data completa'));
      await expect(b.locator('#chatOnlyScreen [role=log]')).toContainText(
        'Mensagem com data completa',
      );
      const row = a
        .locator('#chatOnlyScreen [data-message-id]')
        .filter({ hasText: 'Mensagem com data completa' });
      await expect(row.locator('time')).toHaveText(/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/);
      assert.match(await row.locator('time').getAttribute('datetime'), /^\d{4}-\d{2}-\d{2}T/);
      await expect(row.getByRole('button', { name: /Apagar mensagem de/ })).toBeVisible();
      assert.equal(await b.getByRole('button', { name: /Apagar mensagem de/ }).count(), 0);
      await row.getByRole('button', { name: /Apagar mensagem de/ }).click();
      await expect(
        a.getByRole('dialog', { name: /Apagar esta mensagem|Limpar o histórico/ }),
      ).toBeVisible();
      await expect(a.locator('dialog:modal')).toHaveCount(1);
      await a.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: /Apagar mensagem de/ }).click();
      await a.getByRole('button', { name: 'Apagar', exact: true }).click();
      await expect(row).toHaveCount(0);
      await expect(b.locator('#chatOnlyScreen [data-message-id]')).toHaveCount(0);
      await b.evaluate(() => window.TronoNetwork.sendChat('Limpar para todos'));
      await expect(a.locator('#chatOnlyScreen [role=log]')).toContainText('Limpar para todos');
      await a.getByRole('button', { name: 'Limpar histórico' }).click();
      await expect(a.getByRole('heading', { name: 'Limpar o histórico do canal?' })).toHaveText(
        'Limpar o histórico do canal?',
      );
      await a.getByRole('button', { name: 'Apagar', exact: true }).click();
      await expect(a.locator('#chatOnlyScreen [data-message-id]')).toHaveCount(0);
      await expect(b.locator('#chatOnlyScreen [data-message-id]')).toHaveCount(0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await b.evaluate(() => window.TronoNetwork.sendChat('Confirmação vinculada ao canal'));
      const scoped = a
        .locator('#chatOnlyScreen [data-message-id]')
        .filter({ hasText: 'Confirmação vinculada ao canal' });
      await expect(scoped).toBeVisible();
      await scoped.getByRole('button', { name: /Apagar mensagem de/ }).click();
      await expect(
        a.getByRole('dialog', { name: /Apagar esta mensagem|Limpar o histórico/ }),
      ).toBeVisible();
      await expect(a.locator('dialog:modal')).toHaveCount(1);
      await a.evaluate(() => window.TronoNetwork.joinTextChannel('chat-conversa'));
      await expect(
        a.getByRole('dialog', { name: /Apagar esta mensagem|Limpar o histórico/ }),
      ).not.toBeVisible();
      await expect
        .poll(() => a.evaluate(() => window.TronoNetwork.currentRoom))
        .toBe('chat-conversa');
      await a.evaluate(() => window.TronoNetwork.joinTextChannel('chat-livre'));
      // A transport-only room change does not open the drawer; use the visible chat action.
      await a.locator('[data-channel=chat-livre]').click();
      await expect(scoped).toBeVisible();
      await expect(b.locator('#chatOnlyScreen [role=log]')).toContainText(
        'Confirmação vinculada ao canal',
      );
      await scoped.getByRole('button', { name: /Apagar mensagem de/ }).click();
      await a.getByRole('button', { name: 'Apagar', exact: true }).click();
      await expect(scoped).toHaveCount(0);
      for (const page of [a, b])
        assert(
          await page.evaluate(
            () =>
              window.TronoSocial.voiceJoined &&
              window.TronoNetwork.primaryRoom === window.__primary &&
              window.TronoSocial.getLocalAudioTrack() === window.__mic &&
              window.__mic.readyState === 'live',
          ),
        );
      await a.reload();
      await a.waitForFunction(() => window.TronoAuth?.ready);
      await a.evaluate(() => window.TronoAuth.ready);
      await a.waitForFunction(() => window.TronoAuth?.ready);
      await a.evaluate(() => window.TronoAuth.ready);
      await expect
        .poll(() => a.evaluate(() => window.TronoNetwork?.currentRoom))
        .toBe('chat-livre');
      await expect(a.locator('#chatOnlyScreen [data-message-id]')).toHaveCount(0);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => http.close(resolve));
    }
  },
);
