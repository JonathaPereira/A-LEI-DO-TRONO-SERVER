'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { installCanvasCamera } = require('./camera-fixture');
const { exerciseStreamControls } = require('./stream-controls-flow.cjs');

test(
  'exported web players keep keyboard, drag and fullscreen controls while receiving live frames',
  { timeout: 90000 },
  async () => {
    const server = await new Promise((resolve) => {
      const server = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(server));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser;
    const errors = [];
    try {
      fixture = await startFixture({ port: 10965, appOrigin: origin });
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      async function client(index) {
        const email = `stream-idle-${index}@example.test`,
          nickname = `Idle ${index}`;
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        const data = (await fixture.call('login', { email, password: 'Senha12!' })).data;
        const context = await browser.newContext({
          viewport: { width: 1440, height: 960 },
          permissions: ['microphone', 'camera'],
        });
        await context.route('**/*', (route) =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort(),
        );
        await context.addInitScript(installCanvasCamera, { display: true });
        await context.addInitScript(
          ({ base, data }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoNoiseSuppression', '0');
            const Peer = window.RTCPeerConnection;
            window.RTCPeerConnection = class extends Peer {
              constructor(config) {
                super({ ...config, iceServers: [], iceCandidatePoolSize: 0 });
              }
            };
          },
          { base: fixture.base, data },
        );
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await page.locator('[data-voice-channel=chat-livre]').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        await page.evaluate(() => {
          window.TronoPortal.openGame(true);
          window.TronoSocial.showForRoom(true);
        });
        await expect(page.locator('#setupScreen')).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        return page;
      }
      const owner = await client(1),
        viewer = await client(2);
      await owner.evaluate(() => window.TronoCallToolbar.activate('screenShareBtn'));
      await owner.locator('#screenOptionsConfirm').click();
      await expect.poll(() => owner.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      const id = await owner.evaluate(() => window.TronoNetwork.clientId);
      const tile = viewer.locator(`.screen-share-tile[data-peer="${id}"]`);
      await expect(tile).toHaveClass(/stream-invitation/);
      await tile.getByRole('button', { name: 'Assistir stream', exact: true }).click();
      await expect
        .poll(
          () =>
            tile
              .locator('video')
              .evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames),
          { timeout: 15000 },
        )
        .toBeGreaterThan(0);
      await exerciseStreamControls(viewer, tile);
      // Docking a watched stream must leave both the stream's maximize button
      // and the participant's profile button clickable with the pointer.
      const card = viewer.locator(`#voiceRoster .voice-person[data-peer="${id}"]`);
      await card.locator('.participant-expand').click();
      await card.locator('.participant-media-layout select').selectOption('screen');
      await card.locator('.participant-expand').click();
      const docked = card.locator('.participant-screen-slot .screen-share-tile');
      await expect(docked).toHaveClass(/has-video/);
      await docked.hover();
      await docked.locator('.media-fullscreen-btn').click();
      await expect.poll(() => viewer.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await docked.hover();
      await docked.locator('.media-fullscreen-btn').click();
      await expect.poll(() => viewer.evaluate(() => !!document.fullscreenElement)).toBe(false);
      await card.locator('.participant-expand').click();
      await card.locator('.participant-media-layout select').selectOption('stage');
      await card.locator('.participant-expand').click();
      // Unwatched invitations must remain actionable after the idle duration.
      await tile.hover();
      await tile.getByRole('button', { name: 'Parar de assistir', exact: true }).click();
      await expect(tile).toHaveClass(/stream-invitation/);
      await viewer.mouse.move(2, 2);
      await viewer.waitForTimeout(3200);
      await expect(tile).not.toHaveClass(/screen-controls-idle/);
      await expect(
        tile.getByRole('button', { name: 'Assistir stream', exact: true }),
      ).toBeVisible();
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
