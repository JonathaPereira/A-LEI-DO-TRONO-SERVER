export type DesktopView = 'home' | 'game' | 'community';
type GameScreen = 'setupScreen' | 'roomScreen' | 'gameScreen';
type DesktopRoute = DesktopView | 'throne' | 'profile' | 'settings' | 'clips';

export interface DesktopShellSource {
  visibleScreen: string | null;
  gameRoom: string | null;
  currentRoom: string | null;
  independentGameVoice: boolean;
  hasIdentity: boolean;
  joined: boolean;
  status: string;
}
export interface DesktopShellSnapshot {
  readonly view: DesktopView;
  readonly channelsOpen: boolean;
  readonly fullscreen: boolean;
  readonly fullscreenPending: boolean;
  readonly fullscreenError: string | null;
  readonly fullscreenTitle: string;
  readonly callName: string;
  readonly callStatus: string;
}
export interface DesktopShellOptions {
  read(): DesktopShellSource;
  subscribeSource(listener: () => void): () => void;
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  hasChannel(id: string): boolean;
  showScreen(id: 'portalScreen' | 'chatOnlyScreen' | GameScreen): void;
  showCommunity(): void;
  openLibrary(): unknown;
  openGame(requireIdentity: boolean): unknown;
  openVoice(): Promise<unknown>;
  requestRooms(): void;
  openSettings(section?: 'account'): void;
  confirmLeave(): boolean;
  native: {
    getWindowState(): Promise<unknown>;
    onWindowState(listener: (state: unknown) => void): (() => void) | void;
    toggleFullscreen(): Promise<unknown>;
  };
}

const isGameScreen = (value: string | null): value is GameScreen =>
  value === 'setupScreen' || value === 'roomScreen' || value === 'gameScreen';
const isRoute = (value: unknown): value is DesktopRoute =>
  typeof value === 'string' &&
  ['home', 'game', 'community', 'throne', 'profile', 'settings', 'clips'].includes(value);
const fullscreenFrom = (value: unknown): boolean | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fullscreen = (value as Record<string, unknown>).fullscreen;
  return typeof fullscreen === 'boolean' ? fullscreen : null;
};
const fullscreenFailure = 'Não foi possível alterar a tela cheia. Tente F11.';

/** Projects the desktop shell; screen, membership and media owners remain external. */
export function createDesktopShell(options: DesktopShellOptions) {
  let started = false,
    disposed = false,
    lastGame: GameScreen = 'setupScreen',
    channelsOpen = false,
    fullscreen = false,
    fullscreenPending = false,
    fullscreenError: string | null = null,
    windowRevision = 0,
    navigationRevision = 0;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];

  function project(): DesktopShellSnapshot {
    const source = options.read();
    return Object.freeze({
      view:
        source.visibleScreen === 'portalScreen'
          ? 'home'
          : source.visibleScreen === 'chatOnlyScreen'
            ? 'community'
            : 'game',
      channelsOpen,
      fullscreen,
      fullscreenPending,
      fullscreenError,
      fullscreenTitle: fullscreenError || 'Tela cheia · F11',
      callName: source.joined ? 'Chamada conectada' : 'M&N · pronto para conectar',
      callStatus: source.status,
    });
  }
  let snapshot = project();
  function refresh(rememberGame = true) {
    if (disposed) return;
    const source = options.read();
    if (rememberGame && isGameScreen(source.visibleScreen)) lastGame = source.visibleScreen;
    const next = project();
    if (
      Object.keys(next).every(
        (key) =>
          snapshot[key as keyof DesktopShellSnapshot] === next[key as keyof DesktopShellSnapshot],
      )
    )
      return;
    snapshot = next;
    for (const listener of listeners) listener();
  }
  function closeChannels() {
    if (disposed || !channelsOpen) return;
    channelsOpen = false;
    refresh();
  }
  function applyWindowState(value: unknown) {
    const next = fullscreenFrom(value);
    if (disposed || next === null) return;
    fullscreen = next;
    fullscreenError = null;
    refresh();
  }
  async function toggleFullscreen() {
    if (!started || disposed || fullscreenPending) return;
    fullscreenPending = true;
    fullscreenError = null;
    const revision = ++windowRevision;
    refresh();
    try {
      const state = await options.native.toggleFullscreen();
      if (!disposed && revision === windowRevision) {
        if (fullscreenFrom(state) === null) fullscreenError = fullscreenFailure;
        else applyWindowState(state);
      }
    } catch {
      if (!disposed && revision === windowRevision) fullscreenError = fullscreenFailure;
    } finally {
      if (!disposed) {
        fullscreenPending = false;
        refresh();
      }
    }
  }
  async function navigate(view: unknown) {
    if (!started || disposed || !isRoute(view)) return;
    const revision = ++navigationRevision;
    if (view === 'profile' || view === 'settings') {
      options.openSettings(view === 'profile' ? 'account' : undefined);
      return;
    }
    if (view === 'clips') return;
    closeChannels();
    if (view === 'home') {
      options.showScreen('portalScreen');
      refresh();
      return;
    }
    if (view === 'game') return options.openLibrary();
    const source = options.read();
    if (view === 'throne') {
      if (!source.hasIdentity) return options.openGame(true);
      if (!source.gameRoom) lastGame = 'setupScreen';
      options.showScreen(lastGame);
      options.requestRooms();
      refresh();
      return;
    }
    if (source.currentRoom && options.hasChannel(source.currentRoom)) {
      options.showScreen('chatOnlyScreen');
      options.showCommunity();
      refresh();
      return;
    }
    if (source.currentRoom && !source.independentGameVoice && !options.confirmLeave()) return;
    await options.openVoice();
    // Only read the current screen. A delayed portal result must never select a
    // previous area after another route, account change or disposal.
    if (!disposed && revision === navigationRevision) refresh();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    navigate,
    closeChannels,
    toggleChannels() {
      if (!started || disposed) return;
      channelsOpen = !channelsOpen;
      refresh();
    },
    toggleFullscreen,
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(options.subscribeSource(() => refresh()));
      const authChanged = () => {
        navigationRevision++;
        lastGame = 'setupScreen';
        channelsOpen = false;
        refresh(false);
      };
      options.events.addEventListener('trono-auth-change', authChanged);
      cleanup.push(() => options.events.removeEventListener('trono-auth-change', authChanged));
      const releaseWindow = options.native.onWindowState((value) => {
        if (disposed || fullscreenFrom(value) === null) return;
        windowRevision++;
        applyWindowState(value);
      });
      if (releaseWindow) cleanup.push(releaseWindow);
      const revision = windowRevision;
      void options.native
        .getWindowState()
        .then((value) => {
          if (!disposed && revision === windowRevision) applyWindowState(value);
        })
        .catch(() => {});
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      windowRevision++;
      navigationRevision++;
      for (const release of cleanup.splice(0)) release();
      listeners.clear();
    },
  };
}
export type DesktopShell = ReturnType<typeof createDesktopShell>;
