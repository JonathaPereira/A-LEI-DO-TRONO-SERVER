import type {
  DesktopCaptureNative,
  DesktopCaptureRequest,
  DesktopCaptureSelection,
  DesktopCaptureSnapshot,
} from '../../types/desktop-capture';
import type { ApplicationAudioInfo, ApplicationAudioPipe } from '../../types/application-audio';

interface Options {
  native: DesktopCaptureNative;
  getDisplayMedia(options?: DisplayMediaStreamOptions): Promise<MediaStream>;
  createAudio(info: ApplicationAudioInfo): Promise<ApplicationAudioPipe>;
  cancelAudio(id: string): boolean;
  warn?(error: unknown): void;
}
interface Operation {
  requestId: string | null;
  selection: Promise<DesktopCaptureSelection> | null;
  result: DesktopCaptureSelection | null;
  stream?: MediaStream;
  pipe?: ApplicationAudioPipe;
  nativeAudioId: string | null;
  preparingAudio: boolean;
  audioReleased: boolean;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function readSources(list: unknown, requireThumbnail: boolean) {
  if (!Array.isArray(list)) return null;
  const sources = [],
    ids = new Set<string>();
  for (const source of list) {
    if (
      !object(source) ||
      typeof source.id !== 'string' ||
      !source.id ||
      ids.has(source.id) ||
      typeof source.name !== 'string' ||
      (requireThumbnail
        ? typeof source.thumbnail !== 'string'
        : source.thumbnail !== undefined && typeof source.thumbnail !== 'string')
    )
      return null;
    ids.add(source.id);
    const thumbnail =
      typeof source.thumbnail === 'string' &&
      /^data:image\/(png|jpeg|webp);base64,/.test(source.thumbnail)
        ? source.thumbnail
        : '';
    sources.push(Object.freeze({ id: source.id, name: source.name, thumbnail }));
  }
  return Object.freeze(sources);
}
function readRequest(value: unknown): DesktopCaptureRequest | null {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.audio !== 'boolean' ||
    typeof value.windows !== 'boolean' ||
    (value.remote !== undefined && typeof value.remote !== 'boolean') ||
    typeof value.applicationAudio !== 'boolean'
  )
    return null;
  const sources = readSources(value.sources, true);
  if (!sources) return null;
  const audioSources =
    value.audioSources === undefined ? sources : readSources(value.audioSources, false);
  if (!audioSources) return null;
  return Object.freeze({
    id: value.id,
    audio: value.audio,
    windows: value.windows,
    remote: value.remote === true,
    applicationAudio: value.applicationAudio,
    sources,
    audioSources,
  });
}
function readSelection(value: unknown): DesktopCaptureSelection {
  if (value === false) return { selected: false };
  if (!object(value) || typeof value.selected !== 'boolean')
    throw new Error('Resposta de captura inválida.');
  if (value.error !== undefined && typeof value.error !== 'string')
    throw new Error('Resposta de captura inválida.');
  let audio: ApplicationAudioInfo | undefined;
  if (value.audio != null) {
    const info = value.audio;
    if (
      !object(info) ||
      typeof info.id !== 'string' ||
      !info.id ||
      typeof info.sampleRate !== 'number' ||
      !Number.isInteger(info.sampleRate) ||
      info.sampleRate < 8000 ||
      info.sampleRate > 192000 ||
      info.channels !== 2
    )
      throw new Error('Resposta de áudio inválida.');
    audio = Object.freeze({ id: info.id, sampleRate: info.sampleRate, channels: 2 });
  }
  return Object.freeze({
    selected: value.selected,
    ...(audio ? { audio } : {}),
    ...(value.error ? { error: value.error as string } : {}),
  });
}
const initial: DesktopCaptureSnapshot = Object.freeze({
  request: null,
  source: null,
  audioMode: 'none',
  audioSource: '',
  message: '',
});
const aborted = () => new DOMException('Captura encerrada.', 'AbortError');

/** Owns the picker and preparations. Successful display streams transfer to the calling media owner. */
export function createDesktopCapture(options: Options) {
  let state = initial,
    operation: Operation | null = null,
    disposed = false;
  const listeners = new Set<() => void>(),
    bindings = new Set<() => void>(),
    stopped = new WeakSet<MediaStreamTrack>();
  function update(patch: Partial<DesktopCaptureSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((listener) => listener());
  }
  function attempt(action: () => void) {
    try {
      action();
    } catch (error) {
      options.warn?.(error);
    }
  }
  function releaseTracks(stream: MediaStream | undefined) {
    for (const track of stream?.getTracks() ?? []) {
      if (stopped.has(track)) continue;
      stopped.add(track);
      attempt(() => track.stop());
    }
  }
  async function releaseAudio(active: Operation): Promise<void> {
    const id = active.nativeAudioId;
    if (!id || active.audioReleased) return;
    active.audioReleased = true;
    try {
      if (active.pipe) {
        void active.pipe.close().catch((error) => options.warn?.(error));
        return;
      }
      if (active.preparingAudio && options.cancelAudio(id)) return;
      await options.native.stopApplicationAudio(id);
    } catch (error) {
      options.warn?.(error);
    }
  }
  function bind(video: MediaStreamTrack, pipe: ApplicationAudioPipe) {
    const originalStop = video.stop;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      video.removeEventListener('ended', release);
      bindings.delete(release);
      if (video.stop === stop) video.stop = originalStop;
      void pipe.close().catch((error) => options.warn?.(error));
    };
    const stop = () => {
      try {
        originalStop.call(video);
      } finally {
        release();
      }
    };
    video.stop = stop;
    video.addEventListener('ended', release, { once: true });
    bindings.add(release);
  }
  function choose(source: string | null): boolean {
    const current = state.request,
      active = operation;
    if (disposed || !current || !active) return false;
    if (source && !current.sources.some((item) => item.id === source)) return false;
    if (
      source &&
      state.audioMode === 'application' &&
      !source.startsWith('window:') &&
      !state.audioSource
    ) {
      update({ message: 'Escolha o aplicativo para o áudio desta tela ou selecione Sem áudio.' });
      return false;
    }
    const choice = {
      id: current.id,
      source,
      audioMode: current.audio ? state.audioMode : ('none' as const),
      audioSource: state.audioSource,
    };
    update({ request: null, source: null, message: '' });
    active.selection = Promise.resolve()
      .then(() => options.native.selectCapture(choice))
      .then((value) => {
        if (object(value) && object(value.audio) && typeof value.audio.id === 'string')
          active.nativeAudioId = value.audio.id;
        const result = readSelection(value);
        active.result = result;
        return result;
      })
      .finally(() => {
        if (disposed) void releaseAudio(active);
      });
    // A native rejection can arrive before getDisplayMedia settles.
    void active.selection.catch(() => {});
    return true;
  }
  const releaseRequest = options.native.onCapture((value) => {
    const request = readRequest(value),
      active = operation;
    if (disposed) return;
    if (!request || !active || (active.requestId && active.requestId !== request.id)) {
      if (object(value) && typeof value.id === 'string')
        void Promise.resolve()
          .then(() =>
            options.native.selectCapture({
              id: value.id as string,
              source: null,
              audioMode: 'none',
              audioSource: '',
            }),
          )
          .catch((error) => options.warn?.(error));
      return;
    }
    if (active.requestId === request.id) return;
    active.requestId = request.id;
    update({
      request,
      source: null,
      audioMode: request.audio && request.applicationAudio ? 'application' : 'none',
      audioSource: '',
      message: '',
    });
  });
  const releaseCancel = options.native.onCaptureCancel((value) => {
    if (object(value) && state.request?.id === value.id)
      update({ request: null, source: null, message: '' });
  });
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    selectSource(id: string) {
      if (state.request?.sources.some((source) => source.id === id))
        update({ source: id, message: '' });
    },
    setAudioMode(mode: string) {
      const request = state.request;
      if (
        !request?.audio ||
        (mode !== 'none' && mode !== 'application' && mode !== 'system') ||
        (mode === 'application' && !request.applicationAudio) ||
        (mode === 'system' && (!request.windows || request.remote))
      )
        return;
      update({ audioMode: mode, message: '' });
    },
    setAudioSource(id: string) {
      if (
        !id ||
        (state.request?.audioSources ?? state.request?.sources)?.some(
          (source) => source.id === id && source.id.startsWith('window:'),
        )
      )
        update({ audioSource: id, message: '' });
    },
    confirm() {
      return !!state.source && choose(state.source);
    },
    cancel() {
      return choose(null);
    },
    async capture(settings?: DisplayMediaStreamOptions): Promise<MediaStream> {
      if (disposed) throw aborted();
      if (operation)
        throw new DOMException(
          'Já existe uma escolha de captura em andamento.',
          'InvalidStateError',
        );
      const active: Operation = {
        requestId: null,
        selection: null,
        result: null,
        nativeAudioId: null,
        preparingAudio: false,
        audioReleased: false,
      };
      operation = active;
      try {
        active.stream = await options.getDisplayMedia(settings);
        if (disposed) throw aborted();
        const chosen = active.selection ? await active.selection : null;
        if (chosen?.error) throw new Error(chosen.error);
        if (chosen && !chosen.selected) throw aborted();
        if (disposed) throw aborted();
        if (chosen?.audio) {
          active.preparingAudio = true;
          const pipe = await options.createAudio(chosen.audio);
          active.pipe = pipe;
          if (disposed) {
            void pipe.close().catch((error) => options.warn?.(error));
            throw aborted();
          }
          active.stream.addTrack(pipe.track);
          const video = active.stream.getVideoTracks()[0];
          if (!video) throw new Error('A captura não produziu uma trilha de vídeo.');
          bind(video, pipe);
        }
        return active.stream;
      } catch (error) {
        releaseTracks(active.stream);
        const result =
          active.result ?? (active.selection ? await active.selection.catch(() => null) : null);
        await releaseAudio(active);
        if (result?.error) throw new Error(result.error);
        throw error;
      } finally {
        if (operation === active) {
          operation = null;
          update({ request: null, source: null });
        }
      }
    },
    dispose() {
      if (disposed) return;
      choose(null);
      disposed = true;
      if (operation) {
        releaseTracks(operation.stream);
        void releaseAudio(operation);
      }
      attempt(() => releaseRequest?.());
      attempt(() => releaseCancel?.());
      for (const release of [...bindings]) release();
      state = initial;
      listeners.clear();
    },
  };
}
export type DesktopCapture = ReturnType<typeof createDesktopCapture>;
