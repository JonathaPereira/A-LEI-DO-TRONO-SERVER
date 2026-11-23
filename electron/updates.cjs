'use strict';
const UPDATE_URL = 'https://a-lei-do-trono.surge.sh/downloads/';
const RELEASE_PAGE_URL = 'https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases/latest';
const DEFAULT_RETRY_DELAYS_MS = [3000, 10000, 25000];

function createUpdates({
  updater,
  enabled,
  publish,
  confirm,
  shouldConfirm = () => true,
  prepareInstall,
  retryDelays = DEFAULT_RETRY_DELAYS_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let state = { status: enabled ? 'idle' : 'development' },
    checking = false,
    failedInCheck = false,
    cachedReady = null,
    retryCount = 0,
    retryTimer = null,
    disposed = false;
  const set = (value) => {
    state = { ...value };
    publish(state);
  };
  const cancelRetry = () => {
    if (retryTimer !== null) {
      clearTimer(retryTimer);
      retryTimer = null;
    }
  };
  const scheduleRetry = () => {
    if (disposed || !enabled || !retryDelays.length || retryCount >= retryDelays.length) {
      return false;
    }
    const delay = retryDelays[retryCount++];
    cancelRetry();
    retryTimer = setTimer(() => {
      retryTimer = null;
      if (!disposed) void check({ force: true, fromRetry: true });
    }, delay);
    retryTimer?.unref?.();
    return true;
  };
  const failed = () => {
    failedInCheck = true;
    const fallback = cachedReady || (state.status === 'ready' ? state : null);
    if (fallback && state.status !== 'downloading') {
      set({
        ...fallback,
        message:
          'Não foi possível consultar uma versão mais recente. A atualização já baixada continua pronta.',
      });
      cachedReady = null;
    } else {
      const willRetry = state.status === 'downloading' && scheduleRetry();
      set({
        status: 'error',
        message: willRetry
          ? 'Oscilação no download. Tentando baixar novamente automaticamente…'
          : 'Não foi possível verificar ou baixar a atualização. Clique em tentar novamente ou baixe o instalador direto.',
      });
    }
  };
  if (enabled) {
    // latest.yml points to the public GitHub Release installer + blockmap for fast differential downloads.
    updater.setFeedURL({ provider: 'generic', url: UPDATE_URL });
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.disableDifferentialDownload = false;
    updater.allowDowngrade = false;
    updater.on('checking-for-update', () => set({ status: 'checking' }));
    updater.on('update-available', (info) => {
      cancelRetry();
      cachedReady = null;
      set({ status: 'downloading', version: info.version, percent: 0 });
    });
    updater.on('download-progress', (progress) =>
      set({
        ...state,
        status: 'downloading',
        percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      }),
    );
    updater.on('update-not-available', () => {
      cancelRetry();
      retryCount = 0;
      set(cachedReady || { status: 'current' });
      cachedReady = null;
    });
    updater.on('update-downloaded', (info) => {
      cancelRetry();
      retryCount = 0;
      set({ status: 'ready', version: info.version });
    });
    updater.on('error', failed);
  }
  async function check({ force = false, fromRetry = false } = {}) {
    if (!enabled || disposed) return state;
    if (checking || state.status === 'downloading' || (state.status === 'ready' && !force))
      return state;
    if (!fromRetry) {
      cancelRetry();
      retryCount = 0;
    }
    cachedReady = state.status === 'ready' ? { ...state } : null;
    checking = true;
    failedInCheck = false;
    try {
      await updater.checkForUpdates();
    } catch {
      if (!failedInCheck) failed();
    } finally {
      checking = false;
    }
    return state;
  }
  return {
    get state() {
      return { ...state };
    },
    check,
    async install() {
      if (state.status !== 'ready') throw Error('Nenhuma atualização pronta para instalar.');
      const version = state.version;
      if (shouldConfirm() && !(await confirm())) return { canceled: true };
      if (state.status !== 'ready' || state.version !== version) return { pending: true };
      cancelRetry();
      prepareInstall();
      // Silent NSIS install + automatic relaunch for 1-click frictionless update.
      updater.quitAndInstall(true, true);
      return { restarting: true };
    },
    dispose() {
      disposed = true;
      cancelRetry();
    },
  };
}
module.exports = { createUpdates, UPDATE_URL, RELEASE_PAGE_URL };
