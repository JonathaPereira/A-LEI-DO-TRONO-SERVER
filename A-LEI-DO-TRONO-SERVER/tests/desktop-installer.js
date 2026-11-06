'use strict';
// Exercise the real NSIS installer, including an older app that only hides
// when Windows asks its window to close. Run on the disposable Windows runner.
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { _electron, expect } = require('@playwright/test');
const { closeTestApp } = require('./desktop-test-close');
const disposableRunner =
  process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted';
function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: 'ignore' });
    const timeout = setTimeout(() => {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 10000,
      });
      reject(Error('Installer timed out: ' + path.basename(file)));
    }, 90000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(Error('Installer exit code: ' + code));
    });
  });
}
test(
  'NSIS upgrades a tray-hidden app in an apostrophe path and preserves its profile',
  {
    skip:
      process.platform !== 'win32' || !disposableRunner
        ? 'Installer acceptance requires a disposable GitHub-hosted Windows runner'
        : false,
    timeout: 230000,
  },
  async () => {
    const { version } = require('../electron/package.json');
    const installer = path.resolve(
      __dirname,
      `../artifacts/windows-app/MN-Trono-${version}-Windows.exe`,
    );
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mn-install-O'Brien-"));
    const target = path.join(root, 'MN Trono'),
      profile = path.join(root, 'profile');
    let app;
    try {
      await run(installer, ['/S', '/currentuser', '/D=' + target]);
      const executable = path.join(target, 'MN Trono.exe');
      await fs.access(executable);
      const updateConfig = await fs.readFile(path.join(target, 'resources/app-update.yml'), 'utf8');
      assert.match(updateConfig, /provider:\s*generic/);
      assert.match(updateConfig, /url:\s*https:\/\/a-lei-do-trono\.surge\.sh\/downloads\//);
      await fs.mkdir(profile, { recursive: true });
      await fs.writeFile(path.join(profile, 'preserved-account.txt'), 'remembered profile');
      app = await _electron.launch({
        executablePath: executable,
        args: ['--user-data-dir=' + profile],
        timeout: 40000,
      });
      const page = await app.firstWindow();
      await expect(page.locator('[data-entry]')).toBeVisible({ timeout: 30000 });
      const oldProcess = app.process(),
        exited = new Promise((resolve) => oldProcess.once('exit', resolve));
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        // Match the close-to-tray behavior of already installed versions.
        win.removeAllListeners('close');
        win.on('close', (event) => {
          event.preventDefault();
          win.hide();
        });
        win.close();
      });
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        false,
      );
      // --updated is the same route used by electron-updater after consent.
      await run(installer, ['/S', '--updated', '/currentuser', '/D=' + target]);
      await expect
        .poll(() => oldProcess.exitCode !== null || oldProcess.signalCode !== null, {
          timeout: 10000,
        })
        .toBe(true);
      await exited;
      app = null;
      assert.equal(
        await fs.readFile(path.join(profile, 'preserved-account.txt'), 'utf8'),
        'remembered profile',
      );
      app = await _electron.launch({
        executablePath: executable,
        args: ['--user-data-dir=' + profile],
        timeout: 40000,
      });
      const updated = await app.firstWindow();
      await expect(updated.locator('[data-entry]')).toBeVisible({ timeout: 30000 });
      assert.equal(await updated.evaluate(() => window.TronoDesktop.version), version);
    } finally {
      await closeTestApp(app);
      const uninstaller = path.join(target, 'Uninstall MN Trono.exe');
      try {
        await fs.access(uninstaller);
        await run(uninstaller, ['/S', '/currentuser']);
      } catch (error) {
        console.error('Installer test cleanup:', error.message);
      }
      await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
    }
  },
);
