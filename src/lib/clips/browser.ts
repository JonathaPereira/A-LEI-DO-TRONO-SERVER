import { createClipStore, type ClipStore } from './store';
import { createReplaySession, type ReplaySessionOptions } from './session';
import { createClipLibrary, type ClipLibrary } from './library';
import { createBrowserClipFiles } from './export';

interface Runtime extends Window {
  TronoClipStore?: ClipStore;
  TronoClipLibrary?: ClipLibrary;
  TronoCreateClipWorker?: () => Worker;
  TronoCreateReplaySession?: (
    options: ReplaySessionOptions,
  ) => ReturnType<typeof createReplaySession>;
}
const installed = new WeakMap<Window, () => void>();
/** Compatibility name for the remaining replay UI; storage opens lazily on its first operation. */
export function initializeClipStore(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    store = createClipStore(() => target.indexedDB);
  runtime.TronoClipStore = store;
  const files = createBrowserClipFiles(target),
    library = createClipLibrary(store, files);
  runtime.TronoClipLibrary = library;
  target.addEventListener('pagehide', files.dispose);
  const createWorker = () =>
    new Worker(new URL('./buffer-worker.ts', import.meta.url), {
      type: 'module',
      name: 'clip-buffer',
    });
  runtime.TronoCreateClipWorker = createWorker;
  const createSession = (options: ReplaySessionOptions) =>
    createReplaySession(options, {
      createStream: (tracks) => new MediaStream(tracks),
      createRecorder: (stream, config) => new MediaRecorder(stream, config),
      isTypeSupported: (mime) => MediaRecorder.isTypeSupported(mime),
      createWorker,
    });
  runtime.TronoCreateReplaySession = createSession;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('pagehide', files.dispose);
    library.dispose();
    files.dispose();
    store.dispose();
    if (runtime.TronoClipStore === store) delete runtime.TronoClipStore;
    if (runtime.TronoClipLibrary === library) delete runtime.TronoClipLibrary;
    if (runtime.TronoCreateClipWorker === createWorker) delete runtime.TronoCreateClipWorker;
    if (runtime.TronoCreateReplaySession === createSession) delete runtime.TronoCreateReplaySession;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
