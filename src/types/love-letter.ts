export interface LoveLetterCard {
  id: string;
  rank: number;
  hidden?: false;
}
export interface HiddenLoveLetterCard {
  hidden: true;
}
export type LoveLetterHandCard = LoveLetterCard | HiddenLoveLetterCard;
export interface LoveLetterPlayer {
  id: string;
  name: string;
  bot: boolean;
  score: number;
  hand: LoveLetterHandCard[];
  handCount: number;
  discards: LoveLetterCard[];
  eliminated: boolean;
  protected: boolean;
  forfeited?: boolean;
}
export interface LoveLetterRoundResult {
  reason: 'last-survivor' | 'deck-empty';
  hands: { playerId: string; card: LoveLetterCard }[];
  winners: string[];
  spyWinner: string | null;
}
export interface LoveLetterEvent {
  kind: 'play' | 'chancellor' | 'round-start';
  playerId: string;
  eliminated: string[];
  revision: number;
  round: number;
  card?: LoveLetterCard;
  targetId?: string | null;
  noTarget?: boolean;
  guess?: number;
  missed?: boolean;
  tied?: boolean;
  discarded?: LoveLetterCard;
  roundResult?: LoveLetterRoundResult;
}
export interface LoveLetterSecret {
  revision: number;
  kind: 'peek';
  targetId: string;
  card: LoveLetterCard;
}
export interface LoveLetterState {
  version: number;
  phase: 'action' | 'chancellor' | 'round-over' | 'finished';
  revision: number;
  round: number;
  target: number;
  players: LoveLetterPlayer[];
  turn: number;
  starter: number;
  deckCount: number;
  removed: boolean;
  faceUpRemoved: LoveLetterCard[];
  private: LoveLetterSecret[];
  chancellor: { playerId: string } | null;
  roundResult: LoveLetterRoundResult | null;
  roundWinners: string[];
  spyWinner: string | null;
  winners: string[];
  last: LoveLetterEvent | null;
  log: LoveLetterEvent[];
}
export interface LoveLetterMember {
  id: string;
  name: string;
  bot: boolean;
  online: boolean;
  forfeited: boolean;
  avatar_preset?: string | null;
  avatar_file_id?: string | null;
}
export interface LoveLetterRoom {
  id: string;
  hostId: string;
  maxPlayers: number;
  players: LoveLetterMember[];
  state: LoveLetterState | null;
}
export interface LoveLetterOpenRoom {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
}
export type LoveLetterMove =
  | { kind: 'play'; cardId: string; targetId?: string; guess?: number }
  | { kind: 'chancellor'; keep: string; bottom: string[] };
export interface LoveLetterSnapshot {
  accountId: string | null;
  connected: boolean;
  room: LoveLetterRoom | null;
  rooms: readonly LoveLetterOpenRoom[];
  resumeId: string | null;
  notice: string;
  pending: boolean;
  selected: { cardId: string; revision: number; targetId: string | null } | null;
  chancellor: { revision: number; keep: string; bottom: readonly string[] } | null;
  privateOpen: boolean;
  rulesOpen: boolean;
  effectTarget: string | null;
}
export interface LoveLetterRules {
  cards: { rank: number; name: string; count: number; effect: string }[];
  forced(player: LoveLetterPlayer): boolean;
  eligible(state: LoveLetterState, rank: number): string[];
  legalActions(state: LoveLetterState): LoveLetterMove[];
}
