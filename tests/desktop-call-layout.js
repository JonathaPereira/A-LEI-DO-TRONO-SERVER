'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {_electron, expect} = require('@playwright/test');
const {startFixture} = require('./auth-fixture');
const {closeTestApp, killTestApp} = require('./desktop-test-close');

const root = path.resolve(__dirname, '..');
const origin = 'https://a-lei-do-trono.surge.sh';
const controls = ['muteMicBtn', 'deafenVoiceBtn', 'cameraBtn', 'screenShareBtn', 'soundboardToggle', 'voiceSettingsBtn', 'joinVoiceBtn'];

test('real desktop keeps the same controls, tracks and connected peers across layouts and navigation', {
  timeout: 180000,
  skip: process.platform !== 'win32' && 'Windows desktop regression'
}, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-call-layout-'));
  const apps = [];
  const errors = [];
  let fixture, finished = false;
  t.signal.addEventListener('abort', () => { if (!finished) apps.forEach(killTestApp); }, {once: true});
  try {
    fixture = await startFixture({port: 10743, allowedOrigins: [origin], directAttachments: true});
    async function launch(email, nickname, layout = 'original') {
      await fixture.call('signup', {email, nickname, password: 'LayoutTest12!'});
      await fixture.call('verify', {token_hash: [...fixture.links.keys()].at(-1), type: 'signup'});
      const login = await fixture.call('login', {email, password: 'LayoutTest12!'});
      assert.equal(login.status, 200);
      const {data} = login;
      const app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [path.join(root, 'electron'), '--user-data-dir=' + path.join(directory, nickname),
          '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
        timeout: 30000
      });
      apps.push(app);
      // These dialogs concern synthetic devices in disposable test profiles only.
      await app.evaluate(({dialog}) => { dialog.showMessageBox = async () => ({response: 0}); });
      const page = await app.firstWindow();
      await page.route('https://a-lei-do-trono-server.onrender.com/**', async route => { try { await route.abort(); } catch {} });
      // BrowserWindow uses a persistent session partition. Bind setup to this
      // page, rather than ElectronApplication's default browser context.
      await page.addInitScript(({base, accountId, layout}) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoSfxEnabled', '0');
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('mnDesktopNoiseMode', 'off');
        localStorage.setItem('mn-personal:' + accountId, JSON.stringify({appLayout: layout}));
        window.__layoutPeers = [];
        const Peer = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Peer {
          constructor(config) { super({...config, iceServers: [], iceCandidatePoolSize: 0}); window.__layoutPeers.push(this); }
        };
        window.__layoutCanvases = [];
        const canvasStream = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 640; canvas.height = 360;
          const draw = canvas.getContext('2d');
          draw.fillStyle = '#384460'; draw.fillRect(0, 0, 640, 360);
          window.__layoutCanvases.push(canvas);
          return canvas.captureStream(10);
        };
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async constraints => {
          if (!constraints.video) return capture(constraints);
          const stream = canvasStream();
          if (constraints.audio) for (const track of (await capture({audio: constraints.audio})).getTracks()) stream.addTrack(track);
          return stream;
        };
        navigator.mediaDevices.getDisplayMedia = async () => canvasStream();
      }, {base: fixture.base, accountId: data.user.id, layout});
      const authResponses = [];
      page.on('response', response => { if (response.url().startsWith(fixture.base + '/auth/')) authResponses.push({path: new URL(response.url()).pathname, status: response.status()}); });
      page.setDefaultTimeout(10000);
      await page.waitForURL(origin + '/');
      await page.waitForLoadState('load');
      await page.evaluate(() => window.TronoAuth.ready);
      page.on('pageerror', error => errors.push(error.message));
      await page.reload();await page.waitForFunction(()=>window.TronoAuth?.ready);await page.evaluate(()=>window.TronoAuth.ready);
      await page.evaluate(() => window.TronoAuth.ready);
      assert.equal(await page.evaluate(() => window.TronoNetwork.BACKEND_HTTP), fixture.base);
      await expect(page.locator('#authDialog')).toBeVisible();
      await page.locator('#authEmail').fill(email);
      await page.locator('#authPassword').fill('LayoutTest12!');
      await page.locator('#authSubmitBtn').click();
      try { await expect(page.locator('#authDialog')).not.toBeVisible(); }
      catch (error) { console.error('Login fixture:', {nickname, authResponses, message: await page.locator('#authMessage').textContent(), backend: await page.evaluate(() => window.TronoNetwork.BACKEND_HTTP)}); throw error; }
      try { await expect.poll(() => page.evaluate(() => window.TronoAuth.user?.nickname)).toBe(nickname); }
      catch (error) { console.error('Auth fixture:', {nickname, authResponses, message: await page.locator('#authMessage').textContent()}); throw error; }
      await expect(page.locator('#desktopRail')).toBeVisible();
      await expect(page.locator('body')).toHaveAttribute('data-app-layout', layout);
      await page.evaluate(() => window.TronoChatHub.enter({channelId: 'chat-jogos'}));
      await expect.poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom)).toBe('chat-jogos');
      assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
      await page.locator('#joinVoiceBtn').click();
      try {
        await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined), {timeout: 15000}).toBe(true);
      } catch (error) {
        console.error('Voice fixture:', nickname, await page.evaluate(() => ({user: window.TronoAuth.user?.nickname, connected: window.TronoNetwork.connected, room: window.TronoNetwork?.currentRoom, voiceRoom: window.TronoSocial.voiceRoom, status: document.getElementById('voiceStatus').textContent, errors: document.getElementById('chatOnlyStatus').textContent})));
        throw error;
      }
      return {app, page};
    }

    const {app, page} = await launch('layout-main@example.test', 'Layout Principal');
    await launch('layout-peer@example.test', 'Layout Amigo', 'discord');
    await expect.poll(() => page.evaluate(() => window.__layoutPeers.some(peer => peer.connectionState === 'connected')), {timeout: 20000}).toBe(true);
    await page.locator('#cameraBtn').click();
    await expect(page.locator('#cameraBtn')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
    await page.evaluate(() => window.TronoSocial.startScreenShare());
    await expect.poll(() => page.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
    await page.evaluate(() => window.TronoNetwork.joinRoom('sala-cetro'));
    await expect.poll(() => page.evaluate(() => window.TronoNetwork.gameRoom)).toBe('sala-cetro');
    await page.evaluate(() => window.TronoAppLayout.navigate('community'));
    await expect(page.locator('#callFocusDock #joinVoiceBtn')).toBeVisible();

    await page.evaluate(ids => {
      window.__layoutBaseline = {
        controls: ids.map(id => document.getElementById(id)),
        mic: window.TronoSocial.getLocalAudioTrack(),
        camera: window.TronoSocial.getMediaSources().find(source => source.self).camera.getVideoTracks()[0],
        screen: window.TronoSocial.getLocalDisplayStream().getVideoTracks()[0],
        peers: [...window.__layoutPeers],
        clientId: window.TronoNetwork.clientId,
        gameRoom: window.TronoNetwork.gameRoom,
        voiceRoom: window.TronoNetwork.primaryRoom
      };
    }, controls);
    async function preserved() {
      const result = await page.evaluate(() => {
        const before = window.__layoutBaseline, call = window.TronoSocial;
        return {
          controls: before.controls.every(node => node.isConnected && document.getElementById(node.id) === node && document.querySelectorAll('#' + node.id).length === 1),
          mic: call.getLocalAudioTrack() === before.mic && before.mic.readyState === 'live',
          camera: call.getMediaSources().find(source => source.self)?.camera?.getVideoTracks()[0] === before.camera && before.camera.readyState === 'live',
          screen: call.getLocalDisplayStream()?.getVideoTracks()[0] === before.screen && before.screen.readyState === 'live',
          peers: window.__layoutPeers.length === before.peers.length && before.peers.every((peer, i) => peer === window.__layoutPeers[i] && peer.connectionState === 'connected'),
          socket: window.TronoNetwork.connected && window.TronoNetwork.clientId === before.clientId,
          game: window.TronoNetwork.gameRoom === before.gameRoom,
          voice: call.voiceJoined && window.TronoNetwork.primaryRoom === before.voiceRoom
        };
      });
      assert.deepEqual(result, Object.fromEntries(Object.keys(result).map(key => [key, true])));
    }
    const artifacts = path.join(root, 'artifacts/call-layout');
    await fs.mkdir(artifacts, {recursive: true});
    const capture = process.env.LAYOUT_CAPTURE_PREFIX || 'after';
    for (const layout of ['original', 'discord', 'original', 'discord']) {
      await page.evaluate(layout => window.TronoAppLayout.apply(layout, {save: true}), layout);
      for (const id of controls) await expect(page.locator('#callFocusDock #' + id)).toHaveCount(1);
      await preserved();
      await page.screenshot({path: path.join(artifacts, `${capture}-community-${layout}.png`)});

      await page.evaluate(() => window.TronoAppLayout.navigate('home'));
      await expect(page.locator('#portalScreen')).toBeVisible();
      await expect(page.locator('#desktopTopBar #communityToggle')).toHaveCount(1);
      await expect(page.locator('#desktopRail #soundboardToggle')).toHaveCount(1);
      if (layout === 'original') {
        for (const id of controls.filter(id => id !== 'soundboardToggle')) await expect(page.locator('#desktopCallDock #' + id)).toHaveCount(1);
      } else {
        for (const id of ['muteMicBtn', 'deafenVoiceBtn', 'voiceSettingsBtn']) await expect(page.locator('#layoutUserControls #' + id)).toHaveCount(1);
        for (const id of ['cameraBtn', 'screenShareBtn']) await expect(page.locator('#layoutCallActions #' + id)).toHaveCount(1);
        await expect(page.locator('#layoutConnectionControls #joinVoiceBtn')).toHaveCount(1);
      }
      await preserved();
      await page.evaluate(() => window.TronoAppLayout.navigate('throne'));
      await expect(page.locator('#setupScreen')).toBeVisible();
      await preserved();
      await page.evaluate(() => window.TronoAppLayout.navigate('community'));
      await expect(page.locator('#callFocusDock #muteMicBtn')).toBeVisible();
      await preserved();
    }

    for (const [width, height] of [[1280, 720], [480, 800], [480, 520]]) {
      await app.evaluate(({BrowserWindow}, {width, height}) => BrowserWindow.getAllWindows()[0].setContentSize(width, height), {width, height});
      for (const layout of ['original', 'discord']) {
        await page.evaluate(value => window.TronoAppLayout.apply(value), layout);
        for (const id of controls) {
          await expect(page.locator('#' + id)).toBeVisible();
          await expect(page.locator('#' + id)).toBeInViewport();
        }
        await preserved();
        await page.screenshot({path: path.join(artifacts, `${capture}-${layout}-${width}x${height}.png`)});
      }
    }
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720));

    // Move to a real text-only channel without leaving the call or the game.
    const creator = await fixture.call('signup', {email: 'jonathapereira.jj@gmail.com', nickname: 'Layout Criador', password: 'LayoutTest12!'});
    assert.equal(creator.status, 200);
    await fixture.call('verify', {token_hash: [...fixture.links.keys()].at(-1), type: 'signup'});
    const owner = (await fixture.call('login', {email: 'jonathapereira.jj@gmail.com', password: 'LayoutTest12!'})).data;
    const created = await fetch(fixture.base + '/community/channels', {method: 'POST', headers: {
      Origin: fixture.appOrigin, Authorization: 'Bearer ' + owner.session.access_token, 'Content-Type': 'application/json'
    }, body: JSON.stringify({name: 'Layout texto', type: 'text', description: ''})});
    assert.equal(created.status, 200);
    const {channel} = await created.json();
    await expect(page.locator('[data-chat-channel="' + channel.id + '"]')).toBeVisible();
    await page.locator('[data-chat-channel="' + channel.id + '"]').click();
    await expect(page.locator('[data-chat-channel="' + channel.id + '"]')).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom)).toBe(channel.id);
    await page.locator('#courtChatInput').fill('Compositor React com voz e jogo ativos');
    await page.locator('#courtChatSend').click();
    await expect(page.locator('#courtChatMessages')).toContainText('Compositor React com voz e jogo ativos');
    await expect(page.locator('#courtChatInput')).toHaveValue('');
    await preserved();
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.locator('#chatFileInput').setInputFiles({name: 'desktop.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 desktop fixture')});
    await page.locator('#courtChatInput').fill('Anexo React no Electron');
    await page.locator('#courtChatSend').click();
    await expect(page.locator('#courtChatMessages .file-download')).toContainText('desktop.pdf');
    await preserved();
    // Electron's native confirmation is already accepted by this fixture's dialog adapter.
    await page.locator('#courtChatMessages .file-delete').click();
    await expect(page.locator('#courtChatMessages .chat-attachment')).toContainText('Arquivo excluído.');
    await preserved();
    await page.locator('[data-chat-channel="chat-jogos"]').click();
    await expect(page.locator('[data-chat-channel="chat-jogos"]')).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => page.evaluate(() => window.TronoNetwork?.currentRoom)).toBe('chat-jogos');
    await preserved();

    await page.locator('#muteMicBtn').click();
    assert.equal(await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled), false);
    await page.locator('#muteMicBtn').click();
    assert.equal(await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().enabled), true);
    await page.locator('#voiceSettingsBtn').click();
    await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
    await page.locator('#voiceSettingsClose').click();
    await preserved();

    // A permission result arriving after leave must release its device and never rejoin.
    await page.evaluate(async () => {
      window.__releasedMicrophone = window.TronoSocial.getLocalAudioTrack();
      await window.TronoSocial.leaveVoice();
      window.__normalCapture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = constraints => new Promise(resolve => {
        window.__releaseDelayedCapture = async () => {
          const stream = await window.__normalCapture(constraints);
          window.__delayedCaptureTracks = stream.getTracks();
          resolve(stream);
        };
      });
      window.__cancelledJoin = window.TronoSocial.joinVoice();
    });
    await page.waitForFunction(() => !!window.__releaseDelayedCapture);
    await page.evaluate(async () => {
      await window.TronoSocial.leaveVoice();
      navigator.mediaDevices.getUserMedia = window.__normalCapture;
      await window.__releaseDelayedCapture();
    });
    assert.equal(await page.evaluate(() => window.__cancelledJoin), false);
    assert(await page.evaluate(() => window.__releasedMicrophone.readyState === 'ended' && window.__delayedCaptureTracks.every(track => track.readyState === 'ended')));
    assert.equal(await page.evaluate(() => window.TronoSocial.voiceJoined), false);
    assert.equal(await page.evaluate(() => window.TronoSocial.getLocalAudioTrack()), null);
    assert.equal(await page.evaluate(() => window.TronoSocial.joinVoice()), true);
    assert.equal(await page.evaluate(() => window.TronoSocial.getLocalAudioTrack().readyState), 'live');
    assert.deepEqual(errors, []);
  } finally {
    finished = true;
    for (const app of apps.reverse()) await closeTestApp(app);
    if (fixture) await fixture.stop();
    await fs.rm(directory, {recursive: true, force: true});
  }
});
