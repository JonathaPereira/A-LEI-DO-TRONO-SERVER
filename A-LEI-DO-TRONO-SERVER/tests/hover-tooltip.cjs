'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('tooltip positioning stays inside narrow and wide viewports, including pointer positions at every edge', async () => {
  const { tooltipPosition } = await import('../src/lib/layout/hover-tooltip.ts');
  for (const [width, height] of [
    [320, 480],
    [480, 800],
    [1440, 960],
  ]) {
    for (const x of [0, 10, width / 2, width])
      for (const y of [0, height / 2, height]) {
        const size = { width: Math.min(280, width - 28), height: 130 };
        const p = tooltipPosition({ x, y }, size, { width, height });
        assert(p.x >= 14 && p.y >= 14);
        assert(p.x + size.width <= width - 14 && p.y + size.height <= height - 14);
      }
  }
});
