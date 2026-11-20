'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'the file library preserves downloads, protected profile media and account isolation in both settings hosts',
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
      fixture = await startFixture({ port: 10941, appOrigin: origin });
      const emails = ['library-first@example.test', 'library-second@example.test'];
      for (const [index, email] of emails.entries()) {
        await fixture.registerAccount({
          email,
          nickname: 'Biblioteca ' + index,
          password: 'Senha12!',
        });
      }
      const ids = ['avatar', 'cover', 'background', 'download', 'expired', 'stale'].map(
        (_, index) => '20000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
      );
      const firstUser = fixture.users.get(emails[0]);
      firstUser.avatar_file_id = ids[0];
      firstUser.personalization = { cover_file_id: ids[1], background_file_id: ids[2] };
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
      });

      for (const native of [false, true]) {
        await t.test(native ? 'desktop settings host' : 'web profile host', async () => {
          const initial = (await fixture.call('login', { email: emails[0], password: 'Senha12!' }))
            .data;
          const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
          const errors = [],
            deletes = [],
            urls = [];
          let held = null,
            holdMine = false,
            currentFiles;
          const record = (id, name, ownerId = firstUser.id) => ({
            id,
            name,
            bytes: 1_500_000,
            mime: 'application/octet-stream',
            kind: 'chat',
            ownerId,
            createdAt: '2026-10-18T12:00:00Z',
          });
          currentFiles = ids.map((id, index) =>
            record(
              id,
              ['Avatar', 'Capa', 'Fundo', 'Documento', 'Link vencido', 'Arquivo antigo'][index] +
                '.bin',
            ),
          );
          try {
            await context.route('**/*', (route) =>
              new URL(route.request().url()).hostname === '127.0.0.1'
                ? route.continue()
                : route.abort(),
            );
            await context.route('**/files/**', async (route) => {
              const request = route.request(),
                url = new URL(request.url());
              if (request.method() === 'OPTIONS') {
                return route.fulfill({
                  status: 204,
                  headers: {
                    'access-control-allow-origin': origin,
                    'access-control-allow-methods': 'GET, DELETE, OPTIONS',
                    'access-control-allow-headers': 'authorization',
                  },
                });
              }
              const reply = (json, status = 200) => route.fulfill({ status, json });
              if (url.pathname.endsWith('/status')) return reply({ used: 1_500_000_000 });
              if (url.pathname.endsWith('/mine')) {
                const result = { files: [...currentFiles], hasMore: true };
                if (holdMine) {
                  holdMine = false;
                  held = { route, result };
                  return;
                }
                return reply(result);
              }
              const id = url.pathname.split('/')[2];
              if (request.method() === 'DELETE') {
                deletes.push(id);
                currentFiles = currentFiles.filter((file) => file.id !== id);
                return reply({ deleted: true });
              }
              if (url.pathname.endsWith('/url')) {
                urls.push({ id, download: url.searchParams.get('download') });
                if (id === ids[4])
                  return reply({ error: { message: 'O link de teste expirou.' } }, 503);
                return reply({
                  url: origin + '/library-download/' + id,
                  expiresAt: Date.now() + 3600000,
                });
              }
              return reply({ error: { message: 'Arquivo desconhecido.' } }, 404);
            });
            await context.route('**/library-download/*', (route) =>
              route.fulfill({
                contentType: 'application/octet-stream',
                headers: { 'content-disposition': 'attachment; filename="Documento.bin"' },
                body: 'download regression',
              }),
            );
            await context.addInitScript(
              ({ base, initial, native }) => {
                window.TRONO_BACKEND_URL = base;
                sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
                localStorage.setItem('tronoMusicEnabled', '0');
                localStorage.setItem('tronoSfxEnabled', '0');
                window.__librarySockets = [];
                window.__libraryOpened = [];
                const Original = window.WebSocket;
                window.WebSocket = class extends Original {
                  constructor(...args) {
                    super(...args);
                    window.__librarySockets.push(this);
                  }
                };
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
                    openAttachment: async ({ url }) => window.__libraryOpened.push(url),
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
            await expect.poll(() => page.evaluate(() => window.TronoNetwork.connected)).toBe(true);
            await page.evaluate(() => window.TronoProfile.open({ inline: true }));
            async function openFiles() {
              await page.evaluate(() => window.TronoCallSettings.open('files'));
              await expect(
                page.getByRole('button', { name: 'Ver meus arquivos', exact: true }),
              ).toBeVisible();
            }
            await openFiles();
            const refresh = page
              .locator('.profile-files-load')
              .filter({ hasText: 'Ver meus arquivos' });
            await refresh.click();
            await expect(page.locator('#storageUsage')).toHaveText(
              'Uso compartilhado: 1.50 GB de 8 GB.',
            );
            await expect(page.locator('#profileFiles .profile-file-row')).toHaveCount(6);
            await expect(page.locator('#profileFiles')).toContainText('200 arquivos mais recentes');
            const row = (name) => page.locator('.profile-file-row').filter({ hasText: name });
            for (const name of ['Avatar.bin', 'Capa.bin', 'Fundo.bin'])
              await expect(
                row(name).getByRole('button', { name: 'Excluir', exact: true }),
              ).toBeDisabled();
            await expect(
              row('Documento.bin').getByRole('button', { name: 'Documento.bin', exact: false }),
            ).toContainText('1.5 MB');
            await page.evaluate(() => {
              window.__libraryNodes = ['storageUsage', 'profileFiles'].map((id) =>
                document.getElementById(id),
              );
              window.__libraryOwner = window.TronoFileLibrary;
            });
            await page.locator('[data-settings-tab=audio]').click();
            await page.locator('[data-settings-tab=files]').click();
            assert.equal(
              await page.evaluate(
                () =>
                  window.__libraryNodes.every(
                    (node) => node === document.getElementById(node.id),
                  ) && window.__libraryOwner === window.TronoFileLibrary,
              ),
              true,
            );

            if (native) {
              await row('Documento.bin')
                .getByRole('button', { name: 'Documento.bin', exact: false })
                .click();
              await expect
                .poll(() => page.evaluate(() => window.__libraryOpened))
                .toEqual([origin + '/library-download/' + ids[3]]);
            } else {
              const download = context
                .waitForEvent('page')
                .then((popup) => popup.waitForEvent('download'));
              await row('Documento.bin')
                .getByRole('button', { name: 'Documento.bin', exact: false })
                .click();
              assert.equal((await download).suggestedFilename(), 'Documento.bin');
            }
            assert.deepEqual(
              urls.find((request) => request.id === ids[3]),
              { id: ids[3], download: '1' },
            );
            await row('Link vencido.bin')
              .getByRole('button', { name: 'Link vencido.bin', exact: false })
              .click();
            await expect(page.locator('#profileFilesMessage')).toHaveText(
              'O link de teste expirou.',
            );
            if (native) assert.equal(await page.evaluate(() => window.__libraryOpened.length), 1);
            await row('Documento.bin')
              .getByRole('button', { name: 'Excluir', exact: true })
              .click();
            await expect(row('Documento.bin')).toHaveCount(0);
            assert.deepEqual(deletes, [ids[3]]);

            holdMine = true;
            await refresh.click();
            await expect.poll(() => Boolean(held)).toBe(true);
            await page.evaluate((id) => {
              const socket = window.__librarySockets.find(
                (socket) => socket.readyState === WebSocket.OPEN,
              );
              if (!socket) throw new Error('The real authenticated socket is not connected.');
              socket.dispatchEvent(
                new MessageEvent('message', {
                  data: JSON.stringify({ type: 'attachment-deleted', id }),
                }),
              );
            }, ids[5]);
            await held.route.fulfill({ json: held.result });
            held = null;
            await expect
              .poll(() => page.evaluate(() => window.TronoFileLibrary.getSnapshot().loading))
              .toBe(false);
            await expect(row('Arquivo antigo.bin')).toHaveCount(0);
            await expect(row('Avatar.bin')).toHaveCount(1);

            holdMine = true;
            await refresh.click();
            await expect.poll(() => Boolean(held)).toBe(true);
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#authEmail')).toBeVisible();
            await page.locator('#authEmail').fill(emails[1]);
            await page.locator('#authPassword').fill('Senha12!');
            await page.locator('#authSubmit').click();
            await expect
              .poll(() => page.evaluate(() => window.TronoAuth.user?.email))
              .toBe(emails[1]);
            await held.route.fulfill({ json: held.result });
            held = null;
            await openFiles();
            await expect(page.locator('#profileFiles .profile-file-row')).toHaveCount(0);
            currentFiles = [
              record(
                '20000000-0000-4000-8000-000000000099',
                'Outra conta.bin',
                fixture.users.get(emails[1]).id,
              ),
            ];
            await refresh.click();
            await expect(page.locator('#profileFiles .profile-file-row')).toHaveCount(1);
            await expect(row('Outra conta.bin')).toBeVisible();
            await expect(row('Avatar.bin')).toHaveCount(0);
            await expect(
              row('Outra conta.bin').getByRole('button', { name: 'Excluir', exact: true }),
            ).toBeEnabled();
            assert.deepEqual(errors, []);
          } finally {
            if (held) await held.route.fulfill({ json: held.result }).catch(() => {});
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
