'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test('phone navigation keeps account, community, one socket and microphone while changing screens', { timeout: 120000 }, async () => {
  const server = express().use(express.static(path.resolve('out'))).listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const fixture = await startFixture({ port: 11985, appOrigin: origin });
  let browser;
  try {
    const email = 'android-ui@example.test';
    await fixture.call('signup', { email, nickname: 'Ana Mobile', password: 'Senha12!' });
    await fixture.call('verify', { token_hash: [...fixture.links.keys()].at(-1), type: 'signup' });
    const initial = (await fixture.call('login', { email, password: 'Senha12!' })).data;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--mute-audio'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'], isMobile: true, hasTouch: true });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript(({ base, initial }) => {
      window.TRONO_BACKEND_URL = base;
      sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
      for (const key of ['tronoMusicEnabled', 'tronoSfxEnabled', 'tronoNoiseSuppression']) localStorage.setItem(key, '0');
      window.__sockets = [];
      const Socket = window.WebSocket;
      window.WebSocket = class extends Socket { constructor(...args) { super(...args); window.__sockets.push(this); } };
    }, { base: fixture.base, initial });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.TronoCommunity?.getSnapshot().presence?.directoryReady);
    const nav = page.getByRole('navigation', { name: 'Navegação do celular' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Membros da Corte' })).toBeVisible();
    await fs.mkdir('artifacts/android/screens', { recursive: true });
    await page.screenshot({ path: 'artifacts/android/screens/mobile-chat.png' });
    await nav.getByRole('button', { name: 'Recolher membros no celular', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Membros da Corte' })).toBeHidden();
    await nav.getByRole('button', { name: 'Jogos', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'O que vamos jogar?' })).toBeVisible();
    for (const [width, height] of [[360, 740], [390, 844], [600, 960], [740, 390]]) {
      await page.setViewportSize({ width, height });
      const geometry = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Navegação do celular"]');
        const rect = nav.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - innerWidth, bottom: rect.bottom, top: rect.top, height: innerHeight, actions: [...nav.querySelectorAll('button')].map(n => ({ w: n.getBoundingClientRect().width, h: n.getBoundingClientRect().height })) };
      });
      assert(geometry.overflow <= 1, JSON.stringify(geometry));
      assert(geometry.bottom <= height && geometry.top >= 0, JSON.stringify(geometry));
      assert(geometry.actions.every(n => n.w >= 44 && n.h >= 44), JSON.stringify(geometry));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/android/screens/mobile-games.png' });
    await nav.getByRole('button', { name: 'Canais e opções', exact: true }).click();
    await page.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
    await page.waitForFunction(() => window.TronoSocial.voiceJoined);
    await page.evaluate(() => { window.__sameTrack = window.TronoSocial.getLocalAudioTrack(); });
    await page.screenshot({ path: 'artifacts/android/screens/mobile-call.png' });
    await nav.getByRole('button', { name: 'Jogos', exact: true }).click();
    await expect(page.getByRole('button', { name: /Chamada em andamento/ })).toBeVisible();
    await nav.getByRole('button', { name: 'Amigos e mensagens', exact: true }).click();
    await nav.getByRole('button', { name: 'Conversas', exact: true }).click();
    const continuity = await page.evaluate(() => ({ sockets: window.__sockets.length, joined: window.TronoSocial.voiceJoined, same: window.__sameTrack === window.TronoSocial.getLocalAudioTrack(), track: window.__sameTrack.readyState }));
    assert.deepEqual(continuity, { sockets: 1, joined: true, same: true, track: 'live' });
    await page.getByRole('button', { name: /Chamada em andamento/ }).click();
    await expect(page.locator('[aria-label="Chamada da Corte"]')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(nav).toBeHidden();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); await fixture.stop();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
