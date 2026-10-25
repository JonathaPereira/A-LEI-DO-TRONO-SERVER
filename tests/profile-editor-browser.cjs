'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'profile settings preserve drafts, media, validation and account isolation on web and the desktop bridge fixture',
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
              route.fulfill({
                json: { provider: 'giphy', configured: true, apiKey: 'fixture-only' },
              }),
            );
            const galleryCovers = [
              '/assets/games/throne-cover.webp',
              '/assets/azul/box-cover.webp',
              '/assets/games/splendor-cover.webp',
              '/assets/love-letter/table.webp',
            ];
            await context.route('https://api.giphy.com/v1/gifs/*', (route) =>
              route.fulfill({
                json: {
                  data: Array.from({ length: 24 }, (_, i) => ({
                    id: 'qa' + i,
                    type: 'gif',
                    rating: 'g',
                    title: 'Ilustração QA ' + i,
                    url: 'https://giphy.com/gifs/qa-' + i,
                    user: { display_name: 'Biblioteca de teste' },
                    images: {
                      original: {
                        url: 'https://media.giphy.com/media/qa' + i + '/giphy.gif',
                        size: '1000',
                        width: '320',
                        height: '240',
                      },
                    },
                  })),
                  pagination: { offset: 0, count: 24, total_count: 24 },
                  meta: { status: 200 },
                },
              }),
            );
            await context.route('https://media.giphy.com/media/qa*/giphy.gif', async (route) => {
              const i = Number(
                route
                  .request()
                  .url()
                  .match(/media\/qa(\d+)/)[1],
              );
              await route.fulfill({
                contentType: 'image/webp',
                body: await require('node:fs/promises').readFile(
                  path.join('public', galleryCovers[i % 4]),
                ),
              });
            });
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
              await page.getByRole('button', { name: 'Meu perfil', exact: true }).click();
              await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
              await expect(page.locator('#profile-bio')).toBeEnabled();
            }
            async function close() {
              await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
            }
            await open();
            await page.locator('[data-settings-tab=game]').click();
            await page
              .getByRole('region', { name: 'Jogos', exact: true })
              .getByRole('slider', { name: 'Volume da música', exact: true })
              .fill('24');
            assert.equal(await page.evaluate(() => window.TronoAudio.musicVolume), 24);
            await page.getByLabel('Efeitos dos jogos', { exact: true }).check();
            assert.equal(await page.evaluate(() => window.TronoAudio.sfxEnabled), true);
            await page.locator('[data-settings-tab=account]').click();
            const preview = page.locator('#profileLivePreview');
            await page.locator('#profile-cover_zoom').scrollIntoViewIfNeeded();
            assert(
              await preview.locator('.member-cover').evaluate((el) => {
                const r = el.getBoundingClientRect();
                const panel = document
                  .querySelector('[data-settings-fields]')
                  .getBoundingClientRect();
                return r.top >= panel.top && r.bottom <= panel.bottom;
              }),
              'The live card stays visible while editing cover controls',
            );

            await page.locator('[data-profile-gif=avatar]').click();
            await expect(page.locator('.profile-gif-results article')).toHaveCount(24);
            const gifs = page.locator('#profileGifDialog');
            assert(
              await page
                .locator('.profile-gif-results')
                .evaluate((n) => n.scrollHeight > n.clientHeight),
              'Filled GIF gallery scrolls internally',
            );
            for (const [width, height] of [
              [1440, 900],
              [1024, 768],
              [768, 1024],
              [390, 844],
            ]) {
              await page.setViewportSize({ width, height });
              await page
                .getByRole('searchbox', { name: 'Buscar GIFs', exact: true })
                .fill('Galeria ilustrativa QA');
              assert(
                await gifs.evaluate((n) => n.scrollHeight <= n.clientHeight + 1),
                'GIF dialog has one scroll region, inside the gallery',
              );
              const box = await gifs.boundingBox();
              assert(
                box.x >= 0 &&
                  box.x + box.width <= width &&
                  box.y >= 0 &&
                  box.y + box.height <= height,
                JSON.stringify(box),
              );
              await require('node:fs/promises').mkdir('artifacts/frontend-reset/refine-qa', {
                recursive: true,
              });
              await page.screenshot({
                path:
                  'artifacts/frontend-reset/refine-qa/gifs-' +
                  (native ? 'bridge-' : 'web-') +
                  width +
                  '.png',
              });
            }
            await page.getByRole('button', { name: 'Fechar busca de GIFs', exact: true }).click();
            await page.setViewportSize({ width: 1440, height: 1000 });

            await expect(preview.locator('.member-cover img')).toHaveCount(1);
            await expect(preview.locator('.member-media-credits a')).toHaveAttribute(
              'href',
              credit.source,
            );
            await page.locator('#profile-bio').fill('  \n\nSobre mim\n\n\nOlá  ');
            await expect(preview.locator('.member-bio')).toHaveText('Sobre mim\n\nOlá');
            await page.locator('#profile-bio').fill('a'.repeat(300));
            assert.equal(
              await page
                .locator('.profile-editor-preview')
                .evaluate(
                  (n) =>
                    [...n.querySelectorAll('*')].filter(
                      (el) =>
                        /auto|scroll/.test(getComputedStyle(el).overflowY) &&
                        el.scrollHeight > el.clientHeight + 1,
                    ).length,
                ),
              0,
              'The card has no nested scrollbar inside its preview pane',
            );
            await page
              .locator('#profile-tags')
              .fill('testes, jogos, tecnologia, programação, música, cinema');
            await page.locator('[data-link-url]').first().fill('https://example.test/perfil');
            await expect(preview.locator('.member-tags span')).toHaveCount(6);
            await expect(preview.locator('.member-links a')).toHaveCount(1);
            assert(
              await preview.evaluate((n) => {
                const card = n.querySelector('.member-card').getBoundingClientRect();
                return [
                  ...n.querySelectorAll('.member-tags span, .member-links a, .member-since'),
                ].every((item) => {
                  const r = item.getBoundingClientRect();
                  return (
                    r.height > 0 &&
                    r.top >= card.top &&
                    r.bottom <= card.bottom &&
                    r.right <= card.right
                  );
                });
              }),
              'All preview interests, links and membership date fit inside the card',
            );
            await require('node:fs/promises').mkdir('artifacts/frontend-reset/contrast-qa', {
              recursive: true,
            });
            await preview.screenshot({
              path:
                'artifacts/frontend-reset/contrast-qa/profile-complete-' +
                (native ? 'bridge' : 'web') +
                '.png',
            });
            await page.locator('#profile-tags').fill('');
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
            // Native close events are queued; an event from an earlier close can
            // arrive after reopening. It must not close or reset the current editor.
            await page.evaluate((native) => {
              document
                .querySelector('dialog[aria-label="Configurações da Corte"]')
                .dispatchEvent(new Event('close'));
            }, native);
            await expect(
              page.getByRole('dialog', { name: 'Configurações da Corte' }),
            ).toBeVisible();
            await expect(page.locator('#profile-bio')).toBeEnabled();
            await expect(page.locator('#profile-bio')).toHaveValue('Texto continua editável');
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
            await page.locator('[data-settings-tab=appearance]').click();
            await page.locator('[data-settings-tab=files]').click();
            await page.locator('[data-settings-tab=account]').click();
            await expect(page.locator('#profile-bio')).toHaveValue('Texto continua editável');
            assert.equal(
              await page.evaluate(() =>
                window.__editorControls.every((node) => document.getElementById(node.id) === node),
              ),
              true,
            );
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
            let saving = null;
            await context.route('**/auth/profile', (route) => {
              saving = route;
            });
            await page.locator('#profileSave').click();
            await expect.poll(() => !!saving).toBe(true);
            await page.mouse.click(8, 8);
            await expect(
              page.getByRole('dialog', { name: 'Configurações da Corte' }),
            ).toBeVisible();
            await expect(page.locator('#profileSave')).toBeDisabled();
            await saving.fulfill({ response: await saving.fetch() });
            await context.unroute('**/auth/profile');
            await expect(page.locator('#profileMessage')).toHaveText('Perfil atualizado.');
            assert.equal(first.personalization.cover_file_id, null);
            assert.deepEqual(first.personalization.links, [
              { label: 'YouTube', url: 'https://youtube.com/@exemplo' },
            ]);
            assert.equal(first.personalization.cover_zoom, 160);
            assert.equal(uploads.length, 0);
            await page.locator('#profile-bio').fill('Rascunho para descartar');
            await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
            await expect(page.locator('#profile-bio')).toHaveValue('Texto continua editável');
            await require('node:fs/promises').mkdir('artifacts/frontend-reset/marco3-qa', {
              recursive: true,
            });
            for (const [width, height] of [
              [1440, 900],
              [1024, 768],
              [768, 1024],
              [390, 844],
            ]) {
              await page.setViewportSize({ width, height });
              const panel = page.getByRole('dialog', { name: 'Configurações da Corte' });
              const geometry = await panel.evaluate((el) => ({
                width: el.clientWidth,
                scroll: el.scrollWidth,
                left: el.getBoundingClientRect().left,
                right: el.getBoundingClientRect().right,
              }));
              assert(
                geometry.scroll <= geometry.width + 1 &&
                  geometry.left >= 0 &&
                  geometry.right <= width,
                JSON.stringify(geometry),
              );

              if (width <= 1150) {
                await panel.getByRole('button', { name: 'Ver prévia', exact: true }).click();
                await expect(preview.locator('.member-name')).toBeVisible();
                await expect(panel.locator('#profileSave')).toBeVisible();
                await page.screenshot({
                  path:
                    'artifacts/frontend-reset/marco3-qa/editor-preview-' +
                    (native ? 'bridge-' : 'web-') +
                    width +
                    '.png',
                });
                await panel.getByRole('button', { name: 'Voltar à edição', exact: true }).click();
                await expect(page.locator('#profile-bio')).toHaveValue('Texto continua editável');
              }
              await panel.locator('[data-settings-fields]').evaluate((el) => (el.scrollTop = 0));
              await page.screenshot({
                path:
                  'artifacts/frontend-reset/marco3-qa/profile-' +
                  (native ? 'bridge-' : 'web-') +
                  width +
                  '.png',
              });
            }
            await page.locator('[data-settings-tab=appearance]').click();
            for (const [width, height] of [
              [1440, 900],
              [768, 1024],
              [390, 844],
            ]) {
              await page.setViewportSize({ width, height });
              await page.screenshot({
                path:
                  'artifacts/frontend-reset/marco3-qa/themes-' +
                  (native ? 'bridge-' : 'web-') +
                  width +
                  '.png',
              });
            }
            await page.setViewportSize({ width: 1440, height: 900 });
            await close();
            holdProfile = true;
            await page.evaluate(() => {
              window.__heldEditorOpen = window.TronoProfile.open();
            });
            await expect.poll(() => !!held).toBe(true);
            await close();
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#authEmail')).toBeVisible();
            await page.locator('#authEmail').fill(emails[1]);
            await page.locator('#authPassword').fill('Senha12!');
            await page.locator('#authSubmit').click();
            await expect
              .poll(() => page.evaluate(() => window.TronoAuth.user?.email))
              .toBe(emails[1]);
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
                await expect(page.locator('#authEmail')).toBeVisible();
                await page.locator('#authEmail').fill(email);
                await page.locator('#authPassword').fill('Senha12!');
                await page.locator('#authSubmit').click();
                await expect
                  .poll(() => page.evaluate(() => window.TronoAuth.user?.email))
                  .toBe(email);
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
