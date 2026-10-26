'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs');
const express = require('express'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
const { installSyntheticCallMedia } = require('./synthetic-call-media.cjs');
test(
  'desktop compact settings, remembered login and suspended replay preserve calls',
  { timeout: 150000 },
  async (t) => {
    const host = express();
    host.use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((r) => {
        const s = host.listen(0, '127.0.0.1', () => r(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 10687, appOrigin: origin });
    let browser,
      remembered = null;
    const errors = [],
      artifacts = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    // A failed step leaves shared dialogs/session state unfinished. Preserve the
    // first failure instead of reporting cascading failures in later scenarios.
    async function step(name, fn) {
      let failure;
      await t.test(name, async (context) => {
        try {
          await fn(context);
        } catch (error) {
          failure = error;
          throw error;
        }
      });
      if (failure) throw failure;
    }
    try {
      await fixture.call('signup', {
        email: 'desktop@example.test',
        nickname: 'Desktop Test',
        password: 'Senha12!',
      });
      await fixture.call('verify', { token_hash: [...fixture.links][0][0], type: 'signup' });
      const data = (
        await fixture.call('login', { email: 'desktop@example.test', password: 'Senha12!' })
      ).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        headless: true,
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
        permissions: ['camera', 'microphone'],
      });
      await context.addInitScript(installSyntheticCallMedia, { simulateNativeSuppression: true });
      await context.route('**/*', (r) =>
        ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      await context.exposeBinding('__readRemembered', () => remembered);
      await context.exposeBinding('__saveRemembered', (_, value) => {
        remembered = value;
        return { saved: !!value };
      });
      await context.addInitScript(
        ({ backend, data }) => {
          window.TRONO_BACKEND_URL = backend;
          if (!localStorage.getItem('desktop-fixture-initialized')) {
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('desktop-fixture-initialized', '1');
          }
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem(
            'tronoClips:' + data.user.id,
            JSON.stringify({ version: 2, desktopAuto: true, auto: true }),
          );
          window.__native = {
            captures: 0,
            recorders: 0,
            workers: 0,
            replayCalls: 0,
            configurations: [],
            captureSelections: [],
            permissions: ['audio', 'video'],
          };
          window.TronoDesktop = {
            version: '0.2.1',
            clipsSuspended: true,
            readSession: () => window.__readRemembered(),
            saveSession: (value) => window.__saveRemembered(value),
            getMediaPermissions: async () => window.__native.permissions,
            resetMediaPermissions: async () => {
              window.__native.permissions = [];
            },
            prepareReplay: async () => {
              window.__native.replayCalls++;
              return { suspended: true, active: false };
            },
            onClip: (fn) => (window.__native.clip = fn),
            onCapture: (fn) => (window.__native.capture = fn),
            onCaptureCancel: (fn) => (window.__native.cancel = fn),
            configureClips: async (value) => {
              window.__native.configurations.push(value);
              return { active: false, suspended: true };
            },
            selectCapture: async (value) => {
              window.__native.captureSelections.push(value);
              const pending = window.__native.pendingPicker;
              if (!pending || pending.id !== value.id) return { selected: false };
              window.__native.pendingPicker = null;
              if (value.source) pending.resolve();
              else pending.reject(new DOMException('Cancelled', 'NotAllowedError'));
              return { selected: !!value.source };
            },
            onApplicationAudio: (fn) => (window.__native.audio = fn),
            ackApplicationAudio: () => {},
            stopApplicationAudio: async () => {},
          };
          window.__native.activityState = {
            available: true,
            enabled: false,
            game: null,
            apps: [{ id: 'a'.repeat(64), name: 'Meu jogo' }],
            error: null,
          };
          Object.assign(window.TronoDesktop, {
            getActivityState: async () => window.__native.activityState,
            onActivity: (fn) => (window.__native.activity = fn),
            configureActivity: async (config) => {
              const state = window.__native.activityState;
              state.enabled = config.enabled;
              state.game = config.enabled
                ? {
                    name: config.preferredAppId ? config.name || 'Meu jogo' : 'Counter-Strike 2',
                    startedAt: Date.now(),
                  }
                : null;
              window.__native.activity?.(state);
              return state;
            },
          });
          Object.assign(window.TronoDesktop, {
            getWindowState: async () => ({ fullscreen: !!window.__native.fullscreen }),
            onWindowState: (fn) => (window.__native.windowState = fn),
            toggleFullscreen: async () => {
              window.__native.fullscreen = !window.__native.fullscreen;
              const state = { fullscreen: window.__native.fullscreen };
              window.__native.windowState?.(state);
              return state;
            },
            getUpdateState: async () => ({ status: 'idle' }),
            onUpdateState: (fn) => (window.__native.update = fn),
            checkUpdates: async () => ({ status: 'current' }),
            installUpdate: async () => ({ canceled: true }),
            openAttachment: async (value) => {
              window.__native.attachment = value;
              return { opened: true };
            },
          });
          Object.assign(window.TronoDesktop, {
            copyDiagnostics: async (text) => {
              window.__native.diagnosticReport = text;
              return { copied: true };
            },
            getResources: async () => ({ appCpuPercent: 4, appMemoryMB: 215, freeMemoryMB: 4096 }),
            notify: async (value) => {
              (window.__native.notifications ||= []).push(value);
              return { shown: true };
            },
            onNotificationClick: (fn) => (window.__native.notificationClick = fn),
          });
          const Recorder = MediaRecorder,
            WorkerClass = Worker;
          window.MediaRecorder = class extends Recorder {
            constructor(...args) {
              super(...args);
              window.__native.recorders++;
            }
          };
          window.Worker = class extends WorkerClass {
            constructor(...args) {
              super(...args);
              if (args[1]?.name === 'clip-buffer') window.__native.workers++;
            }
          };
          navigator.mediaDevices.getDisplayMedia = async () => {
            window.__native.captures++;
            const request = window.__native.nextCaptureRequest;
            if (request) {
              window.__native.nextCaptureRequest = null;
              await new Promise((resolve, reject) => {
                window.__native.pendingPicker = { id: request.id, resolve, reject };
                queueMicrotask(() => window.__native.capture(request));
              });
            }
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const draw = canvas.getContext('2d'),
              timer = setInterval(() => {
                draw.fillStyle = '#6d4580';
                draw.fillRect(0, 0, 1280, 720);
              }, 30),
              stream = canvas.captureStream(30),
              video = stream.getVideoTracks()[0],
              stop = video.stop.bind(video);
            video.stop = () => {
              clearInterval(timer);
              stop();
            };
            return stream;
          };
        },
        { backend: fixture.base, data },
      );
      let page;
      async function open() {
        page = await context.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('dialog', (d) => d.accept());
        page.setDefaultTimeout(10000);
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await expect(
          page.locator('#chatOnlyScreen, #portalScreen').filter({ visible: true }),
        ).toBeVisible();
      }
      await open();
      await step(
        'suspended replay never allocates resources from old automatic preferences',
        async () => {
          await page.evaluate(() => window.TronoCallSettings.open('resources'));
          await expect(page.getByRole('region', { name: 'Recursos', exact: true })).toBeVisible();
          assert.equal(await page.evaluate(() => typeof window.TronoClips), 'undefined');
          assert.equal(await page.evaluate(() => typeof window.TronoClipControls), 'undefined');
          assert.deepEqual(
            await page.evaluate(() => ({
              recorders: window.__native.recorders,
              workers: window.__native.workers,
              replay: window.__native.replayCalls,
              captures: window.__native.captures,
            })),
            { recorders: 0, workers: 0, replay: 0, captures: 0 },
          );
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
        },
      );
      await step(
        'resetting native permissions confirms before ending the same live call',
        async () => {
          await page.locator('[data-voice-channel=chat-livre]').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await page.evaluate(() => {
            window.__permissionMic = window.TronoSocial.getLocalAudioTrack();
            window.TronoCallSettings.open('privacy');
          });
          const reset = page.getByRole('button', {
            name: 'Redefinir permissões de microfone e câmera',
            exact: true,
          });
          page.removeAllListeners('dialog');
          page.once('dialog', (d) => d.dismiss());
          await reset.click();
          assert(
            await page.evaluate(
              () => window.TronoSocial.voiceJoined && window.__permissionMic.readyState === 'live',
            ),
          );
          assert.deepEqual(await page.evaluate(() => window.__native.permissions), [
            'audio',
            'video',
          ]);
          page.once('dialog', (d) => d.accept());
          await reset.click();
          await expect(
            page.getByRole('region', { name: 'Privacidade', exact: true }).getByRole('status'),
          ).toContainText('Permissões redefinidas');
          assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
          assert.equal(await page.evaluate(() => window.__permissionMic.readyState), 'ended');
          assert.equal(await page.evaluate(() => window.TronoSocial.cameraOn), false);
          assert.deepEqual(await page.evaluate(() => window.__native.permissions), []);
          page.on('dialog', (d) => d.accept());
        },
      );
      await step(
        'native diagnostics and notification filters use the shared control center',
        async () => {
          await page.evaluate(() => window.TronoCallSettings.select('connection'));
          await page.getByRole('button', { name: 'Abrir diagnóstico', exact: true }).click();
          await page.getByRole('button', { name: 'Copiar diagnóstico', exact: true }).click();
          await expect(page.getByRole('status').filter({ hasText: 'Copiado' })).toBeVisible();
          const report = await page.evaluate(() => window.__native.diagnosticReport);
          assert.equal(JSON.parse(report).app, 'M&N');
          assert(!report.includes(data.session.access_token));
          await page.evaluate(() => window.TronoCallSettings.select('notifications'));
          await page.locator('#testWindowsNotification').click();
          assert.equal(await page.evaluate(() => window.__native.notifications.length), 1);
          await page.locator('#notificationMode').selectOption('off');
          const notice = () =>
            page.evaluate(() =>
              window.TronoNotifications.notify({
                key: crypto.randomUUID(),
                title: 'Teste',
                body: 'Mensagem',
                target: { type: 'channel', id: 'chat-livre' },
              }),
            );
          await notice();
          assert.equal(await page.evaluate(() => window.__native.notifications.length), 1);
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
        },
      );
      await step(
        'remembered bridge restoration and logout preserve the standalone entry gate',
        async () => {
          await page.evaluate(() => window.TronoAuth.setRemember(true));
          await expect.poll(() => !!remembered).toBe(true);
          assert(!JSON.stringify(remembered).includes('Senha12!'));
          await page.close();
          await open();
          await expect
            .poll(() => page.evaluate(() => window.TronoAuth.user?.id))
            .toBe(data.user.id);
          await page.evaluate(() => window.TronoAuth.logout());
          await expect(page.locator('#portalScreen')).toBeVisible();
          await expect.poll(() => remembered).toBe(null);
          await page.close();
          await open();
          assert.equal(await page.evaluate(() => window.TronoAuth.user), null);
          await page
            .getByRole('checkbox', { name: 'Lembrar neste computador', exact: true })
            .uncheck();
          await page.locator('#authEmail').fill('desktop@example.test');
          await page.locator('#authPassword').fill('Senha12!');
          await page.locator('#authSubmit').click();
          await expect(page.locator('#chatOnlyScreen')).toBeVisible();
          assert.equal(await page.evaluate(() => window.TronoAuth.remembered), false);
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
