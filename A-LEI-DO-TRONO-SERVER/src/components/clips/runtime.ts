import { createLocalClipCapture } from '../../lib/clips/local-capture';
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
/** Coordinates borrowed screen replay and explicitly selected local capture. */
export function initializeClips(
  target: Window,
  { ready: alreadyReady = false } = {},
): ClipsClient | null {
  const runtime = target as Runtime;
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
  const local = createLocalClipCapture({
    capture: () => {
      const quality = preferences.getQuality(),
        settings = preferences.getSnapshot().settings;
      if (!target.navigator.mediaDevices?.getDisplayMedia)
        throw Error('Captura local indisponível neste dispositivo.');
      return target.navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: quality.width },
          height: { ideal: quality.height },
          frameRate: { ideal: settings.fps },
        },
        audio: settings.audio !== 'none',
      });
    },
    started: async (source) => {
      await replay.sharedStarted(source, { force: true });
      if (!replay.getSnapshot().active)
        throw Error(replay.getSnapshot().message || 'Não foi possível preparar os clipes.');
    },
    stopped: (source) => replay.sharedStopped(source),
  });
  const unsubscribeLocalReplay = replay.subscribe(() =>
    queueMicrotask(() => {
      const state = replay.getSnapshot();
      if (local.getSnapshot().active && !state.active && !state.preparing)
        local.stop(state.message);
    }),
  );
  const controls = createClipControls(target, preferences),
    view = createReplayView(target, replay, preferences, library, controls, local);
  runtime.TronoClipControls = controls;
  let disposed = false,
    ready = false;
  const syncAccount = () => {
    const owner = runtime.TronoAuth?.user?.id || 'local';
    if (owner !== replay.getSnapshot().owner) {
      local.stop();
      void replay.setOwner(owner);
    }
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (replay.hasUnsavedWork()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  const pageHide = () => {
    local.stop();
    replay.stop();
  };
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
    sharedStarted: (source, options) => {
      if (local.getSnapshot().active || local.getSnapshot().pending) return Promise.resolve();
      return replay.sharedStarted(source, options);
    },
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
      unsubscribeLocalReplay();
      local.dispose();
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
  if (alreadyReady) bind();
  else target.addEventListener('trono:ready', bind, { once: true });
  return client;
}
