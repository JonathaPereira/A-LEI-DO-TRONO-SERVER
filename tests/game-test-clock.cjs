'use strict';
// Inject deterministic game dependencies into this child process only.
const runtime = require('../server/runtime.cjs');
const createRuntime = runtime.createRuntime;
const decree = process.env.TRONO_TEST_DECREE;
if (!['conselho', 'favor', 'espionagem', 'peso'].includes(decree)) {
  throw new Error('Invalid test decree');
}
runtime.createRuntime = () =>
  createRuntime({
    scheduleDelay: (ms) => Math.min(ms, 8),
    chooseDecrees: () => [decree, 'ordem-test-never-selected'],
  });
