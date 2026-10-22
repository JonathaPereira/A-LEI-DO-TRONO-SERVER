'use strict';
// Inject deterministic game dependencies into this child process only.
module.exports = function gameTestOptions() {
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
  const byRoom = new Map();
  return {
    scheduleDelay: (ms) => Math.min(ms, 8),
    chooseDecrees: (_decrees, roomId) => {
      // Bots keep playing after humans leave; their later rounds must not consume another scenario's decree.
      if (!byRoom.has(roomId)) byRoom.set(roomId, decrees[nextDecree++ % decrees.length]);
      return [byRoom.get(roomId)];
    },
  };
};
