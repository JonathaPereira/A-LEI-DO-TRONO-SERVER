'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  express = require('express'),
  WebSocket = require('ws'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture'),
  R = require('../src/lib/games/azul-rules.ts');
async function peer(base, token) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws'),
    messages = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw)));
  await new Promise((r) => ws.once('open', r));
  const wait = async (fn) => {
    for (let n = 0; n < 400; n++) {
      const found = messages.findLast(fn);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error('Missing peer message');
  };
  const send = (m) => ws.send(JSON.stringify(m));
  send({ type: 'authenticate', access_token: token });
  await wait((m) => m.type === 'auth-result' && m.ok);
  return { ws, messages, send, wait };
}
const { installCanvasCamera } = require('./camera-fixture');
test(
  'Azul actual interface, supported window sizes and portrait displays keep the call and allow a full match',
  { timeout: 180000 },
  async (t) => {
    const server = await new Promise((r) => {
        const s = express()
          .use(express.static(path.resolve('out')))
          .listen(0, '127.0.0.1', () => r(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      f = await startFixture({ port: 10742, appOrigin: origin });
    let browser;
    try {
      await fs.mkdir('artifacts/azul', { recursive: true });
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
      for (const native of [true, false])
        await t.test(native ? 'Windows games and table' : 'Website games and table', async () => {
          const data = [];
          for (let i = 0; i < 2; i++) {
            const email = 'azul-browser-' + native + '-' + i + '@example.test';
            await f.call('signup', {
              email,
              nickname: (native ? 'Windows ' : 'Site ') + (i ? 'Amigo' : 'Artesão'),
              password: 'Senha12!',
            });
            await f.call('verify', { token_hash: [...f.links.keys()].at(-1), type: 'signup' });
            data.push((await f.call('login', { email, password: 'Senha12!' })).data);
          }
          const other = await peer(f.base, data[1].session.access_token),
            context = await browser.newContext({
              viewport: { width: 1440, height: 960 },
              permissions: ['microphone', 'camera'],
              reducedMotion: 'reduce',
            });
          await context.route('**/*', (r) =>
            new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
          );
          await context.addInitScript(installCanvasCamera, { display: true });
          await context.addInitScript(
            ({ base, data, native }) => {
              const Socket = window.WebSocket;
              window.WebSocket = class extends Socket {
                constructor(url, protocols) {
                  super(url, protocols);
                  window.__azSocket = this;
                }
              };
              window.TRONO_BACKEND_URL = base;
              sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
              localStorage.setItem('tronoMusicEnabled', '0');
              localStorage.setItem('tronoSfxEnabled', '0');
              localStorage.setItem('mnDesktopNoiseMode', 'native');
              if (native)
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
            { base: f.base, data: data[0], native },
          );
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          page.on('dialog', (d) => d.accept());
          page.setDefaultTimeout(8000);
          try {
            await page.goto(origin);
            await page.waitForFunction(() => window.TronoAuth?.ready);
            await page.evaluate(() => window.TronoAuth.ready);
            await expect(page.locator('#chatOnlyScreen')).toBeVisible();
            await page.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
            await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
            await page.evaluate(() => window.TronoCallToolbar.activate('cameraBtn'));
            await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
            await page.evaluate(() => window.TronoSocial.startScreenShare());
            await expect
              .poll(() => page.evaluate(() => window.TronoSocial.screenSharing))
              .toBe(true);
            const snapshot = () =>
              page.evaluate(() => ({
                socket: window.TronoNetwork.clientId,
                voice: window.TronoNetwork.primaryRoom,
                track: window.TronoSocial.getLocalAudioTrack()?.id,
                camera: window.TronoSocial.getMediaSources()
                  .find((s) => s.self)
                  ?.camera?.getVideoTracks()[0]?.id,
                screen: window.TronoSocial.getLocalDisplayStream()?.getVideoTracks()[0]?.id,
                joined: window.TronoSocial.voiceJoined,
              }));
            const before = await snapshot();
            assert(before.track && before.camera && before.screen);
            await page.evaluate(() => window.TronoGames.openLibrary());
            await expect(page.locator('#gamesScreen')).toBeVisible();
            await expect(page.locator('button[data-game]')).toHaveCount(9);
            await page.evaluate(() => document.fonts.ready);
            await expect
              .poll(() =>
                page
                  .locator('button[data-game="azul"] img')
                  .evaluate((n) => n.complete && n.naturalWidth > 0),
              )
              .toBe(true);
            await page.screenshot({
              path: 'artifacts/azul/' + (native ? 'windows' : 'web') + '-catalogue.png',
            });
            await expect(page.locator('#gamesScreen')).toContainText('Cinzas do Abismo');
            await page.locator('button[data-game="azul"]').click();
            await expect(page.locator('#azulScreen')).toBeVisible();
            await page.getByRole('button', { name: 'Criar mesa', exact: true }).click();
            await expect(page.locator('.az-seated')).toContainText(data[0].user.nickname);
            const id = await page.evaluate(() => window.TronoGames.room.id);
            other.send({ type: 'azul', action: 'join', roomId: id });
            await expect(page.locator('.az-seated')).toContainText(data[1].user.nickname);
            await page.getByRole('button', { name: 'Iniciar com os presentes' }).click();
            await expect(page.locator('.az-board')).toHaveCount(2);
            assert.match(
              await page
                .locator('#azulScreen')
                .evaluate((n) => getComputedStyle(n).backgroundImage),
              /wood-table\.png/,
            );
            assert.match(
              await page
                .locator('.az-board')
                .first()
                .evaluate((n) => getComputedStyle(n).backgroundImage),
              /mural\.png/,
            );
            assert.match(
              await page
                .locator('.az-factory')
                .first()
                .evaluate((n) => getComputedStyle(n).backgroundImage),
              /tiles-and-factories\.png/,
            );
            if (native) {
              await page.evaluate(() => {
                window.__azOriginal = structuredClone(window.TronoGames.room);
                const room = structuredClone(window.__azOriginal);
                room.state.center = Array.from({ length: 34 }, (_, i) => i % 5);
                window.__azSocket.dispatchEvent(
                  new MessageEvent('message', {
                    data: JSON.stringify({ type: 'azul-state', room }),
                  }),
                );
                window.TronoGames.openAzul();
              });
              await expect(page.locator('.az-center .az-center-group .az-tile')).toHaveCount(34);
              await expect(page.locator('.az-pick-count')).toHaveCount(0);
              await expect(page.locator('.az-market-expanded')).toHaveCount(1);
              for (const [width, height] of [
                [1440, 960],
                [720, 1280],
                [480, 800],
              ]) {
                await page.setViewportSize({ width, height });
                const center = await page.locator('.az-center').boundingBox(),
                  tiles = await page.locator('.az-center .az-tile').evaluateAll((ns) =>
                    ns.map((n) => {
                      const r = n.getBoundingClientRect();
                      return { x: r.x, right: r.right, y: r.y, bottom: r.bottom };
                    }),
                  );
                assert(
                  tiles.every(
                    (r) =>
                      r.x >= center.x &&
                      r.right <= center.x + center.width &&
                      r.y >= center.y &&
                      r.bottom <= center.y + center.height,
                  ),
                );
                await page.screenshot({ path: 'artifacts/azul/physical-center-' + width + '.png' });
              }
              await page.evaluate(() => {
                window.__azSocket.dispatchEvent(
                  new MessageEvent('message', {
                    data: JSON.stringify({ type: 'azul-state', room: window.__azOriginal }),
                  }),
                );
                delete window.__azOriginal;
                window.TronoGames.openAzul();
              });
            }
            for (const layout of ['original']) {
              for (const [width, height] of [
                [1440, 960],
                [1280, 720],
                [1080, 1920],
                [720, 1280],
                [480, 800],
                [480, 520],
                [360, 740],
              ]) {
                if (native && width < 480) continue;
                await page.setViewportSize({ width, height });
                await expect
                  .poll(() =>
                    page
                      .locator('#azulScreen')
                      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
                  )
                  .toBe(true);
                const board = await page
                  .locator('.az-board')
                  .first()
                  .evaluate((el) => {
                    const r = el.getBoundingClientRect(),
                      cells = [
                        ...el.querySelectorAll(
                          '.az-wall .az-tile,.az-pattern-row .az-slot,.az-floor-slot',
                        ),
                      ].map((c) => c.getBoundingClientRect());
                    return {
                      left: r.left,
                      right: r.right,
                      cells: cells.map((c) => ({ left: c.left, right: c.right })),
                    };
                  });
                assert(
                  board.cells.every((c) => c.left >= board.left - 1 && c.right <= board.right + 1),
                  JSON.stringify({ native, layout, width, board }),
                );
                assert.deepEqual(await snapshot(), before);
                const aligned = await page
                  .locator('.az-board')
                  .first()
                  .evaluate((n) =>
                    [...n.querySelectorAll('.az-pattern-row')].every((line, r) => {
                      const a = line.getBoundingClientRect(),
                        b = n.querySelector('[data-cell="' + r + ',0"]').getBoundingClientRect();
                      return Math.abs(a.top - b.top) < 2 && Math.abs(a.height - b.height) < 2;
                    }),
                  );
                assert(aligned, 'Preparation and wall rows remain aligned');
                const market = await page.locator('.az-table').evaluate((n) => {
                  const rect = (x) => {
                    const r = x.getBoundingClientRect();
                    return {
                      left: r.left,
                      right: r.right,
                      top: r.top,
                      bottom: r.bottom,
                      width: r.width,
                    };
                  };
                  return {
                    supply: rect(n.querySelector('.az-supply')),
                    boards: [...n.querySelectorAll('.az-board')].map(rect),
                    factories: [...n.querySelectorAll('.az-factory')].map(rect),
                  };
                });
                assert(
                  market.boards.every((b) => b.width <= 411),
                  'Murals stay compact',
                );
                assert(
                  market.factories.every(
                    (b) =>
                      b.width >= 80 &&
                      b.left >= market.supply.left - 1 &&
                      b.right <= market.supply.right + 1,
                  ),
                  'Factories stay large and inside the market: ' +
                    JSON.stringify({ native, layout, width, height, market }),
                );
                if (width === 1440)
                  assert(
                    market.supply.width > market.boards[0].width,
                    'The central market gets more width than either mural',
                  );
                if (height > width)
                  assert(
                    market.supply.bottom <= market.boards[0].top + 1,
                    'Portrait places the enlarged market above the murals',
                  );
                if (width === 1280) {
                  const screen = await page.locator('#azulScreen').boundingBox();
                  assert(
                    market.supply.bottom <= screen.y + screen.height + 1,
                    'The market fits above the call controls on a 720px-tall monitor: ' +
                      JSON.stringify({ native, layout, market, screen }),
                  );
                }
                if (layout === 'discord' && width === 1440) {
                  const colors = await page
                    .locator('#gamesSideNav button')
                    .first()
                    .evaluate((n) => ({
                      actual: getComputedStyle(n).color,
                      expected: getComputedStyle(document.body).getPropertyValue('--theme-text'),
                    }));
                  assert.notEqual(
                    colors.actual,
                    'rgb(33, 77, 89)',
                    'Game artwork must not recolor sidebar controls',
                  );
                }
                if (width === 1440 || width === 1280 || width === 480 || width === 1080)
                  await page.screenshot({
                    path:
                      'artifacts/azul/' +
                      (native ? 'windows' : 'web') +
                      '-' +
                      layout +
                      '-' +
                      width +
                      '.png',
                  });
              }
            }
            await page.setViewportSize({ width: 1440, height: 960 });
            await page.locator('#azulFullscreen').click();
            await expect
              .poll(() => page.evaluate(() => document.fullscreenElement?.id))
              .toBe('azulScreen');
            const full = await page.locator('#azulScreen').boundingBox();
            assert(
              full.x === 0 && full.y === 0 && full.width === 1440 && full.height === 960,
              JSON.stringify(full),
            );
            await page.locator('#azulRulesButton').click();
            await expect(page.locator('#azulRulesDialog')).toBeVisible();
            await page.locator('#azulRulesClose').click();
            await page.locator('#azulFullscreen').click();
            await expect
              .poll(() => page.evaluate(() => document.fullscreenElement === null))
              .toBe(true);
            await page.evaluate(() => {
              window.__azFull = document.querySelector('#azulScreen').requestFullscreen;
              document.querySelector('#azulScreen').requestFullscreen = async () => {
                throw Error('Unsupported test');
              };
            });
            await page.locator('#azulFullscreen').click();
            await expect(page.locator('#azulScreen')).toHaveClass(/az-immersive/);
            await page.keyboard.press('Escape');
            await expect(page.locator('#azulScreen')).not.toHaveClass(/az-immersive/);
            await page.evaluate(() => {
              document.querySelector('#azulScreen').requestFullscreen = window.__azFull;
            });
            assert.deepEqual(await snapshot(), before);
            await page.locator('#azulRulesButton').click();
            await expect(page.locator('#azulRulesDialog')).toContainText(
              'contando o novo azulejo em ambos',
            );
            await page.locator('#azulRulesClose').click();
            let turns = 0,
              animated = false,
              cancelled = false;
            if (native) {
              await page.emulateMedia({ reducedMotion: 'no-preference' });
              await page.evaluate(() => {
                window.__azSounds = [];
                const original = window.TronoAudio.playSfx;
                window.TronoAudio.playSfx = (kind) => {
                  window.__azSounds.push(kind);
                  original(kind);
                };
                window.TronoAudio.setSfxEnabled(true);
              });
            }
            while (true) {
              const state = await page.evaluate(() => window.TronoGames.room.state);
              if (state.phase === 'finished') break;
              const move = R.botMove(state),
                revision = state.revision;
              if (state.players[state.turn].id === data[0].user.id) {
                const label =
                  (move.source === -1 ? 'Centro' : 'Fábrica ' + (move.source + 1)) +
                  ': pegar ' +
                  (move.source === -1 ? state.center : state.factories[move.source]).filter(
                    (c) => c === move.color,
                  ).length +
                  ' ' +
                  R.colors[move.color];
                await page.getByRole('button', { name: label, exact: true }).click();
                const mine = page.locator('[data-azul-player="' + data[0].user.id + '"]');
                if (move.row === -1)
                  await mine.getByRole('button', { name: 'Chão', exact: true }).click();
                else await mine.locator('[data-azul-row="' + move.row + '"]').click();
              } else other.send({ type: 'azul', action: 'move', revision, move });
              await expect
                .poll(() => page.evaluate(() => window.TronoGames.room.state.revision))
                .toBeGreaterThan(revision);
              assert(++turns < 400);
              const next = await page.evaluate(() => window.TronoGames.room.state);
              if (native && next.round > state.round && !animated) {
                animated = true;
                await expect
                  .poll(() => page.evaluate(() => window.TronoGames.animating))
                  .toBe(true);
                await expect(page.locator('.az-scoring-banner')).toBeVisible();
                await expect(page.locator('.az-pick:not(:disabled)')).toHaveCount(0);
                const scored = next.players.find((p) => p.last.placements.length),
                  first = scored.last.placements[0];
                await expect(
                  page.locator('[data-azul-player="' + scored.id + '"] .az-points-pop').first(),
                ).toHaveText('+' + first.points);
                await expect(
                  page.locator('[data-azul-player="' + scored.id + '"] .az-score'),
                ).toHaveText(scored.last.before + first.points + ' pts');
                await page.screenshot({ path: 'artifacts/azul/windows-scoring.png' });
                await page
                  .locator('.az-points-pop')
                  .first()
                  .evaluate((n) => (n.dataset.incomingState = 'preserved'));
                // A valid next-round move can arrive while the prior score is on screen.
                const follow = R.botMove(next);
                if (next.players[next.turn].id === data[0].user.id)
                  await page.evaluate(
                    ({ revision, move }) => window.TronoNetwork.azul('move', { revision, move }),
                    { revision: next.revision, move: follow },
                  );
                else
                  other.send({
                    type: 'azul',
                    action: 'move',
                    revision: next.revision,
                    move: follow,
                  });
                await expect
                  .poll(() => page.evaluate(() => window.TronoGames.room.state.revision))
                  .toBe(next.revision + 1);
                assert.equal(await page.evaluate(() => window.TronoGames.animating), true);
                await expect(page.locator('.az-points-pop').first()).toHaveAttribute(
                  'data-incoming-state',
                  'preserved',
                );
                const floored = next.players.find((p) => p.last.penalty);
                if (floored) {
                  await expect(page.locator('.az-scoring-value.az-negative')).toHaveText(
                    '−' + Math.min(floored.last.before + floored.last.points, floored.last.penalty),
                    { timeout: 25000 },
                  );
                  await expect(
                    page.locator('[data-azul-player="' + floored.id + '"] .az-score'),
                  ).toHaveText(
                    Math.max(0, floored.last.before + floored.last.points - floored.last.penalty) +
                      ' pts',
                  );
                }
                assert((await page.evaluate(() => window.__azSounds)).includes('azul-score'));
                await page.getByRole('button', { name: 'Concluir contagem' }).click();
                await expect
                  .poll(() => page.evaluate(() => window.TronoGames.animating))
                  .toBe(false);
                const current = await page.evaluate(() => window.TronoGames.room.state);
                for (const p of current.players)
                  await expect(
                    page.locator('[data-azul-player="' + p.id + '"] .az-score'),
                  ).toHaveText(p.score + ' pts');
                assert.deepEqual(await snapshot(), before);
              } else if (native && animated && !cancelled && next.round > state.round) {
                cancelled = true;
                await expect
                  .poll(() => page.evaluate(() => window.TronoGames.animating))
                  .toBe(true);
                await page.evaluate(() => window.TronoPortal.openVoice());
                await expect
                  .poll(() => page.evaluate(() => window.TronoGames.animating))
                  .toBe(false);
                assert.deepEqual(await snapshot(), before);
                await page.emulateMedia({ reducedMotion: 'reduce' });
                await page.evaluate(() => {
                  window.TronoAudio.setSfxEnabled(false);
                  window.TronoGames.openAzul();
                });
                await expect(page.locator('.az-scoring-banner')).toHaveCount(0);
              }
            }
            if (native) {
              assert(animated, 'Played a detailed round');
              assert(cancelled, 'Cancelled a later replay on navigation');
            }
            await expect(page.locator('.az-result')).toContainText('Recordes salvos');
            await expect(page.locator('.az-records li')).toHaveCount(native ? 2 : 4);
            await expect(page.locator('.az-bonus')).toHaveCount(2);
            assert.deepEqual(await snapshot(), before);
            await page.screenshot({
              path: 'artifacts/azul/' + (native ? 'windows' : 'web') + '-result.png',
            });
            await page.locator('#azulBack').click();
            await page.locator('button[data-game="throne"]').click();
            await expect(page.locator('#setupScreen')).toBeVisible();
            assert.deepEqual(await snapshot(), before);
            await page.evaluate(() => window.TronoGames.openAzul());
            await page.getByRole('button', { name: 'Nova partida', exact: true }).click();
            await expect(
              page.getByRole('button', { name: 'Criar mesa', exact: true }),
            ).toBeVisible();
            other.send({ type: 'azul', action: 'leave' });
            if (native) {
              await page.locator('#azulPlayerCount').selectOption('4');
              await page.getByRole('button', { name: 'Criar mesa', exact: true }).click();
              await page.getByRole('button', { name: 'Completar com bots e iniciar' }).click();
              await expect(page.locator('.az-board')).toHaveCount(4);
              await expect(page.locator('.az-factory')).toHaveCount(9);
              for (const layout of ['original']) {
                for (const [width, height] of [
                  [1440, 960],
                  [1280, 720],
                  [1080, 1920],
                  [480, 800],
                ]) {
                  await page.setViewportSize({ width, height });
                  await expect
                    .poll(() =>
                      page
                        .locator('#azulScreen')
                        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
                    )
                    .toBe(true);
                  const factories = await page
                    .locator('.az-factory')
                    .evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().width));
                  assert(
                    factories.every((w) => w >= 80),
                    'All nine factories remain large enough',
                  );
                  if (width === 1280) {
                    const market = await page.locator('.az-supply').boundingBox(),
                      screen = await page.locator('#azulScreen').boundingBox();
                    assert(
                      market.y + market.height <= screen.y + screen.height + 1,
                      'All nine factories fit above the call controls in 720p',
                    );
                  }
                  await page.screenshot({
                    path: 'artifacts/azul/windows-four-' + layout + '-' + width + '.png',
                  });
                }
              }
              assert.deepEqual(await snapshot(), before);
            }

            assert.deepEqual(errors, []);
          } finally {
            other.ws.terminate();
            await context.close();
          }
        });
    } finally {
      await browser?.close();
      await f.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
