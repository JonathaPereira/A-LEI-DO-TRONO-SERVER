import { createClipStore, type ClipStore } from './store';

interface Runtime extends Window {
  TronoClipStore?: ClipStore;
}
const installed = new WeakMap<Window, () => void>();
/** Compatibility name for the remaining replay UI; storage opens lazily on its first operation. */
export function initializeClipStore(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    store = createClipStore(() => target.indexedDB);
  runtime.TronoClipStore = store;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    store.dispose();
    if (runtime.TronoClipStore === store) delete runtime.TronoClipStore;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
