import type { ThroneCard, ThroneSuit } from './throne-choices';

export type ThroneInfluenceAction = 'none' | 'sigilo' | 'plus' | 'minus';
/** Own hand and authorized moves; rules remain with the server or local engine. */
export interface ThroneHandContext {
  readonly you: number;
  readonly round: number;
  readonly trick: number;
  readonly phase: string;
  readonly turn: number | null;
  readonly opening: boolean;
  readonly automaticReserve: boolean;
  readonly hand: readonly ThroneCard[];
  readonly reserve: ThroneCard | null;
  readonly influence: number;
  readonly legal: readonly string[];
  readonly hiddenLegal: readonly string[];
  readonly canUseInfluence: boolean;
  readonly canUseManeuver: boolean;
  readonly influenceBlocked: boolean;
  readonly decreeName: string;
}
export interface ThroneHandSnapshot {
  readonly mode: 'local' | 'online' | null;
  readonly demo: boolean;
  readonly active: boolean;
  readonly context: ThroneHandContext | null;
  readonly action: ThroneInfluenceAction;
  readonly declaredSuit: ThroneSuit | null;
  readonly dialog: 'influence' | 'suit' | null;
  readonly pending: boolean;
  readonly visible: boolean;
  readonly sorted: boolean;
  readonly notice: string;
}
export interface ThroneHandOrigin {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
export interface ThroneLocalMove {
  readonly cardId: string;
  readonly influenceAction: ThroneInfluenceAction;
  readonly declaredSuit: ThroneSuit | null;
  readonly origin: ThroneHandOrigin | null;
}
