import type { ThroneCard, ThroneDecree, ThroneLaw, ThroneSuit } from './throne-choices';
import type { ThroneInfluenceAction } from './throne-hand';

export interface ThronePublicPlayer {
  readonly id: number;
  readonly name: string;
  readonly ai: boolean;
  readonly handCount: number;
  readonly reservePresent: boolean;
  readonly publicCards: readonly ThroneCard[];
  readonly totalCrowns: number;
  readonly totalShadows: number;
  readonly roundCrowns: number;
  readonly roundShadows: number;
  readonly influence: number;
  readonly prestige: number;
  readonly pairs: number;
}
export interface ThroneVisiblePlay {
  readonly playerId: number;
  readonly order: number;
  readonly hidden: boolean;
  readonly card: ThroneCard | null;
  readonly modifier: number;
  readonly influenceAction: ThroneInfluenceAction;
}
/** Public table plus visible plays (the viewer may peek at their own hidden play). */
export interface ThroneMatchState {
  readonly online: true;
  readonly localPlayerId: number;
  readonly round: number;
  readonly trick: number;
  readonly phase: string;
  readonly currentLaw: ThroneLaw;
  readonly lawUsage: Readonly<Record<ThroneLaw, number>>;
  readonly trump: ThroneSuit | null;
  readonly declaredLeadSuit: ThroneSuit | null;
  readonly decree: ThroneDecree | null;
  readonly lastCrown: number | null;
  readonly lastShadow: number | null;
  readonly previousWinningSuit: ThroneSuit | null;
  readonly leader: number | null;
  readonly turn: number | null;
  readonly turnDeadline: number | null;
  readonly players: readonly ThronePublicPlayer[];
  readonly plays: readonly ThroneVisiblePlay[];
}
export interface ThroneLocalStatus {
  readonly round: number;
  readonly trick: number;
  readonly phase: string;
  readonly turnName: string | null;
  readonly yourTurn: boolean;
  readonly deadline: number | null;
}
export interface ThroneMatchStatus {
  readonly round: number;
  readonly trick: number;
  readonly turn: string;
  readonly yourTurn: boolean;
  readonly clock: string;
  readonly clockClass: '' | 'idle' | 'warning' | 'danger';
}
export interface ThroneMatchSnapshot {
  readonly mode: 'online' | 'local' | null;
  readonly match: ThroneMatchState | null;
  readonly status: ThroneMatchStatus;
  readonly visible: boolean;
}
