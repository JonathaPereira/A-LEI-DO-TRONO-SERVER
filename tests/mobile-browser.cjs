'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test('phone navigation uses 4-tab Conceito A, opens Voice Hub with 1-tap pre-join, hides Membros by default, and prompts Android background permissions on launch', { timeout: 120000 }, async () => {
  const server = express().use(express.static(path.resolve('out'))).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const fixture = await startFixture({ port: 11985, appOrigin: origin });
  let browser;
  try {
    const email = 'android-ui@example.test';
    await fixture.call('signup', { email, nickname: 'Ana Mobile', password: 'Senha12!' });
    await fixture.call('verify', { token_hash: [...fixture.links.keys()].at(-1), type: 'signup' });
    const initial = (await fixture.call('login', { email, password: 'Senha12!' })).data;
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      args: [
        '--no-sandbox',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--mute-audio',
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ['microphone'],
      isMobile: true,
      hasTouch: true,
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
    );
    await context.addInitScript(
      ({ base, initial }) => {
        window.TRONO_BACKEND_URL = base;
        sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
        for (const key of ['tronoMusicEnabled', 'tronoSfxEnabled', 'tronoNoiseSuppression'])
          localStorage.setItem(key, '0');
        window.__sockets = [];
        const Socket = window.WebSocket;
        window.WebSocket = class extends Socket {
          constructor(...args) {
            super(...args);
            window.__sockets.push(this);
          }
        };
        // Simulate Android native host with missing battery optimization permission on startup.
        let bgStatus = {
          microphone: true,
          notifications: true,
          batteryUnrestricted: false,
          bluetooth: true,
          audioRoute: 'speaker',
          bluetoothAvailable: true,
          allReady: false,
        };
        window.__androidCalls = [];
        window.TronoAndroid = {
          version: '2.3.1',
          prepareVoice: async () => {},
          stopVoice: () => {},
          minimize: async () => {},
          getPermission: () => 'granted',
          requestPermission: async () => 'granted',
          getBackgroundStatus: async () => ({ ...bgStatus }),
          requestBackgroundPermissions: async () => {
            window.__androidCalls.push('runtime');
            return { ...bgStatus };
          },
          requestBatteryExemption: async () => {
            window.__androidCalls.push('battery');
            bgStatus = { ...bgStatus, batteryUnrestricted: true, allReady: true };
            return { ...bgStatus };
          },
          setAudioRoute: async (route) => {
            window.__androidCalls.push('route:' + route);
            bgStatus = { ...bgStatus, audioRoute: route };
            return { audioRoute: route, bluetoothAvailable: true };
          },
          updateCallNotification: async (room, muted) => {
            window.__androidCalls.push(`notif:${room}:${muted}`);
          },
          onCallAction: () => () => {},
          notify: async () => {},
          readSession: async () => null,
          saveSession: async () => {},
          onNotificationClick: () => () => {},
          setAccount: async () => {},
          pushRegistration: async () => ({ configured: false, deviceId: 'qa-device' }),
        };
      },
      { base: fixture.base, initial },
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.TronoCommunity?.getSnapshot().presence?.directoryReady);

    // 1. Startup Android permissions modal must appear immediately on launch without user hunting.
    const permModal = page.locator('[data-android-permissions-modal]');
    await expect(permModal).toBeVisible();
    await permModal.getByRole('button', { name: /Liberar permissão restante|Permitir tudo agora/ }).click();
    await expect(permModal).toBeHidden();
    assert(
      await page.evaluate(() => window.__androidCalls.includes('battery')),
      'Startup modal must trigger native battery exemption flow',
    );

    // 2. Membros starts hidden on phone so chat/voice own 100% of the viewport.
    const nav = page.getByRole('navigation', { name: 'Navegação do celular' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Membros da Corte' })).toBeHidden();
    const initialWidth = (await page.locator('#chatOnlyScreen').boundingBox()).width;
    assert(initialWidth >= 388, 'Chat must span full phone width: ' + initialWidth);

    // Membros still opens cleanly on demand from header button.
    await page.getByRole('button', { name: 'Mostrar membros', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Membros da Corte' })).toBeVisible();
    await page.getByRole('button', { name: 'Ocultar lista de membros', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Membros da Corte' })).toBeHidden();

    await fs.mkdir('artifacts/android/screens', { recursive: true });
    await page.screenshot({ path: 'artifacts/android/screens/mobile-chat.png' });

    // 3. Validate 4-tab geometry across all phone viewports (no horizontal overflow, >=44px touch targets).
    for (const [width, height] of [
      [360, 740],
      [390, 844],
      [600, 960],
      [740, 390],
    ]) {
      await page.setViewportSize({ width, height });
      const geometry = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Navegação do celular"]');
        const rect = nav.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          bottom: rect.bottom,
          top: rect.top,
          height: innerHeight,
          count: nav.querySelectorAll('button').length,
          actions: [...nav.querySelectorAll('button')].map((n) => ({
            w: n.getBoundingClientRect().width,
            h: n.getBoundingClientRect().height,
          })),
        };
      });
      assert.equal(geometry.count, 4, 'Conceito A mobile navigation must have 4 clean tabs');
      assert(geometry.overflow <= 1, JSON.stringify(geometry));
      assert(geometry.bottom <= height && geometry.top >= 0, JSON.stringify(geometry));
      assert(
        geometry.actions.every((n) => n.w >= 44 && n.h >= 44),
        JSON.stringify(geometry),
      );
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await nav.getByRole('button', { name: 'Jogos', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'O que vamos jogar?' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/android/screens/mobile-games.png' });

    // 4. Dedicated Voice Hub ("Voz" tab) -> Pre-join bottom sheet -> Join call cleanly.
    await nav.getByRole('button', { name: 'Voz', exact: true }).click();
    const voiceHub = page.locator('[data-mobile-voice-hub]');
    await expect(voiceHub).toBeVisible();
    await page.screenshot({ path: 'artifacts/android/screens/mobile-voice-hub.png' });
    await voiceHub.locator('[data-mobile-voice-room="chat-jogos"]').click();
    const prejoin = voiceHub.locator('[data-voice-prejoin="chat-jogos"]');
    await expect(prejoin).toBeVisible();
    await prejoin.getByRole('button', { name: 'Entrar na chamada (Jogos)', exact: true }).click();
    await page.waitForFunction(() => window.TronoSocial.voiceJoined);
    await page.evaluate(() => {
      window.__sameTrack = window.TronoSocial.getLocalAudioTrack();
    });

    // 5. Call stage hides desktop shortcuts and exposes Android audio output route toggle.
    const callStage = page.locator('[aria-label="Chamada da Corte"]');
    await expect(callStage).toBeVisible();
    await expect(callStage.getByRole('button', { name: 'Atalhos e novidades' })).toBeHidden();
    const routeBtn = callStage.getByRole('button', { name: /Saída de áudio:/ });
    await expect(routeBtn).toBeVisible();
    await routeBtn.click();
    await expect(callStage.getByRole('button', { name: 'Saída de áudio: Bluetooth' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/android/screens/mobile-call.png' });

    // 6. Switching across Jogos, Perfil, Chat preserves 1 socket and the same live microphone track.
    await nav.getByRole('button', { name: 'Jogos', exact: true }).click();
    await expect(page.getByRole('button', { name: /Chamada em andamento/ })).toBeVisible();
    await nav.getByRole('button', { name: 'Perfil', exact: true }).click();
    await expect(page.locator('[data-mobile-profile-panel]')).toBeVisible();
    await page.screenshot({ path: 'artifacts/android/screens/mobile-profile.png' });
    await nav.getByRole('button', { name: 'Chat', exact: true }).click();

    const continuity = await page.evaluate(() => ({
      sockets: window.__sockets.length,
      joined: window.TronoSocial.voiceJoined,
      same: window.__sameTrack === window.TronoSocial.getLocalAudioTrack(),
      track: window.__sameTrack.readyState,
    }));
    assert.deepEqual(continuity, { sockets: 1, joined: true, same: true, track: 'live' });

    await page.getByRole('button', { name: /Chamada em andamento/ }).click();
    await expect(callStage).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(nav).toBeHidden();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await fixture.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
