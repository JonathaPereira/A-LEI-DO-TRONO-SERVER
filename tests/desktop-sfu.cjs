'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'real Electron negotiates SFU publication/subscription through a local WebRTC relay and keeps captures through reset',
  {
    timeout: 90000,
    skip: process.platform !== 'win32' && 'Windows desktop regression',
  },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-sfu-session-'));
    const origin = 'https://a-lei-do-trono.surge.sh';
    let app,
      fixture,
      finished = false;
    t.signal.addEventListener(
      'abort',
      () => {
        if (!finished) killTestApp(app);
      },
      { once: true },
    );
    try {
      fixture = await startFixture({ port: 11986, allowedOrigins: [origin] });
      app = await _electron.launch({
        executablePath: require('../electron/node_modules/electron'),
        args: [
          path.resolve('electron'),
          '--user-data-dir=' + directory,
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
        timeout: 30000,
      });
      const page = await app.firstWindow();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (message) => {
        if (message.text().startsWith('SFU fixture:')) console.log(message.text());
      });
      await page.route('https://a-lei-do-trono-server.onrender.com/**', (route) => route.abort());
      await page.addInitScript((base) => {
        window.TRONO_BACKEND_URL = base;
        localStorage.setItem('tronoMusicEnabled', '0');
        localStorage.setItem('tronoSfxEnabled', '0');
      }, fixture.base);
      await page.waitForURL(origin + '/');
      await page.waitForLoadState('domcontentloaded');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.TronoVoiceCapture?.createSfuSession);
      await page.mouse.click(600, 400);
      await page.evaluate(async () => {
        console.log('SFU fixture: initializing media');
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const draw = canvas.getContext('2d');
        let frame = 0;
        const timer = setInterval(() => {
          draw.fillStyle = frame++ % 2 ? '#385081' : '#aa8040';
          draw.fillRect(0, 0, 640, 360);
        }, 1000 / 60);
        const source = canvas.captureStream(60),
          ctx = new AudioContext({ sampleRate: 48000 }),
          tone = ctx.createOscillator(),
          gain = ctx.createGain(),
          destination = ctx.createMediaStreamDestination();
        gain.gain.value = 0.15;
        tone.connect(gain).connect(destination);
        tone.start();
        await ctx.resume();
        console.log('SFU fixture: audio running');
        const audio = destination.stream.getAudioTracks()[0],
          video = source.getVideoTracks()[0];
        const settings = {
          enabled: true,
          screenAllowed: true,
          quality: 'balanced',
          screenBitrate: 8000000,
          videoBitrate: 2200000,
          camera: { width: 1280, height: 720, fps: 30 },
          screen: { width: 1920, height: 1080, fps: 60 },
          ice: { iceServers: [] },
        };
        const relay = new Map(),
          sources = new Map(),
          peers = [],
          calls = [];
        let serial = 0;
        const create = () => {
          const pc = new RTCPeerConnection({ iceServers: [] });
          peers.push(pc);
          return pc;
        };
        async function gathered(pc) {
          if (pc.iceGatheringState === 'complete') return;
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              pc.removeEventListener('icegatheringstatechange', check);
              reject(new Error('Local relay gathering timeout'));
            }, 5000);
            function check() {
              if (pc.iceGatheringState === 'complete') {
                clearTimeout(timer);
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
              }
            }
            pc.addEventListener('icegatheringstatechange', check);
            check();
          });
        }
        async function request(action, payload) {
          console.log('SFU fixture: ' + action);
          calls.push({ action, payload });
          if (action === 'publish-track') {
            const pc = create(),
              sessionId = 'publish-' + ++serial;
            relay.set(sessionId, pc);
            pc.ontrack = (event) => sources.set(payload.kind, event.track);
            await pc.setRemoteDescription(payload.sessionDescription);
            await pc.setLocalDescription(await pc.createAnswer());
            await gathered(pc);
            return {
              sessionId,
              sessionDescription: pc.localDescription.toJSON(),
              publication: { trackName: payload.kind + '-fixture', rids: [] },
            };
          }
          if (action === 'publication-ready') return { ready: true, rids: [] };
          if (action === 'subscribe-track') {
            const pc = create(),
              sessionId = 'subscribe-' + ++serial;
            relay.set(sessionId, pc);
            const track = sources.get(payload.kind);
            if (!track) throw new Error('Published track is absent');
            const tr = pc.addTransceiver(track, { direction: 'sendonly' });
            await pc.setLocalDescription(await pc.createOffer());
            await gathered(pc);
            return {
              sessionId,
              mid: tr.mid,
              preferredRid: null,
              sessionDescription: pc.localDescription.toJSON(),
            };
          }
          if (action === 'renegotiate') {
            await relay.get(payload.sessionId).setRemoteDescription(payload.sessionDescription);
            return { accepted: true };
          }
          if (action === 'close-publication' || action === 'close-subscription') {
            relay.get(payload.sessionId)?.close();
            relay.delete(payload.sessionId);
            return { closed: true };
          }
          if (action === 'update-subscription') return { preferredRid: null };
          throw new Error('Unexpected local SFU action: ' + action);
        }
        const playbackContexts = [];
        const playback = window.TronoVoiceCapture.createAudioPlayback({
          volume: 100,
          output: '',
          createAudio() {
            const player = document.createElement('audio');
            player.id = 'sfu-fixture-audio';
            player.autoplay = true;
            document.body.append(player);
            return player;
          },
          createStream: (track) => new MediaStream([track]),
          createContext() {
            const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 0.04 });
            playbackContexts.push(ctx);
            return ctx;
          },
          onChange() {},
          onBlocked() {
            throw new Error('Unexpected blocked playback');
          },
          onOutputFallback() {
            throw new Error('Unexpected output fallback');
          },
        });
        const remote = window.TronoVoiceCapture.createRemoteMedia({
          enabled: () => settings.enabled,
          createStream: () => new MediaStream(),
          getPeer: () => undefined,
          isPeerCurrent: () => false,
          getInterest: () => ({ camera: true, screen: true }),
          isCameraHidden: () => false,
          onVoiceReceiver(id, receiver, added) {
            if (added) diagnostics.registerReceiver(id, receiver);
            else diagnostics.removeReceiver(receiver);
          },
          onAudioReady(id, kind) {
            if (kind === 'audio') void indicators.watch(id, remote.getStreams(id).av);
          },
          onChange() {},
          onRecover: async () => false,
        });
        const session = window.TronoVoiceCapture.createSfuSession({
          getSettings: () => settings,
          createConnection: () => create(),
          request,
          wants: () => true,
          watchVersion: () => 0,
          preferredRid: () => 'f',
          applyQuality: async (sender, kind) => {
            const p = sender.getParameters();
            if (!p.encodings.length) p.encodings = [{}];
            p.encodings[0].maxBitrate = kind === 'screen' ? 8000000 : 96000;
            if (kind === 'screen') p.encodings[0].maxFramerate = 60;
            await sender.setParameters(p);
          },
          onTrack: (pub, track, sub, receiver, isCurrent) =>
            remote.attachSubscription({
              id: pub.ownerId,
              kind: pub.kind,
              track,
              owner: sub,
              receiver,
              isCurrent,
            }),
          onSubscriptionClosed: (sub) => {
            remote.detachSubscription(sub);
            if (sub.kind === 'audio') {
              playback.remove(sub.publisherId);
              indicators.remove(sub.publisherId);
            }
          },
          onReady() {},
          onRetry(info) {
            throw new Error('Unexpected SFU retry: ' + info.code);
          },
          onFallback: async () => {
            throw new Error('Unexpected SFU fallback');
          },
          onChange() {},
        });
        const diagnostics = window.TronoVoiceCapture.createVoiceTelemetry({
          protection: true,
          getSettings: () => ({
            joined: settings.enabled,
            transport: 'sfu',
            detailsOpen: false,
            foreground: true,
            visible: true,
            desktop: true,
          }),
          getConnections: () => [
            ...[...session.publications].map(([kind, pub]) => ['sfu-pub:' + kind, pub.pc]),
            ...[...session.subscriptions].map(([key, sub]) => ['sfu-sub:' + key, sub.pc]),
          ],
          getLocalVideo: () => video,
          onSample: async () => {},
          onChange() {},
        });
        const indicators = window.TronoVoiceCapture.createSpeakingIndicators({
          getSettings: () => ({
            enabled: settings.enabled,
            hidden: document.hidden,
            foreground: document.hasFocus(),
            lightMode: false,
          }),
          getContext: () => ctx,
          createStream: (track) => new MediaStream([track]),
          windowEvents: window,
          documentEvents: document,
          onChange() {},
        });
        async function connect() {
          const audioPub = await session.publish('audio', audio),
            screenPub = await session.publish('screen', video);
          session.setPublications(
            [audioPub, screenPub].map((pub) => ({
              ownerId: 'relay-peer',
              kind: pub.kind,
              sessionId: pub.sessionId,
              trackName: pub.trackName,
              rids: pub.rids,
            })),
          );
          await session.syncSubscriptions();
          const streams = remote.getStreams('relay-peer');
          document.getElementById('sfu-fixture-video')?.remove();
          const player = document.createElement('video');
          player.id = 'sfu-fixture-video';
          player.muted = true;
          player.autoplay = true;
          player.srcObject = streams.screen;
          document.body.append(player);
          await player.play();
          playback.attach('relay-peer', streams.av.getAudioTracks()[0]);
        }
        window.__sfuFixture = {
          session,
          remote,
          relay,
          peers,
          calls,
          audio,
          video,
          playback,
          playbackContexts,
          diagnostics,
          indicators,
          connect,
          async close() {
            indicators.reset();
            diagnostics.stop();
            diagnostics.reset();
            session.reset();
            remote.reset();
            playback.reset();
            for (const pc of peers) pc.close();
            clearInterval(timer);
            source.getTracks().forEach((t) => t.stop());
            destination.stream.getTracks().forEach((t) => t.stop());
            tone.stop();
            await ctx.close();
          },
        };
        await connect();
      });
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                document.getElementById('sfu-fixture-video').getVideoPlaybackQuality()
                  .totalVideoFrames,
            ),
          { timeout: 15000 },
        )
        .toBeGreaterThan(5);
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const sub = window.__sfuFixture.session.subscriptions.get('relay-peer:audio');
              let energy = 0;
              for (const row of (await sub.pc.getStats()).values())
                if (row.type === 'inbound-rtp' && row.kind === 'audio')
                  energy += row.totalAudioEnergy || 0;
              return energy;
            }),
          { timeout: 15000 },
        )
        .toBeGreaterThan(0);
      const first = await page.evaluate(() => {
        const h = window.__sfuFixture;
        window.__sfuOldPeers = [...h.peers];
        window.__sfuOldTracks = [
          ...h.remote.getStreams('relay-peer').av.getTracks(),
          ...h.remote.getStreams('relay-peer').screen.getTracks(),
        ];
        const p = h.session.publications.get('screen').sender.getParameters();
        return {
          ready: [...h.session.publications.values()].every((pub) => pub.ready),
          fps: p.encodings[0].maxFramerate,
          bitrate: p.encodings[0].maxBitrate,
          captureFps: h.video.getSettings().frameRate,
        };
      });
      assert.deepEqual(first, { ready: true, fps: 60, bitrate: 8000000, captureFps: 60 });
      await expect
        .poll(() => page.evaluate(() => window.__sfuFixture.indicators.isSpeaking('relay-peer')))
        .toBe(true);
      await page.evaluate(() => window.__sfuFixture.diagnostics.collect());
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const h = window.__sfuFixture;
            await h.diagnostics.collect();
            return h.diagnostics.getSnapshot().rows[0]?.packets ?? 0;
          }),
        )
        .toBeGreaterThan(0);
      assert.equal(
        await page.evaluate(() => {
          const h = window.__sfuFixture,
            receiver = h.session.subscriptions.get('relay-peer:audio').pc.getReceivers()[0];
          const before = receiver.track;
          const initial = h.diagnostics.getSnapshot();
          h.diagnostics.configureProtection(false);
          const restored = receiver.jitterBufferTarget === null;
          h.diagnostics.configureProtection(true);
          return (
            initial.rows.length === 1 &&
            initial.rows[0].supported &&
            restored &&
            receiver.jitterBufferTarget === 60 &&
            receiver.track === before
          );
        }),
        true,
      );
      assert.equal(
        await page.evaluate(() => window.__sfuFixture.playback.getSnapshot().context),
        null,
      );
      await page.evaluate(() => {
        const h = window.__sfuFixture;
        window.__playbackBaseline = {
          peers: [...h.peers],
          player: document.getElementById('sfu-fixture-audio'),
          track: h.remote.getStreams('relay-peer').av.getAudioTracks()[0],
        };
        h.playback.setVolume(180);
      });
      await expect
        .poll(() =>
          page.evaluate(() => window.__sfuFixture.playback.getSnapshot().entries[0].route),
        )
        .toBe('gain');
      assert.equal(
        await page.evaluate(async () => {
          const h = window.__sfuFixture,
            before = window.__playbackBaseline;
          h.playback.setDeafened(true);
          if (!before.player.muted) return false;
          h.playback.setDeafened(false);
          await h.playback.setOutput('');
          h.playback.setVolume(80);
          return (
            h.playback.getSnapshot().entries[0].route === 'direct' &&
            document.getElementById('sfu-fixture-audio') === before.player &&
            before.player.srcObject.getAudioTracks()[0] === before.track &&
            !before.player.muted &&
            before.player.volume === 0.8 &&
            h.peers.length === before.peers.length &&
            before.peers.every((pc) => pc.connectionState === 'connected') &&
            h.audio.readyState === 'live' &&
            h.video.readyState === 'live' &&
            h.playbackContexts.length === 1
          );
        }),
        true,
      );
      await page.evaluate(async () => {
        const h = window.__sfuFixture;
        h.indicators.reset();
        h.diagnostics.reset();
        h.session.reset();
        h.remote.reset();
        h.playback.reset();
        if (h.playbackContexts.some((ctx) => ctx.state !== 'closed'))
          throw new Error('Playback context was not closed');
        if (window.__sfuOldPeers.some((pc) => pc.connectionState !== 'closed'))
          throw new Error('A local relay peer was not closed synchronously');
        await h.connect();
        for (const track of window.__sfuOldTracks)
          for (const type of ['mute', 'unmute', 'ended']) track.dispatchEvent(new Event(type));
      });
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                document.getElementById('sfu-fixture-video').getVideoPlaybackQuality()
                  .totalVideoFrames,
            ),
          { timeout: 15000 },
        )
        .toBeGreaterThan(5);
      assert.equal(
        await page.evaluate(() => {
          const h = window.__sfuFixture;
          return (
            h.audio.readyState === 'live' &&
            h.video.readyState === 'live' &&
            h.session.subscriptions.size === 2 &&
            window.__sfuOldTracks.every((t) => t.readyState === 'ended')
          );
        }),
        true,
      );
      assert.deepEqual(errors, []);
      await expect
        .poll(() => page.evaluate(() => window.__sfuFixture.indicators.isSpeaking('relay-peer')))
        .toBe(true);
      await require('./desktop-voice-flow').exerciseVoiceProtection({ app, page });
      await page.evaluate(() => window.__sfuFixture.close());
    } finally {
      finished = true;
      await closeTestApp(app);
      await fixture?.stop();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
