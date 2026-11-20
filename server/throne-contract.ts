import type {
  ThroneCard,
  ThroneChoiceRules,
  ThroneLaw,
  ThroneSuit,
} from '../src/types/throne-choices';
import type { ThroneInfluenceAction } from '../src/types/throne-hand';
import type { RuleExchange } from '../src/lib/games/throne-rules';

/** Authoritative mutable cards. Only privateState(viewer) may project them onto the wire. */
export type ThroneServerCard = { -readonly [K in keyof ThroneCard]: ThroneCard[K] };
export interface ThroneConnection {
  clientId: string;
  roomId?: string | null;
  gameRoomId?: string | null;
  independentGames?: boolean;
}
export interface ThroneMember {
  id: string;
  seat: number;
  name: string;
  ready: boolean;
  ws: ThroneConnection;
}
export interface ThroneRoom {
  id: string;
  kind: 'game' | 'chat';
  players: Map<string, ThroneMember>;
  game: ThroneGame | null;
}
export interface ThroneMatchPlayer {
  id: number;
  seat: number;
  clientId: string | null;
  name: string;
  bot: boolean;
  hand: ThroneServerCard[];
  reserve: ThroneServerCard | null;
  intelligence?: { target: number; name: string; card: ThroneServerCard } | null;
  totalCrowns: number;
  totalShadows: number;
  roundCrowns: number;
  roundShadows: number;
  influence: number;
  hadCrown: boolean;
  crownStreak: number;
}
export interface ThroneServerPlay {
  playerId: number;
  card: ThroneServerCard;
  hidden: boolean;
  influenceAction: ThroneInfluenceAction;
  modifier: number;
  order: number;
}
export interface ThroneMultiChoice {
  kind: 'reserva' | 'corte' | 'conselho' | 'rotation';
  waiting: Set<number>;
  choices: Map<number, string>;
  seat?: undefined;
}
export interface ThronePrivateAck {
  kind: 'usurp-ack' | 'intelligence-ack';
  waiting: Set<number>;
  seat?: undefined;
}
type SeatChoice = { seat: number; waiting?: undefined };
export type ThronePending =
  | ThroneMultiChoice
  | ThronePrivateAck
  | (SeatChoice & { kind: 'decree'; options: Array<ThroneChoiceRules['decrees'][number]['id']> })
  | (SeatChoice & { kind: 'trump'; options: ThroneSuit[] })
  | (SeatChoice & { kind: 'law'; options: ThroneLaw[] })
  | (SeatChoice & { kind: 'usurp-target'; options: number[] })
  | (SeatChoice & { kind: 'usurp-give'; shadow: number; target: number; eligibleIds: string[] })
  | (SeatChoice & {
      kind: 'usurp-pick';
      shadow: number;
      target: number;
    } & RuleExchange<ThroneServerCard>)
  | (SeatChoice & { kind: 'challenge'; cardIds: string[] });

export interface ThroneGame {
  token: string;
  players: ThroneMatchPlayer[];
  round: number;
  trick: number;
  undealt: ThroneServerCard[];
  decree: ThroneChoiceRules['decrees'][number] | null;
  lawUsage: Record<ThroneLaw, number>;
  currentLaw: ThroneLaw;
  trump: ThroneSuit | null;
  declaredLeadSuit: ThroneSuit | null;
  leader: number;
  lastCrown: number | null;
  lastShadow: number | null;
  previousWinningSuit: ThroneSuit | null;
  plays: ThroneServerPlay[];
  turn: number | null;
  phase:
    | 'starting'
    | 'round-start'
    | 'choose-decree'
    | 'choose-reserva'
    | 'choose-corte'
    | 'choose-conselho'
    | 'choose-rotation'
    | 'private-intelligence'
    | 'trick-start'
    | 'choose-trump'
    | 'usurp-target'
    | 'usurp-give'
    | 'usurp-pick'
    | 'usurp-reveal'
    | 'await-play'
    | 'resolve'
    | 'trick-result'
    | 'challenge'
    | 'rotation'
    | 'choose-law'
    | 'round-end'
    | 'game-over';
  pending: ThronePending | null;
  promptSeq: number;
  turnDeadline: number | null;
  turnSerial: number;
  turnTimer: NodeJS.Timeout | null;
  logHistory: { ts: number; round: number; trick: number; message: string }[];
}
