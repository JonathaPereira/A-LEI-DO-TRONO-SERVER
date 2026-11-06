'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { closeTestApp, killTestApp } = require('./desktop-test-close');
const { firstSizedWindow } = require('./desktop-first-window.cjs');
const { presentAccount, restoreAccount } = require('./auth-presentation-fixture.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'https://a-lei-do-trono.surge.sh';
const controls = [
  'muteMicBtn',
  'deafenVoiceBtn',
  'cameraBtn',
  'screenShareBtn',
  'remotePcBtn',
  'soundboardToggle',
  'voiceSettingsBtn',
  'joinVoiceBtn',
];

test(
  'real Electron preserves connected peers, borrowed players and capture ownership across Corte navigation',
  {
    timeout: 180000,
    skip: process.platform !== 'win32' && 'Windows desktop regression',
  },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-call-layout-'));
    const apps = [];
    const errors = [];
    let fixture,
      finished = false;
    t.signal.addEventListener(
      'abort',
      () => {
        if (!finished) apps.forEach(killTestApp);
      },
      { once: true },
    );
    try {
      fixture = await startFixture({
        port: 10743,
        allowedOrigins: [origin],
        directAttachments: true,
        gameDecree: 'reserva,espionagem',
      });
      async function launch(email, nickname, layout = 'original') {
        await fixture.call('signup', { email, nickname, password: 'LayoutTest12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        const login = await fixture.call('login', { email, password: 'LayoutTest12!' });
        assert.equal(login.status, 200);
        const { data } = login;
        const app = await _electron.launch({
          executablePath: require('../electron/node_modules/electron'),
          args: [
            path.join(root, 'electron'),
            '--user-data-dir=' + path.join(directory, nickname),
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
            '--mute-audio',
          ],
          timeout: 30000,
        });
        apps.push(app);
        assert.deepEqual(
          await app.evaluate(({ app }) => ({ packaged: app.isPackaged, name: app.getName() })),
          { packaged: false, name: 'MN Trono Desenvolvimento' },
        );
        // These dialogs concern synthetic devices in disposable test profiles only.
        await app.evaluate(({ dialog }) => {
          dialog.showMessageBox = async () => ({ response: 0 });
        });
        const page = await firstSizedWindow(app, { width: 1024, height: 740 });
        await page.route('https://a-lei-do-trono-server.onrender.com/**', async (route) => {
          try {
            await route.abort();
          } catch {}
        });
        // BrowserWindow uses a persistent session partition. Bind setup to this
        // page, rather than ElectronApplication's default browser context.
        await page.addInitScript(
          ({ base, accountId, layout }) => {
            window.TRONO_BACKEND_URL = base;
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('mnDesktopNoiseMode', 'off');
            if (localStorage.getItem('mn-personal:' + accountId) === null)
              localStorage.setItem(
                'mn-personal:' + accountId,
                JSON.stringify({ appLayout: layout }),
              );
            window.__layoutPeers = [];
            window.__layoutDescriptions = [];
            const trackListeners = new WeakMap();
            window.__receiveListenerCount = (track) =>
              [...(trackListeners.get(track)?.values() || [])].reduce(
                (n, listeners) => n + listeners.size,
                0,
              );
            const addTrackListener = MediaStreamTrack.prototype.addEventListener;
            const removeTrackListener = MediaStreamTrack.prototype.removeEventListener;
            MediaStreamTrack.prototype.addEventListener = function (type, listener, options) {
              if (['ended', 'mute', 'unmute'].includes(type)) {
                if (!trackListeners.has(this)) trackListeners.set(this, new Map());
                const types = trackListeners.get(this);
                if (!types.has(type)) types.set(type, new Set());
                types.get(type).add(listener);
              }
              return addTrackListener.call(this, type, listener, options);
            };
            MediaStreamTrack.prototype.removeEventListener = function (type, listener, options) {
              trackListeners.get(this)?.get(type)?.delete(listener);
              return removeTrackListener.call(this, type, listener, options);
            };
            const Peer = window.RTCPeerConnection;
            window.RTCPeerConnection = class extends Peer {
              constructor(config) {
                super({ ...config, iceServers: [], iceCandidatePoolSize: 0 });
                window.__layoutPeers.push(this);
              }
              async setLocalDescription(description) {
                await super.setLocalDescription(description);
                window.__layoutDescriptions.push(this.localDescription?.type);
              }
            };
            window.__layoutCanvases = [];
            const canvasStream = (fps = 10) => {
              const canvas = document.createElement('canvas');
              canvas.width = 640;
              canvas.height = 360;
              const draw = canvas.getContext('2d');
              draw.fillStyle = '#384460';
              draw.fillRect(0, 0, 640, 360);
              window.__layoutCanvases.push(canvas);
              const stream = canvas.captureStream(fps);
              let frame = 0;
              const timer = setInterval(() => {
                draw.fillStyle = frame++ % 2 ? '#384460' : '#486480';
                draw.fillRect(0, 0, 640, 360);
              }, 1000 / fps);
              const track = stream.getVideoTracks()[0],
                stop = track.stop.bind(track);
              track.stop = () => {
                clearInterval(timer);
                stop();
              };
              return stream;
            };
            const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              if (!constraints.video) return capture(constraints);
              const stream = canvasStream();
              if (constraints.audio)
                for (const track of (await capture({ audio: constraints.audio })).getTracks())
                  stream.addTrack(track);
              return stream;
            };
            window.__displayRequests = [];
            navigator.mediaDevices.getDisplayMedia = async (options) => {
              window.__displayRequests.push(options);
              window.__displayGesture = {
                active: navigator.userActivation.isActive,
                dialogClosed: !document.getElementById('screenOptionsDialog').open,
              };
              if (window.__denyDisplay) throw new DOMException('Canceled', 'NotAllowedError');
              const source = canvasStream(options.video.frameRate.ideal);
              if (window.__delayDisplay)
                await new Promise((resolve) => {
                  window.__releaseDisplay = () => {
                    window.__lateDisplay = source;
                    resolve();
                  };
                });
              return source;
            };
          },
          { base: fixture.base, accountId: data.user.id, layout },
        );
        const authResponses = [];
        page.on('response', (response) => {
          if (response.url().startsWith(fixture.base + '/auth/'))
            authResponses.push({
              path: new URL(response.url()).pathname,
              status: response.status(),
            });
        });
        page.setDefaultTimeout(10000);
        await page.waitForURL(origin + '/');
        await page.waitForLoadState('load');
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        page.on('pageerror', (error) => errors.push(error.message));
        await page.reload();
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        assert.equal(await page.evaluate(() => window.TronoNetwork.BACKEND_HTTP), fixture.base);
        assert.deepEqual(
          await page.evaluate(() => ({
            engine: typeof window.TronoClips,
            controls: typeof window.TronoClipControls,
          })),
          { engine: 'undefined', controls: 'undefined' },
        );
        await expect(page.locator('#portalScreen')).toBeVisible();
        await page.locator('#authEmail').fill(email);
        await page.locator('#authPassword').fill('LayoutTest12!');
        await page.locator('#authSubmit').click();
        try {
          await expect(page.locator('#portalScreen')).not.toBeVisible();
        } catch (error) {
          console.error('Login fixture:', {
            nickname,
            authResponses,
            message: await page.locator('#authMessage').textContent(),
            backend: await page.evaluate(() => window.TronoNetwork.BACKEND_HTTP),
          });
          throw error;
        }
        try {
          await expect
            .poll(() => page.evaluate(() => window.TronoAuth.user?.nickname))
            .toBe(nickname);
        } catch (error) {
          console.error('Auth fixture:', {
            nickname,
            authResponses,
            message: await page.locator('#authMessage').textContent(),
          });
          throw error;
        }
        await expect(page.getByRole('complementary', { name: 'Canais e conversas' })).toBeVisible();

        await page.evaluate(() => window.TronoChatHub.enter({ channelId: 'chat-jogos' }));
        await expect
          .poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom))
          .toBe('chat-jogos');
        assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
        await page.locator('[data-voice-channel=chat-jogos]').click();
        try {
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.voiceJoined), { timeout: 15000 })
            .toBe(true);
        } catch (error) {
          console.error(
            'Voice fixture:',
            nickname,
            await page.evaluate(() => ({
              user: window.TronoAuth.user?.nickname,
              connected: window.TronoNetwork.connected,
              room: window.TronoNetwork?.currentRoom,
              voiceRoom: window.TronoSocial.voiceRoom,
              status: document.getElementById('voiceStatus').textContent,
              errors: document.getElementById('chatOnlyStatus').textContent,
            })),
          );
          throw error;
        }
        return { app, page };
      }

      const { app, page } = await launch('layout-main@example.test', 'Layout Principal');
      const { page: receiver } = await launch('layout-peer@example.test', 'Layout Amigo');
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              window.__layoutPeers.some((p) => p.connectionState === 'connected'),
            ),
          { timeout: 20000 },
        )
        .toBe(true);
      await page.locator('[data-control=cameraBtn]').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await page.locator('[data-control=screenShareBtn]').click();
      await page.locator('#shareResolution').selectOption('1080');
      await page.locator('#shareFps').selectOption('60');
      await page.locator('#screenOptionsCancel').click();
      assert.equal(await page.evaluate(() => window.__displayRequests.length), 0);
      await page.locator('[data-control=screenShareBtn]').click();
      await page.locator('#screenOptionsConfirm').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      assert.deepEqual(await page.evaluate(() => window.__displayGesture), {
        active: true,
        dialogClosed: true,
      });
      const id = await page.evaluate(() => window.TronoNetwork.clientId);
      const remote = receiver.locator('[data-call-screen="' + id + '"]');
      await remote.getByRole('button', { name: 'Assistir transmissão', exact: true }).click();
      const video = remote.locator('video');
      await expect
        .poll(() => video.evaluate((v) => v.getVideoPlaybackQuality().totalVideoFrames), {
          timeout: 15000,
        })
        .toBeGreaterThan(0);
      await page.evaluate(() => {
        window.__kept = {
          network: window.TronoNetwork,
          client: window.TronoNetwork.clientId,
          mic: window.TronoSocial.getLocalAudioTrack(),
          camera: window.TronoSocial.getMediaSources()
            .find((p) => p.self)
            .camera.getVideoTracks()[0],
          screen: window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0],
          peers: window.__layoutPeers.filter((p) => p.connectionState === 'connected'),
          stage: window.TronoCallStage,
          toolbar: window.TronoCallToolbar,
          input: document.getElementById('voiceInputSelect'),
        };
      });
      await receiver.evaluate((id) => {
        const video = document.querySelector('[data-call-screen="' + id + '"] video');
        window.__keptRemote = { video, stream: video.srcObject };
      }, id);
      const preserved = async () => {
        assert(
          await page.evaluate(() => {
            const k = window.__kept;
            return (
              k.network === window.TronoNetwork &&
              k.client === window.TronoNetwork.clientId &&
              k.mic === window.TronoSocial.getLocalAudioTrack() &&
              k.mic.readyState === 'live' &&
              k.camera ===
                window.TronoSocial.getMediaSources()
                  .find((p) => p.self)
                  .camera.getVideoTracks()[0] &&
              k.camera.readyState === 'live' &&
              k.screen === window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0] &&
              k.screen.readyState === 'live' &&
              k.peers.length > 0 &&
              k.peers.every((p) => p.connectionState === 'connected') &&
              k.stage === window.TronoCallStage &&
              k.toolbar === window.TronoCallToolbar &&
              k.input === document.getElementById('voiceInputSelect')
            );
          }),
        );
        assert(
          await receiver.evaluate(
            () =>
              window.__keptRemote.video.isConnected &&
              window.__keptRemote.video.srcObject === window.__keptRemote.stream,
          ),
        );
      };
      for (const route of ['games', 'throne', 'call']) {
        await page.evaluate((route) => {
          if (route === 'games') window.TronoGames.openLibrary();
          else if (route === 'throne') window.TronoPortal.openGame(true);
          else {
            window.TronoPortal.showOnly('chatOnlyScreen');
            window.TronoCallNavigation.showCall();
          }
        }, route);
        await preserved();
      }
      for (const topic of ['audio', 'video', 'account', 'resources', 'connection']) {
        await page.evaluate((topic) => window.TronoCallSettings.open(topic), topic);
        await expect(page.locator('dialog[data-topic]')).toHaveAttribute('data-topic', topic);
        await preserved();
      }
      await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      // Both native clients play through the preserved online choices and private dialogs.
      await require('./desktop-throne-choices-flow.cjs').exerciseThroneChoices({ page, receiver });
      await preserved();
      await require('./desktop-throne-private-flow.cjs').exerciseThronePrivate({
        page,
        receiver,
        apps,
      });
      await preserved();
      for (const client of [page, receiver])
        await client.evaluate(() => {
          window.TronoPortal.showOnly('chatOnlyScreen');
          window.TronoCallNavigation.showCall();
        });
      await preserved();
      const frames = () => video.evaluate((v) => v.getVideoPlaybackQuality().totalVideoFrames);
      let before = await frames();
      await page.evaluate(() => window.TronoCallStage.togglePreview());
      await expect
        .poll(() => page.evaluate(() => window.TronoCallStage.getSnapshot().previewPaused))
        .toBe(true);
      await expect.poll(frames, { timeout: 15000 }).toBeGreaterThan(before);
      await page.evaluate(() => window.TronoCallStage.togglePreview());
      await preserved();
      await page.evaluate(() => (window.__denyDisplay = true));
      await page.evaluate(() => window.TronoCallStage.switchSource());
      await preserved();
      await page.evaluate(() => (window.__denyDisplay = false));
      before = await frames();
      await page.evaluate(() => window.TronoCallStage.switchSource());
      assert(await page.evaluate(() => window.__kept.screen.readyState === 'ended'));
      await page.evaluate(
        () =>
          (window.__kept.screen = window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0]),
      );
      await expect.poll(frames, { timeout: 15000 }).toBeGreaterThan(before);
      await preserved();
      // Device removal affects only the owned camera, never microphone or screen.
      await page.evaluate(() => {
        const t = window.__kept.camera;
        t.stop();
        t.dispatchEvent(new Event('ended'));
      });
      await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(false);
      assert(
        await page.evaluate(
          () =>
            window.__kept.mic.readyState === 'live' && window.__kept.screen.readyState === 'live',
        ),
      );
      await page.locator('[data-control=cameraBtn]').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await page.evaluate(
        () =>
          (window.__kept.camera = window.TronoSocial.getMediaSources()
            .find((p) => p.self)
            .camera.getVideoTracks()[0]),
      );
      await preserved();
      // Native fullscreen is shared with the game, without restoring a legacy shell facade.
      await require('./desktop-court-display-flow').exerciseCourtFullscreen({ app, page });
      await page.evaluate(() => {
        window.TronoPortal.showOnly('chatOnlyScreen');
        window.TronoCallNavigation.showCall();
      });
      await preserved();
      await page.evaluate(() => window.TronoSocial.stopScreenShare());
      await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(false);
      await receiver.evaluate(() => {
        window.__retiredReceiveTracks = window.__layoutPeers
          .flatMap((pc) => pc.getReceivers().map((r) => r.track))
          .filter((track) => window.__receiveListenerCount(track) > 0);
        if (window.__retiredReceiveTracks.length < 2)
          throw new Error('Receiver fixture did not bind media listeners');
      });
      await page.evaluate(() => {
        window.__delayDisplay = true;
        window.__pendingDisplay = window.TronoSocial.startScreenShare();
      });
      await page.waitForFunction(() => !!window.__releaseDisplay);
      await page.evaluate(async () => {
        await window.TronoSocial.leaveVoice();
        window.__delayDisplay = false;
        window.__releaseDisplay();
      });
      await page.evaluate(() => window.__pendingDisplay);
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.__lateDisplay.getTracks().every((t) => t.readyState === 'ended'),
          ),
        )
        .toBe(true);
      assert(
        await page.evaluate(
          () =>
            window.__kept.mic.readyState === 'ended' && window.__kept.camera.readyState === 'ended',
        ),
      );
      assert(await receiver.evaluate(() => window.TronoSocial.voiceJoined));
      await expect
        .poll(() =>
          receiver.evaluate(() =>
            window.__retiredReceiveTracks.every(
              (track) => window.__receiveListenerCount(track) === 0,
            ),
          ),
        )
        .toBe(true);
      assert.equal(await page.evaluate(() => window.__pendingDisplay), false);
      assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), false);
      assert.equal(await page.evaluate(() => window.TronoSocial.joinVoice()), true);

      // A camera permission from the departed call must not replace the newer call's capture.
      await page.evaluate(() => {
        window.__normalCameraCapture = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        );
        navigator.mediaDevices.getUserMedia = (constraints) => {
          if (!constraints.video) return window.__normalCameraCapture(constraints);
          return new Promise((resolve) => {
            window.__releaseCamera = async () => {
              const stream = await window.__normalCameraCapture(constraints);
              window.__lateCameraTracks = stream.getTracks();
              resolve(stream);
            };
          });
        };
      });
      await page.locator('[data-control=cameraBtn]').click();
      await page.waitForFunction(() => !!window.__releaseCamera);
      assert.equal(
        await page.evaluate(async () => {
          await window.TronoSocial.leaveVoice();
          navigator.mediaDevices.getUserMedia = window.__normalCameraCapture;
          return window.TronoSocial.joinVoice();
        }),
        true,
      );
      await page.locator('[data-control=cameraBtn]').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await page.evaluate(async () => {
        window.__newCallCamera = window.TronoSocial.getMediaSources()
          .find((source) => source.self)
          .camera.getVideoTracks()[0];
        window.__newCallMicrophone = window.TronoSocial.getLocalAudioTrack();
        await window.__releaseCamera();
      });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__lateCameraTracks.every((track) => track.readyState === 'ended') &&
              window.TronoSocial.voiceJoined &&
              window.TronoSocial.cameraOn &&
              window.__newCallCamera.readyState === 'live' &&
              window.TronoSocial.getMediaSources()
                .find((source) => source.self)
                .camera.getVideoTracks()[0] === window.__newCallCamera &&
              window.TronoSocial.getLocalAudioTrack() === window.__newCallMicrophone &&
              window.__newCallMicrophone.readyState === 'live' &&
              window.TronoNetwork.clientId === window.__kept.client,
          ),
        )
        .toBe(true);
      await expect
        .poll(() =>
          receiver.evaluate((id) => {
            const track = window.TronoSocial.getMediaSources()
              .find((source) => source.id === id)
              ?.camera?.getVideoTracks()[0];
            return (
              track?.readyState === 'live' &&
              !track.muted &&
              window.__receiveListenerCount(track) === 3
            );
          }, id),
        )
        .toBe(true);
      await receiver.evaluate((id) => {
        window.__currentReceiveCamera = window.TronoSocial.getMediaSources()
          .find((source) => source.id === id)
          .camera.getVideoTracks()[0];
        for (const track of window.__retiredReceiveTracks)
          for (const type of ['mute', 'unmute', 'ended']) track.dispatchEvent(new Event(type));
      }, id);
      await expect
        .poll(() =>
          receiver.evaluate((id) => {
            const track = window.TronoSocial.getMediaSources()
                .find((source) => source.id === id)
                ?.camera?.getVideoTracks()[0],
              video = document.querySelector('[data-call-person="' + id + '"] video');
            return (
              track === window.__currentReceiveCamera &&
              track?.readyState === 'live' &&
              video?.srcObject?.getVideoTracks().includes(track) &&
              video.getVideoPlaybackQuality().totalVideoFrames > 0
            );
          }, id),
        )
        .toBe(true);

      // Leaving during microphone permission cancels entry and disposes the late device.
      await page.evaluate(async () => {
        window.__releasedMicrophone = window.TronoSocial.getLocalAudioTrack();
        await window.TronoSocial.leaveVoice();
        window.__normalCapture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (constraints) => {
          if (!constraints.audio) return window.__normalCapture(constraints);
          return new Promise((resolve) => {
            window.__releaseDelayedCapture = async () => {
              const stream = await window.__normalCapture(constraints);
              window.__delayedCaptureTracks = stream.getTracks();
              resolve(stream);
            };
          });
        };
        window.__cancelledJoin = window.TronoSocial.joinVoice();
      });
      await page.waitForFunction(() => !!window.__releaseDelayedCapture);
      await page.evaluate(async () => {
        await window.TronoSocial.leaveVoice();
        navigator.mediaDevices.getUserMedia = window.__normalCapture;
        await window.__releaseDelayedCapture();
      });
      assert.equal(await page.evaluate(() => window.__cancelledJoin), false);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__releasedMicrophone.readyState === 'ended' &&
              window.__delayedCaptureTracks.every((track) => track.readyState === 'ended'),
          ),
        )
        .toBe(true);
      assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
      assert.equal(await page.evaluate(() => window.TronoSocial.getLocalAudioTrack()), null);
      assert.equal(await page.evaluate(() => window.TronoSocial.cameraOn), false);
      assert.equal(await page.evaluate(() => window.__newCallCamera.readyState), 'ended');
      assert(await receiver.evaluate(() => window.TronoSocial.voiceJoined));
      assert.equal(await page.evaluate(() => window.TronoNetwork.clientId), id);
      assert.equal(await page.evaluate(() => window.TronoSocial.joinVoice()), true);
      assert.equal(
        await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState),
        'live',
      );
      assert.deepEqual(errors, []);
    } catch (error) {
      await Promise.allSettled(
        apps.map(async (app, index) => {
          const page = await app.firstWindow({ timeout: 1000 });
          await page.screenshot({
            path: `artifacts/desktop-layout-failure-${index}.png`,
            timeout: 3000,
          });
        }),
      );
      throw error;
    } finally {
      finished = true;
      for (const app of apps.reverse()) await closeTestApp(app);
      if (fixture) await fixture.stop();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
