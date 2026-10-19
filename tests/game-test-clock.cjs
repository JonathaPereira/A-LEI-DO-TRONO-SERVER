'use strict';
// Inject deterministic game dependencies into this child process only.
const runtime = require('../server/runtime.cjs');
const createRuntime = runtime.createRuntime;
const decrees = String(process.env.TRONO_TEST_DECREE || '').split(',');
if (
  !decrees.length ||
  decrees.some(
    (decree) =>
      ![
        'reserva',
        'conselho',
        'corte',
        'rotacao',
        'desafio',
        'favor',
        'espionagem',
        'peso',
      ].includes(decree),
  )
)
  throw new Error('Invalid test decree');
let nextDecree = 0;
runtime.createRuntime = (options = {}) =>
  createRuntime({
    ...options,
    scheduleDelay: (ms) => Math.min(ms, 8),
    chooseDecrees: () => [decrees[nextDecree++ % decrees.length]],
  });
