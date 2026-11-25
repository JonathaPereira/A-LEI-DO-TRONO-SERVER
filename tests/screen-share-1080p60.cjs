'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Slice 1: prioritizeScreenCodec h264 ranks High Profile (64) > Main (4d) > Constrained Baseline (42e0) with packetization-mode=1 and paired RTX', async () => {
  const { prioritizeScreenCodec } = await import('../src/lib/voice/sfu-encoding.ts');
  const originalSender = globalThis.RTCRtpSender;
  try {
    globalThis.RTCRtpSender = {
      getCapabilities: () => ({
        codecs: [
          { mimeType: 'video/VP8', clockRate: 90000 },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=96' },
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=640032',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=101' },
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=103' },
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=4d002a',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=105' },
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640032',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=107' },
        ],
      }),
    };
    let preferred = null;
    assert.equal(
      prioritizeScreenCodec({ setCodecPreferences: (c) => (preferred = c) }, 'h264'),
      true,
    );
    assert.match(preferred[0].sdpFmtpLine, /packetization-mode=1;profile-level-id=640032/);
    assert.equal(preferred[1].sdpFmtpLine, 'apt=107');
    assert.match(preferred[2].sdpFmtpLine, /packetization-mode=1;profile-level-id=4d002a/);
    assert.equal(preferred[3].sdpFmtpLine, 'apt=105');
    assert.match(preferred[4].sdpFmtpLine, /packetization-mode=1;profile-level-id=42e01f/);
    assert.equal(preferred[5].sdpFmtpLine, 'apt=103');
    assert.match(preferred[6].sdpFmtpLine, /packetization-mode=0;profile-level-id=640032/);
    assert.equal(preferred[7].sdpFmtpLine, 'apt=101');
  } finally {
    globalThis.RTCRtpSender = originalSender;
  }
});

test('Slice 1: detectHardwareScreenCodec selects powerEfficient AV1 first, then H.264 High NVENC/AMF, then VP9, and auto prioritizes hardware ahead of VP8', async () => {
  const { detectHardwareScreenCodec, prioritizeScreenCodec, resetHardwareScreenCodecCache } =
    await import('../src/lib/voice/sfu-encoding.ts');
  const originalSender = globalThis.RTCRtpSender;
  try {
    globalThis.RTCRtpSender = {
      getCapabilities: () => ({
        codecs: [
          { mimeType: 'video/VP8', clockRate: 90000 },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=96' },
          {
            mimeType: 'video/VP9',
            clockRate: 90000,
            sdpFmtpLine: 'profile-id=0',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=98' },
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640032',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=102' },
          { mimeType: 'video/AV1', clockRate: 90000 },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=45' },
        ],
      }),
    };

    // RTX 40 / RX 7000 machine: AV1 is powerEfficient -> picks av1
    resetHardwareScreenCodecCache();
    const rtx40 = await detectHardwareScreenCodec({
      async encodingInfo(cfg) {
        const ct = cfg.video?.contentType || '';
        return {
          supported: true,
          smooth: true,
          powerEfficient: ct.includes('AV1') || ct.includes('H264'),
        };
      },
    });
    assert.equal(rtx40, 'av1');

    // RTX 30 / RX 6000 machine: AV1 encode not powerEfficient, H264 High IS powerEfficient -> picks h264
    resetHardwareScreenCodecCache();
    const rtx30 = await detectHardwareScreenCodec({
      async encodingInfo(cfg) {
        const ct = cfg.video?.contentType || '';
        return {
          supported: !ct.includes('AV1'),
          smooth: !ct.includes('AV1'),
          powerEfficient: ct.includes('H264'),
        };
      },
    });
    assert.equal(rtx30, 'h264');

    let preferred = null;
    assert.equal(
      prioritizeScreenCodec({ setCodecPreferences: (c) => (preferred = c) }, 'auto'),
      true,
    );
    assert.equal(preferred[0].mimeType, 'video/H264');
    assert.match(preferred[0].sdpFmtpLine, /640032/);
    assert.equal(preferred[1].sdpFmtpLine, 'apt=102');
    assert.equal(preferred.at(-2).mimeType, 'video/VP8');

    // Software-only machine: neither AV1 nor H264 is powerEfficient -> picks vp9 Profile 0 over VP8
    resetHardwareScreenCodecCache();
    const cpuOnly = await detectHardwareScreenCodec({
      async encodingInfo() {
        return { supported: true, smooth: true, powerEfficient: false };
      },
    });
    assert.equal(cpuOnly, 'vp9');
  } finally {
    resetHardwareScreenCodecCache?.();
    globalThis.RTCRtpSender = originalSender;
  }
});

test('Slice 2: remoteMedia leaves screen & screen-audio jitterBufferTarget native (null) and keeps static screen tracks usable past 5.2s without SFU teardown', async () => {
  const { createRemoteMedia } = await import('../src/lib/voice/remote-media.ts');
  let clock = 1000;
  class FakeTrack extends EventTarget {
    constructor(kind) {
      super();
      this.kind = kind;
      this.readyState = 'live';
      this.muted = false;
      this.enabled = true;
    }
    stop() {
      this.readyState = 'ended';
    }
  }
  class FakeStream {
    constructor() {
      this._tracks = [];
    }
    getTracks() {
      return [...this._tracks];
    }
    getVideoTracks() {
      return this._tracks.filter((t) => t.kind === 'video');
    }
    getAudioTracks() {
      return this._tracks.filter((t) => t.kind === 'audio');
    }
    addTrack(t) {
      if (!this._tracks.includes(t)) this._tracks.push(t);
    }
    removeTrack(t) {
      this._tracks = this._tracks.filter((x) => x !== t);
    }
  }

  let recoveries = 0;
  const remoteMedia = createRemoteMedia({
    enabled: () => true,
    createStream: () => new FakeStream(),
    getPeer: () => undefined,
    isPeerCurrent: () => true,
    getInterest: () => ({ camera: true, screen: true }),
    isCameraHidden: () => false,
    onVoiceReceiver: () => {},
    onAudioReady: () => {},
    onChange: () => {},
    onRecover: async () => {
      recoveries++;
      return false;
    },
    now: () => clock,
  });

  const screenVideoReceiver = { jitterBufferTarget: null, playoutDelayHint: null };
  const screenAudioReceiver = { jitterBufferTarget: null, playoutDelayHint: null };
  const screenTrack = new FakeTrack('video');
  const screenAudioTrack = new FakeTrack('audio');
  const cameraTrack = new FakeTrack('video');

  remoteMedia.attachSubscription({
    id: 'peer-1',
    kind: 'screen',
    track: screenTrack,
    owner: {},
    receiver: screenVideoReceiver,
    isCurrent: () => true,
  });
  remoteMedia.attachSubscription({
    id: 'peer-1',
    kind: 'screen-audio',
    track: screenAudioTrack,
    owner: {},
    receiver: screenAudioReceiver,
    isCurrent: () => true,
  });
  remoteMedia.attachSubscription({
    id: 'peer-1',
    kind: 'camera',
    track: cameraTrack,
    owner: {},
    isCurrent: () => true,
  });

  // Never force a 2000ms or 80ms artificial jitterBufferTarget on screen receivers (avoids 2048-packet PacketBuffer overflow)
  assert.equal(screenVideoReceiver.jitterBufferTarget, null);
  assert.equal(screenAudioReceiver.jitterBufferTarget, null);

  const streams = remoteMedia.getStreams('peer-1');
  assert.equal(remoteMedia.videoUsable('peer-1', streams.screen, 'screen'), true);
  assert.equal(remoteMedia.videoUsable('peer-1', streams.av, 'camera'), true);

  // Windows WGC stops sending frames on a static screen -> Chromium marks remote video track.muted = true after ~2.5s.
  // Even 15 seconds later, the live screen track MUST remain usable so BorrowedVideo keeps the last frame and SFU is not torn down!
  screenTrack.muted = true;
  cameraTrack.muted = true;
  clock += 15000;
  assert.equal(remoteMedia.videoUsable('peer-1', streams.screen, 'screen'), true);
  // Camera sensors emit continuous frames, so a muted camera track past 5.2s still triggers camera recovery.
  assert.equal(remoteMedia.videoUsable('peer-1', streams.av, 'camera'), false);
  assert.equal(recoveries, 0);
});

test('Slice 2: CallQuality defaults to 1080p 60fps @ 8 Mbps with auto hardware codec while honoring SFU budget cap', async () => {
  const { createCallQuality } = await import('../src/lib/voice/quality.ts');
  const store = new Map();
  const policy = { sfu: true, highAllowed: true };
  const quality = createCallQuality({
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
    },
    policy: () => policy,
    call: () => ({ generation: 1, joined: true }),
    refreshCamera: async () => {},
    refreshScreenHint: () => {},
    senders: () => [],
    subscriptions: () => [],
    setLayer: async () => {},
  });

  const snap = quality.getSnapshot();
  assert.equal(snap.preferences.screenFormat, '1080-60');
  assert.equal(snap.preferences.screenBitrateMbps, 8);
  assert.equal(snap.preferences.screenCodec, 'auto');
  assert.equal(snap.preferences.screenContent, 'motion');
  assert.deepEqual(snap.profile.screen, { width: 1920, height: 1080, fps: 60 });
  assert.equal(snap.screenBitrate, 8_000_000);

  // When SFU highAllowed budget brake activates, effective screen profile clamps to 720p30 @ 6 Mbps without overwriting preference
  policy.highAllowed = false;
  const limited = quality.getSnapshot();
  assert.equal(limited.preferences.screenFormat, '1080-60');
  assert.deepEqual(limited.profile.screen, { width: 1280, height: 720, fps: 30 });
  assert.equal(limited.screenBitrate, 6_000_000);
});

test('Slice 3: telemetry never flags static WGC screens (0 frames/packets, track.muted, limiter=cpu, 0 PLI) as stalled and keeps active-decode freezes as presentation-frozen', async () => {
  const { createVoiceTelemetry } = await import('../src/lib/voice/telemetry.ts');
  let stamp = 1000;
  let step = 0;
  let rxMuted = false;
  const localScreenTrack = {
    id: 'local-screen',
    kind: 'video',
    readyState: 'live',
    muted: false,
    enabled: true,
    getSettings: () => ({ width: 1920, height: 1080, frameRate: 60 }),
  };
  const remoteScreenTrack = {
    id: 'remote-screen',
    kind: 'video',
    readyState: 'live',
    get muted() {
      return rxMuted;
    },
    enabled: true,
  };

  const pubPc = {
    connectionState: 'connected',
    iceConnectionState: 'connected',
    report: new Map(),
    getReceivers: () => [],
    getTransceivers: () => [{ mid: '0', sender: { track: localScreenTrack }, receiver: {} }],
    getStats: async () => pubPc.report,
  };
  const subPc = {
    connectionState: 'connected',
    iceConnectionState: 'connected',
    report: new Map(),
    getReceivers: () => [{ track: remoteScreenTrack }],
    getTransceivers: () => [{ mid: '0', sender: {}, receiver: { track: remoteScreenTrack } }],
    getStats: async () => subPc.report,
  };

  const connections = new Map([
    ['sfu-pub:screen', pubPc],
    ['sfu-sub:peer-1:screen', subPc],
  ]);

  const telemetry = createVoiceTelemetry({
    protection: false,
    getSettings: () => ({
      joined: true,
      transport: 'sfu',
      detailsOpen: false,
      foreground: true,
      visible: true,
      desktop: true,
    }),
    getConnections: () => [...connections],
    getLocalVideo: () => localScreenTrack,
    now: () => stamp,
    onSample: async () => {},
    onChange: () => {},
  });

  // Initial active tick
  step = 1;
  pubPc.report = new Map([
    [
      'out',
      {
        id: 'out',
        type: 'outbound-rtp',
        kind: 'video',
        mid: '0',
        timestamp: step * 2000,
        framesEncoded: 120,
        framesSent: 120,
        packetsSent: 900,
        bytesSent: 1_000_000,
        framesDropped: 2,
        pliCount: 0,
        qualityLimitationReason: 'cpu',
        frameWidth: 1920,
        frameHeight: 1080,
      },
    ],
  ]);
  subPc.report = new Map([
    [
      'in',
      {
        id: 'in',
        type: 'inbound-rtp',
        kind: 'video',
        mid: '0',
        timestamp: step * 2000,
        packetsReceived: 900,
        packetsLost: 0,
        bytesReceived: 1_000_000,
        framesReceived: 120,
        framesDecoded: 120,
        freezeCount: 0,
        pliCount: 0,
        frameWidth: 1920,
        frameHeight: 1080,
      },
    ],
  ]);
  await telemetry.collect();

  // Next 5 ticks (10 seconds) of static screen: WGC emits 0 frames, limiter stays 'cpu', remote track becomes muted, 0 PLIs
  rxMuted = true;
  for (let i = 0; i < 5; i++) {
    step++;
    stamp += 2000;
    pubPc.report = new Map([
      [
        'out',
        {
          id: 'out',
          type: 'outbound-rtp',
          kind: 'video',
          mid: '0',
          timestamp: step * 2000,
          framesEncoded: 120,
          framesSent: 120,
          packetsSent: 900,
          bytesSent: 1_000_000,
          framesDropped: 3 + i, // even minor capture/encoder drops without PLIs on 0 encoded frames must not fake encoder-stalled
          pliCount: 0,
          qualityLimitationReason: 'cpu',
          frameWidth: 1920,
          frameHeight: 1080,
        },
      ],
    ]);
    subPc.report = new Map([
      [
        'in',
        {
          id: 'in',
          type: 'inbound-rtp',
          kind: 'video',
          mid: '0',
          timestamp: step * 2000,
          packetsReceived: 900,
          packetsLost: 0,
          bytesReceived: 1_000_000,
          framesReceived: 120,
          framesDecoded: 120,
          freezeCount: 0,
          pliCount: 0,
          frameWidth: 1920,
          frameHeight: 1080,
        },
      ],
    ]);
    await telemetry.collect();
    const streams = telemetry.getSnapshot().telemetry.streams;
    assert.equal(streams.find((s) => s.direction === 'outbound').stalled, false);
    assert.equal(streams.find((s) => s.direction === 'inbound').stalled, false);
  }

  // Active motion resumes with a brief keyframe burst loss (3%) + 1 freeze while frames ARE decoding:
  // cause MUST remain 'presentation-frozen', NOT 'transport-congestion'
  rxMuted = false;
  step++;
  stamp += 2000;
  subPc.report = new Map([
    [
      'in',
      {
        id: 'in',
        type: 'inbound-rtp',
        kind: 'video',
        mid: '0',
        timestamp: step * 2000,
        packetsReceived: 1870,
        packetsLost: 30,
        bytesReceived: 2_000_000,
        framesReceived: 230,
        framesDecoded: 230,
        freezeCount: 1,
        totalFreezesDuration: 0.2,
        pliCount: 1,
        frameWidth: 1920,
        frameHeight: 1080,
      },
    ],
  ]);
  await telemetry.collect();
  const inbound = telemetry.getSnapshot().telemetry.streams.find((s) => s.direction === 'inbound');
  assert.equal(inbound.cause, 'presentation-frozen');
});

test('Slice 3: videoFreezeRecovery parses sfu-pub:* and sfu-sub:* keys and never tears down connected SFU screen subscriptions on transport-congestion', async () => {
  const { createVideoFreezeRecovery } = await import('../src/lib/voice/video-recovery.ts');
  let time = 1000;
  const events = [];
  const recovery = createVideoFreezeRecovery({
    active: () => true,
    generation: () => 1,
    isSfu: () => true,
    now: () => time,
    async nudgePublisher(kind, cause) {
      events.push(['nudge-pub', kind, cause]);
      return true;
    },
    async recoverPublisher(kind, cause) {
      events.push(['recover-pub', kind, cause]);
      return true;
    },
    async refreshSfuSubscription(peerId, kind) {
      events.push(['refresh-sub', peerId, kind]);
      return false;
    },
    async recoverSfuSubscription(peerId, kind) {
      events.push(['recover-sub', peerId, kind]);
      return true;
    },
    async recoverP2pMedia() {
      return false;
    },
  });

  const base = {
    streamKey: 'k',
    pcKey: 'sfu-pub:camera',
    direction: 'outbound',
    mid: '0',
    rid: null,
    trackId: 't1',
    pcState: 'connected',
    iceState: 'connected',
    width: 1280,
    height: 720,
    fps: 0,
    bitrateBps: 0,
    lossPct: null,
    packetsDelta: 0,
    packetsLost: 0,
    retransmittedPackets: 0,
    sendDelayMs: null,
    encodeMs: null,
    decodeMs: null,
    bufferMs: null,
    minBufferMs: null,
    nackCount: 0,
    pliCount: 2,
    firCount: 0,
    keyFrames: 0,
    freezeCount: 0,
    stalled: true,
    stallMs: 2500,
    cause: 'encoder-stalled',
    codec: 'video/H264',
    implementation: null,
    hardwareAccelerated: true,
  };

  // sfu-pub:camera must target 'camera', NEVER 'screen'!
  await recovery.inspect({ streams: [base] });
  assert.deepEqual(events, [['nudge-pub', 'camera', 'encoder-stalled']]);

  // Connected inbound sfu-sub:peer-1:screen with transport-congestion must NOT tear down the PeerConnection
  time += 10000;
  await recovery.inspect({
    streams: [
      {
        ...base,
        streamKey: 'in-1',
        pcKey: 'sfu-sub:peer-1:screen',
        direction: 'inbound',
        cause: 'transport-congestion',
        stallMs: 6500,
      },
    ],
  });
  assert.equal(
    events.some((e) => e[0] === 'recover-sub'),
    false,
  );

  // Genuine broken transport (pcState = 'disconnected') on sfu-sub:peer-1:screen DOES recover subscription
  await recovery.inspect({
    streams: [
      {
        ...base,
        streamKey: 'in-1',
        pcKey: 'sfu-sub:peer-1:screen',
        direction: 'inbound',
        pcState: 'disconnected',
        cause: 'subscription-interrupted',
        stallMs: 2000,
      },
    ],
  });
  assert.deepEqual(events.at(-1), ['recover-sub', 'peer-1', 'screen']);
});

test('Slice 4: screenCapture avoids cloning the raw 1080p60 MediaStream when replay is disabled (zero clone fan-out)', async () => {
  const { createScreenCapture } = await import('../src/lib/voice/screen-capture.ts');
  class FakeTrack extends EventTarget {
    constructor(kind) {
      super();
      this.kind = kind;
      this.readyState = 'live';
      this.stops = 0;
    }
    stop() {
      this.stops++;
      this.readyState = 'ended';
    }
  }
  const makeStream = () => {
    const tracks = [new FakeTrack('video'), new FakeTrack('audio')];
    return {
      clones: [],
      getTracks: () => tracks,
      getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
      getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
      clone() {
        const cloned = makeStream();
        this.clones.push(cloned);
        return cloned;
      },
    };
  };

  let raw = null;
  const capture = createScreenCapture({
    mediaDevices: {
      async getDisplayMedia() {
        raw = makeStream();
        return raw;
      },
    },
    getSettings: () => ({
      generation: 1,
      joined: true,
      format: { width: 1920, height: 1080, fps: 60 },
      replay: null,
      audio: true,
      contentHint: 'motion',
    }),
    onStarted: async () => {},
    onEnded: async () => {
      capture.stop();
    },
    onAudioEnded: async () => {},
    onSourceStarted: () => {},
    onSourceStopped: () => {},
  });

  assert.equal(await capture.start(), true);
  const current = capture.getCapture();
  assert.equal(raw.clones.length, 0, 'Must not clone 1080p60 stream when replay is null');
  assert.equal(current.outgoing, current.source);
  capture.stop();
  for (const t of raw.getTracks()) {
    assert.equal(t.stops, 1, 'Each track must be stopped exactly once');
  }
});

test('Slice 4: CallQuality.applySender computes hardware-safe scaleResolutionDownBy producing even YUV420 dimensions on ultrawide (3440x1440) and windowed (2560x1417) sources', async () => {
  const { createCallQuality } = await import('../src/lib/voice/quality.ts');
  const quality = createCallQuality({
    storage: { getItem: () => null, setItem: () => {} },
    policy: () => ({ sfu: true, highAllowed: true }),
    call: () => ({ generation: 1, joined: true }),
    refreshCamera: async () => {},
    refreshScreenHint: () => {},
    senders: () => [],
    subscriptions: () => [],
    setLayer: async () => {},
  });

  for (const source of [
    { width: 3440, height: 1440 },
    { width: 2560, height: 1417 },
  ]) {
    const applied = [];
    const s = {
      track: { getSettings: () => source },
      getParameters: () => ({ encodings: [{}] }),
      setParameters: async (p) => applied.push(p),
    };
    await quality.applySender(s, 'screen');
    const scale = applied[0].encodings[0].scaleResolutionDownBy;
    const outW = Math.floor(source.width / scale);
    const outH = Math.floor(source.height / scale);
    assert.equal(outW % 2, 0, `Scaled width ${outW} for ${source.width}x${source.height} must be even`);
    assert.equal(outH % 2, 0, `Scaled height ${outH} for ${source.width}x${source.height} must be even`);
    assert.ok(outW <= 1920 && outH <= 1080);
  }
});

test('Slice 5: CallAudio uses interactive latencyHint on desktop and VoiceReception starts on native NetEq (null) instead of forcing a 60-140ms voice delay floor', async () => {
  const { createCallAudio } = await import('../src/lib/voice/call-audio.ts');
  const { VoiceReception } = await import('../src/lib/voice/reception-policy.ts');

  const createdOptions = [];
  const callAudio = createCallAudio({
    desktop: true,
    getSettings: () => ({ joined: true, generation: 1, output: '', visible: true }),
    createContext(opts) {
      createdOptions.push(opts);
      return {
        state: 'running',
        resume: async () => {},
        close: async () => {},
      };
    },
    playback: { unlock() {}, refresh() {} },
    alerts: { prime() {}, unlock() {} },
    refreshMicrophone: async () => {},
    documentEvents: new EventTarget(),
    onChange() {},
  });
  callAudio.ensureContext();
  assert.deepEqual(createdOptions, [{ latencyHint: 'interactive', sampleRate: 48000 }]);
  callAudio.dispose();

  const reception = new VoiceReception(true);
  const voiceReceiver = {
    track: { kind: 'audio', readyState: 'live' },
    jitterBufferTarget: null,
  };
  reception.add(voiceReceiver);
  // Healthy voice calls start on native WebRTC NetEq (null) instead of forcing 60ms delay!
  assert.equal(voiceReceiver.jitterBufferTarget, null);

  const makeStats = (n, concealed = 0) => ({
    packetsReceived: n * 100,
    packetsLost: 0,
    totalSamplesReceived: n * 48000,
    concealedSamples: concealed,
    jitterBufferDelay: n * 20,
    jitterBufferEmittedCount: n * 1000,
    jitter: 0.005,
  });

  assert.equal(reception.sample(voiceReceiver, makeStats(1, 0), 0), null);
  // Severe concealment (>4%) steps up gently to 60ms, then 100ms max (never 140ms)
  reception.sample(voiceReceiver, makeStats(2, 4000), 5000);
  assert.equal(voiceReceiver.jitterBufferTarget, 60);
  reception.sample(voiceReceiver, makeStats(3, 8000), 16000);
  assert.equal(voiceReceiver.jitterBufferTarget, 100);
  reception.sample(voiceReceiver, makeStats(4, 12000), 27000);
  assert.equal(voiceReceiver.jitterBufferTarget, 100);

  // Recovers back to native NetEq (null) in 20s steps instead of staying stuck for 2 minutes
  reception.sample(voiceReceiver, makeStats(5, 12000), 30000);
  reception.sample(voiceReceiver, makeStats(6, 12000), 50000);
  assert.equal(voiceReceiver.jitterBufferTarget, 60);
  reception.sample(voiceReceiver, makeStats(7, 12000), 70000);
  assert.equal(voiceReceiver.jitterBufferTarget, null);
});

test('Slice 6: createViewerFpsMeter measures real viewer rendered FPS via requestVideoFrameCallback, drops to 0 FPS when frames pause, falls back to getVideoPlaybackQuality, and cleans up on dispose', async () => {
  const { createViewerFpsMeter, formatViewerFpsBadge } = await import(
    '../src/lib/voice/viewer-fps-meter.ts'
  );

  let nowMs = 1000;
  let nextHandle = 1;
  let rVfcCallback = null;
  let canceledHandles = [];
  let intervalFn = null;
  let clearedIntervals = 0;

  const fakeVideo = {
    videoWidth: 1920,
    videoHeight: 1080,
    paused: false,
    readyState: 4,
    requestVideoFrameCallback(cb) {
      rVfcCallback = cb;
      return nextHandle++;
    },
    cancelVideoFrameCallback(h) {
      canceledHandles.push(h);
      rVfcCallback = null;
    },
  };

  const updates = [];
  const meter = createViewerFpsMeter({
    video: fakeVideo,
    now: () => nowMs,
    setIntervalFn: (fn) => {
      intervalFn = fn;
      return 99;
    },
    clearIntervalFn: () => {
      clearedIntervals++;
      intervalFn = null;
    },
    onUpdate: (snap) => updates.push(snap),
  });

  // Baseline frame at t=1000ms, presentedFrames=10
  rVfcCallback(1000, { presentedFrames: 10, width: 1920, height: 1080 });
  assert.equal(updates.length, 0);

  // 60 frames presented over 1000ms -> 60 FPS @ 1080p
  nowMs = 2000;
  rVfcCallback(2000, { presentedFrames: 70, width: 1920, height: 1080 });
  assert.deepEqual(updates.at(-1), { fps: 60, width: 1920, height: 1080 });
  assert.equal(formatViewerFpsBadge(updates.at(-1)), '1080p · 60 FPS');

  // If no new frames arrive for >1300ms (static screen or freeze), watchdog reports 0 FPS honestly
  nowMs = 3500;
  intervalFn();
  assert.deepEqual(updates.at(-1), { fps: 0, width: 1920, height: 1080 });
  assert.equal(formatViewerFpsBadge(updates.at(-1)), '1080p · 0 FPS');

  // Motion resumes: new baseline frame then 60 frames over 1000ms -> back to 60 FPS!
  nowMs = 4000;
  rVfcCallback(4000, { presentedFrames: 71, width: 1920, height: 1080 });
  nowMs = 5000;
  rVfcCallback(5000, { presentedFrames: 131, width: 1920, height: 1080 });
  assert.deepEqual(updates.at(-1), { fps: 60, width: 1920, height: 1080 });

  meter.dispose();
  assert.equal(clearedIntervals, 1);
  assert.equal(canceledHandles.length > 0, true);

  // Fallback path when requestVideoFrameCallback is unavailable
  let totalFrames = 100;
  let fbNow = 1000;
  let fbTick = null;
  const fbUpdates = [];
  const fbMeter = createViewerFpsMeter({
    video: {
      videoWidth: 1280,
      videoHeight: 720,
      paused: false,
      readyState: 4,
      getVideoPlaybackQuality: () => ({ totalVideoFrames: totalFrames }),
    },
    now: () => fbNow,
    setIntervalFn: (fn) => {
      fbTick = fn;
      return 101;
    },
    clearIntervalFn: () => {},
    onUpdate: (s) => fbUpdates.push(s),
  });
  fbTick(); // establishes baseline
  fbNow = 2000;
  totalFrames = 130;
  fbTick();
  assert.deepEqual(fbUpdates.at(-1), { fps: 30, width: 1280, height: 720 });
  assert.equal(formatViewerFpsBadge(fbUpdates.at(-1)), '720p · 30 FPS');
  fbMeter.dispose();
});
