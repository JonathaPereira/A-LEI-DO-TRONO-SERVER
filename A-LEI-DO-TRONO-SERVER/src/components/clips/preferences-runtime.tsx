import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ClipPreferences } from '../../lib/clips/preferences';
import type { ClipLibrary } from '../../lib/clips/library';
import { ClipPreferenceFields } from './preferences';
interface Runtime extends Window {
  TronoDesktop?: unknown;
  TronoClipPreferences?: ClipPreferences;
  TronoClipLibrary?: ClipLibrary;
}
const installed = new WeakSet<Window>();
export function initializeClipPreferencesView(target: Window) {
  const runtime = target as Runtime,
    preferences = runtime.TronoClipPreferences,
    library = runtime.TronoClipLibrary,
    host = target.document.getElementById('clipPreferencesHost');
  if (installed.has(target) || !preferences || !library || !host) return;
  installed.add(target);
  flushSync(() =>
    createRoot(host).render(<ClipPreferenceFields preferences={preferences} library={library} />),
  );
}
