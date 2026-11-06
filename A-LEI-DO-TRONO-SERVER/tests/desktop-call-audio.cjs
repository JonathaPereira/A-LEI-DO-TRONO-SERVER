'use strict';
const { installVoiceTestModules } = require('./voice-test-modules.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'real Electron plays native alert PCM and releases its graph without closing the microphone context',
  {
    timeout: 60000,
    skip: process.platform !== 'win32' && 'Windows desktop regression',
  },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-call-audio-'));
    const origin = 'https://a-lei-do-trono.surge.sh';
    let app,
      fixture,
      finished = false;
    t.signal.addEventListener(
      'abort',
      () => {
        if (!finished) killTestApp(app);
      },
      { once: true },
    );
    try {
      fixture = await startFixture({ port: 11987, allowedOrigins: [origin] });
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [
          path.resolve('electron'),
          '--user-data-dir=' + directory,
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
        timeout: 30000,
      });
      const page = await app.firstWindow(),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://a-lei-do-trono-server.onrender.com/**', (route) => route.abort());
      await page.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('tronoSfxEnabled', '0');
      }, fixture.base);
      await page.waitForURL(origin + '/');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.TronoSocial);
      await installVoiceTestModules(page, [
        'createCallAudio',
        'createCallAlerts',
        'createAudioPreferences',
      ]);
      await page.evaluate(() => {
        const events = new EventTarget(),
          settings = { joined: true, generation: 1, output: '', visible: true };
        let alertsContext, microphoneContext, analyzer;
        const gains = [],
          oscillators = [];
        const alerts = window.__voiceTestModules.createCallAlerts({
          storage: { getItem: () => null, setItem() {} },
          getSettings: () => ({ enabled: true, muted: false, output: '' }),
          createContext() {
            const ctx = new AudioContext();
            alertsContext = ctx;
            analyzer = ctx.createAnalyser();
            analyzer.fftSize = 2048;
            const createGain = ctx.createGain.bind(ctx),
              createOscillator = ctx.createOscillator.bind(ctx);
            ctx.createGain = () => {
              const gain = createGain();
              gain.connect(analyzer);
              const disconnect = gain.disconnect.bind(gain),
                row = { disconnected: false };
              gain.disconnect = (...args) => {
                row.disconnected = true;
                return disconnect(...args);
              };
              gains.push(row);
              return gain;
            };
            ctx.createOscillator = () => {
              const oscillator = createOscillator();
              oscillators.push(oscillator);
              return oscillator;
            };
            return ctx;
          },
        });
        const audio = window.__voiceTestModules.createCallAudio({
          desktop: true,
          getSettings: () => settings,
          createContext: (options) => {
            microphoneContext = new AudioContext(options);
            return microphoneContext;
          },
          playback: { unlock() {}, refresh() {} },
          alerts,
          refreshMicrophone: async () => {},
          documentEvents: events,
          onChange() {},
        });
        const preferences = window.__voiceTestModules.createAudioPreferences({
          audio: () => ({
            sfxEnabled: true,
            musicEnabled: false,
            musicVolume: 32,
            currentTrack: 'lofi',
            musicStatus: '',
          }),
          tracks: () => ({}),
          alerts,
          protection: { getSnapshot: () => ({ enabled: true }) },
          events,
          storage: { setItem() {} },
        });
        preferences.start();
        audio.start();
        events.dispatchEvent(new Event('pointerdown'));
        window.__callAudioProbe = {
          audio,
          alerts,
          preferences,
          gains,
          oscillators,
          pcm() {
            const samples = new Float32Array(analyzer.fftSize);
            analyzer.getFloatTimeDomainData(samples);
            return {
              finite: samples.every(Number.isFinite),
              rms: Math.sqrt(
                samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
              ),
            };
          },
          contexts: () => ({ microphone: microphoneContext.state, alerts: alertsContext.state }),
          close() {
            preferences.dispose();
            analyzer.disconnect();
            alerts.dispose();
            audio.dispose();
          },
        };
      });
      await expect
        .poll(() => page.evaluate(() => window.__callAudioProbe.contexts()))
        .toEqual({ microphone: 'running', alerts: 'running' });
      await page.evaluate(() => {
        window.__callAudioProbe.preferences.setAlertVolume(45);
        window.__callAudioProbe.preferences.testAlert();
      });
      assert.equal(
        await page.evaluate(() => window.__callAudioProbe.alerts.getSnapshot().volume),
        45,
      );
      await expect
        .poll(() => page.evaluate(() => window.__callAudioProbe.pcm().rms), {
          intervals: [20, 40, 60],
          timeout: 2000,
        })
        .toBeGreaterThan(0.001);
      assert.equal(await page.evaluate(() => window.__callAudioProbe.pcm().finite), true);
      await expect
        .poll(() => page.evaluate(() => window.__callAudioProbe.gains.every((g) => g.disconnected)))
        .toBe(true);
      assert.equal(await page.evaluate(() => window.__callAudioProbe.oscillators.length), 3);
      await page.evaluate(() => window.__callAudioProbe.preferences.dispose());
      assert.deepEqual(await page.evaluate(() => window.__callAudioProbe.contexts()), {
        microphone: 'running',
        alerts: 'running',
      });
      await page.evaluate(() => window.__callAudioProbe.alerts.dispose());
      await expect
        .poll(() => page.evaluate(() => window.__callAudioProbe.contexts()))
        .toEqual({ microphone: 'running', alerts: 'closed' });
      await page.evaluate(() => window.__callAudioProbe.close());
      await expect
        .poll(() => page.evaluate(() => window.__callAudioProbe.contexts().microphone))
        .toBe('closed');
      assert.deepEqual(errors, []);
    } finally {
      finished = true;
      if (app) await closeTestApp(app);
      if (fixture) await fixture.stop();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
