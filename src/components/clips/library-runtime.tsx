import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ClipLibrary } from '../../lib/clips/library';
import { ClipLibraryCards } from './library';
interface Runtime extends Window {
  TronoClipLibrary?: ClipLibrary;
  TronoDesktop?: unknown;
}
const installed = new WeakSet<Window>();
export function initializeClipLibraryView(target: Window) {
  const runtime = target as Runtime,
    client = runtime.TronoClipLibrary,
    host = target.document.getElementById('clipList');
  if (runtime.TronoDesktop || !client || !host || installed.has(target)) return;
  installed.add(target);
  flushSync(() => createRoot(host).render(<ClipLibraryCards client={client} />));
}
