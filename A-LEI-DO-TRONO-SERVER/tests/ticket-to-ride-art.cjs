'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const A = require('../src/lib/games/ticket-to-ride-art.ts');
const D = require('../src/lib/games/ticket-to-ride-data.ts');
const route = (id) => D.routes.find((r) => r.id === id);
test('wagon centers follow printed curves and the green/purple parallel lanes on the supplied board', () => {
  const green = A.geometry(route('r6-0')),
    purple = A.geometry(route('r6-1'));
  assert(Math.hypot(green.wagons[2].x - 54.5, green.wagons[2].y - 306.5) < 1);
  assert(Math.hypot(purple.wagons[2].x - 67.5, purple.wagons[2].y - 307.5) < 1);
  const white = A.geometry(route('r15-0'));
  assert(Math.hypot(white.wagons[2].x - 338, white.wagons[2].y - 64) < 1);
  assert(Math.abs(white.wagons[2].angle % 180) < 1);
});
test('the Las Vegas bend follows its diagonal and horizontal printed slots', () => {
  const g = A.geometry(route('r9-0'));
  assert(Math.hypot(g.wagons[0].x - 162, g.wagons[0].y - 480) < 1);
  assert(Math.hypot(g.wagons[1].x - 188, g.wagons[1].y - 458) < 1);
  assert(Math.abs(g.wagons[0].angle - g.wagons[1].angle) > 40);
});
test('every printed slot is distinct, has a valid tangent, and remains within the artwork', () => {
  const placed = [];
  for (const r of D.routes) {
    const g = A.geometry(r);
    assert.equal(g.wagons.length, r.length);
    for (const w of g.wagons) {
      assert(w.x > 40 && w.x < 980 && w.y > 48 && w.y < 635);
      assert(Number.isFinite(w.angle) && w.width >= 27 && w.width <= 39);
      assert(
        !placed.some((p) => Math.hypot(p.x - w.x, p.y - w.y) < 8),
        'duplicate printed slot on ' + r.id,
      );
      placed.push(w);
    }
  }
  assert.equal(placed.length, 309);
});
