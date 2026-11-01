import type { ReplaySession, ReplaySessionOptions } from './session';
import type { ClipBufferStatus } from './buffer';
export interface NativeReplayBridge {
  replayCapability(): Promise<{ available: boolean; reason?: string }>;
  startNativeReplay(config: {
    width: number;
    height: number;
    fps: number;
    seconds: number;
    bitrate: number;
    audio: boolean;
  }): Promise<{ id: string; encoder: string; maxBytes: number }>;
  pushNativeReplay(packet: {
    id: string;
    kind: 'video' | 'audio';
    ms: number;
    data: ArrayBuffer;
  }): Promise<boolean>;
  clipNativeReplay(
    id: string,
  ): Promise<{ data: Uint8Array<ArrayBuffer>; duration: number; bytes: number }>;
  stopNativeReplay(id: string): Promise<unknown>;
  onNativeReplay(
    listener: (status: ClipBufferStatus & { id: string; error?: string }) => void,
  ): () => void;
}
export function fitNativeCapture(
  width: number,
  height: number,
  bounds: { width: number; height: number },
) {
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  return {
    width: Math.max(16, Math.floor((width * scale) / 2) * 2),
    height: Math.max(16, Math.floor((height * scale) / 2) * 2),
  };
}
/** Copies only replay-owned frames to a native hardware encoder; never captures another screen. */
export async function createNativeReplaySession(
  target: Window,
  bridge: NativeReplayBridge | undefined,
  options: ReplaySessionOptions,
  stream: MediaStream,
  releaseAudio: () => void,
): Promise<ReplaySession | null> {
  if (!bridge || typeof VideoFrame === 'undefined') {
    if (options.encoder === 'nvenc') throw Error('NVENC requer o aplicativo Windows atualizado.');
    return null;
  }
  const capability = await bridge.replayCapability();
  if (!options.isCurrent()) return null;
  if (!capability.available) {
    if (options.encoder === 'nvenc')
      throw Error(capability.reason || 'NVENC indisponível. Use Compatível.');
    return null;
  }
  const video = target.document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  let context: AudioContext | undefined,
    node: AudioWorkletNode | undefined,
    audioInput: MediaStreamAudioSourceNode | undefined,
    silence: GainNode | undefined;
  let job: Awaited<ReturnType<NativeReplayBridge['startNativeReplay']>> | undefined;
  let stopped = false,
    started = false,
    timer: number | undefined,
    status: ClipBufferStatus | null = null,
    startedAt = 0,
    audioBase = 0,
    videoBusy = false,
    audioBusy = false,
    unsubscribe = () => {};
  const pending = new Set<string>();
  function cleanup() {
    if (timer !== undefined) target.clearTimeout(timer);
    video.pause();
    video.srcObject = null;
    audioInput?.disconnect();
    node?.disconnect();
    silence?.disconnect();
    node?.port.close();
    void context?.close().catch(() => {});
    unsubscribe();
  }
  try {
    await video.play();
    if (!options.isCurrent()) {
      cleanup();
      return null;
    }
    const settings = stream.getVideoTracks()[0].getSettings(),
      { width, height } = fitNativeCapture(
        video.videoWidth || settings.width || options.quality.width,
        video.videoHeight || settings.height || options.quality.height,
        options.quality,
      ),
      fps = options.fps,
      hasAudio = stream.getAudioTracks().length > 0;
    const canvas = target.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const drawing = canvas.getContext('2d', { alpha: false });
    if (!drawing) throw Error('Não foi possível preparar a imagem dos clipes.');
    if (hasAudio) {
      context = new AudioContext({ sampleRate: 48000 });
      await context.suspend();
      await context.audioWorklet.addModule('/clips-pcm-worklet.js');
      audioInput = context.createMediaStreamSource(stream);
      node = new AudioWorkletNode(context, 'mn-clip-pcm', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      silence = context.createGain();
      silence.gain.value = 0;
      audioInput.connect(node);
      node.connect(silence).connect(context.destination);
    }
    if (!options.isCurrent()) {
      cleanup();
      return null;
    }
    job = await bridge.startNativeReplay({
      width,
      height,
      fps,
      seconds: options.seconds,
      bitrate: Math.round(options.quality.bitrate * (fps > 30 ? 1.5 : 1)),
      audio: hasAudio,
    });
    if (!options.isCurrent()) {
      await bridge.stopNativeReplay(job.id);
      cleanup();
      return null;
    }
    function failed(error: unknown) {
      if (stopped) return;
      session.stop();
      options.onError(error instanceof Error ? error.message : 'Falha no codificador nativo.');
    }
    unsubscribe = bridge.onNativeReplay((update) => {
      if (stopped || update.id !== job?.id) return;
      if (update.error) {
        failed(Error(update.error));
        return;
      }
      status = { ready: update.ready, seconds: update.seconds, bytes: update.bytes };
      options.onStatus();
    });
    if (node)
      node.port.onmessage = (event) => {
        const packet = event.data;
        if (!job || !started || stopped || audioBusy || !(packet?.data instanceof ArrayBuffer)) {
          node?.port.postMessage('ack');
          return;
        }
        audioBusy = true;
        void bridge
          .pushNativeReplay({
            id: job.id,
            kind: 'audio',
            ms: Math.max(0, (packet.time - audioBase) * 1000),
            data: packet.data,
          })
          .catch(failed)
          .finally(() => {
            audioBusy = false;
            node?.port.postMessage('ack');
          });
      };
    async function pump() {
      if (stopped || !job) return;
      timer = target.setTimeout(() => void pump(), 1000 / fps);
      if (videoBusy || video.readyState < 2) return;
      videoBusy = true;
      let frame: VideoFrame | undefined;
      try {
        const source = video.videoWidth === width && video.videoHeight === height ? video : canvas;
        if (source === canvas) drawing!.drawImage(video, 0, 0, width, height);
        frame = new VideoFrame(source, {
          timestamp: Math.round((performance.now() - startedAt) * 1000),
        });
        const data = new ArrayBuffer(width * height * 4);
        await frame.copyTo(data, { format: 'BGRA', layout: [{ offset: 0, stride: width * 4 }] });
        frame.close();
        frame = undefined;
        if (!stopped && job)
          await bridge!.pushNativeReplay({
            id: job.id,
            kind: 'video',
            ms: Math.max(0, performance.now() - startedAt),
            data,
          });
      } catch (error) {
        failed(error);
      } finally {
        frame?.close();
        videoBusy = false;
      }
    }
    const ended = () => {
      session.stop();
      options.onEnded();
    };
    const session: ReplaySession = {
      stream,
      source: options.source,
      owner: options.owner,
      quality: width + '×' + height,
      fps,
      maxBytes: job.maxBytes,
      hasAudio,
      extension: 'mp4',
      get encoder() {
        return job!.encoder + (status?.ready ? ' ativo (H.264)' : ' · iniciando');
      },
      get status() {
        return status;
      },
      get stopping() {
        return stopped;
      },
      get pendingCount() {
        return pending.size;
      },
      start() {
        if (started || stopped) return;
        started = true;
        startedAt = performance.now();
        audioBase = context?.currentTime ?? 0;
        stream.getVideoTracks()[0].addEventListener('ended', ended);
        void context?.resume().catch(failed);
        void pump();
      },
      requestClip(id) {
        if (!status?.ready || stopped) throw Error('Aguarde a captura ficar pronta.');
        if (pending.size >= 2 || pending.has(id)) throw Error('Aguarde os clipes em preparação.');
        pending.add(id);
        void bridge!
          .clipNativeReplay(job!.id)
          .then((result) =>
            options.onClip(session, {
              id,
              blob: new Blob([new Uint8Array(result.data)], { type: 'video/mp4' }),
              duration: result.duration,
              bytes: result.bytes,
            }),
          )
          .catch((error) =>
            options.onError(error instanceof Error ? error.message : 'Falha ao guardar o clipe.'),
          )
          .finally(() => pending.delete(id));
      },
      stop() {
        if (stopped) return;
        stopped = true;
        stream.getVideoTracks()[0].removeEventListener('ended', ended);
        cleanup();
        stream.getTracks().forEach((track) => track.stop());
        releaseAudio();
        void bridge!.stopNativeReplay(job!.id).catch(() => {});
      },
    };
    return session;
  } catch (error) {
    cleanup();
    if (job) void bridge.stopNativeReplay(job.id).catch(() => {});
    throw error;
  }
}
