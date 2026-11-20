interface LocalCaptureOptions {
  capture(): Promise<MediaStream>;
  started(source: MediaStream): Promise<void>;
  stopped(source: MediaStream): void;
}
/** Owns only the explicitly selected local capture. Never owns a shared call source. */
export function createLocalClipCapture(options: LocalCaptureOptions) {
  let source: MediaStream | null = null,
    generation = 0,
    disposed = false;
  let state: Readonly<{ active: boolean; pending: boolean; message: string }> = Object.freeze({
    active: false,
    pending: false,
    message: '',
  });
  const listeners = new Set<() => void>();
  let unlisten = () => {};
  function publish(patch: Partial<typeof state>) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function stop(message = 'Captura local desligada') {
    generation++;
    const previous = source;
    source = null;
    unlisten();
    unlisten = () => {};
    if (previous) {
      options.stopped(previous);
      previous.getTracks().forEach((track) => track.stop());
    }
    publish({ active: false, pending: false, message });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async start() {
      if (disposed || source || state.pending) return;
      const request = ++generation;
      const current = () => !disposed && request === generation;
      publish({ pending: true, message: '' });
      let captured: MediaStream | undefined;
      try {
        captured = await options.capture();
        if (!current()) {
          captured.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = captured.getVideoTracks()[0];
        if (!video || video.readyState !== 'live')
          throw Error('A tela selecionada não está disponível.');
        source = captured;
        const ended = () => stop('A tela ou janela selecionada encerrou a captura.');
        video.addEventListener('ended', ended);
        unlisten = () => video.removeEventListener('ended', ended);
        await options.started(captured);
        if (!current()) return;
        publish({
          active: true,
          pending: false,
          message: 'Captura local ativa. Esta captura não é transmitida.',
        });
      } catch (error) {
        if (!current()) return;
        if (source) stop();
        else captured?.getTracks().forEach((track) => track.stop());
        publish({
          pending: false,
          message:
            error instanceof Error ? error.message : 'Não foi possível iniciar a captura local.',
        });
      }
    },
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      listeners.clear();
    },
  };
}
export type LocalClipCapture = ReturnType<typeof createLocalClipCapture>;
