'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  express = require('express'),
  { WebSocket } = require('ws'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
function socket(base) {
  return new Promise((resolve) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws'),
      messages = [],
      waiters = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      messages.push(m);
      for (const w of [...waiters])
        if (w.match(m)) {
          clearTimeout(w.timer);
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(m);
        }
    });
    ws.on('open', () =>
      resolve({
        ws,
        send: (m) => ws.send(JSON.stringify(m)),
        wait(match) {
          const m = messages.find(match);
          return m
            ? Promise.resolve(m)
            : new Promise((resolve, reject) =>
                waiters.push({
                  match,
                  resolve,
                  timer: setTimeout(() => reject(Error('Peer timeout')), 8000),
                }),
              );
        },
      }),
    );
  });
}
test(
  'floating call has compact avatars, no empty stage or duplicate cameras, and reuses the shared enlargement',
  { timeout: 120000 },
  async () => {
    const server = await new Promise((resolve) => {
        const s = express()
          .use(express.static(path.resolve('out')))
          .listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 10859, appOrigin: origin });
    let browser;
    const peers = [],
      errors = [],
      out = path.resolve('artifacts/floating-call');
    await fs.mkdir(out, { recursive: true });
    try {
      async function account(i) {
        const email = 'floating-' + i + '@example.test';
        assert.equal(
          (await fixture.call('signup', { email, nickname: 'Pessoa ' + i, password: 'Senha12!' }))
            .status,
          200,
        );
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        return (await fixture.call('login', { email, password: 'Senha12!' })).data;
      }
      const data = await account(1);
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH ||
          (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      const context = await browser.newContext({
        permissions: ['microphone', 'camera'],
        viewport: { width: 1440, height: 900 },
      });
      await context.route('**/*', (r) =>
        new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoSocialMode', 'full');
          localStorage.setItem(
            'tronoSocialFloatingRectV2',
            JSON.stringify({ left: 1300, top: 700, width: 900, height: 850 }),
          );
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoNoiseSuppression', '0');
          window.__microphoneRequests = 0;
          const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = (c) => {
            if (c.audio) window.__microphoneRequests++;
            return capture(c);
          };
        },
        { base: fixture.base, data },
      );
      await context.addInitScript(require('./camera-fixture').installCanvasCamera);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      for (const i of [2, 3]) {
        const data = await account(i),
          p = await socket(fixture.base);
        peers.push(p);
        p.send({
          type: 'authenticate',
          requestId: 'auth',
          access_token: data.session.access_token,
        });
        await p.wait((m) => m.type === 'auth-result');
        p.send({ type: 'join-room', roomId: 'chat-jogos' });
        await p.wait((m) => m.type === 'joined-room');
        p.send({ type: 'voice-state', joined: true, transport: 'p2p' });
      }
      await expect(page.locator('#voiceRoster .voice-person')).toHaveCount(3);
      const snapshot = () =>
          page.evaluate(() => ({
            track: window.TronoSocial.getLocalAudioTrack().id,
            captures: window.__microphoneRequests,
            client: window.TronoNetwork.clientId,
            room: window.TronoNetwork.primaryRoom,
          })),
        before = await snapshot();
      for (const mode of ['corte']) {
        await page.evaluate(async () => {
          await window.TronoPortal.openGame(true);
          window.TronoSocial.showForRoom(true);
        });
        await expect(page.locator('#socialPanel')).toHaveClass(/social-floating/);
        await expect(page.locator('#socialPanel')).toBeVisible();
        for (const [width, height] of [
          [1440, 900],
          [900, 600],
          [390, 844],
          [844, 390],
        ]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => window.dispatchEvent(new Event('resize')));
          await expect(page.locator('#socialPanel')).toBeVisible();
          await expect(page.locator('#mediaMosaic')).not.toBeVisible();
          const shape = await page.locator('#socialPanel').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return {
              classes: el.className,
              body: document.body.className,
              display: getComputedStyle(el).display,
              parent: el.parentElement.id,
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
              overflow: el.scrollWidth - el.clientWidth,
              avatars: [...el.querySelectorAll('#voiceRoster .mn-person-avatar')].map((a) => {
                const r = a.getBoundingClientRect();
                return { width: r.width, height: r.height };
              }),
            };
          });
          assert(
            shape.x >= 0 && shape.y >= 0 && shape.right <= width + 1 && shape.bottom <= height + 1,
            JSON.stringify({ width, height, shape }),
          );
          assert(shape.height >= 100 && shape.height <= 560, JSON.stringify(shape));
          assert(shape.overflow <= 1);
          assert(shape.avatars.every((a) => a.width <= 40 && a.height <= 40));
          await page.screenshot({
            path: out + '/' + mode + '-' + width + '.png',
            animations: 'disabled',
          });
          assert.deepEqual(await snapshot(), before);
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('#cameraBtn').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await expect(page.locator('#voiceRoster .participant-camera-slot video')).toHaveCount(1);
      await expect(page.locator('#seatMediaLayer video')).toHaveCount(0);
      await expect(page.locator('#mediaMosaic')).not.toBeVisible();
      const camera = await page.locator('#voiceRoster video').evaluate((e) => {
        e.dataset.retained = 'yes';
        return e.srcObject.getVideoTracks()[0].id;
      });
      // Drag/resize ownership moves with the layout, without replacing the camera or microphone.
      const panel = page.locator('#socialPanel');
      const handle = await page.locator('#socialDragHandle').boundingBox();
      await page.mouse.move(handle.x + 16, handle.y + 14);
      await page.mouse.down();
      await page.mouse.move(80, 90, { steps: 4 });
      await page.mouse.up();
      const savedRect = await page.evaluate(() =>
        JSON.parse(window.TronoStorage.getItem('tronoSocialFloatingRectV3')),
      );
      const dragged = await panel.boundingBox();
      assert(Math.abs(savedRect.left - dragged.x) <= 1 && Math.abs(savedRect.top - dragged.y) <= 1);
      const grip = await page.locator('#socialResizeGrip').boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await expect(panel).toHaveClass(/resizing/);
      await page.mouse.move(grip.x + 65, grip.y + 55, { steps: 4 });
      await page.mouse.up();
      await expect(panel).not.toHaveClass(/resizing/);
      const size = await page.evaluate(() =>
        JSON.parse(window.TronoStorage.getItem('tronoSocialFloatingRectV3')),
      );
      assert(size.width >= savedRect.width && size.height >= savedRect.height);
      // A breakpoint change cancels a held gesture and removes the desktop's inline geometry.
      const dragging = await page.locator('#socialDragHandle').boundingBox();
      await page.mouse.move(dragging.x + 16, dragging.y + 14);
      await page.mouse.down();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.mouse.move(100, 120);
      await page.mouse.up();
      assert.equal(
        await panel.evaluate((el) =>
          ['left', 'top', 'width', 'height'].every((key) => !el.style[key]),
        ),
        true,
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect.poll(() => panel.evaluate((el) => !!el.style.width)).toBe(true);
      // Entering the hub during resize cancels the gesture and does not persist hub dimensions.
      const nextGrip = await page.locator('#socialResizeGrip').boundingBox();
      await page.mouse.move(nextGrip.x + 10, nextGrip.y + 10);
      await page.mouse.down();
      await expect(panel).toHaveClass(/resizing/);
      const savedBeforeHub = await page.evaluate(() =>
        window.TronoStorage.getItem('tronoSocialFloatingRectV3'),
      );
      await page.evaluate(() => window.TronoPortal.showOnly('chatOnlyScreen'));
      await page.mouse.move(200, 200);
      await page.mouse.up();
      await expect(panel).not.toHaveClass(/resizing/);
      assert.equal(
        await page.evaluate(() => window.TronoStorage.getItem('tronoSocialFloatingRectV3')),
        savedBeforeHub,
      );
      await page.evaluate(() => window.TronoPortal.openGame(true));
      await page.locator('#socialResizeGrip').dblclick();
      assert.equal(
        await page.evaluate(() => window.TronoStorage.getItem('tronoSocialFloatingRectV3')),
        null,
      );
      assert.deepEqual(await snapshot(), before);
      await page.locator('#socialModeBtn').click();
      await expect(page.locator('#mediaFocusDialog')).toBeVisible();
      await page.locator('#mediaFocusClose').click();
      assert.equal(await page.locator('#voiceRoster video').getAttribute('data-retained'), 'yes');
      assert.equal(
        await page
          .locator('#voiceRoster video')
          .evaluate((e) => e.srcObject.getVideoTracks()[0].id),
        camera,
      );
      assert.deepEqual(await snapshot(), before);
      await page.locator('#socialCloseBtn').click();
      await expect(page.locator('#socialMiniDock')).toBeVisible();
      await page.locator('#socialMiniDock').click();
      await expect(page.locator('#socialPanel')).toBeVisible();
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(errors, []);
    } finally {
      for (const p of peers) p.ws.terminate();
      await browser?.close();
      await fixture.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
