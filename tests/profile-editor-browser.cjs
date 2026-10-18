'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'the React profile editor preserves media, validation and account isolation in both hosts',
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
      fixture = await startFixture({ port: 10945, appOrigin: origin });
      const emails = ['editor-first@example.test', 'editor-second@example.test'];
      for (const [index, email] of emails.entries()) {
        await fixture.call('signup', { email, nickname: 'Editor ' + index, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
      }
      const ids = [1, 2, 3, 4].map((n) => '21000000-0000-4000-8000-' + String(n).padStart(12, '0'));
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      const credit = {
        title: 'Animação',
        author: 'Artista',
        license: 'Ver no GIPHY',
        source: 'https://giphy.com/gifs/animation-abc123',
        license_url: '',
      };
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
      });
      for (const native of [false, true]) {
        await t.test(native ? 'desktop settings editor' : 'web dialog editor', async () => {
          const first = fixture.users.get(emails[0]);
          first.personalization = {
            bio: 'Bio original',
            cover_file_id: ids[0],
            background_file_id: ids[1],
            media_credits: { cover: credit },
          };
          first.avatar_file_id = ids[2];
          const initial = (await fixture.call('login', { email: emails[0], password: 'Senha12!' }))
            .data;
          const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
          const errors = [],
            uploads = [];
          let held = null,
            holdProfile = false;
          try {
            await context.route('**/*', (route) =>
              new URL(route.request().url()).hostname === '127.0.0.1'
                ? route.continue()
                : route.abort(),
            );
            await context.route('**/community/gif-provider', (route) =>
              route.fulfill({ json: { provider: 'giphy', configured: false } }),
            );
            await context.route('**/files/*/url', (route) =>
              route.fulfill({
                json: { url: origin + '/editor-image.gif', expiresAt: Date.now() + 3600000 },
              }),
            );
            await context.route('**/editor-image.gif', (route) =>
              route.fulfill({ contentType: 'image/gif', body: gif }),
            );
            await context.route('**/files/upload', (route) => {
              uploads.push(route.request().postDataBuffer());
              return route.fulfill({
                json: {
                  file: {
                    id: ids[3],
                    name: 'selected.gif',
                    bytes: gif.length,
                    mime: 'image/gif',
                    kind: 'avatar',
                  },
                },
              });
            });
            await context.route('**/community/profiles/*', (route) => {
              if (holdProfile && new URL(route.request().url()).pathname.endsWith(first.id)) {
                holdProfile = false;
                held = route;
                return;
              }
              return route.continue();
            });
            await context.addInitScript(
              ({ base, initial, native }) => {
                window.TRONO_BACKEND_URL = base;
                sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
                localStorage.setItem('tronoSfxEnabled', '0');
                localStorage.setItem('tronoMusicEnabled', '0');
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
            await page.waitForFunction(() => window.TronoAuth?.ready);
            await page.evaluate(() => window.TronoAuth.ready);
            async function open() {
              await page.evaluate(() => window.TronoProfile.open());
              await expect(page.locator('#profile-bio')).toBeEnabled();
            }
            async function close() {
              await page.evaluate(
                (native) =>
                  native
                    ? window.TronoDesktopSettings.close()
                    : document.getElementById('profileDialog').close(),
                native,
              );
            }
            await open();
            const preview = page.locator('#profileLivePreview');
            await expect(preview.locator('.member-cover img')).toHaveCount(1);
            await expect(preview.locator('.member-media-credits a')).toHaveAttribute(
              'href',
              credit.source,
            );
            await page.evaluate(() => {
              window.__editorControls = [
                'profileForm',
                'profileNickname',
                'profile-bio',
                'profile-cover_zoom',
              ].map((id) => document.getElementById(id));
              window.__editorCover = document.querySelector(
                '#profileLivePreview .member-cover img',
              );
            });
            await page.locator('[data-link-url]').first().fill('https://example.test/has spaces');
            await page.locator('#profile-bio').fill('Texto continua editável');
            await expect(preview).toContainText('Texto continua editável');
            await page.locator('#profileSave').click();
            await expect(page.locator('#profileMessage')).toHaveClass(/auth-error/);
            assert.equal(uploads.length, 0);
            await page.locator('[data-link-url]').first().fill('youtube.com/@exemplo');
            await page.locator('#profile-cover_zoom').fill('160');
            assert.equal(
              await page.evaluate(
                () =>
                  window.__editorCover ===
                  document.querySelector('#profileLivePreview .member-cover img'),
              ),
              true,
            );
            for (const mode of ['discord', 'original']) {
              await page.evaluate(
                (mode) => window.TronoAppLayout.apply(mode, { save: true }),
                mode,
              );
              assert.equal(
                await page.evaluate(() =>
                  window.__editorControls.every(
                    (node) => document.getElementById(node.id) === node,
                  ),
                ),
                true,
              );
            }
            if (native) {
              await page.locator('[data-settings-tab=appearance]').click();
              await page.locator('[data-settings-tab=account]').click();
              await expect(page.locator('#profile-bio')).toHaveValue('Texto continua editável');
              assert.equal(
                await page.evaluate(() =>
                  window.__editorControls.every(
                    (node) => document.getElementById(node.id) === node,
                  ),
                ),
                true,
              );
            }
            for (let n = 1; n < 8; n++) await page.locator('#profileAddLink').click();
            await expect(page.locator('#profileLinksRows .profile-link-row')).toHaveCount(8);
            await expect(page.locator('#profileAddLink')).toBeDisabled();
            await page
              .locator('#profileLinksRows .profile-link-row')
              .last()
              .getByRole('button', { name: 'Remover link' })
              .click();
            await expect(page.locator('#profileAddLink')).toBeEnabled();
            await page
              .locator('#profilePhoto')
              .setInputFiles({ name: 'avatar.gif', mimeType: 'image/gif', buffer: gif });
            await expect(page.locator('#profilePreview img')).toHaveAttribute('src', /^blob:/);
            await expect(page.locator('#profilePhoto')).toHaveValue('');
            // A preset clears only avatar media; the independently attributed cover survives.
            await page.locator('.profile-preset-choice summary').click();
            await page.locator('#avatarPresets [data-preset=crown]').click();
            await expect(page.locator('#profilePreview img')).toHaveCount(0);
            await expect(preview.locator('.member-media-credits a')).toHaveAttribute(
              'href',
              credit.source,
            );
            await page
              .locator('.profile-media-field')
              .first()
              .getByRole('button', { name: 'Remover', exact: true })
              .click();
            await expect(preview.locator('.member-cover img')).toHaveCount(0);
            await expect(preview.locator('.member-media-credits')).toHaveCount(0);
            await page.locator('#profileSave').click();
            await expect(page.locator('#profileMessage')).toHaveText('Perfil atualizado.');
            assert.equal(first.personalization.cover_file_id, null);
            assert.deepEqual(first.personalization.links, [
              { label: 'YouTube', url: 'https://youtube.com/@exemplo' },
            ]);
            assert.equal(first.personalization.cover_zoom, 160);
            assert.equal(uploads.length, 0);
            await close();
            holdProfile = true;
            await page.evaluate(() => {
              window.__heldEditorOpen = window.TronoProfile.open();
            });
            await expect.poll(() => !!held).toBe(true);
            await close();
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#authDialog')).toBeVisible();
            await page.locator('#authEmail').fill(emails[1]);
            await page.locator('#authPassword').fill('Senha12!');
            await page.locator('#authSubmitBtn').click();
            await expect(page.locator('#authDialog')).toBeHidden();
            await held
              .fulfill({
                json: {
                  profile: { ...first, personalization: { bio: 'Resposta antiga proibida' } },
                },
              })
              .catch(() => {});
            held = null;
            await open();
            await expect(page.locator('#profileNickname')).toHaveValue('Editor 1');
            await expect(page.locator('#profile-bio')).toHaveValue('');
            await expect(preview).not.toContainText('Resposta antiga proibida');
            await close();
            // A pending save must not restore another login, including A -> B -> A.
            for (const sameAccount of [false, true]) {
              let pendingSave;
              const accountBefore = await page.evaluate(() => ({ ...window.TronoAuth.user }));
              await context.route('**/auth/profile', (route) => {
                pendingSave = route;
              });
              await page.evaluate(() => {
                window.__lateProfileSave = window.TronoAuth.updateProfile({
                  nickname: 'Resposta antiga',
                }).then(
                  () => ({ ok: true }),
                  (error) => ({ ok: false, message: error.message }),
                );
              });
              await expect.poll(() => !!pendingSave).toBe(true);
              const otherEmail = accountBefore.email === emails[0] ? emails[1] : emails[0];
              for (const email of sameAccount ? [otherEmail, accountBefore.email] : [otherEmail]) {
                await page.evaluate(() => window.TronoAuth.logout());
                await expect(page.locator('#authDialog')).toBeVisible();
                await page.locator('#authEmail').fill(email);
                await page.locator('#authPassword').fill('Senha12!');
                await page.locator('#authSubmitBtn').click();
                await expect(page.locator('#authDialog')).toBeHidden();
              }
              const active = await page.evaluate(() => ({ ...window.TronoAuth.user }));
              await pendingSave.fulfill({
                json: { user: { ...accountBefore, nickname: 'Resposta antiga' } },
              });
              const result = await page.evaluate(() => window.__lateProfileSave);
              assert.equal(result.ok, false);
              assert.match(result.message, /conta foi alterada/);
              assert.deepEqual(await page.evaluate(() => ({ ...window.TronoAuth.user })), active);
              await context.unroute('**/auth/profile');
            }
            assert.deepEqual(errors, []);
          } finally {
            if (held) await held.abort().catch(() => {});
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
