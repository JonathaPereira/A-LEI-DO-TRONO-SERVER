import type { ThroneMatchState, ThroneVisiblePlay } from './throne-match';

export type ThroneCourtState = Pick<
  ThroneMatchState,
  | 'round'
  | 'trick'
  | 'phase'
  | 'currentLaw'
  | 'lawUsage'
  | 'trump'
  | 'declaredLeadSuit'
  | 'decree'
  | 'previousWinningSuit'
>;
export interface ThroneWinners {
  readonly crown: number;
  readonly shadow: number;
}
/** Visible table only. Hidden opponent identities never enter this view. */
export interface ThroneTableState extends ThroneCourtState {
  readonly names: readonly string[];
  readonly localSeat: number | null;
  readonly plays: readonly ThroneVisiblePlay[];
  readonly flipping: readonly number[];
  readonly winners: ThroneWinners | null;
}
