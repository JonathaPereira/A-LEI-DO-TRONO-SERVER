'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const path = require('node:path'),
  express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { validateSound } = require('../server/soundboard.ts');
function wave(seconds) {
  const bytes = Buffer.alloc(44 + 16000 * seconds * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 44; i < bytes.length; i += 2) bytes.writeInt16LE(i % 64 < 32 ? 4000 : -4000, i);
  return bytes;
}
test(
  'React soundboard crops, previews, uploads, plays through the room and releases local resources',
  { timeout: 90000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const listening = express()
        .use(express.static(path.resolve('out')))
        .listen(0, '127.0.0.1', () => resolve(listening));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture,
      browser,
      uploads = 0;
    try {
      fixture = await startFixture({ port: 10922, appOrigin: origin, soundboard: true });
      const email = 'soundboard@example.test';
      await fixture.call('signup', { email, nickname: 'Efeitos', password: 'Senha12!' });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const account = (await fixture.call('login', { email, password: 'Senha12!' })).data;
      const library = [
        {
          id: fixture.soundId,
          name: 'Efeito.wav',
          ownerId: account.user.id,
          bytes: 32044,
          mime: 'audio/wav',
          kind: 'soundboard',
          durationMs: 1000,
        },
      ];
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        args: [
          '--no-sandbox',
          '--mute-audio',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
        ],
      });
      const context = await browser.newContext({
        permissions: ['microphone'],
        viewport: { width: 1440, height: 1000 },
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await context.addInitScript(
        ({ base, account }) => {
          window.TRONO_BACKEND_URL = base;
          sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(account));
          localStorage.setItem('tronoSfxEnabled', '0');
          localStorage.setItem('tronoMusicEnabled', '0');
          const NativeAudio = Audio,
            audios = [];
          window.__soundAudios = audios;
          window.__soundRevoked = [];
          window.__decodesClosed = 0;
          window.Audio = class extends NativeAudio {
            constructor(...args) {
              super(...args);
              this.__plays = 0;
              audios.push(this);
            }
            play() {
              this.__plays++;
              return super.play();
            }
          };
          const revoke = URL.revokeObjectURL;
          URL.revokeObjectURL = (url) => {
            window.__soundRevoked.push(url);
            revoke.call(URL, url);
          };
          const decode = AudioContext.prototype.decodeAudioData,
            close = AudioContext.prototype.close;
          AudioContext.prototype.decodeAudioData = function (...args) {
            this.__soundDecoder = true;
            return decode.apply(this, args);
          };
          AudioContext.prototype.close = function (...args) {
            if (this.__soundDecoder) window.__decodesClosed++;
            return close.apply(this, args);
          };
        },
        { base: fixture.base, account },
      );
      const page = await context.newPage(),
        errors = [];
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('dialog', (dialog) => dialog.accept());
      await page.route(fixture.base + '/files/**', async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.pathname === '/files/soundboard')
          return route.fulfill({ json: { files: library, hasMore: false } });
        if (url.pathname === '/files/upload') {
          const body = request.postDataBuffer(),
            result = validateSound(body);
          assert.equal(result.durationMs, 15000);
          uploads++;
          const record = {
            ...library[0],
            id: '40000000-0000-4000-8000-000000000001',
            name: 'Aplausos.wav',
            bytes: body.length,
            durationMs: result.durationMs,
          };
          library.push(record);
          return route.fulfill({ json: { file: record } });
        }
        if (url.pathname.endsWith('/url'))
          return route.fulfill({
            json: { url: origin + '/test-sound.wav', expiresAt: Date.now() + 300000 },
          });
        if (request.method() === 'DELETE') {
          const index = library.findIndex((file) => url.pathname.endsWith('/' + file.id));
          if (index >= 0) library.splice(index, 1);
          return route.fulfill({ json: {} });
        }
        return route.continue();
      });
      await page.route(origin + '/test-sound.wav', (route) =>
        route.fulfill({ body: wave(1), contentType: 'audio/wav' }),
      );
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      await page.evaluate(() => window.TronoCallSettings.open('resources'));
      await page.locator('#settingsSoundboardToggle').click();
      await expect(page.locator('.sound-card')).toHaveCount(1);
      await page
        .getByRole('searchbox', { name: 'Buscar efeitos sonoros', exact: true })
        .fill('inexistente');
      await expect(page.locator('.sound-card:visible')).toHaveCount(0);
      await page.getByRole('searchbox', { name: 'Buscar efeitos sonoros', exact: true }).fill('');
      await t.test(
        'a populated library stays compact and searchable at desktop, tablet and phone sizes',
        async () => {
          const original = [...library];
          library.push(
            ...Array.from({ length: 23 }, (_, i) => ({
              ...original[0],
              id: '51000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
              name:
                ['Uma salva de palmas bem longa', 'Risada surpresa', 'Som da vitória'][i % 3] +
                ' ' +
                i +
                '.wav',
            })),
          );
          await page.evaluate(async () => {
            window.TronoSoundboard.close();
            await window.TronoSoundboard.open();
          });
          await expect(page.locator('.sound-card')).toHaveCount(24);
          const menu = page.locator('#soundboardDialog');
          for (const [width, height] of [
            [1440, 900],
            [1024, 768],
            [768, 1024],
            [390, 844],
          ]) {
            await page.setViewportSize({ width, height });
            const box = await menu.boundingBox();
            assert(
              box.x >= 0 &&
                box.y >= 0 &&
                box.x + box.width <= width &&
                box.y + box.height <= height,
              JSON.stringify(box),
            );
            assert(
              await menu.evaluate((n) => n.scrollHeight <= n.clientHeight + 1),
              'Soundboard scroll stays inside its library',
            );
            assert(
              await page
                .locator('.sound-card')
                .first()
                .evaluate((n) => n.getBoundingClientRect().height <= 64),
            );
            await require('node:fs/promises').mkdir('artifacts/frontend-reset/refine-qa', {
              recursive: true,
            });
            await page.screenshot({
              path: 'artifacts/frontend-reset/refine-qa/soundboard-' + width + '.png',
            });
          }
          await page
            .getByRole('searchbox', { name: 'Buscar efeitos sonoros', exact: true })
            .fill('vitória');
          await expect(page.locator('.sound-card:visible')).toHaveCount(7);
          await page
            .getByRole('searchbox', { name: 'Buscar efeitos sonoros', exact: true })
            .fill('');
          library.splice(0, library.length, ...original);
          await page.evaluate(async () => {
            window.TronoSoundboard.close();
            await window.TronoSoundboard.open();
          });
          await page.setViewportSize({ width: 1440, height: 1000 });
          await expect(page.locator('.sound-card')).toHaveCount(1);
        },
      );
      await t.test(
        'real decoding and a 15 second selection retain the focused editor and encode valid PCM',
        async () => {
          await page.locator('#soundUploadDetails summary').click();
          await page.locator('#soundName').fill('Aplausos');
          await page
            .locator('#soundFile')
            .setInputFiles({ name: 'longo.wav', mimeType: 'audio/wav', buffer: wave(30) });
          await expect(page.locator('#soundTrimEditor')).toBeVisible();
          await expect(page.locator('#soundUpload')).toBeEnabled();
          await page.locator('#soundTrimEnd').fill('26');
          await page.locator('#soundTrimEnd').press('Tab');
          await expect(page.locator('#soundTrimStart')).toHaveValue('11');
          await expect(page.locator('#soundTrimDuration')).toHaveText('15.00 s / 15 s');
          assert.equal(uploads, 0);
          await page.locator('#soundTrimPreview').click();
          await expect(page.locator('#soundboardMessage')).toHaveText(
            'Ouvindo somente o trecho selecionado.',
          );
          await page.locator('#soundName').click();
          await expect(page.locator('#soundName')).toBeFocused();
          await page.locator('#soundUpload').click();
          await expect(page.locator('#soundboardMessage')).toHaveText(
            'Efeito adicionado à biblioteca.',
          );
          assert.equal(uploads, 1);
          await expect(page.locator('.sound-card')).toHaveCount(2);
          await expect(page.locator('#soundTrimEditor')).toBeHidden();
          assert.equal(await page.evaluate(() => window.__decodesClosed), 1);
          assert.equal(await page.evaluate(() => window.__soundRevoked.length), 1);
        },
      );
      await t.test(
        'local preview works outside a call; room playback requires joining and deafen controls only received audio',
        async () => {
          await expect(page.locator('[data-play-sound]').first()).toBeDisabled();
          await page.locator('.sound-preview').first().click();
          await expect(page.locator('#soundboardMessage')).toContainText('somente para você');
          await page.locator('#soundboardClose').click();
          await expect(page.locator('#soundboardDialog')).toBeHidden();
          await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
          await page.locator('button[data-voice-channel]').first().click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await page.locator('#soundboardToggle').click();
          await page.locator('#soundboardVolume').fill('35');
          await expect(page.locator('#soundboardVolumeValue')).toHaveText('35%');
          await page.locator('[data-play-sound="' + fixture.soundId + '"]').click();
          await expect
            .poll(() => page.evaluate(() => window.__soundAudios.at(-1)?.volume))
            .toBe(0.35);
          await page.locator('#soundboardClose').click();
          await page.locator('[data-control=deafenVoiceBtn]').click();
          await page.locator('#soundboardToggle').click();
          await page.locator('[data-play-sound="' + fixture.soundId + '"]').click();
          await expect.poll(() => page.evaluate(() => window.__soundAudios.at(-1)?.volume)).toBe(0);
          await page.locator('.sound-preview').first().click();
          await expect
            .poll(() => page.evaluate(() => window.__soundAudios.at(-1)?.volume))
            .toBe(0.35);
          await page.keyboard.press('Escape');
          await expect(page.locator('#soundboardDialog')).toBeHidden();
        },
      );
      await t.test(
        'the populated call panel remains compact from the sidebar and main call toolbar',
        async () => {
          const original = [...library];
          library.push(
            ...Array.from({ length: 22 }, (_, i) => ({
              ...original[0],
              id: '52000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
              name:
                ['Chuva de aplausos', 'Risada surpresa', 'Vitória na Corte'][i % 3] +
                ' ' +
                i +
                '.wav',
            })),
          );
          await page.locator('#soundboardToggle').click();
          await expect(page.locator('.sound-card')).toHaveCount(24);
          await page.screenshot({
            path: 'artifacts/frontend-reset/refine-qa/soundboard-sidebar-filled.png',
          });
          await page.keyboard.press('Escape');
          await page.locator('#callSoundboardToggle').click();
          await expect(page.locator('#soundboardDialog')).toBeVisible();
          for (const [width, height] of [
            [1440, 900],
            [1024, 768],
            [768, 1024],
            [390, 844],
          ]) {
            await page.setViewportSize({ width, height });
            await page.screenshot({
              path: 'artifacts/frontend-reset/refine-qa/soundboard-call-' + width + '.png',
            });
            const b = await page.locator('#soundboardDialog').boundingBox();
            assert(
              b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height,
              JSON.stringify(b),
            );
            assert(
              await page
                .locator('#soundboardDialog')
                .evaluate((n) => n.scrollHeight <= n.clientHeight + 1),
            );
          }
          await page.keyboard.press('Escape');
          library.splice(0, library.length, ...original);
          await page.setViewportSize({ width: 1440, height: 1000 });
        },
      );
      await t.test(
        'mobile editor remains within the viewport and page disposal releases its own player and URL',
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.getByRole('button', { name: 'Abrir canais', exact: true }).click();
          await page.locator('#soundboardToggle').click();
          const menu = await page.locator('#soundboardDialog').boundingBox();
          assert(menu.x >= 0 && menu.x + menu.width <= 391);
          await page.locator('#soundUploadDetails summary').click();
          await page
            .locator('#soundFile')
            .setInputFiles({ name: 'outro.wav', mimeType: 'audio/wav', buffer: wave(30) });
          await expect(page.locator('#soundUpload')).toBeEnabled();
          await page.locator('#soundTrimPreview').scrollIntoViewIfNeeded();
          await page.locator('#soundTrimPreview').click();
          await expect(page.locator('#soundboardMessage')).toHaveText(
            'Ouvindo somente o trecho selecionado.',
          );
          await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
          assert.equal(await page.evaluate(() => !!window.TronoSoundboard), false);
          await expect(page.locator('#soundboardDialog')).toHaveCount(0);
          assert.equal(await page.evaluate(() => window.__soundAudios.at(-1).paused), true);
          assert.equal(await page.evaluate(() => window.__soundRevoked.length), 2);
        },
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
