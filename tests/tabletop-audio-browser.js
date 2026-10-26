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
    const origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await require('./auth-fixture').startFixture({
      port: 11958,
      appOrigin: origin,
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
      await page.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
        const Native = AudioContext;
        window.AudioContext = class extends Native {
          constructor(...args) {
            super(...args);
            this.__meter = this.createAnalyser();
            this.__meter.fftSize = 2048;
            this.__meter.connect(super.destination);
            window.__gameMeter = this.__meter;
            (window.__gameContexts ??= []).push(this);
          }
          get destination() {
            return this.__meter || super.destination;
          }
        };
        window.__NativeAudio = Native;
      }, fixture.base);
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.waitForFunction(() => window.TronoAudio && window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.waitForSelector('[data-game-audio="love-letter"]', { state: 'attached' });
      await page.getByRole('button', { name: 'Jogar como convidado' }).click();
      await page.locator('#guestNickname').fill('Teste Mesa');
      await page.getByRole('button', { name: 'Escolher um jogo', exact: true }).click();
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
      // The retained game controls and Corte settings project the same audio owner.
      await page.evaluate(() => {
        window.TronoAudio.setMusicVolume(23);
        window.TronoAudio.setMusicTrack('rock', { play: false });
        window.TronoCallSettings.open('game');
      });
      const volume = page.getByRole('slider', { name: 'Volume da música', exact: true });
      await volume.focus();
      await volume.press('End');
      await volume.press('ArrowLeft');
      await expect(volume).toHaveValue('99');
      for (const id of ['musicVolumeValue', 'lobbyMusicVolumeValue'])
        await expect(page.locator('#' + id)).toHaveText('99%');
      for (const id of ['gameScreen', 'setupScreen'])
        await expect(page.locator('#' + id + ' .track-btn[data-track=rock]')).toHaveClass(/active/);
      await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      const cleanup = await page.evaluate(async () => {
        const audio = window.TronoAudio;
        await audio.ensureAudio();
        const borrowed = new window.__NativeAudio();
        await borrowed.resume();
        const track = borrowed.createMediaStreamDestination().stream.getAudioTracks()[0];
        const openContexts = window.__gameContexts.filter((context) => context.state !== 'closed');
        await audio.dispose();
        const ownedClosed =
          openContexts.filter((context) => context.state === 'closed').length === 1;
        window.dispatchEvent(new Event('pagehide'));
        const result = {
          ownedClosed,
          borrowedState: borrowed.state,
          borrowedTrack: track.readyState,
          playerPaused: document.getElementById('bgMusic').paused,
          facadeRemoved: !window.TronoAudio,
          controlsRemoved: !document.querySelector('[data-audio-controls-root]'),
          cannotRestart: !(await audio.ensureAudio()),
        };
        track.stop();
        await borrowed.close();
        return result;
      });
      assert.deepEqual(cleanup, {
        ownedClosed: true,
        borrowedState: 'running',
        borrowedTrack: 'live',
        playerPaused: true,
        facadeRemoved: true,
        controlsRemoved: true,
        cannotRestart: true,
      });
      assert.deepEqual(errors, []);
      console.log('Actual Splendor waveform RMS ' + JSON.stringify({ high, low, mute }));
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
