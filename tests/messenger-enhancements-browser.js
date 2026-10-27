'use strict';
const crypto = require('node:crypto');
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  express = require('express');
const { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlYQAAAAASUVORK5CYII=',
  'base64',
);
test(
  'private attachments and avatar notices stay private and preserve calls and per-friend drafts',
  { timeout: 120000 },
  async (t) => {
    const host = express();
    host.use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((resolve) => {
        const s = host.listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port;
    const fixture = await startFixture({ port: 10813, appOrigin: origin, directAttachments: true });
    let browser;
    const errors = [];
    try {
      const accounts = [];
      for (const [email, nickname] of [
        ['Jonathapereira.jj@gmail.com', 'Ana'],
        ['files-bob@example.test', 'Bruno'],
        ['files-third@example.test', 'Dani'],
      ]) {
        await fixture.call('signup', { email, nickname, password: 'Senha12!' });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        accounts.push((await fixture.call('login', { email, password: 'Senha12!' })).data);
      }
      const [ana, bob, dani] = accounts;
      const api = async (action, body, account = ana) => {
        const res = await fetch(fixture.base + '/social/' + action, {
          method: 'POST',
          headers: {
            Origin: origin,
            Authorization: 'Bearer ' + account.session.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        return { status: res.status, data: await res.json() };
      };
      for (const account of [bob, dani]) {
        assert.equal(
          (await api('friend', { peerId: account.user.id, action: 'request' })).status,
          200,
        );
        assert.equal(
          (await api('friend', { peerId: ana.user.id, action: 'accept' }, account)).status,
          200,
        );
      }
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
          viewport: { width: 1280, height: 900 },
          permissions: ['camera', 'microphone'],
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
        page.setDefaultTimeout(12000);
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
        p = a.page,
        q = b.page;
      for (const page of [p, q]) {
        await page.evaluate(() => window.TronoPortal.openVoice());
        if (!(await page.evaluate(() => window.TronoSocial.voiceJoined)))
          await page.locator('[data-voice-channel=chat-livre]').click();
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
        await page.evaluate(() => {
          window.__mic = window.TronoSocial.getLocalAudioTrack();
          window.__primary = window.TronoNetwork.primaryRoom;
        });
      }
      await expect(p.getByRole('button', { name: 'Pessoas da Corte', exact: true })).toBeVisible();
      await p.evaluate((id) => window.TronoMessenger.open(id), bob.user.id);
      await expect(p.locator('#directMessageInput')).toBeEnabled();
      let sentId;
      await t.test(
        'attachment-only upload previews for the two participants and dates include year',
        async () => {
          await q.evaluate(() => (window.__focused = false));
          await p
            .locator('#chatOnlyScreen input[type=file]')
            .setInputFiles({ name: 'imagem-privada.png', mimeType: 'image/png', buffer: png });
          await expect(p.getByAltText('Prévia da imagem')).toBeVisible();
          await expect(p.locator('[class*="attachmentPreview"]')).not.toContainText(
            'imagem-privada.png',
          );
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect(p.locator('#chatOnlyScreen [role=log] .chat-attachment')).toHaveCount(1);
          await expect(p.locator('#chatOnlyScreen [role=log] .chat-attachment img')).toBeVisible();
          await expect
            .poll(() =>
              p.locator('#chatOnlyScreen [role=log] .chat-attachment img').evaluate((img) => img.naturalWidth),
            )
            .toBe(1);
          await expect(p.locator('[class*="attachmentPreview"]')).toBeHidden();
          sentId = await p
            .locator('#chatOnlyScreen [role=log] .chat-attachment')
            .getAttribute('data-attachment');
          const data = (await api('read', { peerId: bob.user.id })).data.messages[0];
          assert.equal(data.text, '');
          assert.equal(data.attachment.id, sentId);
          assert.equal(data.attachment.kind, 'direct');
          assert.equal(data.attachment.peerId, bob.user.id);
          await expect(q.locator('.messenger-toast')).toHaveCount(1);
          await expect(
            q.locator('.messenger-toast img, .messenger-toast [class*="avatar"]').first(),
          ).toBeVisible();
          await expect(q.locator('.messenger-toast')).toContainText('Ana');
          await expect(q.locator('.messenger-toast')).toContainText('Enviou um anexo');
          await expect
            .poll(() =>
              q.evaluate(() =>
                window.TronoDirectMessages.getSnapshot().threads.reduce((n, t) => n + t.unread, 0),
              ),
            )
            .toBe(1);
          await expect.poll(() => q.evaluate(() => window.__notifications.length)).toBe(1);
          await q.evaluate(() => (window.__focused = true));
          await q.locator('.messenger-toast-open').click();
          await expect(q.locator('#chatOnlyScreen [role=log] .chat-attachment')).toHaveCount(1);
          await expect(q.locator('#chatOnlyScreen [role=log] .file-delete')).toHaveCount(0);
          await expect(q.locator('.messenger-toast')).toHaveCount(0);
          for (const page of [p, q]) {
            await expect(page.locator('#chatOnlyScreen [role=log]')).not.toContainText(
              'imagem-privada.png',
            );
            await expect(page.locator('#chatOnlyScreen [role=log] .file-download')).toHaveCount(0);
            await expect(
              page.locator('#chatOnlyScreen [role=log] .file-image-open img'),
            ).toBeVisible();
          }
          await q.locator('.file-image-open').click();
          await expect(q.locator('.attachment-image-viewer img')).toBeVisible();
          await expect(q.locator('.attachment-image-viewer')).not.toContainText(
            'imagem-privada.png',
          );
          await q.getByRole('button', { name: 'Fechar imagem' }).click();
          const time = q.locator('#chatOnlyScreen [data-message-id] time').first();
          await expect(time).toHaveText(/\d{2}\/\d{2}\/\d{4}/);
          assert(Number.isFinite(Date.parse(await time.getAttribute('datetime'))));
          for (const page of [p, q])
            assert(
              await page.evaluate(
                () =>
                  window.TronoSocial.getLocalAudioTrack() === window.__mic &&
                  window.__mic.readyState === 'live' &&
                  window.TronoNetwork.primaryRoom === window.__primary,
              ),
            );
          const outsider = await fetch(fixture.base + '/files/' + sentId + '/url', {
            headers: { Origin: origin, Authorization: 'Bearer ' + dani.session.access_token },
          });
          assert.equal(outsider.status, 403);
        },
      );
      await t.test(
        'same focused thread, mute and disabled notifications suppress avatar notices',
        async () => {
          await p.locator('#directMessageInput').fill('Sem aviso na conversa em foco');
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect(q.locator('#chatOnlyScreen [role=log]')).toContainText(
            'Sem aviso na conversa em foco',
          );
          assert.equal(await q.locator('.messenger-toast').count(), 0);
          assert.equal(await q.evaluate(() => window.__notifications.length), 1);
          await q.evaluate(() => {
            window.TronoMessenger.close();
            window.TronoCallNavigation.showChat(true);
          });
          await q.evaluate((id) => window.TronoNotifications.mute(id, true), ana.user.id);
          await p.locator('#directMessageInput').fill('Amigo silenciado');
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect
            .poll(() =>
              q.evaluate(() =>
                window.TronoDirectMessages.getSnapshot().threads.reduce((n, t) => n + t.unread, 0),
              ),
            )
            .toBe(1);
          assert.equal(await q.locator('.messenger-toast').count(), 0);
          await q.evaluate((id) => {
            window.TronoNotifications.mute(id, false);
            window.TronoPersonal.set('notifications', 'off');
          }, ana.user.id);
          await p.locator('#directMessageInput').fill('Notificações desligadas');
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect
            .poll(() =>
              q.evaluate(() =>
                window.TronoDirectMessages.getSnapshot().threads.reduce((n, t) => n + t.unread, 0),
              ),
            )
            .toBe(2);
          assert.equal(await q.locator('.messenger-toast').count(), 0);
          await q.evaluate(() => window.TronoPersonal.set('notifications', 'mentions'));
          await p.locator('#directMessageInput').fill('Aviso com ícone novamente');
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect(q.locator('.messenger-toast')).toHaveCount(1);
          await expect(q.locator('.messenger-toast')).toContainText('Aviso com ícone novamente');
          await expect(
            q.getByRole('button', { name: 'Pessoas da Corte', exact: true }).locator('svg'),
          ).toHaveCount(1);
          await q.evaluate(() => window.TronoPersonal.set('notifications', 'off'));
          await expect(q.locator('.messenger-toast')).toHaveCount(0);
          await q.evaluate(() => window.TronoPersonal.set('notifications', 'mentions'));
        },
      );
      await t.test('delayed history cannot overwrite a newer socket message', async () => {
        let release,
          resolveIntercept,
          first = true;
        const reached = new Promise((resolve) => (resolveIntercept = resolve));
        await p.route(fixture.base + '/social/read', async (route) => {
          if (!first) return route.continue();
          first = false;
          const response = await route.fetch();
          release = () => route.fulfill({ response });
          resolveIntercept();
        });
        await p.evaluate((id) => {
          void window.TronoMessenger.open(id);
        }, bob.user.id);
        await reached;
        const liveId = crypto.randomUUID(),
          text = 'Mensagem ao vivo durante leitura atrasada';
        assert.equal(
          (await api('send', { id: liveId, peerId: ana.user.id, text }, bob)).status,
          200,
        );
        await expect(p.locator('[data-message-id="' + liveId + '"]')).toContainText(text);
        const completed = p.waitForResponse(
          (response) => response.url() === fixture.base + '/social/read',
        );
        await release();
        await completed;
        await p.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        await expect(p.locator('[data-message-id="' + liveId + '"]')).toContainText(text);
        await expect(p.locator('[data-message-id="' + liveId + '"]')).toHaveCount(1);
        await p.unroute(fixture.base + '/social/read');
        assert(
          await p.evaluate(
            () =>
              window.TronoSocial.getLocalAudioTrack() === window.__mic &&
              window.__mic.readyState === 'live',
          ),
        );
      });
      await t.test(
        'failed send retains file and text and retries an acknowledged upload without duplication',
        async () => {
          let uploads = 0,
            first = true;
          const uploadListener = (req) => {
            if (req.url() === fixture.base + '/files/upload') uploads++;
          };
          p.on('request', uploadListener);
          await p.route(fixture.base + '/social/send', async (route) => {
            if (first) {
              first = false;
              await route.fetch();
              await route.abort();
            } else await route.continue();
          });
          await p.locator('#directMessageInput').fill('Texto mantido na falha');
          await p
            .locator('#chatOnlyScreen input[type=file]')
            .setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: png });
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect(p.locator('#chatOnlyScreen span[role=status]')).toContainText('mantidos');
          await expect(p.locator('#directMessageInput')).toHaveValue('Texto mantido na falha');
          await expect(p.getByAltText('Prévia da imagem')).toBeVisible();
          await expect(p.locator('[class*="attachmentPreview"]')).not.toContainText('retry.png');
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect(p.locator('#directMessageInput')).toHaveValue('');
          await expect(p.locator('[class*="attachmentPreview"]')).toBeHidden();
          assert.equal(uploads, 1);
          assert.equal(
            (await api('read', { peerId: bob.user.id })).data.messages.filter(
              (m) => m.text === 'Texto mantido na falha',
            ).length,
            1,
          );
          await p.unroute(fixture.base + '/social/send');
          p.off('request', uploadListener);
        },
      );
      await t.test(
        'changing friends during upload keeps each draft and never attaches the prior file to another friend',
        async () => {
          let intercepted, resolveIntercept;
          const reached = new Promise((resolve) => (resolveIntercept = resolve));
          await p.route(fixture.base + '/files/upload', (route) => {
            intercepted = route;
            resolveIntercept();
          });
          await p.locator('#directMessageInput').fill('Arquivo só para Bruno');
          await p
            .locator('#chatOnlyScreen input[type=file]')
            .setInputFiles({ name: 'apenas-bruno.png', mimeType: 'image/png', buffer: png });
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await reached;
          await p.evaluate((id) => window.TronoMessenger.open(id), dani.user.id);
          await expect(p.locator('#directMessageInput')).toHaveValue('');
          await expect(p.locator('[class*="attachmentPreview"]')).toBeHidden();
          await intercepted.abort().catch(() => {});
          await p.unroute(fixture.base + '/files/upload');
          await p.locator('#directMessageInput').fill('Só texto para Dani');
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect(p.locator('#chatOnlyScreen [role=log]')).toContainText('Só texto para Dani');
          const sent = (await api('read', { peerId: dani.user.id })).data.messages;
          assert.equal(sent.length, 1);
          assert(!sent[0].attachment);
          await p.evaluate((id) => window.TronoMessenger.open(id), bob.user.id);
          await expect(p.locator('#directMessageInput')).toHaveValue('Arquivo só para Bruno');
          await expect(p.getByAltText('Prévia da imagem')).toBeVisible();
          await expect(p.locator('[class*="attachmentPreview"]')).not.toContainText(
            'apenas-bruno.png',
          );
          await p.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect(p.locator('[class*="attachmentPreview"]')).toBeHidden();
          await expect(p.locator('#chatOnlyScreen [role=log]')).toContainText(
            'Arquivo só para Bruno',
          );
          await p.locator('#chatOnlyScreen input[type=file]').setInputFiles({
            name: 'grande.png',
            mimeType: 'image/png',
            buffer: Buffer.alloc(10_000_001),
          });
          await expect(p.locator('#chatOnlyScreen span[role=status]')).toContainText('10.0 MB');
          await expect(p.locator('[class*="attachmentPreview"]')).toBeHidden();
        },
      );
      await t.test(
        'creator cannot moderate someone else’s private file; deleting as sender creates a tombstone',
        async () => {
          await q.evaluate((id) => window.TronoMessenger.open(id), ana.user.id);
          await expect(q.locator('#directMessageInput')).toBeEnabled();
          await q
            .locator('#chatOnlyScreen input[type=file]')
            .setInputFiles({ name: 'arquivo-do-amigo.png', mimeType: 'image/png', buffer: png });
          await q.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
          await expect
            .poll(
              async () =>
                (await api('read', { peerId: bob.user.id })).data.messages.filter(
                  (m) => m.attachment?.name === 'arquivo-do-amigo.png',
                ).length,
            )
            .toBe(1);
          const attachment = (await api('read', { peerId: bob.user.id })).data.messages.findLast(
            (m) => m.attachment?.name === 'arquivo-do-amigo.png',
          ).attachment.id;
          const row = p
            .locator('#chatOnlyScreen [data-message-id]')
            .filter({ has: p.locator('[data-attachment="' + attachment + '"]') });
          await expect(row).toBeVisible();
          await expect(row.locator('.file-delete')).toHaveCount(0);
          const messageId = await row.getAttribute('data-message-id'),
            deleted = p.locator('[data-message-id="' + messageId + '"]');
          const own = q
            .locator('#chatOnlyScreen [data-message-id]')
            .filter({ has: q.locator('[data-attachment="' + attachment + '"]') });
          await own.locator('.chat-attachment').hover();
          await own.locator('.file-delete').click();
          await expect(deleted).toContainText('Arquivo excluído.');
          await expect(deleted.locator('.file-download')).toHaveCount(0);
          for (const size of [
            { width: 720, height: 1280 },
            { width: 480, height: 800 },
            { width: 480, height: 520 },
          ]) {
            await p.setViewportSize(size);
            await expect(
              p.getByRole('button', { name: 'Anexar arquivo', exact: true }),
            ).toBeInViewport();
            await expect(
              p.getByRole('button', { name: 'Enviar mensagem', exact: true }),
            ).toBeInViewport();
            assert(
              await p
                .locator('#chatOnlyScreen')
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            );
          }
          await p.setViewportSize({ width: 1280, height: 900 });
          for (const page of [p, q])
            assert(
              await page.evaluate(
                () =>
                  window.TronoSocial.getLocalAudioTrack() === window.__mic &&
                  window.__mic.readyState === 'live' &&
                  window.TronoNetwork.primaryRoom === window.__primary,
              ),
            );
        },
      );
      await t.test(
        'friends remain reachable through the workspace sidebar across wide and portrait screens',
        async () => {
          await p.evaluate(() => {
            window.TronoMessenger.close();
            window.TronoCallNavigation.showChat();
          });
          const friends = p.getByRole('button', { name: 'Pessoas da Corte', exact: true });
          const node = await friends.elementHandle();
          for (const size of [
            { width: 720, height: 1280 },
            { width: 480, height: 800 },
            { width: 900, height: 600 },
            { width: 1280, height: 900 },
          ]) {
            await p.setViewportSize(size);
            if (!(await friends.isVisible()))
              await p.getByRole('button', { name: 'Abrir canais' }).click();
            await expect(friends).toBeInViewport();
            assert.equal(await friends.evaluate((e, old) => e === old, node), true);
            await friends.click();
            await expect(
              p.getByRole('navigation', { name: 'Pessoas da Corte', exact: true }),
            ).toBeVisible();
            await p.evaluate(() => {
              window.TronoMessenger.close();
              window.TronoCallNavigation.showChat();
            });
          }
          await node.dispose();
        },
      );
      await t.test(
        'account switch clears drafts and rejects a signed URL response from the previous account',
        async () => {
          await p.setViewportSize({ width: 1280, height: 900 });
          await p.evaluate((id) => window.TronoMessenger.open(id), bob.user.id);
          await expect(p.locator('#directMessageInput')).toBeEnabled();
          await p.locator('#directMessageInput').fill('Rascunho exclusivo de Ana');
          await p
            .locator('#chatOnlyScreen input[type=file]')
            .setInputFiles({ name: 'rascunho-ana.png', mimeType: 'image/png', buffer: png });
          let release, resolveIntercept;
          const reached = new Promise((resolve) => (resolveIntercept = resolve));
          await p.route(fixture.base + '/files/' + sentId + '/url?download=1', async (route) => {
            const response = await route.fetch();
            release = () => route.fulfill({ response });
            resolveIntercept();
          });
          await p.evaluate((id) => {
            window.__pendingPrivateURL = window.TronoFiles.url(id, true).then(
              () => ({ resolved: true }),
              (error) => ({ error: error.message }),
            );
          }, sentId);
          await reached;
          await p.evaluate(() => window.TronoAuth.logout());
          await expect(p.locator('#chatOnlyScreen')).toBeHidden();
          await expect(p.locator('.messenger-toast')).toHaveCount(0);
          await p.locator('#authEmail').fill('files-third@example.test');
          await p.locator('#authPassword').fill('Senha12!');
          await p.locator('#authSubmit').click();
          await expect(p.locator('#portalScreen')).toBeHidden();
          assert.equal(await p.evaluate(() => window.TronoAuth.user.id), dani.user.id);
          await release();
          assert.match((await p.evaluate(() => window.__pendingPrivateURL)).error, /conta mudou/);
          await p.unroute(fixture.base + '/files/' + sentId + '/url?download=1');
          const denied = await p.evaluate(
            (id) =>
              window.TronoFiles.url(id, true).then(
                () => false,
                () => true,
              ),
            sentId,
          );
          assert.equal(denied, true);
          await p.evaluate((id) => window.TronoMessenger.open(id), ana.user.id);
          await expect(p.locator('#directMessageInput')).toHaveValue('');
          await expect(p.locator('[class*="attachmentPreview"]')).toBeHidden();
        },
      );
      assert.deepEqual(errors, []);
      await a.context.close();
      await b.context.close();
    } catch (error) {
      fs.mkdirSync(path.resolve(__dirname, '../artifacts'), { recursive: true });
      throw error;
    } finally {
      await browser?.close();
      await fixture.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
