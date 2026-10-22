import { createReplayController, type ReplayController } from '../../lib/clips/replay';
import type { ClipLibrary } from '../../lib/clips/library';
import type { ClipPreferences } from '../../lib/clips/preferences';
import type { ReplaySessionOptions, createReplaySession } from '../../lib/clips/session';
import { createClipControls, type ClipControls } from './controls-runtime';
import { createReplayView } from './replay-runtime';
import type { ClipSettings } from '../../types/clips';

export interface ClipsClient {
  open(options?: { inline?: boolean }): void;
  clip(): void;
  stop(): void;
  sharedStarted: ReplayController['sharedStarted'];
  sharedStopped: ReplayController['sharedStopped'];
  captureProfile: ReplayController['captureProfile'];
  readonly preferences: ClipSettings;
  readonly replayStatus: ReturnType<ReplayController['getReplayStatus']>;
  readonly active: boolean;
  dispose(): void;
}
interface Runtime extends Window {
  TronoDesktop?: unknown;
  TronoAuth?: { user?: { id?: string } };
  TronoClipLibrary: ClipLibrary;
  TronoClipPreferences: ClipPreferences;
  TronoCreateReplaySession: (
    options: ReplaySessionOptions,
  ) => ReturnType<typeof createReplaySession>;
  TronoClipControls?: ClipControls;
  TronoClipDesktop?: { saved(count: number): void };
  TronoClips?: ClipsClient;
}
const installed = new WeakMap<Window, ClipsClient>();
/** Preserve the web-only replay policy. Desktop never installs a replay coordinator. */
export function initializeClips(target: Window): ClipsClient | null {
  const runtime = target as Runtime;
  if (runtime.TronoDesktop) return null;
  const previous = installed.get(target);
  if (previous) return previous;
  const preferences = runtime.TronoClipPreferences,
    library = runtime.TronoClipLibrary;
  const replay = createReplayController({
    preferences,
    library,
    createSession: (options) => runtime.TronoCreateReplaySession(options),
    supported: () => typeof MediaRecorder !== 'undefined' && typeof Worker !== 'undefined',
    createId: () => target.crypto.randomUUID(),
    now: Date.now,
    saved: (count) => runtime.TronoClipDesktop?.saved(count),
  });
  const controls = createClipControls(target, preferences),
    view = createReplayView(target, replay, preferences, library, controls);
  runtime.TronoClipControls = controls;
  let disposed = false,
    ready = false;
  const syncAccount = () => {
    const owner = runtime.TronoAuth?.user?.id || 'local';
    if (owner !== replay.getSnapshot().owner) void replay.setOwner(owner);
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (replay.hasUnsavedWork()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  const pageHide = () => replay.stop();
  const bind = () => {
    if (ready || disposed) return;
    ready = true;
    view.bind();
    void replay.setOwner(runtime.TronoAuth?.user?.id || 'local');
    target.addEventListener('trono-auth-change', syncAccount);
    target.addEventListener('beforeunload', beforeUnload);
    target.addEventListener('pagehide', pageHide);
  };
  const client: ClipsClient = {
    open: view.open,
    clip: replay.clip,
    stop: replay.stop,
    sharedStarted: replay.sharedStarted,
    sharedStopped: replay.sharedStopped,
    captureProfile: replay.captureProfile,
    get preferences() {
      const settings = preferences.getSnapshot().settings;
      return { ...settings, shortcut: { ...settings.shortcut } };
    },
    get replayStatus() {
      return replay.getReplayStatus();
    },
    get active() {
      return replay.getSnapshot().active;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      target.removeEventListener('trono:ready', bind);
      target.removeEventListener('trono-auth-change', syncAccount);
      target.removeEventListener('beforeunload', beforeUnload);
      target.removeEventListener('pagehide', pageHide);
      view.dispose();
      replay.dispose();
      controls.dispose();
      if (runtime.TronoClips === client) delete runtime.TronoClips;
      if (runtime.TronoClipControls === controls) delete runtime.TronoClipControls;
      installed.delete(target);
    },
  };
  runtime.TronoClips = client;
  installed.set(target, client);
  target.addEventListener('trono:ready', bind, { once: true });
  return client;
}
