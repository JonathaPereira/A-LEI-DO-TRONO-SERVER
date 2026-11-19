import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SourceLifecycleRegistry } from '../../packages/voice-engine/src/source-isolation/SourceLifecycleRegistry.ts';
import {
  getDisplayMediaOptions,
  createDisplayScreenShareTracks,
  type DisplayMediaDevicesLike,
} from '../../packages/voice-engine/src/adapters/screen-share/DisplayMediaCapture.ts';
import {
  ensureKeepAliveSink,
  clearKeepAliveSink,
  applyScreenContentHint,
  enforceScreenShareSenderParameters,
  prioritizeScreenCodec,
  type KeepAliveDocumentLike,
  type KeepAliveVideoElementLike,
  type ScreenCodecCapability,
} from '../../packages/voice-engine/src/adapters/screen-share/ScreenShareTrackPlumbing.ts';

function makeTrack(
  id: string,
  kind: 'video' | 'audio' = 'video',
  readyState: 'live' | 'ended' = 'live',
) {
  let stopCalls = 0;
  return {
    id,
    kind,
    readyState,
    contentHint: '',
    get stopCalls() {
      return stopCalls;
    },
    stop() {
      stopCalls += 1;
      this.readyState = 'ended';
    },
  };
}

function makeFakeDocument(): KeepAliveDocumentLike & {
  elements: KeepAliveVideoElementLike[];
} {
  const elements: KeepAliveVideoElementLike[] = [];
  const doc: KeepAliveDocumentLike & { elements: KeepAliveVideoElementLike[] } = {
    elements,
    body: {
      appendChild(node: KeepAliveVideoElementLike) {
        if (!elements.includes(node)) elements.push(node);
        return node;
      },
      removeChild(node: KeepAliveVideoElementLike) {
        const idx = elements.indexOf(node);
        if (idx >= 0) elements.splice(idx, 1);
        return node;
      },
    },
    createElement(tag: string) {
      const attrs = new Map<string, string>();
      const el: KeepAliveVideoElementLike = {
        tagName: tag.toUpperCase(),
        style: {},
        muted: false,
        playsInline: false,
        autoplay: false,
        srcObject: null,
        parentNode: null,
        setAttribute(name: string, value: string) {
          attrs.set(name, value);
        },
        getAttribute(name: string) {
          return attrs.get(name) ?? null;
        },
        play() {
          return Promise.resolve();
        },
        pause() {},
        remove() {
          const idx = elements.indexOf(el);
          if (idx >= 0) elements.splice(idx, 1);
          el.parentNode = null;
        },
      };
      return el;
    },
    querySelector(selector: string) {
      const match = /\[data-flx="([^"]+)"\]/.exec(selector);
      if (!match) return null;
      return elements.find((el) => el.getAttribute?.('data-flx') === match[1]) ?? null;
    },
  };
  return doc;
}

describe('source-isolation/SourceLifecycleRegistry', () => {
  it('encerra tracks de captura substituída ou parada sem tocar em captura mais nova', () => {
    const registry = new SourceLifecycleRegistry();
    const oldVideo = makeTrack('v-1', 'video');
    const oldAudio = makeTrack('a-1', 'audio');
    const newVideo = makeTrack('v-2', 'video');

    registry.registerCapture('cap-1', [oldVideo, oldAudio], { sourceKey: 'screen' });
    assert.equal(registry.getActiveCaptureId('screen'), 'cap-1');
    assert.equal(registry.hasCapture('cap-1'), true);

    // Nova captura para a mesma sourceKey substitui a anterior e para os tracks antigos
    registry.registerCapture('cap-2', [newVideo], { sourceKey: 'screen', replacePrevious: true });

    assert.equal(oldVideo.stopCalls, 1);
    assert.equal(oldAudio.stopCalls, 1);
    assert.equal(newVideo.stopCalls, 0);
    assert.equal(registry.hasCapture('cap-1'), false);
    assert.equal(registry.getActiveCaptureId('screen'), 'cap-2');

    // Parada tardia (stale) da captura antiga não afeta a nova captura
    const staleStopped = registry.stopCapture('cap-1');
    assert.equal(staleStopped, 0);
    assert.equal(newVideo.stopCalls, 0);
  });

  it('nunca encerra track compartilhada enquanto outra captura ativa ainda a referencia', () => {
    const registry = new SourceLifecycleRegistry();
    const sharedVideo = makeTrack('v-shared', 'video');
    const oldAudio = makeTrack('a-old', 'audio');

    registry.registerCapture('cap-1', [sharedVideo, oldAudio]);
    registry.registerCapture('cap-2', [sharedVideo]);

    const stopped = registry.stopCapture('cap-1');
    assert.equal(stopped, 1);
    assert.equal(oldAudio.stopCalls, 1);
    assert.equal(sharedVideo.stopCalls, 0);
    assert.equal(registry.isTrackActive(sharedVideo), true);

    const stoppedSecond = registry.stopCapture('cap-2');
    assert.equal(stoppedSecond, 1);
    assert.equal(sharedVideo.stopCalls, 1);
    assert.equal(registry.isTrackActive(sharedVideo), false);
  });

  it('replaceCapture e stopAll gerenciam múltiplas fontes sem vazamento', () => {
    const registry = new SourceLifecycleRegistry();
    const screen1 = makeTrack('screen-1', 'video');
    const screen2 = makeTrack('screen-2', 'video');
    const cam1 = makeTrack('cam-1', 'video');

    registry.registerCapture('s-1', [screen1], { sourceKey: 'screen' });
    registry.registerCapture('c-1', [cam1], { sourceKey: 'camera' });
    registry.replaceCapture('s-1', 's-2', [screen2], { sourceKey: 'screen' });

    assert.equal(screen1.stopCalls, 1);
    assert.equal(screen2.stopCalls, 0);
    assert.equal(cam1.stopCalls, 0);

    const totalStopped = registry.stopAll();
    assert.equal(totalStopped, 2);
    assert.equal(screen2.stopCalls, 1);
    assert.equal(cam1.stopCalls, 1);
  });
});

describe('adapters/screen-share/DisplayMediaCapture', () => {
  it('configura getDisplayMediaOptions com isolamento de áudio de janela e sem DSP de voz', () => {
    const opts = getDisplayMediaOptions({ resolution: '1080p', frameRate: 60 });
    assert.equal(opts.windowAudio, 'window');
    assert.equal(opts.systemAudio, 'include');
    assert.equal(opts.selfBrowserSurface, 'exclude');
    assert.equal(opts.restrictOwnAudio, true);
    assert.deepEqual(opts.audio, {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      restrictOwnAudio: true,
    });
    assert.deepEqual(opts.video, {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 60, max: 60 },
    });
  });

  it('createDisplayScreenShareTracks captura vídeo + áudio e limpa tudo em falha parcial', async () => {
    const videoTrack = makeTrack('screen-v', 'video');
    const audioTrack = makeTrack('screen-a', 'audio');

    const mediaDevices: DisplayMediaDevicesLike = {
      async getDisplayMedia() {
        return {
          getTracks: () => [videoTrack, audioTrack],
          getVideoTracks: () => [videoTrack],
          getAudioTracks: () => [audioTrack],
        };
      },
    };

    const result = await createDisplayScreenShareTracks(mediaDevices, {
      resolution: '720p',
      frameRate: 30,
      contentHint: 'detail',
    });
    assert.equal(result.videoTrack, videoTrack);
    assert.equal(result.audioTrack, audioTrack);
    assert.equal(videoTrack.contentHint, 'detail');

    // Falha parcial: stream retorna áudio mas vídeo já veio ended -> deve dar stop no áudio e vídeo!
    const brokenVideo = makeTrack('broken-v', 'video', 'ended');
    const leakedAudio = makeTrack('leaked-a', 'audio', 'live');
    const brokenDevices: DisplayMediaDevicesLike = {
      async getDisplayMedia() {
        return {
          getTracks: () => [brokenVideo, leakedAudio],
          getVideoTracks: () => [brokenVideo],
          getAudioTracks: () => [leakedAudio],
        };
      },
    };

    await assert.rejects(() => createDisplayScreenShareTracks(brokenDevices));
    assert.equal(leakedAudio.stopCalls, 1);

    // Falha parcial: stream sem vídeo, apenas áudio
    const orphanAudio = makeTrack('orphan-a', 'audio', 'live');
    const noVideoDevices: DisplayMediaDevicesLike = {
      async getDisplayMedia() {
        return {
          getTracks: () => [orphanAudio],
          getVideoTracks: () => [],
          getAudioTracks: () => [orphanAudio],
        };
      },
    };

    await assert.rejects(() => createDisplayScreenShareTracks(noVideoDevices));
    assert.equal(orphanAudio.stopCalls, 1);

    // AbortSignal abortado após getDisplayMedia interrompe todas as tracks capturadas
    const abortController = new AbortController();
    const abortedVideo = makeTrack('aborted-v', 'video');
    const abortedAudio = makeTrack('aborted-a', 'audio');
    const abortingDevices: DisplayMediaDevicesLike = {
      async getDisplayMedia() {
        abortController.abort();
        return {
          getTracks: () => [abortedVideo, abortedAudio],
          getVideoTracks: () => [abortedVideo],
          getAudioTracks: () => [abortedAudio],
        };
      },
    };
    await assert.rejects(() =>
      createDisplayScreenShareTracks(abortingDevices, { signal: abortController.signal }),
    );
    assert.equal(abortedVideo.stopCalls, 1);
    assert.equal(abortedAudio.stopCalls, 1);
  });
});

describe('adapters/screen-share/ScreenShareTrackPlumbing', () => {
  it('ensureKeepAliveSink cria <video data-flx="voice.screen-share-keepalive"> 2x2px e clearKeepAliveSink remove sem parar a track', () => {
    const doc = makeFakeDocument();
    const track = makeTrack('keepalive-v', 'video');

    const el = ensureKeepAliveSink(track, doc);
    assert.ok(el);
    assert.equal(el.getAttribute?.('data-flx'), 'voice.screen-share-keepalive');
    assert.equal(el.style.width, '2px');
    assert.equal(el.style.height, '2px');
    assert.equal(el.style.position, 'fixed');
    assert.equal(el.style.opacity, '0.001');
    assert.equal(el.style.visibility, 'hidden');
    assert.equal(el.style.pointerEvents, 'none');
    assert.equal(el.muted, true);
    assert.equal(el.playsInline, true);
    assert.ok(el.srcObject);
    assert.equal(doc.elements.length, 1);

    // Reutiliza o mesmo elemento ao trocar a track
    const track2 = makeTrack('keepalive-v-2', 'video');
    const el2 = ensureKeepAliveSink(track2, doc);
    assert.equal(el2, el);
    assert.equal(doc.elements.length, 1);

    const cleared = clearKeepAliveSink(doc);
    assert.equal(cleared, true);
    assert.equal(el.srcObject, null);
    assert.equal(doc.elements.length, 0);
    // Consumidor emprestado nunca encerra a track
    assert.equal(track.stopCalls, 0);
    assert.equal(track2.stopCalls, 0);
  });

  it('applyScreenContentHint aplica contentHint na track de vídeo', () => {
    const track = makeTrack('v-hint', 'video');
    assert.equal(applyScreenContentHint(track, 'text'), true);
    assert.equal(track.contentHint, 'text');
    assert.equal(applyScreenContentHint(track, 'motion'), true);
    assert.equal(track.contentHint, 'motion');
    assert.equal(applyScreenContentHint(null, 'detail'), false);
  });

  it('enforceScreenShareSenderParameters chama getParameters/setParameters com parâmetros normalizados', async () => {
    const track = makeTrack('v-sender', 'video');
    let currentParams: Record<string, unknown> = {
      transactionId: 'tx-1',
      encodings: [{ rid: 'f', maxBitrate: 1_000_000 }],
    };
    let setCalls = 0;
    const sender = {
      track,
      getParameters() {
        return currentParams;
      },
      async setParameters(next: Record<string, unknown>) {
        setCalls += 1;
        currentParams = next;
      },
    };

    const result = await enforceScreenShareSenderParameters(
      sender,
      {
        resolution: '720p',
        frameRate: 60,
        maxBitrateBps: 6_000_000,
        contentHint: 'motion',
      },
      {
        capture: { width: 1920, height: 1080, frameRate: 60 },
        scalabilityMode: 'L1T2',
      },
    );

    assert.equal(result.applied, true);
    assert.equal(setCalls, 1);
    assert.equal(track.contentHint, 'motion');
    assert.equal(currentParams.degradationPreference, 'maintain-framerate');
    const encodings = currentParams.encodings as Array<Record<string, unknown>>;
    assert.equal(encodings[0].maxBitrate, 6_000_000);
    assert.equal(encodings[0].maxFramerate, 60);
    assert.equal(encodings[0].scaleResolutionDownBy, 1.5);
    assert.equal(encodings[0].scalabilityMode, 'L1T2');
  });

  it('prioritizeScreenCodec preserva pares video/rtx adjacentes e prioriza H.264 42e0, VP9 Profile 0, VP8 e AV1', () => {
    const capabilities: ScreenCodecCapability[] = [
      { mimeType: 'video/VP8', clockRate: 90000 },
      { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=96' },
      {
        mimeType: 'video/H264',
        clockRate: 90000,
        sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f',
      },
      { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=98' },
      {
        mimeType: 'video/H264',
        clockRate: 90000,
        sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f',
      },
      { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=100' },
      {
        mimeType: 'video/H264',
        clockRate: 90000,
        sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
      },
      { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=102' },
      { mimeType: 'video/VP9', clockRate: 90000, sdpFmtpLine: 'profile-id=2' },
      { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=104' },
      { mimeType: 'video/VP9', clockRate: 90000, sdpFmtpLine: 'profile-id=0' },
      { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=106' },
      { mimeType: 'video/AV1', clockRate: 90000 },
      { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=108' },
    ];

    let appliedCodecs: ScreenCodecCapability[] = [];
    const transceiver = {
      setCodecPreferences(codecs: ScreenCodecCapability[]) {
        appliedCodecs = codecs;
      },
    };

    // H.264: 42e01f + apt=102 vem primeiro!
    assert.equal(prioritizeScreenCodec(transceiver, 'h264', { codecs: capabilities }), true);
    assert.equal(appliedCodecs.length, capabilities.length);
    assert.equal(appliedCodecs[0].sdpFmtpLine?.includes('42e01f'), true);
    assert.equal(appliedCodecs[1].mimeType, 'video/rtx');
    assert.equal(appliedCodecs[1].sdpFmtpLine, 'apt=102');
    // Verifica que nenhum video/rtx foi despareado do seu codec anterior
    for (let i = 0; i < appliedCodecs.length; i++) {
      if (appliedCodecs[i].mimeType.toLowerCase() === 'video/rtx') {
        assert.ok(i > 0);
        assert.notEqual(appliedCodecs[i - 1].mimeType.toLowerCase(), 'video/rtx');
      }
    }

    // VP9: profile-id=0 + apt=106 vem primeiro!
    assert.equal(prioritizeScreenCodec(transceiver, 'vp9', { codecs: capabilities }), true);
    assert.equal(appliedCodecs[0].mimeType, 'video/VP9');
    assert.equal(appliedCodecs[0].sdpFmtpLine, 'profile-id=0');
    assert.equal(appliedCodecs[1].sdpFmtpLine, 'apt=106');

    // VP8
    assert.equal(prioritizeScreenCodec(transceiver, 'vp8', { codecs: capabilities }), true);
    assert.equal(appliedCodecs[0].mimeType, 'video/VP8');
    assert.equal(appliedCodecs[1].sdpFmtpLine, 'apt=96');

    // AV1
    assert.equal(prioritizeScreenCodec(transceiver, 'av1', { codecs: capabilities }), true);
    assert.equal(appliedCodecs[0].mimeType, 'video/AV1');
    assert.equal(appliedCodecs[1].sdpFmtpLine, 'apt=108');

    // auto não altera preferências
    assert.equal(prioritizeScreenCodec(transceiver, 'auto', { codecs: capabilities }), false);
  });
});
