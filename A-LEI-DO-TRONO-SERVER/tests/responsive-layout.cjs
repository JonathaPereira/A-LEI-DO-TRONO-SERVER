'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
test('desktop hand fits the available height and overlaps crowded cards without enlarging them', async () => {
  const { handGeometry } = await import('../src/lib/games/hand-layout.ts');
  const space = { count: 1, width: 500, height: 140, paddingX: 20, paddingY: 20, gap: 8 };
  assert.equal(handGeometry({...space, count: 0}), null);
  assert.equal(handGeometry({...space, width: 0}), null);
  assert.deepEqual(handGeometry(space), { height: 120, overlap: 0 });
  const crowded = handGeometry({...space, count: 10, width: 240});
  assert.equal(crowded.height, 70); assert(crowded.overlap < 0);
  assert(Math.abs(10 * crowded.height / 1.4 + 9 * (8 + crowded.overlap) - 220) < 0.001);
  assert.equal(handGeometry({...space, height: 50}).height, 30);
  assert.equal(handGeometry({...space, height: 800}).height, 126);
});
test('layout observations coalesce frames and cancel pending work on disposal', async t => {
  const originalResize = global.ResizeObserver, originalMutation = global.MutationObserver;
  const observers = [], frames = new Map(); let next = 0, fits = 0;
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
  }
  global.ResizeObserver = global.MutationObserver = Observer;
  t.after(() => { global.ResizeObserver = originalResize; global.MutationObserver = originalMutation; });
  const { observeLayout } = await import('../src/lib/layout/observe-layout.ts');
  const element = {}, parent = {}, viewport = {
    requestAnimationFrame(callback) { frames.set(++next, callback); return next; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const dispose = observeLayout(viewport, element, () => fits++, parent);
  assert.strictEqual(observers[0].element, parent); assert.strictEqual(observers[1].element, element);
  observers.forEach(observer => observer.callback()); assert.equal(frames.size, 1);
  const [id, fit] = [...frames][0]; frames.delete(id); fit(); assert.equal(fits, 1);
  observers[0].callback(); assert.equal(frames.size, 1);
  dispose(); assert.equal(frames.size, 0); assert(observers.every(observer => observer.disconnected));
  observers.forEach(observer => observer.callback()); assert.equal(frames.size, 0);
});
