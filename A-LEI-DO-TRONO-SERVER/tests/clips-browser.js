'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  { spawnSync } = require('node:child_process');
const express = require('express'),
  { WebSocketServer } = require('ws'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
test(
  'automatic screen-share replay, original-quality encoding, local Windows triggers and persistent clips',
  { timeout: 150000 },
  async (t) => {
    const app = express();
    app.get('/game-test', (_, res) =>
      res.send('<!doctype html><button style="padding:80px">Jogo em primeiro plano</button>'),
    );
    app.use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 10685, appOrigin: origin });
    let browser, desktop;
    const errors = [],
      artifacts = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    try {
      const email = 'clips@example.test';
      await fixture.call('signup', { email, nickname: 'Jogador Clipes', password: 'Senha12!' });
      await fixture.call('verify', { token_hash: [...fixture.links][0][0], type: 'signup' });
      const data = (await fixture.call('login', { email, password: 'Senha12!' })).data;
      browser = await chromium.launch({
        executablePath:
          process.env.AUTH_TEST_CHROMIUM || process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        // Windows focus assertions need actual browser windows; new headless
        // Chromium keeps each page focused independently of bringToFront().
        headless: process.platform !== 'win32',
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        permissions: ['microphone', 'camera'],
        acceptDownloads: true,
      });
      await context.route('**/*', (route) =>
        ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      );
      await context.addInitScript(
        ({ backend, data }) => {
          window.TRONO_BACKEND_URL = backend;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoNoiseSuppression', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
          window.__captures = [];
          window.__recordOptions = [];
          window.__captureStreams = [];
          const Recorder = window.MediaRecorder;
          window.MediaRecorder = class extends Recorder {
            constructor(stream, options) {
              super(stream, options);
              window.__recordOptions.push(options);
              window.__replayStream = stream;
            }
          };
          navigator.mediaDevices.getDisplayMedia = async (options) => {
            window.__captures.push(options);
            if (window.__denyCapture) throw new DOMException('Canceled', 'NotAllowedError');
            const canvas = document.createElement('canvas');
            canvas.width = 1920;
            canvas.height = 1080;
            const ctx = canvas.getContext('2d'),
              start = performance.now();
            const paint = () => {
              const seconds = (performance.now() - start) / 1000;
              ctx.fillStyle = seconds < 2 ? '#1544b8' : '#b82237';
              ctx.fillRect(0, 0, 1920, 1080);
              ctx.fillStyle = '#fff';
              ctx.font = '60px sans-serif';
              ctx.fillText('Jogo · ' + seconds.toFixed(1) + ' s', 100, 360);
              ctx.fillStyle = '#26a899';
              ctx.fillRect(500 + Math.sin(seconds * 2) * 200, 500, 300, 200);
            };
            paint();
            const stream = canvas.captureStream(options.video.frameRate.ideal),
              timer = setInterval(paint, 16),
              video = stream.getVideoTracks()[0],
              stop = video.stop.bind(video);
            video.stop = () => {
              clearInterval(timer);
              stop();
            };
            if (options.audio) {
              const audio = new AudioContext(),
                oscillator = audio.createOscillator(),
                gain = audio.createGain(),
                destination = audio.createMediaStreamDestination();
              gain.gain.value = 0.02;
              oscillator.frequency.value = 300;
              oscillator.connect(gain);
              gain.connect(destination);
              oscillator.start();
              const track = destination.stream.getAudioTracks()[0],
                stopAudio = track.stop.bind(track);
              track.stop = () => {
                stopAudio();
                void audio.close();
              };
              stream.addTrack(track);
            }
            window.__captureStreams.push(stream);
            return stream;
          };
        },
        { backend: fixture.base, data },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('dialog', (d) => void d.accept());
      await page.goto(origin + '/#clips-desktop=' + 'ab'.repeat(32) + '&keep=ok');
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.locator('button[data-voice-channel]').first().click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await page.evaluate(() => {
        window.__keptVoice = window.TronoSocial.getLocalAudioTrack();
      });
      await page.waitForFunction(
        () => window.TronoClips && window.TronoClipControls && window.TronoClipDesktop,
      );
      const resources = async () => {
        await page.evaluate(() => window.TronoCallSettings.open('resources'));
      };
      const central = async () => {
        await resources();
        await page.getByRole('button', { name: 'Seus clipes', exact: true }).click();
      };
      const prefs = () => page.locator('[data-clips-tab="preferences"]').click(),
        library = () => page.locator('[data-clips-tab="library"]').click();
      async function share(audio = true) {
        await page.evaluate(() => window.TronoCallSettings.close());
        await page.locator('[data-control=screenShareBtn]').click();
        await page.locator('#shareAudio').setChecked(audio);
        await page.locator('#screenOptionsConfirm').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      }
      await t.test(
        'controls remain in resource settings; sharing prepares replay without a second picker',
        async () => {
          assert.equal(new URL(page.url()).hash, '#keep=ok');
          assert.equal(
            await page.evaluate(() => sessionStorage.getItem('mn-clips-desktop-code')),
            'ab'.repeat(32),
          );
          assert.equal(await page.locator('.chat-only-top-actions [data-open-clips]').count(), 0);
          await resources();
          await expect(page.locator('#clipToolbarNow')).toBeVisible();
          await central();
          await expect(page.locator('#clipsLibrary')).toBeVisible();
          await prefs();
          await expect(page.locator('#clipQuality')).toHaveValue('balanced');
          await expect(page.locator('#clipFps')).toHaveValue('60');
          await page.getByRole('button', { name: 'Econômica · 720p / 30 FPS', exact: true }).click();
          await expect(page.locator('#clipQuality')).toHaveValue('light');
          await expect(page.locator('#clipFps')).toHaveValue('30');
          await page.getByRole('button', { name: 'Excelente · 1440p / 60 FPS', exact: true }).click();
          await expect(page.locator('#clipQuality')).toHaveValue('high');
          await expect(page.locator('#clipFps')).toHaveValue('60');
          await page.locator('#clipQuality').selectOption('balanced');
          await page.locator('#clipSeconds').selectOption('15');
          await page.locator('#clipShortcut').click();
          await page.keyboard.press('F5');
          await expect(page.locator('#clipsStatus')).toContainText('Evite atalhos reservados');
          await page.keyboard.press('Escape');
          await expect(page.locator('#clipsDialog')).toBeVisible();
          await expect(page.locator('#clipShortcut')).toHaveText('Ctrl + Shift + X');
          await page.locator('#clipShortcut').click();
          await page.keyboard.press('Control+Shift+K');
          await page.locator('#clipClose').click();
          await resources();
          await expect(
            page.getByRole('button', { name: 'Clipar agora', exact: true }).locator('svg'),
          ).toBeVisible();
          await page.evaluate(() => {
            window.__denyCapture = true;
          });
          await page.evaluate(() => window.TronoCallSettings.close());
          await page.locator('[data-control=screenShareBtn]').click();
          await page.locator('#screenOptionsConfirm').click();
          await expect(
            page.locator('[aria-label="Chamada da Corte"] footer [role=status]'),
          ).toContainText('cancelado');
          assert.equal(await page.evaluate(() => window.TronoClips.active), false);
          await page.evaluate(() => {
            window.__denyCapture = false;
          });
          await share();
          await expect(page.locator('#clipToolbarNow')).toBeEnabled({ timeout: 15000 });
          assert.equal(
            await page.evaluate(() => window.__captures.length),
            2,
            'one denied picker plus one successful picker, no replay picker',
          );
          const capture = await page.evaluate(() => window.__captures.at(-1));
          assert.equal(capture.video.height.ideal, 1080);
          assert.equal(capture.video.frameRate.ideal, 60);
          assert.equal(capture.video.height.max, undefined);
          assert.equal(capture.audio.restrictOwnAudio, true);
          assert.equal(capture.windowAudio, 'window');
          const options = await page.evaluate(() => window.__recordOptions.at(-1));
          assert.equal(options.videoBitsPerSecond, 24000000);
          assert.equal(options.audioBitsPerSecond, 192000);
          assert.equal(
            await page.evaluate(
              () =>
                window.TronoSocial.getLocalAudioTrack() === window.__keptVoice &&
                window.__keptVoice.readyState === 'live',
            ),
            true,
          );
          assert.equal(await page.evaluate(() => window.TronoClips.replayStatus.hasAudio), true);
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSettings.height), 720);
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSettings.fps), 30);
          assert.equal(
            await page.evaluate(
              () =>
                window.TronoSocial.getLocalDisplayStream() !==
                window.TronoSocial.getMediaSources().find((p) => p.self).screen,
            ),
            true,
          );
        },
      );
      await t.test(
        'multiple recent replays preserve 1080p video, included audio, zero timestamps and seek',
        async () => {
          // Chromium may ignore MediaRecorder keyframe interval hints and emit a
          // keyframe every 10 s. Fill enough history to test actual trailing replay,
          // rather than mistaking a decodable warm-up clip for failed trimming.
          await page.waitForTimeout(32000);
          await resources();
          await page.locator('#clipToolbarNow').click();
          await central();
          await expect(page.locator('#clipList .clip-card')).toHaveCount(1);
          await page.keyboard.press('Control+Shift+K');
          await expect(page.locator('#clipList .clip-card')).toHaveCount(2);
          const rows = await page.evaluate(
            (owner) => window.TronoClipStore.list(owner),
            data.user.id,
          );
          for (const row of rows) {
            assert(row.duration >= 14 && row.duration <= 27, JSON.stringify({duration: row.duration, fps: row.fps, quality: row.quality}));
            assert.equal(row.quality, '1920×1080');
            assert.equal(row.fps, 60);
          }
          const card = page.locator('#clipList .clip-card').first();
          await card.getByRole('button', { name: 'Prévia', exact: true }).click();
          const video = card.locator('video');
          await expect.poll(() => video.evaluate((v) => v.readyState)).toBeGreaterThan(0);
          assert.equal(await video.evaluate((v) => v.videoWidth), 1920);
          await video.evaluate(async (v) => {
            await v.play();
          });
          await expect.poll(() => video.evaluate((v) => v.currentTime)).toBeGreaterThan(0.1);
          await video.evaluate((v) => {
            v.pause();
            v.currentTime = v.duration - 1;
          });
          await expect.poll(() => video.evaluate((v) => v.seeking)).toBe(false);
          await page.screenshot({
            path: path.join(artifacts, 'clips-sharing-library-desktop.png'),
          });
          await page.evaluate(() => {
            window.__previewUrl = document.querySelector('#clipList video').currentSrc;
            window.__revokedPreview = [];
            const revoke = URL.revokeObjectURL.bind(URL);
            URL.revokeObjectURL = (url) => {
              window.__revokedPreview.push(url);
              revoke(url);
            };
          });
          await page.locator('#clipClose').click();
          await expect(page.locator('#clipList video')).toHaveCount(0);
          assert.equal(
            await page.evaluate(() => window.__revokedPreview.includes(window.__previewUrl)),
            true,
          );
          await central();
          await expect(page.locator('#clipList .clip-card')).toHaveCount(2);
          await prefs();
          await page.screenshot({
            path: path.join(artifacts, 'clips-sharing-preferences-desktop.png'),
          });
          await library();
        },
      );
      await t.test(
        'floating controls keep the numeric count, reuse one window and create one replay without another capture',
        async () => {
          await page.evaluate(() => {
            window.__pipRequests = 0;
            Object.defineProperty(window, 'documentPictureInPicture', {
              configurable: true,
              value: {
                requestWindow: async () => {
                  window.__pipRequests++;
                  return window.open('about:blank', 'clip-floating-test', 'width=290,height=210');
                },
              },
            });
            window.TronoClipPreferences.beginShortcut();
            window.TronoClipPreferences.cancelShortcut();
          });
          const popupEvent = page.waitForEvent('popup');
          await page.locator('#clipFloating').click();
          const popup = await popupEvent;
          await expect(popup.locator('#pipCount')).toHaveText('2 clipes pendentes');
          await expect(popup.locator('#pipClip')).toBeEnabled();
          await page.evaluate(() => window.TronoClipControls.openFloating());
          assert.equal(await page.evaluate(() => window.__pipRequests), 1);
          await popup.locator('#pipClip').click();
          await expect(popup.locator('#pipCount')).toHaveText('3 clipes pendentes');
          await expect(page.locator('#clipToolbarCount')).toHaveText('3');
          assert.equal(await page.evaluate(() => window.__captures.length), 2);
          await popup.close();
          await page.bringToFront();
          await page
            .locator('#clipList .clip-card')
            .first()
            .getByRole('button', { name: 'Descartar', exact: true })
            .click();
          await expect(page.locator('#clipList .clip-card')).toHaveCount(2);
          await prefs();
          await page.locator('#clipDesktopCode').focus();
          await page.keyboard.press('Control+Shift+K');
          await expect(page.locator('#clipToolbarCount')).toHaveText('2');
          await library();
        },
      );
      await t.test(
        'Windows messages clip while another window has focus; duplicate events are ignored',
        async () => {
          const token = 'ab'.repeat(32);
          desktop = new WebSocketServer({ host: '127.0.0.1', port: 32196 });
          await new Promise((resolve) => desktop.once('listening', resolve));
          let client, configuration;
          desktop.on('connection', (ws) => {
            client = ws;
            ws.on('message', (raw) => {
              const m = JSON.parse(raw);
              if (m.type === 'pair') {
                assert.equal(m.token, token);
                ws.send('null');
                ws.send('[]');
                ws.send(JSON.stringify({ type: 'registered', active: true, shortcut: 'unpaired' }));
                ws.send(JSON.stringify({ type: 'clip', id: 'before-pair' }));
                ws.send(JSON.stringify({ type: 'paired' }));
              } else if (m.type === 'configure') {
                configuration = m;
                ws.send(
                  JSON.stringify({
                    type: 'registered',
                    active: m.active,
                    shortcut: 'Ctrl + Shift + K',
                  }),
                );
              }
            });
          });
          await prefs();
          await page.locator('#clipDesktopCode').fill(token);
          await page.locator('#clipDesktopConnect').click();
          await expect(page.locator('#clipDesktopStatus')).toContainText('Atalho global ativo');
          assert.equal(configuration.shortcut.code, 'KeyK');
          await page.locator('#clipClose').click();
          await page.keyboard.press('Control+Shift+K');
          await page.waitForTimeout(200);
          await expect(page.locator('#clipToolbarCount')).toHaveText('2');
          const focus = await context.newCDPSession(page);
          await focus.send('Emulation.setFocusEmulationEnabled', { enabled: false });
          const game = await context.newPage();
          await game.goto(origin + '/game-test');
          await game.bringToFront();
          await game.locator('button').click();
          await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false);
          const message = JSON.stringify({ type: 'clip', id: 'native-hotkey-1' });
          client.send(message);
          client.send(message);
          await expect(page.locator('#clipToolbarCount')).toHaveText('3');
          assert.equal(await page.evaluate(() => window.__captures.length), 2);
          await game.close();
          await focus.send('Emulation.setFocusEmulationEnabled', { enabled: true });
          await focus.detach();
          await page.bringToFront();
          await central();
          await prefs();
          await page.locator('#clipDesktopDisconnect').click();
          await library();
        },
      );
      await t.test(
        'save cancellation preserves clip; folder and Download export playable high-quality files',
        async (t) => {
          await page.evaluate(() => {
            window.showSaveFilePicker = async () => {
              throw new DOMException('Canceled', 'AbortError');
            };
          });
          await page
            .locator('#clipList .clip-card')
            .first()
            .getByRole('button', { name: 'Salvar', exact: true })
            .click();
          await expect(page.locator('#clipsStatus')).toContainText('continua armazenado');
          await expect(page.locator('#clipPendingCount')).toHaveText('3');
          await page.evaluate(() => {
            window.showDirectoryPicker = async () => {
              const root = await navigator.storage.getDirectory();
              return root.getDirectoryHandle('pasta-escolhida', { create: true });
            };
          });
          await prefs();
          await page.locator('#clipChooseFolder').evaluate((el) => {
            el.hidden = false;
          });
          await page.locator('#clipChooseFolder').click();
          await expect(page.locator('#clipFolder')).toContainText('pasta-escolhida');
          await library();
          const card = page.locator('#clipList .clip-card').first(),
            id = await card.getAttribute('data-clip-id');
          await card.getByRole('button', { name: 'Salvar', exact: true }).click();
          await expect(
            page.locator('#clipList [data-clip-id="' + id + '"] .clip-state'),
          ).toContainText('Salvo');
          await expect(page.locator('#clipPendingCount')).toHaveText('2');
          const size = await page.evaluate(
            async ({ owner, id }) => {
              const clip = (await window.TronoClipStore.list(owner)).find((c) => c.id === id),
                folder = await window.TronoClipStore.directory(owner);
              return (await (await folder.getFileHandle(clip.filename)).getFile()).size;
            },
            { owner: data.user.id, id },
          );
          assert(size > 1000);
          await prefs();
          await page.locator('#clipResetFolder').click();
          await page.evaluate(() => {
            window.showSaveFilePicker = undefined;
            window.showDirectoryPicker = undefined;
          });
          await library();
          const pending = page
              .locator('#clipList .clip-card')
              .filter({ has: page.getByRole('button', { name: 'Salvar', exact: true }) })
              .first(),
            wait = page.waitForEvent('download');
          await pending.getByRole('button', { name: 'Salvar', exact: true }).click();
          const download = await wait,
            filename = path.join(artifacts, 'replay-sharing-1080.webm');
          await download.saveAs(filename);
          const missing = ['ffprobe', 'ffmpeg'].filter(
            (tool) => spawnSync(tool, ['-version']).error?.code === 'ENOENT',
          );
          await t.test(
            'external codec inspection, full decode and first frame',
            {
              skip: missing.length
                ? 'Unavailable: ' + missing.join(', ') + '; Chrome replay frames and seek passed'
                : false,
            },
            () => {
              const probe = spawnSync(
                'ffprobe',
                [
                  '-v',
                  'error',
                  '-show_entries',
                  'format=duration:stream=codec_name,start_time,width,height',
                  '-of',
                  'json',
                  filename,
                ],
                { encoding: 'utf8' },
              );
              assert.equal(probe.status, 0, probe.stderr);
              const info = JSON.parse(probe.stdout);
              assert(Number(info.format.duration) > 14);
              assert(
                info.streams.some(
                  (s) => s.codec_name === 'vp8' && s.width === 1920 && s.height === 1080,
                ),
              );
              assert(info.streams.some((s) => s.codec_name === 'opus'));
              assert(info.streams.every((s) => Math.abs(Number(s.start_time)) < 0.2));
              const decode = spawnSync(
                'ffmpeg',
                ['-v', 'error', '-threads', '2', '-i', filename, '-f', 'null', '-'],
                { encoding: 'utf8', timeout: 25000 },
              );
              assert.equal(decode.status, 0, decode.stderr);
              const first = spawnSync(
                'ffmpeg',
                [
                  '-v',
                  'error',
                  '-i',
                  filename,
                  '-frames:v',
                  '1',
                  '-vf',
                  'scale=1:1',
                  '-f',
                  'rawvideo',
                  '-pix_fmt',
                  'rgb24',
                  '-',
                ],
                { timeout: 15000 },
              );
              assert.equal(first.status, 0, String(first.stderr));
              assert(first.stdout[0] > first.stdout[2], 'old blue opening omitted');
            },
          );
        },
      );
      await t.test(
        'pausing replay releases only its clones; live sharing and microphone continue',
        async () => {
          await prefs();
          await page.locator('#clipAuto').uncheck();
          await expect.poll(() => page.evaluate(() => window.TronoClips.active)).toBe(false);
          assert.equal(
            await page.evaluate(() =>
              window.__replayStream.getTracks().every((t) => t.readyState === 'ended'),
            ),
            true,
          );
          assert.equal(
            await page.evaluate(() =>
              window.TronoSocial.getLocalDisplayStream()
                .getTracks()
                .every((t) => t.readyState === 'live'),
            ),
            true,
          );
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), true);
          await page.locator('#clipAuto').check();
          await expect(page.locator('#clipNow')).toBeEnabled({ timeout: 15000 });
          assert.equal(await page.evaluate(() => window.__captures.length), 2);
          await page.locator('#clipClose').click();
          await page.evaluate(() => window.TronoCallSettings.close());
          await page.locator('[data-control=screenShareBtn]').click();
          await expect.poll(() => page.evaluate(() => window.TronoClips.active)).toBe(false);
          assert.equal(
            await page.evaluate(() =>
              window.__captureStreams
                .at(-1)
                .getTracks()
                .every((t) => t.readyState === 'ended'),
            ),
            true,
          );
          assert.equal(
            await page.evaluate(
              () =>
                window.TronoSocial.getLocalAudioTrack() === window.__keptVoice &&
                window.__keptVoice.readyState === 'live',
            ),
            true,
          );
        },
      );
      await t.test(
        'reload preserves clips and preferences, does not resume capture and keeps mobile controls accessible',
        async () => {
          await page.reload();
          await page.waitForFunction(() => window.TronoAuth?.ready);
          await page.evaluate(() => window.TronoAuth.ready);
          await page.waitForFunction(() => window.TronoAuth?.ready);
          await page.evaluate(() => window.TronoAuth.ready);
          await central();
          await expect(page.locator('#clipList .clip-card')).toHaveCount(3);
          await expect(page.locator('#clipPendingCount')).toHaveText('2');
          assert.equal(await page.evaluate(() => window.__captures.length), 0);
          await prefs();
          await expect(page.locator('#clipShortcut')).toHaveText('Ctrl + Shift + K');
          await library();
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({ path: path.join(artifacts, 'clips-sharing-library-mobile.png') });
          assert(
            await page.locator('#clipsDialog').evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
          );
          await page.locator('#clipClose').click();
          await page.screenshot({ path: path.join(artifacts, 'clips-sharing-toolbar-mobile.png') });
          await page.evaluate(() => window.TronoCallSettings.close());
          await page.getByRole('button', { name: 'Abrir canais', exact: true }).click();
          await resources();
          const toolbar = await page.locator('#clipToolbarNow').boundingBox();
          assert(toolbar.x >= 0 && toolbar.x + toolbar.width <= 390);
          await page.setViewportSize({ width: 1440, height: 1000 });
        },
      );
      await t.test(
        'storage quota failure pauses replay while call keeps sharing; memory-only clip remains discardable',
        async () => {
          await page.evaluate(() => window.TronoCallSettings.close());
          await page.locator('button[data-voice-channel]').first().click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await share(false);
          await expect(page.locator('#clipToolbarNow')).toBeEnabled();
          assert.equal(await page.evaluate(() => window.TronoClips.replayStatus.hasAudio), false);
          await page.evaluate(() => {
            const put = window.TronoClipStore.put;
            window.TronoClipStore.put = async () => {
              window.TronoClipStore.put = put;
              throw new DOMException('Quota exceeded', 'QuotaExceededError');
            };
            window.__removeClip = window.TronoClipStore.remove;
            window.TronoClipStore.remove = async () => {
              throw Error('Database unavailable');
            };
          });
          await resources();
          await page.locator('#clipToolbarNow').click();
          await central();
          await expect(page.locator('#clipList .clip-card')).toHaveCount(4);
          await expect(page.locator('#clipsStatus')).toContainText('somente na memória');
          assert.equal(await page.evaluate(() => window.TronoClips.active), false);
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), true);
          assert.equal(
            await page.evaluate(
              () => window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0].readyState,
            ),
            'live',
          );
          await page
            .locator('#clipList .clip-card')
            .first()
            .getByRole('button', { name: 'Descartar', exact: true })
            .click();
          await expect(page.locator('#clipList .clip-card')).toHaveCount(3);
          await page.evaluate(() => {
            window.TronoClipStore.remove = window.__removeClip;
          });
          await page.locator('#clipResume').click();
          await expect(page.locator('#clipNow')).toBeEnabled();
          await page.evaluate(() => {
            const track = window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0];
            track.stop();
            track.dispatchEvent(new Event('ended'));
          });
          await expect
            .poll(() =>
              page.evaluate(() => window.TronoSocial.screenSharing || window.TronoClips.active),
            )
            .toBe(false);
        },
      );
      await t.test(
        'disposing the replay runtime removes UI, auth, keyboard and unload listeners without starting new capture',
        async () => {
          const result = await page.evaluate(async () => {
            const client = window.TronoClips,
              owner = window.TronoClipLibrary.getSnapshot().owner,
              before = {
                captures: window.__captures.length,
                recorders: window.__recordOptions.length,
              };
            client.dispose();
            window.TronoClipDesktop.dispose();
            client.clip();
            client.open();
            await client.sharedStarted(new MediaStream());
            const status = document.getElementById('clipsStatus').textContent;
            document.getElementById('clipNow').disabled = false;
            document.getElementById('clipNow').click();
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                code: 'KeyK',
                ctrlKey: true,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
            window.dispatchEvent(new Event('trono-auth-change'));
            const unload = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(unload);
            return {
              engine: typeof window.TronoClips,
              controls: typeof window.TronoClipControls,
              bridge: typeof window.TronoClipDesktop,
              unchangedStatus: status === document.getElementById('clipsStatus').textContent,
              unloadPrevented: unload.defaultPrevented,
              sameOwner: owner === window.TronoClipLibrary.getSnapshot().owner,
              unchangedResources:
                before.captures === window.__captures.length &&
                before.recorders === window.__recordOptions.length,
            };
          });
          assert.deepEqual(result, {
            engine: 'undefined',
            controls: 'undefined',
            bridge: 'undefined',
            unchangedStatus: true,
            unloadPrevented: false,
            sameOwner: true,
            unchangedResources: true,
          });
        },
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      if (desktop) {
        for (const client of desktop.clients) client.terminate();
        await new Promise((r) => desktop.close(r));
      }
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
