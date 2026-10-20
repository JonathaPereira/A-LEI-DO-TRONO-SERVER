'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  express = require('express'),
  { chromium, expect } = require('@playwright/test');
test(
  'real game audio has independent saved gains; mute renders silence and Splendor volume changes the actual waveform',
  { timeout: 60000 },
  async () => {
    const server = await new Promise((r) => {
      const s = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => r(s));
    });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
      });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (r) =>
        new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
      );
      await page.addInitScript(() => {
        localStorage.setItem('tronoMusicEnabled', '0');
        const Native = AudioContext;
        window.AudioContext = class extends Native {
          constructor(...args) {
            super(...args);
            this.__meter = this.createAnalyser();
            this.__meter.fftSize = 2048;
            this.__meter.connect(super.destination);
            window.__gameMeter = this.__meter;
          }
          get destination() {
            return this.__meter || super.destination;
          }
        };
      });
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.waitForFunction(() => window.TronoAudio && window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.waitForSelector('[data-game-audio="love-letter"]', { state: 'attached' });
      await page.locator('#authCloseBtn').click();
      await require('./tabletop-audio-controls.cjs').exerciseTabletopAudio(page);
      await page.evaluate(async () => {
        window.TronoAudio.setSfxEnabled(true);
        await window.TronoAudio.ensureAudio();
      });
      const measure = async (value) =>
        page.evaluate(async (value) => {
          window.TronoAudio.setGameVolume('splendor', value);
          await new Promise((r) => setTimeout(r, 450));
          window.TronoAudio.playSfx('splendor-card');
          const data = new Float32Array(window.__gameMeter.fftSize);
          let peak = 0;
          const until = performance.now() + 400;
          while (performance.now() < until) {
            window.__gameMeter.getFloatTimeDomainData(data);
            peak = Math.max(peak, Math.sqrt(data.reduce((n, v) => n + v * v, 0) / data.length));
            await new Promise((r) => requestAnimationFrame(r));
          }
          return peak;
        }, value);
      const high = await measure(100),
        low = await measure(20),
        mute = await measure(0);
      assert(high > 0.001, JSON.stringify({ high, low, mute }));
      assert(high > low * 2, JSON.stringify({ high, low, mute }));
      assert(mute < low * 0.05, JSON.stringify({ high, low, mute }));
      const state = await page.evaluate(() => {
        for (const [key, v] of [
          ['throne', 13],
          ['azul', 24],
          ['splendor', 35],
          ['love-letter', 46],
        ])
          window.TronoAudio.setGameVolume(key, v);
        return Object.fromEntries(
          ['throne', 'azul', 'splendor', 'love-letter'].map((k) => [
            k,
            window.TronoAudio.gameVolume(k),
          ]),
        );
      });
      assert.deepEqual(state, { throne: 13, azul: 24, splendor: 35, 'love-letter': 46 });
      await page.reload();
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      for (const [key, value] of Object.entries(state)) {
        await expect(page.locator(`[data-game-audio="${key}"] input`)).toHaveValue(String(value));
      }
      assert.deepEqual(
        await page.evaluate(() =>
          Object.fromEntries(
            ['throne', 'azul', 'splendor', 'love-letter'].map((k) => [
              k,
              window.TronoAudio.gameVolume(k),
            ]),
          ),
        ),
        state,
      );
      assert.deepEqual(errors, []);
      console.log('Actual Splendor waveform RMS ' + JSON.stringify({ high, low, mute }));
    } finally {
      await browser?.close();
      await new Promise((r) => server.close(r));
    }
  },
);
