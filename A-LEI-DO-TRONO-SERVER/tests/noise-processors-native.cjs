'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('@playwright/test');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'Electron prepares the typed RNNoise/light filters and retains speech with local model resources',
  { timeout: 40000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-noise-processors-'));
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
        ],
      });
      const page = await app.firstWindow();
      await page.waitForURL('https://a-lei-do-trono.surge.sh/');
      await page.waitForFunction(() => window.TronoNoise && window.TronoLightNoise);
      const speech = [...(await fs.readFile(path.resolve(__dirname, 'fixtures/speech-flite.ogg')))];
      const measurements = await page.evaluate(async (bytes) => {
        const result = {};
        for (const engine of ['rnnoise', 'light']) {
          const rate = 48000,
            prelude = engine === 'light' ? 4 : 2.5;
          const decoder = new OfflineAudioContext(1, 1, rate);
          const speech = await decoder.decodeAudioData(new Uint8Array(bytes).buffer),
            voice = speech.getChannelData(0);
          const length = Math.ceil((prelude + speech.duration + 1) * rate),
            context = new OfflineAudioContext(1, length, rate);
          const input = context.createBuffer(1, length, rate),
            samples = input.getChannelData(0);
          let seed = 7341,
            failures = 0;
          for (let frame = 0; frame < length; frame++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            samples[frame] =
              (engine === 'light' ? 0.012 : 0.02) * ((seed / 4294967296) * 2 - 1) +
              (engine === 'light' ? 0.008 : 0.025) *
                Math.sin((frame * 2 * Math.PI * (engine === 'light' ? 45 : 110)) / rate);
          }
          for (let frame = 0; frame < voice.length; frame++)
            samples[frame + Math.floor(prelude * rate)] += voice[frame];
          const factory = engine === 'light' ? window.TronoLightNoise : window.TronoNoise;
          const filter = await factory.create(context, { onFailure: () => failures++ });
          const source = context.createBufferSource();
          source.buffer = input;
          try {
            source.connect(filter.input || filter.node);
            filter.node.connect(context.destination);
            source.start();
            const output = (await context.startRendering()).getChannelData(0);
            const ratio = (from, to) => {
              let before = 0,
                after = 0;
              for (let frame = Math.floor(from * rate); frame < Math.floor(to * rate); frame++) {
                before += samples[frame] ** 2;
                after += output[frame] ** 2;
              }
              return Math.sqrt(after / before);
            };
            result[engine] = {
              finite: output.every(Number.isFinite),
              noise: ratio(0.8, prelude - 0.5),
              speech: ratio(prelude + 0.5, prelude + speech.duration - 0.3),
              failures,
            };
          } finally {
            source.disconnect();
            filter.destroy();
            filter.destroy();
          }
        }
        return result;
      }, speech);
      console.log('Electron noise processor measurements:', JSON.stringify(measurements));
      assert.equal(measurements.rnnoise.finite, true);
      assert.equal(measurements.light.finite, true);
      assert(measurements.rnnoise.noise < 0.5);
      assert(measurements.rnnoise.speech > 0.2);
      assert(measurements.light.noise < 0.6);
      assert(measurements.light.speech > 0.5);
      assert.equal(measurements.rnnoise.failures, 0);
      assert.equal(measurements.light.failures, 0);
    } finally {
      t.signal.removeEventListener('abort', abort);
      await closeTestApp(app);
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
