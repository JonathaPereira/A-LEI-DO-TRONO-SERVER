'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writeFileSync, mkdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { exerciseManualRecording } = require('./manual-recording-flow.cjs');
test(
  'manual recording controls preserve call audio, encode playable video and release resources before saving',
  { timeout: 60000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const s = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(s));
    });
    const origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 10933, appOrigin: origin });
    const errors = [];
    let browser;
    const artifacts = path.resolve(__dirname, '../artifacts');
    mkdirSync(artifacts, { recursive: true });
    try {
      const email = 'manual-recording@example.test';
      await fixture.call('signup', { email, nickname: 'Gravador', password: 'Senha12!' });
      await fixture.call('verify', { token_hash: [...fixture.links][0][0], type: 'signup' });
      const data = (await fixture.call('login', { email, password: 'Senha12!' })).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
        headless: true,
        args: [
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
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      );
      await context.addInitScript(
        ({ backend, data }) => {
          window.TRONO_BACKEND_URL = backend;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoNoiseSuppression', '0');
          window.__manualCaptures = [];
          window.__manualEncodedBytes = 0;
          const Encoder = MediaRecorder;
          window.MediaRecorder = class extends Encoder {
            constructor(stream, options) {
              super(stream, options);
              window.__manualEncodedBytes = 0;
              this.addEventListener('dataavailable', (event) => {
                window.__manualEncodedBytes += event.data.size;
              });
            }
          };
          navigator.mediaDevices.getDisplayMedia = async (options) => {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 360;
            const draw = canvas.getContext('2d');
            let frame = 0;
            const paint = () => {
              draw.fillStyle = frame++ % 2 ? '#466389' : '#182b4b';
              draw.fillRect(0, 0, 640, 360);
            };
            paint();
            const stream = canvas.captureStream(options.video.frameRate.ideal),
              video = stream.getVideoTracks()[0],
              stop = video.stop.bind(video),
              timer = setInterval(paint, 32);
            video.stop = () => {
              clearInterval(timer);
              stop();
            };
            const audio = new AudioContext(),
              oscillator = audio.createOscillator(),
              destination = audio.createMediaStreamDestination();
            oscillator.connect(destination);
            oscillator.start();
            const track = destination.stream.getAudioTracks()[0],
              stopAudio = track.stop.bind(track);
            track.stop = () => {
              stopAudio();
              void audio.close();
            };
            stream.addTrack(track);
            window.__manualCaptures.push(stream);
            if (window.__manualDelay)
              await new Promise((resolve) => {
                window.__manualRelease = resolve;
              });
            return stream;
          };
        },
        { backend: fixture.base, data },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.waitForFunction(() => window.TronoRecorder);
      await page.locator('button[data-voice-channel]').first().click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await t.test(
        'cancelling an unresolved capture closes the late result without starting a recorder',
        async () => {
          await page.evaluate(() => {
            window.TronoPortal.showOnly('gameScreen');
            window.__manualDelay = true;
          });
          await page.evaluate(() => window.TronoCallSettings.open('resources'));
          await page.locator('#recordMatchBtn').click();
          await expect.poll(() => page.evaluate(() => !!window.__manualRelease)).toBe(true);
          await expect(page.locator('#recordMatchBtn')).toHaveAttribute(
            'aria-label',
            'Cancelar gravação',
          );
          await page.evaluate(() => window.TronoCallSettings.open('resources'));
          await page.locator('#recordMatchBtn').click();
          await page.evaluate(() => {
            window.__manualRelease();
            window.__manualDelay = false;
          });
          await expect
            .poll(() =>
              page.evaluate(() =>
                window.__manualCaptures[0]
                  .getTracks()
                  .every((track) => track.readyState === 'ended'),
              ),
            )
            .toBe(true);
          assert.equal(await page.evaluate(() => window.TronoRecorder.getSnapshot().phase), 'idle');
        },
      );
      await t.test(
        'mixed video and audio decode and the destination remains pending after capture has stopped',
        async (t) => {
          const bytes = await exerciseManualRecording(page, { exportBytes: true }),
            filename = path.join(artifacts, 'manual-recording.webm');
          writeFileSync(filename, bytes);
          const missing = ['ffprobe', 'ffmpeg'].filter(
            (tool) => spawnSync(tool, ['-version']).error?.code === 'ENOENT',
          );
          await t.test(
            'external codec inspection and full decode',
            {
              skip: missing.length
                ? 'Unavailable: ' + missing.join(', ') + '; Chrome decode passed'
                : false,
            },
            () => {
              const probe = spawnSync(
                'ffprobe',
                [
                  '-v',
                  'error',
                  '-show_entries',
                  'stream=codec_name,width,height',
                  '-of',
                  'json',
                  filename,
                ],
                { encoding: 'utf8' },
              );
              assert.equal(probe.status, 0, probe.stderr);
              const info = JSON.parse(probe.stdout);
              assert(
                info.streams.some(
                  (stream) =>
                    ['vp9', 'vp8'].includes(stream.codec_name) &&
                    stream.width === 640 &&
                    stream.height === 360,
                ),
              );
              assert(info.streams.some((stream) => stream.codec_name === 'opus'));
              const decode = spawnSync(
                'ffmpeg',
                ['-v', 'error', '-threads', '2', '-i', filename, '-f', 'null', '-'],
                { encoding: 'utf8', timeout: 15000 },
              );
              assert.equal(decode.status, 0, decode.stderr);
            },
          );
        },
      );
      await t.test(
        'browser download and runtime disposal preserve the microphone and remove listeners',
        async () => {
          await page.evaluate(() => {
            window.showDirectoryPicker = undefined;
          });
          await page.evaluate(() => window.TronoCallSettings.open('resources'));
          await page.locator('#recordMatchBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoRecorder.recording)).toBe(true);
          await page.waitForFunction(() => window.__manualEncodedBytes > 0, null, {
            timeout: 15000,
          });
          const downloading = page.waitForEvent('download');
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
          await page.locator('#recordingStopBtn').click();
          const download = await downloading;
          const filename = path.join(artifacts, 'manual-recording-download.webm');
          await download.saveAs(filename);
          assert(statSync(filename).size > 0);
          await expect
            .poll(() => page.evaluate(() => window.TronoRecorder.getSnapshot().phase))
            .toBe('idle');
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState),
            'live',
          );
          await page.evaluate(async () => {
            const recorder = window.TronoRecorder;
            recorder.dispose();
            await recorder.start();
          });
          await expect(page.locator('#recordMatchBtn')).toHaveCount(0);
          assert.equal(await page.evaluate(() => typeof window.TronoRecorder), 'undefined');
          assert.equal(
            await page.evaluate(() =>
              window.__manualCaptures.every((stream) =>
                stream.getTracks().every((track) => track.readyState === 'ended'),
              ),
            ),
            true,
          );
        },
      );

      await t.test(
        'account changes cancel pending and active captures without exporting across identities',
        async () => {
          await page.reload();
          await page.waitForFunction(() => window.TronoRecorder && window.TronoAuth?.user);
          await page.evaluate(() => {
            window.__manualDelay = true;
            window.__manualRelease = null;
            window.__downloadsAfterAccountChange = 0;
          });
          const countDownload = () => page.evaluate(() => window.__downloadsAfterAccountChange++);
          page.on('download', countDownload);
          await page.evaluate(() => window.TronoCallSettings.open('resources'));
          await page.locator('#recordMatchBtn').click();
          await expect.poll(() => page.evaluate(() => !!window.__manualRelease)).toBe(true);
          await page.evaluate(() => window.TronoAuth.logout());
          await expect
            .poll(() => page.evaluate(() => window.TronoRecorder.getSnapshot().phase))
            .toBe('idle');
          await expect(page.getByRole('dialog', { name: 'Configurações da Corte' })).toBeHidden();
          await page.evaluate(() => {
            window.__manualRelease();
            window.__manualDelay = false;
          });
          await expect
            .poll(() =>
              page.evaluate(() =>
                window.__manualCaptures.every((s) =>
                  s.getTracks().every((t) => t.readyState === 'ended'),
                ),
              ),
            )
            .toBe(true);
          await page.locator('#authEmail').fill(email);
          await page.locator('#authPassword').fill('Senha12!');
          await page.locator('#authSubmit').click();
          await expect.poll(() => page.evaluate(() => !!window.TronoAuth.user)).toBe(true);
          await page.evaluate(() => window.TronoCallSettings.open('resources'));
          await page.locator('#recordMatchBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoRecorder.getSnapshot().phase))
            .toBe('recording');
          await page.evaluate(() => window.TronoAuth.logout());
          await expect
            .poll(() => page.evaluate(() => window.TronoRecorder.getSnapshot().phase))
            .toBe('idle');
          assert(
            await page.evaluate(() =>
              window.__manualCaptures.every((s) =>
                s.getTracks().every((t) => t.readyState === 'ended'),
              ),
            ),
          );
          await page.locator('#authEmail').fill(email);
          await page.locator('#authPassword').fill('Senha12!');
          await page.locator('#authSubmit').click();
          await expect.poll(() => page.evaluate(() => !!window.TronoAuth.user)).toBe(true);
          await page.evaluate(() => {
            window.__pendingRecordingWrite = { bytes: 0, aborts: 0, closes: 0 };
            const Encoder = MediaRecorder;
            window.MediaRecorder = class extends Encoder {
              constructor(...args) {
                super(...args);
                this.addEventListener(
                  'dataavailable',
                  (e) => (window.__pendingRecordingWrite.bytes += e.data.size),
                );
              }
            };
            window.showDirectoryPicker = async () => ({
              async getDirectoryHandle() {
                return {
                  async getFileHandle() {
                    return {
                      async createWritable() {
                        return {
                          write: () =>
                            new Promise((resolve) => {
                              window.__releaseRecordingWrite = resolve;
                            }),
                          async close() {
                            window.__pendingRecordingWrite.closes++;
                          },
                          async abort() {
                            window.__pendingRecordingWrite.aborts++;
                          },
                        };
                      },
                    };
                  },
                };
              },
            });
          });
          await page.evaluate(() => window.TronoCallSettings.open('resources'));
          await page.locator('#recordMatchBtn').click();
          await page.waitForFunction(() => window.__pendingRecordingWrite.bytes > 0, null, {
            timeout: 15000,
          });
          await page.locator('#recordMatchBtn').click();
          await page.waitForFunction(() => !!window.__releaseRecordingWrite);
          await page.evaluate(() => window.TronoAuth.logout());
          await expect
            .poll(() => page.evaluate(() => window.__pendingRecordingWrite.aborts))
            .toBe(1);
          await page.evaluate(() => window.__releaseRecordingWrite());
          await expect
            .poll(() => page.evaluate(() => window.TronoRecorder.getSnapshot().phase))
            .toBe('idle');
          assert.equal(await page.evaluate(() => window.__pendingRecordingWrite.closes), 0);
          assert.equal(await page.evaluate(() => window.__downloadsAfterAccountChange), 0);
          page.removeListener('download', countDownload);
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
