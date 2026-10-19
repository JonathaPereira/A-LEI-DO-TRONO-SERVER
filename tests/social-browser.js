'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  express = require('express');
const { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
async function toggleMessenger(page) {
  if (await page.locator('#messengerPanel').isVisible()) {
    await page.locator('#messengerClose').click();
    return;
  }
  if (await page.locator('#messengerToggle').isVisible()) {
    await page.locator('#messengerToggle').click();
    return;
  }
  const selected = await page.evaluate(() => window.TronoDirectMessages.getSnapshot().peerId);
  const friends = page.locator('#workspaceDirectOpen');
  if (!(await friends.isVisible())) await page.locator('#workspaceSidebarBtn').click();
  await friends.click();
  if (selected)
    await page
      .locator('.messenger-person[data-peer-id="' + selected + '"] .messenger-person-main')
      .click();
}

test(
  'friends, direct messages, notifications, invitations and account volumes remain independent of a live call',
  { timeout: 120000 },
  async (t) => {
    const host = express();
    host.use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((resolve) => {
        const s = host.listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 10699, appOrigin: origin });
    let browser;
    const errors = [];
    try {
      const accounts = [];
      for (const [email, nickname] of [
        ['Jonathapereira.jj@gmail.com', 'Ana Desktop'],
        ['bob@example.test', 'Bruno'],
        ['third@example.test', 'Terceiro'],
      ]) {
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        accounts.push((await fixture.call('login', { email, password: 'Senha12!' })).data);
      }
      const [ana, bob, third] = accounts;
      const api = async (action, body, account = ana, requestOrigin = origin) => {
        const res = await fetch(fixture.base + '/social/' + action, {
          method: 'POST',
          headers: {
            Origin: requestOrigin,
            Authorization: 'Bearer ' + account.session.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        return { status: res.status, data: await res.json() };
      };
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        headless: true,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      async function client(data) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
        });
        await context.route('**/*', (r) =>
          ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname)
            ? r.continue()
            : r.abort(),
        );
        await context.addInitScript(
          ({ backend, data }) => {
            window.TRONO_BACKEND_URL = backend;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            window.__focused = true;
            document.hasFocus = () => window.__focused;
            window.__notifications = [];
            window.Notification = class {
              static permission = 'granted';
              constructor(title, data) {
                window.__notifications.push({ title, ...data });
              }
              close() {}
            };
          },
          { backend: fixture.base, data },
        );
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('dialog', (dialog) => dialog.accept());
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await expect(page.locator('#messengerToggle')).toBeVisible();
        return { context, page };
      }
      const a = await client(ana),
        b = await client(bob),
        c = await client(third),
        p = a.page,
        q = b.page;
      async function check(name, run) {
        await t.test(name, async () => {
          try {
            await run();
          } catch (error) {
            console.error(name, error.message);
            await p
              .screenshot({ path: path.resolve(__dirname, '../artifacts/social-failure.png') })
              .catch(() => {});
            throw error;
          }
        });
      }
      await check(
        'friend approval and private text preserve the microphone and voice room',
        async () => {
          for (const page of [p, q]) {
            await page.locator('#openVoicePortalBtn').click();
            await page.locator('#joinVoiceBtn').click();
            await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          }
          await expect(p.locator('#voiceRoster .voice-person')).toHaveCount(2);
          await p.evaluate(() => {
            window.__mic = window.TronoSocial.getLocalAudioTrack();
            window.__primary = window.TronoNetwork.primaryRoom;
          });
          await toggleMessenger(p);
          await p.locator('#messengerSearch').fill('Bruno');
          await p.locator('#messengerSearchResults button').click();
          await expect(p.locator('#messengerStatus')).toHaveText('Pedido de amizade enviado.');
          await toggleMessenger(q);
          await q.locator('#messengerList button').filter({ hasText: 'Aceitar' }).click();
          await expect(q.locator('#messengerList')).not.toContainText('Pedido recebido');
          await p
            .locator('#messengerList .messenger-person-main')
            .filter({ hasText: 'Bruno' })
            .click();
          await expect(p.locator('#messengerInput')).toBeEnabled();
          await p.locator('#messengerInput').fill('Uma conversa privada durante a chamada');
          await q.locator('#messengerClose').click();
          await q.evaluate(() => (window.__focused = false));
          await p.locator('#messengerInput').press('Enter');
          await expect(p.locator('#messengerMessages')).toContainText(
            'Uma conversa privada durante a chamada',
          );
          await expect.poll(() => q.evaluate(() => window.__notifications.length)).toBe(1);
          await expect(q.locator('#messengerUnread')).toHaveText('1');
          await expect(q.locator('#messengerToggle svg')).toHaveCount(1);
          assert.equal((await api('read', { peerId: ana.user.id }, third)).status, 403);
          assert.equal((await api('snapshot', {}, third)).data.threads.length, 0);
          assert.equal((await api('snapshot', {}, ana, 'https://foreign.test')).status, 403);
          await q.evaluate(() => (window.__focused = true));
          await toggleMessenger(q);
          await q
            .locator('#messengerList .messenger-person-main')
            .filter({ hasText: 'Ana Desktop' })
            .click();
          await expect(q.locator('#messengerMessages')).toContainText(
            'Uma conversa privada durante a chamada',
          );
          await expect(q.locator('#messengerToggle')).toHaveText('Amigos');
          assert(
            await p.evaluate(
              () =>
                window.TronoNetwork.primaryRoom === window.__primary &&
                window.TronoSocial.getLocalAudioTrack() === window.__mic &&
                window.__mic.readyState === 'live',
            ),
          );
          assert(await q.evaluate(() => window.TronoSocial.voiceJoined));
        },
      );
      await check(
        'individual volume survives nickname changes and peer reconnection by account',
        async () => {
          await p.locator('#messengerClose').click();
          await q.locator('#messengerClose').click();
          const peer = await q.evaluate(() => window.TronoNetwork.clientId);
          const card = p.locator('#voiceRoster [data-peer="' + peer + '"]');
          await card.locator('.participant-expand').click();
          const slider = card.locator('[data-peer-volume]');
          await slider.evaluate((el) => {
            el.value = '215';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await expect(card.locator('output')).toHaveText('215%');
          await fixture.call(
            'profile',
            { nickname: 'Bruno Novo', avatar_preset: 'crown' },
            bob.session.access_token,
          );
          await expect(card.locator(':scope > strong')).toHaveText('Bruno Novo');
          await expect(slider).toHaveValue('215');
          await q.reload();
          await q.waitForFunction(() => window.TronoAuth?.ready);
          await q.evaluate(() => window.TronoAuth.ready);
          await q.waitForFunction(() => window.TronoAuth?.ready);
          await q.evaluate(() => window.TronoAuth.ready);
          await expect(q.locator('#callWorkspace')).toBeVisible();
          await expect
            .poll(() => q.evaluate(() => window.TronoNetwork?.currentRoom))
            .toBe('chat-livre');
          if (!(await q.evaluate(() => window.TronoSocial.voiceJoined)))
            await q.locator('#joinVoiceBtn').click();
          await expect.poll(() => q.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          const next = await q.evaluate(() => window.TronoNetwork.clientId);
          assert.notEqual(next, peer);
          const newCard = p.locator('#voiceRoster [data-peer="' + next + '"]');
          await newCard.locator('.participant-expand').click();
          await expect(newCard.locator('[data-peer-volume]')).toHaveValue('215');
          assert.equal(
            await p.evaluate((id) => window.TronoPersonal.get('volume:' + id), bob.user.id),
            215,
          );
          assert.equal(
            await q.evaluate((id) => window.TronoPersonal.get('volume:' + id, 100), ana.user.id),
            100,
          );
        },
      );
      await check(
        'channel mentions, unread counts and per-channel mute persist independently',
        async () => {
          await toggleMessenger(q);
          await q
            .locator('#messengerList .messenger-person-main')
            .filter({ hasText: 'Ana Desktop' })
            .click();
          await q.locator('#messengerClose').click();
          await q.evaluate(() => (window.__focused = false));
          await p.evaluate(() => window.TronoNetwork.sendChat('@Bruno Novo veja esta mensagem'));
          await expect.poll(() => q.evaluate(() => window.__notifications.length)).toBe(1);
          await expect(q.locator('[data-chat-channel="chat-livre"] .channel-unread')).toHaveText(
            '1',
          );
          await q.evaluate(() => window.TronoNotifications.mute('chat-livre', true));
          await p.waitForTimeout(500);
          await p.evaluate(() => window.TronoNetwork.sendChat('@Bruno Novo sem aviso'));
          await expect(q.locator('[data-chat-channel="chat-livre"] .channel-unread')).toHaveText(
            '2',
          );
          assert.equal(await q.evaluate(() => window.__notifications.length), 1);
          await q.evaluate(() => (window.__focused = true));
          if (!(await q.locator('#courtChatInput').isVisible()))
            await q.locator('#chatOnlyTextBtn').click();
          await q.locator('#courtChatInput').click();
          await expect(q.locator('[data-chat-channel="chat-livre"] .channel-unread')).toHaveCount(
            0,
          );
          assert.equal(await q.evaluate(() => window.TronoNotifications.muted('chat-livre')), true);
        },
      );
      await check(
        'invitations switch only the text selection, preserve voice, and narrow profiles stay usable',
        async () => {
          const create = await fetch(fixture.base + '/community/channels', {
            method: 'POST',
            headers: {
              Origin: origin,
              Authorization: 'Bearer ' + ana.session.access_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: 'Fotos', type: 'text', description: '' }),
          });
          const created = await create.json(),
            channel = created.channel || created;
          await expect(p.locator('[data-chat-channel="' + channel.id + '"]')).toBeVisible();
          await toggleMessenger(p);
          await p.locator('#messengerInvite').click();
          await p.locator('#messengerInviteChannel').selectOption(channel.id);
          await p.locator('#messengerInviteSend').click();
          await expect(p.locator('#messengerMessages')).toContainText('Convite para Fotos');
          await toggleMessenger(q);
          await expect(q.locator('#messengerMessages')).toContainText('Convite para Fotos');
          await q
            .locator('#messengerMessages button')
            .filter({ hasText: 'Entrar no canal' })
            .click();
          await expect
            .poll(() => q.evaluate(() => window.TronoNetwork?.currentRoom))
            .toBe(channel.id);
          assert.equal(await q.evaluate(() => window.TronoNetwork.primaryRoom), 'chat-livre');
          assert.equal(await q.evaluate(() => window.TronoSocial.voiceJoined), true);
          for (const size of [
            { width: 480, height: 800 },
            { width: 720, height: 1280 },
            { width: 900, height: 600 },
          ]) {
            await p.setViewportSize(size);
            if (!(await p.locator('#messengerPanel').isVisible())) await toggleMessenger(p);
            const rect = await p.locator('#messengerPanel').boundingBox();
            assert(
              rect.x >= 0 &&
                rect.y >= 0 &&
                rect.x + rect.width <= size.width &&
                rect.y + rect.height <= size.height,
            );
            await expect(p.locator('#messengerInput')).toBeInViewport();
            await p.screenshot({
              path: path.resolve(
                __dirname,
                '../artifacts/social-' + size.width + 'x' + size.height + '.png',
              ),
            });
            await p.locator('#messengerClose').click();
          }
        },
      );
      await check(
        'diagnostics copy excludes chat content, and history survives a backend restart',
        async () => {
          await p.setViewportSize({ width: 1280, height: 800 });
          if (await p.locator('#messengerPanel').isVisible())
            await p.locator('#messengerClose').click();
          await p.evaluate(() => window.TronoSocial.toggleTelemetry(true));
          await p.locator('#copyDiagnostics').click();
          await expect(p.locator('#copyDiagnosticsStatus')).toContainText('Copiado');
          const report = await p.evaluate(() => navigator.clipboard.readText());
          assert.equal(JSON.parse(report).app, 'M&N');
          assert(!report.includes('Uma conversa privada'));
          assert(!report.includes(ana.session.access_token));
          await p.locator('#telemetryCloseBtn').click();
          await fixture.restart();
          assert.equal(
            (await api('read', { peerId: bob.user.id })).data.messages[0].text,
            'Uma conversa privada durante a chamada',
          );
          assert.equal((await api('snapshot', {}, bob)).data.threads[0].unread, 0);
          assert.equal(
            (
              await api(
                'send',
                { peerId: ana.user.id, id: crypto.randomUUID(), text: 'Após reiniciar servidor' },
                bob,
              )
            ).status,
            200,
          );
          await p.evaluate((id) => window.TronoMessenger.open(id), bob.user.id);
          await expect(p.locator('#messengerMessages')).toContainText('Após reiniciar servidor');
          const removed = await api('friend', { peerId: bob.user.id, action: 'remove' });
          assert.equal(removed.status, 200);
          assert.equal(
            (await api('send', { peerId: bob.user.id, id: crypto.randomUUID(), text: 'Bloqueada' }))
              .status,
            403,
          );
          assert((await api('read', { peerId: bob.user.id })).data.messages.length > 0);
        },
      );
      assert.deepEqual(errors, []);
      await c.context.close();
      await a.context.close();
      await b.context.close();
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
