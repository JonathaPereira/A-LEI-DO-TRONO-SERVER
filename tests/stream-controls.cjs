'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bindStreamControls } = require('../src/lib/voice/stream-controls.ts');

class Target {
  listeners = new Set();
  addEventListener(type, listener, options = {}) {
    if (options.signal?.aborted) return;
    const capture = options === true || options.capture === true;
    if (
      [...this.listeners].some(
        (item) => item.type === type && item.listener === listener && item.capture === capture,
      )
    )
      return;
    const item = { type, listener, capture };
    this.listeners.add(item);
    options.signal?.addEventListener('abort', () => this.listeners.delete(item), { once: true });
  }
  removeEventListener(type, listener, options = {}) {
    const capture = options === true || options.capture === true;
    for (const item of this.listeners)
      if (item.type === type && item.listener === listener && item.capture === capture)
        this.listeners.delete(item);
  }
  emit(type, event = {}) {
    for (const item of [...this.listeners].sort((a, b) => Number(b.capture) - Number(a.capture)))
      if (item.type === type) item.listener({ type, ...event });
  }
  count(type) {
    return [...this.listeners].filter((item) => item.type === type).length;
  }
}
class Tile extends Target {
  isConnected = true;
  attributes = new Map();
  children = new Set();
  classes = new Set();
  classList = {
    add: (name) => this.classes.add(name),
    remove: (name) => this.classes.delete(name),
    contains: (name) => this.classes.has(name),
  };
  constructor(doc) {
    super();
    this.ownerDocument = doc;
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  set tabIndex(value) {
    this.setAttribute('tabindex', value);
  }
  contains(node) {
    return node === this || this.children.has(node);
  }
  get idle() {
    return this.classes.has('screen-controls-idle');
  }
}
function fixture() {
  const doc = new Target(),
    tasks = new Map();
  let now = 0,
    id = 0;
  const delay = (fn, ms) => {
    const key = ++id;
    tasks.set(key, { at: now + ms, fn });
    return () => tasks.delete(key);
  };
  return {
    doc,
    tasks,
    tile() {
      const tile = new Tile(doc);
      return { tile, bind: () => bindStreamControls(tile, { delay }) };
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...tasks].sort(([, a], [, b]) => a.at - b.at)[0];
        if (!next || next[1].at > end) break;
        tasks.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
}
test('each live player keeps its own three-second clock; unrelated activity and React updates do not wake it', () => {
  const f = fixture(),
    a = f.tile(),
    b = f.tile(),
    ca = a.bind(),
    cb = b.bind();
  ca.update(true);
  cb.update(true);
  f.advance(1000);
  a.tile.emit('pointerenter');
  f.advance(2000);
  assert(b.tile.idle);
  assert(!a.tile.idle);
  f.doc.emit('pointerdown');
  f.doc.emit('keydown');
  ca.update(true);
  cb.update(true);
  f.advance(1000);
  assert(a.tile.idle);
  assert(b.tile.idle);
  b.tile.emit('pointermove');
  assert(!b.tile.idle);
  assert(a.tile.idle);
  f.advance(3000);
  assert(b.tile.idle);
  ca.dispose();
  cb.dispose();
  assert.equal(f.tasks.size, 0);
});
test('inactive, paused, collapsed or unwatched players keep controls visible with no idle timer', () => {
  const f = fixture(),
    a = f.tile(),
    controls = a.bind();
  controls.update(false);
  f.advance(10000);
  assert(!a.tile.idle);
  assert.equal(f.tasks.size, 0);
  controls.update(true);
  f.advance(3000);
  assert(a.tile.idle);
  controls.update(false);
  assert(!a.tile.idle);
  assert.equal(f.tasks.size, 0);
  a.tile.emit('pointerenter');
  f.advance(10000);
  assert(!a.tile.idle);
  controls.update(true);
  f.advance(2999);
  assert(!a.tile.idle);
  f.advance(1);
  assert(a.tile.idle);
  controls.dispose();
});
test('keyboard focus holds controls open across child focus; pointer focus still expires', () => {
  const f = fixture(),
    a = f.tile(),
    controls = a.bind(),
    child = {};
  a.tile.children.add(child);
  controls.update(true);
  f.doc.emit('keydown');
  a.tile.emit('focusin');
  f.advance(10000);
  assert(!a.tile.idle);
  assert.equal(f.tasks.size, 0);
  a.tile.emit('focusout', { relatedTarget: child });
  f.advance(10000);
  assert(!a.tile.idle);
  a.tile.emit('focusout', { relatedTarget: null });
  f.advance(3000);
  assert(a.tile.idle);
  f.doc.emit('pointerdown');
  a.tile.emit('focusin');
  f.advance(3000);
  assert(a.tile.idle);
  a.tile.emit('keydown');
  f.advance(10000);
  assert(!a.tile.idle);
  a.tile.emit('pointermove');
  f.advance(3000);
  assert(a.tile.idle);
  controls.dispose();
});
test('all pressed pointers hold controls open until release or cancellation outside the player', () => {
  const f = fixture(),
    a = f.tile(),
    controls = a.bind();
  controls.update(true);
  a.tile.emit('pointerdown', { pointerId: 7 });
  a.tile.emit('pointerdown', { pointerId: 8 });
  f.advance(10000);
  assert(!a.tile.idle);
  assert.equal(f.tasks.size, 0);
  f.doc.emit('pointerup', { pointerId: 9 });
  f.doc.emit('pointercancel', { pointerId: 7 });
  f.advance(10000);
  assert(!a.tile.idle);
  assert.equal(f.tasks.size, 0);
  f.doc.emit('pointerup', { pointerId: 8 });
  f.advance(3000);
  assert(a.tile.idle);
  assert(
    [...f.doc.listeners]
      .filter((item) => item.type === 'pointerup' || item.type === 'pointercancel')
      .every((item) => item.capture),
  );
  controls.dispose();
});
test('binding is unique; disposal restores tabindex and releases shared document listeners only after the last player', () => {
  const f = fixture(),
    a = f.tile(),
    b = f.tile();
  a.tile.setAttribute('tabindex', '-1');
  const ca = a.bind(),
    cb = b.bind();
  assert.equal(a.bind(), ca);
  assert.equal(a.tile.getAttribute('tabindex'), '0');
  assert.equal(f.doc.count('pointerdown'), 1);
  assert.equal(f.doc.count('keydown'), 1);
  ca.update(true);
  cb.update(true);
  ca.dispose();
  ca.dispose();
  assert.equal(a.tile.getAttribute('tabindex'), '-1');
  assert.equal(a.tile.listeners.size, 0);
  assert.equal(f.doc.count('pointerdown'), 1);
  assert.equal(f.tasks.size, 1);
  ca.update(true);
  a.tile.emit('pointermove');
  assert.equal(f.tasks.size, 1);
  cb.dispose();
  assert.equal(b.tile.getAttribute('tabindex'), null);
  assert.equal(f.doc.listeners.size, 0);
  assert.equal(f.tasks.size, 0);
  const rebound = a.bind();
  ca.dispose();
  rebound.update(true);
  f.advance(3000);
  assert(a.tile.idle);
  rebound.dispose();
  assert.equal(f.doc.listeners.size, 0);
});
test('detached players cancel listeners without affecting other players or a fresh document', () => {
  const f = fixture(),
    g = fixture(),
    a = f.tile(),
    b = f.tile(),
    c = g.tile(),
    ca = a.bind(),
    cb = b.bind(),
    cc = c.bind();
  ca.update(true);
  cb.update(true);
  cc.update(true);
  f.doc.emit('keydown');
  b.tile.emit('focusin');
  c.tile.emit('focusin');
  a.tile.isConnected = false;
  f.advance(3000);
  g.advance(3000);
  assert.equal(a.tile.listeners.size, 0);
  assert(!a.tile.idle);
  assert(!b.tile.idle);
  assert(c.tile.idle);
  cb.dispose();
  cc.dispose();
  assert.equal(f.doc.listeners.size, 0);
  assert.equal(g.doc.listeners.size, 0);
});
