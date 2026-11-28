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
  assert.match(
    fmtp102,
    /x-google-min-bitrate=\d+;x-google-start-bitrate=\d+;x-google-max-bitrate=10000$/,
  );
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
    assert.equal(
      prioritizeScreenCodec({ setCodecPreferences: (c) => (preferred = c) }, 'h264'),
      true,
    );
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

test('remoteMedia keeps screen video, screen-audio, and voice receivers on native adaptive jitter buffer (null) without 2s overflow target', async () => {
  const { createRemoteMedia } = await import('../src/lib/voice/remote-media.ts');

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
    onVoiceReceiver: () => {},
    onAudioReady: () => {},
    onChange: () => {},
    onRecover: async () => false,
  });

  const screenVideoReceiver = { jitterBufferTarget: 2000 };
  const screenAudioReceiver = { jitterBufferTarget: 2000 };
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

  assert.equal(screenVideoReceiver.jitterBufferTarget, null);
  assert.equal(screenAudioReceiver.jitterBufferTarget, null);
  assert.equal(voiceReceiver.jitterBufferTarget, null);
});

test('CallStability ignores isolated bandwidth limiter when packet loss, RTT and sendDelay are healthy', async () => {
  const { CallStability } = await import('../src/lib/voice/quality-policy.ts');
  const stability = new CallStability();

  const rampSample = {
    limiter: 'bandwidth',
    lossPct: 0,
    audioLossPct: 0,
    retransmittedPackets: 0,
    retransmittedPct: 0,
    rttMs: 57,
    audioJitterMs: 5,
    video: [{ direction: 'outbound', sendDelayMs: 0, encodeMs: 6, freezeCount: 0 }],
    streams: [
      {
        direction: 'outbound',
        packetsDelta: 400,
        retransmittedPackets: 0,
        sendDelayMs: 0,
        stalled: false,
        cause: null,
      },
    ],
  };

  assert.equal(stability.sample(rampSample, 0), false);
  assert.equal(stability.sample(rampSample, 15000), false);
  assert.equal(stability.sample(rampSample, 35000), false);
  assert.equal(stability.level, 0);
  assert.equal(stability.reason, '');

  // Bandwidth limiter WITH actual congestion (loss >= 2% or sendDelayMs >= 40) still steps down after 12s.
  const congestedSample = {
    ...rampSample,
    lossPct: 2.5,
  };
  assert.equal(stability.sample(congestedSample, 40000), false);
  assert.equal(stability.sample(congestedSample, 52000), true);
  assert.equal(stability.level, 1);
  assert.equal(stability.reason, 'instabilidade de rede');
});
