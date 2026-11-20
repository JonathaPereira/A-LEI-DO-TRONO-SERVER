'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'),
  path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { presentAccount } = require('./auth-presentation-fixture.cjs');

test(
  'channel attachments preserve pagination, moderation, cancellation and shared previews',
  { timeout: 90000 },
  async () => {
    const server = await new Promise((resolve) => {
      const listener = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser, held;
    try {
      fixture = await startFixture({ port: 10983, appOrigin: origin });
      const email = 'jonathapereira.jj@gmail.com';
      await fixture.call('signup', { email, nickname: 'Anexos Criador', password: 'Senha12!' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const initial = (await fixture.call('login', { email, password: 'Senha12!' })).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--mute-audio'],
      });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
        errors = [],
        offsets = [];
      let fail = true,
        hold = false;
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      const files = [
        {
          id: '21000000-0000-4000-8000-000000000001',
          name: 'Imagem',
          mime: 'image/gif',
          bytes: 34,
          ownerId: 'other',
          roomId: 'chat-livre',
          kind: 'chat',
        },
        {
          id: '21000000-0000-4000-8000-000000000002',
          name: '<img src=x onerror=alert(1)>',
          mime: 'application/pdf',
          bytes: 100,
          ownerId: 'other',
          roomId: 'chat-livre',
          kind: 'chat',
        },
        {
          id: '21000000-0000-4000-8000-000000000003',
          name: 'Meu arquivo',
          mime: 'application/pdf',
          bytes: 100,
          ownerId: initial.user.id,
          roomId: 'chat-livre',
          kind: 'chat',
        },
      ];
      await context.route('**/files/channel/chat-livre?*', (route) => {
        const offset = Number(new URL(route.request().url()).searchParams.get('offset'));
        offsets.push(offset);
        if (hold) {
          hold = false;
          held = route;
          return;
        }
        if (offset && fail) {
          fail = false;
          return route.fulfill({ status: 503, json: { error: { message: 'Falha temporária' } } });
        }
        return route.fulfill({
          json: {
            files: offset ? files.slice(2) : files.slice(0, 2),
            hasMore: !offset,
            nextOffset: offset ? 3 : 2,
          },
        });
      });
      await context.route('**/files/21000000-0000-4000-8000-000000000001/url*', (route) =>
        route.fulfill({ json: { url: origin + '/fixture.gif', expiresAt: Date.now() + 60000 } }),
      );
      await context.route('**/fixture.gif', (route) =>
        route.fulfill({
          contentType: 'image/gif',
          body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
        }),
      );
      await context.route('**/files/21000000-0000-4000-8000-000000000003', (route) =>
        route.fulfill({ json: { ok: true } }),
      );
      await context.addInitScript(
        ({ base, initial }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
        },
        { base: fixture.base, initial },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.locator('[data-channel=chat-livre]').click();
      await expect
        .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
        .toBe('chat-livre');
      await page.getByRole('button', { name: 'Arquivos do canal', exact: true }).click();
      await expect(page.locator('#channelFileList .channel-file-card')).toHaveCount(2);
      await expect(page.locator('#channelFileList img')).toBeVisible();
      await expect(page.locator('#channelFileList')).toContainText('<img src=x onerror=alert(1)>');
      await expect(page.locator('#channelFileList .file-delete')).toHaveCount(2);
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/management-attachments.png'),
      });
      await page.locator('#channelFileList .file-image-open').click();
      await expect(page.getByRole('dialog', { name: 'Imagem anexada', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#channelFilesDialog')).toBeVisible();
      await page.locator('#channelFileList .files-load-more').click();
      await expect(page.locator('#channelFilesMessage')).toHaveText('Falha temporária');
      await expect(page.locator('#channelFileList .files-load-more')).toBeEnabled();
      await page.locator('#channelFileList .files-load-more').click();
      await expect(page.locator('#channelFileList .channel-file-card')).toHaveCount(3);
      assert.deepEqual(offsets, [0, 2, 2]);
      await presentAccount(page, { permissions: { moderateFiles: false } });
      await expect(page.locator('#channelFileList .file-delete')).toHaveCount(1);
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('#channelFileList .file-delete').click();
      await expect(page.locator('#channelFileList .channel-file-card').last()).toHaveText(
        'Arquivo excluído.',
      );
      await page.locator('#channelFilesClose').click();
      hold = true;
      await page.evaluate(() => {
        void window.TronoCommunityAdmin.openChannelFiles();
      });
      await expect.poll(() => !!held).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('#channelFilesDialog')).toBeHidden();
      await held
        .fulfill({ json: { files: [files[0]], hasMore: false, nextOffset: 1 } })
        .catch(() => {});
      held = null;
      await expect(page.locator('#channelFileList .channel-file-card')).toHaveCount(0);
      await page.getByRole('button', { name: 'Arquivos do canal', exact: true }).click();
      await expect(page.locator('#channelFileList .channel-file-card')).toHaveCount(2);
      await page.evaluate(() =>
        window.TronoChatHub.switchChannel('chat-jogos', { connectVoice: false }),
      );
      await expect(page.locator('#channelFilesDialog')).toBeHidden();
      await expect(page.locator('#channelFileList .channel-file-card')).toHaveCount(0);
      await page.evaluate(() => window.TronoChannelManagement.openManager());
      await page.locator('#channelName').fill('Rascunho preservado');
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/management-dialog.png'),
      });
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.TronoChannelManagement.openManager());
      await expect(page.locator('#channelName')).toHaveValue('Rascunho preservado');
      await presentAccount(page, { permissions: { manageChannels: false } });
      await expect(page.locator('#channelManagerDialog')).toBeHidden();
      await expect(page.locator('#createChannelBtn')).toBeHidden();
      assert.deepEqual(errors, []);
    } finally {
      if (held) await held.abort().catch(() => {});
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
