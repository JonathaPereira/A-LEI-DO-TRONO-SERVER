'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const path = require('node:path'),
  express = require('express'),
  WebSocket = require('ws');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { installCanvasCamera } = require('./camera-fixture');
const { assertThroneSeats } = require('./throne-seat-assertions.cjs');
const { assertThroneTable } = require('./throne-table-assertions.cjs');
test(
  'throne React lobby handles seats, rejected transfers, online/local games and preserves live call resources',
  { timeout: 120000 },
  async (t) => {
    const origin = 'http://127.0.0.1:10934';
    const server = express()
      .use(express.static(path.resolve(__dirname, '../out')))
      .listen(10934, '127.0.0.1');
    let fixture, browser, context;
    t.signal.addEventListener(
      'abort',
      () => {
        void context?.close();
      },
      { once: true },
    );
    const peers = [],
      errors = [];
    try {
      fixture = await startFixture({ port: 10933, appOrigin: origin });
      await fixture.call('signup', {
        email: 'throne@example.test',
        nickname: 'Casa Humana',
        password: 'Senha12!',
      });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (
        await fixture.call('login', { email: 'throne@example.test', password: 'Senha12!' })
      ).data;
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
      context = await browser.newContext({
        viewport: { width: 1440, height: 960 },
        permissions: ['microphone', 'camera'],
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
          navigator.mediaDevices.getDisplayMedia = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            ctx.fillRect(0, 0, 1280, 720);
            return canvas.captureStream(15);
          };
        },
        { base: fixture.base, data },
      );
      await context.addInitScript(installCanvasCamera);
      const page = await context.newPage();
      page.on('dialog', (dialog) => dialog.accept());
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.locator('[data-voice-channel=chat-jogos]').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await page.locator('[data-control=cameraBtn]').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await page.evaluate(() => window.TronoSocial.startScreenShare());
      await page.locator('[data-control=muteMicBtn]').first().click();
      await page.evaluate(() => {
        window.__throneCall = {
          mic: window.TronoSocial.getLocalAudioTrack(),
          camera: window.TronoSocial.getMediaSources()
            .find((s) => s.self)
            .camera.getVideoTracks()[0],
          screen: window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0],
          client: window.TronoNetwork.clientId,
        };
        window.__throneHosts = [
          'roomGrid',
          'roomSeats',
          'readyOnlineBtn',
          'startOnlineBtn',
          'backToLobbyBtn',
          'roomSocialBtn',
        ].map((id) => document.getElementById(id));
      });
      async function preserved() {
        const result = await page.evaluate(() => {
          const b = window.__throneCall,
            call = window.TronoSocial;
          return {
            mic:
              call.getLocalAudioTrack() === b.mic && !b.mic.enabled && b.mic.readyState === 'live',
            camera:
              call
                .getMediaSources()
                .find((s) => s.self)
                ?.camera?.getVideoTracks()[0] === b.camera && b.camera.readyState === 'live',
            screen:
              call.getLocalDisplayStream()?.getVideoTracks()[0] === b.screen &&
              b.screen.readyState === 'live',
            socket: window.TronoNetwork.clientId === b.client,
            voice: window.TronoNetwork.primaryRoom === 'chat-jogos' && call.voiceJoined,
            hosts: window.__throneHosts.every(
              (node) =>
                node.isConnected &&
                document.getElementById(node.id) === node &&
                document.querySelectorAll('#' + node.id).length === 1,
            ),
          };
        });
        assert.deepEqual(result, Object.fromEntries(Object.keys(result).map((key) => [key, true])));
      }
      async function guest(name, roomId) {
        const ws = new WebSocket(fixture.base.replace('http', 'ws') + '/ws'),
          messages = [];
        peers.push(ws);
        ws.on('message', (raw) => messages.push(JSON.parse(raw)));
        require('./court-peer-fixture')(ws);
        await new Promise((resolve) => ws.once('open', resolve));
        ws.send(JSON.stringify({ type: 'guest-authenticate', name }));
        await expect.poll(() => messages.some((m) => m.type === 'guest-result' && m.ok)).toBe(true);
        ws.send(JSON.stringify({ type: 'join-game-room', roomId }));
        await expect.poll(() => messages.some((m) => m.type === 'joined-game-room')).toBe(true);
        return ws;
      }
      await page.evaluate(() => {
        window.TronoPortal.openGame(true);
        window.TronoSocial.showPanel(false);
      });
      await page.locator('.room-enter[data-room="sala-cetro"]').click();
      await expect(page.locator('#roomSeats')).toContainText('Casa Humana');
      await expect(page.locator('#roomSeats .room-seat')).toHaveCount(4);
      await expect(page.locator('#startOnlineBtn')).toBeDisabled();
      await preserved();
      assert(
        await page.evaluate(
          () =>
            Object.isFrozen(window.TronoThroneLobby.getSnapshot().room.players[0]) &&
            !window.TronoAvatars &&
            !window.TronoProfile.avatarHtml &&
            !window.TronoProfile.hydrate,
        ),
      );
      const buddy = await guest('Casa Aliada', 'sala-cetro');
      await expect(page.locator('#roomSeats')).toContainText('CONVIDADO');
      buddy.send(JSON.stringify({ type: 'ready', ready: true }));
      await page.locator('#readyOnlineBtn').click();
      await expect(page.locator('#readyOnlineBtn')).toContainText('Retirar Pronto');
      await expect(page.locator('#startOnlineBtn')).toBeEnabled();
      {
        // Current Corte presentation; retain viewport and interaction coverage.
        await preserved();
        await expect(page.locator('#roomSeats .is-ready')).toHaveCount(2);
      }
      for (let i = 0; i < 4; i++) await guest('Ocupante ' + i, 'sala-mascara');
      // Resuming a lobby now returns to that lobby. Exercise the public transfer
      // command to verify rejection preserves the previous seat and readiness.
      await page.evaluate(() => window.TronoThroneLobby.enter('sala-mascara'));
      await expect(page.locator('#roomOnlineStatus')).toContainText('Mesa cheia');
      await expect(page.locator('#selectedRoomName')).toHaveText('Sala do Cetro');
      await expect(page.locator('#roomSeats')).toContainText('Casa Humana');
      await preserved();
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/throne-lobby-ready.png'),
      });
      await page.locator('#startOnlineBtn').click();
      await expect(page.locator('#gameScreen')).toBeVisible();
      await expect
        .poll(() => page.locator('#throneOnlineHandCards .hand-card').count())
        .toBeGreaterThan(0);
      await preserved();
      await expect(page.locator('#speedBtn')).toBeDisabled();
      await expect(page.locator('#speedBtn')).toContainText('Online');
      // Match cancellation releases only the game; the M&N call keeps all its tracks.
      await page.evaluate(() => document.getElementById('restartBtn').click());
      await expect(page.locator('#setupScreen')).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.TronoNetwork.gameRoom)).toBe(null);
      await preserved();
      await page.locator('.room-enter[data-room="sala-chave"]').click();
      await expect(page.locator('#roomSeats')).toContainText('Casa Humana');
      await page.locator('#roomScreen details').evaluate((node) => {
        node.open = true;
      });
      await page.evaluate(() => window.__LeiDoTrono.setFast());
      await page.locator('#startHumanBtn').click();
      await expect(page.locator('#gameScreen')).toBeVisible();
      await expect.poll(() => page.locator('#humanHand .hand-card').count()).toBeGreaterThan(0);
      assert(await page.evaluate(() => !window.__LeiDoTrono.getState().online));
      await expect(page.locator('#speedBtn')).toBeEnabled();
      await expect(page.locator('#speedBtn')).toContainText('Rápido');
      assert.equal(await page.evaluate(() => window.TronoThroneControls.getSnapshot().scale), 0.05);
      await assertThroneSeats(page, true);
      await assertThroneTable(page, true);
      assert(
        await page.evaluate(() => !Object.isFrozen(window.__LeiDoTrono.getState().players[0].hand)),
      );
      {
        // Current Corte presentation; retain viewport and interaction coverage.
        await assertThroneSeats(page);
        await assertThroneTable(page);
      }
      await preserved();
      await page.evaluate(() => document.getElementById('restartBtn').click());
      await expect(page.locator('#setupScreen')).toBeVisible();
      await preserved();
      // A delayed validation must not reopen the lobby after navigating away.
      await page.evaluate(() => {
        const validate = window.TronoPortal.validateIdentity;
        window.TronoPortal.validateIdentity = () =>
          new Promise((resolve) => {
            window.__releaseThroneValidation = () => {
              window.TronoPortal.validateIdentity = validate;
              resolve({ ok: true, name: 'Casa Humana' });
            };
          });
      });
      await page.locator('.room-enter[data-room="sala-chave"]').click();
      await page.waitForFunction(() => window.__releaseThroneValidation);
      await page.evaluate(() => window.TronoPortal.showPortal());
      await expect
        .poll(() => page.evaluate(() => window.TronoThroneLobby.getSnapshot().entering))
        .toBe(false);
      await page.evaluate(() => window.__releaseThroneValidation());
      await expect(page.locator('#portalScreen')).toBeVisible();
      await preserved();
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/throne-lobby-portal.png'),
      });
      assert.deepEqual(errors, []);
    } finally {
      peers.forEach((ws) => ws.terminate());
      await context?.close();
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
