'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  express = require('express'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
const { contentSecurityPolicy } = require('../electron/content-security.cjs');
const { installCanvasCamera } = require('./camera-fixture');
test(
  'Cinzas v0.5 runs inside both layouts without disconnecting media; hidden game stops rendering and horde resumes',
  { timeout: 180000 },
  async (t) => {
    const policy = contentSecurityPolicy(await fs.readFile(path.resolve('out/index.html'), 'utf8'));
    const server = await new Promise((r) => {
        const s = express()
          .use((req, res, next) => {
            res.setHeader('Content-Security-Policy', policy);
            next();
          })
          .use(express.static(path.resolve('out')))
          .listen(0, '127.0.0.1', () => r(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      f = await startFixture({ port: 10851, appOrigin: origin });
    let browser;
    try {
      await fs.mkdir('artifacts/cinzas', { recursive: true });
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
        await t.test(native ? 'Windows integration' : 'Website integration', async () => {
          const email = 'cinzas-' + native + '@example.test';
          await f.call('signup', { email, nickname: 'Andarilho ' + native, password: 'Senha12!' });
          await f.call('verify', { token_hash: [...f.links.keys()].at(-1), type: 'signup' });
          const data = (await f.call('login', { email, password: 'Senha12!' })).data;
          let failAsset = native;
          const context = await browser.newContext({
            acceptDownloads: true,
            viewport: { width: 1440, height: 960 },
            permissions: ['microphone', 'camera'],
          });
          await context.route('**/*', (r) => {
            if (failAsset && r.request().url().endsWith('/roguelite/assets/creatures.webp')) {
              failAsset = false;
              return r.fulfill({ status: 503, body: 'Expected preparation failure' });
            }
            return new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort();
          });
          await context.addInitScript(installCanvasCamera, { display: true });
          await context.addInitScript(
            ({ base, data, native }) => {
              window.__rafTicks = 0;
              const raf = window.requestAnimationFrame.bind(window);
              window.requestAnimationFrame = (fn) =>
                raf((t) => {
                  window.__rafTicks++;
                  fn(t);
                });
              if (window.top !== window) return;
              window.TRONO_BACKEND_URL = base;
              sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
              localStorage.setItem('tronoMusicEnabled', '0');
              localStorage.setItem('tronoSfxEnabled', '0');
              localStorage.setItem('mnDesktopNoiseMode', 'native');
              if (native)
                window.TronoDesktop = {
                  version: '0.2.1',
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
            { base: f.base, data, native },
          );
          const page = await context.newPage(),
            errors = [],
            missing = [];
          page.on('pageerror', (e) => errors.push(e.message));
          page.on('response', (r) => {
            if (r.url().includes('/roguelite/') && r.status() >= 400)
              missing.push(r.url() + ':' + r.status());
          });
          page.setDefaultTimeout(12000);
          try {
            await page.goto(origin);
            await page.waitForFunction(() => window.TronoAuth?.ready);
            await page.evaluate(() => window.TronoAuth.ready);
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
            await expect(page.locator('#gamesScreen [data-game]')).toHaveCount(9);
            await expect
              .poll(() =>
                page
                  .locator('#gamesScreen [data-game=roguelite] img')
                  .evaluate((n) => n.complete && n.naturalWidth > 0),
              )
              .toBe(true);
            await page.screenshot({
              path: 'artifacts/cinzas/' + (native ? 'windows' : 'web') + '-catalogue.png',
            });
            await page.locator('#gamesScreen [data-game=roguelite]').click();
            if (native) {
              await expect(page.locator('#rogueliteRetry')).toBeVisible();
              assert.equal(missing.length, 1);
              missing.length = 0;
              await page.locator('#rogueliteRetry').click();
            }
            const game = page.frameLocator('#rogueliteFrame');
            await expect(game.locator('#startBtn')).toBeVisible();
            assert.equal(
              await game.locator('body').evaluate(() => typeof window.TronoDesktop),
              'undefined',
            );
            assert.equal(await game.locator('#quality').inputValue(), 'low');
            assert.equal(await game.locator('#musicVolume').inputValue(), '0');
            await game.locator('#nameInput').fill('Explorador M&N');
            await game.locator('#startBtn').click();
            await expect(game.locator('#upgradeCards button')).toHaveCount(3);
            await game.locator('#upgradeCards button').first().click();
            await expect(game.locator('#hud')).toBeVisible();
            await expect(game.locator('#timeLabel')).not.toHaveText('00:00');
            const child = page.frames().find((f) => f.url().includes('/roguelite/index.html'));
            await child.evaluate(() => (window.__runMarker = 'preserved'));
            await page.screenshot({
              path: 'artifacts/cinzas/' + (native ? 'windows' : 'web') + '-game.png',
            });
            await page.locator('#rogueliteBack').click();
            await expect(page.locator('#gamesScreen')).toBeVisible();
            await expect
              .poll(() => child.evaluate(() => document.documentElement.dataset.hostActive))
              .toBe('false');
            const ticks = await child.evaluate(() => window.__rafTicks);
            await page.waitForTimeout(350);
            assert.equal(await child.evaluate(() => window.__rafTicks), ticks);
            assert.deepEqual(await snapshot(), before);
            await page.locator('#gamesScreen [data-game=roguelite]').click();
            assert.equal(await child.evaluate(() => window.__runMarker), 'preserved');
            await expect(game.locator('#pauseScreen')).toBeVisible();
            await game.locator('#resumeBtn').click();
            await page.locator('#rogueliteFullscreen').click();
            await expect
              .poll(() => page.evaluate(() => document.fullscreenElement?.id))
              .toBe('rogueliteScreen');
            await page.locator('#rogueliteFullscreen').click();
            await game.locator('#fullBtn').click();
            await expect
              .poll(() => page.evaluate(() => document.fullscreenElement?.id))
              .toBe('rogueliteFrame');
            await page.evaluate(() => document.exitFullscreen());
            assert.deepEqual(await snapshot(), before);
            for (const layout of ['corte']) {
              for (const [width, height] of [
                [1440, 960],
                [1280, 720],
                [1080, 1920],
                [720, 1280],
                [480, 800],
                [360, 740],
              ]) {
                if (native && width < 480) continue;
                await page.setViewportSize({ width, height });
                const bounds = await page
                  .locator('#rogueliteScreen')
                  .evaluate((n) => ({ scroll: n.scrollWidth, width: n.clientWidth }));
                assert(bounds.scroll <= bounds.width + 1);
                if (width >= 1280) {
                  const arena = await game.locator('#gameframe').evaluate((n) => ({
                    bottom: n.getBoundingClientRect().bottom,
                    viewport: innerHeight,
                  }));
                  assert(arena.bottom <= arena.viewport + 2, 'Full arena fits above the call dock');
                }
                assert.equal(
                  await child.evaluate(
                    () =>
                      document.documentElement.scrollWidth <=
                      document.documentElement.clientWidth + 1,
                  ),
                  true,
                );
                assert.deepEqual(await snapshot(), before);
                if (width === 1080 || width === 480)
                  await page.screenshot({
                    path:
                      'artifacts/cinzas/' +
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
            if (!(await game.locator('#pauseScreen').isVisible()))
              await game.locator('#pauseBtn').click();
            await game.locator('#exitBtn').click();
            await game.locator('#menuBtn').click();
            await game.locator('[data-mode=horde]').click();
            await game.locator('#startBtn').click();
            await game.locator('#upgradeCards button').first().click();
            await game.locator('#pauseBtn').click();
            await game.locator('#suspendBtn').click();
            await expect(game.locator('#continueHorde')).toBeVisible();
            const save = await child.evaluate(
              () => JSON.parse(localStorage.getItem('cinzas-demo-v1')).hordeSave,
            );
            assert(save);
            await game.locator('[data-mode=adventure]').click();
            await game.locator('#startBtn').click();
            await game.locator('#upgradeCards button').first().click();
            const campaign = await child.evaluate(
              () => JSON.parse(localStorage.getItem('cinzas-demo-v1')).campaignSave,
            );
            assert.equal(campaign.format, 'cinzas-campaign');
            await game.locator('#pauseBtn').click();
            await game.locator('#suspendBtn').click();
            await expect(game.locator('#continueCampaign')).toBeVisible();
            await expect(game.locator('#continueHorde')).toBeVisible();
            await game.locator('#startBtn').click();
            await expect(game.locator('#replaceDialog')).toBeVisible();
            await expect(game.locator('#replaceCancel')).toBeFocused();
            await game.locator('#replaceCancel').press('Escape');
            await expect(game.locator('#replaceDialog')).not.toBeVisible();
            await expect(game.locator('#startBtn')).toBeFocused();
            await game.locator('#startBtn').click();
            await game.locator('#replaceCancel').click();
            await expect(game.locator('#replaceDialog')).not.toBeVisible();
            await expect(game.locator('#startBtn')).toBeFocused();
            assert.deepEqual(
              await child.evaluate(
                () => JSON.parse(localStorage.getItem('cinzas-demo-v1')).campaignSave,
              ),
              campaign,
            );
            await game.locator('#continueCampaign').click();
            await expect(game.locator('#modeLabel')).toContainText('EXPEDIÇÃO');
            await game.locator('#pauseBtn').click();
            await game.locator('#suspendBtn').click();
            const downloadEvent = page.waitForEvent('download');
            await game.locator('#exportSave').click();
            const backup = await downloadEvent;
            assert.equal(backup.suggestedFilename(), 'cinzas-progresso-backup.json');
            const bytes = await fs.readFile(await backup.path());
            assert(bytes.toString().includes('Explorador M&N'));
            await game
              .locator('#saveFile')
              .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: bytes });
            await expect(game.locator('#toast')).toHaveText('Recordes e checkpoints importados.');
            const contents = JSON.parse(bytes.toString());
            assert.deepEqual(contents.campaignCheckpoint, campaign);
            assert.deepEqual(contents.checkpoint, save);
            await game.locator('#saveFile').setInputFiles({
              name: 'invalid.json',
              mimeType: 'application/json',
              buffer: Buffer.from(JSON.stringify({ ...contents, campaignCheckpoint: save })),
            });
            await expect(game.locator('#toast')).toHaveText(
              'Backup inválido. O progresso anterior foi mantido.',
            );
            await game.locator('#continueHorde').click();
            await expect(game.locator('#hud')).toBeVisible();
            assert.deepEqual(await snapshot(), before);
            assert.deepEqual(missing, []);
            assert.deepEqual(errors, []);
            await game.locator('#pauseBtn').click();
            await game.locator('#suspendBtn').click();
            await game.locator('[data-mode=adventure]').click();
            await game.locator('#startBtn').click();
            await game.locator('#replaceConfirm').click();
            await expect(game.locator('#replaceDialog')).not.toBeVisible();
            await expect(game.locator('#upgradeScreen')).toBeVisible();
            const replaced = await child.evaluate(() =>
              JSON.parse(localStorage.getItem('cinzas-demo-v1')),
            );
            assert.equal(replaced.campaignSave.history.length, 0);
            assert.deepEqual(replaced.hordeSave, save);
          } finally {
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

test(
  'Cinzas preserves pending saves and asks again when another tab updates a replacement',
  { timeout: 60000 },
  async () => {
    const { Engine } = require('../public/roguelite/core.js');
    const engine = new Engine();
    engine.start({ seed: 'aba-original', name: 'Lia' });
    const original = engine.createCheckpoint();
    let browser;
    const server = express()
      .use(express.static(path.resolve('out')))
      .listen(0, '127.0.0.1');
    await new Promise((resolve) => server.on('listening', resolve));
    try {
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--mute-audio'],
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const address = 'http://127.0.0.1:' + server.address().port + '/roguelite/';
      await page.addInitScript(() => {
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (window.blockGameSave && key === 'cinzas-demo-v1')
            throw new DOMException('quota fixture', 'QuotaExceededError');
          return write.call(this, key, value);
        };
      });
      await page.goto(address);
      const other = await context.newPage();
      await other.goto(address);
      const write = (checkpoint) =>
        other.evaluate(
          (checkpoint) =>
            localStorage.setItem(
              'cinzas-demo-v1',
              JSON.stringify({ scores: [], campaignSave: checkpoint }),
            ),
          checkpoint,
        );
      const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('cinzas-demo-v1')));
      await write(original);
      await page.locator('#startBtn').click();
      await expect(page.locator('#replaceDialog')).toBeVisible();
      const newer = { ...original, seed: 'aba-mais-nova' };
      await write(newer);
      await page.locator('#replaceConfirm').click();
      await expect(page.locator('#replaceDialog')).toBeVisible();
      assert.equal((await read()).campaignSave.seed, newer.seed);
      await page.locator('#replaceCancel').click();
      await page.locator('#continueCampaign').click();
      await expect(page.locator('#seedLabel')).toHaveText('SEMENTE ' + newer.seed);
      await page.locator('#pauseBtn').click();
      await page.locator('#suspendBtn').click();
      await page.evaluate(() => {
        window.blockGameSave = true;
      });
      await page.locator('#startBtn').click();
      await page.locator('#replaceConfirm').click();
      await page.locator('#upgradeCards button').first().click();
      const pendingSeed = await page.locator('#seedLabel').textContent();
      assert.notEqual(pendingSeed, 'SEMENTE ' + newer.seed);
      await page.locator('#pauseBtn').click();
      await page.locator('#suspendBtn').click();
      await page.evaluate(() => {
        window.blockGameSave = false;
      });
      await page.locator('#soundBtn').click();
      await page.locator('#continueCampaign').click();
      await expect(page.locator('#seedLabel')).toHaveText(pendingSeed);
      assert.equal('SEMENTE ' + (await read()).campaignSave.seed, pendingSeed);
      await context.close();
    } finally {
      await browser?.close();
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  },
);

test(
  'Cinzas unlocked region practice preserves the regular campaign and legacy',
  { timeout: 60000 },
  async () => {
    const { Engine } = require('../public/roguelite/core.js');
    const engine = new Engine();
    engine.start({ seed: 'campanha-preservada', name: 'Lia' });
    const original = {
      scores: [],
      campaignSave: engine.createCheckpoint(),
      legacy: { version: 1, cleared: 15, weapon: 'bow' },
    };
    const server = express()
      .use(express.static(path.resolve('out')))
      .listen(0, '127.0.0.1');
    await new Promise((resolve) => server.on('listening', resolve));
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--mute-audio'],
      });
      const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
      await page.addInitScript((value) => {
        localStorage.setItem('cinzas-demo-v1', JSON.stringify(value));
        window.fixturePad = {
          id: 'Xbox fixture',
          index: 0,
          connected: true,
          timestamp: 1,
          mapping: 'standard',
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
        };
        Object.defineProperty(navigator, 'getGamepads', { value: () => [window.fixturePad] });
      }, original);
      await page.goto('http://127.0.0.1:' + server.address().port + '/roguelite/');
      await expect(page.locator('#practiceRegion option[value="4"]')).toBeDisabled();
      await expect(page.locator('#practiceRegion option[value="3"]')).toBeEnabled();
      for (let step = 0; step < 10; step++) {
        if (await page.evaluate(() => document.activeElement.id === 'practiceBtn')) break;
        await page.evaluate(() => {
          window.fixturePad.buttons[13] = { pressed: true, value: 1 };
        });
        await page.waitForTimeout(180);
        await page.evaluate(() => {
          window.fixturePad.buttons[13] = { pressed: false, value: 0 };
        });
        await page.waitForTimeout(180);
      }
      await expect(page.locator('#practiceBtn')).toBeFocused();
      assert(
        await page.evaluate(() => {
          const rect = document.querySelector('#practiceBtn').getBoundingClientRect();
          const frame = document.querySelector('#gameframe').getBoundingClientRect();
          return (
            rect.top >= Math.max(0, frame.top) && rect.bottom <= Math.min(innerHeight, frame.bottom)
          );
        }),
        'Controller focus must scroll its action inside the visible game frame',
      );
      await page.locator('#practiceRegion').selectOption('3');
      await page.locator('#practiceBtn').click();
      await expect(page.locator('#replaceDialog')).not.toBeVisible();
      await page.locator('#upgradeCards button').first().click();
      await expect(page.locator('#modeLabel')).toContainText('TREINO · GELEIRAS');
      await expect(page.locator('#roomLabel')).toContainText('Etapa 16 / 25');
      await page.locator('#pauseBtn').click();
      await expect(page.locator('#suspendBtn')).not.toBeVisible();
      await page.locator('#exitBtn').click();
      await expect(page.locator('#endTitle')).toHaveText('Treino encerrado.');
      assert.deepEqual(
        await page.evaluate(() => JSON.parse(localStorage.getItem('cinzas-demo-v1'))),
        original,
      );
      await page.locator('#menuBtn').click();
      await page.locator('#continueCampaign').click();
      await expect(page.locator('#seedLabel')).toHaveText('SEMENTE campanha-preservada');
    } finally {
      await browser?.close();
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  },
);

test('Cinzas local achievements read durable campaign and horde facts without rewriting progress', { timeout: 45000 }, async () => {
  const server = express().use(express.static(path.resolve('out'))).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  let browser;
  const original = { sound: false, legacy: { version: 1, cleared: 10, weapon: 'bow' }, scores: [{ edition: '0.5', name: 'Lia', difficulty: 'normal', wave: 5, kills: 12 }] };
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    await page.addInitScript((data) => localStorage.setItem('cinzas-demo-v1', JSON.stringify(data)), original);
    await page.goto('http://127.0.0.1:' + server.address().port + '/roguelite/');
    await page.getByRole('button', { name: 'Conquistas', exact: true }).click({timeout:5000});
    await expect(page.locator('#achievementsDialog')).toBeVisible();
    await expect(page.locator('#achievementsTitle')).toHaveText('Conquistas locais · 4/8');
    await expect(page.locator('#achievementGrid [data-unlocked=true]')).toHaveCount(4);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('cinzas-demo-v1'))), original);
    await page.keyboard.press('Escape');
    await expect(page.locator('#achievementsDialog')).not.toBeVisible();
    await page.evaluate(() => { const data=JSON.parse(localStorage.getItem('cinzas-demo-v1'));data.legacy.cleared=25;data.legacy.weapon='';data.scores[0].wave=20;localStorage.setItem('cinzas-demo-v1',JSON.stringify(data)); });
    const complete = await page.evaluate(() => localStorage.getItem('cinzas-demo-v1'));
    await page.getByRole('button', { name: 'Conquistas', exact: true }).click();
    await expect(page.locator('#achievementsTitle')).toHaveText('Conquistas locais · 8/8');
    await expect(page.locator('#achievementGrid [data-unlocked=true]')).toHaveCount(8);
    assert.equal(await page.evaluate(() => localStorage.getItem('cinzas-demo-v1')), complete);
  } finally {
    await browser?.close();
    await new Promise((resolve) => { server.close(resolve);server.closeAllConnections(); });
  }
});

test('Cinzas keyboard remapping persists, swaps conflicts and updates the real combat hints', { timeout: 45000 }, async () => {
  const server=express().use(express.static(path.resolve('out'))).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.on('listening',resolve));let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--mute-audio']});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto('http://127.0.0.1:'+server.address().port+'/roguelite/');
    await page.locator('#controllerBtn').click();
    const attack=page.locator('#keyboardMappingButtons [data-key-map=attack]');
    await attack.click({timeout:5000});await page.keyboard.press('h');
    await expect(attack.locator('b')).toHaveText('H');
    await page.locator('#controllerDialog [data-close]').first().click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cinzas-demo-v1')).keyboardMapping);
    assert.equal(saved.attack[0],'KeyH');
    await page.reload();await page.locator('#controllerBtn').click();await expect(attack.locator('b')).toHaveText('H');
    await attack.click();await page.keyboard.down('Shift');await page.keyboard.press('h');await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cinzas-demo-v1')).keyboardMapping.attack[0]),'KeyH','A shifted letter must not save Shift as a replacement');
    await page.keyboard.press('Escape');await expect(page.locator('#controllerDialog')).toBeVisible();
    await attack.click();await page.keyboard.press('1');
    await expect(page.locator('#keyboardStatus')).toContainText('Esc cancela');
    await page.keyboard.press('Escape');await expect(page.locator('#controllerDialog')).toBeVisible();
    await expect(attack.locator('b')).toHaveText('H');
    await page.locator('#keyboardMappingButtons [data-key-map=skill]').click();await page.keyboard.press('h');
    await expect(attack.locator('b')).toHaveText('K');
    await expect(page.locator('#keyboardMappingButtons [data-key-map=skill]')).toContainText('H');
    await page.locator('#controllerDialog [data-close]').first().click();
    await page.locator('[data-mode=horde]').click();await page.locator('#startBtn').click();await page.locator('#upgradeCards button').first().click();
    await expect(page.locator('#skillKey')).toHaveText('H');
    await expect(page.locator('#actionHints')).toContainText('K');
    await page.keyboard.press('h');await expect(page.locator('#skillStatus')).toHaveText(/^[0-9]+\.[0-9]s$/);
    await page.locator('#controllerBtn').click();await attack.click();await page.keyboard.press('Shift');
    await expect(attack.locator('b')).toHaveText('Shift');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cinzas-demo-v1')).keyboardMapping.attack[0]),'ShiftLeft');
    await page.locator('#resetKeyboard').click();
    await expect(page.locator('#keyboardMappingButtons [data-key-map=attack] b')).toHaveText('J');
    await page.locator('#controllerDialog [data-close]').first().click();await expect(page.locator('#skillKey')).toHaveText('K');
  } finally {await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});

test('Cinzas screen shake preference follows the system, persists and changes actual presentation only', { timeout: 45000 }, async () => {
  const server=express().use(express.static(path.resolve('out'))).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.on('listening',resolve));let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--mute-audio']});
    const page=await browser.newPage({viewport:{width:1440,height:900}});await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(()=>{
      Object.defineProperty(window,'Abyss',{configurable:true,set(api){delete window.Abyss;window.Abyss=api;const Engine=api.Engine;api.Engine=class extends Engine{constructor(...args){super(...args);if(!window.presentationEngine)window.presentationEngine=this;}};}});
      Object.defineProperty(window,'AbyssRenderer',{configurable:true,set(Renderer){delete window.AbyssRenderer;window.AbyssRenderer=Renderer;const draw=Renderer.prototype.draw;Renderer.prototype.draw=function(...args){window.presentedShakes??=[];window.presentedShakes.push(args[2]);if(window.presentedShakes.length>64)window.presentedShakes.shift();return draw.apply(this,args);};}});
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/roguelite/');await page.locator('#controllerBtn').click();
    const reduce=page.getByRole('checkbox',{name:'Reduzir tremor de tela',exact:true});
    await expect(reduce).toBeChecked({timeout:5000});
    await reduce.uncheck();await page.reload();await page.locator('#controllerBtn').click();await expect(reduce).not.toBeChecked();
    await page.locator('#controllerDialog [data-close]').first().click();
    await page.locator('[data-mode=horde]').click();await page.locator('#startBtn').click();await page.locator('#upgradeCards button').first().click();
    await page.evaluate(()=>{window.presentedShakes=[];window.presentationEngine.emit('shake',{amount:12});});
    await expect.poll(()=>page.evaluate(()=>window.presentedShakes.some(value=>value>0))).toBe(true);
    await page.locator('#controllerBtn').click();await reduce.check();await page.locator('#controllerDialog [data-close]').first().click();
    await page.evaluate(()=>{window.presentedShakes=[];window.presentationEngine.emit('shake',{amount:12});});await page.waitForTimeout(250);
    const values=await page.evaluate(()=>window.presentedShakes);
    assert(values.length>0);assert(values.every(value=>value===0),'Reduced shake must render no camera displacement');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cinzas-demo-v1')).reducedShake),true);
  } finally {await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});
