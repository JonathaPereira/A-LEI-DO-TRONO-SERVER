'use strict';
const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');
const config = require('../src/lib/games/nexus-config.ts');

// Exercise the real packaged Electron partition/preload and fixed IPC boundary.
// Only the remote response is simulated; no external itch.io availability needed.
async function exerciseNexus({ app, page }) {
  await app.evaluate(async ({ session }) => {
    const game = session.fromPartition('persist:mn-nexus');
    await game.protocol.handle(
      'https',
      () =>
        new Response(
          '<!doctype html><title>Nexus fixture</title><h1>Nexus</h1><button onclick="document.documentElement.requestFullscreen()">Tela cheia</button>',
          { headers: { 'Content-Type': 'text/html' } },
        ),
    );
  });
  await page.locator('#gamesScreen [data-game=nexus]').click();
  const opened = app.waitForEvent('window');
  await page.locator('#nexusLaunch').click();
  const game = await opened;
  await game.waitForLoadState();
  await expect(game.locator('h1')).toHaveText('Nexus');
  assert.equal(game.url(), config.embedUrl || config.pageUrl);
  assert.deepEqual(
    await game.evaluate(() => [typeof window.TronoDesktop, typeof require, window.opener]),
    ['undefined', 'undefined', null],
  );
  const policy = await app.evaluate(({ BrowserWindow, session }) => {
    const windows = BrowserWindow.getAllWindows(),
      game = windows.find((w) => w.webContents.getURL().includes('itch.io'));
    const prefs = game.webContents.getLastWebPreferences();
    return {
      isolated:
        game.webContents.session === session.fromPartition('persist:mn-nexus') &&
        game.webContents.session !== session.fromPartition('persist:mn-trono'),
      node: prefs.nodeIntegration,
      sandbox: prefs.sandbox,
      contextIsolation: prefs.contextIsolation,
      preload: prefs.preload || null,
      count: windows.length,
    };
  });
  assert.deepEqual(
    { ...policy, count: undefined },
    {
      isolated: true,
      node: false,
      sandbox: true,
      contextIsolation: true,
      preload: null,
      count: undefined,
    },
  );
  await page.evaluate(() => window.TronoDesktop.openNexus());
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    policy.count,
  );
  await game.locator('button').click();
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('itch.io'))
          .isFullScreen(),
      ),
    )
    .toBe(true);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('itch.io'))
      .destroy(),
  );
  await page.locator('#nexusBack').click();
  await expect(page.locator('#gamesScreen')).toBeVisible();
  await app.evaluate(async ({ session }) =>
    session.fromPartition('persist:mn-nexus').protocol.unhandle('https'),
  );
}
module.exports = { exerciseNexus };
