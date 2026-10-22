'use strict';

const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('@playwright/test');
const { exerciseNativeActivity } = require('./desktop-activity-flow.cjs');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'development Electron detects and clears an opted-in native game without exposing its process metadata',
  {
    timeout: 45000,
    skip: process.platform !== 'win32' && 'Windows native activity',
  },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-activity-native-'));
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
      await page.waitForFunction(() => window.TronoDesktop);
      await exerciseNativeActivity(page);
    } finally {
      t.signal.removeEventListener('abort', abort);
      await closeTestApp(app);
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
