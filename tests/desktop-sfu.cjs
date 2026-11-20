'use strict';
const { installVoiceTestModules } = require('./voice-test-modules.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { RealtimeSfuManager } = require('../server/realtime-sfu.ts');
const { closeTestApp, killTestApp } = require('./desktop-test-close');

test(
  'real Electron negotiates through the typed backend and local WebRTC relay and keeps captures through reset',
  {
    timeout: 90000,
    skip: process.platform !== 'win32' && 'Windows desktop regression',
  },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-sfu-session-'));
    const origin = 'https://a-lei-do-trono.surge.sh';
    let app,
      fixture,
      backend,
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
      const publisher = { clientId: 'relay-peer', roomId: 'native-relay', out: [] };
      const viewer = { clientId: 'viewer', roomId: 'native-relay', out: [] };
      const room = {
        id: 'native-relay',
        kind: 'chat',
        channelType: 'voice',
        voiceMode: 'sfu',
        players: new Map(
          [publisher, viewer].map((ws) => [
            ws.clientId,
            {
              id: ws.clientId,
              name: ws.clientId,
              ws,
              voiceJoined: true,
              transmissionQuality: 'balanced',
            },
          ]),
        ),
      };
      let serial = 0,
        providerRequests = 0;
      backend = new RealtimeSfuManager({
        rooms: new Map([[room.id, room]]),
        send: (ws, event) => {
          if (event.type === 'sfu-response') ws.out.push(event);
        },
        broadcastVoiceRoster() {},
        version: 'native-fixture',
        usageFile: path.join(directory, 'realtime-usage.json'),
        env: {
          CLOUDFLARE_REALTIME_ENABLED: 'true',
          CLOUDFLARE_REALTIME_APP_ID: 'local-native-fixture',
          CLOUDFLARE_REALTIME_API_TOKEN: 'local-fixture-token',
        },
        fetchImpl: async (url, options) => {
          assert.equal(new URL(url).origin, 'https://rtc.live.cloudflare.com');
          providerRequests++;
          const value = await page.evaluate(
            ({ method, suffix, body }) => window.__sfuRelayProvider(method, suffix, body),
            {
              method: options.method,
              suffix: new URL(url).pathname.split('/apps/local-native-fixture')[1],
              body: options.body ? JSON.parse(options.body) : undefined,
            },
          );
          return Response.json(value);
        },
      });
      await page.exposeFunction('__sfuBackendRequest', async (action, payload) => {
        const ws = [
          'publish-track',
          'publication-ready',
          'close-publication',
          'set-screen-bitrate',
        ].includes(action)
          ? publisher
          : viewer;
        const requestId = 'native-' + ++serial;
        await backend.handleRequest(ws, { requestId, action, payload });
        const index = ws.out.findIndex((event) => event.requestId === requestId),
          response = index >= 0 ? ws.out.splice(index, 1)[0] : undefined;
        if (!response) throw Error('Backend SFU did not answer ' + action);
        if (!response.ok)
          throw Object.assign(Error(response.error.message), { code: response.error.code });
        return response.data;
      });
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
      await page.waitForFunction(() => !!window.TronoSocial);
      await installVoiceTestModules(page, [
        'createSfuSession',
        'createAudioPlayback',
        'createRemoteMedia',
        'createCallQuality',
        'createVoiceTelemetry',
        'createSpeakingIndicators',
        'createScreenPublication',
        'createDevicePublication',
      ]);
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
          clientPeers = [],
          providerPeers = [],
          calls = [];
        let serial = 0;
        const create = (owner = 'client') => {
          const pc = new RTCPeerConnection({ iceServers: [] });
          peers.push(pc);
          (owner === 'provider' ? providerPeers : clientPeers).push(pc);
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
        const providerTracks = new Map();
        window.__sfuRelayProvider = async (method, suffix, body) => {
          if (suffix === '/sessions/new') {
            const sessionId = 'relay-' + ++serial,
              pc = create('provider');
            relay.set(sessionId, pc);
            providerTracks.set(sessionId, []);
            return { sessionId };
          }
          const match = /^\/sessions\/([^/]+)(.*)$/.exec(suffix),
            sessionId = match?.[1],
            operation = match?.[2],
            pc = relay.get(sessionId),
            tracks = providerTracks.get(sessionId) || [];
          if (!pc)
            return { errorCode: 'not_found_session', errorDescription: 'Local session closed' };
          if (method === 'GET')
            return {
              tracks: tracks.map((track) => ({
                ...track,
                status: pc.connectionState === 'closed' ? 'inactive' : track.status,
              })),
            };
          if (operation === '/tracks/new') {
            const track = body.tracks[0];
            if (track.location === 'local') {
              pc.ontrack = (event) => sources.set(track.trackName, event.track);
              await pc.setRemoteDescription(body.sessionDescription);
              await pc.setLocalDescription(await pc.createAnswer());
              await gathered(pc);
              tracks.push({ ...track, status: 'active' });
              return {
                tracks: [{ mid: track.mid, trackName: track.trackName }],
                sessionDescription: pc.localDescription.toJSON(),
              };
            }
            const source = sources.get(track.trackName);
            if (!source)
              return {
                tracks: [
                  { errorCode: 'not_found_track_error', errorDescription: 'Local media absent' },
                ],
              };
            const tr = pc.addTransceiver(source, { direction: 'sendonly' });
            await pc.setLocalDescription(await pc.createOffer());
            await gathered(pc);
            tracks.push({ ...track, mid: tr.mid, status: 'active' });
            return {
              tracks: [{ mid: tr.mid, trackName: track.trackName, sessionId: track.sessionId }],
              sessionDescription: pc.localDescription.toJSON(),
              requiresImmediateRenegotiation: true,
            };
          }
          if (operation === '/renegotiate') {
            await pc.setRemoteDescription(body.sessionDescription);
            return {};
          }
          if (operation === '/tracks/update')
            return { tracks: body.tracks.map((track) => ({ mid: track.mid })) };
          if (operation === '/tracks/close') {
            for (const track of tracks)
              if (body.tracks.some((value) => value.mid === track.mid)) {
                track.status = 'inactive';
                if (track.location === 'local') sources.delete(track.trackName);
              }
            pc.close();
            relay.delete(sessionId);
            return { tracks: body.tracks.map((track) => ({ mid: track.mid })) };
          }
          throw Error('Unexpected local provider operation: ' + operation);
        };
        async function request(action, payload) {
          console.log('SFU fixture: ' + action);
          calls.push({ action, payload });
          return window.__sfuBackendRequest(action, payload);
        }
        const playbackContexts = [];
        const playback = window.__voiceTestModules.createAudioPlayback({
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
        const remote = window.__voiceTestModules.createRemoteMedia({
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
        const quality = window.__voiceTestModules.createCallQuality({
          storage: {
            getItem: (key) =>
              ({ mnScreenFormat: '1080-60', mnScreenBitrate: '8', mnAdaptiveQuality: '0' })[key] ??
              null,
            setItem() {},
          },
          policy: () => ({ sfu: true }),
          call: () => ({ joined: settings.enabled, generation: 1 }),
          refreshCamera: async () => {},
          refreshScreenHint() {},
          senders: () => session.publications.values(),
          subscriptions: () => session.subscriptions.values(),
          setLayer: (key, rid) => session.setLayer(key, rid),
          warn(error) {
            throw error;
          },
        });
        const session = window.__voiceTestModules.createSfuSession({
          getSettings: () => settings,
          createConnection: () => create(),
          request,
          wants: () => true,
          watchVersion: () => 0,
          preferredRid: () => 'f',
          applyQuality: quality.applySender,
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
        const diagnostics = window.__voiceTestModules.createVoiceTelemetry({
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
        const indicators = window.__voiceTestModules.createSpeakingIndicators({
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
        const screenPublication = window.__voiceTestModules.createScreenPublication({
          isSfu: () => true,
          sfu: session,
          p2p: {
            connections: new Map(),
            syncTracks: async () => {
              throw new Error('Unexpected P2P sync');
            },
          },
          quality,
          sharing: { resetPreview() {}, getSnapshot: () => ({ audio: false }) },
          announce() {},
          onAudioDetached() {},
          onStatus() {},
        });
        const deviceTracks = [],
          deviceEvents = [];
        const devicePublication = window.__voiceTestModules.createDevicePublication({
          call: () => ({ joined: settings.enabled }),
          isSfu: () => true,
          sfu: session,
          p2p: {
            connections: new Map(),
            syncTracks: async () => {},
            ensure() {
              throw new Error('Unexpected P2P reconnect');
            },
          },
          quality,
          camera: { getSnapshot: () => ({ capture: window.__sfuFixture?.cameraCapture ?? null }) },
          controls: { cancelPending: () => deviceEvents.push('cancel') },
          closePeer() {
            throw new Error('Unexpected P2P close');
          },
          announceCamera: () => deviceEvents.push('announce'),
          onMicrophoneResumed: () => deviceEvents.push('resume'),
          onDevicesChanged: async () => {
            deviceEvents.push('devices');
          },
          warn(error) {
            throw error;
          },
        });
        async function connect() {
          const audioPub = await session.publish('audio', audio);
          await screenPublication.publish({
            capture: { source, outgoing: source },
            replace: false,
            isCurrent: () => settings.enabled,
          });
          const screenPub = session.publications.get('screen');
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
          screenPublication,
          devicePublication,
          deviceTracks,
          deviceEvents,
          quality,
          remote,
          relay,
          peers,
          clientPeers,
          providerPeers,
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
            window.__sfuFixture.screenReplacement?.stop();
            deviceTracks.forEach((track) => track.stop());
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
        window.__sfuOldPeers = [...h.clientPeers];
        window.__sfuOldProviderPeers = [...h.providerPeers];
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
      const framesBeforeReplacement = await page.evaluate(
        () =>
          document.getElementById('sfu-fixture-video').getVideoPlaybackQuality().totalVideoFrames,
      );
      assert.equal(
        await page.evaluate(async () => {
          const h = window.__sfuFixture;
          const publication = h.session.publications.get('screen');
          const subscription = h.session.subscriptions.get('relay-peer:screen');
          const voice = h.session.publications.get('audio');
          const peers = [...h.peers];
          h.screenReplacement = h.video.clone();
          const stream = new MediaStream([h.screenReplacement]);
          await h.screenPublication.publish({
            capture: { source: stream, outgoing: stream },
            replace: true,
            isCurrent: () => true,
          });
          const current = h.session.publications.get('screen');
          const encoding = current.sender.getParameters().encodings[0];
          return (
            current === publication &&
            current.sender.track === h.screenReplacement &&
            h.session.subscriptions.get('relay-peer:screen') === subscription &&
            h.session.publications.get('audio') === voice &&
            voice.sender.track === h.audio &&
            h.peers.length === peers.length &&
            peers.every((pc) => pc.connectionState === 'connected') &&
            h.video.readyState === 'live' &&
            h.audio.readyState === 'live' &&
            encoding.maxFramerate === 60 &&
            encoding.maxBitrate === 8000000
          );
        }),
        true,
      );
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
        .toBeGreaterThan(framesBeforeReplacement);
      const adaptation = await page.evaluate(async () => {
        const h = window.__sfuFixture,
          original = h.session.publications.get('screen').sender.track;
        const audioBitrate = h.session.publications.get('audio').sender.getParameters()
          .encodings[0].maxBitrate;
        h.quality.configure({ adaptiveEnabled: true });
        h.quality.sample({ limiter: 'cpu' }, 0);
        h.quality.sample({ limiter: 'cpu' }, 12000);
        await h.quality.applyAll();
        const reduced = h.session.publications.get('screen').sender.getParameters().encodings[0];
        const voiceUnchanged =
          audioBitrate ===
          h.session.publications.get('audio').sender.getParameters().encodings[0].maxBitrate;
        h.quality.configure({ adaptiveEnabled: false });
        await h.quality.applyAll();
        const restored = h.session.publications.get('screen').sender.getParameters().encodings[0];
        return {
          reduced: [reduced.maxFramerate, reduced.maxBitrate],
          restored: [restored.maxFramerate, restored.maxBitrate],
          voiceUnchanged,
          sameTrack: original === h.session.publications.get('screen').sender.track,
          sourceFps: h.video.getSettings().frameRate,
        };
      });
      assert.deepEqual(adaptation, {
        reduced: [30, 4000000],
        restored: [60, 8000000],
        voiceUnchanged: true,
        sameTrack: true,
        sourceFps: 60,
      });

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
          throw new Error('A client peer was not closed synchronously');
        await h.connect();
        for (const track of window.__sfuOldTracks)
          for (const type of ['mute', 'unmute', 'ended']) track.dispatchEvent(new Event(type));
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.__sfuOldProviderPeers.every((pc) => pc.connectionState === 'closed'),
          ),
        )
        .toBe(true);
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
      // Exercise microphone replacement/resume and camera lifecycle through the typed adapter.
      await page.evaluate(async () => {
        const h = window.__sfuFixture;
        const voice = h.session.publications.get('audio');
        const screen = h.session.publications.get('screen');
        const subscription = h.session.subscriptions.get('relay-peer:audio');
        const microphone = h.audio.clone();
        h.deviceTracks.push(microphone);
        await h.devicePublication.publishMicrophone({
          stream: new MediaStream([microphone]),
          track: microphone,
          reason: 'acquire',
          isCurrent: () => true,
        });
        if (
          h.session.publications.get('audio') !== voice ||
          voice.sender.track !== microphone ||
          h.session.subscriptions.get('relay-peer:audio') !== subscription ||
          h.session.publications.get('screen') !== screen
        )
          throw new Error('Microphone replacement disturbed existing publications/subscriptions');
        await h.devicePublication.publishMicrophone({
          stream: new MediaStream([h.audio]),
          track: h.audio,
          reason: 'resume',
          isCurrent: () => true,
        });
        if (voice.sender.track !== h.audio || !h.deviceEvents.includes('resume'))
          throw new Error('Microphone did not resume on the existing sender');
        const camera = h.video.clone();
        h.deviceTracks.push(camera);
        h.cameraCapture = { source: new MediaStream([camera]), track: camera };
        await h.devicePublication.publishCamera({
          capture: h.cameraCapture,
          isCurrent: () => true,
        });
        h.cameraPublication = h.session.publications.get('camera');
        const replacement = h.video.clone();
        h.deviceTracks.push(replacement);
        h.cameraCapture = { source: new MediaStream([replacement]), track: replacement };
        const peerCount = h.peers.length;
        await h.devicePublication.publishCamera({
          capture: h.cameraCapture,
          isCurrent: () => true,
        });
        if (
          h.session.publications.get('camera') !== h.cameraPublication ||
          h.cameraPublication.sender.track !== replacement ||
          h.peers.length !== peerCount ||
          voice.sender.track !== h.audio ||
          h.session.publications.get('screen') !== screen
        )
          throw new Error('Camera replacement reopened peers or changed another publication');
      });
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              let frames = 0;
              for (const row of (
                await window.__sfuFixture.cameraPublication.pc.getStats()
              ).values())
                if (row.type === 'outbound-rtp' && row.kind === 'video')
                  frames += row.framesEncoded || 0;
              return frames;
            }),
          { timeout: 15000 },
        )
        .toBeGreaterThan(0);
      const framesBeforeCameraStop = await page.evaluate(
        () =>
          document.getElementById('sfu-fixture-video').getVideoPlaybackQuality().totalVideoFrames,
      );
      assert.equal(
        await page.evaluate(() => {
          const h = window.__sfuFixture;
          h.cameraCapture = null;
          h.devicePublication.cameraStopped();
          return (
            !h.session.publications.has('camera') &&
            h.cameraPublication.pc.connectionState === 'closed' &&
            h.deviceEvents.includes('cancel') &&
            h.session.publications.get('audio').sender.track === h.audio &&
            h.audio.readyState === 'live' &&
            h.session.publications.get('screen').sender.track === h.video &&
            h.video.readyState === 'live'
          );
        }),
        true,
      );
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
        .toBeGreaterThan(framesBeforeCameraStop);
      await require('./desktop-voice-flow').exerciseVoiceProtection({ app, page });
      await page.evaluate(() => window.__sfuFixture.close());
      await backend.stop();
      assert(providerRequests > 10, 'Native media must traverse the backend provider adapter');
      assert.equal(backend.sessions.size, 0);
    } finally {
      finished = true;
      await backend?.stop();
      await closeTestApp(app);
      await fixture?.stop();
      assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
