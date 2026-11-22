'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createGameOverlay,
  overlayConfigPayload,
  overlayStatePayload,
  overlayToastPayload,
  buildOverlayHtml,
  cornerBounds,
} = require('../electron/overlay.cjs');
const { DesktopPreferences } = require('../electron/preferences.cjs');
const { createDesktopOverlay } = require('../src/lib/desktop/overlay.ts');

function createFakeElectronEnv() {
  const windows = [];
  const registeredShortcuts = new Map();
  const screenEmitter = new EventEmitter();
  screenEmitter.getPrimaryDisplay = () => ({
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  });

  class FakeWebContents extends EventEmitter {
    constructor() {
      super();
      this.sent = [];
      this.windowOpenHandler = null;
    }
    setWindowOpenHandler(fn) {
      this.windowOpenHandler = fn;
    }
    send(channel, payload) {
      this.sent.push({ channel, payload });
    }
  }

  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new FakeWebContents();
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.visible = false;
      this.destroyed = false;
      this.alwaysOnTopCalls = [];
      this.ignoreMouseCalls = [];
      this.loadedUrls = [];
      windows.push(this);
    }
    setMenu(menu) {
      this.menu = menu;
    }
    setBounds(bounds) {
      this.bounds = bounds;
    }
    setAlwaysOnTop(flag, level) {
      this.alwaysOnTopCalls.push({ flag, level });
    }
    setVisibleOnAllWorkspaces(flag, opts) {
      this.allWorkspaces = { flag, opts };
    }
    setIgnoreMouseEvents(ignore, opts) {
      this.ignoreMouseCalls.push({ ignore, opts });
    }
    loadURL(url) {
      this.loadedUrls.push(url);
      this.webContents.emit('did-finish-load');
      return Promise.resolve();
    }
    isVisible() {
      return this.visible;
    }
    isDestroyed() {
      return this.destroyed;
    }
    showInactive() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
    destroy() {
      this.destroyed = true;
      this.visible = false;
      this.emit('closed');
    }
  }

  const globalShortcut = {
    register(accel, cb) {
      registeredShortcuts.set(accel, cb);
      return true;
    },
    unregister(accel) {
      registeredShortcuts.delete(accel);
    },
  };

  return {
    windows,
    registeredShortcuts,
    screen: screenEmitter,
    BrowserWindow: FakeBrowserWindow,
    globalShortcut,
  };
}

test('overlay payload validators enforce strict bounds and reject malformed inputs', () => {
  assert.throws(() => overlayStatePayload(null));
  assert.throws(() => overlayStatePayload({ inCall: 'yes', participants: [] }));
  assert.throws(() => overlayStatePayload({ inCall: true, participants: [null] }));
  assert.throws(() =>
    overlayStatePayload({
      inCall: true,
      participants: Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, name: 'P' })),
    }),
  );
  assert.throws(() => overlayToastPayload({ key: '', title: 'Oi' }));
  assert.throws(() => overlayToastPayload({ key: 'k1', title: '   ' }));
  assert.throws(() => overlayConfigPayload({ enabled: true, unknownField: 1 }));

  const validState = overlayStatePayload({
    inCall: true,
    sharingScreen: true,
    participants: [
      {
        id: 'p1',
        name: 'Alice',
        speaking: true,
        muted: false,
        avatarUrl: 'https://cdn.example.test/a.png',
      },
      {
        id: 'p2',
        name: 'Bruno',
        speaking: false,
        muted: true,
        avatarUrl: 'javascript:alert(1)',
      },
    ],
    watchers: [{ id: 'w1', name: 'Carlos' }],
  });
  assert.equal(validState.participants[0].avatarUrl, 'https://cdn.example.test/a.png');
  assert.equal(validState.participants[1].avatarUrl, undefined);
  assert.equal(validState.watchers.length, 1);

  const html = buildOverlayHtml();
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.equal(html.includes('<script'), false);
});

test('createGameOverlay enforces transparent click-through screen-saver window, corner layout, DND, shortcut, and clean dispose', async () => {
  const env = createFakeElectronEnv();
  let mainFocused = false;
  let dnd = false;
  const scheduled = [];
  const configEvents = [];

  const overlay = createGameOverlay({
    BrowserWindow: env.BrowserWindow,
    screen: env.screen,
    globalShortcut: env.globalShortcut,
    isMainFocused: () => mainFocused,
    getDnd: () => dnd,
    initialConfig: {
      enabled: false,
      corner: 'top-left',
      opacity: 0.85,
      hideWhenIdle: true,
      shortcut: 'Control+Shift+O',
    },
    onConfigChanged: (cfg) => configEvents.push(cfg),
    setTimer: (fn, ms) => {
      const token = { fn, ms, cleared: false };
      scheduled.push(token);
      return token;
    },
    clearTimer: (token) => {
      if (token) token.cleared = true;
    },
  });

  try {
    // Shortcut registered even before overlay is enabled so user can toggle it in-game
    assert.equal(env.registeredShortcuts.has('Control+Shift+O'), true);
    assert.equal(env.windows.length, 0);

    // Enable overlay while idle (hideWhenIdle = true -> window not shown yet)
    await overlay.configure({ enabled: true, corner: 'bottom-right', opacity: 0.75 });
    assert.equal(env.windows.length, 0);

    // Push active voice call + live screen watchers -> creates secure overlay window
    overlay.updateState({
      inCall: true,
      sharingScreen: true,
      participants: [{ id: '1', name: 'Alice', speaking: true, muted: false }],
      watchers: [{ id: '2', name: 'Bruno' }],
    });
    assert.equal(env.windows.length, 1);
    const win = env.windows[0];
    assert.equal(win.options.transparent, true);
    assert.equal(win.options.frame, false);
    assert.equal(win.options.skipTaskbar, true);
    assert.equal(win.options.focusable, false);
    assert.equal(win.options.resizable, false);
    assert.equal(win.options.hasShadow, false);
    assert.equal(win.options.alwaysOnTop, true);
    assert.equal(win.options.webPreferences.nodeIntegration, false);
    assert.equal(win.options.webPreferences.contextIsolation, true);
    assert.equal(win.options.webPreferences.sandbox, true);
    assert.equal(
      win.alwaysOnTopCalls.some((c) => c.flag === true && c.level === 'screen-saver'),
      true,
    );
    assert.deepEqual(win.ignoreMouseCalls.at(-1), { ignore: true, opts: { forward: true } });
    assert.equal(win.visible, true);
    assert.deepEqual(
      win.bounds,
      cornerBounds({ x: 0, y: 0, width: 1920, height: 1040 }, 'bottom-right'),
    );
    assert.deepEqual(win.webContents.windowOpenHandler(), { action: 'deny' });

    const lastRender = win.webContents.sent.at(-1);
    assert.equal(lastRender.channel, 'mn:overlay-render');
    assert.equal(lastRender.payload.corner, 'bottom-right');
    assert.equal(lastRender.payload.opacity, 0.75);
    assert.equal(lastRender.payload.participants[0].speaking, true);
    assert.equal(lastRender.payload.watchers[0].name, 'Bruno');

    // Notification mini-toast works when unfocused and not DND, expires after timer
    assert.equal(overlay.shouldDisplayToast(), true);
    const toastRes = overlay.pushToast({
      key: 't1',
      title: 'Bruno',
      body: 'Bora jogar?',
      imageUrl: 'https://cdn.example.test/thumb.png',
    });
    assert.equal(toastRes.shown, true);
    assert.equal(win.webContents.sent.at(-1).payload.toasts.length, 1);

    // DND suppresses overlay toasts
    dnd = true;
    assert.equal(overlay.shouldDisplayToast(), false);
    assert.equal(overlay.pushToast({ key: 't2', title: 'X', body: 'Y' }).reason, 'dnd');
    dnd = false;

    // Focused main window suppresses non-forced overlay toasts
    mainFocused = true;
    assert.equal(overlay.shouldDisplayToast(), false);
    assert.equal(overlay.pushToast({ key: 't3', title: 'X', body: 'Y' }).reason, 'focused');
    mainFocused = false;

    // Trigger expiry timers and leave call -> hideWhenIdle hides overlay
    for (const t of scheduled) if (!t.cleared) t.fn();
    overlay.updateState({ inCall: false, sharingScreen: false, participants: [], watchers: [] });
    assert.equal(win.visible, false);

    // Global shortcut toggles enabled off & destroys window
    await env.registeredShortcuts.get('Control+Shift+O')();
    assert.equal(overlay.getConfig().enabled, false);
    assert.equal(win.destroyed, true);
    assert.equal(configEvents.at(-1).enabled, false);
  } finally {
    overlay.dispose();
    assert.equal(env.registeredShortcuts.size, 0);
  }
});

test('renderer overlay controller diffs and throttles state updates to avoid redundant IPC', async () => {
  const sentStates = [];
  let stageState = {
    inCall: true,
    sharingScreen: false,
    participants: [{ id: '1', name: 'Alice', speaking: false, muted: false, deafened: false }],
    watchers: [],
  };
  let stageListener = null;
  let clock = 1000;
  let scheduledFn = null;

  const controller = createDesktopOverlay({
    native: {
      getOverlayConfig: async () => ({
        enabled: true,
        corner: 'top-left',
        opacity: 0.9,
        hideWhenIdle: true,
        shortcut: 'Control+Shift+O',
      }),
      configureOverlay: async (patch) => ({
        enabled: true,
        corner: 'top-left',
        opacity: 0.9,
        hideWhenIdle: true,
        shortcut: 'Control+Shift+O',
        ...patch,
      }),
      updateOverlayState: async (state) => {
        sentStates.push(state);
      },
      pushOverlayToast: async () => ({ shown: true }),
    },
    readStageState: () => stageState,
    subscribeStage: (fn) => {
      stageListener = fn;
      return () => {
        stageListener = null;
      };
    },
    throttleMs: 120,
    now: () => clock,
    schedule: (fn) => {
      scheduledFn = fn;
      return () => {
        scheduledFn = null;
      };
    },
  });

  try {
    controller.start();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(sentStates.length, 1);

    // Identical state triggers ZERO extra IPC calls
    clock += 500;
    stageListener();
    assert.equal(sentStates.length, 1);

    // First real change after idle window sends immediately (leading edge)
    stageState = {
      ...stageState,
      participants: [{ id: '1', name: 'Alice', speaking: true, muted: false, deafened: false }],
    };
    stageListener();
    assert.equal(sentStates.length, 2);

    // Rapid changes within 120ms throttle window coalesce into a single trailing IPC send
    clock += 20;
    stageState = {
      ...stageState,
      participants: [{ id: '1', name: 'Alice', speaking: false, muted: false, deafened: false }],
    };
    stageListener();
    clock += 20;
    stageState = {
      ...stageState,
      participants: [{ id: '1', name: 'Alice', speaking: true, muted: true, deafened: false }],
    };
    stageListener();
    assert.equal(sentStates.length, 2);
    assert.ok(scheduledFn);

    clock += 130;
    scheduledFn();
    assert.equal(sentStates.length, 3);
    assert.equal(sentStates[2].participants[0].muted, true);
  } finally {
    controller.dispose();
  }
});

test('DesktopPreferences persists presence status per account and overlay config atomically', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mn-pref-overlay-'));
  const fakeSafeStorage = { isEncryptionAvailable: () => false };
  try {
    const prefs = new DesktopPreferences(dir, fakeSafeStorage);
    await prefs.load();
    assert.equal(prefs.getPresenceStatus('acc-1'), 'online');
    await prefs.setPresenceStatus('acc-1', 'dnd');
    await prefs.setPresenceStatus('acc-2', 'away');
    await prefs.setOverlayConfig({
      enabled: true,
      corner: 'top-right',
      opacity: 0.72,
      hideWhenIdle: false,
      shortcut: 'Control+Shift+O',
    });

    const reloaded = new DesktopPreferences(dir, fakeSafeStorage);
    await reloaded.load();
    assert.equal(reloaded.getPresenceStatus('acc-1'), 'dnd');
    assert.equal(reloaded.getPresenceStatus('acc-2'), 'away');
    assert.deepEqual(reloaded.getOverlayConfig(), {
      enabled: true,
      corner: 'top-right',
      opacity: 0.72,
      hideWhenIdle: false,
      shortcut: 'Control+Shift+O',
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
