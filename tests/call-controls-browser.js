'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');
const {chromium, expect} = require('@playwright/test');
const {startFixture} = require('./auth-fixture');
const {installCanvasCamera} = require('./camera-fixture');

test('stream invitations, prompt media shutdown and compact call layouts', {timeout: 120000}, async t => {
  const server = await new Promise(resolve => {
    const s = express().use(express.static(path.resolve(__dirname, '../out'))).listen(0, '127.0.0.1', () => resolve(s));
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
    for(const [account, peerId, action] of [[accounts[0], accounts[1].user.id, 'request'], [accounts[1], accounts[0].user.id, 'accept']]) {
      const response=await fetch(fixture.base+'/social/friend',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+account.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({peerId,action})});
      assert.equal(response.status,200);
    }
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined), args: [
      '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'
    ]});
    async function client(data, native = false) {
      const context = await browser.newContext({viewport: {width: 1280, height: 720}, permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write']});
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await context.route('**/community/profiles/*', route => route.fulfill({json: {profile: {
        id: new URL(route.request().url()).pathname.split('/').at(-1),
        nickname: data.user.nickname, personalization: {cover_file_id: '20000000-0000-4000-8000-000000000001', background_file_id: '20000000-0000-4000-8000-000000000002', accent: '#bd6fe8', cover_position: 25}
      }}}));
      await context.route('**/files/20000000-0000-4000-8000-000000000001/url', route => route.fulfill({json: {expiresAt: Date.now() + 60000, url: origin + '/fixture-media.svg?image=' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#723da8"/><circle cx="260" cy="30" r="100" fill="#dd8a68"/></svg>')}}));
      await context.route('**/files/20000000-0000-4000-8000-000000000002/url', route => route.fulfill({json: {expiresAt: Date.now() + 60000, url: origin + '/fixture-media.svg?image=' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#185a80"/></svg>')}}));
      await context.route('**/fixture-media.svg?*', route => route.fulfill({contentType: 'image/svg+xml', body: new URL(route.request().url()).searchParams.get('image')}));
      await context.addInitScript(({base, data, native}) => {
        window.TRONO_BACKEND_URL = base;
        sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('tronoSfxEnabled', '0');
        localStorage.setItem('tronoNoiseSuppression', '0');
        window.__displayRequests = [];
        const NativeRecorder = window.MediaRecorder;
        window.MediaRecorder = class extends NativeRecorder {
          constructor(stream, options) {super(stream, options); window.__replaySource = stream;}
        };
        navigator.mediaDevices.getDisplayMedia = async options => {
          window.__displayRequests.push(options);
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
          constructor(config) {super({...config,iceServers:[],iceCandidatePoolSize:0}); window.__peers.push(this);}
        };
        const replace = RTCRtpSender.prototype.replaceTrack;
        window.__detachReleases = [];
        window.__attachReleases = [];
        window.__constraintReleases = [];
        const constraints=MediaStreamTrack.prototype.applyConstraints;
        MediaStreamTrack.prototype.applyConstraints=function(value){
          if(this.kind==='video'&&window.__holdScreenQuality)return new Promise((resolve,reject)=>window.__constraintReleases.push(()=>constraints.call(this,value).then(resolve,reject)));
          return constraints.call(this,value);
        };
        RTCRtpSender.prototype.replaceTrack = function(track) {
          if (track?.kind === 'video' && window.__holdAttach) return new Promise((resolve,reject)=>window.__attachReleases.push(()=>replace.call(this,track).then(resolve,reject)));
          if (track === null && window.__holdDetach) {
            return new Promise((resolve, reject) => window.__detachReleases.push(() => replace.call(this, track).then(resolve, reject)));
          }
          return replace.call(this, track);
        };
      }, {base: fixture.base, data, native});
      await context.addInitScript(installCanvasCamera);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(origin);
      await page.waitForFunction(() => window.TronoAuth?.ready);
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

    await expect.poll(() => owner.evaluate(() => window.TronoClips.active)).toBe(true);
    assert.equal(await owner.evaluate(() => window.__displayRequests.length), 1, 'Replay reuses the shared picker');
    assert.equal(await owner.evaluate(() => window.__displayRequests[0].video.frameRate.ideal), 60);
    await t.test('React mosaic selects six people and detaches borrowed previews', async () => {
      await owner.evaluate(() => {
        window.__originalMosaicSources = window.TronoSocial.getMediaSources;
        const stream = window.TronoSocial.getLocalDisplayStream();
        window.__mosaicStream = stream;
        window.TronoSocial.getMediaSources = () => Array.from({length:7}, (_, i) => ({
          id:'demo-'+i, name:['Ana','Bruno','Clara','Diego','Eva','Felipe','Gabi'][i],
          camera: stream, screen: i===0 ? stream : null, self:i===0, cameraOffered:true, screenOffered:i===0, watching:true, cameraHidden:false
        }));
      });
      await owner.locator('#expandMosaicBtn').click();
      await expect(owner.locator('#mediaFocusGrid .focus-person')).toHaveCount(6);
      await expect(owner.getByRole('checkbox', {name:'Incluir Gabi no mosaico'})).toBeDisabled();
      await owner.getByRole('checkbox', {name:'Incluir Ana no mosaico'}).uncheck();
      await owner.getByRole('checkbox', {name:'Incluir Gabi no mosaico'}).check();
      await expect(owner.locator('#mediaFocusCount')).toHaveText('6 de 6 pessoas');
      await owner.evaluate(() => {window.__mosaicNodes = [...document.querySelectorAll('#mediaFocusGrid video')];});
      await owner.locator('#mediaFocusClose').click();
      await expect(owner.locator('#mediaFocusGrid video')).toHaveCount(0);
      assert.equal(await owner.evaluate(() => window.__mosaicNodes.every(video => !video.srcObject) && window.__mosaicStream.getTracks().every(track => track.readyState === 'live')), true);
      assert.equal(await owner.evaluate(() => window.TronoClips.active && window.__replaySource.getTracks().every(track => track.readyState === 'live') && window.TronoSocial.getLocalAudioTrack().readyState === 'live' && window.__displayRequests.length === 1), true);
      await owner.evaluate(() => {window.TronoSocial.getMediaSources = window.__originalMosaicSources;});
    });
    await t.test('web settings keep one pane and preserve live media while selecting and reopening', async () => {
      await owner.evaluate(()=>{window.__settingsMedia={mic:window.TronoSocial.getLocalAudioTrack(),screen:window.TronoSocial.getLocalDisplayStream(),input:document.getElementById('voiceInputSelect')};window.TronoSocial.toggleTextChat(false);window.TronoSocial.toggleTelemetry(false);});
      await owner.locator('#voiceSettingsBtn').click();
      await expect(owner.locator('#voiceSettingsPanel')).toBeVisible();
      await expect(owner.locator('[data-settings-tab]')).toHaveCount(4);
      await owner.locator('[data-settings-tab="video"]').click();
      await expect(owner.locator('[data-settings-panel="video"]')).toBeVisible();
      await owner.locator('#screenFormatSelect').selectOption('1080-60');
      await owner.locator('#screenBitrateSelect').selectOption('10');
      await owner.locator('#screenContentSelect').selectOption('motion');
      await owner.locator('#shareStreamAudio').uncheck();
      await expect.poll(()=>owner.evaluate(()=>window.TronoSocial.screenSettings.audio)).toBe(false);
      await owner.locator('#shareStreamAudio').check();
      assert.deepEqual(await owner.evaluate(()=>({fps:window.TronoSocial.screenSettings.fps,bitrate:window.TronoSocial.screenSettings.bitrate})),{fps:60,bitrate:10000000});
      await owner.locator('[data-settings-tab="audio"]').click();
      await owner.locator('#outputGainSlider').fill('150');
      await expect(owner.locator('#outputGainValue')).toHaveText('150%');
      await owner.locator('#outputGainSlider').fill('100');
      await owner.locator('#voiceSfxBtn').click();
      await expect(owner.locator('#voiceSfxBtn')).toHaveAttribute('aria-pressed','true');
      assert.equal(await owner.evaluate(()=>window.TronoAudio.sfxEnabled),true);
      await owner.locator('#voiceSfxBtn').click();
      await expect(owner.locator('#voiceSfxBtn')).toHaveAttribute('aria-pressed','false');
      // Use a deterministic media failure to check status propagation, not playback quality.
      await owner.evaluate(()=>{
        const player=document.getElementById('bgMusic');
        window.__restoreMusicPlay=player.play;
        player.play=()=>Promise.reject(new DOMException('test activation required','NotAllowedError'));
      });
      await owner.locator('#voiceMusicBtn').click();
      await expect(owner.locator('#voiceMusicBtn')).toHaveAttribute('aria-pressed','true');
      await expect(owner.locator('#voiceMusicStatus')).toContainText('O navegador bloqueou');
      await owner.locator('#voiceMusicTrackSelect').selectOption('rock');
      await expect.poll(()=>owner.evaluate(()=>window.TronoAudio.currentTrack)).toBe('rock');
      await owner.locator('#voiceMusicVolume').fill('47');
      await expect(owner.locator('#voiceMusicVolumeValue')).toHaveText('47%');
      assert.equal(await owner.evaluate(()=>document.getElementById('bgMusic').volume),.47);
      // Other screens still use the same owner; their changes must reach React.
      await owner.evaluate(()=>window.TronoAudio.setMusicVolume(19));
      await expect(owner.locator('#voiceMusicVolume')).toHaveValue('19');
      await expect(owner.locator('#voiceMusicVolumeValue')).toHaveText('19%');
      await owner.evaluate(()=>window.TronoAudio.setMusicTrack('lofi',{play:false}));
      await expect(owner.locator('#voiceMusicTrackSelect')).toHaveValue('lofi');
      await owner.locator('#voiceMusicBtn').click();
      await expect(owner.locator('#voiceMusicStatus')).toHaveText('Música silenciada.');
      await owner.evaluate(()=>{document.getElementById('bgMusic').play=window.__restoreMusicPlay;});
      await owner.locator('#callAlertVolume').fill('40');
      await expect(owner.locator('#callAlertVolumeValue')).toHaveText('40%');
      assert.equal(await owner.evaluate(()=>localStorage.getItem('mnCallAlertVolume')),'40');
      await owner.locator('#testCallAlert').click();
      await owner.locator('#voiceProtection').uncheck();
      await expect(owner.locator('#voiceProtectionStatus')).toContainText('WebRTC gerencia');
      assert.equal(await owner.evaluate(()=>localStorage.getItem('mnVoiceProtection')),'0');
      await owner.locator('#voiceProtection').check();
      await expect(owner.locator('#voiceProtectionStatus')).toContainText('Ativa');
      assert.equal(await owner.evaluate(()=>localStorage.getItem('mnVoiceProtection')),'1');

      await owner.locator('[data-settings-tab="connection"]').click();
      await expect(owner.locator('#realtimeInfraCard')).toBeVisible();
      await owner.locator('#adaptiveQuality').uncheck();
      assert.equal(await owner.evaluate(()=>localStorage.getItem('mnAdaptiveQuality')),'0');
      await owner.locator('#adaptiveQuality').check();
      assert.equal(await owner.evaluate(()=>localStorage.getItem('mnAdaptiveQuality')),'1');
      await owner.bringToFront();
      await owner.locator('#telemetryOpenBtn').click();
      await expect(owner.locator('#telemetryPanel')).toBeVisible();
      await expect(owner.locator('#telemetryOpenBtn')).toHaveAttribute('aria-expanded','true');
      await expect(owner.locator('#telemetryStatusPill')).toHaveAttribute('aria-expanded','true');
      await owner.locator('#copyDiagnostics').click();
      await expect(owner.locator('#copyDiagnosticsStatus')).toContainText('Copiado');
      const copied=await owner.evaluate(()=>navigator.clipboard.readText());
      assert.equal(JSON.parse(copied).app,'M&N');
      assert(!copied.includes(accounts[0].session.access_token));
      assert(!copied.includes(accounts[0].user.email));
      assert(!copied.includes('Ana'));
      await owner.keyboard.press('Escape');
      await expect(owner.locator('#telemetryPanel')).toBeHidden();
      await expect(owner.locator('#telemetryStatusPill')).toHaveAttribute('aria-expanded','false');
      await expect(owner.locator('#voiceSettingsPanel')).toBeVisible();
      await owner.locator('[data-settings-tab="video"]').click();
      await owner.locator('#voiceSettingsClose').click();
      await owner.locator('#voiceSettingsBtn').click();
      await expect(owner.locator('[data-settings-tab="video"]')).toHaveAttribute('aria-selected','true');
      await owner.locator('[data-settings-tab="video"]').focus();await owner.keyboard.press('End');
      await expect(owner.locator('[data-settings-panel="notifications"]')).toBeVisible();
      await owner.keyboard.press('Escape');
      await expect(owner.locator('#voiceSettingsPanel')).toBeHidden();
      await expect(owner.locator('#voiceSettingsBtn')).toHaveAttribute('aria-expanded','false');
      assert.equal(await owner.evaluate(()=>window.__settingsMedia.mic===window.TronoSocial.getLocalAudioTrack()&&window.__settingsMedia.screen===window.TronoSocial.getLocalDisplayStream()&&window.__settingsMedia.input===document.getElementById('voiceInputSelect')&&window.__settingsMedia.mic.readyState==='live'),true);
    });

    await t.test('room rows keep text closed and the small chat button opens text without moving voice',async()=>{
      for(const layout of ['original','discord']){
        await viewer.evaluate(layout=>window.TronoAppLayout.apply(layout),layout);
        const identity=await viewer.evaluate(()=>({mic:window.TronoSocial.getLocalAudioTrack().id,room:window.TronoNetwork.primaryRoom}));
        await viewer.locator('[data-chat-channel="chat-livre"]').click();
        await expect(viewer.locator('#callWorkspace')).toHaveAttribute('data-messages','none');
        await viewer.locator('[data-channel-text="chat-livre"]').click();
        await expect(viewer.locator('#callWorkspace')).toHaveAttribute('data-messages','channel');
        await viewer.locator('[data-chat-channel="chat-livre"]').click();
        await expect(viewer.locator('#callWorkspace')).toHaveAttribute('data-messages','none');
        await viewer.locator('[data-channel-text="chat-jogos"]').click();
        await expect.poll(()=>viewer.evaluate(()=>window.TronoNetwork.currentRoom)).toBe('chat-jogos');
        await expect(viewer.locator('#courtChatInput')).toBeVisible();
        assert.deepEqual(await viewer.evaluate(()=>({mic:window.TronoSocial.getLocalAudioTrack().id,room:window.TronoNetwork.primaryRoom})),identity);
        await viewer.locator('[data-chat-channel="chat-livre"]').click();
        await expect.poll(()=>viewer.evaluate(()=>window.TronoNetwork.currentRoom)).toBe('chat-livre');
        await expect(viewer.locator('#callWorkspace')).toHaveAttribute('data-messages','none');
      }
    });

    await t.test('React text controls share unread/mute state and cancel delayed focus on close', async () => {
      await viewer.setViewportSize({width:1280,height:720});
      await viewer.evaluate(()=>window.TronoSocial.toggleTextChat(false));
      await owner.evaluate(()=>window.TronoNetwork.sendChat('Navigation unread regression'));
      await expect(viewer.locator('#chatOnlyUnread')).toHaveText('1');
      await expect(viewer.locator('#chatOnlyUnread')).toBeVisible();
      await viewer.locator('#chatOnlyTextBtn').click();
      await expect(viewer.locator('#chatOnlyTextBtn')).toHaveAttribute('aria-expanded','true');
      await expect(viewer.locator('#chatOnlyUnread')).toBeHidden();
      await viewer.locator('#chatDrawerCloseBtn').click();
      await viewer.waitForTimeout(110);
      assert.equal(await viewer.evaluate(()=>document.activeElement?.id==='courtChatInput'),false);
      await viewer.locator('#chatOnlyTextBtn').click();
      await viewer.locator('#muteTextBtn').click();
      await expect(viewer.locator('#muteTextBtn')).toHaveText('Ativar chat');
      await viewer.locator('#chatDrawerCloseBtn').click();
      await owner.waitForTimeout(500); // Respect the backend's 450 ms chat rate limit.
      await owner.evaluate(()=>window.TronoNetwork.sendChat('Navigation muted regression'));
      await expect(viewer.locator('#courtChatMessages')).toContainText('Navigation muted regression');
      await expect(viewer.locator('#chatOnlyUnread')).toBeHidden();
      await viewer.locator('#chatOnlyTextBtn').click();await viewer.locator('#muteTextBtn').click();
      await expect(viewer.locator('#muteTextBtn')).toHaveText('Silenciar chat');
      await viewer.locator('#chatDrawerCloseBtn').click();
    });
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

    await t.test('remote camera and stream state appears while sender setup is still pending', async () => {
      await owner.locator('#screenShareBtn').click();
      await expect(viewer.locator('.screen-share-tile')).toHaveCount(0);
      await owner.evaluate(()=>window.__holdAttach=true);
      await owner.locator('#cameraBtn').click();
      await expect(viewer.locator('.voice-person.camera-in-profile')).toHaveCount(1,{timeout:1500});
      await expect(owner.locator('#cameraBtn')).toBeEnabled();
      assert(await owner.evaluate(()=>window.__attachReleases.length>0));
      await owner.evaluate(()=>{window.__holdAttach=false;for(const release of window.__attachReleases.splice(0))release();});
      await expect.poll(()=>owner.locator('#cameraInputSelect').isEnabled()).toBe(true);
      await owner.locator('#cameraBtn').click();
      await owner.evaluate(()=>window.__holdScreenQuality=true);
      await owner.locator('#screenShareBtn').click();await owner.locator('#screenOptionsConfirm').click();
      await expect(viewer.locator('.screen-share-tile.stream-invitation')).toBeVisible({timeout:1500});
      assert(await owner.evaluate(()=>window.__constraintReleases.length>0));
      await owner.evaluate(()=>{window.__holdScreenQuality=false;for(const release of window.__constraintReleases.splice(0))release();});
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

    await t.test('late camera attach and detach cannot overwrite a newer live capture', async () => {
      await owner.evaluate(() => { window.__holdAttach = true; });
      await owner.locator('#cameraBtn').click();
      await expect.poll(() => owner.evaluate(() => window.__attachReleases.length)).toBeGreaterThan(0);
      await owner.locator('#cameraBtn').click();
      await owner.evaluate(() => { window.__holdAttach = false; });
      await owner.locator('#cameraBtn').click();
      await expect(owner.locator('#cameraInputSelect')).toBeEnabled();
      await owner.evaluate(async () => { await Promise.all(window.__attachReleases.splice(0).map(release => release())); });
      const correctlyPublished = () => owner.evaluate(() => {
        const track = document.querySelector('.camera-tile video')?.srcObject?.getVideoTracks()[0];
        const senders = window.__peers.filter(pc => pc.connectionState === 'connected' && pc._tronoVideoSender).map(pc => pc._tronoVideoSender);
        return track?.readyState === 'live' && senders.length > 0 && senders.every(sender => sender.track === track);
      });
      await expect.poll(correctlyPublished).toBe(true);
      await owner.evaluate(() => { window.__holdDetach = true; });
      await owner.locator('#cameraBtn').click();
      await expect.poll(() => owner.evaluate(() => window.__detachReleases.length)).toBeGreaterThan(0);
      await owner.evaluate(() => { window.__holdDetach = false; });
      await owner.locator('#cameraBtn').click();
      await expect(owner.locator('#cameraInputSelect')).toBeEnabled();
      await owner.evaluate(async () => { await Promise.all(window.__detachReleases.splice(0).map(release => release())); });
      await expect.poll(correctlyPublished).toBe(true);
      await owner.locator('#cameraBtn').click();
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
      await viewer.waitForFunction(() => window.TronoAuth?.ready);
      await viewer.evaluate(() => window.TronoAuth.ready);
      await viewer.evaluate(() => window.TronoAppLayout.navigate('community'));
      await expect(viewer.locator('.chat-only-topbar')).toBeHidden();
      await viewer.locator('#workspaceHeaderToggle').click();
    });

    await t.test('call cards keep their background and direct-message names use their cover', async () => {
      await owner.setViewportSize({width: 1440, height: 900});
      await owner.evaluate(() => {window.TronoAppLayout.apply('original'); window.TronoMessenger.openFriends();});
      await expect(owner.locator('.participant-background img').first()).toBeVisible();
      assert(await owner.locator('.participant-background img').first().evaluate(img => img.naturalWidth > 0));
      assert(await owner.locator('.participant-background img').first().evaluate(img=>decodeURIComponent(img.src).includes('#185a80')));
      const direct=owner.locator('.workspace-direct-person').filter({hasText:'Bruno'});
      await expect(direct.locator('.direct-profile-banner img')).toBeVisible();
      assert(await direct.locator('.direct-profile-banner img').evaluate(img=>decodeURIComponent(img.src).includes('#723da8')));
      await direct.click();await expect(owner.locator('#messengerInput')).toBeEnabled();
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

    await t.test('live profile changes remove and restore both decorations through one shared read without replacing players', async () => {
      const id = accounts[1].user.id;
      const room = await owner.evaluate(() => window.TronoNetwork.primaryRoom);
      await viewer.evaluate(room => window.TronoChatHub.enter({channelId: room}), room);
      if (!await viewer.evaluate(() => window.TronoSocial.voiceJoined)) await viewer.locator('#joinVoiceBtn').click();
      await expect(owner.locator('#voiceRoster .voice-person[data-account-id="' + id + '"]')).toBeVisible();
      if (!await owner.evaluate(() => window.TronoSocial.screenSharing)) {
        await owner.locator('#screenShareBtn').click();
        await owner.locator('#screenOptionsConfirm').click();
        await expect.poll(() => owner.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      }
      let personalization = {}, reads = 0;
      await owner.route('**/community/profiles/' + id, route => {
        reads++;
        return route.fulfill({json: {profile: {id, nickname: 'Bruno', personalization}}});
      });
      await owner.evaluate(() => {
        window.__decorationPlayers = [...document.querySelectorAll('#cameraGrid video,#screenShareGrid video,#voiceRoster video')].map(video => ({video, stream: video.srcObject}));
        window.__decorationScreen = window.TronoSocial.getLocalDisplayStream();
      });
      const card = owner.locator('#voiceRoster .voice-person[data-account-id="' + id + '"]');
      const direct = owner.locator('.workspace-direct-person[data-direct-profile="' + id + '"]');
      async function announce() {
        const response = await fixture.call('profile', {nickname: 'Bruno', avatar_preset: 'crown', avatar_file_id: null, personalization: {}}, accounts[1].session.access_token);
        assert.equal(response.status, 200);
      }
      await announce();
      await expect(card.locator('.participant-background img')).toHaveCount(0);
      await expect(direct.locator('.direct-profile-banner img')).toHaveCount(0);
      await expect.poll(() => reads).toBe(1);
      personalization = {background_file_id:'20000000-0000-4000-8000-000000000002', cover_file_id:'20000000-0000-4000-8000-000000000001', darkness:35, blur:4, cover_position:80};
      await announce();
      await expect(card.locator('.participant-background img')).toBeVisible();
      await expect(direct.locator('.direct-profile-banner img')).toBeVisible();
      await expect.poll(() => reads).toBe(2);
      assert.equal(await card.locator('.participant-background').evaluate(element => element.style.getPropertyValue('--participant-darkness')), '0.35');
      assert.equal(await card.locator('.participant-background').evaluate(element => element.style.getPropertyValue('--participant-blur')), '4px');
      assert.equal(await direct.locator('.direct-profile-banner img').evaluate(image => image.style.objectPosition), 'center 80%');
      assert.equal(await owner.evaluate(() => window.__decorationPlayers.length > 0 && window.__decorationPlayers.every(({video, stream}) => video.isConnected && video.srcObject === stream) && window.TronoSocial.getLocalDisplayStream() === window.__decorationScreen && window.__decorationScreen.getTracks().every(track => track.readyState === 'live')), true);
    });

    await t.test('desktop update icon survives updater state changes and stays at the bottom left', async () => {
      const desktop = await client(accounts[2], true);
      await desktop.evaluate(() => window.TronoAppLayout.apply('discord'));
      for(const view of ['game','community','game','community']){
        await desktop.evaluate(view=>window.TronoAppLayout.navigate(view),view);
        for(const [host,id]of [['layoutConnectionControls','joinVoiceBtn'],['layoutCallActions','cameraBtn'],['layoutCallActions','screenShareBtn'],['layoutUserControls','muteMicBtn'],['layoutUserControls','deafenVoiceBtn'],['layoutUserControls','voiceSettingsBtn']]){
          await expect(desktop.locator('#'+host+' #'+id)).toBeVisible();
          assert.equal(await desktop.locator('#'+id).count(),1);
        }
        await desktop.locator('#muteMicBtn').click();await expect(desktop.locator('#muteMicBtn')).toHaveAttribute('aria-pressed','true');
        await desktop.locator('#muteMicBtn').click();await expect(desktop.locator('#muteMicBtn')).toHaveAttribute('aria-pressed','false');
        assert.equal(await desktop.locator('#muteMicBtn .workspace-control-icon').count(),view==='community'?1:0);
      }
      for(const mode of ['original','discord']){
        await desktop.evaluate(mode=>window.TronoAppLayout.apply(mode),mode);
        await desktop.evaluate(()=>window.TronoAppLayout.navigate('game'));
        await expect(desktop.locator('#cameraBtn .workspace-control-icon')).toHaveCount(0);
        await expect(desktop.locator('#cameraBtn .call-icon')).toBeVisible();
        if(mode==='original'){
          const toolbar=await desktop.locator('#desktopCallDock .call-toolbar').boundingBox(),dock=await desktop.locator('#desktopCallDock').boundingBox();
          assert(Math.abs(toolbar.x+toolbar.width/2-dock.x-dock.width/2)<2,'Original games controls must stay centered');
          await desktop.screenshot({path:path.resolve(__dirname,'../artifacts/call-controls/original-games.png')});
        }
        await desktop.evaluate(()=>window.TronoAppLayout.navigate('community'));
        await expect(desktop.locator('#cameraBtn .workspace-control-icon')).toHaveCount(1);
        await expect(desktop.locator('#cameraBtn .call-icon')).toBeHidden();
        await desktop.evaluate(()=>{window.TronoMessenger.close();window.TronoSocial.toggleTextChat(false);});
        for(const id of ['joinVoiceBtn','cameraBtn','screenShareBtn','muteMicBtn','deafenVoiceBtn','voiceSettingsBtn']){
          assert(await desktop.locator('#'+id).evaluate(button=>{
            const r=button.getBoundingClientRect();
            return [.2,.5,.8].every(x=>document.elementFromPoint(r.x+r.width*x,r.y+r.height/2)?.closest('button')===button);
          }),mode+' '+id+' must receive its own clicks');
        }
        if(mode==='original'){
          const dock=await desktop.locator('#callFocusDock').boundingBox(),stage=await desktop.locator('.voice-section').boundingBox();
          assert(Math.abs(dock.x+dock.width/2-stage.x-stage.width/2)<2);
          assert(Math.abs(dock.y+dock.height-stage.y-stage.height)<2);
        }
        await desktop.locator('#layoutVoiceLocation').click();
        await expect(desktop.locator('#callWorkspace')).toHaveAttribute('data-messages','none');
        await desktop.locator('#cameraBtn').click();
        await expect.poll(()=>desktop.evaluate(()=>window.TronoSocial.cameraOn)).toBe(true);
        await desktop.locator('#cameraBtn').click();
        await expect.poll(()=>desktop.evaluate(()=>window.TronoSocial.cameraOn)).toBe(false);
        await desktop.locator('#screenShareBtn').click();
        await expect(desktop.locator('#screenOptionsDialog')).toBeVisible();
        await desktop.locator('#screenOptionsCancel').click();
        await expect(desktop.locator('#callWorkspace')).toHaveAttribute('data-messages','none');
      }
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
