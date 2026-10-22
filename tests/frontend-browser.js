'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs');
const express = require('express'),
  { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture'),
  { validateSound } = require('../server/soundboard.ts');
const { installSyntheticCallMedia } = require('./synthetic-call-media.cjs');
function wave(seconds) {
  const size = seconds * 16000 * 2,
    b = Buffer.alloc(44 + size);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(size, 40);
  return b;
}

test(
  'frontend Chromium: permissions, channels, fullscreen, camera recovery, audio trimming and responsive layout',
  { timeout: 180000 },
  async (t) => {
    const app = express();
    app.use(express.static(path.resolve(__dirname, '../out')));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port;
    const f = await startFixture({ port: 10681, appOrigin: origin, soundboard: true });
    let browser;
    const errors = [],
      contexts = [];
    // These scenarios share a session. Stop at the first failure so its unfinished
    // dialog, permissions or selection cannot create misleading downstream errors.
    async function stepAt(parent, name, fn) {
      let failure;
      await parent.test(name, async (context) => {
        try {
          await fn(context);
        } catch (error) {
          failure = error;
          throw error;
        }
      });
      if (failure) throw failure;
    }
    const step = (name, fn) => stepAt(t, name, fn);
    async function openTools(page) {
      const tools = page.locator('#workspaceTools');
      if (!(await tools.evaluate((node) => node.open))) await tools.locator('summary').click();
    }
    async function openManager(page) {
      await openTools(page);
      await page.locator('#communityManageBtn').click();
    }
    async function closeTools(page) {
      const tools = page.locator('#workspaceTools');
      if (await tools.evaluate((node) => node.open)) await tools.locator('summary').click();
    }
    const artifacts = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    try {
      browser = await chromium.launch({
        executablePath:
          process.env.AUTH_TEST_CHROMIUM || process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        headless: true,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      async function user(email, nickname) {
        await f.call('signup', { email, nickname, password: 'Senha12!' });
        const hash = [...f.links].find(([, v]) => v.user.email === email)[0];
        await f.call('verify', { token_hash: hash, type: 'signup' });
        return (await f.call('login', { email, password: 'Senha12!' })).data;
      }
      const owner = await user('jonathapereira.jj@gmail.com', 'Criador UI'),
        member = await user('membro@example.test', 'Membro UI');
      async function pageFor(data) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          permissions: ['microphone', 'camera'],
        });
        contexts.push(context);
        await context.addInitScript(installSyntheticCallMedia);
        await context.addInitScript(
          ({ backend, data }) => {
            window.TRONO_BACKEND_URL = backend;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('tronoNoiseSuppression', '0');
            window.__captures = [];
            window.__soundAudios = [];
            const NativeAudio = window.Audio;
            window.Audio = class extends NativeAudio {
              constructor(...args) {
                super(...args);
                window.__soundAudios.push(this);
              }
            };
            navigator.mediaDevices.getDisplayMedia = async (options) => {
              window.__captures.push(options);
              if (window.__captureGate) await window.__captureGate;
              if (window.__denyCapture) throw new DOMException('Cancelado', 'NotAllowedError');
              const canvas = document.createElement('canvas');
              canvas.width = 1280;
              canvas.height = 720;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#564775';
              ctx.fillRect(0, 0, 1280, 720);
              ctx.fillStyle = '#e6d9ff';
              ctx.font = '40px sans-serif';
              ctx.fillText('Compartilhamento de teste', 160, 340);
              window.__captureCanvas = canvas;
              const stream = canvas.captureStream(30);
              window.__lastCapture = stream;
              const track = stream.getVideoTracks()[0],
                stop = track.stop.bind(track),
                timer = setInterval(() => {
                  ctx.fillStyle = ctx.fillStyle === '#ffffff' ? '#000000' : '#ffffff';
                  ctx.fillRect(0, 0, 2, 2);
                }, 50);
              track.stop = () => {
                clearInterval(timer);
                stop();
              };
              return stream;
            };
          },
          { backend: f.base, data },
        );
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
          return route.continue();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('dialog', (dialog) => void dialog.accept());
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await page.locator('#openVoicePortalBtn').click();
        await expect(page.locator('#callWorkspace')).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
          .toBe('chat-livre');
        await page.locator('[data-channel-text="chat-livre"]').click();
        return page;
      }
      const memberPage = await pageFor(member),
        page = await pageFor(owner);
      let textId, voiceId;
      await step(
        'creator controls and live role grant/revocation; member cannot manage',
        async () => {
          await openTools(memberPage);
          await expect(memberPage.locator('#communityManageBtn')).toBeHidden();
          await expect(page.locator('#myRoleBadge')).toHaveText('Criador');
          await openTools(page);
          if (!(await page.locator('#communityPanel').isVisible()))
            await page.locator('#communityToggle').click();
          const row = page.locator('.community-person').filter({ hasText: 'Membro UI' });
          await row.getByRole('button', { name: 'Alterar cargo de Membro UI' }).click();
          await page.locator('#roleSelect').selectOption('admin');
          await page.locator('#roleSave').click();
          await expect(memberPage.locator('#communityManageBtn')).toBeVisible();
          await row.getByRole('button', { name: 'Alterar cargo de Membro UI' }).click();
          await page.locator('#roleSelect').selectOption('member');
          await page.locator('#roleSave').click();
          await expect(memberPage.locator('#communityManageBtn')).toBeHidden();
          await page.locator('#workspaceTools summary').click();
          await memberPage.locator('#workspaceTools summary').click();
        },
      );
      await step(
        'channel photo gallery, moderation and permissions updated on visible attachments',
        async () => {
          const photo = {
            id: '50000000-0000-4000-8000-000000000001',
            name: 'Foto do canal.png',
            bytes: 68,
            mime: 'image/png',
            ownerId: '50000000-0000-4000-8000-000000000002',
            kind: 'chat',
            roomId: 'chat-livre',
          };
          let removed = false;
          for (const p of [page, memberPage]) {
            await p.route(f.base + '/files/channel/**', (route) =>
              route.fulfill({
                json: {
                  files: removed ? [] : [photo],
                  hasMore: false,
                  nextOffset: removed ? 0 : 1,
                },
              }),
            );
            await p.route(f.base + '/files/' + photo.id + '/url*', (route) =>
              route.fulfill({
                json: { url: origin + '/photo.png', expiresAt: Date.now() + 300000 },
              }),
            );
            await p.route(origin + '/photo.png', (route) =>
              route.fulfill({
                contentType: 'image/png',
                body: Buffer.from(
                  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNyQAAAAASUVORK5CYII=',
                  'base64',
                ),
              }),
            );
            await p.locator('#channelFilesBtn').click();
            await expect(p.locator('#channelFileList img')).toBeVisible();
          }
          await expect(page.locator('#channelFileList .file-delete')).toHaveAccessibleName(
            'Moderar: excluir',
          );
          await expect(memberPage.locator('#channelFileList .file-delete')).toHaveCount(0);
          await page.evaluate(
            (userId) =>
              window.TronoCommunityAdmin.api('/roles', {
                method: 'POST',
                body: { userId, role: 'admin' },
              }),
            member.user.id,
          );
          await expect(memberPage.locator('#channelFileList .file-delete')).toBeVisible();
          await page.evaluate(
            (userId) =>
              window.TronoCommunityAdmin.api('/roles', {
                method: 'POST',
                body: { userId, role: 'member' },
              }),
            member.user.id,
          );
          await expect(memberPage.locator('#channelFileList .file-delete')).toHaveCount(0);
          await page.route(f.base + '/files/' + photo.id, (route) => {
            assert.equal(route.request().method(), 'DELETE');
            removed = true;
            return route.fulfill({ json: { ok: true } });
          });
          await page.locator('#channelFileList .file-delete').click();
          await expect(page.locator('#channelFileList')).toHaveText('Arquivo excluído.');
          assert(removed);
          await page.evaluate(() => window.dispatchEvent(new CustomEvent('trono-role-change')));
          await expect(page.locator('#channelFileList img')).toHaveCount(0);
          await expect(page.locator('#channelFileList')).toContainText('Arquivo excluído.');
          for (const p of [page, memberPage]) await p.locator('#channelFilesClose').click();
        },
      );
      await step(
        'create text/voice channels, select dynamic channel, text chat and delete occupied channel',
        async () => {
          await openManager(page);
          await page.locator('#channelName').fill('Fotos novas');
          await page.locator('#channelType').selectOption('text');
          await page.locator('#createChannelSubmit').click();
          await expect(page.locator('#channelManagerMessage')).toHaveText('Canal criado.');
          textId = await page
            .locator('#textChannelList [data-chat-channel]')
            .getAttribute('data-chat-channel');
          await page.locator('#channelName').fill('Voz nova');
          await page.locator('#channelType').selectOption('voice');
          await page.locator('#createChannelSubmit').click();
          await expect(page.locator('#managedChannels')).toContainText('Voz nova');
          await page.locator('#channelManagerClose').click();
          await closeTools(page);
          await page.locator('#textChannelList [data-chat-channel]').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe(textId);
          await expect(page.locator('#courtChatInput')).toBeVisible();
          assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack()?.readyState))
            .not.toBe('live');
          await page.locator('#courtChatInput').fill('Mensagem no canal novo');
          await page.locator('#courtChatSend').click();
          await expect(page.locator('#courtChatMessages')).toContainText('Mensagem no canal novo');
          const voiceChannel = page
            .locator('#chatChannelList [data-chat-channel]')
            .filter({ hasText: 'Voz nova' });
          voiceId = await voiceChannel.getAttribute('data-chat-channel');
          await voiceChannel.click();
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.primaryRoom))
            .toBe(voiceId);
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await expect(page.locator('.court-chat-section')).toBeHidden();
          await expect(page.locator('#joinVoiceBtn')).toBeEnabled();
          await openManager(page);
          await page.getByRole('button', { name: 'Excluir canal Voz nova', exact: true }).click();
          await expect(page.locator('#managedChannels')).not.toContainText('Voz nova');
          await page.locator('#channelManagerClose').click();
          await closeTools(page);
          await expect.poll(() => page.evaluate(() => window.TronoNetwork.currentRoom)).toBe(null);
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(false);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack()?.readyState))
            .not.toBe('live');
          await page.locator('[data-chat-channel="chat-livre"]').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe('chat-livre');
        },
      );
      await step(
        'mixed-channel messages reach both participants after an empty Supabase confirmation',
        async () => {
          await page.locator('[data-channel-text="chat-livre"]').click();
          await page.locator('#courtChatInput').fill('Conversa confirmada sem JSON');
          await page.locator('#courtChatInput').press('Enter');
          for (const p of [page, memberPage])
            await expect(p.locator('#courtChatMessages')).toContainText(
              'Conversa confirmada sem JSON',
            );
          assert.equal(
            [...f.chatMessages.values()].filter((m) => m.text === 'Conversa confirmada sem JSON')
              .length,
            1,
          );
          await page.locator('[data-chat-channel="' + textId + '"]').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe(textId);
          try {
            for (const width of [1440, 390]) {
              await page.setViewportSize({ width, height: 1000 });
              await expect(page.locator('#courtChatInput')).toBeVisible();
              const boxes = await Promise.all(
                ['attachFileBtn', 'emojiBtn', 'courtChatInput', 'courtChatSend'].map((id) =>
                  page.locator('#' + id).boundingBox(),
                ),
              );
              assert(boxes.every(Boolean));
              for (let i = 1; i < boxes.length; i++)
                assert(
                  boxes[i].x >= boxes[i - 1].x + boxes[i - 1].width - 1,
                  'compose controls must not overlap or wrap',
                );
              assert(
                Math.abs(boxes[0].y + boxes[0].height - boxes[3].y - boxes[3].height) < 3,
                'send and attachment share the same baseline',
              );
              assert(boxes[2].width > 60, 'editor remains usable on mobile');
              if (width === 390) {
                for (const id of ['attachFileBtn', 'emojiBtn', 'courtChatSend'])
                  assert(
                    await page.locator('#' + id).evaluate((el) => {
                      const b = el.getBoundingClientRect();
                      return el.contains(
                        document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
                      );
                    }),
                    'floating controls must not cover the composer',
                  );
              }
              await page.screenshot({
                path: path.join(artifacts, 'frontend-chat-compose-' + width + '.png'),
              });
            }
          } finally {
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.locator('[data-chat-channel="chat-livre"]').click();
          }
        },
      );
      await step(
        'text history survives a backend restart and older messages load without joining voice',
        async () => {
          // The preceding mixed-channel scenario intentionally keeps its call.
          // Begin this history-only scenario by leaving through the actual control.
          if (await page.evaluate(() => window.TronoSocial.voiceJoined)) {
            await page.locator('#joinVoiceBtn').click();
            await expect
              .poll(() => page.evaluate(() => window.TronoSocial.voiceJoined))
              .toBe(false);
          }
          const senderId = await page.evaluate(() => window.TronoNetwork.clientId);
          for (let i = 0; i < 56; i++) {
            const id = require('node:crypto').randomUUID();
            f.chatMessages.set(id, {
              id,
              roomId: textId,
              text: 'Histórico ' + String(i).padStart(2, '0'),
              accountId: owner.user.id,
              senderId,
              seat: 0,
              name: 'Criador UI',
              avatar_preset: 'crown',
              attachment: null,
              ts: Date.now() - 56000 + i * 1000,
            });
          }
          const total = [...f.chatMessages.values()].filter((m) => m.roomId === textId).length;
          await page.locator('[data-chat-channel="' + textId + '"]').click();
          await expect(page.locator('#courtChatMessages .court-chat-msg')).toHaveCount(50);
          await expect(page.locator('#olderChatMessages')).toBeVisible();
          await expect(page.locator('#courtChatInput')).toBeVisible();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack()?.readyState))
            .not.toBe('live');
          assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
          await f.restart();
          for (const p of [memberPage, page]) {
            await p.reload();
            await p.waitForFunction(() => window.TronoAuth?.ready);
            await p.evaluate(() => window.TronoAuth.ready);
            await expect(p.locator('#callWorkspace')).toBeVisible();
          }
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe(textId);
          await expect(page.locator('#courtChatMessages .court-chat-msg')).toHaveCount(50);
          await expect(page.locator('#courtChatMessages .court-chat-msg.mine')).toHaveCount(50);
          await page.locator('#olderChatMessages').click();
          await expect(page.locator('#courtChatMessages .court-chat-msg')).toHaveCount(total);
          await expect(page.locator('#courtChatMessages')).toContainText('Histórico 00');
          await expect(page.locator('#courtChatMessages')).toContainText('Histórico 55');
          await expect(page.locator('#olderChatMessages')).toBeHidden();
          assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
          assert.equal(
            await page
              .locator('#courtChatMessages .court-chat-msg')
              .evaluateAll((rows) => new Set(rows.map((row) => row.dataset.messageId)).size),
            total,
          );
          f.historyState.fail = true;
          try {
            await page.locator('#courtChatInput').fill('Rascunho preservado');
            await page.locator('#courtChatSend').click();
            await expect(page.locator('#courtChatInput')).toHaveValue('Rascunho preservado');
            await expect(page.locator('#attachmentStatus')).toContainText(
              'Não foi possível salvar',
            );
            await expect(page.locator('#courtChatMessages .court-chat-msg')).toHaveCount(total);
            assert(![...f.chatMessages.values()].some((m) => m.text === 'Rascunho preservado'));
          } finally {
            f.historyState.fail = false;
          }
          await page.locator('#courtChatInput').fill('');
          await page.screenshot({
            path: path.join(artifacts, 'frontend-text-persistent-history.png'),
          });
          await page.locator('[data-chat-channel="chat-livre"]').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe('chat-livre');
        },
      );
      await step(
        'profile themes apply immediately, survive reload and stay separate for each user',
        async () => {
          await page.route(f.base + '/files/status', (route) =>
            route.fulfill({ json: { used: 0 } }),
          );
          await page.route(f.base + '/files/mine**', (route) =>
            route.fulfill({ json: { files: [], hasMore: false } }),
          );
          await page.locator('#chatProfileBtn').click();
          await page.locator('[data-profile-section="appearance"]').click();
          await expect(page.locator('.theme-picker')).toBeVisible();
          const palette = {
            green: '#69d29b',
            red: '#f47b85',
            blue: '#75bdf2',
            yellow: '#efd470',
            purple: '#a99cff',
            teal: '#5fddcc',
            orange: '#ffad72',
            rose: '#efa3cd',
            indigo: '#99acff',
            graphite: '#c1cad6',
          };
          for (const [name, accent] of Object.entries(palette)) {
            await page.locator('[name=profileTheme][value=' + name + ']').check();
            assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), name);
            assert.equal(
              await page.evaluate(() =>
                getComputedStyle(document.documentElement)
                  .getPropertyValue('--theme-accent')
                  .trim(),
              ),
              accent,
            );
          }
          await page.locator('[name=profileTheme][value=teal]').check();
          await page.screenshot({ path: path.join(artifacts, 'frontend-profile-themes.png') });
          await page.locator('#profileClose').click();
          assert.equal(
            await memberPage.evaluate(() => document.documentElement.dataset.theme),
            'purple',
          );
          await page.reload();
          await page.waitForFunction(() => window.TronoAuth?.ready);
          await page.evaluate(() => window.TronoAuth.ready);
          await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
            .toBe('teal');
          await expect(page.locator('#callWorkspace')).toBeVisible();
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe('chat-livre');
          await page.locator('#chatProfileBtn').click();
          await page.locator('[data-profile-section="appearance"]').click();
          await expect(page.locator('[name=profileTheme][value=teal]')).toBeChecked();
          await page.locator('[name=profileTheme][value=purple]').check();
          await page.locator('#profileClose').click();
        },
      );
      await step(
        'responsive workspace clears retired panel dimensions without changing account preferences or connection',
        async () => {
          const layoutBefore = await page.evaluate(() => document.body.dataset.appLayout);
          const snapshot = () =>
            page.evaluate(() => ({
              client: window.TronoNetwork.clientId,
              text: window.TronoNetwork.currentRoom,
              voice: window.TronoNetwork.primaryRoom,
              joined: window.TronoSocial.voiceJoined,
              microphone: window.TronoSocial.getLocalAudioTrack()?.id ?? null,
              captures: window.__captures.length,
            }));
          const before = await snapshot();
          await page.locator('#chatProfileBtn').click();
          await page.locator('[data-profile-section="appearance"]').click();
          await page.evaluate(
            ({ ownerId, otherId }) => {
              const dimensions = [
                'sidebar-width',
                'sidebar-height',
                'strip-height',
                'chat-width',
                'chat-height',
                'people-width',
                'people-height',
                'center-height',
              ];
              for (const dimension of dimensions)
                document.documentElement.style.setProperty('--layout-' + dimension, '333px');
              document.documentElement.style.setProperty('--layout-unrelated', '17px');
              localStorage.setItem(
                'mnPanelLayout:' + ownerId,
                JSON.stringify({ 'sidebar-width': 333 }),
              );
              localStorage.setItem('mnPanelLayout:' + otherId, 'keep-other-account');
              window.TronoPersonal.set('mute:frontend-preserve', true);
            },
            { ownerId: owner.user.id, otherId: member.user.id },
          );
          await page.locator('#layoutResetBtn').click();
          await expect(page.locator('#appearanceMessage')).toHaveText(
            'Layout restaurado ao padrão.',
          );
          assert.deepEqual(
            await page.evaluate(
              ({ ownerId, otherId }) => ({
                dimensions: [
                  'sidebar-width',
                  'sidebar-height',
                  'strip-height',
                  'chat-width',
                  'chat-height',
                  'people-width',
                  'people-height',
                  'center-height',
                ].map((key) => document.documentElement.style.getPropertyValue('--layout-' + key)),
                owner: localStorage.getItem('mnPanelLayout:' + ownerId),
                other: localStorage.getItem('mnPanelLayout:' + otherId),
                unrelated: document.documentElement.style.getPropertyValue('--layout-unrelated'),
                preference: window.TronoPersonal.get('mute:frontend-preserve'),
                theme: document.documentElement.dataset.theme,
              }),
              { ownerId: owner.user.id, otherId: member.user.id },
            ),
            {
              dimensions: Array(8).fill(''),
              owner: null,
              other: 'keep-other-account',
              unrelated: '17px',
              preference: true,
              theme: 'purple',
            },
          );
          await page.locator('#profileClose').click();
          await expect(page.locator('[data-panel-resize]')).toHaveCount(0);
          for (const mode of ['original', 'discord']) {
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.locator('#chatProfileBtn').click();
            await page.locator('[data-profile-section="appearance"]').click();
            await page.locator('[name=appLayout][value=' + mode + ']').check();
            await page.locator('#profileClose').click();
            for (const [width, height] of [
              [1440, 1000],
              [1080, 1920],
              [480, 800],
              [390, 844],
            ]) {
              await page.setViewportSize({ width, height });
              await page.evaluate(
                () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  ),
              );
              await expect(page.locator('#callWorkspace')).toBeVisible();
              await expect(page.locator('body')).toHaveAttribute('data-app-layout', mode);
              const bounds = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                width: innerWidth,
                height: innerHeight,
              }));
              assert.equal(bounds.overflow, false, JSON.stringify({ mode, bounds }));
              for (const id of ['joinVoiceBtn', 'muteMicBtn', 'voiceSettingsBtn']) {
                await expect(page.locator('#' + id)).toBeVisible();
                const box = await page.locator('#' + id).boundingBox();
                assert(
                  box.width > 0 &&
                    box.height > 0 &&
                    box.x >= 0 &&
                    box.y >= 0 &&
                    box.x + box.width <= width + 1 &&
                    box.y + box.height <= height + 1,
                  JSON.stringify({ mode, width, height, id, box }),
                );
              }
              assert.deepEqual(await snapshot(), before);
              await page.screenshot({
                path: path.join(artifacts, 'frontend-responsive-' + mode + '-' + width + '.png'),
              });
            }
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.evaluate(
            ({ layoutBefore, otherId }) => {
              window.TronoAppLayout.apply(layoutBefore, { save: true });
              document.documentElement.style.removeProperty('--layout-unrelated');
              localStorage.removeItem('mnPanelLayout:' + otherId);
              window.TronoPersonal.set('mute:frontend-preserve', undefined);
            },
            { layoutBefore, otherId: member.user.id },
          );
          assert.deepEqual(await snapshot(), before);
        },
      );
      await step(
        'screen popup precedes capture; cancel, 1080p/60 FPS and denied capture',
        async () => {
          await page.locator('#joinVoiceBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await page.locator('#screenShareBtn').click();
          await expect(page.locator('#screenOptionsDialog')).toBeVisible();
          assert.equal(await page.evaluate(() => window.__captures.length), 0);
          await page.locator('#screenOptionsCancel').click();
          assert.equal(await page.evaluate(() => window.__captures.length), 0);
          await page.locator('#screenShareBtn').click();
          await page.locator('#shareResolution').selectOption('1080');
          await page.locator('#shareFps').selectOption('60');
          await page.locator('#screenOptionsConfirm').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
          const capture = await page.evaluate(() => window.__captures[0]);
          assert.equal(capture.video.height.ideal, 1080);
          assert.equal(capture.video.frameRate.ideal, 60);
          assert.equal((await page.evaluate(() => window.TronoSocial.screenSettings)).fps, 60);
          assert.equal(capture.windowAudio, 'window');
          assert.equal(capture.audio.restrictOwnAudio, true);
          assert.equal(capture.selfBrowserSurface, 'exclude');
          const microphoneBeforeSwap = await page.evaluate(
            () => window.TronoSocial.getLocalAudioTrack().id,
          );
          await page.evaluate(() => {
            window.__beforeSwap = window.__lastCapture;
            window.__captureGate = new Promise((resolve) => (window.__releaseCapture = resolve));
          });
          const switchButton = page.locator('#screenShareGrid .screen-switch-btn');
          await switchButton.click();
          await expect(switchButton).toBeDisabled();
          assert.equal(
            await page.evaluate(() => window.__beforeSwap.getVideoTracks()[0].readyState),
            'live',
          );
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), true);
          await page.evaluate(() => {
            window.__releaseCapture();
            window.__captureGate = null;
          });
          await expect(switchButton).toBeEnabled();
          assert.equal(
            await page.evaluate(() => window.__beforeSwap.getVideoTracks()[0].readyState),
            'ended',
          );
          assert.equal(
            await page.evaluate(() => window.__lastCapture.getVideoTracks()[0].readyState),
            'live',
          );
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id),
            microphoneBeforeSwap,
          );
          await page.evaluate(() => {
            window.__beforeCancel = window.__lastCapture;
            window.__denyCapture = true;
          });
          await switchButton.click();
          await expect(page.locator('#voiceStatus')).toContainText('A tela anterior continua');
          assert.equal(
            await page.evaluate(() => window.__beforeCancel.getVideoTracks()[0].readyState),
            'live',
          );
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), true);
          await page.evaluate(() => (window.__denyCapture = false));
          await page.locator('#screenShareBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.screenSharing))
            .toBe(false);
          await page.evaluate(() => {
            window.__denyCapture = true;
          });
          await page.locator('#screenShareBtn').click();
          await page.locator('#screenOptionsConfirm').click();
          await expect(page.locator('#voiceStatus')).toContainText('cancelado');
          assert.equal(await page.evaluate(() => window.TronoSocial.screenSharing), false);
          await page.evaluate(() => {
            window.__denyCapture = false;
          });
          const microphone = await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id);
          await page.locator('#screenShareBtn').click();
          await page.locator('#shareAudio').uncheck();
          await page.locator('#screenOptionsConfirm').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
          const silent = await page.evaluate(() => window.__captures.at(-1));
          assert.equal(silent.audio, false);
          assert.equal(silent.systemAudio, 'exclude');
          assert.equal(silent.windowAudio, 'exclude');
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id),
            microphone,
          );
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
            true,
          );
          await page.locator('#screenShareBtn').click();
          await page.locator('#screenShareBtn').click();
          await page.locator('#shareAudio').check();
          await page.locator('#screenOptionsConfirm').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
          await page.locator('#screenShareBtn').click();
        },
      );
      await step(
        'real RNNoise activation, mute, device replacement and runtime fallback with simulated native capability',
        async () => {
          // Capture is synthetic; RNNoise WASM, AudioWorklet and outgoing audio
          // use real browser paths. Model native suppression capability explicitly.
          await page.evaluate(() => {
            window.__nativeMic = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              const stream = await window.__nativeMic(constraints);
              if (constraints.audio) {
                const track = stream.getAudioTracks()[0],
                  settings = track.getSettings.bind(track),
                  apply = track.applyConstraints.bind(track);
                let native = !!constraints.audio.noiseSuppression;
                track.getSettings = () => ({ ...settings(), noiseSuppression: native });
                track.applyConstraints = async (options) => {
                  await apply(options);
                  if ('noiseSuppression' in options) native = !!options.noiseSuppression;
                };
                window.__rawMicrophone = track;
              }
              return stream;
            };
          });
          await page.evaluate(() => {
            const create = window.TronoNoise.create;
            window.TronoNoise.create = async (ctx, ...args) => {
              window.__noiseContext = ctx;
              const options = args[0] || {};
              args[0] = {
                ...options,
                onFailure: (error) => {
                  window.__noiseFailures = (window.__noiseFailures || 0) + 1;
                  options.onFailure?.(error);
                },
              };
              const result = await create(ctx, ...args);
              window.__noiseNode = result.node;
              return result;
            };
          });
          const before = await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id);
          await page.locator('#voiceSettingsBtn').click();
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode), { timeout: 12000 })
            .toBe('rnnoise');
          await expect(page.locator('#noiseSuppressionStatus')).toContainText('RNNoise ativo');
          assert.equal(await page.evaluate(() => window.TronoSocial.noiseState.sampleRate), 48000);
          assert.notEqual(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id),
            before,
          );
          await page.locator('#voiceSettingsClose').click();
          await page.locator('#muteMicBtn').click();
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
            false,
          );
          await page.evaluate(async () => {
            window.__processedNoiseTrack = window.TronoSocial.getLocalAudioTrack();
            await window.__noiseContext.suspend();
          });
          await expect
            .poll(() =>
              page.evaluate(
                () => window.TronoSocial.getLocalAudioTrack() === window.__rawMicrophone,
              ),
            )
            .toBe(true);
          assert.equal(await page.evaluate(() => window.__noiseContext.state), 'suspended');
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled))
            .toBe(false);
          await page.evaluate(() => window.__noiseContext.resume());
          await expect
            .poll(() =>
              page.evaluate(
                () => window.TronoSocial.getLocalAudioTrack() === window.__processedNoiseTrack,
              ),
            )
            .toBe(true);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          assert.equal(await page.evaluate(() => window.__rawMicrophone.enabled), false);
          await page.locator('#muteMicBtn').click();
          assert.equal(await page.evaluate(() => window.__rawMicrophone.enabled), true);
          await page.evaluate(() => window.__noiseNode.dispatchEvent(new Event('processorerror')));
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('native');
          assert.equal(await page.evaluate(() => window.__noiseFailures), 1);
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState),
            'live',
          );
          await page.locator('#voiceSettingsBtn').click();
          await expect(page.locator('#noiseSuppressionStatus')).toContainText(/redução nativa/i);
          await page.locator('#noiseSuppressionBtn').click();
          await expect(page.locator('#noiseSuppressionBtn')).toHaveText('Supressor: Desligado');
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          const previous = await page.evaluate(() => {
            window.__oldNoiseTrack = window.TronoSocial.getLocalAudioTrack();
            return window.__oldNoiseTrack.id;
          });
          const input = page.locator('#voiceInputSelect');
          const previousDevice = await input.inputValue();
          const replacementDevice = await input.evaluate(
            (select) =>
              [...select.options].find(
                (option) => !option.disabled && option.value !== select.value,
              )?.value,
          );
          assert.notEqual(
            replacementDevice,
            undefined,
            'The capture fixture must offer another microphone',
          );
          await input.selectOption(replacementDevice);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id))
            .not.toBe(previous);
          await expect
            .poll(() => page.evaluate(() => window.__oldNoiseTrack.readyState))
            .toBe('ended');
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('off');
          const replacedTrack = await page.evaluate(
            () => window.TronoSocial.getLocalAudioTrack().id,
          );
          await input.selectOption(previousDevice);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id))
            .not.toBe(replacedTrack);
          await page.locator('#voiceSettingsClose').click();
          await page.evaluate(() => {
            navigator.mediaDevices.getUserMedia = window.__nativeMic;
          });
        },
      );
      await step(
        'light gaming mode uses native treatment, preserves mute/gain, limits meters and persists locally',
        async () => {
          await page.evaluate(() => {
            window.__lightCapture = navigator.mediaDevices.getUserMedia.bind(
              navigator.mediaDevices,
            );
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              const stream = await window.__lightCapture(constraints);
              if (constraints.audio) {
                const track = stream.getAudioTracks()[0],
                  settings = track.getSettings.bind(track);
                track.getSettings = () => ({
                  ...settings(),
                  noiseSuppression: !!constraints.audio.noiseSuppression,
                });
              }
              return stream;
            };
            const create = window.TronoNoise.create;
            window.__lightDenoiserCalls = 0;
            window.TronoNoise.create = (...args) => {
              window.__lightDenoiserCalls++;
              return create(...args);
            };
            window.__lightMeterNative = AnalyserNode.prototype.getByteTimeDomainData;
            window.__lightMeterReads = 0;
            AnalyserNode.prototype.getByteTimeDomainData = function (...args) {
              window.__lightMeterReads++;
              return window.__lightMeterNative.apply(this, args);
            };
          });
          await page.locator('#voiceSettingsBtn').click();
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          await page.locator('#micGainSlider').evaluate((el) => {
            el.value = '150';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.locator('#voiceSettingsClose').click();
          await page.locator('#muteMicBtn').click();
          await page.locator('#voiceSettingsBtn').click();
          const before = await page.evaluate(() => {
            window.__lightOldTrack = window.TronoSocial.getLocalAudioTrack();
            return window.__lightDenoiserCalls;
          });
          await page.locator('#voiceLightModeBtn').click();
          await expect(page.locator('#voiceLightModeBtn')).toHaveAttribute('aria-pressed', 'true');
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('native');
          await expect(page.locator('#noiseSuppressionStatus')).toContainText(/redução nativa/i);
          assert.equal(await page.evaluate(() => window.__lightDenoiserCalls), before);
          assert.equal(await page.evaluate(() => window.__lightOldTrack.readyState), 'ended');
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
            false,
          );
          await expect(page.locator('#micGainSlider')).toHaveValue('150');
          assert.equal(await memberPage.evaluate(() => window.TronoSocial.voiceLightMode), false);
          await page.evaluate(() => {
            window.__lightMeterReads = 0;
          });
          await page.waitForTimeout(1200);
          const reads = await page.evaluate(() => window.__lightMeterReads);
          assert(
            reads > 0 && reads <= 8,
            'light mode polls speaking meters at about 5 Hz, not display FPS',
          );
          await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', {
              configurable: true,
              value: 'hidden',
            });
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            window.__lightMeterReads = 0;
          });
          await page.waitForTimeout(1200);
          assert.equal(await page.evaluate(() => window.__lightMeterReads), 0);
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState),
            'live',
          );
          await page.evaluate(() => {
            delete document.visibilityState;
            delete document.hidden;
            document.dispatchEvent(new Event('visibilitychange'));
          });
          await page.screenshot({ path: path.join(artifacts, 'frontend-light-gaming-mode.png') });
          // A failed processing change must keep the existing input and light preference.
          await page.evaluate(() => {
            window.__lightBeforeFailure = window.TronoSocial.getLocalAudioTrack();
            const capture = navigator.mediaDevices.getUserMedia;
            navigator.mediaDevices.getUserMedia = async () => {
              navigator.mediaDevices.getUserMedia = capture;
              throw new DOMException('Device busy', 'NotReadableError');
            };
          });
          await page.locator('#voiceLightModeBtn').click();
          await expect(page.locator('#voiceLightModeBtn')).toHaveAttribute('aria-pressed', 'true');
          assert.equal(
            await page.evaluate(
              () => window.TronoSocial.getLocalAudioTrack() === window.__lightBeforeFailure,
            ),
            true,
          );
          await page.locator('#voiceLightModeBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
            false,
          );
          await page.locator('#voiceLightModeBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('native');
          await page.locator('#voiceSettingsClose').click();
          await page.locator('#joinVoiceBtn').click();
          await page.reload();
          await page.waitForFunction(() => window.TronoAuth?.ready);
          await page.evaluate(() => window.TronoAuth.ready);
          await expect(page.locator('#callWorkspace')).toBeVisible();
          await expect
            .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
            .toBe('chat-livre');
          assert.equal(await page.evaluate(() => window.TronoSocial.voiceLightMode), true);
          assert.equal(await memberPage.evaluate(() => window.TronoSocial.voiceLightMode), false);
          await page.locator('#voiceSettingsBtn').click();
          await page.locator('#voiceLightModeBtn').click();
          await expect(page.locator('#voiceLightModeBtn')).toHaveAttribute('aria-pressed', 'false');
          await page.locator('#voiceSettingsClose').click();
          if (!(await page.evaluate(() => window.TronoSocial.voiceJoined)))
            await page.locator('#joinVoiceBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('off');
          await page.locator('#voiceSettingsBtn').click();
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('rnnoise');
          await page.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('off');
          await page.locator('#micGainSlider').evaluate((el) => {
            el.value = '100';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.locator('#voiceSettingsClose').click();
        },
      );
      await step(
        'missing RNNoise model keeps the microphone live and reports unavailable suppression',
        async () => {
          let blocked = 0;
          await memberPage.route('**/vendor/rnnoise/*.wasm*', (route) => {
            blocked++;
            return route.fulfill({ status: 404, body: 'Missing model' });
          });
          await memberPage.locator('#joinVoiceBtn').click();
          await memberPage.locator('#voiceSettingsBtn').click();
          await memberPage.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => memberPage.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('unavailable');
          assert.equal(blocked, 1);
          await expect(memberPage.locator('#noiseSuppressionBtn')).toHaveText(
            'Supressor: Indisponível',
          );
          await expect(memberPage.locator('#noiseSuppressionStatus')).toContainText(
            'O microfone continua transmitindo.',
          );
          assert.equal(
            await memberPage.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState),
            'live',
          );
          await memberPage.locator('#noiseSuppressionBtn').click();
          await expect
            .poll(() => memberPage.evaluate(() => window.TronoSocial.noiseState.mode))
            .toBe('off');
          await memberPage.locator('#voiceSettingsClose').click();
          await memberPage.locator('#joinVoiceBtn').click();
          await memberPage.unroute('**/vendor/rnnoise/*.wasm*');
        },
      );
      await step(
        'camera capture and expanded mosaic: six people, selection and cleanup',
        async () => {
          await page.locator('#cameraBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
          await expect(
            page.locator('#voiceRoster .participant-camera-slot video').first(),
          ).toBeVisible();
          await page.evaluate(() => {
            window.__originalSources = window.TronoSocial.getMediaSources;
            const stream = window.__originalSources()[0].camera;
            window.TronoSocial.getMediaSources = () =>
              Array.from({ length: 7 }, (_, i) => ({
                id: 'demo-' + i,
                name: ['Ana', 'Bruno', 'Clara', 'Diego', 'Eva', 'Felipe', 'Gabi'][i],
                camera: stream,
                screen: i === 0 ? stream : null,
              }));
          });
          await page.locator('#expandMosaicBtn').click();
          await expect(page.locator('#mediaFocusGrid .focus-person')).toHaveCount(6);
          await expect(
            page.getByRole('checkbox', { name: 'Incluir Gabi no mosaico' }),
          ).toBeDisabled();
          await page.getByRole('checkbox', { name: 'Incluir Ana no mosaico' }).uncheck();
          await page.getByRole('checkbox', { name: 'Incluir Gabi no mosaico' }).check();
          await expect(page.locator('#mediaFocusCount')).toHaveText('6 de 6 pessoas');
          await expect(page.locator('#mediaFocusGrid .focus-person')).toHaveCount(6);
          await page.screenshot({ path: path.join(artifacts, 'frontend-mosaic-desktop.png') });
          await page.locator('#mediaFocusClose').click();
          assert.equal(await page.locator('#mediaFocusGrid video').count(), 0);
          await page.evaluate(() => {
            window.TronoSocial.getMediaSources = window.__originalSources;
          });
        },
      );
      await step(
        'single camera fullscreen exits mosaic; native and viewport fallback both close cleanly',
        async () => {
          await page.locator('#expandMosaicBtn').click();
          await page.locator('#mediaFocusFullscreen').click();
          await expect
            .poll(() =>
              page.evaluate(() => document.fullscreenElement?.classList.contains('camera-tile')),
            )
            .toBe(true);
          await expect(page.locator('#mediaFocusDialog')).toBeHidden();
          assert.equal(await page.locator('#mediaFocusGrid video').count(), 0);
          const box = await page.locator('.camera-tile').boundingBox();
          assert.equal(Math.round(box.width), 1440);
          assert.equal(Math.round(box.height), 1000);
          await page.locator('.camera-tile .media-fullscreen-btn').click();
          await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
          await page.evaluate(() => {
            window.__nativeFullscreen = Element.prototype.requestFullscreen;
            Element.prototype.requestFullscreen = () =>
              Promise.reject(new DOMException('Bloqueado', 'NotAllowedError'));
          });
          await page.locator('#expandMosaicBtn').click();
          await page.locator('#mediaFocusGrid .focus-full-camera').click();
          await expect(page.locator('.camera-tile.media-maximized')).toBeVisible();
          await expect(page.locator('#mediaFocusDialog')).toBeHidden();
          await page.locator('.camera-tile .media-fullscreen-btn').click();
          assert.equal(await page.locator('.media-maximized').count(), 0);
          await page.evaluate(() => {
            Element.prototype.requestFullscreen = window.__nativeFullscreen;
          });
        },
      );
      await step(
        'camera input releases existing device, relaxes capture constraints and cancels pending capture on leave',
        async () => {
          await page.evaluate(() => {
            window.__nativeCamera = navigator.mediaDevices.getUserMedia.bind(
              navigator.mediaDevices,
            );
            window.__previousCamera = window.TronoSocial.getMediaSources()
              .find((p) => p.self)
              .camera.getVideoTracks()[0];
            window.__cameraAttempts = [];
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              if (constraints.video) {
                window.__cameraAttempts.push(constraints);
                if (window.__previousCamera.readyState !== 'ended')
                  throw new DOMException('Device still occupied', 'NotReadableError');
                if (window.__cameraAttempts.length === 1)
                  throw new DOMException('Could not start video source', 'NotReadableError');
              }
              return window.__nativeCamera(constraints);
            };
            document
              .getElementById('cameraInputSelect')
              .dispatchEvent(new Event('change', { bubbles: true }));
          });
          await expect.poll(() => page.evaluate(() => window.__cameraAttempts.length)).toBe(2);
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
          assert.equal(await page.evaluate(() => window.__previousCamera.readyState), 'ended');
          await page.locator('#cameraBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(false);
          await page.evaluate(() => {
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              const stream = await window.__nativeCamera(constraints);
              if (constraints.video) {
                window.__pendingCamera = stream;
                await new Promise((resolve) => {
                  window.__releaseCamera = resolve;
                });
              }
              return stream;
            };
          });
          await page.locator('#cameraBtn').click();
          await expect.poll(() => page.evaluate(() => !!window.__pendingCamera)).toBe(true);
          await expect(page.locator('#cameraBtn')).toBeDisabled();
          await page.locator('#joinVoiceBtn').click();
          await page.evaluate(() => window.__releaseCamera());
          await expect
            .poll(() =>
              page.evaluate(() =>
                window.__pendingCamera.getTracks().every((t) => t.readyState === 'ended'),
              ),
            )
            .toBe(true);
          assert.equal(await page.evaluate(() => window.TronoSocial.cameraOn), false);
          await page.evaluate(() => {
            navigator.mediaDevices.getUserMedia = window.__nativeCamera;
          });
          await page.locator('#joinVoiceBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await page.locator('#cameraBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
        },
      );
      await step(
        'screen fullscreen restores a collapsed preview and leaves the group grid',
        async () => {
          await page.locator('#screenShareBtn').click();
          await page.locator('#screenOptionsConfirm').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
          await page.locator('#screenShareGrid .screen-collapse-btn').click();
          await expect(page.locator('#screenShareGrid .share-collapsed')).toBeVisible();
          await page.locator('#expandMosaicBtn').click();
          await page.locator('#mediaFocusGrid .focus-full-screen').click();
          await expect
            .poll(() =>
              page.evaluate(() =>
                document.fullscreenElement?.classList.contains('screen-share-tile'),
              ),
            )
            .toBe(true);
          await expect(page.locator('#mediaFocusDialog')).toBeHidden();
          await expect(page.locator('#screenShareGrid .share-collapsed')).toHaveCount(0);
          await expect(page.locator('#screenShareGrid video')).toBeVisible();
          await page.locator('#screenShareGrid .media-fullscreen-btn').click();
          await page.locator('#screenShareBtn').click();
          await expect
            .poll(() => page.evaluate(() => window.TronoSocial.screenSharing))
            .toBe(false);
        },
      );
      await step(
        'shared screens grow and cameras move into stable profile cards; hiding is local and preserves voice/screens',
        async (mediaTest) => {
          mediaTest.after(async () => {
            for (const p of [page, memberPage])
              await p.evaluate(async (leave) => {
                if (document.fullscreenElement) await document.exitFullscreen();
                await window.TronoSocial.stopScreenShare();
                if (leave) await window.TronoSocial.leaveVoice();
                if (window.__nativePeer) window.RTCPeerConnection = window.__nativePeer;
                for (const fixture of Object.values(window.__remoteMediaFixture || {}))
                  fixture.track.stop();
              }, p === memberPage);
            await page.setViewportSize({ width: 1440, height: 1000 });
          });
          // Managed cloud Chromium blocks direct WebRTC UDP. Supply generated media tracks
          // at the receiver boundary to exercise rendering/lifecycle without claiming RTP validation.
          for (const p of [page, memberPage])
            await p.evaluate(async () => {
              const makeTrack = (color, label) => {
                const canvas = document.createElement('canvas');
                canvas.width = 1280;
                canvas.height = 720;
                const context = canvas.getContext('2d');
                context.fillStyle = color;
                context.fillRect(0, 0, 1280, 720);
                context.fillStyle = '#fff';
                context.font = '40px sans-serif';
                context.fillText(label, 100, 340);
                const stream = canvas.captureStream(30),
                  track = stream.getVideoTracks()[0],
                  stop = track.stop.bind(track),
                  timer = setInterval(() => {
                    context.fillStyle = context.fillStyle === '#ffffff' ? '#000000' : '#ffffff';
                    context.fillRect(0, 0, 2, 2);
                  }, 50);
                track.stop = () => {
                  clearInterval(timer);
                  stop();
                };
                return { canvas, track };
              };
              const camera = makeTrack('#35766f', 'Câmera remota de teste'),
                screen = makeTrack('#564775', 'Tela remota de teste'),
                microphone = await navigator.mediaDevices.getUserMedia({ audio: true }),
                audio = { track: microphone.getAudioTracks()[0] },
                screenAudio = { track: audio.track.clone() };
              window.__remoteMediaFixture = { camera, screen, audio, screenAudio };
              const NativePeer = window.RTCPeerConnection;
              window.__nativePeer = NativePeer;
              window.RTCPeerConnection = class extends NativePeer {
                constructor(...args) {
                  super(...args);
                  this.addEventListener('track', (event) => {
                    this.getTransceivers();
                    Object.defineProperty(event, 'track', { value: event.receiver.track });
                  });
                }
                addTransceiver(...args) {
                  const transceiver = super.addTransceiver(...args);
                  this.getTransceivers();
                  return transceiver;
                }
                getTransceivers() {
                  const slots = super.getTransceivers();
                  let audioIndex = 0,
                    videoIndex = 0;
                  for (const transceiver of slots) {
                    const kind = transceiver.receiver.track.kind,
                      fixture =
                        kind === 'video'
                          ? videoIndex++
                            ? screen
                            : camera
                          : audioIndex++
                            ? screenAudio
                            : audio;
                    if (!Object.hasOwn(transceiver.receiver, 'track'))
                      Object.defineProperty(transceiver.receiver, 'track', {
                        value: fixture.track,
                      });
                  }
                  return slots;
                }
              };
            });
          await page.setViewportSize({ width: 1920, height: 1200 });
          if (await page.locator('.court-chat-section').isVisible())
            await page.locator('#chatOnlyTextBtn').click();
          if (await page.locator('#communityPanel').isVisible())
            await page.locator('#communityToggle').click();
          await memberPage.locator('#joinVoiceBtn').click();
          await memberPage.locator('#cameraBtn').click();
          const ownerPeer = await page.evaluate(() => window.TronoNetwork.clientId),
            memberPeer = await memberPage.evaluate(() => window.TronoNetwork.clientId);
          const ownCamera = page.locator('.camera-tile[data-peer="' + ownerPeer + '"]'),
            otherCamera = page.locator('.camera-tile[data-peer="' + memberPeer + '"]');
          await expect(otherCamera).toHaveClass(/has-video/, { timeout: 15000 });
          await expect
            .poll(() => otherCamera.locator('video').evaluate((video) => video.videoWidth))
            .toBe(1280);
          await page.evaluate((id) => {
            window.__stableCamera = document.querySelector(
              '.camera-tile[data-peer="' + id + '"] video',
            );
          }, ownerPeer);
          await memberPage.evaluate(() =>
            window.TronoNetwork.setActivity({ name: 'Rocket League' }),
          );
          const activity = page.locator(
            '#voiceRoster .voice-person[data-peer="' + memberPeer + '"] .participant-activity',
          );
          await expect(activity).toHaveText('Rocket League');
          const preview = await otherCamera.boundingBox(),
            label = await activity.boundingBox();
          assert(label.y >= preview.y + preview.height, 'website activity stays below the camera');
          await page.locator('#screenShareBtn').click();
          await page.locator('#screenOptionsConfirm').click();
          await expect(page.locator('.screens-layout')).toBeVisible();
          await expect(page.locator('#voiceRoster .camera-tile')).toHaveCount(2);
          await expect(page.locator('#cameraGrid .camera-tile')).toHaveCount(0);
          assert.equal(
            await ownCamera.locator('video').evaluate((el) => el === window.__stableCamera),
            true,
          );
          await expect
            .poll(() =>
              page
                .locator('#screenShareGrid video')
                .first()
                .evaluate((video) => video.videoWidth),
            )
            .toBe(1280);
          await memberPage.locator('#screenShareBtn').click();
          await memberPage.locator('#screenOptionsConfirm').click();
          const otherScreen = page.locator(
            '#screenShareGrid .screen-share-tile[data-peer="' + memberPeer + '"]',
          );
          await expect(otherScreen).toBeVisible();
          await otherScreen.locator('.mn-watch-stream').click();
          await expect(otherScreen).toHaveClass(/has-video/, { timeout: 15000 });
          await expect
            .poll(() => otherScreen.locator('video').evaluate((video) => video.videoWidth))
            .toBe(1280);
          const screenBox = await otherScreen.boundingBox(),
            cameraBox = await otherCamera.boundingBox();
          await page.screenshot({ path: path.join(artifacts, 'frontend-stream-fit-debug.png') });
          assert(
            screenBox.width > cameraBox.width * 2,
            'stream should have more room than a participant camera ' +
              JSON.stringify({ screenBox, cameraBox }),
          );
          await page.screenshot({
            path: path.join(artifacts, 'frontend-screen-profile-cameras.png'),
          });
          await stepAt(
            mediaTest,
            'stream controls hide after idle, wake only inside the stream and remain usable by keyboard/fullscreen',
            async () => {
              const watch = otherScreen.locator('.mn-watch-stream'),
                volume = otherScreen.locator('.mn-stream-volume'),
                maximize = otherScreen.locator('.media-fullscreen-btn');
              await otherScreen.hover();
              await expect(watch).toBeVisible();
              await expect(volume).toBeVisible();
              const firstTime = await otherScreen
                .locator('video')
                .evaluate((video) => video.currentTime);
              await page.mouse.move(40, 40);
              await expect(otherScreen).toHaveClass(/screen-controls-idle/, { timeout: 5000 });
              await expect(watch).toBeHidden();
              await expect(volume).toBeHidden();
              assert.equal(
                await otherScreen.evaluate((tile) => getComputedStyle(tile).cursor),
                'none',
              );
              await page.mouse.move(80, 50);
              await page.evaluate(() => window.TronoSocial.renderScreenGrid());
              await expect(watch).toBeHidden();
              assert(
                (await otherScreen.locator('video').evaluate((video) => video.currentTime)) >
                  firstTime + 1,
                'the video keeps playing while controls are hidden',
              );
              await otherScreen.hover();
              await expect(watch).toBeVisible();
              await expect(volume).toBeVisible();
              await maximize.click();
              await expect
                .poll(() =>
                  page.evaluate(() =>
                    document.fullscreenElement?.classList.contains('screen-share-tile'),
                  ),
                )
                .toBe(true);
              await expect(otherScreen).toHaveClass(/screen-controls-idle/, { timeout: 5000 });
              await expect(watch).toBeHidden();
              await expect(volume).toBeHidden();
              await expect(maximize).toBeHidden();
              await expect(otherScreen.locator('.mn-stream-name')).toBeHidden();
              await page.screenshot({
                path: path.join(artifacts, 'frontend-stream-fullscreen-clean.png'),
              });
              await page.mouse.move(900, 450);
              await expect(maximize).toBeVisible();
              await maximize.click();
              await expect
                .poll(() => page.evaluate(() => !!document.fullscreenElement))
                .toBe(false);
              await otherScreen.focus();
              await otherScreen.press('Tab');
              await expect(watch).toBeFocused();
              await page.waitForTimeout(3300);
              await expect(watch).toBeVisible();
              await volume.locator('input').focus();
              await volume.locator('input').press('ArrowRight');
              await expect(volume.locator('output')).toHaveText('105%');
              await volume.locator('input').press('ArrowLeft');
              await page.locator('#screenShareBtn').focus();
              await expect(otherScreen).toHaveClass(/screen-controls-idle/, { timeout: 5000 });
              await otherScreen.hover();
              await page.evaluate(() => {
                window.__idleNativeFullscreen = Element.prototype.requestFullscreen;
                Element.prototype.requestFullscreen = () =>
                  Promise.reject(new DOMException('Bloqueado', 'NotAllowedError'));
              });
              await maximize.click();
              await expect(otherScreen).toHaveClass(/media-maximized/);
              await expect(otherScreen).toHaveClass(/screen-controls-idle/, { timeout: 5000 });
              await expect(watch).toBeHidden();
              await expect(volume).toBeHidden();
              await page.mouse.move(950, 460);
              await expect(maximize).toBeVisible();
              await maximize.click();
              await expect(otherScreen).not.toHaveClass(/media-maximized/);
              await page.evaluate(() => {
                Element.prototype.requestFullscreen = window.__idleNativeFullscreen;
              });
              await otherScreen.hover();
              await watch.click();
              await expect(otherScreen).toHaveClass(/stream-invitation/);
              const ownScreen = page.locator(
                '#screenShareGrid .screen-share-tile[data-peer="' + ownerPeer + '"]',
              );
              await ownScreen.hover();
              await ownScreen.locator('.screen-collapse-btn').click();
              await expect(ownScreen).toHaveClass(/share-collapsed/);
              await page.waitForTimeout(3300);
              await expect(watch).toBeVisible();
              await expect(ownScreen.locator('.screen-collapse-btn')).toBeVisible();
              await watch.click();
              await ownScreen.locator('.screen-collapse-btn').click();
              await expect(otherScreen).toHaveClass(/has-video/);
            },
          );
          await stepAt(
            mediaTest,
            'personal profile media placement preserves remote tracks and fullscreen',
            async () => {
              const card = page.locator(
                  '#voiceRoster .voice-person[data-peer="' + memberPeer + '"]',
                ),
                choice = card.locator('.participant-media-layout select');
              await card.locator('.participant-expand').click();
              await page.evaluate((id) => {
                window.__dockedRemoteVideo = document.querySelector(
                  '.screen-share-tile[data-peer="' + id + '"] video',
                );
                window.__dockedRemoteTrack =
                  window.__dockedRemoteVideo.srcObject.getVideoTracks()[0];
                window.__dockMic = window.TronoSocial.getLocalAudioTrack();
              }, memberPeer);
              await choice.selectOption('screen');
              const docked = card.locator('.participant-screen-slot .screen-share-tile');
              await expect(docked).toHaveClass(/has-video/);
              await expect(docked).toBeVisible();
              assert(
                await docked
                  .locator('video')
                  .evaluate(
                    (v) =>
                      v === window.__dockedRemoteVideo &&
                      v.srcObject.getVideoTracks()[0] === window.__dockedRemoteTrack,
                  ),
              );
              await expect(
                page.locator('#cameraGrid .camera-tile[data-peer="' + memberPeer + '"]'),
              ).toBeVisible();
              await docked.hover();
              await docked.locator('.media-fullscreen-btn').click();
              await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
              await docked.hover();
              await docked.locator('.media-fullscreen-btn').click();
              await expect
                .poll(() => page.evaluate(() => !!document.fullscreenElement))
                .toBe(false);
              await expect(docked).toBeVisible();
              await card.locator('.participant-expand').click();
              await choice.selectOption('stage');
              await expect(otherScreen).toHaveClass(/has-video/);
              await expect(otherScreen).toBeVisible();
              await expect(
                page.locator('#cameraGrid .camera-tile[data-peer="' + memberPeer + '"]'),
              ).toBeVisible();
              await choice.selectOption('auto');
              await expect(card.locator('.participant-camera-slot .camera-tile')).toBeVisible();
              assert(
                await page.evaluate(
                  () =>
                    window.TronoSocial.getLocalAudioTrack() === window.__dockMic &&
                    window.__dockMic.readyState === 'live' &&
                    window.__dockedRemoteTrack.readyState === 'live',
                ),
              );
              await expect(
                memberPage.locator(
                  '#voiceRoster .voice-person[data-peer="' +
                    memberPeer +
                    '"] .participant-media-layout select',
                ),
              ).toHaveValue('auto');
            },
          );
          await stepAt(
            mediaTest,
            'deafen mutes input and output and restores the previous microphone state',
            async () => {
              const remote = page.locator(
                  '#voiceRoster .voice-person[data-peer="' + memberPeer + '"]',
                ),
                local = memberPage.locator(
                  '#voiceRoster .voice-person[data-peer="' + memberPeer + '"]',
                );
              await memberPage.locator('#muteMicBtn').click();
              for (const card of [remote, local])
                await expect(card.locator('[aria-label="Microfone mutado"]')).toBeVisible();
              await memberPage.locator('#deafenVoiceBtn').click();
              for (const card of [remote, local])
                await expect(
                  card.locator('[aria-label="Áudio da chamada silenciado"]'),
                ).toBeVisible();
              await page.screenshot({
                path: path.join(artifacts, 'frontend-participant-muted-deafened.png'),
              });
              await expect(memberPage.locator('#muteMicBtn')).toBeDisabled();
              await expect(remote.locator('[aria-label="Microfone mutado"]')).toBeVisible();
              await expect(
                remote.locator('[aria-label="Áudio da chamada silenciado"]'),
              ).toBeVisible();
              assert.equal(
                await memberPage.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
                false,
              );
              await memberPage.locator('#cameraBtn').click();
              await expect(
                remote.locator('[aria-label="Áudio da chamada silenciado"]'),
              ).toBeVisible();
              await memberPage.locator('#cameraBtn').click();
              await expect(otherCamera).toHaveClass(/has-video/);
              await memberPage.locator('#deafenVoiceBtn').click();
              await expect(memberPage.locator('#muteMicBtn')).toBeEnabled();
              await expect(remote.locator('[aria-label="Microfone mutado"]')).toBeVisible();
              assert.equal(
                await memberPage.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
                false,
              );
              await memberPage.locator('#muteMicBtn').click();
              for (const card of [remote, local])
                await expect(card.locator('.participant-voice-status')).toBeHidden();
              await memberPage.locator('#deafenVoiceBtn').click();
              assert.equal(
                await memberPage.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
                false,
              );
              await memberPage.locator('#deafenVoiceBtn').click();
              assert.equal(
                await memberPage.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled),
                true,
              );
            },
          );
          await stepAt(
            mediaTest,
            'opening and typing in text keeps the original voice, camera, screen and watched stream',
            async () => {
              await page.evaluate(() => {
                window.__keptMicrophone = window.TronoSocial.getLocalAudioTrack();
                window.__callNavigationMessages = [];
                window.__navigationUnsubscribe = window.TronoNetwork.onMessage((m) =>
                  window.__callNavigationMessages.push(m),
                );
              });
              for (const p of [page, memberPage])
                await p.locator('[data-chat-channel="' + textId + '"]').click();
              for (const p of [page, memberPage]) {
                await expect
                  .poll(() => p.evaluate(() => window.TronoNetwork.currentRoom))
                  .toBe(textId);
                assert.equal(await p.evaluate(() => window.TronoNetwork.primaryRoom), 'chat-livre');
                assert.equal(await p.evaluate(() => window.TronoSocial.voiceJoined), true);
                await expect(p.locator('#joinVoiceBtn')).toBeEnabled();
                await expect(p.locator('#cameraBtn')).toBeEnabled();
                await expect(p.locator('#screenShareBtn')).toBeEnabled();
                await expect(p.locator('#mnStageRoomName')).toHaveText('Geral');
              }
              await page.locator('#courtChatInput').fill('Texto sem sair da chamada');
              await page.locator('#courtChatSend').click();
              await expect(memberPage.locator('#courtChatMessages')).toContainText(
                'Texto sem sair da chamada',
              );
              await memberPage.locator('#muteMicBtn').click();
              await expect
                .poll(() =>
                  page.evaluate(() =>
                    window.__callNavigationMessages.some(
                      (m) =>
                        m.type === 'voice-roster' &&
                        m.roomId === 'chat-livre' &&
                        m.players.some((p) => p.name === 'Membro UI' && p.muted),
                    ),
                  ),
                )
                .toBe(true);
              await expect(page.locator('#chatOnlyRoomName')).toHaveText('Fotos novas');
              await expect(page.locator('#courtChatMessages')).toContainText(
                'Texto sem sair da chamada',
              );
              await memberPage.locator('#muteMicBtn').click();
              assert.equal(
                await page.evaluate(
                  () =>
                    window.TronoSocial.getLocalAudioTrack() === window.__keptMicrophone &&
                    window.__keptMicrophone.readyState === 'live',
                ),
                true,
              );
              await expect(ownCamera).toHaveClass(/has-video/);
              await expect(otherScreen).toHaveClass(/has-video/);
              assert.equal(
                await page.evaluate(
                  () => window.TronoSocial.cameraOn && window.TronoSocial.screenSharing,
                ),
                true,
              );
              await expect(page.locator('.mn-media-stage')).toBeVisible();
              await expect(page.locator('#socialDragHandle')).toBeHidden();
              await expect(page.locator('#textVoiceRoomName')).toHaveText('Voz conectada · Geral');
              await expect(page.locator('#courtChatInput')).toBeVisible();
              const textBox = await page.locator('.court-chat-section').boundingBox(),
                stageBox = await page.locator('.mn-media-stage').boundingBox(),
                panelBox = await page.locator('#socialPanel').boundingBox();
              assert(
                textBox.width > 0 &&
                  textBox.x + textBox.width <= stageBox.x + 1 &&
                  stageBox.x + stageBox.width <= panelBox.x + panelBox.width + 1,
                'text and live media keep separate space inside the current workspace',
              );
              await page.screenshot({
                path: path.join(artifacts, 'frontend-text-with-voice-desktop.png'),
              });
              await page.setViewportSize({ width: 390, height: 844 });
              await expect(page.locator('#courtChatInput')).toBeVisible();
              await expect(page.locator('#joinVoiceBtn')).toBeInViewport();
              await page.locator('#muteMicBtn').click();
              await page.locator('#muteMicBtn').click();
              await page.screenshot({
                path: path.join(artifacts, 'frontend-text-with-voice-mobile.png'),
              });
              assert(
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              );
              await page.setViewportSize({ width: 1920, height: 1200 });
              const temporary = await page.evaluate(async () =>
                window.TronoCommunityAdmin.api('/channels', {
                  method: 'POST',
                  body: { name: 'Texto temporário', type: 'text' },
                }),
              );
              const temporaryId = temporary.channel.id;
              await page.locator('[data-chat-channel="' + temporaryId + '"]').click();
              await expect
                .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
                .toBe(temporaryId);
              await page.evaluate(
                (id) => window.TronoCommunityAdmin.api('/channels/' + id, { method: 'DELETE' }),
                temporaryId,
              );
              await expect
                .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
                .toBe(null);
              assert.equal(
                await page.evaluate(
                  () =>
                    window.TronoSocial.voiceJoined &&
                    window.TronoSocial.getLocalAudioTrack() === window.__keptMicrophone,
                ),
                true,
              );
              await page.locator('[data-chat-channel="chat-livre"]').click();
              await memberPage.locator('#returnToVoiceRoom').click();
              await expect
                .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
                .toBe('chat-livre');
              assert.equal(
                await page.evaluate(
                  () => window.TronoSocial.getLocalAudioTrack() === window.__keptMicrophone,
                ),
                true,
              );
              assert.equal(
                await page.evaluate(
                  (id) =>
                    window.__callNavigationMessages.some(
                      (m) => m.type === 'voice-event' && m.playerId === id && m.kind !== 'joined',
                    ),
                  memberPeer,
                ),
                false,
              );
              await page.evaluate(() => window.__navigationUnsubscribe());
              if (await page.locator('.court-chat-section').isVisible())
                await page.locator('#chatOnlyTextBtn').click();
            },
          );
          const profileExpand = page.locator(
            '#voiceRoster .voice-person[data-peer="' + memberPeer + '"] .participant-expand',
          );
          if ((await profileExpand.getAttribute('aria-expanded')) !== 'true')
            await profileExpand.click();
          await page
            .getByRole('button', { name: 'Ocultar câmera de Membro UI', exact: true })
            .click();
          await expect(otherCamera).toHaveCount(0);
          await expect(otherScreen).toHaveClass(/has-video/);
          assert.equal(await memberPage.evaluate(() => window.TronoSocial.cameraOn), true);
          assert.equal(await memberPage.evaluate(() => window.TronoSocial.voiceJoined), true);
          assert.equal(
            await page.evaluate(
              () => window.TronoSocial.getMediaSources().find((p) => !p.self).camera,
            ),
            null,
          );
          await page.locator('#expandMosaicBtn').click();
          await page
            .getByRole('button', { name: 'Mostrar câmera de Membro UI na grade', exact: true })
            .click();
          await expect(otherCamera).toHaveClass(/has-video/);
          await expect(
            page.locator('#mediaFocusGrid .focus-person[data-peer="' + memberPeer + '"]'),
          ).toHaveClass(/has-camera/);
          await page.locator('#mediaFocusClose').click();
          await ownCamera.locator('.media-fullscreen-btn').click();
          await expect
            .poll(() =>
              page.evaluate(() => document.fullscreenElement?.classList.contains('camera-tile')),
            )
            .toBe(true);
          const full = await ownCamera.boundingBox();
          assert.equal(Math.round(full.width), 1920);
          assert.equal(Math.round(full.height), 1200);
          await ownCamera.locator('.media-fullscreen-btn').click();
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({
            path: path.join(artifacts, 'frontend-screen-profile-cameras-mobile.png'),
          });
          await page.locator('#voiceRoster').scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(artifacts, 'frontend-profile-cameras-mobile.png'),
          });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert(
            await page
              .locator('#callWorkspace .call-action>span:not(.call-icon):visible')
              .evaluateAll((labels) =>
                labels.every((label) => {
                  const text = label.getBoundingClientRect(),
                    button = label.parentElement.getBoundingClientRect();
                  return text.left >= button.left && text.right <= button.right + 1;
                }),
              ),
          );
          await memberPage.locator('#screenShareBtn').click();
          await page.locator('#screenShareBtn').click();
          await expect(page.locator('#voiceRoster .camera-tile')).toHaveCount(2);
          await expect(page.locator('#cameraGrid .camera-tile')).toHaveCount(0);
          await memberPage.evaluate(() => window.TronoNetwork.setActivity(null));
          await memberPage.locator('#cameraBtn').click();
          await memberPage.locator('#joinVoiceBtn').click();
          for (const p of [page, memberPage])
            await p.evaluate(() => {
              window.RTCPeerConnection = window.__nativePeer;
              for (const fixture of Object.values(window.__remoteMediaFixture))
                fixture.track.stop();
            });
          await page.setViewportSize({ width: 1440, height: 1000 });
        },
      );
      await step(
        'sound conversion, long audio cropping, exact PCM interval and personal playback volume',
        async () => {
          let uploaded = 0;
          const library = [
            {
              id: f.soundId,
              name: 'Efeito.wav',
              ownerId: owner.user.id,
              bytes: 32044,
              mime: 'audio/wav',
              kind: 'soundboard',
              durationMs: 1000,
            },
          ];
          await page.route(f.base + '/files/**', async (route) => {
            const req = route.request(),
              url = new URL(req.url());
            if (url.pathname === '/files/soundboard')
              return route.fulfill({ json: { files: library, hasMore: false } });
            if (url.pathname === '/files/upload') {
              const body = req.postDataBuffer(),
                verified = validateSound(body);
              assert.equal(verified.durationMs, 15000);
              uploaded++;
              const file = {
                ...library[0],
                id: '40000000-0000-4000-8000-000000000001',
                name: 'Aplausos.wav',
                durationMs: verified.durationMs,
                bytes: body.length,
              };
              library.push(file);
              return route.fulfill({ json: { file } });
            }
            if (url.pathname.endsWith('/url'))
              return route.fulfill({
                json: { url: origin + '/test-sound.wav', expiresAt: Date.now() + 300000 },
              });
            return route.continue();
          });
          await page.route(origin + '/test-sound.wav', (route) =>
            route.fulfill({ body: wave(1), contentType: 'audio/wav' }),
          );
          await page.locator('#soundboardToggle').click();
          await page.locator('#soundUploadDetails summary').click();
          await page.locator('#soundName').click();
          await expect(page.locator('#soundboardDialog')).toBeVisible();
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
          assert.equal(uploaded, 0);
          await page.locator('#soundTrimPreview').click();
          await expect(page.locator('#soundboardMessage')).toHaveText(
            'Ouvindo somente o trecho selecionado.',
          );
          await page.evaluate(() => {
            const field = document.getElementById('soundName');
            field.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
            field.focus();
            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
          await expect(page.locator('#soundboardDialog')).toBeVisible();
          await expect(page.locator('#soundName')).toBeFocused();
          await page.screenshot({ path: path.join(artifacts, 'frontend-soundboard-desktop.png') });
          const cropped = await page.evaluate(async () => {
            const buffer = new AudioBuffer({
              length: 16000 * 30,
              sampleRate: 16000,
              numberOfChannels: 2,
            });
            for (const [channel, value] of [
              [0, 0.25],
              [1, -0.5],
            ])
              buffer.getChannelData(channel).fill(value, 16000 * 11, 16000 * 26);
            const data = new DataView(
              await window.TronoSoundboard.encodeWav(buffer, 11, 26).arrayBuffer(),
            );
            let rejected = false;
            try {
              window.TronoSoundboard.encodeWav(buffer, 0, 16);
            } catch {
              rejected = true;
            }
            return {
              bytes: data.byteLength,
              channels: data.getUint16(22, true),
              first: data.getInt16(44, true),
              second: data.getInt16(46, true),
              last: data.getInt16(data.byteLength - 2, true),
              rejected,
            };
          });
          assert.deepEqual(cropped, {
            bytes: 44 + 15 * 16000 * 4,
            channels: 2,
            first: 8191,
            second: -16384,
            last: -16384,
            rejected: true,
          });
          await page.locator('#soundUpload').click();
          await expect(page.locator('#soundboardMessage')).toHaveText(
            'Efeito adicionado à biblioteca.',
          );
          assert.equal(uploaded, 1);
          await expect(page.locator('.sound-thumbnail')).toHaveCount(2);
          await memberPage.route(f.base + '/files/' + f.soundId + '/url', (route) =>
            route.fulfill({
              json: { url: origin + '/test-sound.wav', expiresAt: Date.now() + 300000 },
            }),
          );
          await memberPage.route(origin + '/test-sound.wav', (route) =>
            route.fulfill({ body: wave(1), contentType: 'audio/wav' }),
          );
          await memberPage.locator('#joinVoiceBtn').click();
          await expect
            .poll(() => memberPage.evaluate(() => window.TronoSocial.voiceJoined))
            .toBe(true);
          await page.locator('#soundboardVolume').press('Home');
          for (let value = 0; value < 35; value++)
            await page.locator('#soundboardVolume').press('ArrowRight');
          await expect(page.locator('#soundboardVolumeValue')).toHaveText('35%');
          await page.locator('[data-play-sound="' + f.soundId + '"]').click();
          await expect
            .poll(() => page.evaluate(() => window.__soundAudios.at(-1)?.volume))
            .toBe(0.35);
          await expect
            .poll(() => page.evaluate(() => window.__soundAudios.at(-1)?.currentTime))
            .toBeGreaterThan(0.25);
          await page.evaluate(() => {
            window.__firstEffect = window.__soundAudios.at(-1);
            window.__effectCount = window.__soundAudios.length;
          });
          await expect
            .poll(() => memberPage.evaluate(() => window.__soundAudios.at(-1)?.currentTime))
            .toBeGreaterThan(0.25);
          await memberPage.evaluate(() => {
            window.__firstEffect = window.__soundAudios.at(-1);
            window.__effectCount = window.__soundAudios.length;
          });
          await memberPage.locator('#deafenVoiceBtn').click();
          await page.locator('[data-play-sound="' + f.soundId + '"]').click();
          await expect
            .poll(() => page.evaluate(() => window.__firstEffect.currentTime))
            .toBeLessThan(0.2);
          await expect
            .poll(() => memberPage.evaluate(() => window.__firstEffect.currentTime))
            .toBeLessThan(0.2);
          assert(
            await memberPage.evaluate(
              () =>
                window.__soundAudios.at(-1) === window.__firstEffect &&
                window.__soundAudios.length === window.__effectCount &&
                window.__firstEffect.volume === 0,
            ),
          );
          await memberPage.locator('#deafenVoiceBtn').click();
          await memberPage.locator('#joinVoiceBtn').click();
          assert(
            await page.evaluate(
              () =>
                window.__soundAudios.at(-1) === window.__firstEffect &&
                window.__soundAudios.length === window.__effectCount &&
                !window.__firstEffect.paused,
            ),
          );
          await page.locator('#soundStop').click();
          await page.locator('#soundboardClose').click();
          await page.setViewportSize({ width: 390, height: 844 });
          await page.locator('#soundboardToggle').click();
          const menu = await page.locator('#soundboardDialog').boundingBox();
          assert(
            menu.x === 8 &&
              menu.x + menu.width <= 390 &&
              menu.y >= 0 &&
              menu.y + menu.height <= 844,
          );
          await expect(page.locator('#soundboardClose')).toBeVisible();
          await page.locator('#soundUploadDetails summary').click();
          await page
            .locator('#soundFile')
            .setInputFiles({ name: 'outro.wav', mimeType: 'audio/wav', buffer: wave(30) });
          await expect(page.locator('#soundUpload')).toBeEnabled();
          await page.locator('#soundUpload').scrollIntoViewIfNeeded();
          await page.locator('#soundName').click();
          await page.locator('#soundName').fill('Nome editado');
          await expect(page.locator('#soundboardDialog')).toBeVisible();
          await expect(page.locator('#soundName')).toBeFocused();
          await page.screenshot({ path: path.join(artifacts, 'frontend-soundboard-mobile.png') });
          await page.keyboard.press('Escape');
          await expect(page.locator('#soundboardDialog')).toBeHidden();
          await page.setViewportSize({ width: 1440, height: 1000 });
        },
      );
      await step(
        'compact sound tiles fit four columns with many uploads on desktop and mobile',
        async () => {
          const files = Array.from({ length: 18 }, (_, i) => ({
            id: i === 0 ? f.soundId : 'sound-' + i,
            name: 'Efeito ' + (i + 1) + '.wav',
            ownerId: owner.user.id,
            kind: 'soundboard',
            mime: 'audio/wav',
            bytes: 32044,
            durationMs: 1000,
          }));
          await page.route(f.base + '/files/soundboard**', (route) =>
            route.fulfill({ json: { files, hasMore: false } }),
          );
          await page.locator('#soundboardToggle').click();
          if ((await page.locator('#soundUploadDetails').getAttribute('open')) !== null)
            await page.locator('#soundUploadDetails summary').click();
          await expect(page.locator('.sound-thumbnail')).toHaveCount(18);
          await page.locator('.sound-thumbnail').first().scrollIntoViewIfNeeded();
          const first = await page.locator('.sound-thumbnail').nth(0).boundingBox(),
            fourth = await page.locator('.sound-thumbnail').nth(3).boundingBox();
          assert(first.width <= 20 && first.height <= 20);
          assert(Math.abs(first.y - fourth.y) < 2);
          const effectShape = await page.locator('.sound-card').first().boundingBox();
          assert(effectShape.height <= 84, JSON.stringify(effectShape));
          await page.screenshot({ path: path.join(artifacts, 'frontend-sounds-compact.png') });
          await page.setViewportSize({ width: 390, height: 844 });
          const one = await page.locator('.sound-thumbnail').nth(0).boundingBox(),
            four = await page.locator('.sound-thumbnail').nth(3).boundingBox();
          assert(Math.abs(one.y - four.y) < 2);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({
            path: path.join(artifacts, 'frontend-sounds-compact-mobile.png'),
          });
          await page.locator('#soundboardClose').click();
          await page.setViewportSize({ width: 1440, height: 1000 });
        },
      );
      await step(
        'volume controls remain inside their cards and online indicators sit outside avatars',
        async () => {
          await memberPage.locator('#joinVoiceBtn').click();
          await expect
            .poll(() => memberPage.evaluate(() => window.TronoSocial.voiceJoined))
            .toBe(true);
          await page
            .locator('#voiceRoster .voice-person:has(.mn-peer-gain) .participant-expand')
            .click();
          await expect(page.locator('.mn-peer-gain')).toBeVisible();
          const gain = page.locator('.mn-peer-gain');
          const bounds = await gain.boundingBox(),
            slider = await gain.locator('input').boundingBox(),
            output = await gain.locator('output').boundingBox();
          assert(slider.x >= bounds.x && slider.x + slider.width <= bounds.x + bounds.width + 1);
          assert(slider.y >= output.y + output.height, 'slider sits below the label and value');
          if (!(await page.locator('#communityPanel').isVisible()))
            await page.locator('#communityToggle').click();
          const avatar = page.locator('.community-person.is-online .community-avatar').first(),
            icon = await avatar.boundingBox(),
            dot = await avatar.locator('.community-status-dot').boundingBox();
          assert(
            dot.x + dot.width > icon.x + icon.width && dot.y + dot.height > icon.y + icon.height,
          );
          await page.locator('#voiceSettingsBtn').click();
          await expect(page.locator('#micGainSlider')).toBeVisible();
          await page.screenshot({ path: path.join(artifacts, 'frontend-settings-desktop.png') });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({ path: path.join(artifacts, 'frontend-settings-mobile.png') });
          const input = await page.locator('#micGainSlider').boundingBox();
          assert(input.x >= 0 && input.x + input.width <= 390);
          await page.locator('#voiceSettingsClose').click();
          if (await page.locator('#communityPanel').isVisible())
            await page.locator('#communityClose').click();
          await memberPage.locator('#joinVoiceBtn').click();
        },
      );
      await step('desktop/mobile layout and preserved game lobby', async () => {
        await page.screenshot({ path: path.join(artifacts, 'frontend-chat-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(artifacts, 'frontend-chat-mobile.png') });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await expect(page.locator('#soundboardBtn')).toHaveCount(0);
        for (const id of ['joinVoiceBtn', 'cameraBtn', 'screenShareBtn', 'soundboardToggle']) {
          await expect(page.locator('#' + id)).toBeVisible();
          const box = await page.locator('#' + id).boundingBox();
          assert(box.x >= 0 && box.x + box.width <= 391, id + ' must fit mobile viewport');
          assert(box.y >= 0 && box.y + box.height <= 845, id + ' must remain on screen');
        }
        await page.locator('[data-workspace-area="games"]').click();
        await page.locator('#gamesHome').click();
        await expect(page.locator('#portalScreen')).toBeVisible();
        await page.locator('#openGamePortalBtn').click();
        await expect(page.locator('#gamesScreen')).toBeVisible();
        await page.locator('#playThrone').click();
        await expect(page.locator('#setupScreen')).toBeVisible();
        await expect(page.locator('.room-enter').first()).toBeVisible();
        await page.locator('#backFromLobbyBtn').click();
        await page.screenshot({
          path: path.join(artifacts, 'frontend-portal-mobile.png'),
          fullPage: true,
        });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await expect(page.locator('#portalMusicVolume')).toBeVisible();
        await page.evaluate(() => {
          const stage = document.getElementById('portalStage');
          stage.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 500 }));
          window.TronoPortal.showOnly('setupScreen');
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await page.evaluate(() => window.TronoPortal.showPortal());
        await page.setViewportSize({ width: 1440, height: 1000 });
        await expect(page.locator('#openVoicePortalBtn')).toBeInViewport();
        await expect(page.locator('#openGamePortalBtn')).toBeInViewport();
        assert(
          await page.evaluate(() =>
            ['--px', '--py'].every(
              (key) =>
                Math.abs(
                  Number(document.getElementById('portalStage').style.getPropertyValue(key)),
                ) <= 1,
            ),
          ),
        );
        await page.screenshot({
          path: path.join(artifacts, 'frontend-portal-desktop.png'),
          fullPage: true,
        });
      });
      assert.deepEqual(errors, [], 'No uncaught browser errors');
    } finally {
      for (const context of contexts) await context.close();
      await browser?.close();
      await f.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
