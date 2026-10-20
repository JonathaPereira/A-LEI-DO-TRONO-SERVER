import type { ThroneCard, ThroneChoiceRules, ThroneLaw, ThroneSuit } from './throne-choices';
import type { ThroneInfluenceAction } from './throne-hand';
import type { ThroneLocalRun } from '../lib/games/throne-local-lifecycle';

/** Private mutable engine data. Never publish this object as an online/view snapshot. */
export type ThroneLocalCard = { -readonly [K in keyof ThroneCard]: ThroneCard[K] };
export interface ThroneLocalPlayer {
  id: number;
  name: string;
  ai: boolean;
  hand: ThroneLocalCard[];
  reserve: ThroneLocalCard | null;
  intelligence: { target: number; name: string; card: ThroneLocalCard } | null;
  totalCrowns: number;
  totalShadows: number;
  totalPairs: number;
  prestige: number;
  roundCrowns: number;
  roundShadows: number;
  influence: number;
  hadCrown: boolean;
  crownStreak: number;
}
export interface ThroneLocalPlay {
  playerId: number;
  card: ThroneLocalCard;
  hidden: boolean;
  influenceAction: ThroneInfluenceAction;
  modifier: number;
  order: number;
}
export interface ThroneLocalRoom {
  readonly id: string;
  readonly name: string;
}
export interface ThroneLocalState {
  localSession: ThroneLocalRun;
  players: ThroneLocalPlayer[];
  round: number;
  trick: number;
  undealt: ThroneLocalCard[];
  decree: ThroneChoiceRules['decrees'][number] | null;
  lawUsage: Record<ThroneLaw, number>;
  currentLaw: ThroneLaw;
  trump: ThroneSuit | null;
  firstRoundStarter: number;
  leader: number;
  lastCrown: number | null;
  lastShadow: number | null;
  previousWinningSuit: ThroneSuit | null;
  plays: ThroneLocalPlay[];
  turn: number | null;
  turnDeadline: number | null;
  phase:
    'setup' | 'round-start' | 'trick-start' | 'await-play' | 'resolve' | 'round-end' | 'game-over';
  allAI: boolean;
  handSession: object;
  choiceSession: object;
  gameOver: boolean;
  declaredLeadSuit: ThroneSuit | null;
  room: ThroneLocalRoom | null;
  localPlayerId: number | null;
}
