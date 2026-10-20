'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDesktopClipBridge } = require('../src/lib/clips/desktop-bridge.ts');
const token = 'ab'.repeat(32);
const config = () => ({
  active: true,
  shortcut: { code: 'KeyK', ctrl: true, shift: true, alt: false, meta: false },
});
function fixture() {
  const connections = [],
    remembered = [],
    timers = new Set();
  let clips = 0;
  const options = {
    initialCode: '',
    createSocket(url) {
      assert.equal(url, 'ws://127.0.0.1:32196/clips');
      const socket = {
        readyState: 0,
        sent: [],
        closed: 0,
        send(raw) {
          if (this.failSend) throw Error('disconnected');
          this.sent.push(JSON.parse(raw));
        },
        close() {
          this.closed++;
          this.readyState = 3;
        },
        open() {
          this.readyState = 1;
          this.onopen?.();
        },
        receive(value) {
          this.onmessage?.({ data: JSON.stringify(value) });
        },
      };
      connections.push(socket);
      return socket;
    },
    remember: (code) => remembered.push(code),
    clip: () => clips++,
    setTimer(callback, delay) {
      assert.equal(delay, 30000);
      const timer = { callback };
      timers.add(timer);
      return timer;
    },
    clearTimer(timer) {
      timers.delete(timer);
    },
  };
  const bridge = createDesktopClipBridge(options);
  function connect() {
    bridge.setCode(token);
    bridge.connect();
    const socket = connections.at(-1);
    socket.open();
    return socket;
  }
  return { options, bridge, connections, remembered, timers, connect, clips: () => clips };
}
test('bridge never connects automatically, validates the local code, and pairs once over the fixed loopback endpoint', () => {
  const f = fixture();
  f.bridge.configure(config());
  assert.equal(f.connections.length, 0);
  f.bridge.setCode('invalid');
  f.bridge.connect();
  assert.equal(f.connections.length, 0);
  const socket = f.connect();
  f.bridge.connect();
  f.bridge.setCode('another code');
  assert.equal(f.connections.length, 1);
  assert.deepEqual(f.remembered, [token]);
  assert.deepEqual(socket.sent, [{ type: 'pair', token }]);
  assert.equal(f.bridge.getSnapshot().code, token);
  assert.equal(f.bridge.connected, false);
  socket.receive({ type: 'paired' });
  assert.equal(f.bridge.connected, true);
  assert.equal(f.timers.size, 0);
  assert.equal(socket.sent[1].type, 'configure');
  assert(Object.isFrozen(f.bridge.getSnapshot()));
  f.bridge.dispose();
});
test('malformed or unpaired commands cannot enable the global shortcut or trigger clips', () => {
  const f = fixture(),
    socket = f.connect();
  for (const data of [
    'null',
    '[]',
    '{invalid',
    '1',
    JSON.stringify({ type: 'clip', id: 'before-pair' }),
    JSON.stringify({ type: 'registered', active: true, shortcut: 'fake' }),
    ' '.repeat(16385),
  ])
    assert.doesNotThrow(() => socket.onmessage({ data }));
  assert.equal(f.bridge.globalActive, false);
  assert.equal(f.clips(), 0);
  socket.receive({ type: 'paired' });
  for (const value of [
    { type: 'registered', active: 'true' },
    { type: 'registered', active: true },
    { type: 'clip', id: '' },
    { type: 'clip', id: 42 },
    { type: 'clip', id: 'a'.repeat(129) },
  ])
    socket.receive(value);
  assert.equal(f.bridge.globalActive, false);
  assert.equal(f.clips(), 0);
  socket.receive({ type: 'registered', active: true, shortcut: 'Ctrl + Shift + K' });
  assert.equal(f.bridge.globalActive, true);
  socket.receive({ type: 'error', message: 'shortcut unavailable' });
  assert.equal(f.bridge.globalActive, false);
  assert.match(f.bridge.getSnapshot().message, /unavailable/);
  f.bridge.dispose();
});
test('configuration snapshots are copied, duplicates are not sent, and saved counts require pairing', () => {
  const f = fixture(),
    desired = config();
  f.bridge.configure(desired);
  desired.shortcut.code = 'KeyZ';
  f.bridge.saved(2);
  const socket = f.connect();
  f.bridge.saved(2);
  assert.equal(socket.sent.length, 1);
  socket.receive({ type: 'paired' });
  assert.equal(socket.sent[1].shortcut.code, 'KeyK');
  f.bridge.configure(config());
  socket.receive({ type: 'paired' });
  assert.equal(socket.sent.length, 2);
  f.bridge.saved(3);
  f.bridge.saved(-1);
  f.bridge.saved(NaN);
  f.bridge.saved(1.5);
  assert.deepEqual(socket.sent.at(-1), { type: 'saved', count: 3 });
  assert.equal(socket.sent.length, 3);
  f.bridge.dispose();
});
test('duplicate clip events are bounded and retained across reconnects', () => {
  const f = fixture();
  let socket = f.connect();
  socket.receive({ type: 'paired' });
  socket.receive({ type: 'clip', id: 'native-one' });
  socket.receive({ type: 'clip', id: 'native-one' });
  assert.equal(f.clips(), 1);
  f.bridge.disconnect();
  socket = f.connect();
  socket.receive({ type: 'paired' });
  socket.receive({ type: 'clip', id: 'native-one' });
  assert.equal(f.clips(), 1);
  for (let n = 0; n < 33; n++) socket.receive({ type: 'clip', id: String(n) });
  socket.receive({ type: 'clip', id: 'native-one' });
  assert.equal(f.clips(), 35);
  f.bridge.dispose();
});
test('old callbacks and timeouts cannot disconnect a newer socket or send an old token', () => {
  const f = fixture(),
    old = f.connect(),
    callbacks = {
      open: old.onopen,
      message: old.onmessage,
      close: old.onclose,
      error: old.onerror,
      timeout: [...f.timers][0].callback,
    };
  f.bridge.disconnect();
  const current = f.connect();
  current.receive({ type: 'paired' });
  const state = f.bridge.getSnapshot();
  callbacks.open();
  callbacks.message({ data: JSON.stringify({ type: 'clip', id: 'obsolete' }) });
  callbacks.close();
  callbacks.error();
  callbacks.timeout();
  assert.equal(f.bridge.getSnapshot(), state);
  assert.equal(f.clips(), 0);
  assert.equal(current.closed, 0);
  assert.equal(old.sent.length, 1);
  f.bridge.dispose();
});
test('timeout, send failure and socket error restore the local shortcut and release all resources', () => {
  const f = fixture();
  const first = f.connect();
  [...f.timers][0].callback();
  assert.equal(first.closed, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.bridge.getSnapshot().connecting, false);
  const second = f.connect();
  second.receive({ type: 'paired' });
  second.receive({ type: 'registered', active: true, shortcut: 'Ctrl + Shift + K' });
  second.failSend = true;
  f.bridge.configure(config());
  assert.equal(f.bridge.globalActive, false);
  assert.equal(second.closed, 1);
  const third = f.connect();
  third.receive({ type: 'paired' });
  assert.equal(third.sent.at(-1).type, 'configure');
  third.onerror();
  assert.equal(f.bridge.connected, false);
  assert.equal(third.closed, 1);
  assert.equal(f.timers.size, 0);
  f.bridge.dispose();
  const count = f.connections.length;
  f.bridge.connect();
  f.bridge.setCode(token);
  f.bridge.saved(4);
  assert.equal(f.connections.length, count);
  assert.equal(f.bridge.getSnapshot().globalActive, false);
});
