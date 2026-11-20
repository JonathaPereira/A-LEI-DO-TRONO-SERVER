'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { expect } = require('@playwright/test');
const { idFor } = require('../electron/activity.cjs');

async function exerciseNativeActivity(page) {
  assert.equal((await page.evaluate(() => window.TronoDesktop.getActivityState())).enabled, false);
  if (process.platform !== 'win32') return;
  const executable = path.resolve(
    __dirname,
    '../artifacts/native-audio/Release/MN-Application-Audio.exe',
  );
  const child = spawn(executable, ['--test-activity-window'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => {
    errors = (errors + chunk.toString()).slice(-2048);
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error('Activity window did not open: ' + errors)),
        10000,
      );
      const finish = (error) => {
        clearTimeout(timer);
        error ? reject(error) : resolve();
      };
      child.once('error', finish);
      child.stdout.once('data', () => finish());
      child.once('exit', (code) => finish(Error('Activity window exited: ' + code + ' ' + errors)));
    });
    const id = idFor(executable);
    assert.equal(
      (await page.evaluate(() => window.TronoDesktop.getActivityState())).available,
      true,
    );
    await expect
      .poll(
        async () => {
          await page.evaluate(() => window.TronoDesktop.configureActivity({ enabled: true }));
          return page.evaluate(
            (id) =>
              window.TronoDesktop.getActivityState().then((state) =>
                state.apps.some((app) => app.id === id),
              ),
            id,
          );
        },
        { timeout: 25000, message: 'Native activity must detect the visible fixture executable' },
      )
      .toBe(true);
    const snapshot = await page.evaluate(() => window.TronoDesktop.getActivityState());
    assert(!JSON.stringify(snapshot).includes('Private caption'));
    assert(snapshot.apps.every((row) => !Object.hasOwn(row, 'path') && !Object.hasOwn(row, 'pid')));
    await page.evaluate(
      (id) =>
        window.TronoDesktop.configureActivity({
          enabled: true,
          preferredAppId: id,
          name: 'Fixture Game',
        }),
      id,
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.TronoDesktop.getActivityState().then((state) => state.game?.name),
        ),
      )
      .toBe('Fixture Game');
    await page.evaluate(() => window.TronoDesktop.configureActivity({ enabled: false }));
    assert.equal((await page.evaluate(() => window.TronoDesktop.getActivityState())).game, null);
  } finally {
    child.kill();
    await page
      .evaluate(() => window.TronoDesktop.configureActivity({ enabled: false }))
      .catch(() => {});
  }
}

module.exports = { exerciseNativeActivity };
