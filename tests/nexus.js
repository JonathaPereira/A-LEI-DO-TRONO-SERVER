'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const config = require('../frontend/nexus-config.js');
const {allowedGameURL, createNexusLauncher} = require('../desktop/app/nexus.cjs');

test('Nexus accepts playable itch URLs and rejects credentials, arbitrary pages and deceptive hosts', () => {
  for (const url of ['https://itch.io/embed-upload/123?color=000000', 'https://html-classic.itch.zone/html/123/index.html']) {
    assert(config.isEmbedURL(url)); assert(allowedGameURL(url, config));
  }
  assert(allowedGameURL(config.pageUrl, config));
  for (const url of ['https://itch.io/embed/123', 'https://itch.io.evil.test/embed-upload/123', 'https://user:pass@itch.io/embed-upload/123', 'http://itch.io/embed-upload/123', 'https://itch.io:9000/embed-upload/123', 'https://semchakra10.itch.io/other-game', 'https://a-lei-do-trono.surge.sh', 'javascript:alert(1)', 'file:///tmp/game.html']) {
    assert(!config.isEmbedURL(url), url); assert(!allowedGameURL(url, config), url);
  }
});

test('native launcher reuses an isolated game window and never grants media or app capabilities', async () => {
  let partition, checkPermission, requestPermission, answer = 0, quitting = false;
  const windows = [], gameSession = new EventEmitter();
  gameSession.setPermissionCheckHandler = handler => { checkPermission = handler; };
  gameSession.setPermissionRequestHandler = handler => { requestPermission = handler; };
  class FakeWindow extends EventEmitter {
    constructor(options) { super(); this.options = options; windows.push(this); this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = handler => { this.popup = handler; }; }
    setMenu() {} isDestroyed() { return !!this.destroyed; } isMinimized() { return false; }
    show() { this.shown = true; } focus() { this.focused = true; }
    async loadURL(url) { this.url = url; } destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const launcher = createNexusLauncher({BrowserWindow: FakeWindow, session: {fromPartition(name) { partition = name; return gameSession; }}, screen: {getDisplayMatching: () => ({workAreaSize: {width: 1920, height: 1080}})}, dialog: {showMessageBoxSync: () => answer}, parent: {getBounds: () => ({})}, config, isQuitting: () => quitting});
  await launcher.open(); await launcher.open();
  assert.equal(partition, 'persist:mn-nexus'); assert.equal(windows.length, 1);
  const viewer = windows[0], prefs = viewer.options.webPreferences;
  assert.equal(prefs.session, gameSession); assert.equal(prefs.preload, undefined);
  assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.sandbox, true);
  assert.equal(viewer.url, config.embedUrl || config.pageUrl); assert(viewer.focused);
  assert.deepEqual(viewer.popup({url: 'https://a-lei-do-trono.surge.sh'}), {action: 'deny'});
  for (const permission of ['media', 'display-capture', 'clipboard-read', 'notifications']) {
    assert.equal(checkPermission(viewer.webContents, permission, 'https://semchakra10.itch.io'), false);
    requestPermission(viewer.webContents, permission, allowed => assert.equal(allowed, false), {requestingUrl: config.pageUrl});
  }
  assert(checkPermission(viewer.webContents, 'fullscreen', 'https://html-classic.itch.zone'));
  assert(!checkPermission(viewer.webContents, 'fullscreen', 'https://evil.test'));
  for (const [eventName, url, expected] of [['will-navigate', config.pageUrl, false], ['will-navigate', 'https://a-lei-do-trono.surge.sh', true], ['will-redirect', 'https://evil.test', true]]) {
    let prevented = false; viewer.webContents.emit(eventName, {preventDefault() { prevented = true; }}, url, false, true); assert.equal(prevented, expected);
  }
  let prevented = false; gameSession.emit('will-download', {preventDefault() { prevented = true; }}); assert(prevented);
  const close = () => { let stopped = false; viewer.emit('close', {preventDefault() { stopped = true; }}); return stopped; };
  assert(close()); answer = 1; assert(!close()); answer = 0; quitting = true; assert(!close());
  viewer.destroy(); await launcher.open(); assert.equal(windows.length, 2);
});
