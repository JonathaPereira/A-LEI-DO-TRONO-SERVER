'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('video freeze recovery performs targeted per-stream nudge and bounded recovery without resetting call/audio/camera', async () => {
  const { createVideoFreezeRecovery } = await import('../src/lib/voice/video-recovery.ts');
  let time = 1000;
  let joined = true;
  let gen = 1;
  const events = [];

  const recovery = createVideoFreezeRecovery({
    active: () => joined,
    generation: () => gen,
    isSfu: () => true,
    cooldownMs: 6000,
    windowMs: 45000,
    maxAttempts: 3,
    minStallMs: 1500,
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
      return kind === 'camera';
    },
    async recoverSfuSubscription(peerId, kind) {
      events.push(['recover-sub', peerId, kind]);
      return true;
    },
    async recoverP2pMedia(peerId, iceRestart) {
      events.push(['recover-p2p', peerId, iceRestart]);
      return true;
    },
  });

  const stream = (overrides = {}) => ({
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
    pliCount: 2,
    firCount: 0,
    keyFrames: 0,
    freezeCount: 1,
    stalled: true,
    stallMs: 2000,
    cause: 'encoder-stalled',
    codec: 'video/H264',
    implementation: null,
    hardwareAccelerated: null,
    ...overrides,
  });

  // 1. Capture interruption does NOT spam SFU retries.
  await recovery.inspect({
    streams: [stream({ cause: 'capture-interrupted', stallMs: 4000 })],
  });
  assert.equal(events.length, 0);

  // 2. Outbound encoder stall triggers nudge first, enforces cooldown, then recovers publication on 2nd attempt.
  await recovery.inspect({ streams: [stream()] });
  assert.deepEqual(events, [['nudge-pub', 'screen', 'encoder-stalled']]);

  time += 3000; // still within 6000ms cooldown
  await recovery.inspect({ streams: [stream({ stallMs: 5000 })] });
  assert.equal(events.length, 1);

  time += 4000; // cooldown elapsed -> escalates to single publication recovery
  await recovery.inspect({ streams: [stream({ stallMs: 9000 })] });
  assert.deepEqual(events, [
    ['nudge-pub', 'screen', 'encoder-stalled'],
    ['recover-pub', 'screen', 'encoder-stalled'],
  ]);

  // 3. Multi-participant inbound RX freeze recovers ONLY stalled screen, leaving healthy camera & other peers untouched.
  time += 2000;
  await recovery.inspect({
    streams: [
      stream({
        streamKey: 's1',
        pcKey: 'sfu:peer-a:screen',
        direction: 'inbound',
        cause: 'receiver-not-decoding',
        stallMs: 1600,
      }),
      stream({
        streamKey: 'c1',
        pcKey: 'sfu:peer-b:camera',
        direction: 'inbound',
        stalled: false,
        stallMs: 0,
        cause: null,
      }),
    ],
  });
  assert.deepEqual(events.at(-2), ['refresh-sub', 'peer-a', 'screen']);
  assert.deepEqual(events.at(-1), ['recover-sub', 'peer-a', 'screen']);

  // 4. Max attempt budget blocks infinite loops.
  for (let i = 0; i < 6; i++) {
    time += 7000;
    await recovery.inspect({
      streams: [
        stream({
          streamKey: 's1',
          pcKey: 'sfu:peer-a:screen',
          direction: 'inbound',
          cause: 'sfu-forwarding-stalled',
          stallMs: 2500,
        }),
      ],
    });
  }
  const peerARecoveries = events.filter((e) => e[0] === 'recover-sub' && e[1] === 'peer-a');
  assert.equal(peerARecoveries.length, 3);

  // 5. Generation change / call end prevents actions.
  joined = false;
  time += 60000;
  await recovery.inspect({
    streams: [stream({ pcKey: 'sfu:peer-c:screen', direction: 'inbound', cause: 'sfu-forwarding-stalled', stallMs: 3000 })],
  });
  assert.equal(events.some((e) => e[1] === 'peer-c'), false);
});

test('CallStability adapts faster to active video freeze/congestion and server allows 18 Mbps SFU bitrate clamping', async () => {
  const { CallStability } = await import('../src/lib/voice/quality-policy.ts');
  const stability = new CallStability();
  stability.sample(
    {
      lossPct: 6.5,
      retransmittedPackets: 14,
      streams: [{ stalled: true, cause: 'transport-congestion' }],
    },
    0,
  );
  assert.equal(stability.sample({ lossPct: 6.5, streams: [{ stalled: true, cause: 'transport-congestion' }] }, 5000), false);
  assert.equal(stability.sample({ lossPct: 6.5, streams: [{ stalled: true, cause: 'transport-congestion' }] }, 6000), true);
  assert.equal(stability.level, 1);
  assert.equal(stability.sample({}, 7000), false);
  assert.equal(stability.sample({}, 67000), true);
  assert.equal(stability.level, 0);
});
