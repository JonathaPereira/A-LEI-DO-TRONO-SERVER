'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

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
            await page.locator('#communityToggle').click();
            await expect(page.locator('#communityPanel')).toBeVisible();
            await expect(page.locator('#communitySummary')).toHaveText('2 online · 24 offline');
            await expect(page.locator('#communityScope')).toHaveText(
              'Comunidade · contas confirmadas',
            );
            const row = page.locator('[data-person-id="' + peerId + '"]');
            await expect(row.locator('strong')).toHaveText('Participante');
            await expect(row.locator('.role-edit-btn')).toBeVisible();
            await row.locator('.profile-avatar-clickable').focus();
            await page.keyboard.press('Enter');
            await expect(page.locator('#memberProfileDialog')).toBeVisible();
            await page.keyboard.press('Escape');
            await page.locator('#communityToggle').click();
            await row.locator('.community-message-btn').click();
            await expect(page.locator('#messengerPanel')).toBeVisible();
            await page.evaluate(() => window.TronoMessenger.close());
            await row.locator('.role-edit-btn').click();
            await expect(page.locator('#roleDialog')).toBeVisible();
            await expect(page.locator('#rolePersonId')).toHaveValue(peerId);
            await page.locator('#roleSelect').selectOption('admin');
            await page.locator('#roleSave').click();
            await expect(row.locator('.role-badge')).toHaveText('Admin');
            await row.locator('.role-edit-btn').click();
            await page.locator('#roleSelect').selectOption('member');
            await page.locator('#roleSave').click();
            await expect(row.locator('.role-badge')).toHaveText('Membro');
            await page.locator('#communityMembers summary').click();
            await expect(page.locator('#communityMembers details strong').first()).toHaveText(
              '<img src=x onerror=alert(1)>',
            );
            await expect(page.locator('#communityMembers details img')).toHaveCount(0);
            await page.evaluate(() => {
              const members = document.getElementById('communityMembers');
              members.scrollTop = 160;
              window.__communityBefore = {
                members,
                toggle: document.getElementById('communityToggle'),
                panel: document.getElementById('communityPanel'),
                owner: window.TronoCommunity,
                scroll: members.scrollTop,
              };
            });
            await peer.evaluate(() => window.TronoNetwork.setActivity({ name: 'Jogo de efeitos' }));
            await expect(row.locator('.community-game-activity')).toContainText('Jogo de efeitos');
            assert.equal(
              await page.evaluate(() => {
                const before = window.__communityBefore;
                return (
                  before.members === document.getElementById('communityMembers') &&
                  before.members.scrollTop === before.scroll &&
                  before.members.querySelector('details').open
                );
              }),
              true,
            );
            await peer.evaluate(() => window.TronoNetwork.setActivity(null));
            await expect(row.locator('.community-game-activity')).toHaveCount(0);
            await peer.evaluate(() => window.TronoNetwork.joinRoom('sala-cetro'));
            const gameIcons = page.locator(
              'article.room-card[data-room="sala-cetro"] .room-presence-icons',
            );
            await expect(gameIcons.locator('.community-avatar')).toHaveCount(1);
            await expect(gameIcons.locator('.community-avatar')).toHaveAttribute(
              'title',
              'Participante',
            );
            await peer.evaluate(() => window.TronoNetwork.leaveGameRoom());
            await expect(gameIcons.locator('.community-avatar')).toHaveCount(0);
            await peer.evaluate(() => window.TronoNetwork.disconnect());
            await expect(row).toHaveClass('community-person is-offline');
            await peer.evaluate(() => window.TronoNetwork.connect());
            await expect(row).toHaveClass('community-person is-online');
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
            await expect(page.locator('#communityActivity li')).toHaveCount(8);
            await expect(page.locator('#callNoticeHost > div')).toHaveCount(3);
            await expect(page.locator('#callNoticeHost')).not.toContainText('Duplicate');
            if (native)
              for (const layout of ['discord', 'original']) {
                await page.evaluate((layout) => window.TronoAppLayout.apply(layout), layout);
                assert.equal(
                  await page.evaluate(() => {
                    const before = window.__communityBefore;
                    return (
                      before.members === document.getElementById('communityMembers') &&
                      before.toggle === document.getElementById('communityToggle') &&
                      before.panel === document.getElementById('communityPanel') &&
                      before.owner === window.TronoCommunity
                    );
                  }),
                  true,
                );
              }
            await fs.mkdir(path.resolve(__dirname, '../artifacts'), { recursive: true });
            await page.screenshot({
              path: path.resolve(
                __dirname,
                '../artifacts/community-' + (native ? 'desktop' : 'web') + '.png',
              ),
            });
            await page.evaluate(() => {
              window.TronoAuth.user.permissions.manageRoles = false;
              window.dispatchEvent(new Event('trono-role-change'));
            });
            await expect(page.locator('#communityMembers .role-edit-btn')).toHaveCount(0);
            await page.setViewportSize({ width: 900, height: 700 });
            await expect(page.locator('#communityPanel')).toBeHidden();
            await page.locator('#communityToggle').click();
            await page.keyboard.press('Escape');
            await expect(page.locator('#communityPanel')).toBeHidden();
            await page.evaluate(() => window.TronoAuth.logout());
            await expect(page.locator('#communityToggle')).toBeHidden();
            await expect(page.locator('#communityMembers .community-person')).toHaveCount(0);
            await expect(page.locator('#communityActivity li')).toHaveCount(0);
            await expect(page.locator('#callNoticeHost > div')).toHaveCount(0);
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
          await expect(page.locator('#communityToggle')).toBeHidden();
          await page.evaluate(() => window.TronoAuth.openGuest());
          await page.locator('#guestNickname').fill('Convidado teste');
          await page.locator('#guestSubmit').click();
          await expect(page.locator('#guestDialog')).toBeHidden();
          await peer.evaluate(() => window.TronoNetwork.joinRoom('sala-cetro'));
          await page.evaluate(() => window.TronoNetwork.joinRoom('sala-cetro'));
          await page.locator('#communityToggle').click();
          await expect(page.locator('#communityScope')).toHaveText(
            'Convidado: participantes das salas do jogo',
          );
          await expect(page.locator('#communityMembers .community-person')).toHaveCount(2);
          await expect(page.locator('#communityMembers')).toContainText('Participante');
          await expect(page.locator('#communityMembers')).toContainText('Convidado teste');
          await expect(page.locator('#communityMembers details')).toHaveCount(0);
          await expect(page.locator('#communityMembers .role-edit-btn')).toHaveCount(0);
          await expect(page.locator('#communityMembers .community-guest-tag')).toHaveCount(1);
          await page.evaluate(() => document.getElementById('accountGuestExitBtn').click());
          await expect(page.locator('#communityToggle')).toBeHidden();
          await expect(page.locator('#communityMembers .community-person')).toHaveCount(0);
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
