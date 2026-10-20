import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ClipPreferences } from '../../lib/clips/preferences';
import type { ClipLibrary } from '../../lib/clips/library';
import { createClipControls, type ClipControls } from './controls-runtime';
import { ClipPreferenceFields } from './preferences';
interface Runtime extends Window {
  TronoDesktop?: unknown;
  TronoClipPreferences?: ClipPreferences;
  TronoClipLibrary?: ClipLibrary;
  TronoClipControls?: ClipControls;
}
export function initializeClipPreferencesView(target: Window) {
  const runtime = target as Runtime,
    preferences = runtime.TronoClipPreferences,
    library = runtime.TronoClipLibrary,
    host = target.document.getElementById('clipPreferencesHost');
  if (runtime.TronoDesktop || runtime.TronoClipControls || !preferences || !library || !host)
    return;
  runtime.TronoClipControls = createClipControls(target, preferences);
  flushSync(() =>
    createRoot(host).render(<ClipPreferenceFields preferences={preferences} library={library} />),
  );
}
