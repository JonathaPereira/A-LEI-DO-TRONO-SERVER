import type { ClipDirectory } from '../../types/clips';
import type { RecordingCapture } from './capture';
import type { RecordingNotice } from './files';
export interface RecorderSnapshot {
  readonly phase: 'idle' | 'selecting' | 'recording' | 'stopping' | 'saving';
  readonly startedAt: number | null;
  readonly notice: (RecordingNotice & { readonly id: number }) | null;
}
interface RecorderOptions {
  supported(): boolean;
  capture(isCurrent: () => boolean): Promise<RecordingCapture | null>;
  createRecorder(stream: MediaStream): MediaRecorder;
  chooseDirectory(): Promise<ClipDirectory | null>;
  save(
    blob: Blob,
    directory: ClipDirectory | null,
    filename: string,
    signal: AbortSignal,
  ): Promise<RecordingNotice>;
  now(): number;
}
interface RecordingSession {
  capture: RecordingCapture;
  recorder: MediaRecorder;
  chunks: Blob[];
  persistence: AbortController;
  directory: Promise<ClipDirectory | null> | null;
  ended: () => void;
}
/** One manual recording, including finalization. Never owns the call's microphone. */
export function createRecorder(options: RecorderOptions) {
  let active: RecordingSession | null = null,
    generation = 0,
    disposed = false,
    noticeId = 0;
  let state: RecorderSnapshot = Object.freeze({ phase: 'idle', startedAt: null, notice: null });
  const listeners = new Set<() => void>();
  function publish(patch: Partial<RecorderSnapshot> = {}, notice?: RecordingNotice) {
    if (disposed) return;
    state = Object.freeze({
      ...state,
      ...patch,
      ...(notice ? { notice: Object.freeze({ ...notice, id: ++noticeId }) } : {}),
    });
    for (const listener of listeners) listener();
  }
  const notify = (message: string, kind: RecordingNotice['kind'] = '') =>
    publish({}, { message, kind });
  function release(session: RecordingSession) {
    session.capture.stream.getVideoTracks()[0]?.removeEventListener('ended', session.ended);
    session.capture.dispose();
  }
  function detach(session: RecordingSession) {
    session.recorder.ondataavailable = null;
    session.recorder.onstop = null;
    session.recorder.onerror = null;
  }
  async function finalize(session: RecordingSession, ticket: number) {
    if (active !== session || disposed || generation !== ticket) return;
    // Stop capture/mixing before waiting for the destination picker or file IO.
    release(session);
    publish({ phase: 'stopping' });
    try {
      let directory: ClipDirectory | null = null;
      try {
        directory = session.directory ? await session.directory : null;
      } catch {}
      if (disposed || active !== session || ticket !== generation) return;
      const blob = new Blob(session.chunks, { type: session.recorder.mimeType || 'video/webm' });
      if (!blob.size) {
        notify('A gravação terminou sem dados válidos.', 'error');
        return;
      }
      publish({ phase: 'saving' });
      const stamp = new Date(options.now())
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);
      const notice = await options.save(
        blob,
        directory,
        `A_Lei_do_Trono_${stamp}.webm`,
        session.persistence.signal,
      );
      if (!disposed && ticket === generation) publish({}, notice);
    } catch (error) {
      if (!disposed && ticket === generation)
        notify(
          error instanceof Error ? error.message : 'Não foi possível salvar a gravação.',
          'error',
        );
    } finally {
      detach(session);
      release(session);
      session.chunks.length = 0;
      if (active === session) {
        active = null;
        publish({ phase: 'idle', startedAt: null });
      }
    }
  }
  async function start() {
    if (disposed || state.phase !== 'idle') return;
    if (!options.supported()) {
      notify('Este navegador não oferece gravação de tela pelo site.', 'error');
      return;
    }
    const ticket = ++generation,
      current = () => !disposed && ticket === generation;
    publish({ phase: 'selecting', startedAt: null });
    let capture: RecordingCapture | null = null;
    try {
      capture = await options.capture(current);
      if (!capture) {
        if (current()) publish({ phase: 'idle' });
        return;
      }
      if (!current()) {
        capture.dispose();
        return;
      }
      const recorder = options.createRecorder(capture.stream);
      const session: RecordingSession = {
        capture,
        recorder,
        chunks: [],
        persistence: new AbortController(),
        directory: null,
        ended: () => {
          if (active === session) void stop(false);
        },
      };
      active = session;
      recorder.ondataavailable = (event) => {
        if (active === session && current() && event.data?.size) session.chunks.push(event.data);
      };
      recorder.onstop = () => {
        void finalize(session, ticket);
      };
      recorder.onerror = (event) => {
        const error = (event as Event & { error?: Error }).error;
        notify(`Falha na gravação: ${error?.message || 'erro desconhecido'}.`, 'error');
        if (active === session && recorder.state !== 'inactive') void stop(false);
      };
      capture.stream.getVideoTracks()[0]?.addEventListener('ended', session.ended, { once: true });
      recorder.start(1000);
      publish(
        { phase: 'recording', startedAt: options.now() },
        {
          message:
            'Gravação iniciada. Para registrar o jogo completo, compartilhe esta aba e habilite o áudio da aba.',
          kind: 'ok',
        },
      );
    } catch (error) {
      capture?.dispose();
      if (!current()) return;
      if (active) {
        detach(active);
        try {
          if (active.recorder.state !== 'inactive') active.recorder.stop();
        } catch {}
        release(active);
        active = null;
      }
      publish(
        { phase: 'idle', startedAt: null },
        {
          message:
            error instanceof Error && error.name === 'NotAllowedError'
              ? 'Gravação cancelada.'
              : error instanceof Error
                ? error.message
                : 'Não foi possível iniciar a gravação.',
          kind: error instanceof Error && error.name === 'NotAllowedError' ? '' : 'error',
        },
      );
    }
  }
  async function stop(promptDirectory = true) {
    if (disposed) return;
    if (state.phase === 'selecting') {
      generation++;
      publish({ phase: 'idle', startedAt: null }, { message: 'Gravação cancelada.', kind: '' });
      return;
    }
    const session = active;
    if (
      !session ||
      state.phase !== 'recording' ||
      !['recording', 'paused'].includes(session.recorder.state)
    )
      return;
    // Start picker synchronously from the click, then stop recorder without awaiting it.
    try {
      session.directory = promptDirectory
        ? options.chooseDirectory().catch(() => null)
        : Promise.resolve(null);
    } catch {
      session.directory = Promise.resolve(null);
    }
    publish({ phase: 'stopping' });
    try {
      session.recorder.requestData();
    } catch {}
    try {
      session.recorder.stop();
    } catch (error) {
      session.directory = null;
      publish({ phase: 'recording' });
      notify(
        error instanceof Error ? error.message : 'Não foi possível encerrar a gravação.',
        'error',
      );
    }
  }
  function toggle() {
    if (state.phase === 'stopping' || state.phase === 'saving') {
      notify('A gravação já está sendo finalizada.', 'warn');
      return;
    }
    if (state.phase === 'recording' || state.phase === 'selecting') void stop(true);
    else void start();
  }
  /** Invalidate the current account scope without replacing the page owner. */
  function cancel() {
    if (disposed) return;
    generation++;
    if (active) {
      const previous = active;
      active = null;
      previous.persistence.abort();
      detach(previous);
      try {
        if (previous.recorder.state !== 'inactive') previous.recorder.stop();
      } catch {}
      release(previous);
      previous.chunks.length = 0;
    }
    publish({ phase: 'idle', startedAt: null, notice: null });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    stop,
    cancel,
    toggle,
    get recording() {
      return state.phase === 'recording';
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      listeners.clear();
    },
  };
}
export type ManualRecorder = ReturnType<typeof createRecorder>;
