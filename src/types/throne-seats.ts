import type { ThronePublicPlayer } from './throne-match';

/** Presentation only: never contains hands, reserves or intelligence. */
export interface ThroneSeatsSnapshot {
  readonly players: readonly ThronePublicPlayer[];
  readonly turn: number | null;
  readonly localSeat: number | null;
}

export interface ThroneLocalSeats {
  readonly players: unknown;
  readonly turn: number | null;
  readonly localSeat: number | null;
}
