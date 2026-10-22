'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'React composer preserves keyboard, emoji, upload, cancellation and draft recovery flows',
  { timeout: 45000 },
  async () => {
    const host = express().use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((resolve) => {
      const listener = host.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 11973, appOrigin: origin, directAttachments: true });
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
      await input.fill('Olá mundo');
      await input.evaluate((node) => node.setSelectionRange(4, 9));
      await page.locator('#emojiBtn').click();
      await page.locator('#emojiPicker [data-emoji="👑"]').click();
      await expect(input).toHaveValue('Olá 👑');
      await input.press('Escape');
      await expect(page.locator('#emojiPicker')).toBeHidden();
      await expect(input).toBeVisible();
      await input.evaluate((node) =>
        node.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
        ),
      );
      await expect(input).toHaveValue('Olá 👑');
      await expect(messages.locator('.court-chat-msg')).toHaveCount(2);

      const pdf = {
        name: 'documento.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7'),
      };
      await page.locator('#chatFileInput').setInputFiles(pdf);
      await expect(page.locator('#attachmentStatus')).toContainText('documento.pdf');
      await page.locator('#attachmentStatus button').click();
      await expect(page.locator('#attachmentStatus')).toHaveText('');
      await expect(input).toHaveValue('Olá 👑');

      let heldUpload;
      await page.route(
        '**/files/upload',
        (route) => {
          heldUpload = route;
        },
        { times: 1 },
      );
      await page.locator('#chatFileInput').setInputFiles(pdf);
      await page.locator('#courtChatSend').click();
      await expect.poll(() => !!heldUpload).toBe(true);
      await expect(input).toBeDisabled();
      await expect(page.locator('#courtChatSend')).toBeDisabled();
      await page.locator('#attachmentStatus button').click();
      await expect(input).toBeEnabled();
      await expect(input).toHaveValue('Olá 👑');
      await heldUpload.abort().catch(() => {});
      await page.unroute('**/files/upload');

      await page.locator('#chatFileInput').setInputFiles(pdf);
      await input.fill('Documento anexado');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await page.locator('#courtChatSend').click();
      await expect(messages.locator('.file-download')).toContainText('documento.pdf');
      await expect(input).toHaveValue('');
      await expect(page.locator('#attachmentStatus')).toContainText('Arquivo enviado.');
      assert.equal(fixture.files.size, 1);
      assert.equal([...fixture.files.values()][0].room_id, 'chat-livre');

      await new Promise((resolve) => setTimeout(resolve, 500));
      fixture.historyState.fail = true;
      try {
        await input.fill('Rascunho recuperado');
        await page.locator('#courtChatSend').click();
        await expect(page.locator('#attachmentStatus')).toContainText('Não foi possível salvar');
        await expect(input).toHaveValue('Rascunho recuperado');
      } finally {
        fixture.historyState.fail = false;
      }
      const text = await messages.textContent();
      assert.equal(text.split('Mensagem pelo botão').length - 1, 1);
      assert.equal(text.split('Mensagem pelo Enter').length - 1, 1);
      // Seed persisted messages to exercise the existing pagination after reload.
      const template = [...fixture.chatMessages.values()][0];
      for (let index = 0; index < 52; index++) {
        const id = randomUUID();
        fixture.chatMessages.set(id, {
          ...template,
          id,
          text: 'Histórico ' + index,
          ts: template.ts + index + 1,
          attachment: null,
        });
      }
      await page.reload();
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await expect
        .poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom))
        .toBe('chat-livre');
      await page.evaluate(() => window.TronoSocial.toggleTextChat(true));
      await expect(messages.locator('.court-chat-msg')).toHaveCount(50);
      const anchor = await messages.evaluate((element) => {
        element.scrollTop = 0;
        const first = element.firstElementChild;
        return {
          id: first.dataset.messageId,
          y: first.getBoundingClientRect().top - element.getBoundingClientRect().top,
        };
      });
      await page.locator('#olderChatMessages').click();
      await expect(messages.locator('.court-chat-msg')).toHaveCount(55);
      await expect(messages.locator('.file-download')).toContainText('documento.pdf');
      const anchorY = await messages
        .locator('[data-message-id="' + anchor.id + '"]')
        .evaluate(
          (element) =>
            element.getBoundingClientRect().top - element.parentElement.getBoundingClientRect().top,
        );
      assert(
        Math.abs(anchorY - anchor.y) <= 2,
        'older messages preserve the visible scroll anchor',
      );

      assert.equal(
        await messages
          .locator('.court-chat-msg')
          .evaluateAll((rows) => new Set(rows.map((row) => row.dataset.messageId)).size),
        55,
      );
      page.once('dialog', (dialog) => void dialog.accept());
      await messages.locator('.file-delete').click();
      await expect(messages.locator('.chat-attachment')).toContainText('Arquivo excluído.');
      await expect.poll(() => fixture.files.size).toBe(0);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
