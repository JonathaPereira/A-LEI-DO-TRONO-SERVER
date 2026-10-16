'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { _electron, expect } = require('@playwright/test'),
  { GameAssets } = require('../electron/game-assets.cjs'),
  { closeTestApp, killTestApp } = require('./desktop-test-close');
test(
  'native Electron opens the local roguelite frame with prepared media',
  { timeout: 90000 },
  async (t) => {
    if (process.platform !== 'win32') return t.skip('Windows Electron integration');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-cinzas-native-')),
      manifest = JSON.parse(
        await fs.readFile(
          path.resolve(__dirname, '../public/roguelite/asset-manifest.json'),
          'utf8',
        ),
      );
    let app,
      page,
      phase = 'prepare cache';
    const diagnostics = [];
    const watchdog = setTimeout(() => {
      console.error(
        'Native watchdog ' +
          JSON.stringify({
            phase,
            frames: page?.frames().map((f) => f.url()),
            diagnostics: diagnostics.slice(-15),
          }),
      );
      killTestApp(app);
      process.exit(1);
    }, 85000);
    try {
      const cache = new GameAssets({
        manifest,
        directory: path.join(directory, 'game-assets'),
        origin: 'https://a-lei-do-trono.surge.sh',
        fetchAsset: async (url) =>
          new Response(
            await fs.readFile(path.resolve(__dirname, '../out', new URL(url).pathname.slice(1))),
          ),
      });
      await Promise.all(manifest.files.map((f) => cache.read(f.path)));
      phase = 'launch Electron';
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: ['--user-data-dir=' + directory, path.resolve(__dirname, '../electron')],
        timeout: 20000,
      });
      page = await app.firstWindow();
      page.on('console', (m) => {
        if (m.type() === 'error' || /frame|Refused|Content Security|Native bridge/i.test(m.text()))
          diagnostics.push(m.text().slice(0, 600));
      });
      page.on('pageerror', (e) => diagnostics.push(e.message));
      page.on('requestfailed', (r) => {
        if (r.url().includes('/roguelite/'))
          diagnostics.push('request failed ' + r.url() + ' ' + r.failure()?.errorText);
      });
      phase = 'desktop rail';
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await expect(page.locator('#desktopRail')).toBeVisible({ timeout: 30000 });
      phase = 'auth ready';
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      phase = 'close auth';
      if (await page.locator('#authDialog').isVisible())
        await page.locator('#authCloseBtn').click();
      phase = 'prepare layouts';
      await page.evaluate(() => {
        window.addEventListener('message', (e) => {
          if (e.data?.type?.includes('cinzas'))
            console.log(
              'Native bridge ' +
                JSON.stringify({
                  origin: e.origin,
                  type: e.data.type,
                  source: e.source === document.querySelector('#rogueliteFrame')?.contentWindow,
                }),
            );
        });
        window.TronoAppLayout.apply('discord');
        window.TronoAppLayout.apply('original');
        window.TronoGames.openLibrary();
      });
      phase = 'open game';
      await page.locator('#playRoguelite').click();
      phase = 'child start button';
      await expect(page.frameLocator('#rogueliteFrame').locator('#startBtn')).toBeVisible({
        timeout: 10000,
      });
      assert.equal(
        await page
          .frameLocator('#rogueliteFrame')
          .locator('body')
          .evaluate(() => typeof window.TronoDesktop),
        'undefined',
      );
      phase = 'native Splendor session';
      await require('./desktop-splendor-flow').exerciseSplendor({
        app,
        page,
        frontend: path.resolve(__dirname, '../out'),
        onPhase: (label) => { phase = label; console.log('Native session ' + label); },
      });
    } catch (error) {
      const state = page
        ? await Promise.race([
            page
              .evaluate(() => {
                const f = document.querySelector('#rogueliteFrame');
                return {
                  base: document.baseURI,
                  frame: f?.outerHTML,
                  status: document.querySelector('#rogueliteLoadStatus')?.textContent,
                  child: f?.contentDocument
                    ? {
                        url: f.contentDocument.URL,
                        origin: f.contentWindow.location.origin,
                        parent: f.contentWindow.parent === window,
                        ready: f.contentDocument.readyState,
                        body: f.contentDocument.body?.innerText.slice(0, 400),
                        start: !!f.contentDocument.querySelector('#startBtn'),
                        scripts: [...f.contentDocument.scripts].map((n) => n.src),
                        globals: {
                          engine: typeof f.contentWindow.Abyss,
                          renderer: typeof f.contentWindow.AbyssRenderer,
                          desktop: typeof f.contentWindow.TronoDesktop,
                          embedded: f.contentDocument.documentElement.className,
                          quality: f.contentDocument.querySelector('#quality')?.value,
                        },
                        htmlEnd: f.contentDocument.documentElement.outerHTML.slice(-250),
                      }
                    : null,
                };
              })
              .catch((e) => ({ error: e.message })),
            new Promise((r) =>
              setTimeout(() => r({ renderer: 'did not answer in 2 seconds' }), 2000),
            ),
          ])
        : {};
      console.error('Native document state ' + JSON.stringify(state));
      let paused = null;
      if (state.renderer && page) {
        try {
          const cdp = await app.context().newCDPSession(page);
          await cdp.send('Debugger.enable');
          const event = new Promise((r) => {
            cdp.once('Debugger.paused', r);
            setTimeout(() => r(null), 2000);
          });
          await cdp.send('Debugger.pause');
          const data = await event;
          console.error(
            'Native paused stack ' +
              JSON.stringify(
                data?.callFrames.map((f) => ({
                  name: f.functionName,
                  line: f.location.lineNumber,
                })),
              ),
          );
          paused = {
            stack: data?.callFrames
              .slice(0, 8)
              .map((f) => ({ name: f.functionName, url: f.url, line: f.location.lineNumber })),
          };
          if (data?.callFrames[0]) {
            const at = data.callFrames[0].location;
            const source = await cdp.send('Debugger.getScriptSource', { scriptId: at.scriptId });
            paused.source = source.scriptSource
              .split('\n')
              .slice(Math.max(0, at.lineNumber - 3), at.lineNumber + 4)
              .join('\n');
            const result = await cdp.send('Debugger.evaluateOnCallFrame', {
              callFrameId: data.callFrames[0].callFrameId,
              expression:
                'JSON.stringify({url:location.href,origin:location.origin,start:!!document.querySelector("#startBtn"),quality:document.querySelector("#quality")?.value,embedded:document.documentElement.className,parentLoading:window.parent.document.querySelector("#rogueliteLoading")?.hidden,hostVisible:typeof hostVisible==="undefined"?null:hostVisible})',
              returnByValue: true,
            });
            paused.document = result.result.value || result.exceptionDetails;
          }
          await cdp.send('Debugger.resume');
          await cdp.detach();
        } catch (e) {
          paused = e.message;
        }
      }
      throw new Error(
        'Native roguelite diagnostics ' +
          JSON.stringify({
            phase,
            state,
            paused,
            frames: page?.frames().map((f) => f.url()),
            console: diagnostics.slice(-12),
          }) +
          '\n' +
          error.message,
      );
    } finally {
      clearTimeout(watchdog);
      await closeTestApp(app);
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
);
