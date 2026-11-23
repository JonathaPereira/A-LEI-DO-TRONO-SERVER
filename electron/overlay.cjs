'use strict';
const path = require('node:path');
const { DEFAULT_OVERLAY, normalizeOverlay } = require('./preferences.cjs');

const { accelerator: buildAccelerator } = require('./policy.cjs');

const OVERLAY_WIDTH = 300;
const OVERLAY_HEIGHT = 440;
const MARGIN = 14;
const TOAST_TTL_MS = 4000;
const TOAST_FADE_MS = 350;
const MODIFIER_NAMES = new Set(['Control', 'Alt', 'Shift', 'Super']);
const KEY_PATTERN = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4]))$/;

function validateShortcutString(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 40) throw Error('Atalho inválido.');
  const parts = value.split('+').filter(Boolean);
  if (!parts.length) throw Error('Atalho inválido.');
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  if (!KEY_PATTERN.test(key)) throw Error('Atalho inválido.');
  const seen = new Set();
  for (const mod of modifiers) {
    if (!MODIFIER_NAMES.has(mod) || seen.has(mod)) throw Error('Atalho inválido.');
    seen.add(mod);
  }
  const code = /^[A-Z]$/.test(key) ? 'Key' + key : /^[0-9]$/.test(key) ? 'Digit' + key : key;
  return buildAccelerator({
    code,
    ctrl: seen.has('Control'),
    alt: seen.has('Alt'),
    shift: seen.has('Shift'),
    meta: seen.has('Super'),
  });
}

function readSafeUrl(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 4096) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href;
  } catch {}
  return undefined;
}

function readParticipant(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid overlay participant');
  if (typeof value.id !== 'string' || !value.id || value.id.length > 128)
    throw Error('Invalid overlay participant');
  if (typeof value.name !== 'string' || value.name.length > 80)
    throw Error('Invalid overlay participant');
  const avatarUrl = readSafeUrl(value.avatarUrl);
  return {
    id: value.id,
    name: value.name.trim().slice(0, 24) || 'Participante',
    speaking: value.speaking === true,
    muted: value.muted === true,
    deafened: value.deafened === true,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function readWatcher(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid overlay watcher');
  if (typeof value.id !== 'string' || !value.id || value.id.length > 128)
    throw Error('Invalid overlay watcher');
  if (typeof value.name !== 'string' || value.name.length > 80)
    throw Error('Invalid overlay watcher');
  const avatarUrl = readSafeUrl(value.avatarUrl);
  return {
    id: value.id,
    name: value.name.trim().slice(0, 20) || 'Espectador',
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function overlayStatePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid overlay state');
  if (typeof value.inCall !== 'boolean') throw Error('Invalid overlay state');
  if (value.sharingScreen !== undefined && typeof value.sharingScreen !== 'boolean')
    throw Error('Invalid overlay state');
  if (!Array.isArray(value.participants) || value.participants.length > 24)
    throw Error('Invalid overlay state');
  if (
    value.watchers !== undefined &&
    (!Array.isArray(value.watchers) || value.watchers.length > 24)
  )
    throw Error('Invalid overlay state');
  return {
    inCall: value.inCall,
    sharingScreen: value.sharingScreen === true,
    participants: value.participants.slice(0, 12).map(readParticipant),
    watchers: (value.watchers || []).slice(0, 12).map(readWatcher),
  };
}

function overlayToastPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid overlay toast');
  if (typeof value.key !== 'string' || !value.key || value.key.length > 180)
    throw Error('Invalid overlay toast');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120)
    throw Error('Invalid overlay toast');
  if (value.body !== undefined && (typeof value.body !== 'string' || value.body.length > 260))
    throw Error('Invalid overlay toast');
  const imageUrl = readSafeUrl(value.imageUrl);
  return {
    key: value.key,
    title: value.title.trim().slice(0, 100),
    body: typeof value.body === 'string' ? value.body.trim().slice(0, 180) : '',
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function overlayConfigPayload(value, fallback = DEFAULT_OVERLAY) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid overlay config');
  const allowedKeys = new Set(['enabled', 'corner', 'opacity', 'hideWhenIdle', 'shortcut']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw Error('Invalid overlay config');
  }
  const patch = { ...value };
  if ('shortcut' in patch) {
    if (patch.shortcut && typeof patch.shortcut === 'object') {
      patch.shortcut = buildAccelerator(patch.shortcut);
    } else {
      patch.shortcut = validateShortcutString(patch.shortcut);
    }
  }
  return normalizeOverlay(patch, fallback);
}

function buildOverlayHtml() {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;">` +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0;user-select:none}' +
    'html,body{width:100%;height:100%;overflow:hidden;background:transparent;font:600 12px/1.35 "Segoe UI",system-ui,sans-serif;color:#f3f4f6;pointer-events:none}' +
    '#overlayRoot{width:100%;height:100%;display:flex;flex-direction:column;gap:8px;padding:4px;transition:opacity 180ms ease}' +
    '#overlayRoot[data-corner="top-left"]{align-items:flex-start;justify-content:flex-start}' +
    '#overlayRoot[data-corner="top-right"]{align-items:flex-end;justify-content:flex-start}' +
    '#overlayRoot[data-corner="bottom-left"]{align-items:flex-start;justify-content:flex-end}' +
    '#overlayRoot[data-corner="bottom-right"]{align-items:flex-end;justify-content:flex-end}' +
    '.ov-voice-list{display:flex;flex-direction:column;gap:5px;max-width:220px}' +
    '.ov-voice-row{display:inline-flex;align-items:center;gap:7px;padding:3px 9px 3px 4px;border-radius:999px;background:rgba(16,17,22,0.72);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(6px);transition:border-color 140ms ease,background 140ms ease}' +
    '.ov-voice-row.speaking{border-color:rgba(74,222,128,0.75);background:rgba(18,28,22,0.82)}' +
    '.ov-avatar{position:relative;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:#2b2f3a;color:#e8d8b2;overflow:hidden;flex-shrink:0;font-weight:700}' +
    '.ov-avatar img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.ov-avatar-sm{width:24px;height:24px;font-size:10px;box-shadow:0 0 0 2px transparent;transition:box-shadow 120ms ease}' +
    '.ov-avatar-sm.speaking{box-shadow:0 0 0 2px #4ade80,0 0 10px rgba(74,222,128,0.55)}' +
    '.ov-avatar-xs{width:18px;height:18px;font-size:8px;border:1px solid rgba(16,17,22,0.9);margin-left:-4px}' +
    '.ov-avatar-xs:first-child{margin-left:0}' +
    '.ov-voice-name{max-width:128px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#f1f3f5;text-shadow:0 1px 2px rgba(0,0,0,0.65)}' +
    '.ov-muted-icon{width:13px;height:13px;color:#f87171;flex-shrink:0;opacity:0.92}' +
    '.ov-watchers-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;background:rgba(20,22,30,0.78);border:1px solid rgba(214,183,121,0.34);max-width:255px}' +
    '.ov-eye-icon{width:13px;height:13px;color:#e0c07f;flex-shrink:0}' +
    '.ov-watchers-count{font-size:11px;color:#e8d5a8;font-weight:700}' +
    '.ov-watcher-avatars{display:inline-flex;align-items:center}' +
    '.ov-watcher-names{font-size:11px;font-weight:500;color:#d6dae3;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ov-toast-list{display:flex;flex-direction:column;gap:6px;width:276px}' +
    '.ov-toast{padding:8px 11px;border-radius:10px;background:rgba(18,19,26,0.86);border:1px solid rgba(214,183,121,0.3);box-shadow:0 8px 22px rgba(0,0,0,0.45);transition:opacity 300ms ease,transform 300ms ease}' +
    '.ov-toast.fading{opacity:0;transform:translateY(-4px)}' +
    '.ov-toast-title{font-size:12px;font-weight:700;color:#eed7a5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ov-toast-body{margin-top:2px;font-size:11.5px;font-weight:400;color:#e3e6ee;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}' +
    '.ov-toast-image{display:block;margin-top:6px;max-width:100%;max-height:96px;border-radius:6px;object-fit:cover;border:1px solid rgba(255,255,255,0.1)}' +
    '</style></head><body><div id="overlayRoot" data-corner="top-left"></div></body></html>'
  );
}

function cornerBounds(area, corner) {
  const width = Math.min(OVERLAY_WIDTH, Math.max(220, area.width - MARGIN * 2));
  const height = Math.min(OVERLAY_HEIGHT, Math.max(200, area.height - MARGIN * 2));
  const right = corner === 'top-right' || corner === 'bottom-right';
  const bottom = corner === 'bottom-left' || corner === 'bottom-right';
  const x = right ? area.x + area.width - width - MARGIN : area.x + MARGIN;
  const y = bottom ? area.y + area.height - height - MARGIN : area.y + MARGIN;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function createGameOverlay({
  BrowserWindow,
  screen,
  globalShortcut,
  isMainFocused = () => false,
  getDnd = () => false,
  getBlockedShortcuts = () => [],
  initialConfig = DEFAULT_OVERLAY,
  saveConfig,
  onConfigChanged,
  preloadPath = path.join(__dirname, 'overlay-preload.cjs'),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let config = normalizeOverlay(initialConfig, DEFAULT_OVERLAY);
  let state = { inCall: false, sharingScreen: false, participants: [], watchers: [] };
  let win = null;
  let ready = false;
  let disposed = false;
  let registeredShortcut = '';
  let shortcutError = '';
  const toasts = [];
  const toastTimers = new Map();

  function publicConfig() {
    return {
      ...config,
      shortcutRegistered: Boolean(config.shortcut && registeredShortcut === config.shortcut),
      shortcutError,
    };
  }

  function unregisterShortcut() {
    if (!registeredShortcut) return;
    try {
      globalShortcut?.unregister(registeredShortcut);
    } catch {}
    registeredShortcut = '';
  }

  function registerShortcut() {
    unregisterShortcut();
    shortcutError = '';
    if (disposed || !config.shortcut || !globalShortcut?.register) return;
    const blocked = new Set((getBlockedShortcuts() || []).filter(Boolean));
    if (blocked.has(config.shortcut)) {
      shortcutError = 'Esse atalho já está sendo usado pelos Clipes. Escolha outra combinação.';
      return;
    }
    try {
      if (
        globalShortcut.register(config.shortcut, () => void toggleEnabled({ fromShortcut: true }))
      ) {
        registeredShortcut = config.shortcut;
      } else {
        shortcutError = 'Atalho ocupado por outro aplicativo no Windows. Escolha outra combinação.';
      }
    } catch {
      shortcutError = 'Não foi possível registrar esse atalho global no Windows.';
    }
  }

  function hasActiveContent() {
    return (
      (state.inCall && state.participants.length > 0) ||
      (state.sharingScreen && state.watchers.length > 0) ||
      toasts.length > 0
    );
  }

  function positionWindow() {
    if (!win || win.isDestroyed?.()) return;
    const area = screen.getPrimaryDisplay().workArea;
    win.setBounds(cornerBounds(area, config.corner));
  }

  function ensureWindow() {
    if (disposed) return null;
    if (win && !win.isDestroyed?.()) return win;
    ready = false;
    const area = screen.getPrimaryDisplay().workArea;
    const bounds = cornerBounds(area, config.corner);
    const created = new BrowserWindow({
      ...bounds,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: false,
      hasShadow: false,
      show: false,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: preloadPath,
      },
    });
    created.setMenu?.(null);
    created.setAlwaysOnTop?.(true, 'screen-saver', 1);
    created.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    created.setIgnoreMouseEvents?.(true, { forward: true });
    created.webContents?.setWindowOpenHandler?.(() => ({ action: 'deny' }));
    created.webContents?.on?.('will-navigate', (event) => event.preventDefault());
    created.webContents?.on?.('will-attach-webview', (event) => event.preventDefault());
    created.webContents?.on?.('did-finish-load', () => {
      if (win === created && !disposed) {
        ready = true;
        pushRender();
      }
    });
    created.webContents?.on?.('render-process-gone', () => {
      if (win === created) {
        win = null;
        ready = false;
      }
    });
    created.on?.('closed', () => {
      if (win === created) {
        win = null;
        ready = false;
      }
    });
    win = created;
    void Promise.resolve(
      created.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildOverlayHtml())),
    ).catch(() => {});
    return created;
  }

  function destroyWindow() {
    if (!win) return;
    const old = win;
    win = null;
    ready = false;
    try {
      if (!old.isDestroyed?.()) old.destroy();
    } catch {}
  }

  function pushRender() {
    if (disposed) return;
    if (!config.enabled) {
      destroyWindow();
      return;
    }
    const shouldShow = !config.hideWhenIdle || hasActiveContent();
    if (!shouldShow) {
      if (win && !win.isDestroyed?.()) win.hide?.();
      return;
    }
    const target = ensureWindow();
    if (!target || target.isDestroyed?.()) return;
    positionWindow();
    target.setAlwaysOnTop?.(true, 'screen-saver', 1);
    target.setIgnoreMouseEvents?.(true, { forward: true });
    if (ready) {
      target.webContents?.send?.('mn:overlay-render', {
        corner: config.corner,
        opacity: config.opacity,
        inCall: state.inCall,
        sharingScreen: state.sharingScreen,
        participants: state.participants,
        watchers: state.watchers,
        toasts: toasts.map((t) => ({
          key: t.key,
          title: t.title,
          body: t.body,
          imageUrl: t.imageUrl,
          fading: t.fading,
        })),
      });
    }
    if (!target.isVisible?.()) {
      if (typeof target.showInactive === 'function') target.showInactive();
      else target.show?.();
    }
    target.moveTop?.();
  }

  function clearToastTimers(key) {
    const timers = toastTimers.get(key);
    if (!timers) return;
    clearTimer(timers.fade);
    clearTimer(timers.remove);
    toastTimers.delete(key);
  }

  function removeToast(key) {
    clearToastTimers(key);
    const idx = toasts.findIndex((item) => item.key === key);
    if (idx !== -1) {
      toasts.splice(idx, 1);
      pushRender();
    }
  }

  function clearAllToasts() {
    for (const key of [...toastTimers.keys()]) clearToastTimers(key);
    toasts.length = 0;
  }

  function pushToast(raw, { force = false } = {}) {
    if (disposed) return { shown: false, reason: 'disposed' };
    const toast = overlayToastPayload(raw);
    if (!config.enabled) return { shown: false, reason: 'disabled' };
    if (!force && getDnd()) return { shown: false, reason: 'dnd' };
    if (!force && isMainFocused()) return { shown: false, reason: 'focused' };
    const existingIndex = toasts.findIndex((item) => item.key === toast.key);
    if (existingIndex !== -1) {
      clearToastTimers(toast.key);
      toasts.splice(existingIndex, 1);
    }
    const entry = { ...toast, fading: false };
    toasts.unshift(entry);
    while (toasts.length > 3) {
      const removed = toasts.pop();
      if (removed) clearToastTimers(removed.key);
    }
    const fade = setTimer(() => {
      entry.fading = true;
      pushRender();
    }, TOAST_TTL_MS - TOAST_FADE_MS);
    const remove = setTimer(() => removeToast(toast.key), TOAST_TTL_MS);
    fade?.unref?.();
    remove?.unref?.();
    toastTimers.set(toast.key, { fade, remove });
    pushRender();
    return { shown: true };
  }

  function updateState(raw) {
    if (disposed) return { ok: false };
    state = overlayStatePayload(raw);
    pushRender();
    return { ok: true };
  }

  async function configure(patch) {
    if (disposed) return publicConfig();
    const next = overlayConfigPayload(patch, config);
    const saved = saveConfig ? await saveConfig(next) : next;
    config = normalizeOverlay(saved, next);
    registerShortcut();
    if (!config.enabled) clearAllToasts();
    pushRender();
    const result = publicConfig();
    onConfigChanged?.(result);
    return result;
  }

  async function toggleEnabled({ fromShortcut = false } = {}) {
    const turningOn = !config.enabled;
    const result = await configure({ enabled: turningOn });
    if (fromShortcut && turningOn && !hasActiveContent()) {
      pushToast(
        {
          key: 'overlay-toggled-on',
          title: 'M&N · Overlay ativado',
          body: 'Quando você entrar em call ou receber mensagens, elas aparecerão aqui.',
        },
        { force: true },
      );
    }
    return result;
  }

  function handleDisplayChange() {
    if (!disposed && win && !win.isDestroyed?.()) positionWindow();
  }

  screen?.on?.('display-metrics-changed', handleDisplayChange);
  screen?.on?.('display-removed', handleDisplayChange);
  registerShortcut();
  if (config.enabled) pushRender();

  return {
    getConfig: publicConfig,
    configure,
    toggleEnabled,
    updateState,
    pushToast,
    shouldDisplayToast: () => !disposed && config.enabled && !getDnd() && !isMainFocused(),
    clearToasts() {
      clearAllToasts();
      pushRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      screen?.removeListener?.('display-metrics-changed', handleDisplayChange);
      screen?.removeListener?.('display-removed', handleDisplayChange);
      unregisterShortcut();
      clearAllToasts();
      destroyWindow();
    },
  };
}

module.exports = {
  createGameOverlay,
  overlayConfigPayload,
  overlayStatePayload,
  overlayToastPayload,
  validateShortcutString,
  buildOverlayHtml,
  cornerBounds,
};
