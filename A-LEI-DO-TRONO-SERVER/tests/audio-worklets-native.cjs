'use strict';

const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('@playwright/test');
const { exerciseAudioWorklets } = require('./audio-worklets-flow.cjs');
const { killTestApp, closeTestApp } = require('./desktop-test-close');

test(
  'Electron loads the generated worklets under its real content policy and renders the same PCM',
  { timeout: 40000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-worklets-native-'));
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
      console.log(
        'Electron worklet measurements:',
        JSON.stringify(await exerciseAudioWorklets(page)),
      );
    } finally {
      t.signal.removeEventListener('abort', abort);
      await closeTestApp(app);
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
