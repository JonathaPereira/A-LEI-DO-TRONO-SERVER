import type {
  DesktopActivityConfiguration,
  DesktopActivityGame,
  DesktopActivityNative,
  DesktopActivitySnapshot,
  DesktopActivityState,
} from '../../types/desktop-activity';

export interface DesktopActivityOptions {
  readAccount(): string | null;
  authReady: Promise<unknown>;
  native: DesktopActivityNative;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  network: {
    readonly gameActivitySupported: boolean;
    onMessage(listener: (message: unknown) => void): () => void;
    setActivity(activity: { name: string } | null): unknown;
  };
  /** Whether the existing Lei do Trono game has state and its screen is visible. */
  readGame(): boolean;
  subscribeIdentity(listener: () => void): () => void;
  subscribeGameVisibility(listener: () => void): () => void;
}

const appId = /^[a-f0-9]{64}$/;
const emptyApps = Object.freeze([]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validLabel(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 80;
}

/** The native bridge is an external boundary, even though its producer is local. */
export function readDesktopActivityState(value: unknown): DesktopActivityState | null {
  const data = record(value);
  if (
    !data ||
    typeof data.available !== 'boolean' ||
    typeof data.enabled !== 'boolean' ||
    !Array.isArray(data.apps) ||
    data.apps.length > 128 ||
    (data.error !== null && typeof data.error !== 'string')
  )
    return null;
  const apps: { readonly id: string; readonly name: string }[] = [];
  const ids = new Set<string>();
  for (const value of data.apps) {
    const row = record(value);
    if (!row || typeof row.id !== 'string' || !appId.test(row.id) || !validLabel(row.name))
      return null;
    if (ids.has(row.id)) return null;
    ids.add(row.id);
    apps.push(Object.freeze({ id: row.id, name: row.name }));
  }
  let game: DesktopActivityGame | null = null;
  if (data.game !== null) {
    const value = record(data.game);
    if (
      !value ||
      !validLabel(value.name) ||
      (value.startedAt !== undefined &&
        (typeof value.startedAt !== 'number' ||
          !Number.isFinite(value.startedAt) ||
          value.startedAt < 0))
    )
      return null;
    game = Object.freeze({
      name: value.name,
      ...(typeof value.startedAt === 'number' ? { startedAt: value.startedAt } : {}),
    });
  }
  return Object.freeze({
    available: data.available,
    enabled: data.enabled,
    apps: Object.freeze(apps),
    game,
    error: data.error,
  });
}

/** Owns the renderer policy; Electron alone owns process discovery and its helper. */
export function createDesktopActivity(options: DesktopActivityOptions) {
  const listeners = new Set<() => void>(),
    subscriptions: (() => void)[] = [];
  let enabled = false,
    preferredAppId: string | null = null,
    name = '',
    nativeState: DesktopActivityState | null = null,
    account = options.readAccount(),
    authenticatedAccount: string | null = null,
    started = false,
    ready = false,
    disposed = false,
    revision = 0,
    nativeRevision = 0,
    configured = false,
    configuring = false;
  let pending: { revision: number; configuration: DesktopActivityConfiguration } | null = null;
  let activeRevision: number | null = null;
  try {
    enabled = options.storage.getItem('mn-activity-enabled') === '1';
    const storedApp = options.storage.getItem('mn-activity-app');
    preferredAppId = storedApp && appId.test(storedApp) ? storedApp : null;
    name = (options.storage.getItem('mn-activity-name') || '').trim().slice(0, 80);
  } catch {
    // Device preferences remain usable when storage is unavailable.
  }

  function currentGame(): DesktopActivityGame | null {
    return (
      nativeState?.game ||
      (!preferredAppId && options.readGame() ? Object.freeze({ name: 'A Lei do Trono' }) : null)
    );
  }

  function project(): DesktopActivitySnapshot {
    const game = currentGame(),
      accountPresent = account !== null,
      available = nativeState?.available === true;
    return Object.freeze({
      enabled,
      preferredAppId,
      name,
      available,
      accountPresent,
      apps: nativeState?.apps || emptyApps,
      currentGame: game,
      error: nativeState?.error || null,
      configuring,
      status: !accountPresent
        ? 'Entre na conta para compartilhar sua atividade.'
        : !available
          ? 'Detecção de aplicativos disponível na versão para Windows.'
          : !enabled
            ? 'Sua atividade está oculta.'
            : nativeState?.error ||
              (!options.network.gameActivitySupported
                ? 'Compartilhamento de atividade ainda indisponível nesta conexão.'
                : game
                  ? 'Jogando ' + game.name
                  : 'Nenhum jogo detectado. Abra um jogo ou selecione um aplicativo.'),
    });
  }
  let snapshot = project();

  function refresh() {
    if (disposed) return;
    snapshot = project();
    for (const listener of listeners) listener();
  }

  function publish() {
    if (
      disposed ||
      !authenticatedAccount ||
      authenticatedAccount !== account ||
      account !== options.readAccount() ||
      !options.network.gameActivitySupported
    )
      return;
    const game = enabled ? currentGame() : null;
    options.network.setActivity(game ? { name: game.name } : null);
  }

  function consume(value: unknown): boolean {
    const state = readDesktopActivityState(value);
    if (!state || disposed) return false;
    nativeState = state;
    nativeRevision++;
    refresh();
    publish();
    return true;
  }

  function configuration(): DesktopActivityConfiguration {
    return { enabled: !disposed && enabled && account !== null, preferredAppId, name };
  }

  async function drain() {
    if (configuring || !pending || !ready || !options.native.configureActivity) return;
    const request = pending;
    pending = null;
    configured = true;
    configuring = true;
    activeRevision = request.revision;
    const expectedNative = nativeRevision;
    refresh();
    try {
      const value = await options.native.configureActivity(request.configuration);
      if (request.revision === revision && nativeRevision === expectedNative) consume(value);
    } catch {
      if (!disposed && request.revision === revision && nativeRevision === expectedNative) {
        nativeState = Object.freeze({
          available: nativeState?.available || false,
          enabled: nativeState?.enabled || false,
          game: null,
          apps: nativeState?.apps || emptyApps,
          error: 'Não foi possível atualizar sua atividade.',
        });
        refresh();
        publish();
      }
    } finally {
      configuring = false;
      activeRevision = null;
      refresh();
      void drain();
    }
  }

  function requestConfiguration() {
    pending = { revision: ++revision, configuration: configuration() };
    void drain();
  }

  function save() {
    try {
      options.storage.setItem('mn-activity-enabled', enabled ? '1' : '0');
      if (preferredAppId) options.storage.setItem('mn-activity-app', preferredAppId);
      else options.storage.removeItem('mn-activity-app');
      options.storage.setItem('mn-activity-name', name);
    } catch {
      // A denied write must not prevent native opt-out or preference changes.
    }
    if (nativeState) nativeState = Object.freeze({ ...nativeState, game: null });
    refresh();
    publish();
    if (started) requestConfiguration();
  }

  function syncIdentity() {
    if (disposed) return;
    const next = options.readAccount();
    if (account !== next) {
      if (authenticatedAccount && options.network.gameActivitySupported)
        options.network.setActivity(null);
      authenticatedAccount = null;
      account = next;
      if (nativeState) nativeState = Object.freeze({ ...nativeState, game: null });
      refresh();
    }
    requestConfiguration();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEnabled(value: boolean) {
      if (disposed || enabled === value) return;
      enabled = value;
      save();
    },
    setPreferredApp(value: string | null) {
      if (disposed || (value !== null && !appId.test(value)) || preferredAppId === value) return;
      preferredAppId = value;
      name = '';
      save();
    },
    setName(value: string) {
      if (disposed) return;
      const next = value.trim().slice(0, 80);
      if (name === next) return;
      name = next;
      save();
    },
    start() {
      if (started || disposed) return;
      started = true;
      const unsubscribe = options.native.onActivity?.((value) => {
        if (pending || (activeRevision !== null && activeRevision !== revision)) return;
        consume(value);
      });
      if (unsubscribe) subscriptions.push(unsubscribe);
      subscriptions.push(
        options.subscribeIdentity(syncIdentity),
        options.subscribeGameVisibility(() => {
          refresh();
          publish();
        }),
        options.network.onMessage((value) => {
          if (disposed) return;
          const message = record(value);
          if (!message) return;
          if (message.type === 'auth-result' && message.ok === true) {
            if (message.user !== undefined) {
              const user = record(message.user);
              if (!user || typeof user.id !== 'string' || user.id !== account) return;
            }
            authenticatedAccount = account === options.readAccount() ? account : null;
            publish();
            refresh();
          } else if (message.type === 'connection' && message.connected === false) {
            authenticatedAccount = null;
            refresh();
          } else if (message.type === 'welcome' || message.type === 'game-state') {
            refresh();
            publish();
          }
        }),
      );
      void options.authReady.then(
        async () => {
          if (disposed) return;
          account = options.readAccount();
          const expected = revision,
            expectedNative = nativeRevision;
          try {
            const value = await options.native.getActivityState?.();
            if (!disposed && revision === expected && nativeRevision === expectedNative)
              consume(value);
          } catch {
            // The subsequent configure request can recover without an initial snapshot.
          }
          if (disposed) return;
          ready = true;
          requestConfiguration();
        },
        () => {
          if (disposed) return;
          ready = true;
          syncIdentity();
        },
      );
    },
    dispose() {
      if (disposed) return;
      if (authenticatedAccount && options.network.gameActivitySupported)
        options.network.setActivity(null);
      disposed = true;
      authenticatedAccount = null;
      for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
      listeners.clear();
      // Serialize the final opt-out after an in-flight opt-in so it cannot win late.
      if (configured) {
        ready = true;
        requestConfiguration();
      } else {
        pending = null;
        revision++;
      }
    },
  };
}

export type DesktopActivityController = ReturnType<typeof createDesktopActivity>;
