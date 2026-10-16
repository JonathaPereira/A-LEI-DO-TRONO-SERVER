'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express'),
  path = require('node:path'),
  fs = require('node:fs/promises');
const { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
test(
  'profile media persists; voice starts only by user choice and presence follows the call',
  { timeout: 150000 },
  async () => {
    const server = await new Promise((r) => {
        const s = express()
          .use(express.static(path.resolve(__dirname, '../out')))
          .listen(0, '127.0.0.1', () => r(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      fixture = await startFixture({ port: 10937, appOrigin: origin });
    let browser;
    const errors = [],
      uploads = [],
      ids = [
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003',
      ],
      gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
      out = path.resolve(
        __dirname,
        '../artifacts/profile-media' + (process.env.QA_NATIVE ? 'native' : ''),
      );
    await fs.mkdir(out, { recursive: true });
    try {
      const email = 'media-profile@example.test';
      await fixture.call('signup', { email, nickname: 'Perfil Teste', password: 'Senha12!' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const data = (await fixture.call('login', { email, password: 'Senha12!' })).data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
          ...(process.platform === 'linux'
            ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
            : []),
        ],
      });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        permissions: ['microphone', 'camera'],
      });
      await context.route('**/*', (r) =>
        new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
      );
      const imageURL = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Animation.gif';
      let catalogueFail = false;
      await context.route('https://commons.wikimedia.org/w/api.php?*', (r) =>
        catalogueFail
          ? r.fulfill({ status: 503, body: 'Unavailable' })
          : r.fulfill({
              json: {
                query: {
                  pages: [
                    {
                      pageid: 1,
                      title: 'File:Animation.gif',
                      imageinfo: [
                        {
                          mime: 'image/gif',
                          size: gif.length,
                          width: 1,
                          height: 1,
                          url: imageURL,
                          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Animation.gif',
                          extmetadata: {
                            Artist: { value: '<b>Auteur</b>' },
                            LicenseShortName: { value: 'CC0' },
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            }),
      );
      await context.route(imageURL, (r) => r.fulfill({ contentType: 'image/gif', body: gif }));
      await context.route('**/files/upload', (r) => {
        const id = ids[uploads.length];
        uploads.push({
          kind: r.request().headers()['x-file-kind'],
          bytes: r.request().postDataBuffer().length,
        });
        return r.fulfill({ json: { file: { id } } });
      });
      await context.route('**/files/*/url', (r) =>
        r.fulfill({
          json: {
            url: origin + '/assets/games/throne-cover.webp',
            expiresAt: Date.now() + 3600000,
          },
        }),
      );
      await context.addInitScript(
        ({ base, data, native }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
          sessionStorage.setItem(
            'mn-resume-chat',
            JSON.stringify({ userId: data.user.id, id: 'chat-jogos' }),
          );
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
          localStorage.setItem('tronoNoiseSuppression', '0');
          window.__mediaRequests = 0;
          const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = (...args) => {
            window.__mediaRequests++;
            return capture(...args);
          };
          if (native)
            window.TronoDesktop = {
              version: '0.2.4',
              clipsSuspended: true,
              readSession: async () => null,
              saveSession: async () => {},
              getMediaPermissions: async () => ['audio', 'video'],
              onCapture: () => {},
              onCaptureCancel: () => {},
              getWindowState: async () => ({ fullscreen: false }),
              onWindowState: () => {},
              onUpdateState: () => {},
              getUpdateState: async () => ({ status: 'idle' }),
              onApplicationAudio: () => {},
              configureClips: async () => ({ suspended: true }),
            };
        },
        { base: fixture.base, data, native: process.env.QA_NATIVE === '1' },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await expect
        .poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom))
        .toBe('chat-jogos');
      const idle = async () => {
        assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
        assert.equal(await page.evaluate(() => window.__mediaRequests), 0);
        await expect(page.locator('.room-presence-icons .community-avatar')).toHaveCount(0);
      };
      await idle();
      await page.evaluate(() => window.TronoAppLayout.navigate('game'));
      await page.evaluate(() => window.TronoAppLayout.navigate('community'));
      await idle();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect
        .poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom))
        .toBe('chat-jogos');
      await idle();
      await page.evaluate(() => window.TronoProfile.open());
      await expect(page.locator('#profile-bio')).toBeEnabled();
      await page.locator('[data-link-url]').fill('youtube.com/@exemplo');
      await page.locator('#profile-bio').fill('Meu perfil com GIF.');
      await page.locator('#profileEmojiBtn').click();
      await expect(page.locator('#profileEmojiPicker')).toBeVisible();
      await page.getByRole('button', { name: 'Usar 👨‍👩‍👧‍👦', exact: true }).click();
      await expect(page.locator('#profile-emoji')).toHaveValue('👨‍👩‍👧‍👦');
      for (const target of ['cover', 'background']) {
        await page.locator('[data-profile-gif=' + target + ']').click();
        await expect(page.locator('.profile-gif-results article')).toHaveCount(1);
        await page.locator('.profile-gif-results article>button').click();
        await expect(page.locator('#profileGifDialog')).not.toBeVisible();
      }
      await page.locator('#profile-cover_position').fill('18');
      await page.locator('#profile-cover_zoom').fill('150');
      const image = page.locator('#profileLivePreview .member-cover img');
      await expect(image).toHaveCount(1);
      await image.evaluate((e) => (e.dataset.retained = 'yes'));
      await page.locator('#profile-cover_position').fill('25');
      assert.equal(await image.getAttribute('data-retained'), 'yes');
      await page.locator('#profileSave').click();
      await expect(page.locator('#profileMessage')).toContainText('Perfil atualizado.');
      assert.equal(uploads.length, 2);
      assert(uploads.every((x) => x.kind === 'avatar' && x.bytes === gif.length));
      const close = () =>
        page.evaluate(() =>
          window.TronoDesktopSettings
            ? window.TronoDesktopSettings.close()
            : document.getElementById('profileDialog').close(),
        );
      await close();
      await page.evaluate(() => window.TronoProfile.open());
      await expect(page.locator('#profile-bio')).toBeEnabled();
      await expect(page.locator('[data-link-url]')).toHaveValue('https://youtube.com/@exemplo');
      await expect(page.locator('[data-link-name]')).toHaveValue('YouTube');
      await expect(page.locator('#profile-cover_position')).toHaveValue('25');
      await expect(page.locator('#profile-cover_zoom')).toHaveValue('150');
      await expect(page.locator('#profile-emoji')).toHaveValue('👨‍👩‍👧‍👦');
      await expect(page.locator('.member-media-credits')).toContainText('Auteur');
      // An invalid link must leave the saved identity/profile intact and re-enable Save.
      await page.locator('[data-link-url]').fill('javascript:alert(1)');
      await page.locator('#profileSave').click();
      await expect(page.locator('#profileMessage')).toHaveClass(/auth-error/);
      await expect(page.locator('#profileSave')).toBeEnabled();
      await page.locator('[data-link-url]').fill('youtube.com/@exemplo');
      for (const size of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(size);
        await page.locator('#profileEmojiBtn').click();
        await expect(page.locator('#profileEmojiPicker')).toBeInViewport();
        await page.keyboard.press('Escape');
        await page.locator('[data-profile-gif=avatar]').click();
        await expect(page.locator('.profile-gif-results article')).toHaveCount(1);
        await page.screenshot({
          path: out + '/gifs-' + size.width + '.png',
          animations: 'disabled',
          timeout: 60000,
        });
        assert.equal(
          await page.locator('#profileGifDialog').evaluate((e) => e.scrollWidth - e.clientWidth),
          0,
        );
        await page.keyboard.press('Escape');
      }
      catalogueFail = true;
      await page.locator('[data-profile-gif=avatar]').click();
      await expect(page.locator('.profile-gif-message')).toContainText('indisponível');
      catalogueFail = false;
      await page.locator('.profile-gif-search button').click();
      await expect(page.locator('.profile-gif-results article')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await close();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('[data-chat-channel=chat-conversa]').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await expect
        .poll(() => page.evaluate(() => window.TronoNetwork.primaryRoom))
        .toBe('chat-conversa');
      await expect(page.locator('[data-chat-channel=chat-conversa] .community-avatar')).toHaveCount(
        1,
      );
      await expect(page.locator('[data-chat-channel=chat-jogos] .community-avatar')).toHaveCount(0);
      await expect(page.locator('#voiceRoster .participant-background img')).toHaveCount(1);
      for (const mode of ['original', 'discord']) {
        await page.evaluate((mode) => window.TronoAppLayout.apply(mode, { save: true }), mode);
        const card = await page.locator('#voiceRoster .voice-person').boundingBox();
        assert(card.width <= 231 && card.height <= 150, JSON.stringify(card));
        await expect(page.locator('#cameraBtn')).toHaveAttribute('data-call-action', 'start');
        await page.locator('#cameraBtn').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
        await page.mouse.move(0, 0);
        await expect
          .poll(() =>
            page.locator('#cameraBtn').evaluate((e) => getComputedStyle(e).backgroundColor),
          )
          .toBe('rgb(123, 41, 54)');
        await page.locator('#cameraBtn').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(false);
        await page.mouse.move(0, 0);
        await expect
          .poll(() =>
            page.locator('#cameraBtn').evaluate((e) => getComputedStyle(e).backgroundColor),
          )
          .toBe('rgb(24, 84, 62)');
        await page.screenshot({
          path: out + '/call-' + mode + '.png',
          animations: 'disabled',
          timeout: 60000,
        });
      }
      await page.locator('#joinVoiceBtn').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(false);
      await expect(page.locator('.room-presence-icons .community-avatar')).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.TronoNetwork?.currentRoom), 'chat-conversa');
      await page.evaluate(() => window.TronoAppLayout.navigate('game'));
      await page.evaluate(() => window.TronoAppLayout.navigate('community'));
      assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
      await page.locator('#joinVoiceBtn').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await expect(page.locator('.room-presence-icons .community-avatar')).toHaveCount(1);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
