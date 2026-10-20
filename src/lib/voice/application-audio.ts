import type { ApplicationAudioInfo, ApplicationAudioPipe } from '../../types/application-audio';

interface Options {
  subscribe(listener: (value: unknown) => void): (() => void) | void;
  ack(id: string): void;
  stop(id: string): Promise<unknown>;
  createContext(sampleRate: number): AudioContext;
  loadModule(context: AudioContext): Promise<void>;
  createNode(context: AudioContext): AudioWorkletNode;
  ended(): void;
  warn?(error: unknown): void;
}
interface Resource {
  readonly info: ApplicationAudioInfo;
  readonly controller: AbortController;
  readonly ready: Promise<ApplicationAudioPipe>;
  context?: AudioContext;
  node?: AudioWorkletNode;
  stopTrack?(): void;
  removeProcessorListener?(): void;
  closed: boolean;
  closing?: Promise<void>;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function readInfo(value: unknown): ApplicationAudioInfo {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 128 ||
    typeof value.sampleRate !== 'number' ||
    !Number.isInteger(value.sampleRate) ||
    value.sampleRate < 8000 ||
    value.sampleRate > 192000 ||
    (value.channels !== undefined && value.channels !== 2)
  )
    throw new Error('Captura de áudio por aplicativo inválida.');
  return Object.freeze({ id: value.id, sampleRate: value.sampleRate, channels: 2 });
}
/** Native packets contain little-endian signed 16-bit interleaved stereo. */
export function decodeApplicationAudio(value: unknown): Float32Array | null {
  const bytes =
    value instanceof Uint8Array
      ? value
      : value instanceof ArrayBuffer && value.byteLength
        ? new Uint8Array(value)
        : null;
  if (!bytes || !bytes.byteLength || bytes.byteLength > 1024 * 1024 || bytes.byteLength % 4)
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    audio = new Float32Array(bytes.byteLength / 2);
  for (let index = 0; index < audio.length; index++)
    audio[index] = view.getInt16(index * 2, true) / 32768;
  return audio;
}
function wait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const remove = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      remove();
      reject(new DOMException('Captura de áudio encerrada.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    work.then(
      (value) => {
        remove();
        resolve(value);
      },
      (error: unknown) => {
        remove();
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}

/** Owns only native application-audio graphs/jobs, never the call microphone or video. */
export function createApplicationAudio(options: Options) {
  const resources = new Map<string, Resource>();
  let disposed = false,
    disposal: Promise<void> | undefined;
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      options.warn?.(error);
    }
  };
  function close(resource: Resource): Promise<void> {
    if (resource.closed) return resource.closing ?? Promise.resolve();
    resource.closed = true;
    resource.controller.abort();
    if (resources.get(resource.info.id) === resource) resources.delete(resource.info.id);
    attempt(() => resource.removeProcessorListener?.());
    attempt(() => resource.node?.disconnect());
    attempt(() => resource.node?.port.close());
    attempt(() => resource.stopTrack?.());
    const pending: Promise<unknown>[] = [];
    attempt(() => {
      if (resource.context) pending.push(resource.context.close());
    });
    // Do not keep the C++ producer alive while a context waits for the audio device.
    attempt(() => {
      pending.push(options.stop(resource.info.id));
    });
    resource.closing = Promise.allSettled(pending).then(() => undefined);
    return resource.closing;
  }
  function ended(resource: Resource) {
    if (resource.closed) return;
    void close(resource);
    attempt(options.ended);
  }
  async function prepare(resource: Resource): Promise<ApplicationAudioPipe> {
    const signal = resource.controller.signal;
    try {
      signal.throwIfAborted();
      const context = options.createContext(resource.info.sampleRate);
      resource.context = context;
      await wait(options.loadModule(context), signal);
      signal.throwIfAborted();
      const node = options.createNode(context);
      resource.node = node;
      const failed = () => ended(resource);
      node.addEventListener('processorerror', failed);
      resource.removeProcessorListener = () => node.removeEventListener('processorerror', failed);
      const destination = context.createMediaStreamDestination();
      node.connect(destination);
      const track = destination.stream.getAudioTracks()[0];
      if (!track) throw new Error('A captura de áudio não produziu uma trilha.');
      const originalStop = track.stop.bind(track);
      let trackStopped = false;
      resource.stopTrack = () => {
        if (trackStopped) return;
        trackStopped = true;
        originalStop();
      };
      track.stop = () => {
        try {
          resource.stopTrack?.();
        } finally {
          void close(resource);
        }
      };
      await wait(context.resume(), signal);
      signal.throwIfAborted();
      return Object.freeze({ track, close: () => close(resource) });
    } catch (error) {
      void close(resource);
      throw error;
    }
  }
  const release = options.subscribe((value) => {
    if (disposed || !object(value) || typeof value.id !== 'string' || !value.id) return;
    const id = value.id,
      resource = resources.get(id);
    if (value.type === 'ended' && resource) ended(resource);
    else if (value.type === 'chunk') {
      try {
        if (resource?.node && !resource.closed) {
          const audio = decodeApplicationAudio(value.bytes);
          if (audio) resource.node.port.postMessage(audio, [audio.buffer]);
        }
      } catch (error) {
        if (resource) ended(resource);
        options.warn?.(error);
      } finally {
        attempt(() => options.ack(id));
      }
    }
  });
  return {
    create(value: unknown): Promise<ApplicationAudioPipe> {
      if (disposed)
        return Promise.reject(new DOMException('Captura de áudio encerrada.', 'AbortError'));
      let info: ApplicationAudioInfo;
      try {
        info = readInfo(value);
      } catch (error) {
        return Promise.reject(error);
      }
      const previous = resources.get(info.id);
      if (previous) {
        if (previous.info.sampleRate !== info.sampleRate)
          return Promise.reject(new Error('A captura de áudio mudou de formato.'));
        return previous.ready;
      }
      let resource: Resource;
      const ready = Promise.resolve().then(() => prepare(resource));
      resource = { info, ready, controller: new AbortController(), closed: false };
      resources.set(info.id, resource);
      return ready;
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true;
      attempt(() => release?.());
      disposal = Promise.allSettled([...resources.values()].map(close)).then(() => undefined);
      return disposal;
    },
  };
}
