'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'member profiles preserve personalization, account isolation and active calls on web and desktop',
  { timeout: 150000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const listener = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser;
    try {
      fixture = await startFixture({ port: 10943, appOrigin: origin });
      const emails = [
        'member-reader@example.test',
        'member-rich@example.test',
        'member-other@example.test',
      ];
      for (const [index, email] of emails.entries()) {
        await fixture.call('signup', {
          email,
          nickname: ['Leitor', 'Perfil completo', 'Outro membro'][index],
          password: 'Senha12!',
        });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
      }
      const users = emails.map((email) => fixture.users.get(email));
      const ids = [1, 2, 3].map((n) => '20000000-0000-4000-8000-' + String(n).padStart(12, '0'));
      users[1].avatar_file_id = ids[0];
      users[1].personalization = {
        handle: 'jogador_completo',
        bio: 'Música, jogos e conversa.\nSegunda linha da bio.',
        status: 'Na chamada com os amigos',
        emoji: '🎮',
        tags: ['Jogos', 'Música'],
        links: [{ label: 'Meu código', url: 'https://github.com/example' }],
        cover_file_id: ids[1],
        background_file_id: ids[2],
        accent: '#33aabb',
        darkness: 25,
        blur: 3,
        opacity: 75,
        cover_position: 24,
        cover_zoom: 160,
        reduce_motion: true,
        media_credits: {
          cover: {
            title: 'Capa animada',
            author: 'Artista',
            license: 'Ver na fonte',
            source: 'https://giphy.com/gifs/animation-abc123',
            license_url: '',
          },
        },
      };
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      for (const native of [false, true]) {
        await t.test(native ? 'desktop profile viewer' : 'web profile viewer', async () => {
          const initial = (await fixture.call('login', { email: emails[0], password: 'Senha12!' }))
            .data;
          const context = await browser.newContext({
            viewport: { width: 1440, height: 1000 },
            permissions: ['microphone'],
          });
          const errors = [],
            imageRequests = [];
          let hold = false,
            held = null;
          try {
            await context.route('**/*', (route) =>
              new URL(route.request().url()).hostname === '127.0.0.1'
                ? route.continue()
                : route.abort(),
            );
            await context.route('**/files/*/url', (route) => {
              const id = new URL(route.request().url()).pathname.split('/')[2];
              imageRequests.push(id);
              return route.fulfill({
                json: { url: origin + '/member-image/' + id, expiresAt: Date.now() + 3600000 },
              });
            });
            await context.route('**/member-image/*', (route) =>
              route.fulfill({
                contentType: 'image/gif',
                body: Buffer.from(
                  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                  'base64',
                ),
              }),
            );
            await context.route('**/community/profiles/*', (route) => {
              const id = new URL(route.request().url()).pathname.split('/').at(-1);
              if (hold && id === users[1].id) {
                hold = false;
                held = route;
                return;
              }
              return route.continue();
            });
            await context.route('**/community/gif-provider', (route) =>
              route.fulfill({ json: { provider: 'giphy', configured: false } }),
            );
            await context.addInitScript(
              ({ base, initial, native }) => {
                window.TRONO_BACKEND_URL = base;
                sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
                sessionStorage.setItem(
                  'mn-resume-chat',
                  JSON.stringify({ userId: initial.user.id, id: 'chat-jogos' }),
                );
                localStorage.setItem('tronoSfxEnabled', '0');
                localStorage.setItem('tronoMusicEnabled', '0');
                localStorage.setItem('tronoNoiseSuppression', '0');
                if (native)
                  window.TronoDesktop = {
                    version: '0.2.10',
                    clipsSuspended: true,
                    readSession: async () => null,
                    saveSession: async () => {},
                    getMediaPermissions: async () => ['audio', 'video'],
                    onCapture: () => {},
                    onCaptureCancel: () => {},
                    onApplicationAudio: () => {},
                    configureClips: async () => ({ suspended: true }),
                    getWindowState: async () => ({ fullscreen: false }),
                    onWindowState: () => {},
                    getUpdateState: async () => ({ status: 'idle' }),
                    onUpdateState: () => {},
                  };
              },
              { base: fixture.base, initial, native },
            );
            const page = await context.newPage();
            page.setDefaultTimeout(12000);
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(origin);
            await page.waitForFunction(() => window.TronoAuth?.ready && window.TronoProfileViewer);
            await page.evaluate(() => window.TronoAuth.ready);
            await expect
              .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
              .toBe('chat-jogos');
            assert.equal(await page.evaluate(() => window.TronoSocial.joinVoice()), true);
            await expect
              .poll(() => page.evaluate(() => !!window.TronoSocial.getLocalAudioTrack()))
              .toBe(true);
            await page.evaluate(() => {
              window.__memberBaseline = {
                social: window.TronoSocial,
                track: window.TronoSocial.getLocalAudioTrack(),
                client: window.TronoNetwork.clientId,
                room: window.TronoNetwork.primaryRoom,
              };
              window.__memberMessages = [];
              window.TronoMessenger.open = (id) => window.__memberMessages.push(id);
            });
            const dialog = page.locator('#memberProfileDialog'),
              card = dialog.locator('.member-card');
            async function open(id, full = false) {
              await page.evaluate(
                ({ id, full }) => window.TronoProfile.openMini({ accountId: id }, { full }),
                { id, full },
              );
              await expect(dialog).toBeVisible();
              await expect(card.locator('.member-name')).toHaveText(
                users.find((user) => user.id === id).nickname,
              );
            }
            await open(users[1].id);
            await expect(card.locator('.member-handle')).toHaveText('@jogador_completo');
            await expect(card.locator('.member-status')).toHaveText('🎮 Na chamada com os amigos');
            await expect(card.locator('.member-bio')).toContainText('Segunda linha da bio.');
            await expect(card.locator('.member-tags span')).toHaveText(['Jogos', 'Música']);
            await expect(card.locator('.member-links a')).toHaveAttribute(
              'href',
              'https://github.com/example',
            );
            await expect(card.locator('.member-links a')).toHaveAttribute(
              'rel',
              'noopener noreferrer',
            );
            await expect(card.locator('.member-since')).toContainText('outubro de 2026');
            await expect(card.locator('.member-background img')).toBeVisible();
            await expect(card.locator('.member-cover img')).toBeVisible();
            await expect(card.locator('.member-avatar img')).toBeVisible();
            await expect.poll(() => ids.every((id) => imageRequests.includes(id))).toBe(true);
            assert.deepEqual(
              await card.evaluate((element) =>
                ['accent', 'darkness', 'blur', 'opacity', 'cover-position', 'cover-zoom'].map(
                  (key) => element.style.getPropertyValue('--member-' + key),
                ),
              ),
              ['#33aabb', '0.25', '3px', '0.75', '24%', '1.6'],
            );
            await card.locator('.member-media-credits summary').click();
            await expect(card.locator('.member-media-credits a')).toHaveText(
              'Capa: Capa animada · Artista · Ver na fonte',
            );
            await expect(card.locator('.member-media-credits a')).toHaveAttribute(
              'href',
              'https://giphy.com/gifs/animation-abc123',
            );
            await page.locator('#memberProfileExpand').click();
            await expect(dialog).toHaveClass(/member-full/);
            await expect(page.locator('#memberProfileExpand')).toBeHidden();
            await page.setViewportSize({ width: 390, height: 844 });
            assert.equal(
              await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
              0,
            );
            assert.ok((await dialog.boundingBox()).width <= 390);
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
            await page.setViewportSize({ width: 1440, height: 1000 });
            await open(users[0].id, true);
            await expect(page.locator('#memberProfileMessage')).toBeHidden();
            await dialog.locator('.member-close').click();
            await open(users[2].id);
            await page.locator('#memberProfileMessage').click();
            await expect(dialog).toBeHidden();
            await expect
              .poll(() => page.evaluate(() => window.__memberMessages))
              .toEqual([users[2].id]);
            assert.deepEqual(
              await page.evaluate(() => {
                const before = window.__memberBaseline,
                  social = window.TronoSocial;
                return {
                  sameOwner: social === before.social,
                  sameMic: social.getLocalAudioTrack() === before.track,
                  live: before.track.readyState === 'live',
                  joined: social.voiceJoined,
                  socket:
                    window.TronoNetwork.connected && window.TronoNetwork.clientId === before.client,
                  room: window.TronoNetwork.primaryRoom === before.room,
                };
              }),
              {
                sameOwner: true,
                sameMic: true,
                live: true,
                joined: true,
                socket: true,
                room: true,
              },
            );

            // A canceled response cannot repaint a newer member or reopen a closed dialog.
            hold = true;
            held = null;
            await page.evaluate((id) => {
              window.__pendingMember = window.TronoProfile.openMini(id);
            }, users[1].id);
            await expect.poll(() => !!held).toBe(true);
            await open(users[2].id);
            await held
              .fulfill({
                json: { profile: { ...users[1], personalization: users[1].personalization } },
              })
              .catch(() => {});
            await page.evaluate(() => window.__pendingMember);
            await expect(card.locator('.member-name')).toHaveText(users[2].nickname);
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();

            // Escape closes nested dialogs while retaining their desktop settings host.
            if (native) {
              await page.evaluate(() => window.TronoDesktopSettings.open('account'));
              await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
              await page.locator('#profileEmojiBtn').click();
              await expect(page.locator('#profileEmojiPicker')).toBeVisible();
              await page.keyboard.press('Escape');
              await expect(page.locator('#profileEmojiPicker')).toBeHidden();
              await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
              await page.locator('[data-profile-gif=avatar]').click();
              await expect(page.locator('#profileGifDialog')).toBeVisible();
              await page.keyboard.press('Escape');
              await expect(page.locator('#profileGifDialog')).toBeHidden();
              await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
              await open(users[1].id);
              await page.keyboard.press('Escape');
              await expect(dialog).toBeHidden();
              await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
              await page.evaluate(() => window.TronoDesktopSettings.close());
            }
            hold = true;
            held = null;
            await page.evaluate((id) => {
              window.__pendingMember = window.TronoProfile.openMini(id);
            }, users[1].id);
            await expect.poll(() => !!held).toBe(true);
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(dialog).toBeHidden();
            await held.fulfill({ json: { profile: users[1] } }).catch(() => {});
            await page.evaluate(() => window.__pendingMember);
            await expect(dialog).toBeHidden();
            assert.equal(await page.locator('#memberProfileContent').textContent(), '');
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        });
      }
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
