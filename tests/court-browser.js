'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express'),
  path = require('node:path'),
  fs = require('node:fs/promises'),
  WebSocket = require('ws'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture');
const { installSyntheticCallMedia } = require('./synthetic-call-media.cjs');
test(
  'court desktop: responsive empty call, live voice across game navigation, handbook and law feedback',
  { timeout: 120000 },
  async (t) => {
    const origin = 'http://127.0.0.1:10704',
      server = express()
        .use(express.static(path.resolve(__dirname, '../out')))
        .listen(10704, '127.0.0.1');
    const f = await startFixture({ port: 10703, appOrigin: origin });
    let browser, context, peer;
    const errors = [];
    async function setLayout(page, mode) {
      await page.evaluate((mode) => window.TronoAppLayout.apply(mode, { save: true }), mode);
      await expect(page.locator('body')).toHaveAttribute('data-app-layout', mode);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    }
    try {
      await f.call('signup', {
        email: 'court@example.test',
        nickname: 'Casa da Lua',
        password: 'Senha12!',
      });
      await f.call('verify', { token_hash: [...f.links.keys()].at(-1), type: 'signup' });
      const data = (await f.call('login', { email: 'court@example.test', password: 'Senha12!' }))
        .data;
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      context = await browser.newContext({
        viewport: { width: 1440, height: 960 },
        permissions: ['microphone', 'camera'],
      });
      await context.addInitScript(installSyntheticCallMedia);
      await context.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      const initialize = ({ base, data }) => {
        navigator.mediaDevices.getDisplayMedia = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#384460';
          ctx.fillRect(0, 0, 1280, 720);
          return canvas.captureStream(15);
        };
        window.TRONO_BACKEND_URL = base;
        sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
        localStorage.setItem('tronoSfxEnabled', '0');
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('mnDesktopNoiseMode', 'native');
        const Socket = window.WebSocket;
        window.WebSocket = class extends Socket {
          constructor(...args) {
            super(...args);
            window.__courtSocket = this;
            this.addEventListener('message', (event) => {
              try {
                const m = JSON.parse(event.data);
                if (m.type === 'game-state') window.__courtPacket = m;
              } catch {}
            });
          }
        };
        window.TronoDesktop = {
          version: '0.1.8',
          clipsSuspended: true,
          readSession: async () => null,
          saveSession: async () => {},
          getMediaPermissions: async () => ['audio', 'video'],
          onCapture: () => {},
          onCaptureCancel: () => {},
          getWindowState: async () => ({ fullscreen: !!document.fullscreenElement }),
          toggleFullscreen: async () => {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
            return { fullscreen: !!document.fullscreenElement };
          },
          onWindowState: (listener) => {
            const change = () => listener({ fullscreen: !!document.fullscreenElement });
            document.addEventListener('fullscreenchange', change);
            return () => document.removeEventListener('fullscreenchange', change);
          },
          onUpdateState: () => {},
          getUpdateState: async () => ({ status: 'idle' }),
          onApplicationAudio: () => {},
          configureClips: async () => ({ suspended: true }),
          openManual: async () => {
            window.__manualOpened = true;
            return { opened: true };
          },
        };
      };
      await context.addInitScript(initialize, { base: f.base, data });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('dialog', (d) => d.accept());
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      await setLayout(page, 'original');
      await page.evaluate(() => window.TronoChatHub.enter({ channelId: 'chat-jogos' }));
      await expect
        .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
        .toBe('chat-jogos');
      assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
      await t.test(
        'empty state is centered in the whole stage and controls stay in the viewport',
        async () => {
          for (const [width, height] of [
            [1440, 960],
            [1280, 720],
            [1024, 768],
            [900, 600],
            [1080, 1920],
            [720, 1280],
            [480, 800],
            [480, 520],
          ]) {
            await page.setViewportSize({ width, height });
            await expect(page.locator('.voice-privacy-note')).toBeVisible();
            await page.waitForTimeout(60);
            const boxes = await page.evaluate(() => {
              const rect = (s) => {
                const r = document.querySelector(s).getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width, h: r.height };
              };
              return {
                note: rect('.voice-privacy-note'),
                stage: rect('.mn-media-stage'),
                dock: rect('#callFocusDock'),
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
              };
            });
            assert(
              Math.abs(boxes.note.x + boxes.note.w / 2 - (boxes.stage.x + boxes.stage.w / 2)) < 3,
              JSON.stringify({ width, height, boxes }),
            );
            assert(
              boxes.note.y + boxes.note.h <= boxes.dock.y + 2,
              JSON.stringify({ width, height, boxes }),
            );
            assert(!boxes.overflow);
            await page.screenshot({
              path: path.resolve(__dirname, `../artifacts/court/empty-${width}x${height}.png`),
            });
          }
        },
      );
      await t.test(
        'camera and muted microphone keep their tracks, socket and transport in the waiting room, match and community',
        async () => {
          await page.setViewportSize({ width: 1280, height: 720 });
          await page.locator('#joinVoiceBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
          await page.locator('#cameraBtn').click();
          await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
          await page.locator('#muteMicBtn').click();
          const snapshot = () =>
            page.evaluate(() => ({
              id: window.TronoNetwork.clientId,
              room: window.TronoNetwork.primaryRoom,
              audio: window.TronoSocial.getLocalAudioTrack().id,
              enabled: window.TronoSocial.getLocalAudioTrack().enabled,
              transport: window.TronoSocial.mediaTransport,
              camera: window.TronoSocial.cameraOn,
              joined: window.TronoSocial.voiceJoined,
              screen: window.TronoSocial.screenSharing,
              cameraTrack: window.TronoSocial.getMediaSources()
                .find((p) => p.self)
                ?.camera?.getVideoTracks()[0]?.id,
            }));
          await page.evaluate(() => window.TronoSocial.startScreenShare());
          const displayBefore = await page.evaluate(
            () => window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0].id,
          );
          const before = await snapshot();
          assert.equal(before.enabled, false);
          await page.getByRole('button', { name: 'Jogos', exact: true }).click();
          await page.locator('#playThrone').click();
          await page.locator('.room-enter[data-room="sala-cetro"]').click();
          await expect(page.locator('#roomSeats')).toContainText('Casa da Lua');
          assert.deepEqual(await snapshot(), before);
          assert.equal(await page.evaluate(() => window.TronoNetwork?.currentRoom), 'chat-jogos');
          await page.locator('[data-desktop-route="community"]').click();
          await expect(page.locator('#callWorkspace')).toBeVisible();
          assert.deepEqual(await snapshot(), before);
          assert.equal(await page.evaluate(() => window.TronoNetwork.gameRoom), 'sala-cetro');
          await page.getByRole('button', { name: 'Jogos', exact: true }).click();
          await page.locator('#playThrone').click();
          await expect(page.locator('#roomScreen')).toBeVisible();
          peer = new WebSocket(f.base.replace('http', 'ws') + '/ws');
          const packets = [];
          peer.on('message', (raw) => packets.push(JSON.parse(raw)));
          require('./court-peer-fixture')(peer);
          await new Promise((r) => peer.once('open', r));
          const send = (m) => peer.send(JSON.stringify(m));
          send({ type: 'guest-authenticate', name: 'Casa do Sol' });
          await expect
            .poll(() => packets.some((m) => m.type === 'guest-result' && m.ok))
            .toBe(true);
          send({ type: 'join-game-room', roomId: 'sala-cetro' });
          await expect.poll(() => packets.some((m) => m.type === 'joined-game-room')).toBe(true);
          send({ type: 'ready', ready: true });
          await page.locator('#readyOnlineBtn').click();
          await expect(page.locator('#startOnlineBtn')).toBeEnabled();
          await page.locator('#startOnlineBtn').click();
          await expect(page.locator('#gameScreen')).toBeVisible();
          await expect
            .poll(() => page.locator('#throneOnlineHandCards .hand-card').count())
            .toBeGreaterThan(0);
          assert.deepEqual(await snapshot(), before);
          // Resolve only initial private UI so layout/nav can be inspected during a live match.
          await page.waitForTimeout(850);
          if (await page.locator('#throneChoiceDialog').isVisible()) {
            const choice = page.locator('#throneChoiceDialog .choice-card').first();
            if (await choice.isVisible()) await choice.click();
          }
          if (await page.locator('#thronePrivateContinue').isVisible())
            await page.locator('#thronePrivateContinue').click();
          await page.evaluate(() => window.TronoDesktopShell.navigate('community'));
          await expect(page.locator('#callWorkspace')).toBeVisible();
          await page.evaluate(() => window.TronoNetwork.requestState());
          await page.waitForTimeout(200);
          await expect(page.locator('#callWorkspace')).toBeVisible();
          assert.deepEqual(await snapshot(), before);
          assert.equal(
            await page.evaluate(
              () =>
                window.__LeiDoTrono.getState().players[window.__LeiDoTrono.getState().localPlayerId]
                  .ai,
            ),
            false,
          );
          await page.evaluate(() => window.TronoDesktopShell.navigate('throne'));
          await expect(page.locator('#gameScreen')).toBeVisible();
          await expect
            .poll(() => page.evaluate(() => document.body.dataset.desktopView))
            .toBe('game');
          await page.waitForTimeout(300);
          await page.screenshot({
            path: path.resolve(__dirname, '../artifacts/court/game-with-call.png'),
          });

          await expect
            .poll(
              async () => {
                if (await page.locator('#throneChoiceDialog').isVisible()) {
                  const choice = page.locator('#throneChoiceDialog .choice-card').first();
                  if (await choice.isVisible()) await choice.click();
                }
                if (await page.locator('#thronePrivateContinue').isVisible())
                  await page.locator('#thronePrivateContinue').click();
                return page.evaluate(() => window.__LeiDoTrono.getState()?.phase);
              },
              { timeout: 15000 },
            )
            .toBe('await-play');

          // True browser fullscreen keeps sibling prompts/cinematics in its fullscreen tree.
          await page.locator('#courtFullscreen').click();
          await expect
            .poll(() =>
              page.evaluate(() => document.fullscreenElement === document.documentElement),
            )
            .toBe(true);
          await expect(page.locator('body')).toHaveClass(/court-fullscreen/);
          await page.evaluate(() => {
            document.getElementById('yourTurnNotice')?.classList.add('hidden');
          });
          for (const layout of ['original', 'discord']) {
            await setLayout(page, layout);
            for (const [width, height] of [
              [1440, 900],
              [1280, 720],
              [1080, 1920],
              [720, 1280],
              [480, 800],
            ]) {
              await page.setViewportSize({ width, height });
              const boxes = await page.evaluate(() => {
                const rect = (n) => {
                  const r = n.getBoundingClientRect();
                  return {
                    x: r.x,
                    y: r.y,
                    right: r.right,
                    bottom: r.bottom,
                    width: r.width,
                    height: r.height,
                  };
                };
                return {
                  table: rect(document.querySelector('.royal-table')),
                  screen: rect(document.querySelector('#gameScreen')),
                  slots: [...document.querySelectorAll('.table-card-slot')].map(rect),
                  hand: [...document.querySelectorAll('#throneOnlineHandCards .hand-card')].map(
                    rect,
                  ),
                  overflow: document.documentElement.scrollWidth > innerWidth + 1,
                };
              });
              assert(!boxes.overflow, JSON.stringify({ layout, width, boxes }));
              assert(
                boxes.slots.every(
                  (r) =>
                    r.x >= boxes.table.x &&
                    r.right <= boxes.table.right + 1 &&
                    r.y >= boxes.table.y &&
                    r.bottom <= boxes.table.bottom + 1,
                ),
              );
              assert(boxes.hand.every((r) => r.height >= 70));
              assert.deepEqual(await snapshot(), before);
              if (width === 1280 || width === 1080 || width === 480)
                await page.screenshot({
                  path: 'artifacts/court/native-' + layout + '-' + width + '.png',
                });
            }
          }
          await page.setViewportSize({ width: 1280, height: 720 });
          await page.locator('#courtFullscreen').click();
          await expect
            .poll(() => page.evaluate(() => document.fullscreenElement === null))
            .toBe(true);
          // Exercise the exact packet order: exchange, private reveal, replacement state.
          // A new state object must not abandon the queued private result.
          await page.evaluate(() => {
            const packet = structuredClone(window.__courtPacket),
              me = packet.state.youSeat,
              other = (me + 1) % 4,
              player = packet.state.players.find((p) => p.id === me),
              card = player.hand.find((card) => card.publicReason !== 'Corte Aberta'),
              otherName = packet.state.players.find((p) => p.id === other).name,
              incoming = Array.from({ length: 48 }, (_, index) => ({
                id: 'c' + index,
                suit: ['cetro', 'chave', 'lamina', 'mascara'][Math.floor(index / 12)],
                value: (index % 12) + 1,
                public: false,
                publicReason: null,
              })).find((candidate) => !player.hand.some((card) => card.id === candidate.id)),
              send = (value) =>
                window.__courtSocket.dispatchEvent(
                  new MessageEvent('message', { data: JSON.stringify(value) }),
                );
            window.__LeiDoTrono.setFast();
            packet.state.phase = 'usurp-reveal';
            packet.state.currentLaw = 'usurpacao';
            packet.state.lastShadow = me;
            player.hand = player.hand.map((held) => (held.id === card.id ? incoming : held));
            packet.state.legalCardIds = [];
            packet.state.influenceLegalCardIds = [];
            packet.state.canUseInfluence = false;
            packet.state.canUseManeuver = false;
            send({
              type: 'game-event',
              event: 'exchange',
              kind: 'usurpacao',
              moves: [
                { from: me, to: other, label: 'Carta separada' },
                { from: other, to: me, label: 'Carta oculta' },
              ],
            });
            send({
              type: 'private-usurpation',
              role: 'shadow',
              outgoing: card,
              incoming,
              otherName,
            });
            send(packet);
          });
          await expect(page.locator('#exchangeCinematic')).toBeVisible();
          await expect(page.locator('.exchange-card-token')).toHaveCount(2);
          await expect(page.locator('#thronePrivateTitle')).toHaveText(
            'Usurpação — informação privada',
            {
              timeout: 7000,
            },
          );
          await expect(page.locator('#exchangeCinematic')).toBeHidden();
          await page.locator('#thronePrivateContinue').click();
          assert.deepEqual(await snapshot(), before);
          await page.evaluate(() => window.TronoNetwork.leaveGameRoom());
          await expect.poll(() => page.evaluate(() => window.TronoNetwork.gameRoom)).toBe(null);
          assert.deepEqual(await snapshot(), before);
          assert.equal(
            await page.evaluate(
              () => window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0].id,
            ),
            displayBefore,
          );
        },
      );
      await t.test(
        'opening community from game voice keeps its call; an explicit voice-channel click moves only the call',
        async () => {
          await f.call('signup', {
            email: 'solo@court.test',
            nickname: 'Casa Solo',
            password: 'Senha12!',
          });
          await f.call('verify', { token_hash: [...f.links.keys()].at(-1), type: 'signup' });
          const account = (
            await f.call('login', { email: 'solo@court.test', password: 'Senha12!' })
          ).data;
          const soloContext = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            permissions: ['microphone', 'camera'],
          });
          await soloContext.addInitScript(installSyntheticCallMedia);
          await soloContext.route('**/*', (route) =>
            new URL(route.request().url()).hostname === '127.0.0.1'
              ? route.continue()
              : route.abort(),
          );
          await soloContext.addInitScript(initialize, { base: f.base, data: account });
          const solo = await soloContext.newPage();
          solo.on('pageerror', (e) => errors.push(e.message));
          try {
            await solo.goto(origin);
            await solo.waitForFunction(() => window.TronoAuth?.ready);
            await solo.evaluate(() => window.TronoAuth.ready);
            await setLayout(solo, 'original');
            await solo.evaluate(() => window.TronoDesktopShell.navigate('throne'));
            await solo.locator('.room-enter[data-room="sala-chave"]').click();
            await expect
              .poll(() => solo.evaluate(() => window.TronoNetwork.gameRoom))
              .toBe('sala-chave');
            await solo.locator('#roomSocialBtn').click();
            await solo.locator('#joinVoiceBtn').click();
            await expect.poll(() => solo.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
            await solo.locator('#cameraBtn').click();
            await expect.poll(() => solo.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
            await solo.locator('#muteMicBtn').click();
            const snapshot = () =>
              solo.evaluate(() => ({
                room: window.TronoNetwork.primaryRoom,
                game: window.TronoNetwork.gameRoom,
                audio: window.TronoSocial.getLocalAudioTrack().id,
                enabled: window.TronoSocial.getLocalAudioTrack().enabled,
                camera: window.TronoSocial.cameraOn,
                joined: window.TronoSocial.voiceJoined,
              }));
            const before = await snapshot();
            assert.equal(before.room, 'sala-chave');
            assert.equal(before.enabled, false);
            await solo.evaluate(() => window.TronoDesktopShell.navigate('community'));
            await expect(solo.locator('#callWorkspace')).toBeVisible();
            await expect
              .poll(() => solo.evaluate(() => window.TronoNetwork?.currentRoom))
              .toBe('chat-livre');
            assert.deepEqual(await snapshot(), before);
            await solo.evaluate(() => window.TronoNetwork.sendChat('Texto junto da voz da mesa'));
            await expect(solo.locator('#courtChatMessages')).toContainText(
              'Texto junto da voz da mesa',
            );
            await solo.evaluate(() => window.TronoDesktopShell.navigate('throne'));
            await expect(solo.locator('#roomScreen')).toBeVisible();
            assert.deepEqual(await snapshot(), before);
            await solo.evaluate(() => window.TronoDesktopShell.navigate('community'));
            await solo.locator('[data-chat-channel="chat-conversa"]').click();
            await expect
              .poll(() => solo.evaluate(() => window.TronoNetwork.primaryRoom))
              .toBe('chat-conversa');
            await expect.poll(() => solo.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
            assert.equal(await solo.evaluate(() => window.TronoNetwork.gameRoom), 'sala-chave');
            await solo.evaluate(() => window.TronoDesktopShell.navigate('throne'));
            await expect(solo.locator('#roomSeats')).toContainText('Casa Solo');
          } finally {
            await soloContext.close();
          }
        },
      );
      await t.test(
        'manual opens locally in the app; website HTML and PDF describe the same ten decrees',
        async () => {
          await page.evaluate(() => window.TronoNetwork.leaveGameRoom());
          await expect.poll(() => page.evaluate(() => window.TronoNetwork.gameRoom)).toBe(null);
          await page.setViewportSize({ width: 1280, height: 720 });
          await page.evaluate(() => window.TronoDesktopShell.navigate('throne'));
          await page.evaluate(() => document.getElementById('manualBtn').click());
          assert(await page.evaluate(() => window.__manualOpened));
          // Canceling local play must not reload the app or end its M&N call.
          const audioBefore = await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id);
          await page.locator('.room-enter[data-room="sala-chave"]').click();
          await expect(page.locator('#roomSeats')).toContainText('Casa da Lua');
          await page.locator('#roomScreen details').evaluate((node) => {
            node.open = true;
          });
          await page.evaluate(() => {
            window.__LeiDoTrono.setFast();
          });
          await page.locator('#startHumanBtn').click();
          await expect(page.locator('#gameScreen')).toBeVisible();
          await page.waitForTimeout(120);
          await page.evaluate(() => document.getElementById('restartBtn').click());
          await expect(page.locator('#setupScreen')).toBeVisible();
          await page.waitForTimeout(400);
          assert.equal(
            await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().id),
            audioBefore,
          );
          const manual = await context.newPage();
          await manual.goto(origin + '/manual/index.html');
          await expect(manual.locator('.decree')).toHaveCount(10);
          await expect(manual.locator('#lei-usurpacao')).toContainText(
            'nunca receba a própria carta',
          );
          await expect(manual.locator('#lei-estandarte')).toContainText('Com dois ou mais trunfos');
          await manual.setViewportSize({ width: 480, height: 800 });
          assert(
            !(await manual.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)),
          );
          const response = await fetch(origin + '/manual/A_Lei_do_Trono_Manual_v0.9.0.pdf');
          assert.equal(response.status, 200);
          assert.equal(
            Buffer.from(await response.arrayBuffer())
              .subarray(0, 5)
              .toString(),
            '%PDF-',
          );
          await manual.close();
        },
      );
      await t.test(
        'each law/decree has a distinct finite animation, disabled by reduced motion',
        async () => {
          const names = await page.evaluate(() => {
            const rules = window.TronoRules,
              host = document.createElement('div');
            host.style.cssText = 'position:fixed;inset:0;pointer-events:none';
            document.body.append(host);
            const values = [];
            for (const [kind, items] of [
              ['law', rules.lawOrder],
              ['decree', rules.decrees.map((d) => d.id)],
            ])
              for (const id of items) {
                const node = document.createElement('div');
                node.className = (kind === 'law' ? 'law-mini' : 'decree-badge') + ' court-arrival';
                node.dataset[kind] = id;
                host.append(node);
                const style = getComputedStyle(node);
                values.push({ name: style.animationName, count: style.animationIterationCount });
              }
            host.remove();
            return values;
          });
          assert.equal(new Set(names.map((v) => v.name)).size, 15);
          assert(names.every((v) => v.name !== 'none' && v.count === '1'));
          await page.emulateMedia({ reducedMotion: 'reduce' });
          assert.equal(
            await page.evaluate(() => {
              const n = document.createElement('div');
              n.className = 'law-mini court-arrival';
              n.dataset.law = 'ordem';
              document.body.append(n);
              const result = getComputedStyle(n).animationName;
              n.remove();
              return result;
            }),
            'none',
          );
        },
      );
      assert.deepEqual(errors, []);
    } finally {
      peer?.terminate();
      await context?.close();
      await browser?.close();
      await f.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
