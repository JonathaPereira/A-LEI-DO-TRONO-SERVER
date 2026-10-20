'use strict';
// Child-process fixture only. Fix each room's shuffle/seat so a native UI smoke
// test cannot be eliminated by a bot before it gets to exercise the controls.
// Production never loads this file or reads this test environment variable.
const service = require('../server/love-letter-service');
const create = service.createLoveLetterService;
service.createLoveLetterService = options => {
  return create({
    ...options,
    createRandom() {
      let seed = Number(process.env.MN_TEST_LOVE_LETTER_SEED) || 1;
      return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    },
  });
};
