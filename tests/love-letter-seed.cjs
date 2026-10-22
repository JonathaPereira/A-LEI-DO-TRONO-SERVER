'use strict';
// Fixture dependency: fix each room's shuffle/seat without mutating production exports.
module.exports = function createRoomRandom() {
  let seed = Number(process.env.MN_TEST_LOVE_LETTER_SEED) || 1;
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
};
