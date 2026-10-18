'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');

test(
  'notifications preserve account preferences, unread state and guarded delivery across settings placements',
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
      fixture = await startFixture({ port: 10927, appOrigin: origin });
      const emails = ['notifications-first@example.test', 'notifications-second@example.test'];
      const accounts = [];
      for (const [index, email] of emails.entries()) {
        await fixture.call('signup', {
          email,
          nickname: 'Avisos ' + (index + 1),
          password: 'Senha12!',
        });
        await fixture.call('verify', {
          token_hash: [...fixture.links.keys()].at(-1),
          type: 'signup',
        });
        accounts.push((await fixture.call('login', { email, password: 'Senha12!' })).data);
      }
      browser = await chromium.launch({
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH || process.env.AUTH_TEST_CHROMIUM || undefined,
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
      });

      for (const native of [false, true]) {
        await t.test(
          native ? 'native delivery and desktop settings' : 'browser delivery and call settings',
          async () => {
            const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
            const errors = [];
            try {
              const initial = (
                await fixture.call('login', { email: emails[0], password: 'Senha12!' })
              ).data;
              await context.route('**/*', (route) =>
                new URL(route.request().url()).hostname === '127.0.0.1'
                  ? route.continue()
                  : route.abort(),
              );
              await context.addInitScript(
                ({ base, initial, native }) => {
                  window.TRONO_BACKEND_URL = base;
                  sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(initial));
                  localStorage.setItem('tronoMusicEnabled', '0');
                  localStorage.setItem('tronoSfxEnabled', '0');
                  window.__focused = true;
                  document.hasFocus = () => window.__focused;
                  window.focus = () => {};
                  window.__notices = [];
                  window.__nativeNotices = [];
                  window.__permissionRequests = 0;
                  window.__sockets = [];
                  window.__chatNotices = [];
                  const WebSocketBase = window.WebSocket;
                  window.WebSocket = class extends WebSocketBase {
                    constructor(...args) {
                      super(...args);
                      window.__sockets.push(this);
                      this.addEventListener('message', (event) => {
                        const message = JSON.parse(event.data);
                        if (message.type === 'chat-notice')
                          window.__chatNotices.push({ socket: this, data: event.data });
                      });
                    }
                  };
                  window.Notification = class {
                    static permission = 'denied';
                    static async requestPermission() {
                      window.__permissionRequests++;
                      return this.permission;
                    }
                    constructor(title, options) {
                      this.title = title;
                      this.options = options;
                      this.closed = false;
                      window.__notices.push(this);
                    }
                    close() {
                      this.closed = true;
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
                      checkUpdates: async () => ({ status: 'current' }),
                      notify: async (payload) => window.__nativeNotices.push(payload),
                      onNotificationClick: (listener) => (window.__nativeClick = listener),
                    };
                },
                { base: fixture.base, initial, native },
              );
              const page = await context.newPage();
              page.setDefaultTimeout(10000);
              page.on('pageerror', (error) => errors.push(error.message));
              page.on('dialog', (dialog) => dialog.accept());
              await page.goto(origin);
              await page.waitForFunction(() => window.TronoAuth?.ready);
              await page.evaluate(() => window.TronoAuth.ready);
              await expect
                .poll(() => page.evaluate(() => window.TronoNetwork.connected))
                .toBe(true);
              await page.locator('#openVoicePortalBtn').click();
              await expect(page.locator('#callWorkspace')).toBeVisible();
              await expect
                .poll(() => page.evaluate(() => window.TronoNetwork.currentRoom))
                .toBe('chat-livre');

              async function openSettings() {
                if (native) {
                  await page.evaluate(() => window.TronoDesktopSettings.open('notifications'));
                  await expect(page.locator('[data-settings-panel="notifications"]')).toBeVisible();
                } else {
                  if (!(await page.locator('#callWorkspace').isVisible())) {
                    await page.locator('#openVoicePortalBtn').click();
                    await expect(page.locator('#callWorkspace')).toBeVisible();
                  }
                  await page.evaluate(() => window.TronoCallSettings.open('notifications'));
                }
                await expect(page.locator('#notificationMode')).toBeVisible();
              }
              async function closeSettings() {
                await page.locator('#voiceSettingsClose').click();
              }
              await openSettings();
              await expect(page.locator('#notificationMode')).toHaveValue('mentions');
              await expect(
                page.locator('#notificationChannel option[value="chat-livre"]'),
              ).toHaveCount(1);
              await page.evaluate(() => {
                window.__notificationFields = [
                  'notificationMode',
                  'notificationChannel',
                  'notificationChannelMute',
                  'notificationPermission',
                ].map((id) => document.getElementById(id));
                window.__notificationOwner = window.TronoNotifications;
                window.__notificationNetwork = window.TronoNetwork;
                window.__notificationSocketId = window.TronoNetwork.clientId;
              });
              await page.locator('#notificationMode').selectOption('all');
              await page.locator('#notificationChannel').selectOption('chat-jogos');
              await page.locator('#notificationChannelMute').check();
              await expect
                .poll(() => page.evaluate(() => window.TronoPersonal.get('notifications')))
                .toBe('all');
              assert.equal(
                await page.evaluate(() => window.TronoNotifications.muted('chat-jogos')),
                true,
              );
              await page.evaluate(() => window.TronoPersonal.set('appLayout', 'discord'));
              await expect(page.locator('body')).toHaveAttribute('data-app-layout', 'discord');
              await closeSettings();
              await openSettings();
              await expect(page.locator('#notificationChannel')).toHaveValue('chat-jogos');
              await expect(page.locator('#notificationChannelMute')).toBeChecked();
              assert.equal(
                await page.evaluate(
                  () =>
                    window.__notificationFields.every(
                      (node) => document.getElementById(node.id) === node,
                    ) &&
                    window.__notificationOwner === window.TronoNotifications &&
                    window.__notificationNetwork === window.TronoNetwork &&
                    window.__notificationSocketId === window.TronoNetwork.clientId,
                ),
                true,
                'moving settings must preserve controls, notification state and the existing socket',
              );
              if (native) await expect(page.locator('#notificationPermission')).toBeHidden();
              else {
                await page.locator('#notificationPermission').click();
                await expect(page.locator('#notificationPermissionStatus')).toContainText(
                  'não foram permitidos',
                );
                assert.equal(await page.evaluate(() => window.__permissionRequests), 1);
                await page.evaluate(() => {
                  window.Notification.permission = 'granted';
                });
                await page.locator('#notificationPermission').click();
                await expect(page.locator('#notificationPermissionStatus')).toHaveText(
                  'Avisos ativados.',
                );
                await page.evaluate(() => {
                  window.Notification.permission = 'denied';
                });
              }
              await page.locator('#notificationMode').selectOption('off');
              await closeSettings();
              await page.evaluate(() => {
                window.__focused = false;
              });

              // A real server message supplies its own identity; replay only its notice envelope.
              const senderContext = await browser.newContext();
              try {
                await senderContext.addInitScript(
                  ({ base, account }) => {
                    window.TRONO_BACKEND_URL = base;
                    sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(account));
                    localStorage.setItem('tronoMusicEnabled', '0');
                    localStorage.setItem('tronoSfxEnabled', '0');
                  },
                  { base: fixture.base, account: accounts[1] },
                );
                await senderContext.route('**/*', (route) =>
                  new URL(route.request().url()).hostname === '127.0.0.1'
                    ? route.continue()
                    : route.abort(),
                );
                const sender = await senderContext.newPage();
                await sender.goto(origin);
                await sender.waitForFunction(() => window.TronoAuth?.ready);
                await sender.evaluate(() => window.TronoAuth.ready);
                await sender.evaluate(() => window.TronoChatHub.enter({ channelId: 'chat-livre' }));
                await expect
                  .poll(() => sender.evaluate(() => window.TronoNetwork.currentRoom))
                  .toBe('chat-livre');
                await sender.evaluate(() =>
                  window.TronoNetwork.sendChat('Aviso de regressão ' + Date.now()),
                );
                await expect
                  .poll(() =>
                    page.evaluate(
                      () => window.TronoNotifications.getChannelState('chat-livre').unread,
                    ),
                  )
                  .toBe(1);
                await page.evaluate(() => {
                  const notice = window.__chatNotices.at(-1);
                  notice.socket.dispatchEvent(new MessageEvent('message', { data: notice.data }));
                });
                assert.equal(
                  await page.evaluate(
                    () => window.TronoNotifications.getChannelState('chat-livre').unread,
                  ),
                  1,
                );
                assert.equal(
                  await page.evaluate(
                    () => window.__notices.length + window.__nativeNotices.length,
                  ),
                  0,
                );
                await page.evaluate(() => {
                  window.__focused = true;
                  window.TronoSocial.toggleTextChat(true);
                });
                await expect(page.locator('#courtChatInput')).toBeVisible();
                await page.locator('#courtChatInput').click();
                await expect
                  .poll(() =>
                    page.evaluate(
                      () => window.TronoNotifications.getChannelState('chat-livre').unread,
                    ),
                  )
                  .toBe(0);
                await page.evaluate(() => {
                  window.__focused = false;
                });
                // The real backend enforces a 450 ms chat-send cooldown.
                await sender.waitForTimeout(500);
                await sender.evaluate(() =>
                  window.TronoNetwork.sendChat('Ainda não lida ' + Date.now()),
                );
                await expect
                  .poll(() =>
                    page.evaluate(
                      () => window.TronoNotifications.getChannelState('chat-livre').unread,
                    ),
                  )
                  .toBe(1);
              } finally {
                await senderContext.close();
              }

              await page.evaluate(() => {
                window.TronoPersonal.set('notifications', 'mentions');
                window.__openedNotifications = [];
                window.TronoMessenger.open = (id) => window.__openedNotifications.push(id);
                window.Notification.permission = 'granted';
                window.__focused = true;
              });
              const notify = (key, extra = {}) =>
                page.evaluate(
                  ({ key, extra, peerId }) =>
                    window.TronoNotifications.notify({
                      key,
                      title: 'Aviso de teste',
                      body: 'x'.repeat(240),
                      target: { type: 'direct', id: peerId },
                      ...extra,
                    }),
                  { key, extra, peerId: accounts[1].user.id },
                );
              await notify('not-a-mention');
              await notify('muted-mention', {
                mention: true,
                target: { type: 'channel', id: 'chat-jogos' },
              });
              assert.equal(
                await page.evaluate(() => window.__notices.length + window.__nativeNotices.length),
                0,
              );
              await notify('foreground-direct', { direct: true });
              assert.equal(await page.evaluate(() => window.__notices.length), 0);
              assert.equal(
                await page.evaluate(() => window.__nativeNotices.length),
                native ? 1 : 0,
              );
              await page.evaluate(() => {
                window.__focused = false;
              });
              await notify('background-direct', { direct: true });
              const delivery = await page.evaluate(
                (native) =>
                  native ? window.__nativeNotices.at(-1) : window.__notices.at(-1).options,
                native,
              );
              assert.equal(delivery.body.length, 220);
              assert.equal(
                native ? delivery.key : delivery.tag,
                initial.user.id + ':background-direct',
              );
              if (native) assert.equal(delivery.target.accountId, initial.user.id);
              await page.evaluate(async (native) => {
                if (native) await window.__nativeClick(window.__nativeNotices.at(-1).target);
                else window.__notices.at(-1).onclick();
              }, native);
              assert.deepEqual(await page.evaluate(() => window.__openedNotifications), [
                accounts[1].user.id,
              ]);
              if (!native)
                assert.equal(await page.evaluate(() => window.__notices.at(-1).closed), true);

              await page.evaluate(() => window.TronoAuth.logout());
              await expect(page.locator('#authDialog')).toBeVisible();
              await page.locator('#authEmail').fill(emails[1]);
              await page.locator('#authPassword').fill('Senha12!');
              await page.locator('#authSubmitBtn').click();
              await expect(page.locator('#authDialog')).toBeHidden();
              await expect
                .poll(() => page.evaluate(() => window.TronoAuth.user?.id))
                .toBe(accounts[1].user.id);
              await openSettings();
              await expect(page.locator('#notificationMode')).toHaveValue('mentions');
              await page.locator('#notificationChannel').selectOption('chat-jogos');
              await expect(page.locator('#notificationChannelMute')).not.toBeChecked();
              await page.locator('#notificationMode').selectOption('off');
              const preferences = await page.evaluate(
                ([firstId, secondId]) => ({
                  first: JSON.parse(localStorage.getItem('mn-personal:' + firstId)),
                  second: JSON.parse(localStorage.getItem('mn-personal:' + secondId)),
                }),
                accounts.map((account) => account.user.id),
              );
              assert.equal(preferences.first.notifications, 'mentions');
              assert.equal(preferences.first['mute:chat-jogos'], true);
              assert.equal(preferences.second.notifications, 'off');
              assert.equal(preferences.second['mute:chat-jogos'], undefined);
              assert.equal(
                await page.evaluate(
                  () => window.TronoNotifications.getChannelState('chat-livre').unread,
                ),
                0,
              );
              await page.evaluate(async (native) => {
                if (native) await window.__nativeClick(window.__nativeNotices.at(-1).target);
                else window.__notices.at(-1).onclick();
              }, native);
              assert.deepEqual(
                await page.evaluate(() => window.__openedNotifications),
                [accounts[1].user.id],
                'an old account notification must not navigate in the next account',
              );
              assert.deepEqual(errors, []);
            } finally {
              await context.close();
            }
          },
        );
      }
    } finally {
      await browser?.close();
      await fixture?.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
