'use strict';
// Launch the binary produced by electron-builder, with its installed resource
// paths. This catches missing bundled files that development-mode tests cannot.
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  os = require('node:os');
const { _electron, expect } = require('@playwright/test');
const { killTestApp, closeTestApp } = require('./desktop-test-close');
test(
  'compiled Windows app starts with its own game, interface and RNNoise resources',
  { timeout: 130000 },
  async (t) => {
    const executable = path.resolve(
      __dirname,
      '../artifacts/windows-app/win-unpacked/MN Trono.exe',
    );
    await fs.access(executable);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-packaged-'));
    let app,
      page,
      guestFixture,
      finished = false,
      phase = 'launch';
    const diagnostics = [];
    const watchdog = setTimeout(() => {
      console.error('Packaged desktop stalled at: ' + phase);
      killTestApp(app);
      process.exit(1);
    }, 145000);
    watchdog.unref();
    t.signal.addEventListener(
      'abort',
      () => {
        if (!finished) {
          console.error('Packaged desktop stalled at: ' + phase);
          killTestApp(app);
        }
      },
      { once: true },
    );
    try {
      // Simulate a completed first download, then launch the actual installer
      // offline with its own manifest and verified persistent media cache.
      const { GameAssets } = require('../electron/game-assets.cjs'),
        manifest = JSON.parse(
          await fs.readFile(
            path.resolve(__dirname, '../public/roguelite/asset-manifest.json'),
            'utf8',
          ),
        );
      const cache = new GameAssets({
        manifest,
        directory: path.join(directory, 'game-assets'),
        origin: 'https://a-lei-do-trono.surge.sh',
        fetchAsset: async (url) =>
          new Response(
            await fs.readFile(path.resolve(__dirname, '../out', new URL(url).pathname.slice(1))),
          ),
      });
      await Promise.all(manifest.files.map((file) => cache.read(file.path)));
      app = await _electron.launch({
        executablePath: executable,
        // Resource/UI acceptance does not depend on a physical playback endpoint.
        // Native process-loopback audio has its own unmuted regression.
        args: [
          '--user-data-dir=' + directory,
          '--mute-audio',
          '--proxy-server=127.0.0.1:9',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
        ],
        timeout: 40000,
      });
      assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
      await app.evaluate(({ net }) => {
        global.__cinzasRemoteDownloads = 0;
        const original = net.fetch.bind(net);
        net.fetch = (input, options) => {
          if (
            typeof input === 'string' &&
            input.startsWith('https://a-lei-do-trono.surge.sh/roguelite/assets/')
          )
            global.__cinzasRemoteDownloads++;
          return original(input, options);
        };
      });
      const resourceRoot = await app.evaluate(() => process.resourcesPath);
      const updateConfig = await fs.readFile(path.join(resourceRoot, 'app-update.yml'), 'utf8');
      assert.match(updateConfig, /provider:\s*generic/);
      assert.match(updateConfig, /url:\s*https:\/\/a-lei-do-trono\.surge\.sh\/downloads\//);
      await assert.rejects(
        fs.access(path.join(resourceRoot, 'renderer/roguelite/assets/catalogue-cover.png')),
      );
      await assert.rejects(
        fs.access(
          path.join(resourceRoot, 'renderer/manual/A_Lei_do_Trono_Manual_v0.4_Edicao_Visual.pdf'),
        ),
      );
      await fs.access(path.join(resourceRoot, 'renderer/manual/A_Lei_do_Trono_Manual_v0.9.0.pdf'));
      await fs.access(path.join(resourceRoot, 'native/MN-Remote-Input.exe'));
      phase = 'installed interface';
      page = await app.firstWindow();
      page.setDefaultTimeout(15000);
      page.on('console', (m) => {
        if (m.type() === 'error' || /Native bridge|Refused|Content Security/i.test(m.text()))
          diagnostics.push(m.text().slice(0, 600));
      });
      page.on('pageerror', (e) => diagnostics.push(e.message));
      page.on('requestfailed', (request) => {
        if (request.url().startsWith('https://a-lei-do-trono.surge.sh/'))
          diagnostics.push(request.url() + ' ' + request.failure()?.errorText);
      });
      await expect(page.locator('[data-entry]')).toBeVisible({ timeout: 30000 });
      assert.equal(page.url(), 'https://a-lei-do-trono.surge.sh/');
      assert.equal(await page.evaluate(() => typeof require), 'undefined');
      assert.equal(
        await page.evaluate(() => window.TronoDesktop.version),
        require('../electron/package.json').version,
      );
      assert.equal(
        await app.evaluate(({ app }) => app.getVersion()),
        require('../electron/package.json').version,
      );
      await expect(page.locator('meta[name="mn-desktop-version"]')).toHaveAttribute(
        'content',
        require('../electron/package.json').version,
      );
      assert.equal((await page.evaluate(() => window.TronoDesktop.remoteCapability())).host, true);
      const geometry = await app.evaluate(({ BrowserWindow, screen }) => ({
        window: BrowserWindow.getAllWindows()[0].getBounds(),
        work: screen.getPrimaryDisplay().workAreaSize,
      }));
      if (geometry.work.width >= 480) assert(geometry.window.width <= geometry.work.width);
      if (geometry.work.height >= 520) assert(geometry.window.height <= geometry.work.height);
      phase = 'installed resources';
      const stylesheets = await page
        .locator('link[rel=stylesheet]')
        .evaluateAll((links) => links.map((link) => new URL(link.href).pathname));
      assert(stylesheets.length > 0, 'The packaged page must load its compiled CSS');
      assert(
        stylesheets.every((url) => url.startsWith('/_next/') && url.endsWith('.css')),
        JSON.stringify(stylesheets),
      );
      const resources = await page.evaluate(
        async (staticAssets) =>
          Promise.all(
            [
              ...staticAssets,
              '/light-noise-worklet.js',
              '/assets/love-letter/characters.webp',
              '/assets/love-letter/table.webp',
              '/assets/games/throne-cover.webp',
              '/assets/games/splendor-cover.webp',
              '/assets/games/nexus-cover.webp',
              '/assets/games/atalaia-cover.jpg',
              '/assets/splendor/developments.webp',
              '/assets/splendor/nobles.webp',
              '/assets/ticket-to-ride/board-usa.jpg',
              '/assets/ticket-to-ride/train-cards.webp',
              '/assets/ticket-to-ride/train-back.webp',
              '/assets/ticket-to-ride/destination-back.webp',
              '/assets/ticket-to-ride/wagons.webp',
              '/roguelite/asset-manifest.json',
              '/roguelite/core.js',
              '/roguelite/game.js',
              '/assets/azul/tiles-and-factories.png',
              '/assets/azul/mural.png',
              '/assets/azul/box-cover.webp',
              '/assets/azul/wood-table.png',
              '/manual/index.html',
              '/manual/manual.css',
              '/manual/throne.svg',
              '/manual/A_Lei_do_Trono_Manual_v0.9.0.pdf',
              '/assets/laws/ordem.svg',
              '/assets/portal_realms.png',
              '/vendor/rnnoise/rnnoise.wasm',
              '/application-audio-worklet.js',
            ]
              .concat(
                [...document.querySelectorAll('link[rel=stylesheet]')].map(
                  (link) => new URL(link.href).pathname,
                ),
              )
              .map(async (url) => {
                const response = await fetch(url);
                return {
                  url,
                  status: response.status,
                  bytes: (await response.arrayBuffer()).byteLength,
                };
              }),
          ),
        ['/auth-boot.js'],
      );
      for (const resource of resources) {
        assert.equal(resource.status, 200, resource.url);
        assert(resource.bytes > 0, resource.url);
      }
      phase = 'local guest initialization';
      guestFixture = await require('./desktop-guest-fixture.cjs').enterNativeGuest({
        app,
        page,
        port: 10846,
      });
      assert.equal(await page.evaluate(() => typeof window.TronoClips), 'undefined');
      await page.evaluate(() => window.TronoCallSettings.open('capture'));
      await expect(page.getByRole('dialog', { name: 'Voz e vídeo', exact: true })).toBeVisible();
      await expect(page.locator('#screenFormatSelect')).toBeVisible();
      await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      await expect(page.locator('#gamesScreen')).toBeVisible();
      phase = 'installed Corte sidebar';
      await expect(
        page.getByRole('complementary', { name: 'Canais e conversas', exact: true }),
      ).toBeVisible();
      await expect(page.locator('[name=appLayout]')).toHaveCount(0);
      const panelBounds = await page
        .getByRole('complementary', { name: 'Canais e conversas', exact: true })
        .boundingBox();
      assert(panelBounds.x < 100 && panelBounds.width < 350);
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/windows-corte-sidebar.png'),
      });
      phase = 'installed games';
      assert.equal(await page.evaluate(() => window.TicketToRideData.routes.length), 100);
      assert.equal(
        await page.evaluate(
          () =>
            window.TicketToRideRules.create([
              { id: 'a', name: 'A' },
              { id: 'b', name: 'B' },
            ]).players[0].trains,
        ),
        45,
      );
      await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
      await expect(page.locator('#gamesScreen')).toBeVisible();
      await expect(page.locator('#gamesScreen button[data-game]')).toHaveCount(9);
      for (const game of ['throne', 'roguelite']) {
        phase = 'installed catalogue artwork ' + game;
        const artwork = page.locator('#gamesScreen [data-game=' + game + '] img');
        // Covers load lazily. With members visible, later rows can be below
        // the scroll viewport; bring the actual card into view before loading.
        await artwork.scrollIntoViewIfNeeded();
        await expect.poll(() => artwork.evaluate((n) => n.complete && n.naturalWidth > 0)).toBe(true);
      }
      phase = 'installed games';
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/windows-games-catalogue.png'),
      });
      await page.locator('#gamesScreen [data-game=azul]').click();
      await expect(page.locator('#azulScreen')).toBeVisible();
      // Account-only games still request authentication for a local guest.
      assert(await page.evaluate(() => !!window.TronoAuth.guest));
      await expect(page.getByRole('dialog', { name: 'Acesso à conta', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Fechar acesso à conta', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Acesso à conta', exact: true })).toBeHidden();
      await expect(page.locator('#azulTurnStatus')).toHaveText('Escolha sua mesa');
      await page.locator('#azulRulesButton').click();
      await expect(page.locator('#azulRulesDialog')).toBeVisible();
      await page.locator('#azulRulesClose').click();
      assert.deepEqual(
        await page.evaluate(() => [
          typeof window.AzulRules,
          typeof window.AzulPresentation,
          typeof window.TronoTicketToRide?.open,
        ]),
        ['undefined', 'undefined', 'function'],
      );
      await page.locator('#azulBack').click();
      phase = 'installed Nexus isolation';
      await require('./desktop-nexus-flow').exerciseNexus({ app, page });
      phase = 'installed Atalaia export';
      await require('./desktop-atalaia-flow.cjs').exerciseAtalaia({ app, page });
      phase = 'installed roguelite preparation';
      await page.evaluate(() =>
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
        }),
      );
      await page.locator('#gamesScreen [data-game=roguelite]').click();
      const cinzas = page.frameLocator('#rogueliteFrame');
      await expect(cinzas.locator('#startBtn')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('#rogueliteLoading')).toBeHidden();
      assert.equal(
        await cinzas.locator('body').evaluate(() => typeof window.TronoDesktop),
        'undefined',
      );
      phase = 'installed roguelite start';
      await cinzas.locator('#startBtn').click();
      phase = 'installed roguelite card choices';
      await expect(cinzas.locator('#upgradeCards button')).toHaveCount(3);
      await cinzas.locator('#upgradeCards button').first().click();
      phase = 'installed roguelite HUD';
      await expect(cinzas.locator('#hud')).toBeVisible();
      phase = 'installed roguelite screenshot';
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/windows-cinzas-installed.png'),
      });
      assert.equal(
        await app.evaluate(() => global.__cinzasRemoteDownloads),
        0,
        'Prepared game works without network downloads',
      );
      phase = 'installed roguelite leave';
      await page.locator('#rogueliteBack').click();
      phase = 'installed activity';
      assert.equal(
        (await page.evaluate(() => window.TronoDesktop.getActivityState())).enabled,
        false,
      );
      await page.evaluate(() => window.TronoCallSettings.open('game'));
      await page.locator('[data-settings-tab=game]').click();
      await expect(
        page
          .getByRole('region', { name: 'Jogos', exact: true })
          .getByRole('slider', { name: 'Volume da música', exact: true }),
      ).toBeVisible();
      await page.locator('[data-settings-tab=activity]').click();
      await expect(page.locator('#desktopActivityEnabled')).not.toBeChecked();
      await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      phase = 'installed handbook';
      const openedManual = app.waitForEvent('window');
      await page.evaluate(() => window.TronoDesktop.openManual());
      const handbook = await openedManual;
      await expect(handbook.locator('.decree')).toHaveCount(10);
      await expect(handbook.locator('#lei-usurpacao')).toContainText(
        'nunca receba a própria carta',
      );
      assert.equal(await handbook.evaluate(() => typeof window.TronoDesktop), 'undefined');
      assert.equal(await handbook.evaluate(() => typeof require), 'undefined');
      assert.equal(await handbook.evaluate(() => window.opener), null);
      await handbook.evaluate(() => document.fonts.ready);
      assert.equal(await handbook.evaluate(() => document.fonts.check('600 14px Manrope')), true);
      assert.equal(
        await handbook.evaluate(() => getComputedStyle(document.body).color),
        'rgb(237, 228, 209)',
      );
      assert(
        await handbook
          .locator('.law>img')
          .first()
          .evaluate((image) => image.complete && image.naturalWidth > 0),
      );
      const manualSessions = await app.evaluate(({ BrowserWindow, session }) =>
        BrowserWindow.getAllWindows().map((w) => ({
          url: w.webContents.getURL(),
          manual: w.webContents.session === session.fromPartition('mn-manual'),
          app: w.webContents.session === session.fromPartition('persist:mn-trono'),
        })),
      );
      assert.equal(manualSessions.filter((w) => w.manual).length, 1);
      assert.equal(manualSessions.filter((w) => w.app).length, 1);
      await handbook.screenshot({
        path: path.resolve(__dirname, '../artifacts/windows-manual.png'),
      });
      await handbook.close();
      phase = 'native court fullscreen';
      await require('./desktop-court-display-flow').exerciseCourtFullscreen({ app, page });
      phase = 'installed RNNoise';
      assert(
        await page.evaluate(async () => {
          const context = new AudioContext({ sampleRate: 48000 });
          let processor;
          try {
            await context.resume();
            processor = await window.TronoNoise.create(context);
            return processor.node instanceof AudioWorkletNode;
          } finally {
            processor?.destroy();
            await context.close();
          }
        }),
      );
      phase = 'installed voice receive protection';
      await require('./desktop-voice-flow').exerciseVoiceProtection({ app, page });
      phase = 'installed Splendor online';
      await require('./desktop-splendor-flow').exerciseSplendor({
        app,
        page,
        frontend: path.join(resourceRoot, 'renderer'),
        screenshot: path.resolve(__dirname, '../artifacts/windows-splendor-installed.png'),
      });
      await page.screenshot({
        path: path.resolve(__dirname, '../artifacts/windows-packaged-app.png'),
      });
    } catch (error) {
      const state = page
        ? await Promise.race([
            page
              .evaluate(() => {
                const f = document.querySelector('#rogueliteFrame');
                return {
                  status: document.querySelector('#rogueliteLoadStatus')?.textContent,
                  loading: document.querySelector('#rogueliteLoading')?.hidden,
                  child: f?.contentDocument
                    ? {
                        url: f.contentDocument.URL,
                        origin: f.contentWindow.location.origin,
                        start: !!f.contentDocument.querySelector('#startBtn'),
                        engine: typeof f.contentWindow.Abyss,
                        renderer: typeof f.contentWindow.AbyssRenderer,
                        embedded: f.contentDocument.documentElement.className,
                        quality: f.contentDocument.querySelector('#quality')?.value,
                        hud: !f.contentDocument.querySelector('#hud')?.hidden,
                        choices: f.contentDocument.querySelectorAll('#upgradeCards button').length,
                        screen: [...f.contentDocument.querySelectorAll('.screen')]
                          .filter((n) => !n.hidden)
                          .map((n) => n.id),
                      }
                    : null,
                };
              })
              .catch((e) => ({ error: e.message })),
            new Promise((r) => setTimeout(() => r({ renderer: 'did not answer' }), 2000)),
          ])
        : {};
      throw new Error(
        'Packaged desktop ' +
          JSON.stringify({ phase, state, diagnostics: diagnostics.slice(-12) }) +
          '\n' +
          error.message,
      );
    } finally {
      finished = true;
      phase = 'test cleanup';
      await closeTestApp(app);
      await guestFixture?.stop();
      clearTimeout(watchdog);
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
);
