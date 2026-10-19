'use strict';
// Inject deterministic game dependencies into this child process only.
const runtime = require('../server/runtime.cjs');
const createRuntime = runtime.createRuntime;
const decree = process.env.TRONO_TEST_DECREE;
if (
  !['reserva', 'conselho', 'corte', 'rotacao', 'desafio', 'favor', 'espionagem', 'peso'].includes(
    decree,
  )
) {
  throw new Error('Invalid test decree');
}
runtime.createRuntime = (options = {}) =>
  createRuntime({
    ...options,
    scheduleDelay: (ms) => Math.min(ms, 8),
    chooseDecrees: () => [decree],
  });
