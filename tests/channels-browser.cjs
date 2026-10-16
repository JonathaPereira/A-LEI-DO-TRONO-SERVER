'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'React channels preserve voice, selection, presence, unread and mute through catalog updates and deletion',
  { timeout: 60000 },
  async () => {
    const server = await new Promise((resolve) => {
      const listener = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 11975, appOrigin: origin });
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
      const owner = await account('jonathapereira.jj@gmail.com', 'Criador Canais');
      const member = await account('channels-member@example.test', 'Amigo Canais');
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      async function client(data) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          permissions: ['microphone', 'camera'],
        });
        await context.route('**/*', (route) =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort(),
        );
        await context.addInitScript(
          ({ base, data }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            window.__captureCount = 0;
            const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = (constraints) => {
              window.__captureCount++;
              return capture(constraints);
            };
          },
          { base: fixture.base, data },
        );
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await page.evaluate(() => window.TronoChatHub.enter({ channelId: 'chat-livre' }));
        await expect
          .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
          .toBe('chat-livre');
        return page;
      }
      const page = await client(owner),
        sender = await client(member);
      const create = (body) =>
        page.evaluate(
          (body) => window.TronoCommunityAdmin.api('/channels', { method: 'POST', body }),
          body,
        );
      const text = (await create({ name: 'Texto React', type: 'text' })).channel;
      const voice = (await create({ name: 'Voz React', type: 'voice' })).channel;
      const row = (id) => page.locator(`[data-chat-channel="${id}"]`);
      await expect(page.locator(`#textChannelList [data-chat-channel="${text.id}"]`)).toBeVisible();
      await expect(
        page.locator(`#chatChannelList [data-chat-channel="${voice.id}"]`),
      ).toBeVisible();
      await row(text.id).click();
      await expect(row(text.id)).toHaveAttribute('aria-current', 'page');
      assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
      assert.equal(await page.evaluate(() => window.__captureCount), 0);
      await row(voice.id).click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await expect(row(voice.id).locator('.community-avatar')).toHaveCount(1);
      await page.evaluate(() => {
        window.__keptMic = window.TronoSocial.getLocalAudioTrack();
        window.__keptClient = window.TronoNetwork.clientId;
        window.__keptCaptures = window.__captureCount;
      });
      const preserved = async () =>
        assert(
          await page.evaluate(
            () =>
              window.TronoSocial.voiceJoined &&
              window.TronoSocial.getLocalAudioTrack() === window.__keptMic &&
              window.__keptMic.readyState === 'live' &&
              window.TronoNetwork.clientId === window.__keptClient &&
              window.__captureCount === window.__keptCaptures,
          ),
        );
      await row(text.id).click();
      await expect(row(text.id)).toHaveClass(/active/);
      await expect(row(voice.id)).toHaveAttribute('aria-current', 'false');
      await preserved();

      await sender.evaluate(() => window.TronoNetwork.sendChat('Mensagem em outro canal'));
      await expect(row('chat-livre').locator('.channel-unread')).toHaveText('1');
      await page.evaluate(() => window.TronoNotifications.mute('chat-livre', true));
      await expect(row('chat-livre')).toHaveClass(/channel-muted/);
      await page.evaluate(() => window.TronoNetwork.requestChatChannels());
      await expect(row('chat-livre').locator('.channel-unread')).toHaveText('1');
      await expect(row('chat-livre')).toHaveClass(/channel-muted/);
      await expect(row(text.id)).toHaveAttribute('aria-current', 'page');
      await preserved();

      // Deleting the selected text channel must not tear down the independent voice room.
      await page.evaluate(
        (id) => window.TronoCommunityAdmin.api('/channels/' + id, { method: 'DELETE' }),
        text.id,
      );
      await expect(row(text.id)).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.TronoNetwork.currentRoom)).toBe(null);
      assert.equal(await page.evaluate(() => window.TronoNetwork.primaryRoom), voice.id);
      await preserved();
      await row(voice.id).click();
      await expect(row(voice.id)).toHaveAttribute('aria-current', 'page');
      await preserved();

    // Reading clears the badge while the channel remains muted.
      await row('chat-livre').click();
      await page.evaluate(() => window.TronoSocial.toggleTextChat(true));
      await page.locator('#courtChatInput').click();
      await expect(row('chat-livre').locator('.channel-unread')).toHaveCount(0);
      await expect(row('chat-livre')).toHaveClass(/channel-muted/);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
