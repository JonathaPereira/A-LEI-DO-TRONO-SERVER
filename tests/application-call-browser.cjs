'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { installCanvasCamera } = require('./camera-fixture');

test(
  'Corte call keeps its borrowed player and live capture through focus and navigation',
  { timeout: 90000 },
  async () => {
    const server = await new Promise((resolve) => {
      const s = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 11993, appOrigin: origin });
    let browser, page;
    const errors = [];
    try {
      const email = 'call-corte@example.test',
        password = 'Senha12!';
      await fixture.call('signup', { email, nickname: 'Ana da Corte', password });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (await fixture.call('login', { email, password })).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        permissions: ['camera', 'microphone'],
      });
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
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
      await context.addInitScript(installCanvasCamera);
      page = await context.newPage();
      page.setDefaultTimeout(7000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      await page.getByRole('button', { name: 'Entrar na voz de Geral', exact: true }).click();
      const call = page.getByRole('region', { name: 'Chamada da Corte', exact: true });
      await expect(call).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await call.getByRole('button', { name: 'Ligar câmera', exact: true }).click();
      const person = call.locator('[data-call-person]').first(),
        video = person.locator('video');
      await expect(video).toBeVisible();
      await expect.poll(() => video.evaluate((v) => !!v.srcObject && v.readyState >= 2)).toBe(true);
      await page.evaluate(() => {
        window.__callPlayer = document.querySelector('[data-call-person] video');
        window.__callStream = window.__callPlayer.srcObject;
        window.__callMic = window.TronoSocial.getLocalAudioTrack();
        window.__callId = window.TronoNetwork.getSnapshot().clientId;
      });
      assert(await page.evaluate(() => !!window.__callId));
      await call.getByRole('button', { name: 'Mostrar conversa da chamada', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Mensagem no canal', exact: true })
        .fill('Rascunho sem interromper voz');
      await call.getByRole('button', { name: 'Ocultar conversa da chamada', exact: true }).click();
      await person.click({ position: { x: 80, y: 80 } });
      await expect(person).toHaveAttribute('data-focused', 'true');
      await page.keyboard.press('Escape');
      await expect(person).toHaveAttribute('data-focused', 'false');
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await expect(page.locator('#gamesScreen')).toBeVisible();
      await page.getByRole('button', { name: 'Voltar à chamada', exact: true }).click();
      await expect(call).toBeVisible();
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await page.locator('button[data-game="throne"]').click();
      await expect(page.locator('#setupScreen')).toBeVisible();
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('#cameraGrid video, #voiceRoster video') === window.__callPlayer,
        ),
        true,
      );
      await page.locator('#backFromLobbyBtn').click();
      await page.getByRole('button', { name: 'Voltar à chamada', exact: true }).click();
      await page.locator('[data-channel="chat-jogos"]').click();
      await expect(call).toBeHidden();
      await expect(
        page.getByRole('textbox', { name: 'Mensagem no canal', exact: true }),
      ).toHaveValue('Rascunho sem interromper voz');
      await page.getByRole('button', { name: 'Voltar à chamada', exact: true }).click();
      await expect(call).toBeVisible();
      assert.equal(
        await page.evaluate(
          () =>
            window.__callPlayer === document.querySelector('[data-call-person] video') &&
            window.__callStream === window.__callPlayer.srcObject &&
            window.__callStream.getTracks().every((t) => t.readyState === 'live') &&
            window.__callMic === window.TronoSocial.getLocalAudioTrack() &&
            window.__callMic.readyState === 'live' &&
            window.__callId === window.TronoNetwork.getSnapshot().clientId,
        ),
        true,
      );
      await call.getByRole('button', { name: 'Configurações', exact: true }).click();
      const settings = page.getByRole('dialog', { name: 'Voz e vídeo', exact: true });
      await expect(settings).toBeVisible();
      await settings.getByRole('button', { name: 'Vídeo', exact: true }).click();
      await expect(settings.getByRole('combobox', { name: 'Câmera', exact: true })).toBeVisible();
      await settings.getByRole('button', { name: 'Áudio', exact: true }).click();
      await settings.locator('#outputGainSlider').fill('150');
      await expect(settings.locator('#outputGainValue')).toHaveText('150%');
      await settings.getByRole('button', { name: 'Conexão', exact: true }).click();
      await settings.getByRole('button', { name: 'Abrir diagnóstico', exact: true }).click();
      await expect(
        settings
          .getByRole('region', { name: 'Diagnóstico da chamada', exact: true })
          .getByText('WebRTC P2P', { exact: true }),
      ).toBeVisible();
      await settings.getByRole('button', { name: 'Áudio', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
      assert.equal(
        await page.evaluate(
          () =>
            window.__callPlayer.srcObject === window.__callStream &&
            window.__callMic.readyState === 'live',
        ),
        true,
      );
      await fs.mkdir('artifacts/frontend-reset/call-qa', { recursive: true });
      for (const [width, height] of [
        [1440, 900],
        [1024, 768],
        [768, 1024],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        assert.equal(await call.evaluate((n) => n.scrollWidth <= n.clientWidth + 1), true);
        await page.screenshot({ path: 'artifacts/frontend-reset/call-qa/call-' + width + '.png' });
        await call.getByRole('button', { name: 'Configurações', exact: true }).click();
        await expect(settings).toBeVisible();
        assert.equal(await settings.evaluate((n) => n.scrollWidth <= n.clientWidth + 1), true);
        await page.screenshot({
          path: 'artifacts/frontend-reset/call-qa/settings-' + width + '.png',
        });
        await page.keyboard.press('Escape');
      }
      assert.deepEqual(errors, []);
    } finally {
      if (page) {
        await fs.mkdir('artifacts/frontend-reset/call-qa', { recursive: true });
        await page
          .screenshot({ path: 'artifacts/frontend-reset/call-qa/current.png' })
          .catch(() => {});
      }
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test(
  'voice and stream menus keep independent volumes and stop watching without leaving the call',
  { timeout: 90000 },
  async () => {
    const server = await new Promise((resolve) => {
      const s = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 11993, appOrigin: origin });
    let browser;
    const pages = [],
      errors = [];
    try {
      const accounts = [];
      for (const [email, nickname] of [
        ['call-host@example.test', 'Ana'],
        ['call-viewer@example.test', 'Bruno'],
        ['call-peer-two@example.test', 'Clara'],
        ['call-peer-three@example.test', 'Diego'],
        ['call-peer-four@example.test', 'Elisa'],
        ['call-peer-five@example.test', 'Fábio'],
        ['call-peer-six@example.test', 'Gabi'],
        ['call-peer-seven@example.test', 'Henrique'],
        ['call-peer-eight@example.test', 'Isadora'],
        ['call-peer-nine@example.test', 'Jonas'],
      ]) {
        // Seed disposable accounts in two batches; no clients are connected yet.
        // Restart only the fixture backend so production's signup limit remains unchanged.
        if (accounts.length === 5) await fixture.restart();
        const signup = await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        assert.equal(signup.status, 200, 'Fixture signup must succeed');
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        const login = await fixture.call('login', { email, password: 'Senha12!' });
        assert.equal(login.status, 200, 'Fixture login must succeed');
        accounts.push(login.data);
      }
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      for (const data of accounts) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          permissions: ['camera', 'microphone'],
        });
        await context.addInitScript(
          ({ base, data }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
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
        await context.addInitScript(installCanvasCamera, {
          display: true,
          demo: { name: data.user.nickname, index: accounts.indexOf(data) },
        });
        await context.addInitScript(() => {
          const display = navigator.mediaDevices.getDisplayMedia;
          navigator.mediaDevices.getDisplayMedia = async (options) => {
            const stream = await display(options);
            // Synthetic screen audio; this verifies routing, not microphone hardware or OS capture.
            const audio = new AudioContext(),
              tone = audio.createOscillator(),
              out = audio.createMediaStreamDestination();
            tone.connect(out);
            tone.start();
            stream.addTrack(out.stream.getAudioTracks()[0]);
            window.__syntheticAudio = audio;
            return stream;
          };
        });
        const page = await context.newPage();
        pages.push(page);
        page.setDefaultTimeout(10000);
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(origin);
        await expect(page.locator('#chatOnlyScreen')).toBeVisible();
        await page.getByRole('button', { name: 'Entrar na voz de Geral', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      }
      const [host, viewer] = pages,
        call = viewer.getByRole('region', { name: 'Chamada da Corte', exact: true });
      for (const index of [0, 2, 4, 7]) {
        await pages[index]
          .getByRole('region', { name: 'Chamada da Corte', exact: true })
          .getByRole('button', { name: 'Ligar câmera', exact: true })
          .click();
        await expect
          .poll(() => pages[index].evaluate(() => window.TronoSocial.cameraOn))
          .toBe(true);
      }
      await host
        .getByRole('region', { name: 'Chamada da Corte', exact: true })
        .getByRole('button', { name: 'Compartilhar tela', exact: true })
        .click();
      await host.locator('#screenOptionsConfirm').click();
      await expect.poll(() => host.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      await pages[2]
        .getByRole('region', { name: 'Chamada da Corte', exact: true })
        .getByRole('button', { name: 'Compartilhar tela', exact: true })
        .click();
      await pages[2].locator('#screenOptionsConfirm').click();
      await expect(call.locator('[data-call-person]')).toHaveCount(10);
      await expect(call.locator('[data-call-screen]')).toHaveCount(2);
      const stream = call.getByRole('article', { name: 'Tela de Ana', exact: true });
      await stream.click({ position: { x: 65, y: 45 } });
      await expect(stream).toHaveAttribute('data-focused', 'true');
      try {
        await expect
          .poll(() => stream.locator('video').evaluate((v) => !!v.srcObject && v.readyState >= 2), {
            timeout: 15000,
          })
          .toBe(true);
      } catch (error) {
        for (const page of pages)
          console.log(
            'media probe',
            JSON.stringify(
              await page.evaluate(() => ({
                people: window.TronoCallStage.getSnapshot().participants.map((p) => ({
                  id: p.id,
                  name: p.name,
                  screen: p.screen,
                  watching: p.watching,
                  live: p.screenLive,
                  tracks: p.screenStream
                    ?.getTracks()
                    .map((t) => ({ kind: t.kind, muted: t.muted, state: t.readyState })),
                })),
                videos: [...document.querySelectorAll('[data-call-video] video')].map((v) => ({
                  active: !!v.srcObject,
                  ready: v.readyState,
                  paused: v.paused,
                  tracks: v.srcObject
                    ?.getTracks()
                    .map((t) => ({ kind: t.kind, muted: t.muted, state: t.readyState })),
                })),
                diagnostics: window.TronoSocial.diagnostics(),
              })),
            ),
          );
        throw error;
      }
      const otherStream = call.getByRole('article', { name: 'Tela de Clara', exact: true });
      await otherStream.getByRole('button', { name: 'Assistir transmissão', exact: true }).click();
      await expect
        .poll(() =>
          otherStream.locator('video').evaluate((v) => !!v.srcObject && v.readyState >= 2),
        )
        .toBe(true);
      await expect.poll(() => call.locator('[data-call-person] video').count()).toBe(4);
      await expect(otherStream).toHaveAttribute('data-focused', 'true');
      await call.getByRole('button', { name: 'Grade', exact: true }).click();
      await fs.mkdir('artifacts/frontend-reset/call-qa', { recursive: true });
      await call.locator('[data-call-person]').first().scrollIntoViewIfNeeded();
      const bounds = await call
        .locator('[data-call-person], [data-call-screen]')
        .evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
          }),
        );
      const footer = await call.locator('footer').boundingBox(),
        heading = await call.locator(':scope > header').boundingBox();
      assert(
        bounds.every((r) => r.top >= heading.y + heading.height && r.bottom <= footer.y + 1),
        JSON.stringify(bounds),
      );
      assert.equal(
        new Set(bounds.map((r) => Math.round(r.top))).size,
        3,
        'Twelve tiles fit in three rows on desktop',
      );
      await viewer.screenshot({ path: 'artifacts/frontend-reset/call-qa/grid-ten-people.png' });
      await viewer.evaluate(() => {
        window.__demoPlayer = document.querySelector('[data-call-screen] video');
        window.__demoStream = window.__demoPlayer.srcObject;
      });
      await stream.click({ position: { x: 70, y: 60 } });
      await expect(stream).toHaveAttribute('data-focused', 'true');
      await viewer.screenshot({ path: 'artifacts/frontend-reset/call-qa/focus-ten-people.png' });
      for (const [width, height] of [
        [1920, 1080],
        [1440, 900],
        [1024, 768],
        [768, 1024],
        [390, 844],
      ]) {
        await viewer.setViewportSize({ width, height });
        const focusBox = await stream.boundingBox(),
          head = await call.locator(':scope > header').boundingBox(),
          controls = await call.locator('footer').boundingBox();
        assert(
          focusBox.x >= 0 &&
            focusBox.x + focusBox.width <= width + 1 &&
            focusBox.y >= head.y + head.height &&
            focusBox.y + focusBox.height < controls.y,
          JSON.stringify({ width, focusBox, controls }),
        );
        assert.equal(await call.evaluate((n) => n.scrollWidth <= n.clientWidth + 1), true);
        await viewer.screenshot({
          path: 'artifacts/frontend-reset/call-qa/focus-ten-' + width + '.png',
        });
        await stream.getByRole('button', { name: 'Voltar à grade', exact: true }).click();
        await call.locator('[data-call-person]').first().scrollIntoViewIfNeeded();
        await viewer.screenshot({
          path: 'artifacts/frontend-reset/call-qa/grid-ten-' + width + '.png',
        });
        await stream.getByRole('button', { name: 'Ampliar Ana', exact: true }).click();
      }
      await viewer.setViewportSize({ width: 1440, height: 900 });
      const camera = call.getByRole('article', { name: 'Participante Elisa', exact: true });
      await camera.click({ position: { x: 70, y: 45 } });
      await expect(camera).toHaveAttribute('data-focused', 'true');
      await viewer.screenshot({
        path: 'artifacts/frontend-reset/call-qa/camera-focus-ten-people.png',
      });
      await stream.click({ position: { x: 65, y: 45 } });
      await expect(stream).toHaveAttribute('data-focused', 'true');
      assert.equal(
        await viewer.evaluate(
          () =>
            window.__demoPlayer === document.querySelector('[data-call-screen] video') &&
            window.__demoPlayer.srcObject === window.__demoStream,
        ),
        true,
      );
      const last = call.getByRole('article', { name: 'Participante Jonas', exact: true });
      await last.scrollIntoViewIfNeeded();
      const mainBefore = await stream.boundingBox();
      await last.getByRole('button', { name: 'Ampliar Jonas', exact: true }).focus();
      await viewer.keyboard.press('Enter');
      await expect(last).toHaveAttribute('data-focused', 'true');
      await expect(last.getByRole('button', { name: 'Voltar à grade', exact: true })).toBeFocused();
      await stream.getByRole('button', { name: 'Ampliar Ana', exact: true }).click();
      const mainAfter = await stream.boundingBox();
      assert(
        Math.abs(mainAfter.x - mainBefore.x) < 1 &&
          Math.abs(mainAfter.width - mainBefore.width) < 1,
      );
      await call
        .getByRole('article', { name: 'Participante Ana', exact: true })
        .click({ button: 'right' });
      const voiceMenu = viewer.getByRole('dialog', { name: 'Opções de Ana', exact: true });
      await expect(voiceMenu).toBeVisible();
      await voiceMenu.getByRole('slider', { name: 'Volume da voz', exact: true }).fill('150');
      await expect(stream).toHaveAttribute('data-focused', 'true');

      await viewer.keyboard.press('Escape');
      await expect(stream).toHaveAttribute('data-focused', 'true');
      await stream.click({ button: 'right' });
      const screenMenu = viewer.getByRole('dialog', {
        name: 'Opções da transmissão de Ana',
        exact: true,
      });
      await expect(screenMenu).toBeVisible();
      const streamVolume = await screenMenu
        .getByRole('slider', { name: 'Volume da transmissão', exact: true })
        .inputValue();
      await screenMenu
        .getByRole('slider', { name: 'Volume da transmissão', exact: true })
        .fill('60');
      assert.notEqual(streamVolume, '60');
      assert.equal(
        await viewer.evaluate(
          () =>
            window.TronoCallStage.getSnapshot().participants.find((p) => p.name === 'Ana').volume,
        ),
        150,
      );
      await fs.mkdir('artifacts/frontend-reset/call-qa', { recursive: true });
      await viewer.screenshot({ path: 'artifacts/frontend-reset/call-qa/stream-menu.png' });
      await screenMenu.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => viewer.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await viewer.keyboard.press('Escape');
      await expect.poll(() => viewer.evaluate(() => !!document.fullscreenElement)).toBe(false);
      await expect(stream).toHaveAttribute('data-focused', 'true');
      await stream
        .getByRole('button', { name: 'Opções da transmissão de Ana', exact: true })
        .click();
      await screenMenu.getByRole('button', { name: 'Parar de assistir', exact: true }).click();
      await expect(
        stream.getByRole('button', { name: 'Assistir transmissão', exact: true }),
      ).toBeVisible();
      await expect(stream).toHaveAttribute('data-focused', 'false');
      assert.equal(
        await viewer.evaluate(
          () =>
            window.TronoSocial.voiceJoined &&
            window.TronoSocial.getLocalAudioTrack().readyState === 'live',
        ),
        true,
      );
      assert.equal(
        await host.evaluate(
          () =>
            window.TronoSocial.screenSharing &&
            window.TronoSocial.getLocalDisplayStream()
              .getTracks()
              .every((t) => t.readyState === 'live'),
        ),
        true,
      );
      assert.deepEqual(errors, []);
    } finally {
      await fs.mkdir('artifacts/frontend-reset/call-qa', { recursive: true });
      for (let i = 0; i < pages.length; i++)
        await pages[i]
          .screenshot({ path: 'artifacts/frontend-reset/call-qa/stream-current-' + i + '.png' })
          .catch(() => {});
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
