'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  WebSocket = require('ws');
const { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
// Extra participants use the real server's protocol; the main browser captures media.
const { installCanvasCamera } = require('./camera-fixture');
// Real Electron peer-to-peer continuity has its own desktop-call-layout regression.
function participant(base) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws'),
      messages = [],
      waiters = [];
    ws.once('error', reject);
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
    ws.once('open', () =>
      resolve({
        ws,
        send: (m) => ws.send(JSON.stringify(m)),
        wait(match) {
          const old = messages.find(match);
          if (old) return Promise.resolve(old);
          return new Promise((resolve, reject) => {
            const w = {
              match,
              resolve,
              timer: setTimeout(() => reject(Error('Participant protocol timeout')), 10000),
            };
            waiters.push(w);
          });
        },
      }),
    );
  });
}
const sizes = [
  [1910, 955],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [900, 600],
  [1080, 1920],
  [720, 1280],
  [390, 844],
  [844, 390],
];
test(
  'call workspace keeps left messages, central media and bottom controls separate',
  { timeout: 240000 },
  async () => {
    const server = await new Promise((r) => {
        const s = express()
          .use(express.static(path.resolve(__dirname, '../out')))
          .listen(0, '127.0.0.1', () => r(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 10791, appOrigin: origin, soundboard: true });
    let browser;
    const peers = [],
      errors = [],
      shapes = [],
      out = path.resolve(
        __dirname,
        '../artifacts/workspace' + (process.env.QA_NATIVE ? 'native' : ''),
      );
    await fs.mkdir(out, { recursive: true });
    try {
      const email = 'Jonathapereira.jj@gmail.com';
      await fixture.call('signup', { email, nickname: 'Jonatha', password: 'Senha12!' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (await fixture.call('login', { email, password: 'Senha12!' })).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
          ...(process.platform === 'linux'
            ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
            : []),
        ],
      });
      const context = await browser.newContext({
        viewport: { width: 1910, height: 955 },
        permissions: ['microphone', 'camera'],
      });
      await context.route('**/*', (r) =>
        new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
      );
      await context.route('**/community/profiles/*', (r) =>
        r.fulfill({
          json: {
            profile: {
              id: new URL(r.request().url()).pathname.split('/').at(-1),
              nickname: 'Jonatha',
              avatar_preset: 'gamepad',
              created_at: '2026-10-01T12:00:00Z',
              personalization: {
                handle: 'jonatha',
                bio: 'Música, boas conversas e uma partida com os amigos.',
                status: 'Na call com a galera',
                emoji: '🎧',
                tags: ['Jogos', 'Música', 'Tecnologia'],
                links: [
                  { label: 'Twitch', url: 'https://twitch.tv/example' },
                  { label: 'YouTube', url: 'https://youtube.com/@example' },
                ],
              },
            },
          },
        }),
      );
      await context.addInitScript(
        ({ base, data, native }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
          navigator.mediaDevices.getDisplayMedia = async () => {
            const c = document.createElement('canvas');
            c.width = 1280;
            c.height = 720;
            const d = c.getContext('2d'),
              g = d.createLinearGradient(0, 0, 1280, 720);
            g.addColorStop(0, '#324f6a');
            g.addColorStop(0.55, '#cd9475');
            g.addColorStop(1, '#202c4d');
            d.fillStyle = g;
            d.fillRect(0, 0, 1280, 720);
            d.fillStyle = 'white';
            d.font = '36px sans-serif';
            d.fillText('Compartilhamento de tela · teste', 60, 100);
            return c.captureStream(15);
          };
          if (native)
            window.TronoDesktop = {
              version: '0.2.4',
              clipsSuspended: true,
              readSession: async () => null,
              saveSession: async () => {},
              getMediaPermissions: async () => ['audio', 'video'],
              onCapture: () => {},
              onCaptureCancel: () => {},
              getWindowState: async () => ({ fullscreen: false }),
              onWindowState: () => {},
              onUpdateState: () => {},
              getUpdateState: async () => ({ status: 'idle' }),
              onApplicationAudio: () => {},
              configureClips: async () => ({ suspended: true }),
            };
        },
        { base: fixture.base, data, native: process.env.QA_NATIVE === '1' },
      );
      await context.addInitScript(installCanvasCamera);
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(30000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('dialog', (d) => d.accept());
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.locator('[data-voice-channel=chat-livre]').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      for (const [i, name] of ['Enéas', 'Danilo', 'Lucas'].entries()) {
        const email = 'workspace' + i + '@example.test';
        await fixture.call('signup', { email, nickname: name, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        const data = (await fixture.call('login', { email, password: 'Senha12!' })).data,
          peer = await participant(fixture.base);
        peers.push(peer);
        peer.send({ type: 'authenticate', access_token: data.session.access_token });
        assert((await peer.wait((m) => m.type === 'auth-result')).ok);
        peer.send({ type: 'join-room', roomId: 'chat-livre' });
        await peer.wait((m) => m.type === 'joined-room');
        peer.send({ type: 'voice-state', joined: true, camera: i < 2 });
      }
      await page.locator('[data-control=cameraBtn]').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await page.evaluate(() => window.TronoSocial.startScreenShare());
      await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      const snapshot = () =>
        page.evaluate(() => ({
          socket: window.TronoNetwork.clientId,
          mic: window.TronoSocial.getLocalAudioTrack()?.id,
          camera: window.TronoSocial.getMediaSources()
            .find((s) => s.self)
            ?.camera?.getVideoTracks()[0]?.id,
          screen: window.TronoSocial.getLocalDisplayStream()?.getVideoTracks()[0]?.id,
        }));
      const before = await snapshot();
      assert(before.mic && before.camera && before.screen);
      await expect(page.locator('[data-call-person]')).toHaveCount(4);
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        const shape = await page.evaluate(() => {
          const controls = [...document.querySelectorAll('[data-control]')].filter(
            (b) => b.getClientRects().length,
          );
          const boxes = controls.map((b) => {
            const r = b.getBoundingClientRect();
            return {
              id: b.dataset.control,
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              clickable:
                document
                  .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                  ?.closest('button') === b,
              coveredBy: document
                .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                ?.outerHTML.slice(0, 200),
            };
          });
          return { overflow: document.documentElement.scrollWidth - innerWidth, boxes };
        });
        assert(shape.overflow <= 1, JSON.stringify({ width, height, shape }));
        assert(shape.boxes.length >= 5, JSON.stringify(shape));
        for (const box of shape.boxes)
          assert(
            box.x >= 0 &&
              box.right <= width + 1 &&
              box.y >= 0 &&
              box.bottom <= height + 1 &&
              box.clickable,
            JSON.stringify({ width, height, box }),
          );
        for (let i = 0; i < shape.boxes.length; i++)
          for (let j = i + 1; j < shape.boxes.length; j++) {
            const a = shape.boxes[i],
              b = shape.boxes[j];
            assert(
              Math.min(a.right, b.right) - Math.max(a.x, b.x) <= 1 ||
                Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) <= 1,
              'call controls overlap',
            );
          }
        await page.getByRole('button', { name: 'Mostrar conversa da chamada' }).click();
        await expect(page.locator('#channelMessageInput')).toBeInViewport();
        await page.locator('#channelMessageInput').fill('Rascunho ' + width);
        await page.getByRole('button', { name: 'Fechar conversa da chamada', exact: true }).click();
        await expect(page.locator('#channelMessageInput')).toBeHidden();
        await page.screenshot({
          path: out + '/corte-' + width + 'x' + height + '.png',
          animations: 'disabled',
        });
        assert.deepEqual(await snapshot(), before);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await expect(page.locator('#gamesScreen')).toBeVisible();
      assert.deepEqual(await snapshot(), before);
      await page.getByRole('button', { name: 'Comunicação', exact: true }).click();
      await page.evaluate(() => window.TronoCallNavigation.showCall());
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(errors, []);
      const issues = [];
      for (const s of shapes) {
        if (s.overflow > 1) issues.push([s.mode, s.w, s.h, 'horizontal overflow']);
        for (const b of s.controls)
          if (
            !b.visible ||
            b.width < (s.mode === 'discord' && s.w >= 1100 ? 28 : 35) ||
            b.x < 0 ||
            b.right > s.w + 1 ||
            b.y < 0 ||
            b.bottom > s.h + 1
          )
            issues.push([s.mode, s.w, s.h, 'control outside viewport', b.id]);
        if (
          !s.stream ||
          !s.stream.visible ||
          s.stream.x < s.stage.x ||
          s.stream.right > s.stage.right + 1 ||
          s.stream.bottom > (s.dock.visible ? s.dock.y : s.stage.bottom) + 1
        )
          issues.push([s.mode, s.w, s.h, 'stream outside stage']);
        if (s.w >= 760 && s.chat.visible && s.chat.right > s.stage.x + 1)
          issues.push([s.mode, s.w, s.h, 'messages overlap media']);
        for (let i = 0; i < s.controls.length; i++)
          for (let j = i + 1; j < s.controls.length; j++) {
            const a = s.controls[i],
              b = s.controls[j];
            if (
              Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1
            )
              issues.push([s.mode, s.w, s.h, 'overlapping controls', a.id, b.id]);
          }
      }
      for (const s of shapes)
        for (let i = 0; i < s.cards.length; i++)
          for (let j = i + 1; j < s.cards.length; j++) {
            const a = s.cards[i],
              b = s.cards[j];
            if (
              Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1
            )
              issues.push([s.mode, s.w, s.h, 'overlapping participants', i, j]);
          }
      assert.deepEqual(issues, []);
    } finally {
      for (const peer of peers) peer.ws.terminate();
      await browser?.close();
      await fixture.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
