'use strict';
const { installCanvasCamera } = require('./camera-fixture');
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  express = require('express'),
  WebSocket = require('ws'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture'),
  R = require('../src/lib/games/love-letter-rules.ts');
async function peer(base, token) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws'),
    messages = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw)));
  await new Promise((r) => ws.once('open', r));
  const wait = async (fn) => {
    for (let n = 0; n < 600; n++) {
      const m = messages.findLast(fn);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error('Missing peer message');
  };
  const send = (m) => ws.send(JSON.stringify(m));
  send({ type: 'authenticate', access_token: token });
  await wait((m) => m.type === 'auth-result' && m.ok);
  return { ws, messages, send, wait };
}
test(
  'Love Letter real controls complete a match, keep secrets, fit supported window sizes and preserve microphone/camera/share',
  { timeout: 300000 },
  async () => {
    const server = await new Promise((r) => {
        const s = express()
          .use(express.static(path.resolve('out')))
          .listen(0, '127.0.0.1', () => r(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      f = await startFixture({ port: 10846, appOrigin: origin, loveLetterSeed: 1 });
    let browser, context, other;
    try {
      await fs.mkdir('artifacts/love-letter', { recursive: true });
      const users = [];
      for (let i = 0; i < 2; i++) {
        const email = 'love-ui-' + i + '@example.test';
        await f.call('signup', {
          email,
          nickname: i ? 'PikudaHaOref' : 'Semchakra',
          password: 'Senha12!',
        });
        await f.call('verify', { token_hash: [...f.links.keys()].at(-1), type: 'signup' });
        users.push((await f.call('login', { email, password: 'Senha12!' })).data);
      }
      other = await peer(f.base, users[1].session.access_token);
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--mute-audio',
          '--autoplay-policy=no-user-gesture-required',
        ],
      });
      context = await browser.newContext({
        viewport: { width: 1536, height: 1024 },
        permissions: ['microphone', 'camera'],
        reducedMotion: 'reduce',
      });
      await context.route('**/*', (r) =>
        new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
      );
      await context.addInitScript(
        ({ base, data }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('mnDesktopNoiseMode', 'native');
          window.__lovePresentations = [];
          document.addEventListener('DOMContentLoaded', () => {
            new MutationObserver(() => {
              const n = document.querySelector('.ll-presentation');
              if (!n) return;
              const key = n.dataset.revision + ':' + n.dataset.phase;
              if (window.__lovePresentations.at(-1)?.key === key) return;
              window.__lovePresentations.push({
                key,
                revision: n.dataset.revision,
                phase: n.dataset.phase,
                time: performance.now(),
                heading: n.querySelector('h2').textContent,
                guard: n.textContent.includes('Será que acertou?'),
                outcome: !!n.querySelector('.ll-effect-outcome'),
              });
            }).observe(document.body, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ['data-phase'],
            });
          });
          navigator.mediaDevices.getDisplayMedia = async () => {
            const c = document.createElement('canvas');
            c.width = 1280;
            c.height = 720;
            return c.captureStream(15);
          };
          window.TronoDesktop = {
            version: '0.2.0',
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
        { base: f.base, data: users[0] },
      );
      await context.addInitScript(installCanvasCamera);
      const page = await context.newPage(),
        errors = [],
        missing = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400 && (r.url().includes('/assets/') || /\.(css|js)(\?|$)/.test(r.url())))
          missing.push(r.url());
      });
      page.on('dialog', (d) => d.accept());
      page.setDefaultTimeout(8000);
      const tracks = () =>
        page.evaluate(() => ({
          id: window.TronoNetwork.clientId,
          voice: window.TronoNetwork.primaryRoom,
          joined: window.TronoSocial.voiceJoined,
          mic: window.TronoSocial.getLocalAudioTrack()?.id,
          camera: window.TronoSocial.getMediaSources()
            .find((s) => s.self)
            ?.camera?.getVideoTracks()[0]?.id,
          screen: window.TronoSocial.getLocalDisplayStream()?.getVideoTracks()[0]?.id,
        }));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      await page.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await page.evaluate(() => window.TronoCallToolbar.activate('cameraBtn'));
      await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await page.evaluate(() => window.TronoSocial.startScreenShare());
      await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      const before = await tracks();
      assert(before.mic && before.camera && before.screen);
      await page.evaluate(() => window.TronoGames.openLibrary());
      await expect(page.locator('button[data-game]')).toHaveCount(7);
      await page.locator('button[data-game="love-letter"]').click();
      await page.locator('#loveLetterPlayerCount').selectOption('2');
      await page.getByRole('button', { name: 'Criar mesa', exact: true }).click();
      await expect(page.locator('.ll-seats')).toBeVisible();
      const id = await page.evaluate(() => window.TronoLoveLetter.room.id);
      other.send({ type: 'love-letter', action: 'join', roomId: id });
      await expect(page.locator('.ll-seats')).toContainText('PikudaHaOref');
      await page.getByRole('button', { name: 'Começar com os presentes' }).click();
      await expect(page.locator('.ll-opponent')).toHaveCount(1);
      await expect(page.locator('.ll-court .ll-reference-card')).toHaveCount(10);
      for (const layout of ['original']) {
        for (const [width, height] of [
          [1536, 1024],
          [1280, 720],
          [1080, 1920],
          [720, 1280],
          [480, 800],
          [360, 740],
        ]) {
          await page.setViewportSize({ width, height });
          const bounds = await page
            .locator('#loveLetterScreen')
            .evaluate((n) => ({ w: n.clientWidth, scroll: n.scrollWidth }));
          assert(bounds.scroll <= bounds.w + 1, JSON.stringify({ layout, width, bounds }));
          const hand = await page.locator('.ll-hand .ll-card').evaluateAll((ns) =>
            ns.map((n) => {
              const r = n.getBoundingClientRect();
              return { left: r.left, right: r.right, w: r.width };
            }),
          );
          assert(
            hand.every((n) => n.left >= 0 && n.right <= width && n.w >= 95),
            JSON.stringify({ layout, width, hand }),
          );
          assert.deepEqual(await tracks(), before);
          if (width >= 1280) {
            const last = await page.locator('.ll-last').boundingBox(),
              screen = await page.locator('#loveLetterScreen').boundingBox();
            assert(
              last.y >= screen.y && last.y + last.height <= screen.y + screen.height,
              'Latest move stays visible beside the table',
            );
          }
          if (layout === 'original' && [1536, 1080, 480].includes(width))
            await page.screenshot({ path: 'artifacts/love-letter/table-' + width + '.png' });
        }
      }
      await page.setViewportSize({ width: 1536, height: 1024 });

      const volume = page.locator('#loveLetterScreen [data-game-audio=love-letter]');
      await volume.locator('summary').click();
      await volume.locator('input').press('Home');
      assert.equal(await page.evaluate(() => window.TronoAudio.gameVolume('love-letter')), 0);
      await volume.locator('input').press('End');
      await volume.locator('summary').click();
      await page.locator('#loveLetterRulesButton').click();
      await expect(page.locator('#loveLetterRulesDialog')).toContainText('Chanceler');
      await page.locator('#loveLetterRulesDialog [data-close]').click();
      await page.locator('#loveLetterFullscreen').click();
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement?.id))
        .toBe('loveLetterScreen');
      await page.locator('#loveLetterFullscreen').click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await page.evaluate(() => {
        document.querySelector('#loveLetterScreen').requestFullscreen = async () => {
          throw Error('Expected unavailable');
        };
      });
      await page.locator('#loveLetterFullscreen').click();
      await expect(page.locator('#loveLetterScreen')).toHaveClass(/ll-immersive/);
      await page.keyboard.press('Escape');
      await expect(page.locator('#loveLetterScreen')).not.toHaveClass(/ll-immersive/);
      let turns = 0,
        privateSeen = false,
        chancellorSeen = false,
        feedbackChecked = false;
      while (true) {
        await expect.poll(() => page.evaluate(() => window.TronoLoveLetter.animating)).toBe(false);
        const s = await page.evaluate(() => window.TronoLoveLetter.room.state);
        if (s.phase === 'finished') break;
        const revision = s.revision;
        if (s.phase === 'round-over') {
          await page.getByRole('button', { name: 'Próxima rodada', exact: true }).click();
        } else if (s.players[s.turn].id === users[0].user.id) {
          const move = R.botMove(s);
          if (!feedbackChecked && s.phase === 'action') {
            await page.emulateMedia({ reducedMotion: 'no-preference' });
          }
          if (s.phase === 'chancellor') {
            chancellorSeen = true;
            await page.setViewportSize({ width: 480, height: 800 });
            assert(
              await page
                .locator('#loveLetterScreen')
                .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
              'Chancellor private choices fit a narrow monitor',
            );
            await page.screenshot({ path: 'artifacts/love-letter/chancellor-480.png' });
            await page.setViewportSize({ width: 1536, height: 1024 });
            const choices = page.locator('.ll-chancellor-cards');
            await choices.locator('[data-ll-card="' + move.keep + '"]').click();
            const currentBottom = await choices
              .locator('[data-ll-card]')
              .evaluateAll(
                (ns, keep) => ns.map((n) => n.dataset.llCard).filter((id) => id !== keep),
                move.keep,
              );
            if (currentBottom.length === 2 && currentBottom[0] !== move.bottom[0])
              await page.getByRole('button', { name: 'Inverter ordem' }).click();
            await page.getByRole('button', { name: 'Guardar carta e concluir' }).click();
          } else {
            await page.locator('.ll-hand [data-ll-card="' + move.cardId + '"]').click();
            await expect(page.locator('.ll-action-guide')).toBeVisible();
            if (move.targetId) {
              await page.locator('[data-target-id="' + move.targetId + '"]').click();
              if (move.guess !== undefined) {
                await expect(page.locator('#loveLetterPlayDialog')).toBeVisible();
                await page.locator('[data-guess="' + move.guess + '"]').click();
              }
            } else await page.locator('#loveLetterConfirm').click();
          }
        } else {
          await other.wait(
            (m) => m.type === 'love-letter-state' && m.room.state?.revision === revision,
          );
          const own = other.messages.findLast((m) => m.type === 'love-letter-state').room.state;
          other.send({ type: 'love-letter', action: 'move', revision, move: R.botMove(own) });
        }
        await expect
          .poll(() => page.evaluate(() => window.TronoLoveLetter.room.state.revision))
          .toBeGreaterThan(revision);
        if (!feedbackChecked) {
          feedbackChecked = true;
          await expect(page.locator('.ll-presentation')).toBeVisible();
          await expect(page.locator('.ll-presentation h2')).not.toBeEmpty();
          await page.screenshot({ path: 'artifacts/love-letter/play-announcement.png' });
          await expect
            .poll(() => page.evaluate(() => window.TronoLoveLetter.animating))
            .toBe(false);
          await expect(page.locator('.ll-last-card')).toBeVisible();
          await expect(page.locator('.ll-last p')).not.toBeEmpty();
          await expect(page.locator('.ll-history')).toHaveAttribute('open', '');
          await expect(page.locator('.ll-history .ll-log-entry strong').first()).not.toBeEmpty();
          await page.evaluate(() => {
            window.__stableLoveTable = document.querySelector('.ll-table');
            window.__loveEvent = document.querySelector('.ll-last p').textContent;
            window.TronoNetwork.loveLetter('list');
          });
          await page.waitForTimeout(1300);
          assert(
            await page.evaluate(
              () =>
                window.__stableLoveTable === document.querySelector('.ll-table') &&
                window.__loveEvent === document.querySelector('.ll-last p').textContent,
            ),
            'Log delivery and effect timers must not rebuild the table',
          );
          const stableRevision = await page.evaluate(
            () => window.TronoLoveLetter.room.state.revision,
          );
          other.ws.terminate();
          await expect(page.locator('.ll-opponent .ll-online')).toHaveCount(0);
          other = await peer(f.base, users[1].session.access_token);
          other.send({ type: 'love-letter', action: 'resume', roomId: id });
          await expect(page.locator('.ll-opponent .ll-online')).toHaveCount(1);
          assert.equal(
            await page.evaluate(() => window.TronoLoveLetter.room.state.revision),
            stableRevision,
            'Reconnect updates presence without replaying the move',
          );
          await page.screenshot({ path: 'artifacts/love-letter/stable-feedback.png' });
          await page.evaluate(() => window.TronoPortal.openVoice());
          assert.deepEqual(await tracks(), before);
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.evaluate(() => window.TronoLoveLetter.open());
        }
        if (await page.locator('#loveLetterPrivateDialog').isVisible()) {
          privateSeen = true;
          await expect(page.locator('#loveLetterPrivateDialog')).toContainText(
            'SOMENTE VOCÊ VÊ ISTO',
          );
          await page.locator('#loveLetterPrivateDialog [data-close]').click();
        }
        assert(++turns < 1000);
      }
      assert(feedbackChecked);
      const presentations = await page.evaluate(() => window.__lovePresentations),
        guards = presentations.filter((p) => p.guard && p.phase === 'announce');
      await fs.writeFile(
        'artifacts/love-letter/presentations.json',
        JSON.stringify(presentations, null, 2),
      );
      assert(guards.length > 0, 'a real Guard play must exercise suspense');
      for (const announcement of guards) {
        const result = presentations.find(
          (p) => p.revision === announcement.revision && p.phase === 'result',
        );
        assert(result, 'each announcement resolves visibly');
        assert(result.time - announcement.time >= 950, 'Guard suspense lasts one second');
        assert.equal(
          announcement.outcome,
          false,
          'Guard does not reveal the outcome during suspense',
        );
        assert.match(announcement.heading, /jogou Guarda em/);
      }
      await expect(page.locator('.ll-result')).toContainText('conquistou a corte');
      assert.deepEqual(await tracks(), before);
      await page.screenshot({ path: 'artifacts/love-letter/result.png' });
      await page.getByRole('button', { name: 'Nova partida', exact: true }).click();
      other.send({ type: 'love-letter', action: 'leave' });
      await expect(page.locator('#loveLetterPlayerCount')).toBeVisible();
      await page.locator('#loveLetterPlayerCount').selectOption('4');
      await page.getByRole('button', { name: 'Criar mesa', exact: true }).click();
      await page.getByRole('button', { name: 'Completar com bots e começar' }).click();
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const s = window.TronoLoveLetter.room.state;
              return (
                !!s && s.players[s.turn].id === window.TronoAuth.user.id && s.phase === 'action'
              );
            }),
          { timeout: 20000 },
        )
        .toBe(true);
      for (const [width, height] of [
        [1536, 1024],
        [1280, 720],
        [1080, 1920],
        [480, 800],
      ]) {
        await page.setViewportSize({ width, height });
        assert(
          await page
            .locator('#loveLetterScreen')
            .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
        );
        if (width >= 1280) {
          const hand = await page.locator('.ll-hand').boundingBox(),
            screen = await page.locator('#loveLetterScreen').boundingBox();
          await page.screenshot({ path: 'artifacts/love-letter/four-' + width + '.png' });
          assert(
            hand.y + hand.height <= screen.y + screen.height,
            'Entire hand must fit above call controls ' + JSON.stringify({ width, hand, screen }),
          );
        }
        await page.screenshot({ path: 'artifacts/love-letter/four-' + width + '.png' });
      }
      await page.getByRole('button', { name: 'Sair da mesa', exact: true }).click();
      await expect(page.locator('#loveLetterPlayerCount')).toBeVisible();
      await page.locator('#loveLetterPlayerCount').selectOption('6');
      await page.getByRole('button', { name: 'Criar mesa', exact: true }).click();
      await page.getByRole('button', { name: 'Completar com bots e começar' }).click();
      await expect(page.locator('.ll-opponent')).toHaveCount(5);
      for (const [width, height] of [
        [1536, 1024],
        [1080, 1920],
        [480, 800],
      ]) {
        await page.setViewportSize({ width, height });
        assert(
          await page
            .locator('#loveLetterScreen')
            .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
        );
        await page.screenshot({ path: 'artifacts/love-letter/six-' + width + '.png' });
      }
      assert.deepEqual(await tracks(), before);
      assert.deepEqual(errors, []);
      assert.deepEqual(missing, []);
    } finally {
      other?.ws.terminate();
      await context?.close();
      await browser?.close();
      await f.stop();
      await new Promise((r) => server.close(r));
    }
  },
);

test(
  'reduced motion keeps a Love Letter result button still at its hover edge',
  { timeout: 15000 },
  async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    });
    try {
      const page = await browser.newPage({
        reducedMotion: 'reduce',
        viewport: { width: 600, height: 400 },
      });
      await page.setContent(
        '<div id="gameSurface"><section class="ll-screen"><section class="ll-result"><button type="button" class="ll-button ll-primary">Nova partida</button></section></section></div>',
      );
      await page.addStyleTag({
        content: await fs.readFile('src/styles/games/love-letter.css', 'utf8'),
      });
      const button = page.getByRole('button', { name: 'Nova partida', exact: true }),
        before = await button.boundingBox();
      await page.mouse.move(before.x + before.width / 2, before.y + before.height - 1);
      const samples = await button.evaluate(
        (n) =>
          new Promise((resolve) => {
            const values = [];
            let frames = 0;
            const sample = () => {
              values.push(n.getBoundingClientRect().y);
              if (++frames < 30) requestAnimationFrame(sample);
              else resolve(values);
            };
            requestAnimationFrame(sample);
          }),
      );
      assert(
        samples.every((y) => Math.abs(y - before.y) < 0.1),
        'Reduced motion must not translate the result action: ' + JSON.stringify(samples),
      );
      await button.click();
    } finally {
      await browser.close();
    }
  },
);
