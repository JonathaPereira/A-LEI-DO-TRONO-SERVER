'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  express = require('express');
const { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');

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
        await expect(
          page.getByRole('button', { name: 'Pessoas da Corte', exact: true }),
        ).toBeVisible();
        return { context, page };
      }
      const a = await client(ana),
        b = await client(bob),
        c = await client(third),
        p = a.page,
        q = b.page;
      for (const page of [p, q]) {
        await page.locator('[data-voice-channel=chat-livre]').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        await page.evaluate(() => {
          window.__mic = window.TronoSocial.getLocalAudioTrack();
          window.__primary = window.TronoNetwork.primaryRoom;
        });
      }
      await t.test(
        'approval, private text and authorization preserve the active call',
        async () => {
          await p.getByRole('button', { name: 'Pessoas da Corte', exact: true }).click();
          await p.getByRole('button', { name: 'Comunidade', exact: true }).click();
          const row = p.locator('[data-person="' + bob.user.id + '"]');
          await row.getByRole('button', { name: 'Adicionar', exact: true }).click();
          await q.getByRole('button', { name: 'Pessoas da Corte', exact: true }).click();
          await q.getByRole('button', { name: 'Convites', exact: true }).click();
          await q
            .locator('[data-person="' + ana.user.id + '"]')
            .getByRole('button', { name: 'Aceitar', exact: true })
            .click();
          await expect
            .poll(() =>
              p.evaluate(
                (id) =>
                  window.TronoDirectMessages.getSnapshot().friends.find((f) => f.id === id)?.state,
                bob.user.id,
              ),
            )
            .toBe('accepted');
          await p.evaluate((id) => window.TronoMessenger.open(id), bob.user.id);
          await q.evaluate(() => {
            window.TronoMessenger.close();
            window.TronoCallNavigation.showChat();
            window.__focused = false;
          });
          await p.locator('#directMessageInput').fill('Uma conversa privada durante a chamada');
          await p.locator('#directMessageInput').press('Enter');
          await expect(p.getByRole('log', { name: 'Mensagens' })).toContainText(
            'Uma conversa privada durante a chamada',
          );
          await expect.poll(() => q.evaluate(() => window.__notifications.length)).toBe(1);
          await expect(q.locator('.messenger-toast')).toContainText(
            'Uma conversa privada durante a chamada',
          );
          assert.equal((await api('read', { peerId: ana.user.id }, third)).status, 403);
          assert.equal((await api('snapshot', {}, third)).data.threads.length, 0);
          assert.equal((await api('snapshot', {}, ana, 'https://foreign.test')).status, 403);
          await q.evaluate(() => (window.__focused = true));
          await q.locator('.messenger-toast-open').click();
          await expect(q.getByRole('log', { name: 'Mensagens' })).toContainText(
            'Uma conversa privada durante a chamada',
          );
          for (const page of [p, q])
            assert(
              await page.evaluate(
                () =>
                  window.TronoSocial.voiceJoined &&
                  window.TronoNetwork.primaryRoom === window.__primary &&
                  window.TronoSocial.getLocalAudioTrack() === window.__mic &&
                  window.__mic.readyState === 'live',
              ),
            );
        },
      );
      await t.test('account volume survives rename and peer reconnection', async () => {
        await p.evaluate(() => {
          window.TronoMessenger.close();
          window.TronoCallNavigation.showCall();
        });
        await p.getByRole('button', { name: 'Opções de Bruno', exact: true }).click();
        await p.getByRole('slider', { name: 'Volume da voz', exact: true }).fill('215');
        await fixture.call(
          'profile',
          { nickname: 'Bruno Novo', avatar_preset: 'crown' },
          bob.session.access_token,
        );
        await expect(
          p.getByRole('button', { name: 'Opções de Bruno Novo', exact: true }),
        ).toBeVisible();
        assert.equal(
          await p.evaluate((id) => window.TronoPersonal.get('volume:' + id), bob.user.id),
          215,
        );
        const old = await q.evaluate(() => window.TronoNetwork.clientId);
        await q.reload();
        await q.waitForFunction(() => window.TronoAuth?.ready);
        await q.evaluate(() => window.TronoAuth.ready);
        await q.locator('[data-voice-channel=chat-livre]').click();
        await expect.poll(() => q.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        assert.notEqual(await q.evaluate(() => window.TronoNetwork.clientId), old);
        await p.keyboard.press('Escape');
        await p.getByRole('button', { name: 'Opções de Bruno Novo', exact: true }).click();
        await expect(p.getByRole('slider', { name: 'Volume da voz', exact: true })).toHaveValue(
          '215',
        );
        assert.equal(
          await q.evaluate((id) => window.TronoPersonal.get('volume:' + id, 100), ana.user.id),
          100,
        );
        await p.keyboard.press('Escape');
      });
      await t.test(
        'channel invitation changes text destination without replacing voice',
        async () => {
          const response = await fetch(fixture.base + '/community/channels', {
            method: 'POST',
            headers: {
              Origin: origin,
              Authorization: 'Bearer ' + ana.session.access_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: 'Fotos', type: 'text', description: '' }),
          });
          assert.equal(response.status, 200);
          const channel = (await response.json()).channel;
          await p.evaluate((id) => window.TronoMessenger.open(id), bob.user.id);
          await p.getByRole('button', { name: 'Convidar para canal', exact: true }).click();
          await p.getByRole('combobox', { name: 'Canal do convite' }).selectOption(channel.id);
          await p.getByRole('button', { name: 'Enviar convite', exact: true }).click();
          await expect(p.getByRole('log', { name: 'Mensagens' })).toContainText(
            'Convite para Fotos',
          );
          await q.evaluate((id) => window.TronoMessenger.open(id), ana.user.id);
          await q.getByRole('button', { name: 'Abrir canal do convite', exact: true }).click();
          await expect
            .poll(() => q.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe(channel.id);
          assert.equal(await q.evaluate(() => window.TronoNetwork.primaryRoom), 'chat-livre');
          assert(await q.evaluate(() => window.TronoSocial.voiceJoined));
        },
      );
      await t.test(
        'history survives backend restart and unfriending prevents new sends',
        async () => {
          const report = await p.evaluate(() => window.TronoSocial.diagnostics());
          assert(!report.includes('Uma conversa privada'));
          assert(!report.includes(ana.session.access_token));
          await fixture.restart();
          assert.equal(
            (await api('read', { peerId: bob.user.id })).data.messages[0].text,
            'Uma conversa privada durante a chamada',
          );
          assert.equal(
            (
              await api(
                'send',
                {
                  peerId: ana.user.id,
                  id: require('node:crypto').randomUUID(),
                  text: 'Após reiniciar servidor',
                },
                bob,
              )
            ).status,
            200,
          );
          await p.evaluate((id) => window.TronoMessenger.open(id), bob.user.id);
          await expect(p.getByRole('log', { name: 'Mensagens' })).toContainText(
            'Após reiniciar servidor',
          );
          assert.equal(
            (await api('friend', { peerId: bob.user.id, action: 'remove' })).status,
            200,
          );
          assert.equal(
            (
              await api('send', {
                peerId: bob.user.id,
                id: require('node:crypto').randomUUID(),
                text: 'Bloqueada',
              })
            ).status,
            403,
          );
          assert((await api('read', { peerId: bob.user.id })).data.messages.length > 0);
          await expect(p.locator('#directMessageInput')).toBeDisabled();
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
