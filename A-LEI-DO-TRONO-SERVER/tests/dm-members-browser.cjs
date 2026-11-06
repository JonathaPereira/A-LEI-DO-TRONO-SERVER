'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const express = require('express'),
  path = require('node:path'),
  fs = require('node:fs/promises');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'DM portraits and the persistent community sidebar preserve account and call ownership',
  { timeout: 100000 },
  async (t) => {
    const server = express()
      .use(express.static(path.resolve('out')))
      .listen(0, '127.0.0.1');
    await new Promise((r) => server.on('listening', r));
    const origin = 'http://127.0.0.1:' + server.address().port;
    await fs.mkdir('artifacts/dm-members', { recursive: true });
    const fixture = await startFixture({ port: 11983, appOrigin: origin });
    let browser;
    try {
      const accounts = [];
      const avatarIds = [
        '31000000-0000-4000-8000-000000000001',
        '31000000-0000-4000-8000-000000000002',
      ];
      for (const [index, name] of ['Ana', 'Bruno', 'Caio'].entries()) {
        const email = 'dm-members-' + index + '@example.test';
        await fixture.call('signup', { email, nickname: name, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        const user = fixture.users.get(email);
        user.avatar_preset = ['cat', 'dragon', 'shield'][index];
        user.avatar_file_id = avatarIds[index] || null;
        accounts.push((await fixture.call('login', { email, password: 'Senha12!' })).data);
      }
      const [ana, bob, caio] = accounts;
      const api = async (account, action, body) => {
        const response = await fetch(fixture.base + '/social/' + action, {
          method: 'POST',
          headers: {
            Origin: origin,
            Authorization: 'Bearer ' + account.session.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 200, await response.clone().text());
        return response.json();
      };
      for (const peer of [bob, caio]) {
        await api(ana, 'friend', { peerId: peer.user.id, action: 'request' });
        await api(peer, 'friend', { peerId: ana.user.id, action: 'accept' });
      }
      const ownId = crypto.randomUUID(),
        peerId = crypto.randomUUID(),
        otherId = crypto.randomUUID();
      await api(ana, 'send', {
        id: ownId,
        peerId: bob.user.id,
        text: 'Mensagem de Ana',
        roomId: null,
        attachmentId: null,
      });
      await api(bob, 'send', {
        id: peerId,
        peerId: ana.user.id,
        text: 'Resposta de Bruno',
        roomId: null,
        attachmentId: null,
      });
      await api(caio, 'send', {
        id: otherId,
        peerId: ana.user.id,
        text: 'Conversa com Caio',
        roomId: null,
        attachmentId: null,
      });
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH ||
          (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--mute-audio',
        ],
      });
      const errors = [];
      async function client(data) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          permissions: ['microphone'],
        });
        await context.route('**/*', (route) =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort(),
        );
        await context.route('**/files/*/url', (route) => {
          const id = new URL(route.request().url()).pathname.split('/')[2];
          return route.fulfill({
            json: { url: origin + '/portrait/' + id, expiresAt: Date.now() + 3600000 },
          });
        });
        const artwork = await fs.readFile('public/assets/azul/box-cover.webp');
        await context.route('**/portrait/*', (route) =>
          route.fulfill({ contentType: 'image/webp', body: artwork }),
        );
        await context.addInitScript(
          ({ base, data }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoNoiseSuppression', '0');
          },
          { base: fixture.base, data },
        );
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(origin);
        await page.waitForFunction(
          () => window.TronoCommunity?.getSnapshot().presence?.directoryReady,
        );
        return { context, page };
      }
      const self = await client(ana),
        peer = await client(bob),
        page = self.page;
      await page.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      const media = () =>
        page.evaluate(() => ({
          socket: window.TronoNetwork.clientId,
          microphone: window.TronoSocial.getLocalAudioTrack()?.id,
        }));
      const initial = await media();
      assert(initial.microphone);
      await t.test(
        'both authors use their uploaded portraits and an offline peer uses their preset',
        async () => {
          await page.evaluate((id) => window.TronoMessenger.open(id), bob.user.id);
          for (const [id, name, avatar] of [
            [ownId, 'Ana', avatarIds[0]],
            [peerId, 'Bruno', avatarIds[1]],
          ]) {
            const message = page.locator('article[data-message-id="' + id + '"]');
            await expect(message).toBeVisible();
            const portrait = message
              .getByLabel('Avatar de ' + name, { exact: true })
              .locator('img');
            await expect(portrait).toBeVisible();
            await expect(portrait).toHaveAttribute('src', origin + '/portrait/' + avatar);
            assert(await portrait.evaluate((img) => img.complete && img.naturalWidth > 0));
            const box = await portrait.boundingBox();
            assert(Math.abs(box.width - box.height) <= 1 && box.width >= 30 && box.width <= 40);
          }
          await page.screenshot({ path: 'artifacts/dm-members/direct-avatars.png' });
          await page.evaluate((id) => window.TronoMessenger.open(id), caio.user.id);
          const other = page.locator('article[data-message-id="' + otherId + '"]');
          await expect(
            other.getByLabel('Avatar de Caio', { exact: true }).locator('svg'),
          ).toBeVisible();
          await expect(other.locator('img')).toHaveCount(0);
          assert.deepEqual(await media(), initial);
        },
      );
      await t.test(
        'online and offline people stay accessible across calls, conversations, library and games',
        async () => {
          await page.getByRole('button', { name: 'Voltar à chamada', exact: true }).click();
          const panel = page.getByRole('complementary', { name: 'Membros da Corte', exact: true });
          await expect(panel).toBeVisible();
          await expect(
            page.getByRole('button', { name: 'Ocultar membros', exact: true }),
          ).toHaveAttribute('aria-expanded', 'true');
          await expect(panel.getByRole('region', { name: 'Online', exact: true })).toContainText(
            'Ana',
          );
          await expect(panel.getByRole('region', { name: 'Online', exact: true })).toContainText(
            'Bruno',
          );
          await expect(panel.getByRole('region', { name: 'Offline', exact: true })).toContainText(
            'Caio',
          );
          await page.screenshot({ path: 'artifacts/dm-members/call-members.png' });
          await page.getByRole('button', { name: 'Ocultar membros', exact: true }).click();
          await expect(panel).toBeHidden();
          await page.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
          await expect(panel).toBeHidden();
          await page.getByRole('button', { name: 'Mostrar membros', exact: true }).click();
          await expect(panel).toBeVisible();
          await page.locator('button[data-game=throne]').click();
          await expect(page.locator('#setupScreen')).toBeVisible();
          await expect(panel).toBeVisible();
          const board = await page.locator('#setupScreen').boundingBox(),
            members = await panel.boundingBox();
          assert(
            board.x + board.width <= members.x + 1,
            'The sidebar reserves room instead of covering the game',
          );
          await panel
            .getByRole('button', { name: 'Ocultar lista de membros', exact: true })
            .click();
          await expect(panel).toBeHidden();
          await page.getByRole('button', { name: 'Mostrar membros', exact: true }).click();
          await expect(panel).toBeVisible();
          await page.locator('#backFromLobbyBtn').click();
          await peer.page.evaluate(() => window.TronoNetwork.disconnect());
          await expect(panel.getByRole('region', { name: 'Offline', exact: true })).toContainText(
            'Bruno',
          );
          await expect(panel.getByRole('region', { name: 'Offline', exact: true })).toContainText(
            'Caio',
          );
          await expect(
            panel.getByRole('region', { name: 'Online', exact: true }),
          ).not.toContainText('Bruno');
          await panel.getByRole('button', { name: 'Ver perfil de Caio', exact: true }).click();
          await expect(page.locator('#memberProfileDialog')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.locator('#memberProfileDialog')).toBeHidden();
          await expect(panel).toBeVisible();
          await page.setViewportSize({ width: 390, height: 844 });
          await expect(panel).toBeVisible();
          await page.screenshot({ path: 'artifacts/dm-members/mobile-members.png' });
          const compact = await panel.boundingBox();
          assert(compact.x >= 0 && compact.x + compact.width <= 390);
          await panel
            .getByRole('button', { name: 'Ocultar lista de membros', exact: true })
            .click();
          await expect(panel).toBeHidden();
          await page.getByRole('button', { name: 'Mostrar membros', exact: true }).click();
          await expect(panel).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(panel).toBeHidden();
          assert.deepEqual(await media(), initial);
          await page.evaluate(() => window.TronoAuth.logout());
          await expect(panel).toBeHidden();
        },
      );
      assert.deepEqual(errors, []);
      await peer.context.close();
      await self.context.close();
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
