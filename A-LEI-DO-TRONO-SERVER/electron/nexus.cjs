'use strict';

const { nexusConfig } = require('./nexus-config.cjs');

function allowedGameURL(value, config = nexusConfig) {
  try {
    const url = new URL(value),
      page = new URL(config.pageUrl);
    return (
      !url.username &&
      !url.password &&
      !url.port &&
      url.protocol === 'https:' &&
      ((url.origin === page.origin &&
        url.pathname.replace(/\/$/, '') === page.pathname.replace(/\/$/, '')) ||
        config.isEmbedURL(value))
    );
  } catch {
    return false;
  }
}

// A foreign game must never use the privileged app session or preload bridge.
function createNexusLauncher({
  BrowserWindow,
  session,
  screen,
  dialog,
  parent,
  icon,
  config = nexusConfig,
  isQuitting = () => false,
  partition = 'persist:mn-nexus',
  windowTitle = 'Nexus · Ecos do Crepúsculo',
  closeMessage = 'Fechar o Nexus?',
  closeDetail = 'Uma partida PvP em andamento pode terminar por desconexão. A chamada do Trono continua.',
  allowDownload = () => false,
  extraOrigins = ['https://itch.io', 'https://html-classic.itch.zone'],
}) {
  const gameSession = session.fromPartition(partition);
  const gameOrigin = (value) => {
    try {
      return [new URL(config.pageUrl).origin, ...extraOrigins].includes(new URL(value).origin);
    } catch {
      return false;
    }
  };
  gameSession.setPermissionCheckHandler(
    (_contents, permission, origin) => permission === 'fullscreen' && gameOrigin(origin),
  );
  gameSession.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(permission === 'fullscreen' && gameOrigin(details.requestingUrl || contents.getURL())),
  );
  gameSession.on('will-download', (event, item) => {
    if (!allowDownload(item)) event.preventDefault();
  });
  let viewer = null;
  async function open() {
    if (viewer && !viewer.isDestroyed()) {
      if (viewer.isMinimized()) viewer.restore();
      viewer.show();
      viewer.focus();
      return { opened: true };
    }
    const area = screen.getDisplayMatching(parent.getBounds()).workAreaSize;
    viewer = new BrowserWindow({
      title: windowTitle,
      icon,
      width: Math.min(1280, area.width),
      height: Math.min(900, area.height),
      minWidth: Math.min(480, area.width),
      minHeight: Math.min(420, area.height),
      backgroundColor: '#080d18',
      fullscreenable: true,
      webPreferences: {
        session: gameSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    const current = viewer;
    current.setMenu(null);
    // The game needs no popups, app IPC, camera, microphone or screen capture.
    current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    current.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F11' && !input.isAutoRepeat) {
        event.preventDefault();
        current.setFullScreen(!current.isFullScreen());
      }
    });
    current.webContents.on('will-attach-webview', (event) => event.preventDefault());
    current.webContents.on('will-navigate', (event, url) => {
      if (!allowedGameURL(url, config)) event.preventDefault();
    });
    current.webContents.on('will-redirect', (event, url, _inPlace, mainFrame) => {
      if (mainFrame !== false && !allowedGameURL(url, config)) event.preventDefault();
    });
    current.on('close', (event) => {
      if (
        !isQuitting() &&
        dialog.showMessageBoxSync(current, {
          type: 'question',
          buttons: ['Continuar jogando', 'Fechar jogo'],
          defaultId: 0,
          cancelId: 0,
          message: closeMessage,
          detail: closeDetail,
        }) === 0
      )
        event.preventDefault();
    });
    current.on('closed', () => {
      if (viewer === current) viewer = null;
    });
    try {
      await current.loadURL(config.embedUrl || config.pageUrl);
    } catch (error) {
      if (!current.isDestroyed()) current.destroy();
      throw error;
    }
    return { opened: true };
  }
  return { open };
}

module.exports = { allowedGameURL, createNexusLauncher, nexusConfig };
