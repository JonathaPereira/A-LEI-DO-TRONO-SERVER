export type DesktopUpdateStatus =
  'idle' | 'development' | 'checking' | 'current' | 'downloading' | 'ready' | 'error';
export interface DesktopUpdateState {
  readonly status: DesktopUpdateStatus;
  readonly version?: string;
  readonly message?: string;
  readonly percent?: number;
}
export interface DesktopUpdateSnapshot {
  readonly state: DesktopUpdateState;
  readonly currentVersion: string;
  readonly visible: boolean;
  readonly checking: boolean;
  readonly installing: boolean;
}
export interface DesktopUpdatePort {
  readonly version: string;
  getUpdateState(): Promise<unknown>;
  onUpdateState(listener: (value: unknown) => void): (() => void) | void;
  checkUpdates(): Promise<unknown>;
  installUpdate(): Promise<unknown>;
}
const statuses = new Set<DesktopUpdateStatus>([
  'idle',
  'development',
  'checking',
  'current',
  'downloading',
  'ready',
  'error',
]);
function parseState(value: unknown): DesktopUpdateState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!statuses.has(item.status as DesktopUpdateStatus)) return null;
  if (item.version !== undefined && (typeof item.version !== 'string' || !item.version.trim()))
    return null;
  if (item.message !== undefined && typeof item.message !== 'string') return null;
  if (
    item.percent !== undefined &&
    (typeof item.percent !== 'number' ||
      !Number.isFinite(item.percent) ||
      item.percent < 0 ||
      item.percent > 100)
  )
    return null;
  if (item.status === 'downloading' && typeof item.percent !== 'number') return null;
  return Object.freeze({
    status: item.status as DesktopUpdateStatus,
    ...(typeof item.version === 'string' ? { version: item.version } : {}),
    ...(typeof item.message === 'string' ? { message: item.message } : {}),
    ...(typeof item.percent === 'number' ? { percent: item.percent } : {}),
  });
}

/** Renderer projection only. Downloading and installation consent belong to Electron. */
export function createDesktopUpdates(native: DesktopUpdatePort) {
  let snapshot: DesktopUpdateSnapshot = Object.freeze({
    state: Object.freeze({ status: 'idle' }),
    currentVersion: native.version,
    visible: false,
    checking: false,
    installing: false,
  });
  let started = false,
    disposed = false,
    manual = false,
    revision = 0;
  let off: (() => void) | void;
  const listeners = new Set<() => void>();
  function update(value: Partial<DesktopUpdateSnapshot>) {
    if (disposed) return;
    snapshot = Object.freeze({ ...snapshot, ...value });
    for (const listener of listeners) listener();
  }
  function accept(value: unknown) {
    if (disposed) return false;
    const state = parseState(value);
    if (!state) return false;
    revision++;
    update({
      state,
      currentVersion: native.version,
      visible:
        snapshot.visible ||
        manual ||
        (state.status === 'ready' && snapshot.state.status !== 'ready'),
    });
    return true;
  }
  async function read() {
    const expected = revision;
    try {
      const value = await native.getUpdateState();
      if (!disposed && revision === expected) accept(value);
    } catch {
      // Initial/read-back failure leaves the last confirmed native state intact.
    }
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
    start() {
      if (started || disposed) return;
      started = true;
      off = native.onUpdateState(accept);
      void read();
    },
    async check() {
      if (!started || disposed || snapshot.checking || snapshot.installing) return;
      manual = true;
      update({ visible: true, checking: true });
      const expected = ++revision;
      try {
        const value = await native.checkUpdates();
        if (!disposed && revision === expected && !accept(value)) {
          accept({ status: 'error', message: 'Não foi possível verificar atualizações agora.' });
        }
      } catch {
        if (!disposed && revision === expected)
          accept({ status: 'error', message: 'Não foi possível verificar atualizações agora.' });
      } finally {
        update({ checking: false });
      }
    },
    async install() {
      if (
        !started ||
        disposed ||
        snapshot.installing ||
        snapshot.checking ||
        snapshot.state.status !== 'ready'
      )
        return;
      update({ installing: true });
      const expected = ++revision;
      try {
        const result = await native.installUpdate();
        if (
          !disposed &&
          revision === expected &&
          result &&
          typeof result === 'object' &&
          (result as Record<string, unknown>).pending === true
        )
          await read();
      } catch {
        if (!disposed && revision === expected)
          accept({
            status: 'error',
            message: 'Não foi possível reiniciar para atualizar. Tente novamente.',
          });
      } finally {
        update({ installing: false });
      }
    },
    close() {
      if (disposed) return;
      manual = false;
      update({ visible: false });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      off?.();
      listeners.clear();
    },
  };
}
export type DesktopUpdates = ReturnType<typeof createDesktopUpdates>;

export function desktopUpdatePresentation(snapshot: DesktopUpdateSnapshot) {
  const state = snapshot.state,
    ready = state.status === 'ready';
  const label = ready
    ? 'Atualização pronta'
    : state.status === 'downloading'
      ? 'Baixando · ' + state.percent + '%'
      : 'Windows ' + snapshot.currentVersion;
  const target = state.version
    ? 'de ' + snapshot.currentVersion + ' direto para ' + state.version
    : 'direto para a versão mais recente';
  const text = ready
    ? state.message ||
      'Atualização ' +
        target +
        ' pronta. Será instalada ao sair do app, ou você pode reiniciar agora.'
    : state.status === 'downloading'
      ? 'Atualizando ' + target + ' · ' + state.percent + '%'
      : state.status === 'checking'
        ? 'Buscando a versão mais recente…'
        : state.status === 'current'
          ? 'Você está na versão mais recente.'
          : state.status === 'development'
            ? 'Atualizador disponível na versão instalada.'
            : state.message || 'Verificar atualizações';
  return {
    label,
    text,
    ready,
    title: ready
      ? 'Atualizar diretamente para ' + (state.version || 'a versão mais recente')
      : 'Buscar versão mais recente',
    restart: state.version ? 'Instalar ' + state.version + ' e reiniciar' : 'Reiniciar e atualizar',
  };
}
