'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'React composer sends once by click or Enter and keeps Shift+Enter as a newline',
  { timeout: 45000 },
  async () => {
    const host = express().use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((resolve) => {
      const listener = host.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 11973, appOrigin: origin });
    let browser;
    try {
      await fixture.call('signup', {
        email: 'react@example.test',
        nickname: 'Compositor',
        password: 'Senha12!',
      });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await page.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
      }, fixture.base);
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      if (!(await page.locator('#authDialog').isVisible()))
        await page.locator('#accountLoginBtn').click();
      await page.locator('#authEmail').fill('react@example.test');
      await page.locator('#authPassword').fill('Senha12!');
      await page.locator('#authSubmitBtn').click();
      await expect(page.locator('#authDialog')).not.toBeVisible();
      await page.locator('#openVoicePortalBtn').click();
      await expect
        .poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom))
        .toBe('chat-livre');
      await page.evaluate(() => window.TronoSocial.toggleTextChat(true));
      const input = page.locator('#courtChatInput');
      const messages = page.locator('#courtChatMessages');
      await input.fill('Mensagem pelo botão');
      await page.locator('#courtChatSend').click();
      await expect(messages).toContainText('Mensagem pelo botão');
      await expect(input).toHaveValue('');
      // Respect the backend's 450 ms anti-spam window between distinct submissions.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await input.fill('Mensagem pelo Enter');
      await input.press('Enter');
      await expect(messages).toContainText('Mensagem pelo Enter');
      await expect(input).toHaveValue('');
      await input.fill('Duas');
      await input.press('Shift+Enter');
      await input.press('l');
      await expect(input).toHaveValue('Duas\nl');
      const text = await messages.textContent();
      assert.equal(text.split('Mensagem pelo botão').length - 1, 1);
      assert.equal(text.split('Mensagem pelo Enter').length - 1, 1);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
