import type { ClipBufferStatus, ClipSnapshot } from './buffer';
import type { ClipWorkerReply } from './worker-runtime';

export interface ReplayQuality {
  width: number;
  height: number;
  bitrate: number;
  label: string;
}
export interface ReplaySessionOptions {
  source: MediaStream;
  owner: string;
  quality: ReplayQuality;
  fps: number;
  seconds: number;
  isCurrent(): boolean;
  onStatus(): void;
  onClip(session: ReplaySession, clip: ClipSnapshot & { id: string }): Promise<void>;
  onError(message: string): void;
  onEnded(): void;
}
export type ReplayRecorderOptions = MediaRecorderOptions & {
  videoKeyFrameIntervalDuration?: number;
};
export interface ReplayEnvironment {
  createStream(tracks: MediaStreamTrack[]): MediaStream;
  createRecorder(stream: MediaStream, options: ReplayRecorderOptions): MediaRecorder;
  isTypeSupported(mime: string): boolean;
  createWorker(): Worker;
}
export interface ReplaySession {
  readonly stream: MediaStream;
  readonly source: MediaStream;
  readonly owner: string;
  readonly quality: string;
  readonly fps: number;
  readonly maxBytes: number;
  readonly hasAudio: boolean;
  readonly status: ClipBufferStatus | null;
  readonly stopping: boolean;
  readonly pendingCount: number;
  start(): void;
  requestClip(id: string): void;
  stop(): void;
}
/** Owns only replay clones, the recorder and its worker. Never stops or constrains the source. */
export async function createReplaySession(
  options: ReplaySessionOptions,
  environment: ReplayEnvironment,
): Promise<ReplaySession | null> {
  const { source, quality, owner } = options;
  const stream = environment.createStream(
    source
      .getTracks()
      .filter((track) => track.readyState === 'live')
      .map((track) => track.clone()),
  );
  let worker: Worker | undefined;
  try {
    const video = stream.getVideoTracks()[0];
    if (!video) throw Error('A tela compartilhada não está mais disponível.');
    const actualSource = source.getVideoTracks()[0].getSettings(),
      width = Math.min(quality.width, actualSource.width || quality.width),
      height = Math.min(quality.height, actualSource.height || quality.height),
      fps = Math.min(options.fps, actualSource.frameRate || options.fps);
    try {
      await video.applyConstraints({
        width: { ideal: width, max: width },
        height: { ideal: height, max: height },
        frameRate: { ideal: fps, max: fps },
      });
    } catch {}
    if (!options.isCurrent()) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'].find(
      (value) => environment.isTypeSupported(value),
    );
    if (!mime) throw Error('Replay WebM indisponível. Use Chrome ou Edge atualizado.');
    const actual = video.getSettings(),
      bitrate = Math.round(quality.bitrate * (fps > 30 ? 1.5 : 1)),
      maxBytes = Math.min(
        256 * 1048576,
        Math.max(64 * 1048576, Math.ceil((bitrate / 8) * (options.seconds + 4) * 1.15)),
      ),
      recorderOptions = { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 };
    let recorder: MediaRecorder;
    try {
      recorder = environment.createRecorder(stream, {
        ...recorderOptions,
        videoKeyFrameIntervalDuration: 2000,
      });
    } catch {
      recorder = environment.createRecorder(stream, recorderOptions);
    }
    worker = environment.createWorker();
    return ownSession(options, stream, recorder, worker, {
      quality: actual.width && actual.height ? actual.width + '×' + actual.height : quality.label,
      fps: Math.round(actual.frameRate || fps),
      maxBytes,
      owner,
    });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    worker?.terminate();
    throw error;
  }
}

function ownSession(
  options: ReplaySessionOptions,
  stream: MediaStream,
  recorder: MediaRecorder,
  worker: Worker,
  metadata: Pick<ReplaySession, 'quality' | 'fps' | 'maxBytes' | 'owner'>,
): ReplaySession {
  let status: ClipBufferStatus | null = null,
    stopping = false,
    started = false,
    closed = false,
    terminated = false,
    reads = Promise.resolve();
  const waiters = new Set<string>(),
    flushing: string[] = [],
    video = stream.getVideoTracks()[0];
  const dispose = () => {
    if (!closed || waiters.size || terminated) return;
    terminated = true;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  };
  const failed = (message: string) => {
    waiters.clear();
    flushing.length = 0;
    session.stop();
    dispose();
    options.onError(message);
  };
  const ended = () => {
    session.stop();
    options.onEnded();
  };
  const session: ReplaySession = {
    ...metadata,
    stream,
    source: options.source,
    hasAudio: stream.getAudioTracks().length > 0,
    get status() {
      return status;
    },
    get stopping() {
      return stopping;
    },
    get pendingCount() {
      return waiters.size;
    },
    start() {
      if (started || stopping) return;
      started = true;
      try {
        worker.postMessage({
          type: 'init',
          seconds: options.seconds,
          fps: metadata.fps,
          maxBytes: metadata.maxBytes,
        });
        recorder.start(1000);
      } catch (error) {
        session.stop();
        throw error;
      }
    },
    requestClip(id) {
      if (!started || stopping || !status?.ready) throw Error('A captura não está disponível.');
      if (waiters.size >= 4)
        throw Error('Aguarde os clipes em preparação antes de clipar novamente.');
      if (!id || waiters.has(id)) throw Error('Identificador de clipe inválido.');
      waiters.add(id);
      flushing.push(id);
      try {
        recorder.requestData();
      } catch (error) {
        flushing.splice(flushing.indexOf(id), 1);
        waiters.delete(id);
        throw error;
      }
    },
    stop() {
      if (stopping) return;
      stopping = true;
      video.removeEventListener('ended', ended);
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        else closed = true;
      } catch {
        closed = true;
      }
      stream.getTracks().forEach((track) => track.stop());
      dispose();
    },
  };
  worker.onmessage = (event: MessageEvent<ClipWorkerReply>) => {
    const reply = event.data;
    if (reply.type === 'status') {
      status = reply;
      options.onStatus();
    } else if (reply.type === 'clip' && waiters.has(reply.id)) {
      // Keep the worker alive through persistence, even after stopping capture.
      void Promise.resolve()
        .then(() => options.onClip(session, reply))
        .catch(() => {
          options.onError('Falha ao guardar o replay. Os clipes anteriores continuam armazenados.');
        })
        .finally(() => {
          waiters.delete(reply.id);
          dispose();
        });
    } else if (reply.type === 'error') {
      if (reply.id) {
        waiters.delete(reply.id);
        dispose();
        options.onError(reply.message);
      } else failed(reply.message);
    }
  };
  worker.onerror = () => {
    failed('Falha no replay local. Sua chamada e os clipes já armazenados continuam.');
    closed = true;
    dispose();
  };
  recorder.ondataavailable = (event) => {
    reads = reads
      .then(async () => {
        if (terminated) return;
        if (event.data.size) {
          const data = await event.data.arrayBuffer();
          if (terminated) return;
          worker.postMessage({ type: 'chunk', data }, [data]);
        }
        for (const id of flushing.splice(0)) worker.postMessage({ type: 'clip', id });
      })
      .catch(() =>
        failed('Falha ao preparar o replay. Os clipes anteriores continuam armazenados.'),
      );
  };
  recorder.onstop = () => {
    void reads.finally(() => {
      closed = true;
      dispose();
    });
  };
  recorder.onerror = () => failed('O navegador interrompeu o replay. Sua transmissão continua.');
  video.addEventListener('ended', ended, { once: true });
  return session;
}
