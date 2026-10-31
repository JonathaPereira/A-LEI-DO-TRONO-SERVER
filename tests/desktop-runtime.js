'use strict';
// Real Electron/Windows smoke test; browser flow coverage is in desktop-browser.js.
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  os = require('node:os');
const { _electron, expect } = require('@playwright/test');
const { startHTTPS } = require('./desktop-https-fixture');
const { killTestApp, closeTestApp } = require('./desktop-test-close');
test(
  'installed desktop boundary, native shortcut, picker and filesystem integration',
  { timeout: 160000 },
  async (t) => {
    // Keep CI quiet by default; this mode exercises the same assertions with
    // the native audio service audible. Devices remain Chromium test sources.
    const audioArgs = process.env.QA_UNMUTED_AUDIO === '1' ? [] : ['--mute-audio'];
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-runtime-'));
    let app,
      api,
      guestFixture,
      phase = 'launch',
      finished = false;
    t.signal.addEventListener(
      'abort',
      () => {
        if (!finished) {
          console.error('Desktop test stalled at: ' + phase);
          killTestApp(app);
        }
      },
      { once: true },
    );
    try {
      api = await startHTTPS(directory);
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [
          path.resolve(__dirname, '../electron'),
          '--user-data-dir=' + directory,
          '--desktop-diagnostics',
          ...audioArgs,
          '--use-fake-device-for-media-stream',
          '--desktop-api-test-origin=' + api.url,
          ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        ],
        timeout: 40000,
      });
      app.process().stderr.on('data', (chunk) => {
        for (const line of chunk.toString().split('\n'))
          if (line.startsWith('[desktop]')) console.log(line);
      });
      let page = await app.firstWindow();
      await expect(page.locator('[data-entry]')).toBeVisible({ timeout: 30000 });
      assert.equal(page.url(), 'https://a-lei-do-trono.surge.sh/');
      assert.equal(
        await page.evaluate(async () => (await fetch('/')).headers.get('referrer-policy')),
        'no-referrer',
      );
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      if (await page.locator('#authDialog').isVisible())
        await page.locator('#authCloseBtn').click();
      assert.equal(await page.evaluate(() => typeof require), 'undefined');
      assert.equal(await page.evaluate(() => typeof process), 'undefined');
      assert.equal(
        await page.evaluate(() => window.TronoDesktop.version),
        require('../electron/package.json').version,
      );
      phase = 'native diagnostics';
      const resources = await page.evaluate(() => window.TronoDesktop.getResources());
      assert(
        resources.appMemoryMB > 0 &&
          Number.isFinite(resources.appCpuPercent) &&
          resources.freeMemoryMB >= 0,
      );
      await page.evaluate(() =>
        window.TronoDesktop.copyDiagnostics('{"app":"M&N","version":"0.2.4"}'),
      );
      assert.equal(
        await app.evaluate(({ clipboard }) => clipboard.readText()),
        '{"app":"M&N","version":"0.2.4"}',
      );
      await assert.rejects(
        page.evaluate(() =>
          window.TronoDesktop.notify({ key: 'invalid', title: 'Test', body: 'No target' }),
        ),
      );
      phase = 'replay waits for a shared source';
      assert.equal(await page.evaluate(() => typeof window.TronoClips), 'object');
      assert.equal(await page.evaluate(() => window.TronoClips.active), false);
      assert.deepEqual(await page.evaluate(() => window.TronoDesktop.prepareReplay()), {
        active: false,
        suspended: true,
      });
      assert.equal(
        await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Shift+X')),
        false,
      );
      phase = 'native fullscreen';
      await page.evaluate(() => window.TronoDesktopWindow.toggleFullscreen());
      await expect
        .poll(() =>
          app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
        )
        .toBe(true);
      await page.evaluate(() => window.TronoDesktopWindow.toggleFullscreen());
      await expect
        .poll(() =>
          app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
        )
        .toBe(false);
      phase = 'navigation';
      assert.equal(await page.evaluate(() => typeof window.TronoClips), 'object');
      assert.equal(await page.evaluate(() => window.TronoClips.active), false);
      await page.evaluate(() => window.TronoCallSettings.open('privacy'));
      await expect(page.locator('dialog[data-topic]')).toBeVisible();
      await page.locator('[data-settings-tab="privacy"]').click();
      await expect(
        page.getByRole('region', { name: 'Privacidade', exact: true }).getByRole('status'),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      await expect(page.locator('#portalScreen')).toBeVisible();
      // The installed bundle never falls back to remote Surge files.
      assert.equal(
        await page.evaluate(async () => (await fetch('/missing-desktop-file')).status),
        404,
      );
      phase = 'global clip shortcut registration and release';
      const registered = await page.evaluate(() =>
        window.TronoDesktop.configureClips({
          active: true,
          shortcut: { ctrl: true, alt: true, code: 'F9' },
        }),
      );
      assert.equal(registered.active, true);
      assert.equal(registered.globalActive, true);
      assert.equal(
        await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+F9')),
        true,
      );
      await page.evaluate(() => window.TronoDesktop.configureClips({ active: false }));
      assert.equal(
        await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+F9')),
        false,
      );
      // An untrusted child page cannot issue native filesystem IPC, even if it
      // navigates to the app origin with a manually injected test preload.
      phase = 'child IPC isolation';
      const denied = await app.evaluate(
        async ({ BrowserWindow }, preload) => {
          const child = new BrowserWindow({
            show: false,
            webPreferences: {
              session: BrowserWindow.getAllWindows()[0].webContents.session,
              preload,
              sandbox: true,
              contextIsolation: true,
            },
          });
          try {
            await child.loadURL('https://a-lei-do-trono.surge.sh/desktop-platform.css');
            return await child.webContents.executeJavaScript(
              'window.TronoDesktop.chooseFolder().then(()=>false,()=>true)',
            );
          } finally {
            child.destroy();
          }
        },
        path.resolve(__dirname, '../electron/preload.cjs'),
      );
      assert(denied);
      // Native process detection is exercised separately by desktop-activity-native.cjs.
      phase = 'native file export';
      await app.evaluate(({ dialog }, directory) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
        dialog.showSaveDialog = async () => ({ canceled: true });
        dialog.showMessageBox = async () => ({ response: 0 });
      }, directory);
      const folder = await page.evaluate(() => window.TronoDesktop.chooseFolder());
      assert.equal(folder.native, true);
      assert.deepEqual(
        await page.evaluate(() =>
          window.TronoDesktop.saveClip({
            filename: 'Trono_Clipe_cancel.webm',
            bytes: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 4]).buffer,
          }),
        ),
        { canceled: true },
      );
      const result = await page.evaluate(
        (folder) =>
          window.TronoDesktop.saveClip({
            directory: folder.id,
            filename: 'Trono_Clipe_native.webm',
            bytes: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 4]).buffer,
          }),
        folder,
      );
      assert(result.saved);
      assert.equal((await fs.readFile(path.join(directory, 'Trono_Clipe_native.webm'))).length, 5);
      await assert.rejects(
        page.evaluate(
          (folder) =>
            window.TronoDesktop.saveClip({
              directory: folder.id,
              filename: '../bad.webm',
              bytes: new ArrayBuffer(5),
            }),
          folder,
        ),
      );
      // Enumerate real OS sources and cancel without starting a capture.
      phase = 'native capture picker';
      await page.evaluate(() => {
        const button = document.createElement('button');
        button.id = 'runtimeShare';
        button.textContent = 'Testar captura';
        button.style.cssText = 'position:fixed;top:10px;left:100px;z-index:1500';
        button.onclick = () => {
          window.__captureError = undefined;
          window.__captureResult = navigator.mediaDevices
            .getDisplayMedia({ video: true, audio: false })
            .then(
              (stream) => {
                window.__nativeStream = stream;
                return 'active';
              },
              (error) => {
                window.__captureError = error.name + ': ' + error.message;
                return error.name;
              },
            );
        };
        document.body.append(button);
      });
      await page.locator('#runtimeShare').click();
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              document.querySelector('dialog[aria-label="Escolher tela ou janela"]')?.open
                ? 'picker'
                : window.__captureError || 'pending',
            ),
          { timeout: 30000 },
        )
        .not.toBe('pending');
      assert.equal(await page.evaluate(() => window.__captureError), undefined);
      await expect(
        page.getByRole('dialog', { name: 'Escolher tela ou janela', exact: true }),
      ).toBeVisible({ timeout: 30000 });
      await page.getByRole('button', { name: 'Cancelar captura', exact: true }).click();
      assert(
        ['NotAllowedError', 'AbortError'].includes(
          await page.evaluate(() => window.__captureResult),
        ),
      );
      // Select only this controlled fixture window, never another application or monitor.
      const captureTarget = await app.evaluate(async ({ BrowserWindow }) => {
        const target = new BrowserWindow({
          width: 640,
          height: 420,
          show: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        });
        await target.loadURL(
          'data:text/html,' +
            encodeURIComponent(
              '<!doctype html><title>Corte QA - runtime</title><body style="background:#222;color:#d6b779">Captura controlada</body>',
            ),
        );
        return target.id;
      });
      await page.locator('#runtimeShare').click();
      const nativeSource = page
        .getByRole('dialog', { name: 'Escolher tela ou janela', exact: true })
        .getByRole('button', { name: 'Corte QA - runtime', exact: true });
      await expect(nativeSource).toBeVisible();
      await nativeSource.click();
      await page.locator('#desktopCaptureConfirm').click();
      assert.equal(await page.evaluate(() => window.__captureResult), 'active');
      assert.equal(
        await page.evaluate(() => window.__nativeStream.getVideoTracks()[0].readyState),
        'live',
      );
      await page.evaluate(() => window.__nativeStream.getTracks().forEach((track) => track.stop()));
      await app.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(),
        captureTarget,
      );
      phase = 'soundboard PCM in native renderer';
      const soundboardPCM = await page.evaluate(async () => {
        const input = new AudioBuffer({
          length: 16000 * 30,
          sampleRate: 16000,
          numberOfChannels: 2,
        });
        input.getChannelData(0).fill(0.25, 16000 * 11, 16000 * 26);
        input.getChannelData(1).fill(-0.5, 16000 * 11, 16000 * 26);
        const wav = window.TronoSoundboard.encodeWav(input, 11, 26);
        const context = new AudioContext({ sampleRate: 48000 });
        try {
          const decoded = await context.decodeAudioData(await wav.arrayBuffer());
          return {
            duration: decoded.duration,
            channels: decoded.numberOfChannels,
            frames: decoded.length,
            left: decoded.getChannelData(0)[1000],
            right: decoded.getChannelData(1)[1000],
          };
        } finally {
          await context.close();
        }
      });
      assert.deepEqual(
        {
          duration: soundboardPCM.duration,
          channels: soundboardPCM.channels,
          frames: soundboardPCM.frames,
        },
        { duration: 15, channels: 2, frames: 720000 },
      );
      // PCM16 quantization and the 16→48 kHz browser resampler introduce sub-LSB rounding.
      assert(Math.abs(soundboardPCM.left - 0.25) < 2 / 32768);
      assert(Math.abs(soundboardPCM.right + 0.5) < 2 / 32768);
      phase = 'native persistent session';
      const remembered = {
        session: {
          access_token: 'fixture-only-access',
          refresh_token: 'fixture-only-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
        user: { id: 'fixture-only-owner' },
      };
      const persisted = await page.evaluate(
        (value) => window.TronoDesktop.saveSession(value),
        remembered,
      );
      if (process.platform === 'win32') assert.equal(persisted.saved, true);
      if (persisted.saved) {
        const bytes = await fs.readFile(path.join(directory, 'remembered-session.bin'));
        assert(!bytes.includes(Buffer.from('fixture-only-refresh')));
        assert.deepEqual(await page.evaluate(() => window.TronoDesktop.readSession()), remembered);
      }
      await page.evaluate(() => window.TronoDesktop.saveSession(null));
      assert.equal(await page.evaluate(() => window.TronoDesktop.readSession()), null);
      phase = 'local guest for native court fullscreen';
      guestFixture = await require('./desktop-guest-fixture.cjs').enterNativeGuest({
        app,
        page,
        port: 10847,
      });
      await require('./desktop-court-display-flow').exerciseCourtFullscreen({ app, page });
      await page.evaluate(() => window.TronoAuth.logout());
      phase = 'RNNoise in installed bundle';
      assert(
        await page.evaluate(async () => {
          const context = new AudioContext({ sampleRate: 48000 });
          let processor;
          try {
            await context.resume();
            processor = await window.TronoNoise.create(context);
            return processor.node instanceof AudioWorkletNode;
          } finally {
            processor?.destroy();
            await context.close();
          }
        }),
      );
      phase = 'native voice receive protection';
      await require('./desktop-voice-flow').exerciseVoiceProtection({ app, page });
      phase = 'saved media permissions';
      await app.evaluate(({ dialog }) => {
        globalThis.__permissionPrompts = 0;
        dialog.showMessageBox = async (_, options) => {
          if (options.message?.startsWith('Permitir acesso')) globalThis.__permissionPrompts++;
          return { response: 0 };
        };
      });
      await page.evaluate(async () => {
        for (const constraints of [{ audio: true }, { video: true }]) {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          stream.getTracks().forEach((track) => track.stop());
        }
      });
      assert.deepEqual(
        (await page.evaluate(() => window.TronoDesktop.getMediaPermissions())).sort(),
        ['audio', 'video'],
      );
      assert.equal(await app.evaluate(() => globalThis.__permissionPrompts), 2);
      await closeTestApp(app);
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [
          path.resolve(__dirname, '../electron'),
          '--user-data-dir=' + directory,
          '--desktop-diagnostics',
          ...audioArgs,
          '--use-fake-device-for-media-stream',
          '--desktop-api-test-origin=' + api.url,
          ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        ],
        timeout: 40000,
      });
      page = await app.firstWindow();
      await expect(page.locator('[data-entry]')).toBeVisible({ timeout: 30000 });
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      if (await page.locator('#authDialog').isVisible())
        await page.locator('#authCloseBtn').click();
      await app.evaluate(({ dialog }) => {
        globalThis.__permissionPrompts = 0;
        dialog.showMessageBox = async () => {
          globalThis.__permissionPrompts++;
          return { response: 1 };
        };
      });
      await page.evaluate(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((track) => track.stop());
      });
      assert.equal(await app.evaluate(() => globalThis.__permissionPrompts), 0);
      assert.deepEqual(
        (await page.evaluate(() => window.TronoDesktop.getMediaPermissions())).sort(),
        ['audio', 'video'],
      );
      await page.evaluate(() => window.TronoDesktop.resetMediaPermissions());
      assert.deepEqual(await page.evaluate(() => window.TronoDesktop.getMediaPermissions()), []);
      await assert.rejects(
        page.evaluate(async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        }),
      );
      assert.equal(await app.evaluate(() => globalThis.__permissionPrompts), 1);
      phase = 'HTTPS API compatibility';
      // Trust only this disposable localhost certificate, exclusively in the test.
      await app.evaluate(({ session, BrowserWindow }) => {
        const verify = (request, callback) => callback(request.hostname === '127.0.0.1' ? 0 : -3);
        session.defaultSession.setCertificateVerifyProc(verify);
        BrowserWindow.getAllWindows()[0].webContents.session.setCertificateVerifyProc(verify);
        session.fromPartition('persist:mn-attachments').setCertificateVerifyProc(verify);
      });
      const posted = await page.evaluate(async (url) => {
        const response = await fetch(url + '/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-only' },
          referrerPolicy: 'no-referrer',
          body: JSON.stringify({ test: 'desktop-body' }),
          signal: AbortSignal.timeout(10000),
        });
        return response.json();
      }, api.url);
      assert.equal(posted.method, 'POST');
      assert.equal(posted.origin, 'https://a-lei-do-trono.surge.sh');
      assert.equal(posted.authorization, 'Bearer fixture-only');
      assert.deepEqual(JSON.parse(posted.body), { test: 'desktop-body' });
      const uploaded = await page.evaluate(
        (url) =>
          new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url + '/upload');
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.setRequestHeader('X-File-Name', 'fixture.webm');
            xhr.onload = () => resolve(JSON.parse(xhr.responseText));
            xhr.onerror = reject;
            xhr.send(new Blob(['upload-bytes']));
          }),
        api.url,
      );
      assert.equal(uploaded.origin, 'https://a-lei-do-trono.surge.sh');
      assert.equal(uploaded.filename, 'fixture.webm');
      assert.equal(uploaded.body, 'upload-bytes');
      phase = 'attachment partition isolation';
      const opened = app.waitForEvent('window');
      await page.evaluate(
        (url) => window.TronoDesktop.openAttachment({ url: url + '/doc' }),
        api.url,
      );
      const popup = await opened;
      assert.equal(await popup.evaluate(() => typeof window.TronoDesktop), 'undefined');
      assert.equal(await popup.evaluate(() => window.opener), null);
      const sessions = await app.evaluate(({ BrowserWindow, session }) =>
        BrowserWindow.getAllWindows().map((win) => ({
          url: win.webContents.getURL(),
          app: win.webContents.session === session.fromPartition('persist:mn-trono'),
          attachment: win.webContents.session === session.fromPartition('persist:mn-attachments'),
        })),
      );
      assert.equal(sessions.filter((win) => win.app).length, 1, JSON.stringify(sessions));
      assert.equal(sessions.filter((win) => win.attachment).length, 1, JSON.stringify(sessions));
      await popup.close();
      await page.evaluate(() => document.getElementById('runtimeShare')?.remove());
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/windows-app-runtime.png'),
      });
      // Closing the window retains the process/call for the tray; quit is explicit.
      phase = 'tray close';
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        false,
      );
    } catch (error) {
      console.error('Desktop runtime failure ' + JSON.stringify({ phase, message: error.message }));
      error.message = 'Desktop phase: ' + phase + '\n' + error.message;
      throw error;
    } finally {
      finished = true;
      await closeTestApp(app);
      await api?.stop();
      await guestFixture?.stop();
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
);
