'use strict';
// Child-process fixture only. Fix the opening shuffle/seat so a native UI smoke
// test cannot be eliminated by a bot before it gets to exercise the controls.
// Production never loads this file or reads this test environment variable.
const Rules=require('../frontend/love-letter-rules'),create=Rules.create;
Rules.create=players=>{let seed=Number(process.env.MN_TEST_LOVE_LETTER_SEED)||1;const rng=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);return create(players,rng);};
