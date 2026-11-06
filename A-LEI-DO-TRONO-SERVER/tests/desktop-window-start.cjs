'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { _electron, expect } = require('@playwright/test');
const { firstSizedWindow } = require('./desktop-first-window.cjs');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'desktop sizing waits for the first BrowserWindow to be created',
  { timeout: 30000, skip: process.platform !== 'win32' && 'Windows desktop regression' },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-window-start-'));
    let app,
      finished = false;
    t.signal.addEventListener(
      'abort',
      () => {
        if (!finished) killTestApp(app);
      },
      { once: true },
    );
    try {
      const entry = path.join(directory, 'main.cjs');
      await fs.writeFile(
        entry,
        `const {app,BrowserWindow}=require('electron');
      app.setName('MN Trono Window QA');
      app.whenReady().then(()=>{
        globalThis.createWindow=()=>{
          const window=new BrowserWindow({show:false,width:640,height:480});
          void window.loadURL('data:text/html,<title>Window startup QA</title>');
        };
      });`,
      );
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [entry, '--user-data-dir=' + path.join(directory, 'profile')],
      });
      await expect.poll(() => app.evaluate(() => typeof globalThis.createWindow)).toBe('function');
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        0,
      );
      const pending = firstSizedWindow(app, { width: 1024, height: 740 });
      // Attach rejection immediately; the test controls the real creation event.
      const result = pending.then(
        (page) => ({ page }),
        (error) => ({ error }),
      );
      await app.evaluate(() => globalThis.createWindow());
      await (await app.firstWindow()).waitForLoadState();
      const opened = await result;
      if (opened.error) throw opened.error;
      assert(opened.page);
      const window = await app.browserWindow(opened.page);
      try {
        assert.deepEqual(await window.evaluate((window) => window.getContentSize()), [1024, 740]);
      } finally {
        await window.dispose();
      }
    } finally {
      finished = true;
      await closeTestApp(app);
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
