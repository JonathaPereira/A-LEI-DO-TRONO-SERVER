export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface OverlayConfig {
  readonly enabled: boolean;
  readonly corner: OverlayCorner;
  readonly opacity: number;
  readonly hideWhenIdle: boolean;
  readonly shortcut: string;
}

export interface OverlayParticipant {
  readonly id: string;
  readonly name: string;
  readonly speaking: boolean;
  readonly muted: boolean;
  readonly deafened: boolean;
  readonly avatarUrl?: string;
}

export interface OverlayWatcher {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
}

export interface OverlayState {
  readonly inCall: boolean;
  readonly sharingScreen: boolean;
  readonly participants: readonly OverlayParticipant[];
  readonly watchers: readonly OverlayWatcher[];
}

export interface OverlayToast {
  readonly key: string;
  readonly title: string;
  readonly body?: string;
  readonly imageUrl?: string;
  readonly force?: boolean;
}

export interface DesktopOverlayPort {
  getOverlayConfig?(): Promise<unknown>;
  configureOverlay?(patch: Partial<OverlayConfig>): Promise<unknown>;
  updateOverlayState?(state: OverlayState): Promise<unknown>;
  pushOverlayToast?(toast: OverlayToast): Promise<unknown>;
  onOverlayConfig?(listener: (config: unknown) => void): (() => void) | void;
}

export interface DesktopOverlaySnapshot {
  readonly available: boolean;
  readonly config: OverlayConfig;
  readonly status: string;
  readonly busy: boolean;
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = Object.freeze({
  enabled: false,
  corner: 'top-left',
  opacity: 0.9,
  hideWhenIdle: true,
  shortcut: 'Control+Shift+O',
});

const CORNERS = new Set<OverlayCorner>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

export function readOverlayConfig(
  value: unknown,
  fallback: OverlayConfig = DEFAULT_OVERLAY_CONFIG,
): OverlayConfig {
  const src =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const enabled = typeof src.enabled === 'boolean' ? src.enabled : fallback.enabled;
  const corner = CORNERS.has(src.corner as OverlayCorner)
    ? (src.corner as OverlayCorner)
    : fallback.corner;
  const opacityRaw = Number(src.opacity);
  const opacity = Number.isFinite(opacityRaw)
    ? Math.round(Math.max(0.35, Math.min(1, opacityRaw)) * 100) / 100
    : fallback.opacity;
  const hideWhenIdle =
    typeof src.hideWhenIdle === 'boolean' ? src.hideWhenIdle : fallback.hideWhenIdle;
  const shortcut =
    src.shortcut === ''
      ? ''
      : typeof src.shortcut === 'string' && src.shortcut.length <= 40
        ? src.shortcut
        : fallback.shortcut;
  return Object.freeze({ enabled, corner, opacity, hideWhenIdle, shortcut });
}

interface OverlayControllerOptions {
  native?: DesktopOverlayPort;
  readStageState(): OverlayState;
  subscribeStage(listener: () => void): () => void;
  throttleMs?: number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => () => void;
  warn?: (error: unknown) => void;
}

/** Owns Electron game overlay preferences and throttled/diffed state updates (zero FPS impact). */
export function createDesktopOverlay({
  native,
  readStageState,
  subscribeStage,
  throttleMs = 120,
  now = Date.now,
  schedule = (fn, ms) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
  warn = (error) => console.warn('[DesktopOverlay]', error),
}: OverlayControllerOptions) {
  const available = Boolean(native?.getOverlayConfig && native?.configureOverlay);
  let state: DesktopOverlaySnapshot = Object.freeze({
    available,
    config: DEFAULT_OVERLAY_CONFIG,
    status: '',
    busy: false,
  });
  let started = false,
    disposed = false,
    lastSentJson = '',
    lastSentAt = 0;
  let cancelPending: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const cleanup: (() => void)[] = [];

  function update(patch: Partial<DesktopOverlaySnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        warn(error);
      }
    }
  }

  function flushState(force = false) {
    if (disposed || !available || !native?.updateOverlayState) return;
    if (!state.config.enabled && !force) return;
    const next = readStageState();
    const serialized = JSON.stringify(next);
    if (!force && serialized === lastSentJson) return;
    const elapsed = now() - lastSentAt;
    if (!force && elapsed < throttleMs) {
      if (!cancelPending) {
        cancelPending = schedule(
          () => {
            cancelPending = null;
            flushState(false);
          },
          Math.max(16, throttleMs - elapsed),
        );
      }
      return;
    }
    if (cancelPending) {
      cancelPending();
      cancelPending = null;
    }
    lastSentJson = serialized;
    lastSentAt = now();
    void native.updateOverlayState(next).catch((error) => warn(error));
  }

  async function configure(patch: Partial<OverlayConfig>) {
    if (disposed || !available || !native?.configureOverlay) return state.config;
    update({ busy: true, status: '' });
    try {
      const saved = readOverlayConfig(await native.configureOverlay(patch), state.config);
      if (disposed) return saved;
      update({ config: saved, busy: false });
      if (saved.enabled) flushState(true);
      return saved;
    } catch (error) {
      if (!disposed)
        update({ busy: false, status: 'Não foi possível salvar a configuração do overlay.' });
      warn(error);
      return state.config;
    }
  }

  async function testToast() {
    if (disposed || !available || !native?.pushOverlayToast) return;
    if (!state.config.enabled) {
      update({ status: 'Ative o Overlay em Jogos acima para enviar um teste.' });
      return;
    }
    try {
      await native.pushOverlayToast({
        key: 'overlay-preview:' + now(),
        title: 'M&N · Overlay ativo',
        body: 'Balões da chamada, espectadores da live e avisos aparecerão aqui sobre o jogo.',
        force: true,
      });
      if (!disposed) update({ status: 'Prévia exibida no canto escolhido.' });
    } catch (error) {
      if (!disposed) update({ status: 'Não foi possível exibir a prévia no overlay.' });
      warn(error);
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed || !available) return;
      started = true;
      cleanup.push(subscribeStage(() => flushState(false)));
      const unsubConfig = native?.onOverlayConfig?.((raw) => {
        if (disposed) return;
        const next = readOverlayConfig(raw, state.config);
        update({ config: next });
        if (next.enabled) flushState(true);
      });
      if (typeof unsubConfig === 'function') cleanup.push(unsubConfig);
      void native
        ?.getOverlayConfig?.()
        .then((raw) => {
          if (disposed) return;
          const config = readOverlayConfig(raw, state.config);
          update({ config });
          if (config.enabled) flushState(true);
        })
        .catch((error) => warn(error));
    },
    configure,
    testToast,
    syncNow: () => flushState(true),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (cancelPending) {
        cancelPending();
        cancelPending = null;
      }
      for (const fn of cleanup.splice(0)) fn();
      listeners.clear();
    },
  };
}

export type DesktopOverlayController = ReturnType<typeof createDesktopOverlay>;
