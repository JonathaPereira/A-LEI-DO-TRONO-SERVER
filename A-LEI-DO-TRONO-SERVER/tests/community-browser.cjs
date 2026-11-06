'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { presentAccount } = require('./auth-presentation-fixture.cjs');

test(
  'community preserves people, actions, voice notices and stable hosts in web and desktop layouts',
  { timeout: 120000 },
  async (t) => {
    const server = await new Promise((resolve) => {
      const listener = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(0, '127.0.0.1', () => resolve(listener));
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let fixture, browser;
    try {
      fixture = await startFixture({ port: 10973, appOrigin: origin });
      const creator = 'jonathapereira.jj@gmail.com',
        member = 'community-person@example.test';
      for (const [email, nickname] of [
        [creator, 'Criador'],
        [member, 'Participante'],
      ]) {
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
      }
      for (let i = 0; i < 24; i++)
        fixture.users.set('offline-' + i + '@example.test', {
          id: crypto.randomUUID(),
          email: 'offline-' + i + '@example.test',
          nickname: i ? 'Offline ' + i : '<img src=x onerror=alert(1)>',
          email_confirmed_at: new Date().toISOString(),
        });
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--mute-audio'],
      });
      async function context(email, native) {
        const initial = (await fixture.call('login', { email, password: 'Senha12!' })).data;
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.route('**/*', (route) =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort(),
        );
        await context.addInitScript(
          ({ base, initial, native }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoMusicEnabled', '0');
            if (native)
              window.TronoDesktop = {
                version: '0.13.0-alpha',
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
        return context;
      }
      const peerContext = await context(member, false),
        peer = await peerContext.newPage();
      await peer.goto(origin);
      await peer.waitForFunction(() => window.TronoCommunity?.getSnapshot().presence);
      const peerId = fixture.users.get(member).id;
      for (const native of [false, true])
        await t.test(native ? 'desktop' : 'web', async () => {
          const mainContext = await context(creator, native),
            page = await mainContext.newPage(),
            errors = [];
          page.setDefaultTimeout(10000);
          page.on('pageerror', (error) => errors.push(error.message));
          try {
            await page.goto(origin);
            await page.waitForFunction(() => window.TronoCommunity?.getSnapshot().presence);
            assert.deepEqual(
              await page.evaluate(() => {
                const s = window.TronoCommunity.getSnapshot();
                return {
                  online: s.presence.members.filter((p) => p.online).length,
                  offline: s.presence.members.filter((p) => !p.online).length,
                  scope: s.presence.scope,
                };
              }),
              { online: 2, offline: 24, scope: 'community' },
            );
            await page.getByRole('button', { name: 'Pessoas da Corte', exact: true }).click();
            await page.getByRole('button', { name: 'Comunidade', exact: true }).click();
            const row = page.locator('[data-person="' + peerId + '"]');
            await expect(
              row.getByRole('button', { name: 'Ver perfil de Participante', exact: true }),
            ).toBeVisible();
            await row
              .getByRole('button', { name: 'Ver perfil de Participante', exact: true })
              .focus();
            await page.keyboard.press('Enter');
            await expect(page.locator('#memberProfileDialog')).toBeVisible();
            await page.keyboard.press('Escape');
            await row.getByRole('button', { name: 'Alterar cargo de Participante' }).click();
            await expect(page.locator('#roleDialog')).toBeVisible();
            await page.locator('#roleSelect').selectOption('admin');
            await page.locator('#roleSave').click();
            await expect
              .poll(() =>
                page.evaluate(
                  (id) =>
                    window.TronoCommunity.getSnapshot().presence.members.find((p) => p.id === id)
                      .role,
                  peerId,
                ),
              )
              .toBe('admin');
            await row.getByRole('button', { name: 'Alterar cargo de Participante' }).click();
            await page.locator('#roleSelect').selectOption('member');
            await page.locator('#roleSave').click();
            await expect
              .poll(() =>
                page.evaluate(
                  (id) =>
                    window.TronoCommunity.getSnapshot().presence.members.find((p) => p.id === id)
                      .role,
                  peerId,
                ),
              )
              .toBe('member');
            await expect(page.locator('[data-person]')).toContainText(
              Array(1).fill('<img src=x onerror=alert(1)>'),
            );
            assert.equal(await page.locator('[data-person] img[src=x]').count(), 0);
            await page.evaluate(() => {
              window.__communityOwner = window.TronoCommunity;
              window.TronoMessenger.close();
              window.TronoCallNavigation.showChat();
            });
            const online = page
              .getByRole('complementary', { name: 'Membros da Corte' })
              .getByRole('button')
              .filter({ hasText: 'Participante' });
            await peer.evaluate(() => window.TronoNetwork.setActivity({ name: 'Jogo de efeitos' }));
            await expect(online).toContainText('Jogo de efeitos');
            await peer.evaluate(() => window.TronoNetwork.setActivity(null));
            await expect(online).not.toContainText('Jogo de efeitos');
            await peer.evaluate(() => window.TronoNetwork.disconnect());
            await expect
              .poll(() =>
                page.evaluate(
                  (id) =>
                    window.TronoCommunity.getSnapshot().presence.members.find((p) => p.id === id)
                      ?.online,
                  peerId,
                ),
              )
              .toBe(false);
            await peer.evaluate(() => window.TronoNetwork.connect());
            await expect
              .poll(() =>
                page.evaluate(
                  (id) =>
                    window.TronoCommunity.getSnapshot().presence.members.find((p) => p.id === id)
                      ?.online,
                  peerId,
                ),
              )
              .toBe(true);
            await page.evaluate(() => {
              for (let i = 0; i < 10; i++)
                window.TronoCommunity.voiceNotice({
                  id: 'notice-' + i,
                  kind: 'joined',
                  name: i ? 'Pessoa ' + i : '<img src=x onerror=alert(1)>',
                });
              window.TronoCommunity.voiceNotice({
                id: 'notice-9',
                kind: 'joined',
                name: 'Duplicate',
              });
            });
            assert.equal(
              await page.evaluate(() => window.TronoCommunity.getSnapshot().activities.length),
              8,
            );
            await expect(
              page.getByRole('region', { name: 'Avisos da Corte' }).getByRole('status'),
            ).toHaveCount(3);
            await expect(page.getByRole('region', { name: 'Avisos da Corte' })).not.toContainText(
              'Duplicate',
            );
            if (native)
              for (const topic of ['audio', 'account', 'audio']) {
                await page.evaluate((topic) => window.TronoCallSettings.open(topic), topic);
                assert.equal(
                  await page.evaluate(() => window.__communityOwner === window.TronoCommunity),
                  true,
                );
              }
            await page.evaluate(() => window.TronoCallSettings.close());
            await presentAccount(page, { permissions: { manageRoles: false } });
            await page.getByRole('button', { name: 'Pessoas da Corte', exact: true }).click();
            await page.getByRole('button', { name: 'Comunidade', exact: true }).click();
            await expect(page.getByRole('button', { name: /Alterar cargo de/ })).toHaveCount(0);
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#portalScreen')).toBeVisible();
            assert.equal(
              await page.evaluate(() => window.TronoCommunity.getSnapshot().presence),
              null,
            );
            await expect(
              page.getByRole('region', { name: 'Avisos da Corte' }).getByRole('status'),
            ).toHaveCount(0);
            assert.deepEqual(errors, []);
          } finally {
            await mainContext.close();
          }
        });
      await t.test('guest presence is restricted to game participants', async () => {
        const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        try {
          await guestContext.route('**/*', (route) =>
            new URL(route.request().url()).hostname === '127.0.0.1'
              ? route.continue()
              : route.abort(),
          );
          await guestContext.addInitScript((base) => {
            window.TRONO_BACKEND_URL = base;
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoMusicEnabled', '0');
          }, fixture.base);
          const page = await guestContext.newPage();
          page.setDefaultTimeout(10000);
          await page.goto(origin);
          await page.waitForFunction(() => window.TronoCommunity && window.TronoAuth?.ready);
          await page.evaluate(() => window.TronoAuth.ready);
          await page.getByRole('button', { name: 'Jogar como convidado' }).click();
          await page.locator('#guestNickname').fill('Convidado teste');
          await page.getByRole('button', { name: 'Escolher um jogo', exact: true }).click();
          await expect(page.locator('#gamesScreen')).toBeVisible();
          await peer.evaluate(() => window.TronoNetwork.joinRoom('sala-cetro'));
          await page.evaluate(() => window.TronoNetwork.joinRoom('sala-cetro'));
          await expect
            .poll(() =>
              page.evaluate(() => window.TronoCommunity.getSnapshot().presence?.members.length),
            )
            .toBe(2);
          const presence = await page.evaluate(() => window.TronoCommunity.getSnapshot().presence);
          assert.equal(presence.scope, 'game');
          assert(presence.members.some((p) => p.name === 'Participante'));
          assert.equal(presence.members.filter((p) => p.guest).length, 1);
          assert.equal(
            await page.evaluate(() => window.TronoCommunity.getSnapshot().identity.manageRoles),
            false,
          );
          await page.evaluate(() => window.TronoAuth.endGuest());
          await expect(page.locator('#portalScreen')).toBeVisible();
          assert.equal(
            await page.evaluate(
              () => window.TronoCommunity.getSnapshot().presence?.members.length ?? 0,
            ),
            0,
          );
        } finally {
          await guestContext.close();
        }
      });
      await peerContext.close();
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
