import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceEngineRuntime } from '../../packages/voice-engine/src/runtime/VoiceEngineRuntime.ts';
import { VoiceEngineController } from '../../packages/voice-engine/src/runtime/VoiceEngineController.ts';
import type {
  CloudflareSfuMediaPort,
  GatewayPort,
  SubscriptionPort,
  VoiceEngineHostPorts,
} from '../../packages/voice-engine/src/ports/index.ts';
import type { VoiceEngineEvent } from '../../packages/voice-engine/src/protocol/events.ts';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFakePorts(
  overrides: {
    media?: Partial<CloudflareSfuMediaPort>;
    subscriptions?: Partial<SubscriptionPort>;
    gateway?: Partial<GatewayPort>;
  } = {},
): {
  ports: VoiceEngineHostPorts;
  calls: string[];
  emittedEvents: VoiceEngineEvent[];
} {
  const calls: string[] = [];
  const emittedEvents: VoiceEngineEvent[] = [];

  const media: CloudflareSfuMediaPort = {
    async connect(params) {
      calls.push(`connect:${params.roomId}:${params.participantId}`);
      return { publisherSessionId: 'pub-1', subscriberSessionId: 'sub-1' };
    },
    async disconnect(params) {
      calls.push(`disconnect:${params.roomId ?? 'none'}`);
    },
    async startMicrophone() {
      calls.push('startMicrophone');
      return { trackId: 'mic-track-1', mid: '0' };
    },
    setMicrophoneMuted(muted) {
      calls.push(`setMicrophoneMuted:${String(muted)}`);
    },
    async stopMicrophone() {
      calls.push('stopMicrophone');
    },
    async startCamera() {
      calls.push('startCamera');
      return { trackId: 'cam-track-1', mid: '1' };
    },
    async stopCamera() {
      calls.push('stopCamera');
    },
    async startScreenShare(params) {
      calls.push(`startScreenShare:${params.captureId}`);
      return { trackId: `scr-track-${params.captureId}`, mid: '2' };
    },
    async updateScreenEncoding(params) {
      calls.push(`updateScreenEncoding:${params.captureId}`);
    },
    async republishScreenShare(params) {
      calls.push(`republishScreenShare:${params.captureId}`);
      return { trackId: `scr-repub-${params.captureId}`, mid: '3' };
    },
    async stopScreenShare(params) {
      calls.push(`stopScreenShare:${params.captureId ?? 'none'}`);
    },
    async startScreenAudio(params) {
      calls.push(`startScreenAudio:${params.captureId}`);
      return { trackId: `sa-track-${params.captureId}`, mid: '4' };
    },
    async stopScreenAudio(params) {
      calls.push(`stopScreenAudio:${params.captureId ?? 'none'}`);
    },
    ...overrides.media,
  };

  const subscriptions: SubscriptionPort = {
    async subscribeTrack(params) {
      calls.push(`subscribe:${params.participantId}:${params.kind}`);
    },
    async unsubscribeTrack(params) {
      calls.push(`unsubscribe:${params.participantId}:${params.kind}`);
    },
    ...overrides.subscriptions,
  };

  const gateway: GatewayPort = {
    notifyEvent(event) {
      emittedEvents.push(event);
    },
    ...overrides.gateway,
  };

  return {
    ports: { media, subscriptions, gateway },
    calls,
    emittedEvents,
  };
}

describe('@trono/voice-engine — VoiceEngineRuntime & VoiceEngineController', () => {
  it('executa fluxo completo de conexão, mídia e assinaturas via VoiceEngineController', async () => {
    const { ports, calls, emittedEvents } = createFakePorts();
    const controller = new VoiceEngineController(ports);
    const seenEvents: string[] = [];
    const unsubscribe = controller.subscribe((_snap, ev) => {
      seenEvents.push(ev.type);
    });

    await controller.connect({ roomId: 'sala-1', participantId: 'p-1', quality: 'high' });
    assert.equal(controller.getSnapshot().connection.status, 'connected');

    await controller.startMicrophone({ echoCancellation: true });
    assert.equal(controller.getSnapshot().microphone.status, 'published');

    await controller.setMicrophoneMuted(true);
    assert.equal(controller.getSnapshot().microphone.muted, true);

    await controller.startCamera({ width: 1280, height: 720, frameRate: 30 });
    assert.equal(controller.getSnapshot().camera.status, 'published');

    await controller.startScreenShare({ width: 1920, height: 1080, frameRate: 30, codec: 'h264' });
    const captureId = controller.getSnapshot().screen.captureId;
    assert.ok(captureId);
    assert.equal(controller.getSnapshot().screen.status, 'published');

    await controller.startScreenAudio();
    assert.equal(controller.getSnapshot().screenAudio.status, 'published');

    await controller.updateScreenEncoding({ frameRate: 60 });
    assert.equal(controller.getSnapshot().screen.options?.frameRate, 60);
    assert.ok(calls.includes(`updateScreenEncoding:${captureId}`));

    await controller.updateScreenEncoding({ codec: 'vp9' });
    assert.equal(controller.getSnapshot().screen.options?.codec, 'vp9');
    assert.ok(calls.includes(`republishScreenShare:${captureId}`));

    await controller.setRemoteTrackSubscription({
      participantId: 'p-2',
      kind: 'screen',
      subscribed: true,
      preferredRid: 'f',
    });
    assert.equal(controller.getSnapshot().subscriptions['p-2:screen']?.status, 'subscribed');

    await controller.stopScreenAudio();
    await controller.stopScreenShare();
    await controller.stopCamera();
    await controller.stopMicrophone();
    await controller.disconnect();

    assert.equal(controller.getSnapshot().connection.status, 'disconnected');
    assert.ok(seenEvents.includes('connection/connectSucceeded'));
    assert.ok(seenEvents.includes('screen/republishSucceeded'));
    assert.ok(emittedEvents.some((e) => e.type === 'subscription/subscribeSucceeded'));

    unsubscribe();
  });

  it('serializa comandos por resourceKey sem bloquear recursos independentes', async () => {
    const firstMic = deferred<{ trackId: string; mid: string | null }>();
    const camGate = deferred<{ trackId: string; mid: string | null }>();
    const timeline: string[] = [];

    const { ports } = createFakePorts({
      media: {
        async startMicrophone({ signal }) {
          timeline.push('mic-start:begin');
          assert.ok(signal);
          const result = await firstMic.promise;
          timeline.push('mic-start:end');
          return result;
        },
        async stopMicrophone() {
          timeline.push('mic-stop:begin');
          timeline.push('mic-stop:end');
        },
        async startCamera() {
          timeline.push('cam-start:begin');
          const result = await camGate.promise;
          timeline.push('cam-start:end');
          return result;
        },
      },
    });

    const runtime = new VoiceEngineRuntime(ports);
    const controller = new VoiceEngineController(runtime);
    await controller.connect({ roomId: 'sala-2', participantId: 'p-1' });

    const pMicStart = controller.startMicrophone();
    const pMicStop = controller.stopMicrophone();
    const pCamStart = controller.startCamera();

    // Antes de resolver microfone, câmera já deve ter iniciado (resourceKey distinto)
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(timeline.includes('mic-start:begin'));
    assert.ok(timeline.includes('cam-start:begin'));
    assert.equal(timeline.includes('mic-stop:begin'), false);

    camGate.resolve({ trackId: 'cam-1', mid: '1' });
    await pCamStart;
    assert.equal(controller.getSnapshot().camera.status, 'published');

    // Libera startMicrophone — stopMicrophone só executa depois e start obsoleto é descartado
    firstMic.resolve({ trackId: 'mic-1', mid: '0' });
    await Promise.all([pMicStart, pMicStop]);

    assert.deepEqual(
      timeline.filter((item) => item.startsWith('mic-')),
      ['mic-start:begin', 'mic-start:end', 'mic-stop:begin', 'mic-stop:end'],
    );
    assert.equal(controller.getSnapshot().microphone.status, 'stopped');
    assert.equal(runtime.getCancelledOperationIds().size, 1);
  });

  it('cancela operações pendentes ao desconectar e ignora conclusões tardias', async () => {
    const camGate = deferred<{ trackId: string; mid: string | null }>();
    let aborted = false;

    const { ports, emittedEvents } = createFakePorts({
      media: {
        async startCamera({ signal }) {
          signal?.addEventListener('abort', () => {
            aborted = true;
          });
          return camGate.promise;
        },
      },
    });

    const runtime = new VoiceEngineRuntime(ports);
    const controller = new VoiceEngineController(runtime);
    await controller.connect({ roomId: 'sala-3', participantId: 'p-1' });

    const pCam = controller.startCamera();
    await Promise.resolve();

    const pDisc = controller.disconnect();
    await pDisc;

    assert.equal(aborted, true);
    assert.equal(controller.getSnapshot().connection.status, 'disconnected');

    camGate.resolve({ trackId: 'cam-late', mid: '9' });
    await pCam;

    assert.equal(controller.getSnapshot().camera.status, 'stopped');
    assert.equal(
      emittedEvents.some((ev) => ev.type === 'camera/startSucceeded'),
      false,
    );
  });

  it('emite eventos *Failed em erro de porta sem travar fila do recurso', async () => {
    let failFirst = true;
    const { ports, emittedEvents } = createFakePorts({
      media: {
        async startMicrophone() {
          if (failFirst) {
            failFirst = false;
            throw new Error('Permissão negada');
          }
          return { trackId: 'mic-ok', mid: '0' };
        },
      },
    });

    const controller = new VoiceEngineController(ports);
    await controller.connect({ roomId: 'sala-4', participantId: 'p-1' });

    await controller.startMicrophone();
    assert.equal(controller.getSnapshot().microphone.status, 'stopped');
    assert.equal(controller.getSnapshot().microphone.lastError, 'Permissão negada');
    assert.ok(emittedEvents.some((e) => e.type === 'microphone/startFailed'));

    // Fila do microfone continua saudável na tentativa seguinte
    await controller.startMicrophone();
    assert.equal(controller.getSnapshot().microphone.status, 'published');
    assert.equal(controller.getSnapshot().microphone.lastError, null);
  });
});
