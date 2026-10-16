'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');
const {chromium, expect} = require('@playwright/test');
const {startFixture} = require('./auth-fixture');

test('stream invitations, prompt media shutdown and compact call layouts', {timeout: 120000}, async t => {
  const server = await new Promise(resolve => {
    const s = express().use(express.static(path.resolve(__dirname, '../frontend'))).listen(0, '127.0.0.1', () => resolve(s));
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const fixture = await startFixture({port: 10889, appOrigin: origin});
  const errors = [];
  let browser;
  try {
    const accounts = [];
    for (const [email, nickname] of [['call-controls-owner@example.test', 'Ana'], ['call-controls-peer@example.test', 'Bruno'], ['call-controls-desktop@example.test', 'Cris']]) {
      await fixture.call('signup', {email, nickname, password: 'Senha12!'});
      await fixture.call('verify', {token_hash: [...fixture.links.keys()].at(-1), type: 'signup'});
      accounts.push((await fixture.call('login', {email, password: 'Senha12!'})).data);
    }
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined), args: [
      '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'
    ]});
    async function client(data, native = false) {
      const context = await browser.newContext({viewport: {width: 1280, height: 720}, permissions: ['camera', 'microphone']});
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await context.route('**/community/profiles/*', route => route.fulfill({json: {profile: {
        nickname: data.user.nickname, personalization: {cover_file_id: 'test-cover', background_file_id: 'test-background', accent: '#bd6fe8', cover_position: 25}
      }}}));
      await context.route('**/files/test-cover/url', route => route.fulfill({json: {url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#723da8"/><circle cx="260" cy="30" r="100" fill="#dd8a68"/></svg>')}}));
      await context.addInitScript(({base, data, native}) => {
        window.TRONO_BACKEND_URL = base;
        sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('tronoSfxEnabled', '0');
        localStorage.setItem('tronoNoiseSuppression', '0');
        navigator.mediaDevices.getDisplayMedia = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1280; canvas.height = 720;
          canvas.getContext('2d').fillRect(0, 0, 1280, 720);
          window.__displaySource = canvas.captureStream(15);
          return window.__displaySource;
        };
        if (native) window.TronoDesktop = {
          version: '0.2.4', clipsSuspended: true,
          readSession: async () => null, saveSession: async () => {}, getMediaPermissions: async () => ['audio', 'video'],
          onCapture: () => {}, onCaptureCancel: () => {}, onApplicationAudio: () => {}, configureClips: async () => ({suspended: true}),
          getWindowState: async () => ({fullscreen: false}), onWindowState: () => {},
          getUpdateState: async () => ({status: 'idle'}), onUpdateState: callback => window.__updateState = callback,
          checkUpdates: async () => ({status: 'current'})
        };
        // Delay transport teardown without delaying native track.stop().
        window.__peers = [];
        const NativePeer = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePeer {
          constructor(...args) {super(...args); window.__peers.push(this);}
        };
        const replace = RTCRtpSender.prototype.replaceTrack;
        window.__detachReleases = [];
        RTCRtpSender.prototype.replaceTrack = function(track) {
          if (track === null && window.__holdDetach) {
            return new Promise((resolve, reject) => window.__detachReleases.push(() => replace.call(this, track).then(resolve, reject)));
          }
          return replace.call(this, track);
        };
      }, {base: fixture.base, data, native});
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(origin);
      await page.evaluate(() => window.TronoAuth.ready);
      await page.locator('#openVoicePortalBtn').click();
      await expect(page.locator('#callWorkspace')).toBeVisible();
      if (!await page.evaluate(() => window.TronoSocial.voiceJoined)) await page.locator('#joinVoiceBtn').click();
      await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      return page;
    }
    const owner = await client(accounts[0]), viewer = await client(accounts[1]);
    await owner.locator('#screenShareBtn').click();
    await owner.locator('#screenOptionsConfirm').click();
    await expect.poll(() => owner.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
    const invitation = viewer.locator('.screen-share-tile.stream-invitation');

    await t.test('watch button is reachable without maximizing, in both layouts and small windows', async () => {
      for (const mode of ['original', 'discord']) {
        await viewer.evaluate(mode => window.TronoAppLayout.apply(mode), mode);
        for (const [width, height] of [[1280, 720], [900, 600], [390, 844], [844, 390]]) {
          await viewer.setViewportSize({width, height});
          await viewer.evaluate(() => {window.TronoMessenger.close(); window.TronoSocial.toggleTextChat(false);});
          const watch = invitation.locator('.mn-watch-stream');
          await expect(watch).toBeVisible();
          await watch.click({timeout: 3000});
          await expect(viewer.locator('.screen-share-tile').first()).not.toHaveClass(/stream-invitation/);
          await expect(viewer.locator('.media-maximized')).toHaveCount(0);
          await viewer.evaluate(() => window.TronoSocial.toggleWatchStream(document.querySelector('.screen-share-tile').dataset.peer));
          await expect(invitation).toBeVisible();
        }
      }
    });

    await t.test('camera and screen disappear on both clients while sender teardown is stalled', async () => {
      await owner.locator('#cameraBtn').click();
      await expect.poll(() => owner.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await expect(viewer.locator('.voice-person.camera-in-profile')).toHaveCount(1);
      await owner.evaluate(() => {
        window.__heldCamera = document.querySelector('.camera-tile video').srcObject.getVideoTracks()[0];
        window.__holdDetach = true;
      });
      await owner.locator('#cameraBtn').click();
      await expect(owner.locator('#cameraBtn')).toHaveAttribute('aria-pressed', 'false', {timeout: 1500});
      await expect(viewer.locator('.voice-person.camera-in-profile')).toHaveCount(0, {timeout: 1500});
      assert(await owner.evaluate(() => window.__heldCamera.readyState === 'ended'));
      await owner.locator('#screenShareBtn').click();
      await expect(owner.locator('.screen-share-tile')).toHaveCount(0, {timeout: 1500});
      await expect(viewer.locator('.screen-share-tile')).toHaveCount(0, {timeout: 1500});
      assert(await owner.evaluate(() => window.__displaySource.getTracks().every(track => track.readyState === 'ended')));
      assert(await owner.evaluate(() => window.__detachReleases.length >= 2));
      await owner.evaluate(() => {window.__holdDetach = false; for (const release of window.__detachReleases.splice(0)) release();});
    });

    await t.test('header collapse persists and restores its actions without changing the call', async () => {
      for (const mode of ['original', 'discord']) {
        await viewer.evaluate(mode => window.TronoAppLayout.apply(mode), mode);
        for (const [width, height] of [[1440, 900], [900, 600], [390, 844], [844, 390]]) {
          await viewer.setViewportSize({width, height});
          const before = await viewer.evaluate(() => ({id: window.TronoSocial.getLocalAudioTrack().id, room: window.TronoNetwork.primaryRoom}));
          await viewer.locator('#workspaceHeaderToggle').click();
          await expect(viewer.locator('.chat-only-topbar')).toBeHidden();
          await expect(viewer.locator('#workspaceHeaderToggle')).toBeInViewport();
          const top = await viewer.locator('#callWorkspaceMain').evaluate(el => el.getBoundingClientRect().top);
          assert.equal(top, 0);
          await viewer.locator('#workspaceHeaderToggle').click();
          await expect(viewer.locator('#chatProfileBtn')).toBeVisible();
          await expect(viewer.locator('#chatOnlyTextBtn')).toBeInViewport();
          assert.deepEqual(await viewer.evaluate(() => ({id: window.TronoSocial.getLocalAudioTrack().id, room: window.TronoNetwork.primaryRoom})), before);
          assert(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
      }
      await viewer.locator('#workspaceHeaderToggle').click();
      await viewer.reload();
      await viewer.evaluate(() => window.TronoAuth.ready);
      await viewer.evaluate(() => window.TronoAppLayout.navigate('community'));
      await expect(viewer.locator('.chat-only-topbar')).toBeHidden();
      await viewer.locator('#workspaceHeaderToggle').click();
    });

    await t.test('covers frame each participant and direct messages align with the call', async () => {
      await owner.setViewportSize({width: 1440, height: 900});
      await owner.evaluate(() => {window.TronoAppLayout.apply('original'); window.TronoMessenger.openFriends();});
      await expect(owner.locator('.participant-background img').first()).toBeVisible();
      assert(await owner.locator('.participant-background img').first().evaluate(img => img.naturalWidth > 0));
      const panel = await owner.locator('#messengerPanel').boundingBox();
      const main = await owner.locator('#callWorkspaceMain').boundingBox();
      assert.equal(panel.y, main.y);
      assert.equal(await owner.locator('#messengerPanel').evaluate(el => getComputedStyle(el).paddingTop), '8px');
      const avatar = owner.locator('#voiceRoster .mn-person-avatar').first();
      await avatar.click();
      await expect(owner.locator('#memberProfileDialog')).toBeVisible();
      await owner.locator('#memberProfileDialog .member-close').click();
      await fs.mkdir(path.resolve(__dirname, '../artifacts/call-controls'), {recursive: true});
      await owner.screenshot({path: path.resolve(__dirname, '../artifacts/call-controls/original-direct.png')});
    });

    await t.test('desktop update icon survives updater state changes and stays at the bottom left', async () => {
      const desktop = await client(accounts[2], true);
      await desktop.evaluate(() => window.TronoAppLayout.apply('discord'));
      for (const state of [{status: 'idle'}, {status: 'downloading', percent: 62}, {status: 'ready', version: '0.2.5'}]) {
        await desktop.evaluate(state => window.__updateState(state), state);
        await expect(desktop.locator('#desktopUpdateCheck svg')).toBeVisible();
      }
      await desktop.locator('.desktop-update-banner button[aria-label]').click();
      for (const [width, height] of [[1440, 900], [900, 600], [844, 390]]) {
        await desktop.setViewportSize({width, height});
        const rect = await desktop.locator('#desktopUpdateCheck').boundingBox();
        assert(rect.x >= 0 && rect.x < 68 && rect.y + rect.height <= height && rect.y > height - 80, JSON.stringify({width, height, rect}));
      }
      await desktop.setViewportSize({width: 390, height: 844});
      await expect(desktop.locator('#desktopUpdateCheck svg')).toBeVisible();
      await expect(desktop.locator('#desktopUpdateCheck')).toBeInViewport();
      await desktop.setViewportSize({width: 1440, height: 900});
      await desktop.screenshot({path: path.resolve(__dirname, '../artifacts/call-controls/discord-desktop.png')});
      await desktop.close();
    });
    await fs.mkdir(path.resolve(__dirname, '../artifacts/call-controls'), {recursive: true});
    await viewer.screenshot({path: path.resolve(__dirname, '../artifacts/call-controls/compact.png')});
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await fixture.stop();
    await new Promise(resolve => server.close(resolve));
  }
});
