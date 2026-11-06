'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron, expect } = require('@playwright/test');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'native IPC PCM crosses the preload once, plays through the worklet and releases only its owned graph',
  { timeout: 40000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-application-audio-'));
    const id = 'native-audio-fixture-a',
      endedId = 'native-audio-fixture-b';
    let app;
    const abort = () => killTestApp(app);
    t.signal.addEventListener('abort', abort, { once: true });
    try {
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [
          path.resolve(__dirname, '../electron'),
          '--user-data-dir=' + directory,
          '--mute-audio',
          '--autoplay-policy=no-user-gesture-required',
        ],
      });
      const page = await app.firstWindow(),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.waitForURL('https://a-lei-do-trono.surge.sh/');
      await page.waitForFunction(() => window.TronoApplicationAudio);
      await app.evaluate(({ ipcMain }) => {
        global.__applicationAudioCredits = {};
        global.__applicationAudioAck = (_, id) => {
          global.__applicationAudioCredits[id] = (global.__applicationAudioCredits[id] || 0) + 1;
        };
        ipcMain.on('mn:application-audio-ack', global.__applicationAudioAck);
      });
      const initial = await page.evaluate(async (id) => {
        const OriginalContext = window.AudioContext;
        window.__applicationAudioContexts = [];
        window.__applicationAudioOriginalContext = OriginalContext;
        window.AudioContext = class extends OriginalContext {
          constructor(options) {
            super(options);
            window.__applicationAudioContexts.push(this);
          }
        };
        const facade = window.TronoApplicationAudio;
        window.__applicationAudioFacade = facade;
        const info = { id, sampleRate: 44100, channels: 2 };
        const pipe = await facade.create(info);
        window.__applicationAudioPipe = pipe;
        const duplicate = await facade.create(info);
        const context = new OriginalContext({ sampleRate: 44100 });
        const source = context.createMediaStreamSource(new MediaStream([pipe.track]));
        const analyser = context.createAnalyser(),
          silent = context.createGain();
        analyser.fftSize = 512;
        silent.gain.value = 0;
        source.connect(analyser);
        analyser.connect(silent);
        silent.connect(context.destination);
        await context.resume();
        window.__applicationAudioMeter = { context, source, analyser, silent };
        return {
          same: pipe === duplicate,
          contexts: window.__applicationAudioContexts.length,
          state: pipe.track.readyState,
        };
      }, id);
      assert.deepEqual(initial, { same: true, contexts: 1, state: 'live' });
      await app.evaluate(({ BrowserWindow }, id) => {
        const window = BrowserWindow.getAllWindows()[0];
        const bytes = new Uint8Array(4410 * 4),
          view = new DataView(bytes.buffer);
        for (let offset = 0; offset < bytes.length; offset += 2) view.setInt16(offset, 8192, true);
        for (let packet = 0; packet < 12; packet++)
          window.webContents.send('mn:application-audio', { type: 'chunk', id, bytes });
        window.webContents.send('mn:application-audio', {
          type: 'chunk',
          id,
          bytes: new Uint8Array(3),
        });
      }, id);
      await expect
        .poll(() => app.evaluate((_, id) => global.__applicationAudioCredits[id] || 0, id))
        .toBe(13);
      let measured = 0;
      await expect
        .poll(
          async () => {
            measured = await page.evaluate(() => {
              const analyser = window.__applicationAudioMeter.analyser,
                samples = new Float32Array(analyser.fftSize);
              analyser.getFloatTimeDomainData(samples);
              return Math.sqrt(
                samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
              );
            });
            return measured;
          },
          { timeout: 10000 },
        )
        .toBeGreaterThan(0.2);
      assert(measured < 0.3);
      const closed = await page.evaluate(async () => {
        const pipe = window.__applicationAudioPipe;
        pipe.track.stop();
        await pipe.close();
        await pipe.close();
        return {
          track: pipe.track.readyState,
          owned: window.__applicationAudioContexts[0].state,
          borrowed: window.__applicationAudioMeter.context.state,
        };
      });
      assert.deepEqual(closed, { track: 'ended', owned: 'closed', borrowed: 'running' });
      await page.evaluate(async (id) => {
        window.__applicationAudioEnded = 0;
        window.__applicationAudioEndListener = () => window.__applicationAudioEnded++;
        window.addEventListener(
          'trono-application-audio-ended',
          window.__applicationAudioEndListener,
        );
        window.__applicationAudioSecond = await window.TronoApplicationAudio.create({
          id,
          sampleRate: 44100,
          channels: 2,
        });
      }, endedId);
      await app.evaluate(({ BrowserWindow }, id) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.webContents.send('mn:application-audio', { type: 'ended', id });
        window.webContents.send('mn:application-audio', { type: 'ended', id });
      }, endedId);
      await expect
        .poll(() => page.evaluate(() => window.__applicationAudioSecond.track.readyState))
        .toBe('ended');
      assert.equal(await page.evaluate(() => window.__applicationAudioEnded), 1);
      await page.evaluate(async () => {
        await window.__applicationAudioSecond.close();
        const meter = window.__applicationAudioMeter;
        meter.source.disconnect();
        meter.analyser.disconnect();
        meter.silent.disconnect();
        await meter.context.close();
        window.removeEventListener(
          'trono-application-audio-ended',
          window.__applicationAudioEndListener,
        );
        window.AudioContext = window.__applicationAudioOriginalContext;
        window.dispatchEvent(new Event('pagehide'));
      });
      assert.equal(await page.evaluate(() => typeof window.TronoApplicationAudio), 'undefined');
      assert.equal(
        await page.evaluate(async () => {
          try {
            await window.__applicationAudioFacade.create({ id: 'late', sampleRate: 44100 });
            return 'accepted';
          } catch (error) {
            return error.name;
          }
        }),
        'AbortError',
      );
      await app.evaluate(
        ({ BrowserWindow }, id) =>
          BrowserWindow.getAllWindows()[0].webContents.send('mn:application-audio', {
            type: 'chunk',
            id,
            bytes: new Uint8Array(4),
          }),
        id,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(await app.evaluate((_, id) => global.__applicationAudioCredits[id], id), 13);
      assert.deepEqual(errors, []);
      console.log('Application PCM RMS:', measured);
    } finally {
      t.signal.removeEventListener('abort', abort);
      await app
        ?.evaluate(({ ipcMain }) => {
          if (global.__applicationAudioAck)
            ipcMain.removeListener('mn:application-audio-ack', global.__applicationAudioAck);
          delete global.__applicationAudioAck;
          delete global.__applicationAudioCredits;
        })
        .catch(() => {});
      await closeTestApp(app);
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
