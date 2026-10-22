import type { ThroneMatchSnapshot } from '../../types/throne-match';
import type { ThroneLocalSeats, ThroneSeatsSnapshot } from '../../types/throne-seats';
import { freezeGame } from './freeze.ts';
import { readThronePublicPlayers } from './throne-match-protocol.ts';

interface Options {
  source(): ThroneMatchSnapshot;
  subscribeSource(fn: () => void): () => void;
  warn?(error: unknown): void;
}
const initial: ThroneSeatsSnapshot = freezeGame({ players: [], turn: null, localSeat: null });

/** Uses the existing public online match; accepts a bounded public projection offline. */
export function createThroneSeats(options: Options) {
  let state = initial,
    release: (() => void) | null = null,
    disposed = false;
  const listeners = new Set<() => void>();
  function publish(next: ThroneSeatsSnapshot) {
    if (disposed || JSON.stringify(state) === JSON.stringify(next)) return;
    state = freezeGame(next);
    listeners.forEach((fn) => fn());
  }
  function sync() {
    const s = options.source();
    if (s.mode === 'local') return;
    const m = s.match;
    if (
      m &&
      state.players === m.players &&
      state.turn === m.turn &&
      state.localSeat === m.localPlayerId
    )
      return;
    publish(m ? { players: m.players, turn: m.turn, localSeat: m.localPlayerId } : initial);
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    setLocal(value: ThroneLocalSeats) {
      if (disposed || options.source().mode !== 'local') return;
      try {
        for (const seat of [value.turn, value.localSeat])
          if (seat !== null && (!Number.isInteger(seat) || seat < 0 || seat > 3))
            throw new Error('Assento local inválido.');
        publish({
          players: readThronePublicPlayers(value.players),
          turn: value.turn,
          localSeat: value.localSeat,
        });
      } catch (error) {
        publish(initial);
        options.warn?.(error);
      }
    },
    start() {
      if (release || disposed) return;
      release = options.subscribeSource(sync);
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release?.();
      release = null;
      listeners.clear();
      state = initial;
    },
  };
}
export type ThroneSeats = ReturnType<typeof createThroneSeats>;
