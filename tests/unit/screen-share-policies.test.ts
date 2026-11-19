import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planScreenEncodingChange } from '../../packages/voice-engine/src/policies/screenShare.ts';
import {
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_RESOLUTION_PRESETS,
  floorToEven,
  resolveEffectiveScreenShareDimensions,
  resolveScreenShareDegradationPreference,
  buildScreenShareOptions,
  buildScreenShareSenderParameters,
} from '../../packages/voice-engine/src/policies/screenShareOptions.ts';

describe('policies/screenShareOptions', () => {
  it('expõe presets de resolução e frame rates [15, 30, 60]', () => {
    assert.deepEqual(SCREEN_SHARE_FRAME_RATES, [15, 30, 60]);
    assert.deepEqual(Object.keys(SCREEN_SHARE_RESOLUTION_PRESETS), [
      'low_480p',
      '720p',
      '1080p',
      '1440p',
      'source',
    ]);
  });

  it('calcula floorToEven corretamente para inteiros, decimais e valores inválidos', () => {
    assert.equal(floorToEven(1920), 1920);
    assert.equal(floorToEven(1921), 1920);
    assert.equal(floorToEven(721.9), 720);
    assert.equal(floorToEven(1), 0);
    assert.equal(floorToEven(0), 0);
    assert.equal(floorToEven(-5), 0);
    assert.equal(floorToEven(Number.NaN), 0);
  });

  it('resolveEffectiveScreenShareDimensions preserva aspect ratio e dimensões pares sem upscaling', () => {
    // 16:9 downscale
    assert.deepEqual(resolveEffectiveScreenShareDimensions('720p', { width: 1920, height: 1080 }), {
      width: 1280,
      height: 720,
    });

    // 16:10 downscale (1920x1200 -> 1080p: 1728x1080)
    assert.deepEqual(
      resolveEffectiveScreenShareDimensions('1080p', { width: 1920, height: 1200 }),
      { width: 1728, height: 1080 },
    );

    // Ultrawide com números ímpares ajustados para pares (3441x1441 -> 1080p)
    const ultrawide = resolveEffectiveScreenShareDimensions('1080p', {
      width: 3441,
      height: 1441,
    });
    assert.ok(ultrawide);
    assert.equal(ultrawide.width % 2, 0);
    assert.equal(ultrawide.height % 2, 0);
    assert.ok(ultrawide.width <= 1920);
    assert.ok(ultrawide.height <= 1080);

    // Não faz upscaling quando a fonte é menor que o preset
    assert.deepEqual(resolveEffectiveScreenShareDimensions('1440p', { width: 1281, height: 721 }), {
      width: 1280,
      height: 720,
    });

    // Modo source mantém a fonte com dimensões pares
    assert.deepEqual(
      resolveEffectiveScreenShareDimensions('source', { width: 2561, height: 1441 }),
      { width: 2560, height: 1440 },
    );

    // Sem sourceDimensions: retorna preset nominal ou null para source
    assert.deepEqual(resolveEffectiveScreenShareDimensions('low_480p'), {
      width: 854,
      height: 480,
    });
    assert.equal(resolveEffectiveScreenShareDimensions('source'), null);
  });

  it('resolveScreenShareDegradationPreference escolhe maintain-framerate ou maintain-resolution', () => {
    assert.equal(
      resolveScreenShareDegradationPreference({ contentHint: 'motion', maxFramerate: 30 }),
      'maintain-framerate',
    );
    assert.equal(
      resolveScreenShareDegradationPreference({ streamingMode: 'gaming', maxFramerate: 30 }),
      'maintain-framerate',
    );
    assert.equal(
      resolveScreenShareDegradationPreference({ maxFramerate: 60 }),
      'maintain-framerate',
    );

    assert.equal(
      resolveScreenShareDegradationPreference({ contentHint: 'detail', maxFramerate: 60 }),
      'maintain-resolution',
    );
    assert.equal(
      resolveScreenShareDegradationPreference({ contentHint: 'text' }),
      'maintain-resolution',
    );
    assert.equal(
      resolveScreenShareDegradationPreference({ streamingMode: 'text' }),
      'maintain-resolution',
    );
    assert.equal(
      resolveScreenShareDegradationPreference({ maxFramerate: 15 }),
      'maintain-resolution',
    );
  });

  it('buildScreenShareOptions normaliza preset, frameRate, bitrate e degradationPreference', () => {
    const gaming = buildScreenShareOptions({
      resolution: '1080p',
      frameRate: 60,
      streamingMode: 'gaming',
      sourceDimensions: { width: 2560, height: 1440 },
    });
    assert.equal(gaming.resolution, '1080p');
    assert.equal(gaming.frameRate, 60);
    assert.deepEqual(gaming.dimensions, { width: 1920, height: 1080 });
    assert.equal(gaming.contentHint, 'motion');
    assert.equal(gaming.degradationPreference, 'maintain-framerate');
    assert.ok(gaming.maxBitrateBps >= 8_000_000);

    const text = buildScreenShareOptions({
      resolution: '1440p',
      frameRate: 15,
      contentHint: 'text',
    });
    assert.equal(text.frameRate, 15);
    assert.equal(text.contentHint, 'text');
    assert.equal(text.degradationPreference, 'maintain-resolution');
    assert.deepEqual(text.dimensions, { width: 2560, height: 1440 });
  });

  it('buildScreenShareSenderParameters monta encodings, scaling e scalabilityMode', () => {
    const single = buildScreenShareSenderParameters({
      encodings: [{ maxBitrate: 1_000_000 }],
      target: {
        resolution: '720p',
        frameRate: 60,
        maxBitrateBps: 6_000_000,
        contentHint: 'motion',
      },
      capture: { width: 1920, height: 1080, frameRate: 60 },
      scalabilityMode: 'L1T2',
    });
    assert.equal(single.degradationPreference, 'maintain-framerate');
    assert.equal(single.encodings.length, 1);
    assert.equal(single.encodings[0].maxBitrate, 6_000_000);
    assert.equal(single.encodings[0].maxFramerate, 60);
    assert.equal(single.encodings[0].scaleResolutionDownBy, 1.5);
    assert.equal(single.encodings[0].scalabilityMode, 'L1T2');

    const simulcast = buildScreenShareSenderParameters({
      encodings: [
        { rid: 'f', scaleResolutionDownBy: 1 },
        { rid: 'h', scaleResolutionDownBy: 2 },
        { rid: 'q', scaleResolutionDownBy: 4 },
      ],
      target: {
        resolution: '1080p',
        frameRate: 30,
        maxBitrateBps: 8_000_000,
        contentHint: 'detail',
      },
      capture: { width: 1920, height: 1080, frameRate: 30 },
    });
    assert.equal(simulcast.degradationPreference, 'maintain-resolution');
    assert.equal(simulcast.encodings.length, 3);
    assert.equal(simulcast.encodings[0].rid, 'f');
    assert.equal(simulcast.encodings[0].maxBitrate, 8_000_000);
    assert.ok((simulcast.encodings[1].maxBitrate ?? 0) < 8_000_000);
    assert.ok((simulcast.encodings[2].maxBitrate ?? 0) < (simulcast.encodings[1].maxBitrate ?? 0));
  });
});

describe('policies/screenShare — planScreenEncodingChange', () => {
  const basePublished = {
    captureId: 'cap-1',
    resolution: '720p' as const,
    frameRate: 30 as const,
    maxBitrateBps: 4_000_000,
    contentHint: 'motion' as const,
    codec: 'vp9' as const,
    hardwareEncoding: false,
    zeroCopyRequired: false,
  };

  it('rejeita quando não há transmissão publicada ou quando captureId diverge', () => {
    const notPublished = planScreenEncodingChange({
      published: null,
      desired: { ...basePublished, frameRate: 60 },
    });
    assert.equal(notPublished.action, 'reject');
    assert.equal(notPublished.reason, 'not-published');
    assert.ok(notPublished.error instanceof Error);

    const mismatch = planScreenEncodingChange({
      published: basePublished,
      desired: { ...basePublished, captureId: 'cap-2', frameRate: 60 },
    });
    assert.equal(mismatch.action, 'reject');
    assert.equal(mismatch.reason, 'capture-mismatch');
    assert.ok(mismatch.error instanceof Error);
  });

  it('rejeita opções inválidas como frameRate ou maxBitrateBps não positivos', () => {
    const invalid = planScreenEncodingChange({
      published: basePublished,
      update: { maxBitrateBps: -100 },
    });
    assert.equal(invalid.action, 'reject');
    assert.equal(invalid.reason, 'invalid-options');
    assert.ok(invalid.error instanceof Error);
  });

  it('retorna noop quando os parâmetros desejados são idênticos aos publicados', () => {
    const plan = planScreenEncodingChange({
      published: basePublished,
      desired: { ...basePublished },
    });
    assert.equal(plan.action, 'noop');
    assert.equal(plan.reason, 'unchanged');
    assert.equal(plan.error, null);
  });

  it('retorna updateEncoding quando apenas resolução, frameRate, bitrate ou contentHint mudam', () => {
    const plan = planScreenEncodingChange({
      published: basePublished,
      update: { resolution: '1080p', frameRate: 60, maxBitrateBps: 10_000_000 },
    });
    assert.equal(plan.action, 'updateEncoding');
    assert.equal(plan.reason, 'encoding-parameters-changed');
    assert.equal(plan.error, null);
    assert.equal(plan.desired?.resolution, '1080p');
    assert.equal(plan.desired?.frameRate, 60);
    assert.equal(plan.desired?.maxBitrateBps, 10_000_000);
  });

  it('retorna republish quando codec, hardwareEncoding, zeroCopyRequired ou simulcast mudam', () => {
    const codecChange = planScreenEncodingChange({
      published: basePublished,
      update: { codec: 'h264', frameRate: 60 },
    });
    assert.equal(codecChange.action, 'republish');
    assert.equal(codecChange.reason, 'codec-changed');
    assert.equal(codecChange.error, null);

    const hwChange = planScreenEncodingChange({
      published: basePublished,
      update: { hardwareEncoding: true },
    });
    assert.equal(hwChange.action, 'republish');
    assert.equal(hwChange.reason, 'hardware-encoding-changed');

    const zeroCopyChange = planScreenEncodingChange({
      published: basePublished,
      update: { zeroCopyRequired: true },
    });
    assert.equal(zeroCopyChange.action, 'republish');
    assert.equal(zeroCopyChange.reason, 'zero-copy-changed');
  });
});
