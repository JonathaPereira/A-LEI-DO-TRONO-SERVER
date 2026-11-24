'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('CallStability uses real retransmission percentage instead of raw retransmittedPackets >= 8', async () => {
  const { CallStability } = await import('../src/lib/voice/quality-policy.ts');
  const stability = new CallStability();

  // 15 retransmitted packets out of 2000 sent (0.75%) on a high-bitrate stream must NOT degrade quality.
  const lowPctSample = {
    retransmittedPackets: 15,
    retransmittedPct: 0.75,
    streams: [
      {
        direction: 'outbound',
        packetsDelta: 2000,
        retransmittedPackets: 15,
        stalled: false,
        cause: null,
      },
    ],
  };
  assert.equal(stability.sample(lowPctSample, 0), false);
  assert.equal(stability.sample(lowPctSample, 15000), false);
  assert.equal(stability.sample(lowPctSample, 30000), false);
  assert.equal(stability.level, 0);

  // Sustained >= 5% retransmission rate (120 of 2000 = 6%) MUST step down after 12s.
  const highPctSample = {
    retransmittedPackets: 120,
    retransmittedPct: 6,
    streams: [
      {
        direction: 'outbound',
        packetsDelta: 2000,
        retransmittedPackets: 120,
        stalled: false,
        cause: null,
      },
    ],
  };
  assert.equal(stability.sample(highPctSample, 40000), false);
  assert.equal(stability.sample(highPctSample, 52000), true);
  assert.equal(stability.level, 1);
});

test('screenStartupOffer preserves CRLF integrity on existing H264 fmtp lines without injecting stray CR', async () => {
  const { screenStartupOffer } = await import('../src/lib/voice/sfu-encoding.ts');
  const sdp = [
    'v=0',
    'm=video 9 UDP/TLS/RTP/SAVPF 102 96',
    'a=rtpmap:102 H264/90000',
    'a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
    'a=rtpmap:96 VP8/90000',
    '',
  ].join('\r\n');

  const updated = screenStartupOffer({ type: 'offer', sdp }, 10_000_000);
  assert.ok(updated.sdp);
  assert.equal(
    updated.sdp.includes('\r;'),
    false,
    'screenStartupOffer must never inject a bare CR before ;x-google-min-bitrate',
  );
  const fmtp102 = updated.sdp.split('\r\n').find((line) => line.startsWith('a=fmtp:102 '));
  assert.ok(fmtp102, 'H264 fmtp line must remain intact on a single CRLF line');
  assert.match(fmtp102, /profile-level-id=42e01f/);
  assert.match(fmtp102, /x-google-min-bitrate=\d+;x-google-start-bitrate=\d+;x-google-max-bitrate=10000$/);
  assert.equal(fmtp102.includes(';;'), false);
});

test('prioritizeScreenCodec h264 strongly prefers packetization-mode=1 and Constrained Baseline over packetization-mode=0 / plain baseline', async () => {
  const { prioritizeScreenCodec } = await import('../src/lib/voice/sfu-encoding.ts');
  const originalSender = globalThis.RTCRtpSender;
  try {
    globalThis.RTCRtpSender = {
      getCapabilities: () => ({
        codecs: [
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=101' },
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=103' },
          {
            mimeType: 'video/H264',
            clockRate: 90000,
            sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
          },
          { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=105' },
        ],
      }),
    };
    let preferred = null;
    assert.equal(prioritizeScreenCodec({ setCodecPreferences: (c) => (preferred = c) }, 'h264'), true);
    assert.match(preferred[0].sdpFmtpLine, /packetization-mode=1;profile-level-id=42e01f/);
    assert.equal(preferred[1].sdpFmtpLine, 'apt=105');
    assert.match(preferred[4].sdpFmtpLine, /packetization-mode=0/);
  } finally {
    globalThis.RTCRtpSender = originalSender;
  }
});

test('video recovery does not tear down connected outbound publisher on transport-congestion and respects Modo Fluidez buffer grace', async () => {
  const { createVideoFreezeRecovery } = await import('../src/lib/voice/video-recovery.ts');
  let time = 1000;
  let bufferMs = 2000;
  const events = [];
  const recovery = createVideoFreezeRecovery({
    active: () => true,
    generation: () => 1,
    isSfu: () => true,
    now: () => time,
    getBufferMs: () => bufferMs,
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

  const makeStream = (overrides) => ({
    streamKey: 'k',
    pcKey: 'sfu:screen',
    direction: 'outbound',
    mid: '1',
    rid: null,
    trackId: 't1',
    pcState: 'connected',
    iceState: 'connected',
    width: 1920,
    height: 1080,
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
    pliCount: 0,
    firCount: 0,
    keyFrames: 0,
    freezeCount: 1,
    stalled: true,
    stallMs: 4500,
    cause: 'transport-congestion',
    codec: 'video/H264',
    implementation: null,
    hardwareAccelerated: null,
    ...overrides,
  });

  // Attempt 1: soft nudge allowed on outbound transport-congestion
  await recovery.inspect({ streams: [makeStream({})] });
  assert.deepEqual(events, [['nudge-pub', 'screen', 'transport-congestion']]);

  // Attempt 2 after cooldown: must NOT hard-teardown a connected outbound publisher on transport-congestion
  time += 7000;
  await recovery.inspect({ streams: [makeStream({ stallMs: 9000 })] });
  assert.deepEqual(events, [['nudge-pub', 'screen', 'transport-congestion']]);

  // Inbound screen in Modo Fluidez (2000ms buffer): a 4200ms stall is still within 3800 + 1920 = 5720ms grace
  await recovery.inspect({
    streams: [
      makeStream({
        streamKey: 'in1',
        pcKey: 'sfu:peer-1:screen',
        direction: 'inbound',
        cause: 'receiver-not-decoding',
        stallMs: 4200,
      }),
    ],
  });
  assert.equal(
    events.some((e) => e[0] === 'recover-sub'),
    false,
  );

  // Sustained stall beyond 5720ms recovers the subscription
  await recovery.inspect({
    streams: [
      makeStream({
        streamKey: 'in1',
        pcKey: 'sfu:peer-1:screen',
        direction: 'inbound',
        cause: 'receiver-not-decoding',
        stallMs: 6000,
      }),
    ],
  });
  assert.deepEqual(events.at(-1), ['recover-sub', 'peer-1', 'screen']);
});

test('Modo Fluidez applies ~2000ms buffer to screen video & screen-audio, updates live, and keeps voice real-time', async () => {
  const { createRemoteMedia } = await import('../src/lib/voice/remote-media.ts');
  const { createCallQuality } = await import('../src/lib/voice/quality.ts');

  const store = new Map();
  const quality = createCallQuality({
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
    },
    policy: () => ({ sfu: true }),
    call: () => ({ generation: 1, joined: true }),
    refreshCamera: async () => {},
    refreshScreenHint: () => {},
    senders: () => [],
    subscriptions: () => [],
    setLayer: async () => {},
  });

  assert.equal(quality.getSnapshot().preferences.screenSmoothMode, false);

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
  const createStream = () => {
    const tracks = [];
    return {
      getTracks: () => [...tracks],
      getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
      getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
      addTrack: (t) => tracks.push(t),
      removeTrack: (t) => {
        const i = tracks.indexOf(t);
        if (i >= 0) tracks.splice(i, 1);
      },
    };
  };

  const media = createRemoteMedia({
    enabled: () => true,
    createStream,
    getPeer: () => undefined,
    isPeerCurrent: () => false,
    getInterest: () => ({ camera: false, screen: true }),
    isCameraHidden: () => false,
    getScreenBufferMs: () => (quality.getSnapshot().preferences.screenSmoothMode ? 2000 : 80),
    onVoiceReceiver: () => {},
    onAudioReady: () => {},
    onChange: () => {},
    onRecover: async () => false,
  });

  const screenVideoReceiver = { jitterBufferTarget: null };
  const screenAudioReceiver = { jitterBufferTarget: null };
  const voiceReceiver = { jitterBufferTarget: null };

  media.attachSubscription({
    id: 'p1',
    kind: 'screen',
    track: new FakeTrack('video'),
    owner: {},
    receiver: screenVideoReceiver,
    isCurrent: () => true,
  });
  media.attachSubscription({
    id: 'p1',
    kind: 'screen-audio',
    track: new FakeTrack('audio'),
    owner: {},
    receiver: screenAudioReceiver,
    isCurrent: () => true,
  });
  media.attachSubscription({
    id: 'p1',
    kind: 'audio',
    track: new FakeTrack('audio'),
    owner: {},
    receiver: voiceReceiver,
    isCurrent: () => true,
  });

  // Default low-latency mode
  assert.equal(screenVideoReceiver.jitterBufferTarget, 80);
  assert.equal(screenAudioReceiver.jitterBufferTarget, null);
  assert.equal(voiceReceiver.jitterBufferTarget, null);

  // Enable Modo Fluidez live: screen video + screen-audio jump to 2000ms, voice stays real-time (null)!
  quality.configure({ screenSmoothMode: true });
  assert.equal(store.get('mnScreenSmoothMode'), '1');
  media.refreshScreenBuffer();
  assert.equal(screenVideoReceiver.jitterBufferTarget, 2000);
  assert.equal(screenAudioReceiver.jitterBufferTarget, 2000);
  assert.equal(voiceReceiver.jitterBufferTarget, null);

  // Disable Modo Fluidez live: screen video returns to 80ms, screen-audio returns to null, voice untouched!
  quality.configure({ screenSmoothMode: false });
  assert.equal(store.get('mnScreenSmoothMode'), '0');
  media.refreshScreenBuffer();
  assert.equal(screenVideoReceiver.jitterBufferTarget, 80);
  assert.equal(screenAudioReceiver.jitterBufferTarget, null);
  assert.equal(voiceReceiver.jitterBufferTarget, null);
});
