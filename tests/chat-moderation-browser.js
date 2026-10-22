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
        await page.locator('#openVoicePortalBtn').click();
        await expect
          .poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom))
          .toBe('chat-livre');
        if (!(await page.evaluate(() => window.TronoSocial.voiceJoined)))
          await page.locator('#joinVoiceBtn').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        await page.evaluate(() => {
          window.TronoSocial.toggleTextChat(true);
          window.__mic = window.TronoSocial.getLocalAudioTrack();
          window.__primary = window.TronoNetwork.primaryRoom;
        });
        return page;
      }
      const a = await client(owner),
        b = await client(member);
      await expect(a.locator('#clearChatHistoryBtn')).toBeVisible();
      await expect(b.locator('#clearChatHistoryBtn')).toBeHidden();
      await a.evaluate(() => window.TronoNetwork.sendChat('Mensagem com data completa'));
      await expect(b.locator('#courtChatMessages')).toContainText('Mensagem com data completa');
      const row = a
        .locator('#courtChatMessages .court-chat-msg')
        .filter({ hasText: 'Mensagem com data completa' });
      await expect(row.locator('time')).toHaveText(/\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/);
      assert.match(await row.locator('time').getAttribute('datetime'), /^\d{4}-\d{2}-\d{2}T/);
      await expect(row.locator('.chat-message-delete')).toBeVisible();
      assert.equal(await b.locator('.chat-message-delete').count(), 0);
      await row.locator('.chat-message-delete').click();
      await expect(a.locator('#chatModerationDialog')).toBeVisible();
      await a.locator('#chatModerationCancel').click();
      await expect(row).toBeVisible();
      await row.locator('.chat-message-delete').click();
      await a.locator('#chatModerationConfirm').click();
      await expect(row).toHaveCount(0);
      await expect(b.locator('#courtChatMessages .court-chat-msg')).toHaveCount(0);
      await b.evaluate(() => window.TronoNetwork.sendChat('Limpar para todos'));
      await expect(a.locator('#courtChatMessages')).toContainText('Limpar para todos');
      await a.locator('#clearChatHistoryBtn').click();
      await expect(a.locator('#chatModerationTitle')).toHaveText('Apagar o histórico do canal?');
      await a.locator('#chatModerationConfirm').click();
      await expect(a.locator('#courtChatMessages .court-chat-msg')).toHaveCount(0);
      await expect(b.locator('#courtChatMessages .court-chat-msg')).toHaveCount(0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await b.evaluate(() => window.TronoNetwork.sendChat('Confirmação vinculada ao canal'));
      const scoped = a
        .locator('#courtChatMessages .court-chat-msg')
        .filter({ hasText: 'Confirmação vinculada ao canal' });
      await expect(scoped).toBeVisible();
      await scoped.locator('.chat-message-delete').click();
      await expect(a.locator('#chatModerationDialog')).toBeVisible();
      await a.evaluate(() => window.TronoNetwork.joinTextChannel('chat-conversa'));
      await expect(a.locator('#chatModerationDialog')).not.toBeVisible();
      await expect
        .poll(() => a.evaluate(() => window.TronoNetwork.currentRoom))
        .toBe('chat-conversa');
      await a.evaluate(() => window.TronoNetwork.joinTextChannel('chat-livre'));
      // A transport-only room change does not open the drawer; use the visible chat action.
      await a.getByRole('button', { name: 'Abrir chat de Geral', exact: true }).click();
      await expect(scoped).toBeVisible();
      await expect(b.locator('#courtChatMessages')).toContainText('Confirmação vinculada ao canal');
      await scoped.locator('.chat-message-delete').click();
      await a.locator('#chatModerationConfirm').click();
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
      await expect(a.locator('#courtChatMessages .court-chat-msg')).toHaveCount(0);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => http.close(resolve));
    }
  },
);
