'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs');
const express = require('express'),
  { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { installSyntheticCallMedia } = require('./synthetic-call-media.cjs');

test(
  'Corte media lifecycle preserves capture cancellation, noise processing and device replacement',
  { timeout: 180000 },
  async (t) => {
    const app = express();
    app.use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port;
    const f = await startFixture({ port: 10681, appOrigin: origin, soundboard: true });
    let browser;
    const errors = [],
      contexts = [];
    // These scenarios share a session. Stop at the first failure so its unfinished
    // dialog, permissions or selection cannot create misleading downstream errors.
    async function stepAt(parent, name, fn) {
      let failure;
      await parent.test(name, async (context) => {
        try {
          await fn(context);
        } catch (error) {
          failure = error;
          throw error;
        }
      });
      if (failure) throw failure;
    }
    const step = (name, fn) => stepAt(t, name, fn);
    const artifacts = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    try {
      browser = await chromium.launch({
        executablePath:
          process.env.AUTH_TEST_CHROMIUM || process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        headless: true,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      async function user(email, nickname) {
        await f.call('signup', { email, nickname, password: 'Senha12!' });
        const hash = [...f.links].find(([, v]) => v.user.email === email)[0];
        await f.call('verify', { token_hash: hash, type: 'signup' });
        return (await f.call('login', { email, password: 'Senha12!' })).data;
      }
      const owner = await user('jonathapereira.jj@gmail.com', 'Criador UI'),
        member = await user('membro@example.test', 'Membro UI');
      async function pageFor(data) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          permissions: ['microphone', 'camera'],
        });
        contexts.push(context);
        await context.addInitScript(installSyntheticCallMedia);
        await context.addInitScript(
          ({ backend, data }) => {
            window.TRONO_BACKEND_URL = backend;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoNoiseSuppression', '0');
            window.__captures = [];
            window.__soundAudios = [];
            const NativeAudio = window.Audio;
            window.Audio = class extends NativeAudio {
              constructor(...args) {
                super(...args);
                window.__soundAudios.push(this);
              }
            };
            navigator.mediaDevices.getDisplayMedia = async (options) => {
              window.__captures.push(options);
              if (window.__captureGate) await window.__captureGate;
              if (window.__denyCapture) throw new DOMException('Cancelado', 'NotAllowedError');
              const canvas = document.createElement('canvas');
              canvas.width = 1280;
              canvas.height = 720;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#564775';
              ctx.fillRect(0, 0, 1280, 720);
              ctx.fillStyle = '#e6d9ff';
              ctx.font = '40px sans-serif';
              ctx.fillText('Compartilhamento de teste', 160, 340);
              window.__captureCanvas = canvas;
              const stream = canvas.captureStream(30);
              window.__lastCapture = stream;
              const track = stream.getVideoTracks()[0],
                stop = track.stop.bind(track),
                timer = setInterval(() => {
                  ctx.fillStyle = ctx.fillStyle === '#ffffff' ? '#000000' : '#ffffff';
                  ctx.fillRect(0, 0, 2, 2);
                }, 50);
              track.stop = () => {
                clearInterval(timer);
                stop();
              };
              return stream;
            };
          },
          { backend: f.base, data },
        );
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
          return route.continue();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('dialog', (dialog) => void dialog.accept());
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await page.evaluate(() => window.TronoPortal.openVoice());
        await expect(page.locator('#chatOnlyScreen')).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
          .toBe('chat-livre');
        await page.locator('[data-channel="chat-livre"]').click();
        return page;
      }
      const memberPage = await pageFor(member),
        page = await pageFor(owner);
      let textId, voiceId;
      await step(
        'screen popup precedes capture; cancel, 1080p/60 FPS and denied capture',
        async () => {
          await page.evaluate(() =>
            window.TronoSocial.voiceJoined
              ? window.TronoSocial.leaveVoice()
              : window.TronoChatHub.switchChannel('chat-livre', { connectVoice: true }),
          );
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('screenShareBtn');
          });
          await expect(page.locator('#screenOptionsDialog')).toBeVisible();
          assert.equal(await page.evaluate(() => window.__captures.length), 0);
          await page.locator('#screenOptionsCancel').click();
          assert.equal(await page.evaluate(() => window.__captures.length), 0);
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('screenShareBtn');
          });
          await page.locator('#shareResolution').selectOption('1080');
          await page.locator('#shareFps').selectOption('60');
          await page.locator('#screenOptionsConfirm').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
          const capture = await page.evaluate(() => window.__captures[0]);
          assert.equal(capture.video.height.ideal, 1080);
          assert.equal(capture.video.frameRate.ideal, 60);
          assert.equal((await page.evaluate(() => window.TronoSocial.screenSettings)).fps, 60);
          assert.equal(capture.windowAudio, 'window');
          assert.equal(capture.audio.restrictOwnAudio, true);
          assert.equal(capture.selfBrowserSurface, 'exclude');
          const microphoneBeforeSwap = await page.evaluate(
            () => window.TronoSocial.getLocalAudioTrack().id,
          );
          await page.evaluate(() => {
            window.__beforeSwap = window.__lastCapture;
            window.__captureGate = new Promise((resolve) => (window.__releaseCapture = resolve));
          });
          const switchButton = {
            click: () =>
              page.evaluate(() => {
                window.__pendingSwitch = window.TronoCallStage.switchSource();
              }),
          };
          await switchButton.click();
          await expect
            .poll(() => page.evaluate(() => window.TronoCallStage.getSnapshot().switching), { timeout: 15000 })
            .toBe(true);
          assert.equal(
            await page.evaluate(() => window.__beforeSwap.getVideoTracks()[0].readyState),
            'live',
          );
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), true);
          await page.evaluate(() => {
            window.__releaseCapture();
            window.__captureGate = null;
          });
          await page.evaluate(() => window.__pendingSwitch);
          await expect
            .poll(() => page.evaluate(() => window.TronoCallStage.getSnapshot().switching), { timeout: 15000 })
            .toBe(false);
          assert.equal(
            await page.evaluate(() => window.__beforeSwap.getVideoTracks()[0].readyState),
            'ended',
          );
          assert.equal(
            await page.evaluate(() => window.__lastCapture.getVideoTracks()[0].readyState),
            'live',
          );
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id),
            microphoneBeforeSwap,
          );
          await page.evaluate(() => {
            window.__beforeCancel = window.__lastCapture;
            window.__denyCapture = true;
          });
          await switchButton.click();
          await page.evaluate(() => window.__pendingSwitch);
          await expect
            .poll(() => page.evaluate(() => window.TronoCallToolbar.getSnapshot().status.text))
            .toContain('A tela anterior continua');
          assert.equal(
            await page.evaluate(() => window.__beforeCancel.getVideoTracks()[0].readyState),
            'live',
          );
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), true);
          await page.evaluate(() => (window.__denyCapture = false));
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('screenShareBtn');
          });
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.screenSharing))
            .toBe(false);
          await page.evaluate(() => {
            window.__denyCapture = true;
          });
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('screenShareBtn');
          });
          await page.locator('#screenOptionsConfirm').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoCallToolbar.getSnapshot().status.text))
            .toContain('cancelado');
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), false);
          await page.evaluate(() => {
            window.__denyCapture = false;
          });
          const microphone = await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id);
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('screenShareBtn');
          });
          await page.locator('#shareAudio').uncheck();
          await page.locator('#screenOptionsConfirm').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
          const silent = await page.evaluate(() => window.__captures.at(-1));
          assert.equal(silent.audio, false);
          assert.equal(silent.systemAudio, 'exclude');
          assert.equal(silent.windowAudio, 'exclude');
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id),
            microphone,
          );
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
            true,
          );
          await page.evaluate(() => window.TronoCallToolbar.activate('screenShareBtn'));
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(false);
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('screenShareBtn');
          });
          await page.locator('#shareAudio').check();
          await page.locator('#screenOptionsConfirm').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
          await page.evaluate(() => window.TronoCallToolbar.activate('screenShareBtn'));
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(false);
        },
      );
      await step(
        'real RNNoise activation, mute, device replacement and runtime fallback with simulated native capability',
        async () => {
          // Capture is synthetic; RNNoise WASM, AudioWorklet and outgoing audio
          // use real browser paths. Model native suppression capability explicitly.
          await page.evaluate(() => {
            window.__nativeMic = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              const stream = await window.__nativeMic(constraints);
              if (constraints.audio) {
                const track = stream.getAudioTracks()[0],
                  settings = track.getSettings.bind(track);
                let native = !!constraints.audio.noiseSuppression;
                track.getSettings = () => ({ ...settings(), noiseSuppression: native });
                // This oscillator has no hardware DSP. Simulate the declared native
                // capability entirely, rather than applying it to a synthetic track.
                track.applyConstraints = async (options) => {
                  if ('noiseSuppression' in options) native = !!options.noiseSuppression;
                };
                window.__rawMicrophone = track;
              }
              return stream;
            };
          });
          await page.evaluate(() => {
            const create = window.TronoNoise.create;
            window.TronoNoise.create = async (ctx, ...args) => {
              window.__noiseContext = ctx;
              const options = args[0] || {};
              args[0] = {
                ...options,
                onFailure: (error) => {
                  window.__noiseFailures = (window.__noiseFailures || 0) + 1;
                  options.onFailure?.(error);
                },
              };
              const result = await create(ctx, ...args);
              window.__noiseNode = result.node;
              return result;
            };
          });
          const before = await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id);
          await page.evaluate(() => window.TronoCallSettings.open('audio'));
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode), { timeout: 12000 })
            .toBe('rnnoise');
          await expect(page.locator('#noiseSuppressionStatus')).toContainText('RNNoise ativo');
          assert.equal(await page.evaluate(() => window.TronoSocial.noiseState.sampleRate), 48000);
          assert.notEqual(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id),
            before,
          );
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('muteMicBtn');
          });
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
            false,
          );
          await page.evaluate(async () => {
            window.__processedNoiseTrack = window.TronoSocial.getLocalAudioTrack();
            await window.__noiseContext.suspend();
          });
          await expect
            .poll(() =>
              page.evaluate(
                () => window.TronoSocial.getLocalAudioTrack() === window.__rawMicrophone,
              ),
            )
            .toBe(true);
          assert.equal(await page.evaluate(() => window.__noiseContext.state), 'suspended');
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled))
            .toBe(false);
          await page.evaluate(() => window.__noiseContext.resume());
          await expect
            .poll(() =>
              page.evaluate(
                () => window.TronoSocial.getLocalAudioTrack() === window.__processedNoiseTrack,
              ),
            )
            .toBe(true);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          assert.equal(await page.evaluate(() => window.__rawMicrophone.enabled), false);
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('muteMicBtn');
          });
          assert.equal(await page.evaluate(() => window.__rawMicrophone.enabled), true);
          await page.evaluate(() => window.__noiseNode.dispatchEvent(new Event('processorerror')));
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('native');
          assert.equal(await page.evaluate(() => window.__noiseFailures), 1);
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState),
            'live',
          );
          await page.evaluate(() => window.TronoCallSettings.open('audio'));
          await expect(page.locator('#noiseSuppressionStatus')).toContainText(/redução nativa/i);
          await page.locator('#noiseSuppressionBtn').click();
          await expect(page.locator('#noiseSuppressionBtn')).toHaveText('Supressor: Desligado');
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          const previous = await page.evaluate(() => {
            window.__oldNoiseTrack = window.TronoSocial.getLocalAudioTrack();
            return window.__oldNoiseTrack.id;
          });
          const input = page.locator('#voiceInputSelect');
          const previousDevice = await input.inputValue();
          const replacementDevice = await input.evaluate(
            (select) =>
              [...select.options].find(
                (option) => !option.disabled && option.value !== select.value,
              )?.value,
          );
          assert.notEqual(
            replacementDevice,
            undefined,
            'The capture fixture must offer another microphone',
          );
          await input.selectOption(replacementDevice);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id))
            .not.toBe(previous);
          await expect
            .poll(() => page.evaluate(() => window.__oldNoiseTrack.readyState))
            .toBe('ended');
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('off');
          const replacedTrack = await page.evaluate(
            () => window.TronoSocial.getLocalAudioTrack().id,
          );
          await input.selectOption(previousDevice);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id))
            .not.toBe(replacedTrack);
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
          await page.evaluate(() => {
            navigator.mediaDevices.getUserMedia = window.__nativeMic;
          });
        },
      );
      await step(
        'light gaming mode uses native treatment, preserves mute/gain, limits meters and persists locally',
        async () => {
          await page.evaluate(() => {
            window.__lightCapture = navigator.mediaDevices.getUserMedia.bind(
              navigator.mediaDevices,
            );
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              const stream = await window.__lightCapture(constraints);
              if (constraints.audio) {
                const track = stream.getAudioTracks()[0],
                  settings = track.getSettings.bind(track);
                track.getSettings = () => ({
                  ...settings(),
                  noiseSuppression: !!constraints.audio.noiseSuppression,
                });
              }
              return stream;
            };
            const create = window.TronoNoise.create;
            window.__lightDenoiserCalls = 0;
            window.TronoNoise.create = (...args) => {
              window.__lightDenoiserCalls++;
              return create(...args);
            };
            window.__lightMeterNative = AnalyserNode.prototype.getByteTimeDomainData;
            window.__lightMeterReads = 0;
            AnalyserNode.prototype.getByteTimeDomainData = function (...args) {
              window.__lightMeterReads++;
              return window.__lightMeterNative.apply(this, args);
            };
          });
          await page.evaluate(() => window.TronoCallSettings.open('audio'));
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          await page.locator('#micGainSlider').evaluate((el) => {
            el.value = '150';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('muteMicBtn');
          });
          await page.evaluate(() => window.TronoCallSettings.open('audio'));
          const before = await page.evaluate(() => {
            window.__lightOldTrack = window.TronoSocial.getLocalAudioTrack();
            return window.__lightDenoiserCalls;
          });
          await page.locator('#voiceLightModeBtn').click();
          await expect(page.locator('#voiceLightModeBtn')).toHaveAttribute('aria-pressed', 'true');
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('native');
          await expect(page.locator('#noiseSuppressionStatus')).toContainText(/redução nativa/i);
          assert.equal(await page.evaluate(() => window.__lightDenoiserCalls), before);
          assert.equal(await page.evaluate(() => window.__lightOldTrack.readyState), 'ended');
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
            false,
          );
          await expect(page.locator('#micGainSlider')).toHaveValue('150');
          assert.equal(await memberPage.evaluate(() => window.TronoSocial.voiceLightMode), false);
          await page.evaluate(() => {
            window.__lightMeterReads = 0;
          });
          await page.waitForTimeout(1200);
          const reads = await page.evaluate(() => window.__lightMeterReads);
          assert(
            reads > 0 && reads <= 8,
            'light mode polls speaking meters at about 5 Hz, not display FPS',
          );
          await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', {
              configurable: true,
              value: 'hidden',
            });
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            window.__lightMeterReads = 0;
          });
          await page.waitForTimeout(1200);
          assert.equal(await page.evaluate(() => window.__lightMeterReads), 0);
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState),
            'live',
          );
          await page.evaluate(() => {
            delete document.visibilityState;
            delete document.hidden;
            document.dispatchEvent(new Event('visibilitychange'));
          });
          await page.screenshot({ path: path.join(artifacts, 'frontend-light-gaming-mode.png') });
          // A failed processing change must keep the existing input and light preference.
          await page.evaluate(() => {
            window.__lightBeforeFailure = window.TronoSocial.getLocalAudioTrack();
            const capture = navigator.mediaDevices.getUserMedia;
            navigator.mediaDevices.getUserMedia = async () => {
              navigator.mediaDevices.getUserMedia = capture;
              throw new DOMException('Device busy', 'NotReadableError');
            };
          });
          await page.locator('#voiceLightModeBtn').click();
          await expect(page.locator('#voiceLightModeBtn')).toHaveAttribute('aria-pressed', 'true');
          assert.equal(
            await page.evaluate(
              () => window.TronoSocial.getLocalAudioTrack() === window.__lightBeforeFailure,
            ),
            true,
          );
          await page.locator('#voiceLightModeBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
            false,
          );
          await page.locator('#voiceLightModeBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('native');
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
          await page.evaluate(() =>
            window.TronoSocial.voiceJoined
              ? window.TronoSocial.leaveVoice()
              : window.TronoChatHub.switchChannel('chat-livre', { connectVoice: true }),
          );
          await page.reload();
          await page.waitForFunction(() => window.TronoAuth?.ready);
          await page.evaluate(() => window.TronoAuth.ready);
          await expect(page.locator('#chatOnlyScreen')).toBeVisible();
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe('chat-livre');
          assert.equal(await page.evaluate(() => window.TronoSocial.voiceLightMode), true);
          assert.equal(await memberPage.evaluate(() => window.TronoSocial.voiceLightMode), false);
          await page.evaluate(() => window.TronoCallSettings.open('audio'));
          await page.locator('#voiceLightModeBtn').click();
          await expect(page.locator('#voiceLightModeBtn')).toHaveAttribute('aria-pressed', 'false');
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
          if (!(await page.evaluate(() => window.TronoSocial.voiceJoined)))
            await page.evaluate(() =>
              window.TronoSocial.voiceJoined
                ? window.TronoSocial.leaveVoice()
                : window.TronoChatHub.switchChannel('chat-livre', { connectVoice: true }),
            );
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('off');
          await page.evaluate(() => window.TronoCallSettings.open('audio'));
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('off');
          await page.locator('#micGainSlider').evaluate((el) => {
            el.value = '100';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
        },
      );
      await step(
        'missing RNNoise model keeps the microphone live and reports unavailable suppression',
        async () => {
          let blocked = 0;
          await memberPage.route('**/vendor/rnnoise/*.wasm*', (route) => {
            blocked++;
            return route.fulfill({ status: 404, body: 'Missing model' });
          });
          await memberPage.evaluate(() =>
            window.TronoSocial.voiceJoined
              ? window.TronoSocial.leaveVoice()
              : window.TronoChatHub.switchChannel('chat-livre', { connectVoice: true }),
          );
          await memberPage.evaluate(() => window.TronoCallSettings.open('audio'));
          await memberPage.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => memberPage.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('unavailable');
          assert.equal(blocked, 1);
          await expect(memberPage.locator('#noiseSuppressionBtn')).toHaveText(
            'Supressor: Indisponível',
          );
          await expect(memberPage.locator('#noiseSuppressionStatus')).toContainText(
            'O microfone continua transmitindo.',
          );
          assert.equal(
            await memberPage.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState),
            'live',
          );
          await memberPage.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => memberPage.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('off');
          await memberPage
            .getByRole('button', { name: 'Fechar configurações', exact: true })
            .click();
          await memberPage.evaluate(() =>
            window.TronoSocial.voiceJoined
              ? window.TronoSocial.leaveVoice()
              : window.TronoChatHub.switchChannel('chat-livre', { connectVoice: true }),
          );
          await memberPage.unroute('**/vendor/rnnoise/*.wasm*');
        },
      );
      await step(
        'camera input releases existing device, relaxes capture constraints and cancels pending capture on leave',
        async () => {
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('cameraBtn');
          });
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
          await page.evaluate(() => {
            window.__nativeCamera = navigator.mediaDevices.getUserMedia.bind(
              navigator.mediaDevices,
            );
            window.__previousCamera = window.TronoSocial.getMediaSources()
              .find((p) => p.self)
              .camera.getVideoTracks()[0];
            window.__cameraAttempts = [];
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              if (constraints.video) {
                window.__cameraAttempts.push(constraints);
                if (window.__previousCamera.readyState !== 'ended')
                  throw new DOMException('Device still occupied', 'NotReadableError');
                if (window.__cameraAttempts.length === 1)
                  throw new DOMException('Could not start video source', 'NotReadableError');
              }
              return window.__nativeCamera(constraints);
            };
            document
              .getElementById('cameraInputSelect')
              .dispatchEvent(new Event('change', { bubbles: true }));
          });
          await expect.poll(() => page.evaluate(() => window.__cameraAttempts.length)).toBe(2);
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
          assert.equal(await page.evaluate(() => window.__previousCamera.readyState), 'ended');
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('cameraBtn');
          });
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(false);
          await page.evaluate(() => {
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              const stream = await window.__nativeCamera(constraints);
              if (constraints.video) {
                window.__pendingCamera = stream;
                await new Promise((resolve) => {
                  window.__releaseCamera = resolve;
                });
              }
              return stream;
            };
          });
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('cameraBtn');
          });
          await expect.poll(() => page.evaluate(() => !!window.__pendingCamera)).toBe(true);
          await expect(page.locator('[data-control=cameraBtn]')).toBeDisabled();
          await page.evaluate(() =>
            window.TronoSocial.voiceJoined
              ? window.TronoSocial.leaveVoice()
              : window.TronoChatHub.switchChannel('chat-livre', { connectVoice: true }),
          );
          await page.evaluate(() => window.__releaseCamera());
          await expect
            .poll(() =>
              page.evaluate(() =>
                window.__pendingCamera.getTracks().every((t) => t.readyState === 'ended'),
              ),
            )
            .toBe(true);
          assert.equal(await page.evaluate(() => window.TronoSocial.cameraOn), false);
          await page.evaluate(() => {
            navigator.mediaDevices.getUserMedia = window.__nativeCamera;
          });
          await page.evaluate(() =>
            window.TronoSocial.voiceJoined
              ? window.TronoSocial.leaveVoice()
              : window.TronoChatHub.switchChannel('chat-livre', { connectVoice: true }),
          );
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await page.evaluate(() => {
            void window.TronoCallToolbar.activate('cameraBtn');
          });
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
        },
      );
      assert.deepEqual(errors, []);
    } finally {
      for (const context of contexts) await context.close();
      await browser?.close();
      await f.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
