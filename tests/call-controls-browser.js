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
  'stream invitations, prompt media shutdown and compact call layouts',
  { timeout: 120000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const s = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 10889, appOrigin: origin });
    const errors = [];
    let browser;
    try {
      const accounts = [];
      for (const [email, nickname] of [
        ['call-controls-owner@example.test', 'Ana'],
        ['call-controls-peer@example.test', 'Bruno'],
        ['call-controls-desktop@example.test', 'Cris'],
      ]) {
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        accounts.push((await fixture.call('login', { email, password: 'Senha12!' })).data);
      }
      for (const [account, peerId, action] of [
        [accounts[0], accounts[1].user.id, 'request'],
        [accounts[1], accounts[0].user.id, 'accept'],
      ]) {
        const response = await fetch(fixture.base + '/social/friend', {
          method: 'POST',
          headers: {
            Origin: origin,
            Authorization: 'Bearer ' + account.session.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ peerId, action }),
        });
        assert.equal(response.status, 200);
      }
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH ||
          (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      async function client(data, native = false) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
          permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
        });
        await context.route('**/*', (route) =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort(),
        );
        await context.route('**/community/profiles/*', (route) =>
          route.fulfill({
            json: {
              profile: {
                id: new URL(route.request().url()).pathname.split('/').at(-1),
                nickname: data.user.nickname,
                personalization: {
                  cover_file_id: '20000000-0000-4000-8000-000000000001',
                  background_file_id: '20000000-0000-4000-8000-000000000002',
                  accent: '#bd6fe8',
                  cover_position: 25,
                },
              },
            },
          }),
        );
        await context.route('**/files/20000000-0000-4000-8000-000000000001/url', (route) =>
          route.fulfill({
            json: {
              expiresAt: Date.now() + 60000,
              url:
                origin +
                '/fixture-media.svg?image=' +
                encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#723da8"/><circle cx="260" cy="30" r="100" fill="#dd8a68"/></svg>',
                ),
            },
          }),
        );
        await context.route('**/files/20000000-0000-4000-8000-000000000002/url', (route) =>
          route.fulfill({
            json: {
              expiresAt: Date.now() + 60000,
              url:
                origin +
                '/fixture-media.svg?image=' +
                encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#185a80"/></svg>',
                ),
            },
          }),
        );
        await context.route('**/fixture-media.svg?*', (route) =>
          route.fulfill({
            contentType: 'image/svg+xml',
            body: new URL(route.request().url()).searchParams.get('image'),
          }),
        );
        await context.addInitScript(
          ({ base, data, native }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoNoiseSuppression', '0');
            window.__displayRequests = [];
            const NativeRecorder = window.MediaRecorder;
            window.MediaRecorder = class extends NativeRecorder {
              constructor(stream, options) {
                super(stream, options);
                window.__replaySource = stream;
              }
            };
            navigator.mediaDevices.getDisplayMedia = async (options) => {
              window.__displayRequests.push(options);
              const canvas = document.createElement('canvas');
              canvas.width = 1280;
              canvas.height = 720;
              canvas.getContext('2d').fillRect(0, 0, 1280, 720);
              window.__displayCanvas = canvas;
              window.__displaySource = canvas.captureStream(15);
              // Animated video and synthetic screen audio exercise actual WebRTC controls.
              const audio = new AudioContext(),
                tone = audio.createOscillator(),
                destination = audio.createMediaStreamDestination();
              tone.connect(destination);
              tone.start();
              await audio.resume();
              const audioTrack = destination.stream.getAudioTracks()[0],
                stopAudio = audioTrack.stop.bind(audioTrack);
              audioTrack.stop = () => {
                tone.stop();
                void audio.close();
                stopAudio();
              };
              window.__displaySource.addTrack(audioTrack);
              let frame = 0;
              const timer = setInterval(() => {
                canvas.getContext('2d').fillStyle = frame++ % 2 ? '#405a72' : '#20252c';
                canvas.getContext('2d').fillRect(0, 0, 1280, 720);
              }, 60);
              const track = window.__displaySource.getVideoTracks()[0],
                stop = track.stop.bind(track);
              track.stop = () => {
                clearInterval(timer);
                stop();
              };
              return window.__displaySource;
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
                onApplicationAudio: () => {},
                configureClips: async () => ({ suspended: true }),
                getWindowState: async () => ({ fullscreen: false }),
                onWindowState: () => {},
                getUpdateState: async () => ({ status: 'idle' }),
                onUpdateState: (callback) => (window.__updateState = callback),
                checkUpdates: async () => ({ status: 'current' }),
              };
            // Delay transport teardown without delaying native track.stop().
            window.__peers = [];
            const NativePeer = window.RTCPeerConnection;
            window.RTCPeerConnection = class extends NativePeer {
              constructor(config) {
                super({ ...config, iceServers: [], iceCandidatePoolSize: 0 });
                window.__peers.push(this);
              }
            };
            const replace = RTCRtpSender.prototype.replaceTrack;
            window.__detachReleases = [];
            window.__attachReleases = [];
            window.__constraintReleases = [];
            const constraints = MediaStreamTrack.prototype.applyConstraints;
            MediaStreamTrack.prototype.applyConstraints = function (value) {
              if (this.kind === 'video' && window.__holdScreenQuality)
                return new Promise((resolve, reject) =>
                  window.__constraintReleases.push(() =>
                    constraints.call(this, value).then(resolve, reject),
                  ),
                );
              return constraints.call(this, value);
            };
            RTCRtpSender.prototype.replaceTrack = function (track) {
              if (track?.kind === 'video' && window.__holdAttach)
                return new Promise((resolve, reject) =>
                  window.__attachReleases.push(() =>
                    replace.call(this, track).then(resolve, reject),
                  ),
                );
              if (track === null && window.__holdDetach) {
                return new Promise((resolve, reject) =>
                  window.__detachReleases.push(() =>
                    replace.call(this, track).then(resolve, reject),
                  ),
                );
              }
              return replace.call(this, track);
            };
          },
          { base: fixture.base, data, native },
        );
        await context.addInitScript(installCanvasCamera);
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('dialog', (dialog) => dialog.accept());
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await page.locator('[data-voice-channel=chat-livre]').click();
        await expect(page.locator('#chatOnlyScreen')).toBeVisible();

        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        return page;
      }
      const owner = await client(accounts[0]),
        viewer = await client(accounts[1]);
      await owner.locator('[data-control=screenShareBtn]').click();
      await owner.locator('#screenOptionsConfirm').click();
      await expect.poll(() => owner.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      const ownerId = await owner.evaluate(() => window.TronoNetwork.clientId);
      const remote = () =>
        viewer.evaluate(
          (id) => window.TronoCallStage.getSnapshot().participants.find((p) => p.id === id),
          ownerId,
        );
      const activate = (id) =>
        owner.evaluate((id) => {
          void window.TronoCallToolbar.activate(id);
        }, id);
      await expect.poll(() => owner.evaluate(() => window.TronoClips.active)).toBe(true);
      assert.equal(await owner.evaluate(() => window.__displayRequests.length), 1);
      await t.test('React mosaic selects six people and detaches borrowed previews', async () => {
        await owner.evaluate(() => {
          window.__originalMosaicSources = window.TronoSocial.getMediaSources;
          const stream = window.TronoSocial.getLocalDisplayStream();
          window.__mosaicStream = stream;
          window.TronoSocial.getMediaSources = () =>
            Array.from({ length: 7 }, (_, i) => ({
              id: 'demo-' + i,
              name: ['Ana', 'Bruno', 'Clara', 'Diego', 'Eva', 'Felipe', 'Gabi'][i],
              camera: stream,
              screen: i === 0 ? stream : null,
              self: i === 0,
              cameraOffered: true,
              screenOffered: i === 0,
              watching: true,
              cameraHidden: false,
            }));
        });
        await owner.evaluate(() => window.TronoMosaic.open());
        await expect(owner.locator('#mediaFocusGrid .focus-person')).toHaveCount(6);
        await expect(
          owner.getByRole('checkbox', { name: 'Incluir Gabi no mosaico' }),
        ).toBeDisabled();
        await owner.getByRole('checkbox', { name: 'Incluir Ana no mosaico' }).uncheck();
        await owner.getByRole('checkbox', { name: 'Incluir Gabi no mosaico' }).check();
        await expect(owner.locator('#mediaFocusCount')).toHaveText('6 de 6 pessoas');
        await owner.evaluate(() => {
          window.__mosaicNodes = [...document.querySelectorAll('#mediaFocusGrid video')];
        });
        await owner.locator('#mediaFocusClose').click();
        await expect(owner.locator('#mediaFocusGrid video')).toHaveCount(0);
        assert.equal(
          await owner.evaluate(
            () =>
              window.__mosaicNodes.every((video) => !video.srcObject) &&
              window.__mosaicStream.getTracks().every((track) => track.readyState === 'live'),
          ),
          true,
        );
        assert.equal(
          await owner.evaluate(
            () =>
              window.TronoClips.active &&
              window.__replaySource.getTracks().every((track) => track.readyState === 'live') &&
              window.TronoSocial.getLocalAudioTrack().readyState === 'live' &&
              window.__displayRequests.length === 1,
          ),
          true,
        );
        await owner.evaluate(() => {
          window.TronoSocial.getMediaSources = window.__originalMosaicSources;
        });
      });
      await t.test(
        'one settings owner preserves inputs, audio preferences, music errors and sanitized diagnostics',
        async () => {
          await owner.evaluate(() => {
            window.__settingsMedia = {
              mic: window.TronoSocial.getLocalAudioTrack(),
              screen: window.TronoSocial.getLocalDisplayStream(),
              input: document.getElementById('voiceInputSelect'),
            };
            window.TronoCallSettings.open('video');
          });
          const dialog = owner.locator('dialog[data-topic]');
          await owner.locator('#screenFormatSelect').selectOption('1080-60');
          await owner.locator('#screenBitrateSelect').selectOption('10');
          await owner.locator('#shareStreamAudio').uncheck();
          await expect
            .poll(() => owner.evaluate(() => window.TronoSocial.screenSettings.audio))
            .toBe(false);
          await owner.locator('#shareStreamAudio').check();
          await dialog.locator('[data-settings-tab=audio]').click();
          await owner.locator('#outputGainSlider').fill('150');
          await expect(owner.locator('#outputGainValue')).toHaveText('150%');
          await owner.locator('#outputGainSlider').fill('100');
          await owner.locator('#callAlertVolume').fill('40');
          assert.equal(await owner.evaluate(() => localStorage.getItem('mnCallAlertVolume')), '40');
          await owner.locator('#voiceProtection').uncheck();
          await owner.locator('#voiceProtection').check();
          await dialog.locator('[data-settings-tab=game]').click();
          await owner.getByRole('checkbox', { name: 'Efeitos dos jogos', exact: true }).check();
          assert.equal(await owner.evaluate(() => window.TronoAudio.sfxEnabled), true);
          await owner.getByRole('checkbox', { name: 'Efeitos dos jogos', exact: true }).uncheck();
          await owner.evaluate(() => {
            const p = document.getElementById('bgMusic');
            window.__restoreMusicPlay = p.play;
            p.play = () =>
              Promise.reject(new DOMException('test activation required', 'NotAllowedError'));
          });
          await owner.getByRole('checkbox', { name: 'Música de fundo', exact: true }).check();
          await expect(
            dialog.getByRole('status').filter({ hasText: 'O navegador bloqueou' }),
          ).toBeVisible();
          await owner.getByLabel('Trilha sonora').selectOption('rock');
          await owner.getByRole('slider', { name: 'Volume da música', exact: true }).fill('47');
          assert.equal(await owner.evaluate(() => document.getElementById('bgMusic').volume), 0.47);
          await owner.evaluate(() => window.TronoAudio.setMusicVolume(19));
          await expect(
            owner.getByRole('slider', { name: 'Volume da música', exact: true }),
          ).toHaveValue('19');
          await owner.getByRole('checkbox', { name: 'Música de fundo', exact: true }).uncheck();
          await owner.evaluate(
            () => (document.getElementById('bgMusic').play = window.__restoreMusicPlay),
          );
          await dialog.locator('[data-settings-tab=connection]').click();
          await owner.locator('#adaptiveQuality').uncheck();
          await owner.locator('#adaptiveQuality').check();
          await owner.getByRole('button', { name: 'Abrir diagnóstico', exact: true }).click();
          await owner.bringToFront();
          await owner.getByRole('button', { name: 'Copiar diagnóstico', exact: true }).click();
          await expect(dialog.getByRole('status').filter({ hasText: 'Copiado' })).toBeVisible();
          const report = await owner.evaluate(() => navigator.clipboard.readText());
          assert.equal(JSON.parse(report).app, 'M&N');
          assert(
            !report.includes(accounts[0].session.access_token) &&
              !report.includes(accounts[0].user.email) &&
              !report.includes('Ana'),
          );
          await dialog.locator('[data-settings-tab=video]').click();
          await owner.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
          await owner.evaluate(() => window.TronoCallSettings.toggle(true));
          await expect(dialog).toHaveAttribute('data-topic', 'video');
          await owner.keyboard.press('Escape');
          assert(
            await owner.evaluate(
              () =>
                window.__settingsMedia.mic === window.TronoSocial.getLocalAudioTrack() &&
                window.__settingsMedia.screen === window.TronoSocial.getLocalDisplayStream() &&
                window.__settingsMedia.input === document.getElementById('voiceInputSelect'),
            ),
          );
        },
      );
      await t.test(
        'watch invitation is reachable in small windows and focuses the same borrowed player',
        async () => {
          const tile = viewer.locator('[data-call-screen="' + ownerId + '"]');
          for (const size of [
            { width: 1440, height: 900 },
            { width: 480, height: 800 },
            { width: 844, height: 390 },
          ]) {
            await viewer.setViewportSize(size);
            await tile
              .getByRole('button', { name: 'Assistir transmissão', exact: true })
              .scrollIntoViewIfNeeded();
            await expect(
              tile.getByRole('button', { name: 'Assistir transmissão', exact: true }),
            ).toBeInViewport();
          }
          await tile.getByRole('button', { name: 'Assistir transmissão', exact: true }).click();
          await expect.poll(async () => (await remote())?.watching).toBe(true);
          await expect(tile).toHaveAttribute('data-focused', 'true');
          await expect
            .poll(() =>
              tile.locator('video').evaluate((v) => v.getVideoPlaybackQuality().totalVideoFrames),
            )
            .toBeGreaterThan(0);
          await viewer.setViewportSize({ width: 1280, height: 720 });
          await viewer
            .getByRole('button', { name: 'Opções da transmissão de Ana', exact: true })
            .click();
          await viewer
            .getByRole('slider', { name: 'Volume da transmissão', exact: true })
            .fill('185');
          await expect.poll(async () => (await remote())?.screenVolume).toBe(185);
          assert.equal((await remote()).volume, 100);
          await viewer.keyboard.press('Escape');
        },
      );
      await t.test(
        'publication state reaches the remote UI before stalled attachment completes',
        async () => {
          await activate('screenShareBtn');
          await expect(viewer.locator('[data-call-screen]')).toHaveCount(0);
          await owner.evaluate(() => (window.__holdAttach = true));
          await activate('cameraBtn');
          await expect.poll(async () => (await remote())?.camera, { timeout: 1500 }).toBe(true);
          assert(await owner.evaluate(() => window.__attachReleases.length > 0));
          await owner.evaluate(() => {
            window.__holdAttach = false;
            for (const release of window.__attachReleases.splice(0)) release();
          });
          await expect.poll(async () => (await remote())?.cameraLive).toBe(true);
          await activate('cameraBtn');
          await owner.evaluate(() => (window.__holdScreenQuality = true));
          await activate('screenShareBtn');
          await owner.locator('#screenOptionsConfirm').click();
          await expect(viewer.locator('[data-call-screen]')).toHaveCount(1, { timeout: 1500 });
          assert(await owner.evaluate(() => window.__constraintReleases.length > 0));
          await owner.evaluate(() => {
            window.__holdScreenQuality = false;
            for (const release of window.__constraintReleases.splice(0)) release();
          });
        },
      );
      await t.test(
        'stalled teardown stops owned camera and screen immediately on both clients',
        async () => {
          await activate('cameraBtn');
          await expect.poll(async () => (await remote())?.cameraLive).toBe(true);
          await owner.evaluate(() => {
            window.__heldCamera = window.TronoSocial.getMediaSources()
              .find((s) => s.self)
              .camera.getVideoTracks()[0];
            window.__holdDetach = true;
          });
          await activate('cameraBtn');
          await expect.poll(async () => (await remote())?.camera, { timeout: 1500 }).toBe(false);
          assert(await owner.evaluate(() => window.__heldCamera.readyState === 'ended'));
          await activate('screenShareBtn');
          await expect(viewer.locator('[data-call-screen]')).toHaveCount(0, { timeout: 1500 });
          assert(
            await owner.evaluate(
              () =>
                window.__displaySource.getTracks().every((t) => t.readyState === 'ended') &&
                window.__detachReleases.length >= 2,
            ),
          );
          await owner.evaluate(() => {
            window.__holdDetach = false;
            for (const release of window.__detachReleases.splice(0)) release();
          });
        },
      );
      await t.test('late camera sender operations converge on the newest live track', async () => {
        const published = () =>
          owner.evaluate(() => {
            const track = window.TronoSocial.getMediaSources()
                .find((s) => s.self)
                ?.camera?.getVideoTracks()[0],
              senders = window.__peers
                .filter((p) => p.connectionState === 'connected' && p._tronoVideoSender)
                .map((p) => p._tronoVideoSender);
            return (
              track?.readyState === 'live' &&
              senders.length > 0 &&
              senders.every((s) => s.track === track)
            );
          });
        await owner.evaluate(() => (window.__holdAttach = true));
        await activate('cameraBtn');
        await expect
          .poll(() => owner.evaluate(() => window.__attachReleases.length))
          .toBeGreaterThan(0);
        await activate('cameraBtn');
        await owner.evaluate(() => (window.__holdAttach = false));
        await activate('cameraBtn');
        await owner.evaluate(async () =>
          Promise.all(window.__attachReleases.splice(0).map((r) => r())),
        );
        await expect.poll(published).toBe(true);
        await owner.evaluate(() => (window.__holdDetach = true));
        await activate('cameraBtn');
        await expect
          .poll(() => owner.evaluate(() => window.__detachReleases.length))
          .toBeGreaterThan(0);
        await owner.evaluate(() => (window.__holdDetach = false));
        await activate('cameraBtn');
        await owner.evaluate(async () =>
          Promise.all(window.__detachReleases.splice(0).map((r) => r())),
        );
        await expect.poll(published).toBe(true);
        await activate('cameraBtn');
      });
      const seed = await fetch(fixture.base + '/social/send', {
        method: 'POST',
        headers: {
          Origin: origin,
          Authorization: 'Bearer ' + accounts[1].session.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: require('node:crypto').randomUUID(),
          peerId: accounts[0].user.id,
          text: 'Conversa de teste das capas',
        }),
      });
      assert.equal(seed.status, 200);
      await owner.evaluate(() => window.TronoDirectMessages.refresh());
      await t.test(
        'live profile changes remove and restore both decorations through one shared read without replacing players',
        async () => {
          const id = accounts[1].user.id;
          const room = await owner.evaluate(() => window.TronoNetwork.primaryRoom);
          await viewer.evaluate((room) => window.TronoChatHub.enter({ channelId: room }), room);
          if (!(await viewer.evaluate(() => window.TronoSocial.voiceJoined)))
            await viewer.locator('[data-voice-channel=chat-livre]').click();
          await expect(
            owner
              .locator('[data-call-person]')
              .filter({ has: owner.getByRole('button', { name: 'Opções de Bruno', exact: true }) }),
          ).toBeVisible();
          if (!(await owner.evaluate(() => window.TronoSocial.screenSharing))) {
            await activate('screenShareBtn');
            await owner.locator('#screenOptionsConfirm').click();
            await expect
              .poll(() => owner.evaluate(() => window.TronoSocial.screenSharing))
              .toBe(true);
          }
          let personalization = {},
            reads = 0;
          await owner.route('**/community/profiles/' + id, (route) => {
            reads++;
            return route.fulfill({ json: { profile: { id, nickname: 'Bruno', personalization } } });
          });
          await owner.evaluate(() => {
            window.__decorationPlayers = [
              ...document.querySelectorAll('[data-call-video] video'),
            ].map((video) => ({ video, stream: video.srcObject }));
            window.__decorationScreen = window.TronoSocial.getLocalDisplayStream();
          });
          const card = owner
            .locator('[data-call-person]')
            .filter({ has: owner.getByRole('button', { name: 'Opções de Bruno', exact: true }) });
          const direct = owner.locator('[data-direct-peer="' + id + '"]');
          async function announce() {
            const response = await fixture.call(
              'profile',
              {
                nickname: 'Bruno',
                avatar_preset: 'crown',
                avatar_file_id: null,
                personalization: {},
              },
              accounts[1].session.access_token,
            );
            assert.equal(response.status, 200);
          }
          await announce();
          await expect(card.locator('.participant-background img')).toHaveCount(0);
          await expect(direct.locator('.direct-profile-banner img')).toHaveCount(0);
          await expect.poll(() => reads).toBe(1);
          personalization = {
            background_file_id: '20000000-0000-4000-8000-000000000002',
            cover_file_id: '20000000-0000-4000-8000-000000000001',
            darkness: 35,
            blur: 4,
            cover_position: 80,
          };
          await announce();
          await expect(card.locator('.participant-background img')).toBeVisible();
          await expect(direct.locator('.direct-profile-banner img')).toBeVisible();
          await expect.poll(() => reads).toBe(2);
          assert.equal(
            await card
              .locator('.participant-background')
              .evaluate((element) => element.style.getPropertyValue('--participant-darkness')),
            '0.35',
          );
          assert.equal(
            await card
              .locator('.participant-background')
              .evaluate((element) => element.style.getPropertyValue('--participant-blur')),
            '4px',
          );
          assert.equal(
            await direct
              .locator('.direct-profile-banner img')
              .evaluate((image) => image.style.objectPosition),
            'center 80%',
          );
          assert.equal(
            await owner.evaluate(
              () =>
                window.__decorationPlayers.length > 0 &&
                window.__decorationPlayers.every(
                  ({ video, stream }) => video.isConnected && video.srcObject === stream,
                ) &&
                window.TronoSocial.getLocalDisplayStream() === window.__decorationScreen &&
                window.__decorationScreen.getTracks().every((track) => track.readyState === 'live'),
            ),
            true,
          );
        },
      );

      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
